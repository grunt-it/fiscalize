import { describe, expect, test } from "bun:test";
import { createEInvoice } from "../index";
import { sampleInvoice } from "./fixtures";

describe("createEInvoice (Promise boundary)", () => {
  test("valid input → { ok: true } with e-SLOG XML", async () => {
    const result = await createEInvoice(sampleInvoice(), { format: "eslog" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toContain('xmlns="urn:eslog:2.00"');
  });

  test("valid input → { ok: true } with UBL XML (with EN16931 validation)", async () => {
    const result = await createEInvoice(sampleInvoice(), { format: "ubl" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toContain("cbc:");
  });

  test("malformed input → { ok: false } with status 400, never throws", async () => {
    const result = await createEInvoice({ invoiceNumber: 123 }, { format: "ubl" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.status).toBe(400);
  });
});
