import { DEFAULTS, type Invoice, type InvoiceLine, type Party, type TaxBreakdown } from "../invoice/model";

/**
 * Map the fiscalize {@link Invoice} model to the `@e-invoice-eu/core` internal
 * format — a UBL-shaped JSON tree (`ubl:Invoice` with `cbc:`/`cac:` keys and
 * `@attr` siblings). The lib renders this to UBL / CII / Peppol and validates it
 * against EN16931. Element *ordering* is handled by the lib's templates, so keys
 * here are in authoring order, not UBL sequence.
 *
 * Covers the EN16931 core invoice. The long tail (contacts, endpoints, document
 * allowances/charges, line allowances) is deferred — see ROADMAP.md.
 */
export function toEInvoiceInternal(invoice: Invoice): { "ubl:Invoice": Record<string, unknown> } {
  const currency = invoice.currency ?? DEFAULTS.currency;

  const ubl: Record<string, unknown> = {
    "cbc:CustomizationID": "urn:cen.eu:en16931:2017",
    "cbc:ProfileID": "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0",
    "cbc:ID": invoice.invoiceNumber,
    "cbc:IssueDate": invoice.issueDate,
    ...(invoice.dueDate ? { "cbc:DueDate": invoice.dueDate } : {}),
    "cbc:InvoiceTypeCode": invoice.invoiceTypeCode ?? DEFAULTS.invoiceTypeCode,
    ...(invoice.note ? { "cbc:Note": [invoice.note] } : {}),
    "cbc:DocumentCurrencyCode": currency,
    ...(invoice.buyerReference ? { "cbc:BuyerReference": invoice.buyerReference } : {}),
    ...(invoice.orderReference ? { "cac:OrderReference": { "cbc:ID": invoice.orderReference } } : {}),
    "cac:AccountingSupplierParty": { "cac:Party": party(invoice.seller, "supplier") },
    "cac:AccountingCustomerParty": { "cac:Party": party(invoice.buyer, "customer") },
    ...(invoice.deliveryDate
      ? { "cac:Delivery": { "cbc:ActualDeliveryDate": invoice.deliveryDate } }
      : {}),
    "cac:PaymentMeans": [paymentMeans(invoice)],
    "cac:TaxTotal": [taxTotal(invoice, currency)],
    "cac:LegalMonetaryTotal": legalMonetaryTotal(invoice, currency),
    "cac:InvoiceLine": invoice.lines.map((line) => invoiceLine(line, currency)),
  };

  return { "ubl:Invoice": ubl };
}

function party(p: Party, side: "supplier" | "customer"): Record<string, unknown> {
  const endpointId = p.endpointId ?? p.vatId;
  const out: Record<string, unknown> = {};

  // BT-34 / BT-49 — electronic address (mandatory in EN16931/UBL).
  if (endpointId) {
    out["cbc:EndpointID"] = endpointId;
    out["cbc:EndpointID@schemeID"] = p.endpointScheme ?? DEFAULTS.endpointScheme;
  }

  out["cac:PartyName"] = { "cbc:Name": p.name };
  out["cac:PostalAddress"] = {
    ...(p.address.street ? { "cbc:StreetName": p.address.street } : {}),
    "cbc:CityName": p.address.city,
    "cbc:PostalZone": p.address.postalZone,
    "cac:Country": { "cbc:IdentificationCode": p.address.countryCode },
  };

  if (p.vatId) {
    // The internal schema mirrors the EN16931 sample's asymmetry: supplier
    // PartyTaxScheme is an array, customer is a single object.
    const taxScheme = { "cbc:CompanyID": p.vatId, "cac:TaxScheme": { "cbc:ID": "VAT" } };
    out["cac:PartyTaxScheme"] = side === "supplier" ? [taxScheme] : taxScheme;
  }

  out["cac:PartyLegalEntity"] = {
    "cbc:RegistrationName": p.name,
    ...(p.registrationId ? { "cbc:CompanyID": p.registrationId } : {}),
  };

  return out;
}

