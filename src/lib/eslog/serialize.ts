import { create } from "xmlbuilder2";
import { DEFAULTS, type Invoice, type InvoiceLine, type Party, type TaxBreakdown } from "../invoice/model";
import {
  CUX_REFERENCE,
  DEFAULT_UNIT,
  DTM,
  ESLOG_NS,
  FII,
  FTX,
  IMD,
  MOA,
  NAD,
  PRI,
  QTY_INVOICED,
  RFF,
  TAX_FUNCTION,
  TAX_TYPE_VAT,
  XSI_NS,
} from "./codes";

export interface EslogOptions {
  /** Pretty-print with indentation. Default `true`. Set `false` for compact output. */
  pretty?: boolean;
}

/**
 * Serialize a {@link Invoice} to an e-SLOG 2.0 invoice XML string.
 *
 * Pure and synchronous, the input is assumed already structurally valid
 * (run it through `parseInvoice` first). Covers the EN16931 core invoice:
 * header, dates, parties (+ bank + VAT), currency, payment terms, lines,
 * document totals, and the VAT breakdown. See ROADMAP.md for what's deferred.
 */
export function serializeEslog(invoice: Invoice, options: EslogOptions = {}): string {
  const currency = invoice.currency ?? DEFAULTS.currency;
  const typeCode = invoice.invoiceTypeCode ?? DEFAULTS.invoiceTypeCode;

  // M_INVOIC children, built in document order. Repeated segments use arrays.
  const mInvoic: Record<string, unknown> = {
    "@Id": "data",
    S_UNH: {
      D_0062: invoice.invoiceNumber,
      C_S009: { D_0065: "INVOIC", D_0052: "D", D_0054: "01B", D_0051: "UN" },
    },
    S_BGM: {
      C_C002: { D_1001: typeCode },
      C_C106: { D_1004: invoice.invoiceNumber },
    },
    S_DTM: [
      dtmContent(DTM.ISSUE, invoice.issueDate),
      ...(invoice.deliveryDate ? [dtmContent(DTM.DELIVERY, invoice.deliveryDate)] : []),
    ],
  };

  if (invoice.note) {
    mInvoic.S_FTX = [{ D_4451: FTX.GENERAL_INFO, C_C108: { D_4440: invoice.note } }];
  }

  if (invoice.orderReference) {
    mInvoic.G_SG1 = [{ S_RFF: { C_C506: { D_1153: RFF.ORDER, D_1154: invoice.orderReference } } }];
  }

  // EN16931 / e-SLOG order parties buyer-first (matches the reference generator).
  mInvoic.G_SG2 = [
    partyGroup(invoice.buyer, NAD.BUYER, FII.BENEFICIARY_BANK),
    partyGroup(invoice.seller, NAD.SELLER, FII.PAYEE_BANK),
  ];

  mInvoic.G_SG7 = { S_CUX: { C_C504: { D_6347: CUX_REFERENCE, D_6345: currency } } };

  mInvoic.G_SG8 = paymentTerms(invoice);

  mInvoic.G_SG26 = invoice.lines.map(lineGroup);

  mInvoic.G_SG50 = summaryAmounts(invoice).map(([code, amount]) => ({
    S_MOA: { C_C516: { D_5025: code, D_5004: money(amount) } },
  }));

  mInvoic.G_SG52 = invoice.taxBreakdown.map((t) =>
    taxGroup(t.taxRate, t.category ?? DEFAULTS.taxCategory, t.taxAmount, t.taxableAmount),
  );

  const doc = create(
    { version: "1.0", encoding: "UTF-8" },
    {
      Invoice: {
        "@xmlns": ESLOG_NS,
        "@xmlns:xsi": XSI_NS,
        M_INVOIC: mInvoic,
      },
    },
  );

  return doc.end({ prettyPrint: options.pretty ?? true });
}

// ── Builders ──────────────────────────────────────────────────────────────────

function dtmContent(code: string, date: string) {
  return { C_C507: { D_2005: code, D_2380: date } };
}

function partyGroup(party: Party, qualifier: string, bankQualifier: string): Record<string, unknown> {
  const nad: Record<string, unknown> = {
    D_3035: qualifier,
    C_C080: { D_3036: party.name },
  };
  if (party.address.street) nad.C_C059 = { D_3042: party.address.street };
  nad.D_3164 = party.address.city;
  if (party.address.countryName) nad.C_C819 = { D_3228: party.address.countryName };
  nad.D_3251 = party.address.postalZone;
  nad.D_3207 = party.address.countryCode;

  const group: Record<string, unknown> = { S_NAD: nad };

  if (party.iban) {
    const c078: Record<string, unknown> = { D_3194: party.iban };
    if (party.bankName) c078.D_3192 = party.bankName;
    const fii: Record<string, unknown> = { D_3035: bankQualifier, C_C078: c078 };
    if (party.bic) fii.C_C088 = { D_3433: party.bic };
    group.S_FII = fii;
  }

  if (party.vatId) {
    group.G_SG3 = { S_RFF: { C_C506: { D_1153: RFF.VAT, D_1154: party.vatId } } };
  }

  return group;
}

