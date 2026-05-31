# FURS runtime requirement (read before deploying FURS calls)

The e-invoice side of fiscalize (e-SLOG / UBL / CII generation + XSD validation)
runs anywhere. **The live FURS submission path has a hard runtime requirement.**

## The constraint

FURS fiscal verification posts to `blagajne(-test).fu.gov.si` over **mutual TLS**:
the client must present the taxpayer certificate during the TLS handshake.

- **bun (≤ 1.3.6) does not present an outbound mTLS client certificate.** Both
  `fetch({ tls: { cert, key } })` and `node:https` with `cert`/`key` fail with
  `ECONNRESET` against FURS (which requires the client cert); `node:https` also
  rejects `pfx` outright (`"pfx is not supported"`). This is a bun runtime gap,
  not a fiscalize bug.
- Therefore **live FURS calls (test *and* production) must run under Node**, on a
  network that doesn't MITM/terminate TLS (a transparent HTTPS proxy breaks the
  mTLS session, observed in CI/sandbox environments).

What this means in practice: don't schedule `reportInvoice` / `registerBusinessPremise`
/ `echo` on bun-in-sandbox. Run the FURS-calling component under Node.

## What still works under bun

Everything except the live network call: `loadP12`, `calculateZoi`,
`zoiToPrintable`, `signFursJws`, `verifyFursResponse`. See
[`examples/furs-offline.ts`](../examples/furs-offline.ts), runnable under bun.

## Running live FURS under Node (the opt-in path)

```ts
// run with: node --experimental-strip-types furs-live.ts   (Node 22+/24)
// or compile the TS first; the key point is the *runtime* is Node, not bun.
import { readFileSync } from "node:fs";
import { Effect } from "effect";
import { makeFursClient } from "@grunt-it/fiscalize/furs";

const p12 = new Uint8Array(readFileSync(process.env.FURS_P12!));
const eor = await Effect.runPromise(
  Effect.gen(function* () {
    const furs = yield* makeFursClient({
      p12,
      passphrase: process.env.FURS_PASSPHRASE!,
      production: false,
      // Recommended: authenticate FURS's response signature.
      fursResponseCertPem: readFileSync(process.env.FURS_RESPONSE_CERT!, "utf8"),
    });
    yield* furs.echo();                       // connectivity (mutual TLS)
    return yield* furs.reportInvoice({ /* … */ });
  }),
);
```

### Opt-in live integration test

`src/test/furs-live.test.ts` is skipped unless you provide a cert. Run it from a
Node-mTLS-capable, non-proxied environment:

```bash
FISCALIZE_FURS_TEST_P12=/abs/demo_podjetje.p12 \
FISCALIZE_FURS_TEST_PASSPHRASE='Geslo123#' \
  bun test src/test/furs-live.test.ts   # (under bun it will still hit the mTLS gap; run the equivalent under Node to confirm)
```

A public FURS **test** certificate (`demo_podjetje.p12`, passphrase `Geslo123#`)
ships with the reference clients (`jurgenwerk/furs_fiscal_verification`,
`boris-savic/python-furs-fiscal`). Production uses the shop's own eDavki cert.

## Status

The FURS protocol implementation is **unit-verified** (ZOI cross-checked against
an independent `node:crypto` computation; request JWS verifies; response
verification accepts genuine and rejects spoofed/tampered/wrong-key responses;
the real FURS demo test cert loads). The single outstanding item is a **one-shot
live EOR confirmation** from a Node-mTLS runtime, tracked in `ROADMAP.md`.

> Candidate addition to the global `bun.md` rule: "bun (≤1.3.6) cannot present an
> outbound mTLS client certificate, run mTLS clients under Node." Left to Nik.
