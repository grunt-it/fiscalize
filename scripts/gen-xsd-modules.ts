// Regenerates the inlined XSD modules from the vendored .xsd files.
// We inline each XSD as a JS string (JSON-stringified) so it loads under ANY
// bundler/runtime (Vite/Rollup/Workers/bun) — not just bun's `import … with
// { type: "text" }`, which Rollup/Vite reject. Run: bun run scripts/gen-xsd-modules.ts
import { readFileSync, writeFileSync } from "node:fs";

const dir = "src/lib/eslog/schema";
const map: Record<string, string> = {
  "eSLOG20_INVOIC_v200.xsd": "eslog-invoice-xsd.ts",
  "xmldsig-core-schema.xsd": "xmldsig-xsd.ts",
};
for (const [xsd, ts] of Object.entries(map)) {
  const content = readFileSync(`${dir}/${xsd}`, "utf8");
  const out =
    `// GENERATED from ${xsd} by scripts/gen-xsd-modules.ts — do not edit by hand.\n` +
    `// Inlined as a string so the XSD loads under any bundler (Vite/Rollup/Workers/bun).\n` +
    `export default ${JSON.stringify(content)};\n`;
  writeFileSync(`${dir}/${ts}`, out);
  console.log(`wrote ${dir}/${ts} (${out.length} bytes)`);
}
