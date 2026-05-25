# @grunt-it/fiscalize

Open-source Slovenian **fiscalization + e-invoicing** toolkit on the grunt-it
TS/Effect stack — the compliance-hard sliver of what Minimax does, as a reusable,
**framework-agnostic** engine (not a full accounting suite).

It knows nothing about Medusa, HTTP frameworks, or any host: build an invoice,
get conformant XML out. Consumers (e.g. a Medusa fiscalization plugin) wrap it as
a leaf dependency.

> **Status — P1.** This release covers the **e-invoice core**: generate +
> validate an EN16931 core invoice as **e-SLOG 2.0** (Slovenian) and **UBL / CII**.
> FURS fiscal verification (ZOI/EOR), Medusa integration, and the service/MCP
> surface are later phases — see [`ROADMAP.md`](./ROADMAP.md).

## Why this shape

Slovenia's e-SLOG 2.0 is EN16931-compliant but is its **own** XML syntax
(UN/EDIFACT INVOIC-derived, namespace `urn:eslog:2.00`) — not UBL. So fiscalize:

- **depends on** [`@e-invoice-eu/core`](https://github.com/gflohr/e-invoice-eu)
  (WTFPL) for the EN16931 model, validation, and UBL / CII / Peppol / Factur-X
  serialization — the hard, maintained part; and
- **owns** the thin Slovenian delta: an **e-SLOG 2.0 serializer**.

Staying on upstream is deliberate — EN16931 / Peppol rules move (the SI B2B
mandate lands **Jan 2028**), and we want to inherit those updates rather than
fork away from them. Rule-change monitoring is tracked via `upkeep`.

## Install

Published to GitHub Packages. Create a `bunfig.toml`:

```toml
[install.scopes]
"@grunt-it" = { token = "$REGISTRY_TOKEN", url = "https://npm.pkg.github.com" }
```

```bash
export REGISTRY_TOKEN="ghp_…"   # a PAT with read:packages
bun add @grunt-it/fiscalize
```

## Quick start

Promise-friendly, for any host (never throws):

```ts
import { createEInvoice, type Invoice } from "@grunt-it/fiscalize";

const invoice: Invoice = {
  invoiceNumber: "2026-000123",
  issueDate: "2026-05-25",
  dueDate: "2026-06-08",
  seller: {
    name: "Zelena Japka d.o.o.",
    vatId: "SI12345678",
    address: { street: "Slovenska cesta 1", city: "Ljubljana", postalZone: "1000", countryCode: "SI" },
    iban: "SI56020170014356205",
    bic: "LJBASI2X",
  },
  buyer: {
    name: "Kupec d.o.o.",
    vatId: "SI87654321",
    address: { city: "Ljubljana", postalZone: "1000", countryCode: "SI" },
  },
  lines: [
    { id: "1", name: "Detergent 1L", quantity: 10, netPrice: 5.0, lineNetAmount: 50.0, taxRate: 22 },
  ],
  taxBreakdown: [{ taxableAmount: 50.0, taxAmount: 11.0, taxRate: 22 }],
  totals: { lineExtensionAmount: 50.0, taxExclusiveAmount: 50.0, taxAmount: 11.0, taxInclusiveAmount: 61.0 },
};

const result = await createEInvoice(invoice, { format: "eslog" });
if (result.ok) {
  console.log(result.data); // e-SLOG 2.0 XML
} else {
  console.error(result.error.message, result.error.status);
}
```

`format` is `"eslog" | "ubl" | "cii"`. For `ubl`/`cii`, EN16931 validation runs
before generation by default (`validate: false` to skip).

### Effect-native API

```ts
import { Effect } from "effect";
import { parseInvoice, validateEn16931, generateEInvoice, serializeEslog } from "@grunt-it/fiscalize";

const program = Effect.gen(function* () {
  const invoice = yield* parseInvoice(rawInput);   // valibot — structural gate
  yield* validateEn16931(invoice);                 // Ajv vs EN16931 schema
  return yield* generateEInvoice(invoice, { format: "ubl" });
});
```

`serializeEslog(invoice)` is a pure synchronous escape hatch for e-SLOG only.

### Validate produced e-SLOG against the official XSD

```ts
import { generateEInvoice, validateEslogXml } from "@grunt-it/fiscalize";

// validate on the way out…
const xml = await Effect.runPromise(
  generateEInvoice(invoice, { format: "eslog", validateOutput: true }),
);

// …or validate any e-SLOG XML string standalone
yield* validateEslogXml(someEslogXml);
```

`validateEslogXml` checks the XML against the **official e-SLOG 2.0 XSD**
(`eSLOG20_INVOIC_v200.xsd` + `xmldsig-core-schema.xsd`, from the epos.si Aug-2020
package), using xmllint compiled to WebAssembly — no native bindings.

## The model

`Invoice` is a clean, EN16931-aligned **core invoice**: header (BT-1/2/3/5/9/72),
seller & buyer (BG-4/BG-7, with VAT, address, bank), lines (BG-25), VAT breakdown
(BG-23), and totals (BG-22). Every field is annotated with its Business Term so
the mapping to each syntax stays auditable. Validated with `valibot`.

## What's covered vs deferred

P1 maps the **mandatory + common core**, and produced e-SLOG XML is validated
against the official e-SLOG 2.0 **XSD**. Deferred (see [`ROADMAP.md`](./ROADMAP.md)):
business-rule (schematron-equivalent) validation — the official package ships no
`.sch`, so those rules are spec prose — plus document/line-level allowances,
contacts, multiple payment means, and the long tail of optional BTs. The e-SLOG
mapping is grounded in the official spec (epos.si) and cross-checked against the
MIT-licensed reference generator `Media24si/eslog2`.

## Development

```bash
bun install
bun test
bunx tsc --noEmit
```

## License

MIT — see [`LICENSE`](./LICENSE).
