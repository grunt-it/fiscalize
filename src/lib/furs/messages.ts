import { formatFursDateTime } from "./datetime";
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

/**
 * An invoice this one changes, by identifier and issue instant.
 *
 * FURS links a correction to its original by identifier, never by EOR, so a
 * correction may reference an invoice that has not been confirmed yet. That is
 * what makes an offline void or refund of an offline sale expressible.
 */
export const FursReferenceInvoice = v.object({
  businessPremiseId: v.pipe(v.string(), v.minLength(1)),
  electronicDeviceId: v.pipe(v.string(), v.minLength(1)),
  invoiceNumber: v.pipe(v.string(), v.minLength(1)),
  /** Issue instant of the referenced invoice, formatted like any other. */
  issueDateTime: v.date(),
});
export type FursReferenceInvoice = v.InferOutput<typeof FursReferenceInvoice>;

// ── Invoice (fiscal verification, cash-register receipt, not the e-invoice) ──
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
  /**
   * Value of supplies on the invoice that VAT law does not tax, after discount
   * (spec row R_3.9.7). A multi-purpose gift voucher is the case that forces
   * this: at issue nobody knows which rate the holder will eventually redeem
   * at, so the sale carries no VAT, yet the money is taken and must appear in
   * `invoiceAmount`. Without this field the invoice total and the VAT lines
   * disagree by the voucher's value and the difference is unexplained.
   *
   * Reported inside `TaxesPerSeller`, so it belongs to the same seller as the
   * VAT breakdown it sits beside. Omit it when the invoice has no such supply.
   */
  nontaxableAmount: v.optional(v.number()),
  /**
   * True when this invoice was issued without an EOR because the connection to
   * the tax authority was down, and is now being submitted after the fact
   * (ZDavPR article 9). Omitted or false for an ordinary live submission.
   */
  subsequentSubmit: v.optional(v.boolean()),
  /**
   * Invoices this one changes. Required by ZDavPR article 6 for any subsequent
   * change to reported invoice data: a storno, credit note or correction MUST
   * name the invoice it changes, or the tax authority records an unrelated
   * document. The schema permits up to 1000, so one correction may settle
   * several originals.
   */
  referenceInvoice: v.optional(v.pipe(v.array(FursReferenceInvoice), v.maxLength(1000))),
});
export type FursInvoice = v.InferOutput<typeof FursInvoice>;

// ── Business premise registration ────────────────────────────────────────────
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
export const FursMovableBusinessPremise = v.object({
  taxNumber: v.pipe(v.number(), v.integer()),
  premiseId: v.pipe(v.string(), v.minLength(1)),
  premiseType: v.picklist(["A", "B", "C"]),
  /** Date the premise started issuing invoices. */
  validityDate: v.date(),
  softwareSupplierTaxNumber: v.optional(v.pipe(v.number(), v.integer())),
  foreignSoftwareSupplierName: v.optional(v.string()),
  specialNotes: v.optional(v.string()),
});
export type FursMovableBusinessPremise = v.InferOutput<typeof FursMovableBusinessPremise>;

export const FursPremiseRegistration = v.union([FursBusinessPremise, FursMovableBusinessPremise]);
export type FursPremiseRegistration = v.InferOutput<typeof FursPremiseRegistration>;

export function isFursMovableBusinessPremise(
  premise: FursPremiseRegistration,
): premise is FursMovableBusinessPremise {
  return "premiseType" in premise;
}

// ── Builders ─────────────────────────────────────────────────────────────────

function header(messageId: string, dateTimeIso: string) {
  return { MessageID: messageId, DateTime: dateTimeIso };
}

export function buildInvoiceRequest(
  invoice: FursInvoice,
  opts: {
    zoi: string;
    issueIso: string;
    messageId: string;
    headerIso: string;
    /**
     * Formats referenced invoices' issue instants. The same zone the caller
     * used for `issueIso`, so a correction and its original cannot disagree
     * about wall-clock time.
     */
    timeZone?: string;
  },
): Record<string, unknown> {
  return {
    InvoiceRequest: {
      Header: header(opts.messageId, opts.headerIso),
      // Key order follows the XSD sequence for InvoiceType. The wire format is
      // JSON so order is not validated, but a reader comparing this against the
      // published schema should not have to reorder it in their head.
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
            // XSD sequence inside TaxesPerSeller puts OtherTaxesAmount,
            // ExemptVATTaxableAmount and ReverseVATTaxableAmount between VAT
            // and NontaxableAmount. None is emitted, so this follows VAT
            // directly and the order still reads against the published schema.
            ...(invoice.nontaxableAmount != null
              ? { NontaxableAmount: invoice.nontaxableAmount }
              : {}),
          },
        ],
        ...(invoice.operatorTaxNumber != null ? { OperatorTaxNumber: invoice.operatorTaxNumber } : {}),
        ProtectedID: opts.zoi,
        ...(invoice.subsequentSubmit != null ? { SubsequentSubmit: invoice.subsequentSubmit } : {}),
        ...(invoice.referenceInvoice?.length
          ? {
              ReferenceInvoice: invoice.referenceInvoice.map((reference) => ({
                ReferenceInvoiceIdentifier: {
                  BusinessPremiseID: reference.businessPremiseId,
                  ElectronicDeviceID: reference.electronicDeviceId,
                  InvoiceNumber: reference.invoiceNumber,
                },
                ReferenceInvoiceIssueDateTime: formatFursDateTime(
                  reference.issueDateTime,
                  opts.timeZone,
                ).iso,
              })),
            }
          : {}),
      },
    },
  };
}

export function buildBusinessPremiseRequest(
  premise: FursPremiseRegistration,
  opts: { messageId: string; headerIso: string; validityDateYmd: string },
): Record<string, unknown> {
  const bpIdentifier: Record<string, unknown> = isFursMovableBusinessPremise(premise)
    ? { PremiseType: premise.premiseType }
    : (() => {
        const address: Record<string, unknown> = {
          Street: premise.street,
          HouseNumber: premise.houseNumber,
          Community: premise.community,
          City: premise.city,
          PostalCode: premise.postalCode,
        };
        if (premise.houseNumberAdditional) address.HouseNumberAdditional = premise.houseNumberAdditional;

        return {
          RealEstateBP: {
            PropertyID: {
              CadastralNumber: premise.cadastralNumber,
              BuildingNumber: premise.buildingNumber,
              BuildingSectionNumber: premise.buildingSectionNumber,
            },
            Address: address,
          },
        };
      })();

  return {
    BusinessPremiseRequest: {
      Header: header(opts.messageId, opts.headerIso),
      BusinessPremise: {
        TaxNumber: premise.taxNumber,
        BusinessPremiseID: premise.premiseId,
        BPIdentifier: bpIdentifier,
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
