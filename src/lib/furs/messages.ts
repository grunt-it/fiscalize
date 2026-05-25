import * as v from "valibot";

// ── VAT line within TaxesPerSeller ──────────────────────────────────────────
export const FursVat = v.object({
  /** VAT rate, percent. */
  taxRate: v.number(),
  /** Net base for this rate. */
  taxableAmount: v.number(),
  /** VAT amount for this rate. */
  taxAmount: v.number(),
});
export type FursVat = v.InferOutput<typeof FursVat>;

/** Numbering structure: per-device (`B`) or central (`C`). */
export const NumberingStructure = v.picklist(["B", "C"]);

// ── Invoice (fiscal verification, cash-register receipt — not the e-invoice) ──
export const FursInvoice = v.object({
  /** Issuer tax number (8 digits). */
  taxNumber: v.pipe(v.number(), v.integer()),
  /** Invoice issue instant. */
  issueDateTime: v.date(),
  /** Sequential invoice number (the per-premise/device counter). */
  invoiceNumber: v.pipe(v.string(), v.minLength(1)),
  businessPremiseId: v.pipe(v.string(), v.minLength(1)),
  electronicDeviceId: v.pipe(v.string(), v.minLength(1)),
  numberingStructure: v.optional(NumberingStructure),
  /** Invoice total (gross). */
  invoiceAmount: v.number(),
  /** Amount paid; defaults to invoiceAmount. */
  paymentAmount: v.optional(v.number()),
  /** Tax number of the operator (cashier) who issued the invoice. */
  operatorTaxNumber: v.optional(v.pipe(v.number(), v.integer())),
  /** VAT breakdown by rate. */
  vat: v.array(FursVat),
});
export type FursInvoice = v.InferOutput<typeof FursInvoice>;

// ── Business premise registration (immovable) ────────────────────────────────
export const FursBusinessPremise = v.object({
  taxNumber: v.pipe(v.number(), v.integer()),
  premiseId: v.pipe(v.string(), v.minLength(1)),
  cadastralNumber: v.pipe(v.number(), v.integer()),
  buildingNumber: v.pipe(v.number(), v.integer()),
  buildingSectionNumber: v.pipe(v.number(), v.integer()),
  street: v.string(),
  houseNumber: v.string(),
  houseNumberAdditional: v.optional(v.string()),
  community: v.string(),
  city: v.string(),
  postalCode: v.string(),
  /** Date the premise started issuing invoices. */
  validityDate: v.date(),
  softwareSupplierTaxNumber: v.optional(v.pipe(v.number(), v.integer())),
  foreignSoftwareSupplierName: v.optional(v.string()),
  specialNotes: v.optional(v.string()),
});
export type FursBusinessPremise = v.InferOutput<typeof FursBusinessPremise>;

// ── Builders ─────────────────────────────────────────────────────────────────

function header(messageId: string, dateTimeIso: string) {
  return { MessageID: messageId, DateTime: dateTimeIso };
}

export function buildInvoiceRequest(
  invoice: FursInvoice,
  opts: { zoi: string; issueIso: string; messageId: string; headerIso: string },
): Record<string, unknown> {
  return {
    InvoiceRequest: {
      Header: header(opts.messageId, opts.headerIso),
      Invoice: {
        TaxNumber: invoice.taxNumber,
        IssueDateTime: opts.issueIso,
        NumberingStructure: invoice.numberingStructure ?? "B",
        InvoiceIdentifier: {
          BusinessPremiseID: invoice.businessPremiseId,
          ElectronicDeviceID: invoice.electronicDeviceId,
          InvoiceNumber: invoice.invoiceNumber,
        },
        InvoiceAmount: invoice.invoiceAmount,
        PaymentAmount: invoice.paymentAmount ?? invoice.invoiceAmount,
        TaxesPerSeller: [
          {
            VAT: invoice.vat.map((x) => ({
              TaxRate: x.taxRate,
              TaxableAmount: x.taxableAmount,
              TaxAmount: x.taxAmount,
            })),
          },
        ],
        ...(invoice.operatorTaxNumber != null ? { OperatorTaxNumber: invoice.operatorTaxNumber } : {}),
        ProtectedID: opts.zoi,
      },
    },
  };
}

export function buildBusinessPremiseRequest(
  premise: FursBusinessPremise,
  opts: { messageId: string; headerIso: string; validityDateYmd: string },
): Record<string, unknown> {
  const address: Record<string, unknown> = {
    Street: premise.street,
    HouseNumber: premise.houseNumber,
    Community: premise.community,
    City: premise.city,
    PostalCode: premise.postalCode,
  };
  if (premise.houseNumberAdditional) address.HouseNumberAdditional = premise.houseNumberAdditional;

  return {
    BusinessPremiseRequest: {
      Header: header(opts.messageId, opts.headerIso),
      BusinessPremise: {
        TaxNumber: premise.taxNumber,
        BusinessPremiseID: premise.premiseId,
        BPIdentifier: {
          RealEstateBP: {
            PropertyID: {
              CadastralNumber: premise.cadastralNumber,
              BuildingNumber: premise.buildingNumber,
              BuildingSectionNumber: premise.buildingSectionNumber,
            },
            Address: address,
          },
        },
        ValidityDate: opts.validityDateYmd,
        SoftwareSupplier: [
          premise.softwareSupplierTaxNumber != null
            ? { TaxNumber: premise.softwareSupplierTaxNumber }
            : { NameForeign: premise.foreignSoftwareSupplierName ?? "" },
        ],
        SpecialNotes: premise.specialNotes ?? "",
      },
    },
  };
}
