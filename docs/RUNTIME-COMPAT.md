# Runtime compatibility

`@grunt-it/fiscalize` runs on **Node** (full) and on **non-Node runtimes like
Cloudflare Workers / workerd** (a subset). This matrix is the verified ground
truth, tested under local `workerd` (`wrangler dev`), per function.

| Capability | Module / dep | Node | Workers (workerd) |
|---|---|---|---|
| e-SLOG 2.0 **generation** (`serializeEslog`) | `xmlbuilder2` | ✅ | ✅ |
| FURS ZOI (`calculateZoi`) | `node:crypto` MD5 + RSA-SHA256 | ✅ | ✅ |
| FURS request JWS (`signFursJws`) | `node:crypto` sign | ✅ | ✅ |
| FURS response verify (`verifyFursResponse`) | `node:crypto` `X509Certificate` | ✅ | ✅ |
| Cert load (`loadP12`) + demo keygen | `node-forge` (p12 parse, RSA keygen) | ✅ | ✅ |
| UBL / CII generation (`generateEInvoice` ubl/cii) | `@e-invoice-eu/core` | ✅ | ❌ |
| EN16931 validation (`validateEn16931`) | `@e-invoice-eu/core` (`invoiceSchema`) | ✅ | ❌ |
| e-SLOG **XSD** output validation (`validateEslogXml`) | `xmllint-wasm` | ✅ | ❌ |

## The two Workers-incompatible paths

1. **`@e-invoice-eu/core`** (UBL/CII + EN16931 validation), its ESM eager-imports
   `tmp-promise` → `tmp` → `fs.realpathSync`, which Cloudflare's `nodejs_compat`
   (unenv) does not implement. **As of v0.1.3 it is dynamically imported**, so
   merely importing `@grunt-it/fiscalize` is Workers-safe, `generateEInvoice('ubl'|'cii')`
   and `validateEn16931` throw **only if called** on a non-Node runtime.

2. **`xmllint-wasm`** (`validateEslogXml`), fails under workerd with
   `"Worker is not defined"` (it expects a `Worker` global workerd lacks).
   Importing `@grunt-it/fiscalize/eslog` is fine (`serializeEslog` works); only
   `validateEslogXml` fails when called. The serializer's output is
   **XSD-conformant regardless**, the engine's CI validates it against the
   official e-SLOG 2.0 XSD on every build; you just can't *re-validate* at
   runtime on Workers.

## Guidance for Workers consumers

Use the **`/eslog`** and **`/furs`** subpath exports (or the top-level, since
v0.1.3 makes import safe). On Workers:

- ✅ Generate e-SLOG 2.0 + run the full FURS fiscal-verification flow (ZOI / EOR /
  JWS sign + verify).
- ❌ Don't call UBL/CII generation, `validateEn16931`, or `validateEslogXml` , 
  those need a Node runtime. Gate them behind a runtime check, or run that part
  on Node (a container / `coolster` service).

Set `nodejs_compat` (the FURS path uses `node:crypto`/`node-forge`).
