/**
 * Runnable e-invoice example: domain model → e-SLOG 2.0 (XSD-validated) + UBL.
 *
 * In your project, import from the package:  import { createEInvoice } from "@grunt-it/fiscalize";
 * Run in this repo:                          bun run examples/e-invoice.ts
 */
import { Effect } from "effect";
import { createEInvoice, type Invoice, validateEslogXml } from "../src/index";

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
    { id: "1", name: "Ekološki detergent 1L", quantity: 10, netPrice: 5.0, lineNetAmount: 50.0, taxRate: 22 },
    { id: "2", name: "Naravno milo 100g", quantity: 2, netPrice: 20.0, lineNetAmount: 40.0, taxRate: 9.5 },
  ],
  taxBreakdown: [
    { taxableAmount: 50.0, taxAmount: 11.0, taxRate: 22 },
    { taxableAmount: 40.0, taxAmount: 3.8, taxRate: 9.5 },
  ],
  totals: { lineExtensionAmount: 90, taxExclusiveAmount: 90, taxAmount: 14.8, taxInclusiveAmount: 104.8 },
};

// 1. e-SLOG 2.0, validated against the official XSD on the way out.
const eslog = await createEInvoice(invoice, { format: "eslog", validateOutput: true });
if (!eslog.ok) throw new Error(`e-SLOG failed: ${eslog.error.message}`);
console.log("✓ e-SLOG 2.0 generated + XSD-valid:");
console.log(`${eslog.data.split("\n").slice(0, 4).join("\n")}\n  …(${eslog.data.length} bytes)\n`);

// 2. UBL, EN16931-validated before generation.
const ubl = await createEInvoice(invoice, { format: "ubl" });
if (!ubl.ok) throw new Error(`UBL failed: ${ubl.error.message}`);
console.log(`✓ UBL generated (${ubl.data.length} bytes, EN16931-validated)\n`);

// 3. Re-validate an e-SLOG string explicitly against the official XSD.
await Effect.runPromise(validateEslogXml(eslog.data));
console.log("✓ validateEslogXml: passed");

// 4. Invalid input never throws, it returns a 400 result.
const bad = await createEInvoice({ invoiceNumber: 123 }, { format: "ubl" });
console.log(`✓ bad input rejected cleanly: ok=${bad.ok}, status=${bad.ok ? "-" : bad.error.status}`);