function paymentTerms(invoice: Invoice): Record<string, unknown> {
  const terms: Record<string, unknown> = { S_PAT: { D_4279: "1" } };
  if (invoice.dueDate) terms.S_DTM = dtmContent(DTM.DUE, invoice.dueDate);
  terms.S_PAI = { C_C534: { D_4461: invoice.paymentMeansCode ?? DEFAULTS.paymentMeansCode } };
  return terms;
}

function lineGroup(line: InvoiceLine): Record<string, unknown> {
  const unit = line.unitCode ?? DEFAULT_UNIT;
  const gross = line.grossPrice ?? line.netPrice;
  const category = line.taxCategory ?? DEFAULTS.taxCategory;
  const lineTax = round(line.lineNetAmount * (line.taxRate / 100));
  const lineWithTax = round(line.lineNetAmount + lineTax);

  const imd: Array<Record<string, unknown>> = [
    { D_7077: IMD.ITEM_NAME, C_C273: { D_7008: clamp(line.name, 35) } },
  ];
  if (line.description) {
    imd.push({ D_7077: IMD.DESCRIPTION, C_C273: { D_7008: clamp(line.description, 256) } });
  }

  return {
    S_LIN: { D_1082: line.id },
    S_IMD: imd,
    S_QTY: { C_C186: { D_6063: QTY_INVOICED, D_6060: num(line.quantity), D_6411: unit } },
    G_SG27: [
      { S_MOA: { C_C516: { D_5025: MOA.LINE_AMOUNT_WITH_TAX, D_5004: money(lineWithTax) } } },
      { S_MOA: { C_C516: { D_5025: MOA.LINE_NET_AMOUNT, D_5004: money(line.lineNetAmount) } } },
    ],
    G_SG29: [
      { S_PRI: { C_C509: { D_5125: PRI.NET, D_5118: money(line.netPrice), D_5284: "1", D_6411: DEFAULT_UNIT } } },
      { S_PRI: { C_C509: { D_5125: PRI.GROSS, D_5118: money(gross), D_5284: "1", D_6411: DEFAULT_UNIT } } },
    ],
    G_SG34: taxGroup(line.taxRate, category, lineTax, line.lineNetAmount),
  };
}

/** S_TAX + the two S_MOA (tax amount, taxable base), shared by line (G_SG34) and summary (G_SG52). */
function taxGroup(rate: number, category: string, taxAmount: number, baseAmount: number): Record<string, unknown> {
  return {
    S_TAX: {
      D_5283: TAX_FUNCTION,
      C_C241: { D_5153: TAX_TYPE_VAT },
      C_C243: { D_5278: num(rate) },
      D_5305: category,
    },
    S_MOA: [
      { C_C516: { D_5025: MOA.TAX_AMOUNT, D_5004: money(taxAmount) } },
      { C_C516: { D_5025: MOA.TAXABLE_AMOUNT, D_5004: money(baseAmount) } },
    ],
  };
}

function summaryAmounts(invoice: Invoice): Array<[string, number]> {
  const t = invoice.totals;
  const out: Array<[string, number]> = [
    [MOA.SUM_LINE_NET, t.lineExtensionAmount],
    [MOA.ALLOWANCES_TOTAL, t.allowanceTotal ?? 0],
    [MOA.CHARGES_TOTAL, t.chargeTotal ?? 0],
    [MOA.TAX_EXCLUSIVE, t.taxExclusiveAmount],
    [MOA.TAX_TOTAL, t.taxAmount],
    [MOA.TAX_INCLUSIVE, t.taxInclusiveAmount],
  ];
  if (t.paidAmount) out.push([MOA.PAID, t.paidAmount]);
  if (t.roundingAmount) out.push([MOA.ROUNDING, t.roundingAmount]);
  out.push([MOA.PAYABLE, t.payableAmount ?? t.taxInclusiveAmount]);
  return out;
}

// ── Number / text formatting ────────────────────────────────────────────────

/** Round to 2 decimals, float-safe. */
function round(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Money → 2-decimal string with dot separator (e-SLOG requires `.`). */
function money(n: number): string {
  return round(n).toFixed(2);
}

/** Generic number → minimal decimal string (no forced trailing zeros). */
function num(n: number): string {
  return String(round(n));
}

/** e-SLOG limits some text fields; clamp defensively. */
function clamp(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s;
}
