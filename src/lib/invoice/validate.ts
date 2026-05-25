import { Effect } from "effect";
import * as v from "valibot";
import { InvalidInvoiceError, type ValidationIssue } from "../foundation/errors";
import { Invoice } from "./model";

/**
 * Parse + validate caller input against the {@link Invoice} model.
 *
 * Succeeds with a fully-typed, defaults-resolved `Invoice`; fails with
 * `InvalidInvoiceError` carrying normalised per-field issues. This is the
 * *structural* gate (shape, types, formats); EN16931 business-rule validation
 * lives in the einvoice module (Ajv via `@e-invoice-eu/core`).
 */
export const parseInvoice = Effect.fn("parseInvoice")(function* (input: unknown) {
  const result = v.safeParse(Invoice, input, { abortPipeEarly: false });
  if (result.success) return result.output;
  return yield* Effect.fail(
    new InvalidInvoiceError(
      `Invoice failed validation (${result.issues.length} issue${result.issues.length === 1 ? "" : "s"}).`,
      result.issues.map(toIssue),
    ),
  );
});

function toIssue(issue: v.BaseIssue<unknown>): ValidationIssue {
  const path = issue.path?.map((p) => String((p as { key: unknown }).key)).join(".") ?? "";
  return { path, message: issue.message };
}
