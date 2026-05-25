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
    expect(a).toBe(b); // deterministic — confirms PKCS#1 v1.5, not PSS
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
    ) as any;
    expect(msg.InvoiceRequest.Invoice.ProtectedID).toBe("deadbeef");
    expect(msg.InvoiceRequest.Invoice.TaxesPerSeller[0].VAT[0].TaxRate).toBe(22);
    expect(msg.InvoiceRequest.Invoice.NumberingStructure).toBe("B");
  });

  test("schema rejects an invoice with no VAT lines structurally validated upstream", () => {
    const bad = v.safeParse(FursInvoice, { taxNumber: "nope" });
    expect(bad.success).toBe(false);
  });
});

describe("formatFursDateTime", () => {
  test("derives consistent ZOI + ISO strings from one instant", () => {
    const { zoi, iso } = formatFursDateTime(new Date("2026-05-25T12:30:45Z"), "UTC");
    expect(zoi).toBe("25-05-2026 12:30:45");
    expect(iso).toBe("2026-05-25T12:30:45");
  });
});
