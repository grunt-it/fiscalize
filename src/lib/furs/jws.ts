import { createSign, createVerify, X509Certificate } from "node:crypto";

export interface JwsIdentity {
  subjectName: string;
  issuerName: string;
  /** Decimal serial string (exact; emitted as a raw JSON integer). */
  serial: string;
}

/**
 * Sign a FURS message as a compact JWS (RS256) with FURS's custom protected
 * header (`subject_name`, `issuer_name`, `serial`). The header is assembled by
 * hand so the (potentially > 2^53) certificate serial is emitted as an exact
 * integer literal rather than a lossy JS number.
 */
export function signFursJws(payload: unknown, privateKeyPem: string, id: JwsIdentity): string {
  if (!/^\d+$/.test(id.serial)) throw new Error(`invalid certificate serial: ${id.serial}`);

  const headerJson =
    `{"alg":"RS256",` +
    `"subject_name":${JSON.stringify(id.subjectName)},` +
    `"issuer_name":${JSON.stringify(id.issuerName)},` +
    `"serial":${id.serial}}`;

  const signingInput = `${b64url(headerJson)}.${b64url(JSON.stringify(payload))}`;

  const signer = createSign("RSA-SHA256");
  signer.update(signingInput, "utf8");
  signer.end();
  const signature = signer.sign(privateKeyPem).toString("base64url");

  return `${signingInput}.${signature}`;
}

/**
 * Decode a compact JWS payload **without** verifying the signature. Use
 * {@link verifyFursResponse} when you have FURS's public certificate — an
 * unverified response (and its EOR) must not be trusted in production.
 */
export function decodeJwsPayload<T = unknown>(token: string): T {
  const segment = token.split(".")[1];
  if (!segment) throw new Error("malformed JWS: missing payload segment");
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as T;
}

/**
 * Verify a FURS response's compact JWS (RS256) against FURS's public
 * certificate and return its decoded payload. Confirms the response was signed
 * by FURS (not spoofed / tampered).
 *
 * `fursCertPem` is FURS's response-signing certificate (PEM) — the test-env one
 * is published with the FURS reference clients; production has its own. Throws
 * if the token is malformed or the signature does not verify.
 */
export function verifyFursResponse<T = unknown>(token: string, fursCertPem: string): T {
  const [headerB64, payloadB64, signatureB64] = token.split(".");
  if (!headerB64 || !payloadB64 || !signatureB64) {
    throw new Error("malformed JWS: expected three segments");
  }

  const header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8")) as { alg?: string };
  if (header.alg !== "RS256") {
    throw new Error(`unexpected JWS alg "${header.alg}" (expected RS256)`);
  }

  const publicKey = new X509Certificate(fursCertPem).publicKey;
  const verified = createVerify("RSA-SHA256")
    .update(`${headerB64}.${payloadB64}`, "utf8")
    .verify(publicKey, signatureB64, "base64url");
  if (!verified) throw new Error("signature did not verify against the FURS certificate");

  return JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as T;
}

function b64url(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}
