import type { Invoice } from "../lib/invoice/model";

/**
 * A realistic Slovenian B2B invoice: two lines at the SI standard (22%) and
 * reduced (9.5%) VAT rates, with totals that satisfy the EN16931 arithmetic
 * (BR-CO / BR-S) rules.
 *
 *   line 1: 10 × 5.00 = 50.00 net, 22%   → 11.00 VAT
 *   line 2:  2 × 20.00 = 40.00 net, 9.5% →  3.80 VAT
 *   net 90.00, VAT 14.80, gross 104.80
 */
export function sampleInvoice(): Invoice {
  return {
    invoiceNumber: "2026-000123",
    issueDate: "2026-05-25",
    dueDate: "2026-06-08",
    deliveryDate: "2026-05-25",
    currency: "EUR",
    orderReference: "NAR-2026-77",
    note: "Plačilo z navedbo sklica na številko računa.",
    seller: {
      name: "Zelena Japka d.o.o.",
      vatId: "SI12345678",
      registrationId: "8765432000",
      address: {
        street: "Slovenska cesta 1",
        city: "Ljubljana",
        postalZone: "1000",
        countryCode: "SI",
        countryName: "Slovenija",
      },
      iban: "SI56020170014356205",
      bic: "LJBASI2X",
      bankName: "NLB d.d.",
    },
    buyer: {
      name: "Kupec d.o.o.",
      vatId: "SI87654321",
      address: {
        street: "Dunajska cesta 100",
        city: "Ljubljana",
        postalZone: "1000",
        countryCode: "SI",
      },
    },
    lines: [
      {
        id: "1",
        name: "Ekološka detergent koncentrat 1L",
        quantity: 10,
        unitCode: "H87",
        netPrice: 5.0,
        lineNetAmount: 50.0,
        taxRate: 22,
        taxCategory: "S",
      },
      {
        id: "2",
        name: "Naravno milo 100g",
        quantity: 2,
        netPrice: 20.0,
        lineNetAmount: 40.0,
        taxRate: 9.5,
        taxCategory: "S",
      },
    ],
    taxBreakdown: [
      { taxableAmount: 50.0, taxAmount: 11.0, taxRate: 22, category: "S" },
      { taxableAmount: 40.0, taxAmount: 3.8, taxRate: 9.5, category: "S" },
    ],
    totals: {
      lineExtensionAmount: 90.0,
      taxExclusiveAmount: 90.0,
      taxAmount: 14.8,
      taxInclusiveAmount: 104.8,
      payableAmount: 104.8,
    },
  };
}
