/**
 * Runnable OFFLINE FURS example, demonstrates the ZOI, request-JWS and
 * response-verification crypto WITHOUT a live FURS call.
 *
 * A live round-trip (echo / reportInvoice) additionally needs a real FURS
 * certificate AND a Node-mTLS-capable, non-proxied runtime, see
 * docs/FURS-RUNTIME.md. This example uses a throwaway self-signed cert so it
 * runs anywhere (bun included) and shows exactly what the client computes.
 *
 * Run in this repo:  bun run examples/furs-offline.ts
 * In your project:   import { calculateZoi, signFursJws, verifyFursResponse } from "@grunt-it/fiscalize/furs";
 */
import { Effect } from "effect";
import forge from "node-forge";
import { loadP12 } from "../src/lib/furs/cert";
import { formatFursDateTime } from "../src/lib/furs/datetime";
import { signFursJws, verifyFursResponse } from "../src/lib/furs/jws";
import { calculateZoi, zoiToPrintable } from "../src/lib/furs/zoi";

//, Mint a throwaway certificate (stands in for the taxpayer's FURS cert) , 
function makeDemoP12(): { p12: Uint8Array; passphrase: string } {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "0a1b2c3d4e5f6071";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 365 * 24 * 3600 * 1000);
  const dn = [{ shortName: "CN", value: "10489185" }, { shortName: "O", value: "DEMO" }, { shortName: "C", value: "SI" }];
  cert.setSubject(dn);
  cert.setIssuer([{ shortName: "CN", value: "Demo CA" }]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const der = forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], "demo", { algorithm: "3des" })).getBytes();
  return { p12: Uint8Array.from(der, (c) => c.charCodeAt(0)), passphrase: "demo" };
}

const { p12, passphrase } = makeDemoP12();
const issuedAt = new Date("2026-05-25T14:30:00Z");

const result = await Effect.runPromise(
  Effect.gen(function* () {
    const cert = yield* loadP12(p12, passphrase);
    console.log(`✓ cert loaded, subject: ${cert.subjectName}, serial: ${cert.serial}`);

    // 1. ZOI, the issuer's protective mark.
    const { zoi: zoiDate } = formatFursDateTime(issuedAt, "Europe/Ljubljana");
    const zoi = calculateZoi(
      { taxNumber: 10489185, issueDateTime: zoiDate, invoiceNumber: "11", businessPremiseId: "BP101", electronicDeviceId: "0001", invoiceAmount: 19.15 },
      cert.privateKeyPem,
    );
    console.log(`✓ ZOI: ${zoi}`);
    console.log(`✓ printable (QR/PDF417): ${zoiToPrintable(zoi, issuedAt, 10489185)}`);

    // 2. Request JWS, what the client posts to FURS over mutual TLS.
    const token = signFursJws({ InvoiceRequest: { ProtectedID: zoi } }, cert.privateKeyPem, {
      subjectName: cert.subjectName,
      issuerName: cert.issuerName,
      serial: cert.serial,
    });
    console.log(`✓ request JWS signed (${token.split(".").length}-part compact JWS)`);

    // 3. Response verification, here we mint a response signed by our demo cert
    //    standing in for FURS, then verify it (in production: FURS's real cert).
    const fakeFursResponse = signFursJws(
      { InvoiceResponse: { UniqueInvoiceID: "demo-eor-1234" } },
      cert.privateKeyPem,
      { subjectName: "CN=FURS", issuerName: "CN=Tax CA", serial: "1" },
    );
    const verified = verifyFursResponse<{ InvoiceResponse: { UniqueInvoiceID: string } }>(fakeFursResponse, cert.certPem);
    console.log(`✓ response verified, EOR: ${verified.InvoiceResponse.UniqueInvoiceID}`);

    return zoi;
  }),
);

console.log(`\nOffline FURS crypto demo complete (ZOI ${result}). Live submission → see docs/FURS-RUNTIME.md.`);
