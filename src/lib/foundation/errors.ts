import { Data } from "effect";

/**
 * Shape shared by every fiscalize error: a human message, an HTTP-ish status
 * (so a host can map failures to responses without unwrapping the union), and
 * the underlying cause.
 */
export interface FiscalizeErrorParams {
  message: string;
  status: 400 | 422 | 500;
  cause?: unknown;
  [key: string]: unknown;
}

/**
 * A single schema/validation issue, normalised across valibot (input model)
 * and Ajv (EN16931 business rules) so callers see one shape.
 */
export interface ValidationIssue {
  /** Dotted path to the offending value, e.g. `seller.address.countryCode`. */
  path: string;
  message: string;
}

/**
 * The invoice failed validation, the input model (valibot) or the EN16931
 * business rules (Ajv via `@e-invoice-eu/core`). 400-class: caller's data.
 */
export class InvalidInvoiceError extends Data.TaggedError("InvalidInvoiceError")<
  FiscalizeErrorParams & { issues: ValidationIssue[] }
> {
  constructor(message: string, issues: ValidationIssue[], cause?: unknown) {
    super({ message, status: 400, issues, cause });
  }
}

/**
 * Serialization/generation failed after the invoice was accepted, e.g. the
 * underlying renderer threw. 500-class: our problem, not the caller's.
 */
export class EInvoiceGenerationError extends Data.TaggedError("EInvoiceGenerationError")<
  FiscalizeErrorParams & { format: string }
> {
  constructor(format: string, cause: unknown) {
    super({
      message: `Failed to generate ${format} e-invoice: ${describe(cause)}`,
      status: 500,
      format,
      cause,
    });
  }
}

/** An unsupported output format was requested. */
export class UnsupportedFormatError extends Data.TaggedError("UnsupportedFormatError")<
  FiscalizeErrorParams & { format: string }
> {
  constructor(format: string, supported: readonly string[]) {
    super({
      message: `Unsupported format "${format}". Supported: ${supported.join(", ")}.`,
      status: 400,
      format,
    });
  }
}

/**
 * Produced e-SLOG XML failed validation against the official e-SLOG 2.0 XSD.
 * 422-class: the document is well-formed but not schema-conformant, almost
 * always a serializer/mapping gap, surfaced with the XSD errors.
 */
export class EslogValidationError extends Data.TaggedError("EslogValidationError")<
  FiscalizeErrorParams & { issues: ValidationIssue[] }
> {
  constructor(issues: ValidationIssue[]) {
    super({
      message: `Produced e-SLOG XML failed e-SLOG 2.0 XSD validation (${issues.length} issue${issues.length === 1 ? "" : "s"}).`,
      status: 422,
      issues,
    });
  }
}

export type FiscalizeError =
  | InvalidInvoiceError
  | EInvoiceGenerationError
  | UnsupportedFormatError
  | EslogValidationError;

function describe(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (typeof cause === "string") return cause;
  return String(cause);
}
