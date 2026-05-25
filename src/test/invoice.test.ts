import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { InvalidInvoiceError } from "../lib/foundation/errors";
import { parseInvoice } from "../lib/invoice/validate";
import { sampleInvoice } from "./fixtures";

describe("parseInvoice", () => {
  test("accepts a valid invoice and returns it typed", async () => {
    const out = await Effect.runPromise(parseInvoice(sampleInvoice()));
    expect(out.invoiceNumber).toBe("2026-000123");
    expect(out.lines).toHaveLength(2);
  });

  test("rejects malformed input with InvalidInvoiceError + per-field issues", async () => {
    const result = await Effect.runPromiseExit(
      parseInvoice({
        invoiceNumber: "x",
        issueDate: "not-a-date",
        seller: {},
        buyer: {},
        lines: [],
        taxBreakdown: [],
        totals: {},
      }),
    );
    expect(result._tag).toBe("Failure");
    const error = result._tag === "Failure" ? extractError(result.cause) : undefined;
    expect(error).toBeInstanceOf(InvalidInvoiceError);
    expect(error?.status).toBe(400);
    expect((error?.issues.length ?? 0)).toBeGreaterThan(0);
    // an empty `lines` array must be flagged
    expect(error?.issues.some((i) => i.path === "lines")).toBe(true);
  });

  test("rejects a bad country code", async () => {
    const inv = sampleInvoice();
    const bad = { ...inv, seller: { ...inv.seller, address: { ...inv.seller.address, countryCode: "Slovenia" } } };
    const result = await Effect.runPromiseExit(parseInvoice(bad));
    expect(result._tag).toBe("Failure");
  });
});

// Pull the typed failure value out of an Effect Cause without importing Cause internals everywhere.
function extractError(cause: unknown): InvalidInvoiceError | undefined {
  const c = cause as { _tag?: string; error?: unknown };
  if (c?._tag === "Fail") return c.error as InvalidInvoiceError;
  return undefined;
}