function paymentMeans(invoice: Invoice): Record<string, unknown> {
  const out: Record<string, unknown> = {
    "cbc:PaymentMeansCode": invoice.paymentMeansCode ?? DEFAULTS.paymentMeansCode,
    "cbc:PaymentID": `Invoice ${invoice.invoiceNumber}`,
  };
  if (invoice.seller.iban) {
    const account: Record<string, unknown> = { "cbc:ID": invoice.seller.iban };
    if (invoice.seller.bankName) account["cbc:Name"] = invoice.seller.bankName;
    if (invoice.seller.bic) {
      account["cac:FinancialInstitutionBranch"] = { "cbc:ID": invoice.seller.bic };
    }
    out["cac:PayeeFinancialAccount"] = account;
  }
  return out;
}

function taxTotal(invoice: Invoice, currency: string): Record<string, unknown> {
  return {
    ...amount("cbc:TaxAmount", invoice.totals.taxAmount, currency),
    "cac:TaxSubtotal": invoice.taxBreakdown.map((t) => taxSubtotal(t, currency)),
  };
}

function taxSubtotal(t: TaxBreakdown, currency: string): Record<string, unknown> {
  const category: Record<string, unknown> = {
    "cbc:ID": t.category ?? DEFAULTS.taxCategory,
    "cbc:Percent": String(t.taxRate),
    ...(t.exemptionReason ? { "cbc:TaxExemptionReason": t.exemptionReason } : {}),
    "cac:TaxScheme": { "cbc:ID": "VAT" },
  };
  return {
    ...amount("cbc:TaxableAmount", t.taxableAmount, currency),
    ...amount("cbc:TaxAmount", t.taxAmount, currency),
    "cac:TaxCategory": category,
  };
}

function legalMonetaryTotal(invoice: Invoice, currency: string): Record<string, unknown> {
  const t = invoice.totals;
  return {
    ...amount("cbc:LineExtensionAmount", t.lineExtensionAmount, currency),
    ...amount("cbc:TaxExclusiveAmount", t.taxExclusiveAmount, currency),
    ...amount("cbc:TaxInclusiveAmount", t.taxInclusiveAmount, currency),
    ...(t.allowanceTotal != null ? amount("cbc:AllowanceTotalAmount", t.allowanceTotal, currency) : {}),
    ...(t.chargeTotal != null ? amount("cbc:ChargeTotalAmount", t.chargeTotal, currency) : {}),
    ...(t.paidAmount != null ? amount("cbc:PrepaidAmount", t.paidAmount, currency) : {}),
    ...(t.roundingAmount != null ? amount("cbc:PayableRoundingAmount", t.roundingAmount, currency) : {}),
    ...amount("cbc:PayableAmount", t.payableAmount ?? t.taxInclusiveAmount, currency),
  };
}

function invoiceLine(line: InvoiceLine, currency: string): Record<string, unknown> {
  return {
    "cbc:ID": line.id,
    "cbc:InvoicedQuantity": String(line.quantity),
    "cbc:InvoicedQuantity@unitCode": line.unitCode ?? DEFAULTS.unitCode,
    ...amount("cbc:LineExtensionAmount", line.lineNetAmount, currency),
    "cac:Item": {
      "cbc:Name": line.name,
      ...(line.description ? { "cbc:Description": line.description } : {}),
      "cac:ClassifiedTaxCategory": {
        "cbc:ID": line.taxCategory ?? DEFAULTS.taxCategory,
        "cbc:Percent": String(line.taxRate),
        "cac:TaxScheme": { "cbc:ID": "VAT" },
      },
    },
    "cac:Price": {
      ...amount("cbc:PriceAmount", line.netPrice, currency),
    },
  };
}

/** Emit a UBL amount as the `{ key, key@currencyID }` pair the internal format uses. */
function amount(key: string, value: number, currency: string): Record<string, string> {
  return {
    [key]: round(value).toFixed(2),
    [`${key}@currencyID`]: currency,
  };
}

function round(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
