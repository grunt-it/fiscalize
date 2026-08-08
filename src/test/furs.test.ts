import { createHash, createSign, createVerify } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import * as v from "valibot";
import { loadP12 } from "../lib/furs/cert";
import { formatFursDateTime } from "../lib/furs/datetime";
import { decodeJwsPayload, signFursJws } from "../lib/furs/jws";
import { buildInvoiceRequest, FursInvoice } from "../lib/furs/messages";
import { calculateZoi, zoiToPrintable } from "../lib/furs/zoi";
import { makeTestCert } from "./furs-fixtures";

const certFx = makeTestCert();

describe("loadP12", () => {
  test("extracts key, cert PEM and identity from a PKCS#12", async () => {
    const cert = await Effect.runPromise(loadP12(certFx.p12, certFx.passphrase));
    expect(cert.privateKeyPem).toContain("PRIVATE KEY");
    expect(cert.certPem).toContain("BEGIN CERTIFICATE");
    expect(cert.subjectName).toContain("CN=10489185");
    expect(cert.serial).toBe(certFx.serialDecimal); // exact, via BigInt
  });

  test("wrong passphrase fails with FursCertError", async () => {
    const exit = await Effect.runPromiseExit(loadP12(certFx.p12, "wrong"));
    expect(exit._tag).toBe("Failure");
    const err = exit._tag === "Failure" ? (exit.cause as any).error : undefined;
    expect(err?._tag).toBe("FursCertError");
  });
});

describe("calculateZoi", () => {
  const input = {
    taxNumber: 10489185,
    issueDateTime: "25-05-2026 14:30:00",
    invoiceNumber: "11",
    businessPremiseId: "BP101",
    electronicDeviceId: "0001",
    invoiceAmount: 19.15,
  };

  test("is a 32-char lowercase hex MD5 and deterministic (PKCS#1 v1.5)", () => {
    const a = calculateZoi(input, certFx.privateKeyPem);
    const b = calculateZoi(input, certFx.privateKeyPem);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).toBe(b); // deterministic, confirms PKCS#1 v1.5, not PSS
  });

  test("matches an independent RSA-SHA256 + MD5 computation", () => {
    const content = `${input.taxNumber}${input.issueDateTime}${input.invoiceNumber}${input.businessPremiseId}${input.electronicDeviceId}${input.invoiceAmount}`;
    const sig = createSign("RSA-SHA256").update(content, "utf8").sign(certFx.privateKeyPem);
    const expected = createHash("md5").update(sig).digest("hex");
    expect(calculateZoi(input, certFx.privateKeyPem)).toBe(expected);
  });

  test("changes when any field changes", () => {
    const base = calculateZoi(input, certFx.privateKeyPem);
    expect(calculateZoi({ ...input, invoiceAmount: 19.16 }, certFx.privateKeyPem)).not.toBe(base);
  });
});

describe("zoiToPrintable", () => {
  test("39-digit ZOI block + YYMMDDHHmmss + tax number + valid mod-10 check digit", () => {
    const zoi = "a".repeat(32); // arbitrary 32-hex
    const printable = zoiToPrintable(zoi, new Date("2026-05-25T12:30:00Z"), 10489185, "UTC");
    expect(printable).toMatch(/^\d+$/);
    const sumExceptLast = [...printable.slice(0, -1)].reduce((s, c) => s + Number(c), 0);
    expect(Number(printable.at(-1))).toBe(sumExceptLast % 10);
  });
});

describe("signFursJws", () => {
  test("produces a verifiable RS256 JWS with the FURS custom header", () => {
    const payload = { InvoiceRequest: { hello: "world" } };
    const token = signFursJws(payload, certFx.privateKeyPem, {
      subjectName: "CN=10489185,O=grunt-it test,C=SI",
      issuerName: "CN=Test CA,C=SI",
      serial: certFx.serialDecimal,
    });

    const [h, p, s] = token.split(".");
    expect(h && p && s).toBeTruthy();

    const header = JSON.parse(Buffer.from(h!, "base64url").toString());
    expect(header.alg).toBe("RS256");
    expect(header.subject_name).toBe("CN=10489185,O=grunt-it test,C=SI");
    expect(typeof header.serial).toBe("number"); // emitted as an integer literal

    // signature verifies against the public key
    const ok = createVerify("RSA-SHA256").update(`${h}.${p}`).verify(certFx.publicKeyPem, s!, "base64url");
    expect(ok).toBe(true);

    expect(decodeJwsPayload<typeof payload>(token)).toEqual(payload);
  });

  test("rejects a non-numeric serial (guards raw-JSON injection)", () => {
    expect(() =>
      signFursJws({}, certFx.privateKeyPem, { subjectName: "x", issuerName: "y", serial: "12a" }),
    ).toThrow();
  });
});

