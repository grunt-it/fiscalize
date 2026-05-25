import * as v from "valibot";

/**
 * The fiscalize public invoice model — a clean, EN16931-aligned *core invoice*.
 *
 * This is the single input type consumers construct. It is deliberately
 * decoupled from any output syntax: the same model serializes to e-SLOG 2.0
 * (Slovenian) and, via `@e-invoice-eu/core`, to UBL / CII / Peppol.
 *
 * Fields are annotated with their EN16931 Business Term (BT) / Business Group
 * (BG) so the mapping to each syntax stays auditable as the standard evolves.
 *
 * Scope (P1): the mandatory + common core. Document-level allowances/charges,
 * line-level allowances, contacts, multiple payment means, and the long tail of
 * optional BTs are intentionally out — see ROADMAP.md.
 */

// ── Code lists ──────────────────────────────────────────────────────────────

/** EN16931 VAT category code (UNCL5305 subset). */
export const TaxCategoryCode = v.picklist(
  ["S", "Z", "E", "AE", "K", "G", "O", "L", "M"],
  "Invalid VAT category code (expected one of S, Z, E, AE, K, G, O, L, M).",
);
export type TaxCategoryCode = v.InferOutput<typeof TaxCategoryCode>;

/** ISO 8601 calendar date, `YYYY-MM-DD`. */
const IsoDate = v.pipe(
  v.string(),
  v.regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be ISO 8601 YYYY-MM-DD."),
);

/** ISO 3166-1 alpha-2 country code, e.g. `SI`. */
const CountryCode = v.pipe(
  v.string(),
  v.regex(/^[A-Z]{2}$/, "Country code must be ISO 3166-1 alpha-2 (two uppercase letters)."),
);

/** ISO 4217 currency code, e.g. `EUR`. */
const CurrencyCode = v.pipe(
  v.string(),
  v.regex(/^[A-Z]{3}$/, "Currency code must be ISO 4217 (three uppercase letters)."),
);

const NonEmpty = v.pipe(v.string(), v.minLength(1));
const Money = v.number(); // amounts in the invoice currency; rounding handled at serialization

// ── Sub-objects ───────────────────────────────────────────────────────────────

export const PostalAddress = v.object({
  /** BT-35 / BT-50 — address line. */
  street: v.optional(v.string()),
  /** BT-37 / BT-52 — city. */
  city: NonEmpty,
  /** BT-38 / BT-53 — post code. */
  postalZone: NonEmpty,
  /** BT-40 / BT-55 — country code (ISO 3166-1 alpha-2). */
  countryCode: CountryCode,
  /** Display name of the country (non-EN16931, used by e-SLOG NAD). */
  countryName: v.optional(v.string()),
});
export type PostalAddress = v.InferOutput<typeof PostalAddress>;

/** Seller (BG-4/BG-5) or Buyer (BG-7/BG-8). */
export const Party = v.object({
  /** BT-27 (seller) / BT-44 (buyer) — registered legal name. */
  name: NonEmpty,
  /** BT-31 (seller) / BT-48 (buyer) — VAT identifier, e.g. `SI12345678`. */
  vatId: v.optional(v.string()),
  /**
   * BT-34 (seller) / BT-49 (buyer) — electronic address (Peppol endpoint).
   * Mandatory for EN16931/UBL output; defaults to {@link Party.vatId} when omitted.
   */
  endpointId: v.optional(v.string()),
  /**
   * BT-34-1 / BT-49-1 — electronic address scheme (Peppol EAS code). Defaults to
   * `9949` (Slovenia VAT). Cross-border senders must set their country's EAS code.
   */
  endpointScheme: v.optional(v.string()),
  /** BT-30 (seller) / BT-47 (buyer) — legal registration identifier. */
  registrationId: v.optional(v.string()),
  address: PostalAddress,
  /** BT-84 — payment account identifier (IBAN). Seller-side; used for e-SLOG FII. */
  iban: v.optional(v.string()),
  /** BT-86 — payment service provider identifier (BIC/SWIFT). */
  bic: v.optional(v.string()),
  /** Account holder / bank name (non-EN16931, used by e-SLOG FII). */
  bankName: v.optional(v.string()),
});
export type Party = v.InferOutput<typeof Party>;

