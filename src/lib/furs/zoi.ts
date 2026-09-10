import { createHash, createSign } from "node:crypto";

export interface ZoiInput {
  /** Issuer tax number (8 digits). */
  taxNumber: number | string;
  /** Invoice issue datetime, already formatted as `dd-MM-yyyy HH:mm:ss`. */
  issueDateTime: string;
  /** Sequential invoice number. */
  invoiceNumber: string;
  businessPremiseId: string;
  electronicDeviceId: string;
  /** Invoice total amount (string or number, formatted as it appears on the invoice). */
  invoiceAmount: number | string;
}

/**
 * Compute the **ZOI** (Zaščitna oznaka izdajatelja, issuer's protective mark).
 *
 * Per the FURS spec: concatenate the fields, sign with the issuer's private key
 * using **RSA-SHA256 (RSASSA-PKCS#1 v1.5)**, then take the **MD5** of the
 * signature as a 32-char lowercase hex string. PKCS#1 v1.5 (not PSS) → the ZOI
 * is deterministic, matching the spec's worked example and the production-proven
 * reference clients (node-furs, jurgenwerk).
 *
 * `privateKeyPem` is the taxpayer key (see {@link loadP12}).
 */
export function calculateZoi(input: ZoiInput, privateKeyPem: string): string {
  const content =
    `${input.taxNumber}${input.issueDateTime}${input.invoiceNumber}` +
    `${input.businessPremiseId}${input.electronicDeviceId}${input.invoiceAmount}`;

  const signer = createSign("RSA-SHA256");
  signer.update(content, "utf8");
  signer.end();
  const signature = signer.sign(privateKeyPem); // PKCS#1 v1.5 padding (default)

  return createHash("md5").update(signature).digest("hex");
}

/**
 * Build the 60-digit printable verification string for the QR/PDF417/Code128
 * on the invoice. FURS v3.0 section 11 specifies the exact order:
 * zero-padded decimal ZOI (39) + taxpayer number (8) + `YYMMDDHHmmss` (12) +
 * a mod-10 control digit over the preceding 59 digits.
 */
export function zoiToPrintable(zoiHex: string, issueDate: Date, taxNumber: number | string, timeZone?: string): string {
  let value = BigInt(`0x${zoiHex}`).toString(10).padStart(39, "0");
  const taxNumberText = String(taxNumber);
  if (!/^\d{8}$/.test(taxNumberText)) {
    throw new Error("FURS printable payload requires an 8-digit taxpayer number");
  }
  value += taxNumberText;

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timeZone ?? "Europe/Ljubljana",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(issueDate);
  const p = (t: Intl.DateTimeFormatPartTypes) => parts.find((x) => x.type === t)?.value ?? "";
  const hh = p("hour") === "24" ? "00" : p("hour");
  value += `${p("year")}${p("month")}${p("day")}${hh}${p("minute")}${p("second")}`;

  let control = 0;
  for (const ch of value) control += Number(ch);
  value += String(control % 10);

  return value;
}
