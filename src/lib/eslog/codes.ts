/**
 * e-SLOG 2.0 is a Slovenian national e-invoice syntax: UN/EDIFACT INVOIC mapped
 * into XML (namespace `urn:eslog:2.00`), semantically EN16931-compliant. Elements
 * are EDIFACT segment (`S_*`) / group (`G_SG*`) / composite (`C_*`) / data-element
 * (`D_*`) codes; the *values* of qualifier data-elements come from UN/EDIFACT code
 * lists. These constants name the qualifiers this serializer emits, mapped to the
 * EN16931 Business Term they carry.
 *
 * Grounded in: the official e-SLOG 2.0 spec (epos.si) and the MIT-licensed
 * reference generator Media24si/eslog2 (structure cross-checked against its
 * sample `inv.xml`).
 */

/** Document name code — S_BGM/C_C002/D_1001 (UNCL1001). */
export const DOC_TYPE = {
  INVOICE: "380",
  CREDIT_NOTE: "381",
  CORRECTED_INVOICE: "384",
  PREPAYMENT_INVOICE: "386",
} as const;

/** Date/time qualifier — S_DTM/C_C507/D_2005 (UNCL2005). */
export const DTM = {
  ISSUE: "137", // BT-2 document/message date
  DELIVERY: "35", // BT-72 actual delivery date
  DUE: "13", // BT-9 payment due date (within G_SG8)
} as const;

/** Monetary amount qualifier — S_MOA/C_C516/D_5025 (UNCL5025). */
export const MOA = {
  LINE_AMOUNT_WITH_TAX: "38", // line amount incl. VAT (e-SLOG national, NBT-031)
  LINE_NET_AMOUNT: "203", // BT-131 invoice line net amount
  TAX_AMOUNT: "124", // VAT amount of a tax category / line
  TAXABLE_AMOUNT: "125", // VAT category taxable base
  SUM_LINE_NET: "79", // BT-106 sum of invoice line net amounts
  ALLOWANCES_TOTAL: "260", // BT-107 sum of document allowances
  CHARGES_TOTAL: "259", // BT-108 sum of document charges
  TAX_EXCLUSIVE: "389", // BT-109 invoice total without VAT
  TAX_TOTAL: "176", // BT-110 invoice total VAT amount
  TAX_INCLUSIVE: "388", // BT-112 invoice total with VAT
  PAID: "113", // BT-113 paid (prepaid) amount
  ROUNDING: "366", // BT-114 rounding amount
  PAYABLE: "9", // BT-115 amount due for payment
  ITEM_DISCOUNT: "509", // BT-147 item price discount
} as const;

/** Price qualifier — S_PRI/C_C509/D_5125 (UNCL5125). */
export const PRI = {
  NET: "AAA", // BT-146 item net price
  GROSS: "AAB", // BT-148 item gross price
} as const;

/** Party function qualifier — S_NAD/D_3035 (UNCL3035). */
export const NAD = {
  BUYER: "BY", // BG-7 buyer
  SELLER: "SE", // BG-4 seller
} as const;

/** Financial-institution qualifier — S_FII/D_3035 (UNCL3035). */
export const FII = {
  PAYEE_BANK: "RB", // seller's account (where payment is made)
  BENEFICIARY_BANK: "BB",
} as const;

/** Reference qualifier — S_RFF/C_C506/D_1153 (UNCL1153). */
export const RFF = {
  VAT: "VA", // BT-31 / BT-48 VAT identifier
  ORDER: "ON", // BT-13 purchase order reference
} as const;

/** Free-text subject qualifier — S_FTX/D_4451 (UNCL4451). */
export const FTX = {
  GENERAL_INFO: "AAI", // BT-22 invoice note
} as const;

/** Item description type — S_IMD/D_7077 (UNCL7077). */
export const IMD = {
  ITEM_NAME: "F", // BT-153 (free-form short)
  DESCRIPTION: "A", // BT-154
} as const;

/** Quantity qualifier — S_QTY/C_C186/D_6063 (UNCL6063). */
export const QTY_INVOICED = "47"; // BT-129 invoiced quantity

/** Duty/tax/fee function qualifier — S_TAX/D_5283 (UNCL5283). 7 = tax. */
export const TAX_FUNCTION = "7";
/** Duty/tax/fee type — S_TAX/C_C241/D_5153. */
export const TAX_TYPE_VAT = "VAT";

/** Currency usage qualifier — S_CUX/C_C504/D_6347 (UNCL6347). 2 = reference currency. */
export const CUX_REFERENCE = "2";

/** Default unit of measure — S_QTY/D_6411, S_PRI/D_6411 (UN/ECE Rec 20). C62 = unit. */
export const DEFAULT_UNIT = "C62";

/** Namespaces of the e-SLOG 2.0 invoice document. */
export const ESLOG_NS = "urn:eslog:2.00";
export const XSI_NS = "http://www.w3.org/2001/XMLSchema-instance";
