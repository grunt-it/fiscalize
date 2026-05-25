# Roadmap

Phasing mirrors the ticket (`grunt-it/tickets/fiscalization-einvoicing-toolkit.md`).

## P1 — e-invoice core ✅ (this release)

EN16931 core invoice → **e-SLOG 2.0** + **UBL / CII**, with validation.

- Clean EN16931-aligned `Invoice` domain model (valibot), BT-annotated.
- Owned **e-SLOG 2.0** serializer (`urn:eslog:2.00`, UN/EDIFACT-INVOIC structure):
  header, dates, parties (+ bank + VAT), currency, payment terms, lines, document
  totals, VAT breakdown.
- **UBL / CII** via `@e-invoice-eu/core` (model → internal `ubl:Invoice` JSON).
- EN16931 structural validation via the lib's JSON Schema (Ajv 2019-09).
- Effect-native API + Promise boundary (`createEInvoice`).

### Deferred within the e-invoice core (next P1.x slices)

- **e-SLOG XSD + schematron validation** of *output*. P1 validates the EN16931
  model structurally (UBL schema); it does not yet validate the produced e-SLOG
  XML against the official e-SLOG 2.0 XSD or business-rule schematron. Vendor the
  XSD (incl. `xmldsig-core-schema.xsd`) and add an output-validation pass.
- **Document-level allowances/charges** (BG-20/BG-21) → e-SLOG `G_SG16`, UBL
  `cac:AllowanceCharge`. Model has the totals (BT-107/108) but not the detail.
- **Line-level allowances** (BG-27/BG-28) → e-SLOG `G_SG39`.
- **Contacts** (BG-6/BG-9), **delivery address** (BG-15), **multiple payment
  means**, item identifiers (EAN/buyer/seller), `cbc:Note` granularity.
- **Cross-border**: EAS scheme defaults beyond SI VAT (`9949`); a country→EAS map.
- **XML digital signature** (XAdES over e-SLOG) — required for some exchange paths.
- **Credit notes / corrected invoices** end-to-end (type codes are modelled;
  the negative-amount + reference-to-original rules are not yet exercised).

## P2 — FURS fiscal verification

Cash-register receipts → ZOI/EOR. Derive from `node-furs-fiscal-verification`
(TS-ify; cert handling, FURS tax-API calls). Cross-language refs: SLOTax (.NET),
jurgenwerk/furs_fiscal_verification (Ruby).

## P3 — integration surface

`order.placed` → fiscalize (FURS) + e-invoice (e-SLOG/UBL). Consumed by a
separate `@grunt-it/medusa-plugin-si-fiscalization` track — fiscalize stays
framework-agnostic; the plugin wraps it.

## P4 — service + MCP

Optional long-running service + MCP-accessible surface (sibling to secret-tap,
upkeep). Package for reuse.

## Ongoing — compliance tracking

FURS / e-SLOG / EN16931 / Peppol rules change (incl. the moving Jan-2028 SI B2B
mandate). Tracked via `upkeep`'s AI compliance check; fiscalize is its first
consumer. Rule changes become mapping updates here.
