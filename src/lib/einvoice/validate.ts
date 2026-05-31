// `invoiceSchema` is loaded lazily (dynamic import) so the engine stays
// importable on non-Node runtimes, @e-invoice-eu/core is Node-only (module-init
// crash under Cloudflare Workers). validateEn16931 therefore works on Node and
// throws only-if-called elsewhere. See docs/RUNTIME-COMPAT.md.
// `@e-invoice-eu/core`'s invoiceSchema is JSON Schema draft 2019-09 → use Ajv2019.
import AjvImport, { type ValidateFunction } from "ajv/dist/2019.js";
import addFormatsImport from "ajv-formats";
import { Effect } from "effect";
import { InvalidInvoiceError, type ValidationIssue } from "../foundation/errors";
import type { Invoice } from "../invoice/model";
import { toEInvoiceInternal } from "./to-internal";

// Ajv & ajv-formats ship CJS; normalise the interop default across runtimes.
const Ajv = ((AjvImport as unknown as { default?: unknown }).default ?? AjvImport) as typeof AjvImport;
const addFormats = ((addFormatsImport as unknown as { default?: unknown }).default ??
  addFormatsImport) as typeof addFormatsImport;

let validator: ValidateFunction | undefined;

async function getValidator(): Promise<ValidateFunction> {
  if (!validator) {
    const { invoiceSchema } = await import("@e-invoice-eu/core");
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    validator = ajv.compile(invoiceSchema);
  }
  return validator;
}

/**
 * Validate an {@link Invoice} against EN16931 business rules, via the JSON Schema
 * shipped by `@e-invoice-eu/core`. Render-free: maps to the internal format and
 * checks it without producing XML. Succeeds with the mapped internal document;
 * fails with `InvalidInvoiceError` carrying per-field issues.
 */
export const validateEn16931 = Effect.fn("validateEn16931")(function* (invoice: Invoice) {
  const internal = toEInvoiceInternal(invoice);
  const validate = yield* Effect.promise(() => getValidator());
  if (validate(internal)) return internal;

  const issues: ValidationIssue[] = (validate.errors ?? []).map((e) => ({
    path: e.instancePath || e.schemaPath,
    message: e.message ?? "invalid",
  }));
  return yield* Effect.fail(
    new InvalidInvoiceError(
      `Invoice failed EN16931 validation (${issues.length} issue${issues.length === 1 ? "" : "s"}).`,
      issues,
    ),
  );
});
