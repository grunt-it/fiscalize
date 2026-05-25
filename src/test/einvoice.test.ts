import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { generateEInvoice } from "../lib/einvoice/generate";
import { toEInvoiceInternal } from "../lib/einvoice/to-internal";
import { validateEn16931 } from "../lib/einvoice/validate";
import { UnsupportedFormatError } from "../lib/foundation/errors";
import { sampleInvoice } from "./fixtures";

describe("toEInvoiceInternal", () => {
  test("produces a ubl:Invoice tree with EN16931 customization", () => {
    const internal = toEInvoiceInternal(sampleInvoice());
    const ubl = internal["ubl:Invoice"];
    expect(ubl["cbc:CustomizationID"]).toBe("urn:cen.eu:en16931:2017");
    expect(ubl["cbc:ID"]).toBe("2026-000123");
    expect(ubl["cac:InvoiceLine"]).toHaveLength(2);
  });

  test("emits a mandatory EndpointID, defaulting scheme to SI VAT (9949)", () => {
    const ubl = toEInvoiceInternal(sampleInvoice())["ubl:Invoice"] as Record<string, any>;
    const seller = ubl["cac:AccountingSupplierParty"]["cac:Party"];
    expect(seller["cbc:EndpointID"]).toBe("SI12345678");
    expect(seller["cbc:EndpointID@schemeID"]).toBe("9949");
  });

  test("supplier PartyTaxScheme is an array, customer is an object (schema asymmetry)", () => {
    const ubl = toEInvoiceInternal(sampleInvoice())["ubl:Invoice"] as Record<string, any>;
    expect(Array.isArray(ubl["cac:AccountingSupplierParty"]["cac:Party"]["cac:PartyTaxScheme"])).toBe(true);
    expect(Array.isArray(ubl["cac:AccountingCustomerParty"]["cac:Party"]["cac:PartyTaxScheme"])).toBe(false);
  });
});

describe("validateEn16931", () => {
  test("a valid invoice passes and returns the mapped internal document", async () => {
    const internal = await Effect.runPromise(validateEn16931(sampleInvoice()));
    expect(internal["ubl:Invoice"]).toBeDefined();
  });
});

describe("generateEInvoice", () => {
  test("e-SLOG → e-SLOG 2.0 XML", async () => {
    const xml = await Effect.runPromise(generateEInvoice(sampleInvoice(), { format: "eslog" }));
    expect(xml).toContain('xmlns="urn:eslog:2.00"');
  });

  test("UBL → UBL XML via @e-invoice-eu/core", async () => {
    const xml = await Effect.runPromise(generateEInvoice(sampleInvoice(), { format: "ubl" }));
    expect(xml).toContain("Invoice");
    expect(xml).toContain("cbc:");
    expect(xml).toContain("2026-000123");
  });

  test("CII → CII XML via @e-invoice-eu/core", async () => {
    const xml = await Effect.runPromise(generateEInvoice(sampleInvoice(), { format: "cii" }));
    expect(xml.length).toBeGreaterThan(0);
    expect(xml).toContain("CrossIndustryInvoice");
  });

  test("an unknown format fails with UnsupportedFormatError", async () => {
    const result = await Effect.runPromiseExit(
      // deliberately bypass the type to exercise the runtime guard
      generateEInvoice(sampleInvoice(), { format: "json" as never }),
    );
    expect(result._tag).toBe("Failure");
    const error = result._tag === "Failure" ? (result.cause as any).error : undefined;
    expect(error).toBeInstanceOf(UnsupportedFormatError);
  });
});
