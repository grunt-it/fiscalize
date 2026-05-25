/// <reference path="../../types.d.ts" />
// The reference above carries the `declare module "*.xsd"` ambient into any
// consumer's compilation that loads this file (the engine ships TS source, so a
// consumer's tsc resolves these .xsd text-imports). Keeps consumers from having
// to re-declare the ambient themselves.
import { Effect } from "effect";
import { validateXML } from "xmllint-wasm";
import { EInvoiceGenerationError, EslogValidationError, type ValidationIssue } from "../foundation/errors";
import invoiceXsd from "./schema/eSLOG20_INVOIC_v200.xsd" with { type: "text" };
import xmldsigXsd from "./schema/xmldsig-core-schema.xsd" with { type: "text" };

/**
 * Validate an e-SLOG XML string against the **official e-SLOG 2.0 XSD**
 * (`eSLOG20_INVOIC_v200.xsd`, with its `xmldsig-core-schema.xsd` import),
 * vendored from the epos.si August-2020 package.
 *
 * Uses xmllint compiled to WebAssembly — no native bindings, bun-friendly.
 * Succeeds with the input XML; fails with `EslogValidationError` listing the
 * schema violations (line-located where xmllint reports them).
 *
 * This is *output* validation (the produced XML is schema-conformant), distinct
 * from `validateEn16931` which validates the EN16931 model structurally. Note:
 * the e-SLOG XSD enforces structure/types, not the business-rule arithmetic in
 * the spec prose (no official schematron is published) — see ROADMAP.md.
 */
export const validateEslogXml = Effect.fn("validateEslogXml")(function* (xml: string) {
  const result = yield* Effect.tryPromise({
    try: () =>
      validateXML({
        xml: [{ fileName: "invoice.xml", contents: xml }],
        schema: [{ fileName: "eSLOG20_INVOIC_v200.xsd", contents: invoiceXsd }],
        // The XSD imports xmldsig by relative schemaLocation; provide it in the FS.
        preload: [{ fileName: "xmldsig-core-schema.xsd", contents: xmldsigXsd }],
      }),
    catch: (cause) => new EInvoiceGenerationError("eslog", cause),
  });

  if (result.valid) return xml;

  const issues: ValidationIssue[] = result.errors.map((e) => ({
    path: e.loc ? `${e.loc.fileName}:${e.loc.lineNumber}` : "",
    message: e.message,
  }));
  return yield* Effect.fail(new EslogValidationError(issues));
});
