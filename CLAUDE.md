# CLAUDE.md, @grunt-it/fiscalize

Conventions for working in this repo.

## What this is

A **standalone, framework-agnostic** Slovenian fiscalization + e-invoicing
toolkit on the grunt-it TS/Effect stack. The reusable *engine*: it knows nothing
about HTTP frameworks or any host. Consumers (an HTTP service, a queue worker,
a plugin) wrap it as a leaf dependency. Do not couple it to any framework.

## Stack & tooling

- **bun** for everything (`bun install`, `bun test`). Not npm/yarn/pnpm.
- **Runtime = TypeScript source.** No build step, `module`/`exports` point at
  `src/*.ts` (bun runs TS directly), matching `@grunt-it/utility-belt`.
- **Effect** (`effect`) is the house effect system. Public async/fallible APIs
  return `Effect.Effect<…>`; tagged errors via `Data.TaggedError`; `runSafe`
  is the Promise boundary helper.
- **valibot** for input-schema validation (`src/lib/invoice/model.ts`).
- Typecheck with `bunx tsc --noEmit`. Tests are `bun:test` (`src/test/*.test.ts`).
- Publishes to **GitHub Packages** on a `v*` tag (`.github/workflows/publish.yml`).

## Architecture (P1)

- `src/lib/invoice/`, the clean public EN16931 core-invoice domain model
  (valibot). This is the single input type consumers construct.
- `src/lib/eslog/`, **owned** e-SLOG 2.0 serializer: domain model → e-SLOG XML
  (UN/EDIFACT-INVOIC-derived, `urn:eslog:2.00`). This is the Slovenian delta the
  upstream lib does not provide. `validate-eslog.ts` validates produced XML
  against the official XSD in `schema/` (`eSLOG20_INVOIC_v200.xsd` +
  `xmldsig-core-schema.xsd`, vendored from epos.si) via `xmllint-wasm`. The XSDs
  are loaded with bun text imports (`with { type: "text" }`; see `src/types.d.ts`)
  so they ship in the package and work with no build step.
- `src/lib/einvoice/`, bridge to `@e-invoice-eu/core`: maps the domain model →
  the lib's UBL-shaped internal JSON (`ubl:Invoice` / `cbc:`/`cac:`) → UBL / CII
  output, plus EN16931 validation via the lib's `invoiceSchema`.
- `src/lib/furs/` (P2), FURS fiscal verification (ZOI/EOR), the JSON/JWS
  protocol. `cert` (p12 load), `zoi` (`MD5(RSA-SHA256/PKCS#1 v1.5(…))`), `jws`
  (RS256 + FURS header), `messages`, `client` (mutual-TLS). Cert serial is kept
  as a BigInt string (real serials exceed 2^53) and emitted as an exact integer
  literal in the JWS header.
- `src/lib/foundation/`, minimal Effect house helpers (tagged errors, runSafe).

### Runtime requirement: FURS needs Node-mTLS, not bun-in-sandbox

The FURS client uses **outbound mutual-TLS client certs**, which **bun 1.3.6 does
not support** (fetch `tls.cert/key` and `node:https` cert/key both fail with
ECONNRESET; `node:https` rejects `pfx`). Run FURS calls under a **Node** runtime
on a non-proxied network. The non-FURS code (e-invoice/e-SLOG) runs fine under
bun. This is a real deployment constraint for the eventual clearance service,
don't schedule FURS calls on bun-in-sandbox.

### Derive, don't fork

We **depend on** `@e-invoice-eu/core` (WTFPL, npm) for the EN16931 model +
UBL/CII/Peppol/Factur-X serialization + validation, and **own only** the e-SLOG
delta. Staying on upstream is deliberate: EN16931/Peppol rules move (SI B2B
mandate Jan 2028) and upkeep tracks the changes. Do not vendor/fork the upstream
EN16931 logic.

## Compliance is ongoing

FURS / e-SLOG / EN16931 / Peppol rules change. Rule-change monitoring is tracked
via `upkeep`'s AI compliance check, this toolkit is its first consumer. When a
rule changes, update the mapping here, don't silently drift.

## Phasing

P1 (this) = e-invoice core (EN16931 → e-SLOG/UBL, generate + validate).
P2 = FURS fiscal verification (ZOI/EOR). P3 = order→fiscalize+e-invoice integration
surface. P4 = service + MCP surface. See `ROADMAP.md`.