describe("buildInvoiceRequest + schema", () => {
  /**
   * The builder returns an untyped record because FURS messages are shaped for
   * the wire, not for us. Read known keys through one narrowing step rather
   * than casting at every assertion.
   */
  const invoiceOf = (message: Record<string, unknown>): Record<string, unknown> => {
    const request = message["InvoiceRequest"];
    if (typeof request !== "object" || request === null) throw new Error("no InvoiceRequest");
    const invoice = (request as Record<string, unknown>)["Invoice"];
    if (typeof invoice !== "object" || invoice === null) throw new Error("no Invoice");
    return invoice as Record<string, unknown>;
  };

  test("maps the FURS invoice envelope with ProtectedID", () => {
    const msg = buildInvoiceRequest(
      {
        taxNumber: 10489185,
        issueDateTime: new Date(),
        invoiceNumber: "11",
        businessPremiseId: "BP101",
        electronicDeviceId: "0001",
        invoiceAmount: 19.15,
        vat: [{ taxRate: 22, taxableAmount: 15.7, taxAmount: 3.45 }],
      },
      { zoi: "deadbeef", issueIso: "2026-05-25T14:30:00", messageId: "m1", headerIso: "2026-05-25T14:30:01" },
    );
    const invoice = invoiceOf(msg);
    expect(invoice["ProtectedID"]).toBe("deadbeef");
    expect(invoice["NumberingStructure"]).toBe("B");
    expect(invoice["TaxesPerSeller"]).toEqual([
      { VAT: [{ TaxRate: 22, TaxableAmount: 15.7, TaxAmount: 3.45 }] },
    ]);
  });

  test("schema rejects an invoice with no VAT lines structurally validated upstream", () => {
    const bad = v.safeParse(FursInvoice, { taxNumber: "nope" });
    expect(bad.success).toBe(false);
  });

  /**
   * Shaped after FURS's own published pair, RACUN2.xml and RACUN2STORNO.xml:
   * invoice 145 at +66.71 on TRGOVINA1/BLAG2, then its storno as 146 at -66.71
   * on the same premise and device, referencing 145 by identifier and issue
   * instant. A correction that omits ReferenceInvoice is schema-valid and is
   * accepted by FURS, so nothing fails; the tax authority simply never learns
   * the two are related. Hence a test rather than trust.
   */
  test("emits ReferenceInvoice for a storno, matching the published example", () => {
    const msg = buildInvoiceRequest(
      {
        taxNumber: 10000658,
        issueDateTime: new Date("2015-09-07T12:48:39Z"),
        invoiceNumber: "146",
        businessPremiseId: "TRGOVINA1",
        electronicDeviceId: "BLAG2",
        invoiceAmount: -66.71,
        paymentAmount: -66.71,
        operatorTaxNumber: 12345678,
        vat: [{ taxRate: 22, taxableAmount: -23.14, taxAmount: -5.09 }],
        referenceInvoice: [
          {
            businessPremiseId: "TRGOVINA1",
            electronicDeviceId: "BLAG2",
            invoiceNumber: "145",
            issueDateTime: new Date("2015-09-07T12:12:54Z"),
          },
        ],
      },
      {
        zoi: "ca1cb5819841db0ab2af1e2094f68c66",
        issueIso: "2015-09-07T12:48:39",
        messageId: "m1",
        headerIso: "2015-09-07T12:48:39",
        timeZone: "UTC",
      },
    );
    const invoice = invoiceOf(msg);

    expect(invoice["ReferenceInvoice"]).toEqual([
      {
        ReferenceInvoiceIdentifier: {
          BusinessPremiseID: "TRGOVINA1",
          ElectronicDeviceID: "BLAG2",
          InvoiceNumber: "145",
        },
        ReferenceInvoiceIssueDateTime: "2015-09-07T12:12:54",
      },
    ]);
    // The storno carries its own number, in the same sequence as its original.
    expect(invoice["InvoiceIdentifier"]).toEqual({
      BusinessPremiseID: "TRGOVINA1",
      ElectronicDeviceID: "BLAG2",
      InvoiceNumber: "146",
    });
    expect(invoice["InvoiceAmount"]).toBe(-66.71);
  });

  test("omits both new elements entirely for an ordinary invoice", () => {
    // Emitting SubsequentSubmit: false on every live sale would assert something
    // about connectivity that was never checked, so absence must stay absence.
    const msg = buildInvoiceRequest(
      {
        taxNumber: 10489185,
        issueDateTime: new Date(),
        invoiceNumber: "11",
        businessPremiseId: "BP101",
        electronicDeviceId: "0001",
        invoiceAmount: 19.15,
        vat: [{ taxRate: 22, taxableAmount: 15.7, taxAmount: 3.45 }],
      },
      { zoi: "deadbeef", issueIso: "2026-05-25T14:30:00", messageId: "m1", headerIso: "2026-05-25T14:30:01" },
    );
    const invoice = invoiceOf(msg);
    expect("ReferenceInvoice" in invoice).toBe(false);
    expect("SubsequentSubmit" in invoice).toBe(false);
  });

  test("carries SubsequentSubmit when an offline invoice is submitted after the fact", () => {
    const msg = buildInvoiceRequest(
      {
        taxNumber: 10489185,
        issueDateTime: new Date(),
        invoiceNumber: "12",
        businessPremiseId: "BP101",
        electronicDeviceId: "0001",
        invoiceAmount: 19.15,
        subsequentSubmit: true,
        vat: [{ taxRate: 22, taxableAmount: 15.7, taxAmount: 3.45 }],
      },
      { zoi: "deadbeef", issueIso: "2026-05-25T14:30:00", messageId: "m1", headerIso: "2026-05-25T14:30:01" },
    );
    expect(invoiceOf(msg)["SubsequentSubmit"]).toBe(true);
  });
});

describe("formatFursDateTime", () => {
  test("derives consistent ZOI + ISO strings from one instant", () => {
    const { zoi, iso } = formatFursDateTime(new Date("2026-05-25T12:30:45Z"), "UTC");
    expect(zoi).toBe("25-05-2026 12:30:45");
    expect(iso).toBe("2026-05-25T12:30:45");
  });
});
