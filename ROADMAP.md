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

## P1.x — e-SLOG XSD output validation ✅

- `validateEslogXml(xml)` validates produced e-SLOG XML against the **official
  e-SLOG 2.0 XSD** (`eSLOG20_INVOIC_v200.xsd` + its `xmldsig-core-schema.xsd`
  import), vendored from the epos.si Aug-2020 package, via xmllint compiled to
  WebAssembly (`xmllint-wasm` — no native bindings, bun-friendly).
- `generateEInvoice(..., { validateOutput: true })` validates before returning.
- Confirms the P1 serializer is **XSD-conformant** (regression-locked in tests
  against both our output and the official sample invoice).

### Deferred within the e-invoice core (next P1.x slices)

- **Business-rule (schematron-equivalent) validation.** The official e-SLOG 2.0
  package ships **no `.sch`** — the business rules (arithmetic, conditional
  presence) live in the spec PDFs as prose. The XSD enforces structure/types,
  not those rules. A future slice can encode the key rules (BR-CO/BR-S analogues)
  as checks. Cross-check against the lib's EN16931 schematron where it overlaps.
- **Document-level allowances/charges** (BG-20/BG-21) → e-SLOG `G_SG16`, UBL
  `cac:AllowanceCharge`. Model has the totals (BT-107/108) but not the detail.
- **Line-level allowances** (BG-27/BG-28) → e-SLOG `G_SG39`.
- **Contacts** (BG-6/BG-9), **delivery address** (BG-15), **multiple payment
  means**, item identifiers (EAN/buyer/seller), `cbc:Note` granularity.
- **Cross-border**: EAS scheme defaults beyond SI VAT (`9949`); a country→EAS map.
- **XML digital signature** (XAdES over e-SLOG) — required for some exchange paths.
- **Credit notes / corrected invoices** end-to-end (type codes are modelled;
  the negative-amount + reference-to-original rules are not yet exercised).

## P2 — FURS fiscal verification ✅ (built; live-verify deferred)

Cash-register receipts → ZOI/EOR (`src/lib/furs/`). TS/Effect port of the
JSON/JWS FURS protocol; cross-checked against `node-furs-fiscal-verification`,
`jurgenwerk/furs_fiscal_verification`, and `boris-savic/python-furs-fiscal`.

- **Cert** — load taxpayer PKCS#12 → key + identity (subject/issuer/serial;
  serial kept as an exact BigInt — real test cert serials exceed 2^53).
- **ZOI** — `MD5(RSA-SHA256 / PKCS#1 v1.5( taxNo + dd-MM-yyyy HH:mm:ss + invNo +
  premiseID + deviceID + amount ))`. PKCS#1 v1.5 (deterministic), date with
  dashes — resolved the divergence between the reference clients (node-furs used
  dots; python-furs used PSS) in favour of the deterministic, 2-of-3 form.
- **JWS** — RS256 with FURS's custom header (`subject_name`/`issuer_name`/`serial`,
  serial emitted as an exact integer literal).
- **Messages** — `InvoiceRequest` + immovable `BusinessPremiseRequest`; client
  `echo` / `registerBusinessPremise` / `reportInvoice` (→ ZOI + EOR + printable).

Unit-verified (ZOI cross-validated vs independent `node:crypto`; JWS signature
verifies; loads the real FURS demo test cert).

### Deferred / blocked

- **Live test-env round-trip.** Could not be completed from the build env:
  **bun 1.3.6 does not present an outbound mTLS client certificate**, and the
  legacy FURS test endpoint rejects modern-OpenSSL TLS from a proxied network.
  Run the opt-in `furs-live.test.ts` under a **Node** runtime on an unproxied
  network (with a FURS test p12) to confirm end-to-end — see the test's header.
- **Verify FURS's response JWS signature** against the FURS public cert (the
  reference clients skip this; currently decoded without verification).
- **Refunds / corrective receipts**, movable premises (A/B/C), sales-book mode.

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
