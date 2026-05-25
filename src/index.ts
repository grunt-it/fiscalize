import { Effect } from "effect";
import { generateEInvoice, type GenerateOptions } from "./lib/einvoice/generate";
import { validateEn16931 } from "./lib/einvoice/validate";
import { type EffectResult, runSafe } from "./lib/foundation/runtime";
import { parseInvoice } from "./lib/invoice/validate";

export interface CreateEInvoiceOptions extends GenerateOptions {
  /**
   * Run EN16931 business-rule validation before generating. Defaults to `true`
   * for `ubl`/`cii` and `false` for `eslog` (e-SLOG has its own XSD/schematron
   * validation path, deferred — see ROADMAP.md).
   */
  validate?: boolean;
}

/**
 * The full pipeline as an Effect: parse unknown input against the invoice model
 * → optionally validate against EN16931 → generate XML in the requested format.
 */
export const createEInvoiceEffect = (input: unknown, options: CreateEInvoiceOptions) =>
  Effect.gen(function* () {
    const invoice = yield* parseInvoice(input);
    const shouldValidate = options.validate ?? options.format !== "eslog";
    if (shouldValidate) yield* validateEn16931(invoice);
    return yield* generateEInvoice(invoice, options);
  });

/**
 * Promise-friendly wrapper of {@link createEInvoiceEffect} for non-Effect hosts
 * (e.g. a Medusa plugin). Never throws — returns `{ ok: true, data }` with the
 * XML or `{ ok: false, error: { message, status } }`.
 */
export function createEInvoice(
  input: unknown,
  options: CreateEInvoiceOptions,
): Promise<EffectResult<string>> {
  return runSafe(createEInvoiceEffect(input, options));
}

export * from "./lib/foundation";
export * from "./lib/invoice";
export * from "./lib/einvoice";
export { type EslogOptions, serializeEslog } from "./lib/eslog/serialize";
export * as eslogCodes from "./lib/eslog/codes";
