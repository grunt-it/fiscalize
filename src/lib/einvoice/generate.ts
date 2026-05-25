import { type Invoice as EInvoiceEUInvoice, InvoiceService } from "@e-invoice-eu/core";
import { Effect } from "effect";
import { EInvoiceGenerationError, UnsupportedFormatError } from "../foundation/errors";
import type { EslogOptions } from "../eslog/serialize";
import { serializeEslog } from "../eslog/serialize";
import type { Invoice } from "../invoice/model";
import { FORMATS, type Format, isFormat, LIB_FORMAT } from "./formats";
import { toEInvoiceInternal } from "./to-internal";

export interface GenerateOptions extends EslogOptions {
  format: Format;
  /**
   * Language tag (e.g. `sl-si`) — only used by `@e-invoice-eu/core` for
   * Factur-X PDF metadata; irrelevant to the pure-XML formats here. Default `sl`.
   */
  lang?: string;
}

// `InvoiceService` is stateless across calls; build once.
let service: InvoiceService | undefined;
function getService(): InvoiceService {
  if (!service) service = new InvoiceService(console);
  return service;
}

/**
 * Generate an e-invoice XML string in the requested {@link Format}.
 *
 * - `eslog` → our owned e-SLOG 2.0 serializer.
 * - `ubl` / `cii` → `@e-invoice-eu/core`, via the internal-format mapping.
 *
 * Assumes a structurally-valid invoice (run `parseInvoice` first). For EN16931
 * business-rule checking ahead of generation, run `validateEn16931`.
 */
export const generateEInvoice = Effect.fn("generateEInvoice")(function* (
  invoice: Invoice,
  options: GenerateOptions,
) {
  const format = options.format;
  if (!isFormat(format)) {
    return yield* Effect.fail(new UnsupportedFormatError(format, FORMATS));
  }

  if (format === "eslog") {
    return yield* Effect.try({
      try: () => serializeEslog(invoice, options),
      catch: (cause) => new EInvoiceGenerationError("eslog", cause),
    });
  }

  const internal = toEInvoiceInternal(invoice) as unknown as EInvoiceEUInvoice;
  const rendered = yield* Effect.tryPromise({
    try: () => getService().generate(internal, { format: LIB_FORMAT[format], lang: options.lang ?? "sl" }),
    catch: (cause) => new EInvoiceGenerationError(format, cause),
  });

  // Pure-XML formats return the XML as a string.
  return typeof rendered === "string" ? rendered : String(rendered);
});
