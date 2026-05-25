import { Effect } from "effect";
import forge from "node-forge";
import { FursCertError } from "./errors";

/**
 * A loaded FURS signing certificate: the RSA private key (PEM) plus the
 * identity fields FURS matches the JWS against.
 */
export interface FursCert {
  /** RSA private key, PKCS#1 PEM — used for ZOI + JWS signing. */
  privateKeyPem: string;
  /** Certificate, PEM — used as the mutual-TLS client certificate. */
  certPem: string;
  /** Subject DN as `CN=…,O=…,…` (comma-joined RDNs), for the JWS header. */
  subjectName: string;
  /** Issuer DN, same format. */
  issuerName: string;
  /** Certificate serial number as an exact decimal string (may exceed 2^53). */
  serial: string;
}

/**
 * Load a taxpayer PKCS#12 (.p12/.pfx) — as issued by FURS (test) or eDavki
 * (production) — and extract the signing key + identity. Fails with
 * `FursCertError` (e.g. wrong passphrase, no key in the bundle).
 */
export const loadP12 = Effect.fn("loadP12")(function* (p12: Uint8Array, passphrase: string) {
  return yield* Effect.try({
    try: (): FursCert => parseP12(p12, passphrase),
    catch: (cause) => new FursCertError("Failed to load PKCS#12 certificate", cause),
  });
});

function parseP12(p12: Uint8Array, passphrase: string): FursCert {
  const oids = forge.pki.oids;
  const shroudedKeyBagOid = oids.pkcs8ShroudedKeyBag as string;
  const keyBagOid = oids.keyBag as string;
  const certBagOid = oids.certBag as string;

  const der = forge.util.createBuffer(toBinaryString(p12));
  const asn1 = forge.asn1.fromDer(der);
  const p12obj = forge.pkcs12.pkcs12FromAsn1(asn1, passphrase);

  const keyBag =
    p12obj.getBags({ bagType: shroudedKeyBagOid })[shroudedKeyBagOid]?.[0] ??
    p12obj.getBags({ bagType: keyBagOid })[keyBagOid]?.[0];
  const certBag = p12obj.getBags({ bagType: certBagOid })[certBagOid]?.[0];

  if (!keyBag?.key) throw new Error("no private key in PKCS#12 bundle");
  if (!certBag?.cert) throw new Error("no certificate in PKCS#12 bundle");

  const cert = certBag.cert;
  return {
    privateKeyPem: forge.pki.privateKeyToPem(keyBag.key),
    certPem: forge.pki.certificateToPem(cert),
    subjectName: formatDn(cert.subject.attributes),
    issuerName: formatDn(cert.issuer.attributes),
    serial: hexToDecimalString(cert.serialNumber),
  };
}

/** `[{shortName|name, value}]` → `CN=…,O=…` matching the reference FURS clients. */
function formatDn(attributes: forge.pki.CertificateField[]): string {
  return attributes
    .map((a) => `${a.shortName ?? a.name ?? ""}=${a.value ?? ""}`)
    .join(",");
}

function hexToDecimalString(hex: string): string {
  return BigInt(`0x${hex}`).toString(10);
}

function toBinaryString(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return s;
}