/** Invoice line (BG-25). */
export const InvoiceLine = v.object({
  /** BT-126 — invoice line identifier. */
  id: NonEmpty,
  /** BT-153 — item name. */
  name: NonEmpty,
  /** BT-154 — item description. */
  description: v.optional(v.string()),
  /** BT-129 — invoiced quantity. */
  quantity: v.number(),
  /** BT-130 — unit of measure code (UN/ECE Rec 20), default `C62` (unit). */
  unitCode: v.optional(NonEmpty),
  /** BT-146 — item net price (per unit, after item discount). */
  netPrice: Money,
  /** BT-148 — item gross price (per unit, before item discount). Defaults to net. */
  grossPrice: v.optional(Money),
  /** BT-131 — invoice line net amount. */
  lineNetAmount: Money,
  /** BT-152 — invoiced item VAT rate (percent). */
  taxRate: v.number(),
  /** BT-151 — invoiced item VAT category code. Default `S`. */
  taxCategory: v.optional(TaxCategoryCode),
});
export type InvoiceLine = v.InferOutput<typeof InvoiceLine>;

/** VAT breakdown entry (BG-23) — one per (category, rate). */
export const TaxBreakdown = v.object({
  /** BT-116 — VAT category taxable amount. */
  taxableAmount: Money,
  /** BT-117 — VAT category tax amount. */
  taxAmount: Money,
  /** BT-119 — VAT category rate (percent). */
  taxRate: v.number(),
  /** BT-118 — VAT category code. Default `S`. */
  category: v.optional(TaxCategoryCode),
  /** BT-120 — VAT exemption reason text (for E/AE/K/G/O categories). */
  exemptionReason: v.optional(v.string()),
});
export type TaxBreakdown = v.InferOutput<typeof TaxBreakdown>;

/** Document totals (BG-22). */
export const Totals = v.object({
  /** BT-106 — sum of invoice line net amounts. */
  lineExtensionAmount: Money,
  /** BT-107 — sum of allowances on document level. */
  allowanceTotal: v.optional(Money),
  /** BT-108 — sum of charges on document level. */
  chargeTotal: v.optional(Money),
  /** BT-109 — invoice total amount without VAT. */
  taxExclusiveAmount: Money,
  /** BT-110 — invoice total VAT amount. */
  taxAmount: Money,
  /** BT-112 — invoice total amount with VAT. */
  taxInclusiveAmount: Money,
  /** BT-113 — paid amount. */
  paidAmount: v.optional(Money),
  /** BT-114 — rounding amount. */
  roundingAmount: v.optional(Money),
  /** BT-115 — amount due for payment. Defaults to `taxInclusiveAmount`. */
  payableAmount: v.optional(Money),
});
export type Totals = v.InferOutput<typeof Totals>;

// ── Invoice ───────────────────────────────────────────────────────────────────

export const Invoice = v.object({
  /** BT-1 — invoice number. */
  invoiceNumber: NonEmpty,
  /** BT-2 — invoice issue date. */
  issueDate: IsoDate,
  /** BT-3 — invoice type code (UNCL1001). Default `380` (commercial invoice). */
  invoiceTypeCode: v.optional(NonEmpty),
  /** BT-5 — invoice currency code. Default `EUR`. */
  currency: v.optional(CurrencyCode),
  /** BT-9 — payment due date. */
  dueDate: v.optional(IsoDate),
  /** BT-72 — actual delivery date. */
  deliveryDate: v.optional(IsoDate),
  /** BT-10 — buyer reference. */
  buyerReference: v.optional(v.string()),
  /** BT-13 — purchase order reference. */
  orderReference: v.optional(v.string()),
  /** BT-22 — invoice note. */
  note: v.optional(v.string()),
  /** BT-81 — payment means code (UNCL4461). Default `30` (credit transfer). */
  paymentMeansCode: v.optional(NonEmpty),
  seller: Party,
  buyer: Party,
  lines: v.pipe(v.array(InvoiceLine), v.minLength(1, "An invoice needs at least one line.")),
  taxBreakdown: v.pipe(
    v.array(TaxBreakdown),
    v.minLength(1, "An invoice needs at least one VAT breakdown entry."),
  ),
  totals: Totals,
});
export type Invoice = v.InferOutput<typeof Invoice>;
/** Input form (before defaults/transforms) — what a caller passes in. */
export type InvoiceInput = v.InferInput<typeof Invoice>;

export const DEFAULTS = {
  invoiceTypeCode: "380",
  currency: "EUR",
  unitCode: "C62",
  taxCategory: "S" as TaxCategoryCode,
  paymentMeansCode: "30",
  /** Peppol EAS code for Slovenia VAT — the default electronic-address scheme. */
  endpointScheme: "9949",
} as const;
