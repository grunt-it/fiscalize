import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { makeFursClient } from "../lib/furs/client";

/**
 * Opt-in live integration against the FURS TEST environment. Skipped by default.
 *
 * Provide a FURS test PKCS#12 to run it:
 *   FISCALIZE_FURS_TEST_P12=/abs/path/demo_podjetje.p12 \
 *   FISCALIZE_FURS_TEST_PASSPHRASE='…' bun test
 *
 * NOTE (2026-05): a live round-trip could not be completed from the build
 * environment, bun 1.3.6 does not present an outbound mTLS client certificate,
 * and the legacy FURS test endpoint also rejects modern-OpenSSL TLS from a
 * proxied network. Run this under a Node runtime on an unproxied network to
 * verify end-to-end (the implementation is otherwise unit-verified). See ROADMAP.
 */
const p12Path = process.env.FISCALIZE_FURS_TEST_P12;
const passphrase = process.env.FISCALIZE_FURS_TEST_PASSPHRASE;
const live = Boolean(p12Path && passphrase);
const suite = live ? describe : describe.skip;

suite("FURS test-env live integration (opt-in)", () => {
  test("echo round-trips against the FURS test endpoint", async () => {
    const p12 = new Uint8Array(readFileSync(p12Path as string));
    const echoed = await Effect.runPromise(
      Effect.gen(function* () {
        const furs = yield* makeFursClient({ p12, passphrase: passphrase as string, production: false });
        return yield* furs.echo("fiscalize-live");
      }),
    );
    expect(echoed).toBe("fiscalize-live");
  });
});
