import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { generateEInvoice } from "../lib/einvoice/generate";
import { serializeEslog } from "../lib/eslog/serialize";
import { validateEslogXml } from "../lib/eslog/validate-eslog";
import { EslogValidationError } from "../lib/foundation/errors";
import { sampleInvoice } from "./fixtures";

describe("validateEslogXml (official e-SLOG 2.0 XSD)", () => {
  test("our serializer output is conformant to the official XSD", async () => {
    const xml = serializeEslog(sampleInvoice());
    const out = await Effect.runPromise(validateEslogXml(xml));
    expect(out).toBe(xml);
  });

  test("the official sample invoice validates (XSD harness sanity)", async () => {
    const sample = await Bun.file(`${import.meta.dir}/sample-eslog20-with-bt.xml`).text();
    await Effect.runPromise(validateEslogXml(sample));
  });

  test("a schema-violating document fails with EslogValidationError + issues", async () => {
    // Inject a bogus element that the XSD does not allow.
    const broken = serializeEslog(sampleInvoice()).replace(
      "<M_INVOIC",
      '<M_INVOIC><S_BOGUS>nope</S_BOGUS',
    );
    const result = await Effect.runPromiseExit(validateEslogXml(broken));
    expect(result._tag).toBe("Failure");
    const error = result._tag === "Failure" ? (result.cause as any).error : undefined;
    expect(error).toBeInstanceOf(EslogValidationError);
    expect(error.status).toBe(422);
    expect(error.issues.length).toBeGreaterThan(0);
  });
});

describe("generateEInvoice with validateOutput", () => {
  test("eslog + validateOutput returns the validated XML", async () => {
    const xml = await Effect.runPromise(
      generateEInvoice(sampleInvoice(), { format: "eslog", validateOutput: true }),
    );
    expect(xml).toContain('xmlns="urn:eslog:2.00"');
  });
});
