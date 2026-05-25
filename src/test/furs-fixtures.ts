import forge from "node-forge";

export interface TestCert {
  /** PKCS#12 bytes (RSA key + self-signed cert), for loadP12. */
  p12: Uint8Array;
  passphrase: string;
  privateKeyPem: string;
  publicKeyPem: string;
  serialDecimal: string;
}

/**
 * Generate an ephemeral RSA key + self-signed certificate, packaged as a PKCS#12.
 * Used by the FURS tests so no real certificate material is committed. The key is
 * a genuine RSA key, so signatures (ZOI, JWS) are real and verifiable.
 */
export function makeTestCert(): TestCert {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "0a1b2c3d4e5f6071"; // hex; exercises BigInt serial handling
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 365 * 24 * 3600 * 1000);
  const attrs = [
    { shortName: "CN", value: "10489185" },
    { shortName: "O", value: "grunt-it test" },
    { shortName: "C", value: "SI" },
  ];
  cert.setSubject(attrs);
  cert.setIssuer([{ shortName: "CN", value: "Test CA" }, { shortName: "C", value: "SI" }]);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const passphrase = "test-pass";
  const asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], passphrase, { algorithm: "3des" });
  const der = forge.asn1.toDer(asn1).getBytes();
  const p12 = Uint8Array.from(der, (c) => c.charCodeAt(0));

  return {
    p12,
    passphrase,
    privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey),
    publicKeyPem: forge.pki.publicKeyToPem(keys.publicKey),
    serialDecimal: BigInt("0x0a1b2c3d4e5f6071").toString(10),
  };
}
