import { createSign } from "node:crypto";

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
 * Decode a compact JWS payload without verifying the signature. The reference
 * FURS clients do not verify FURS's response signature; verifying it against the
 * FURS public cert is a hardening follow-up (see ROADMAP).
 */
export function decodeJwsPayload<T = unknown>(token: string): T {
  const segment = token.split(".")[1];
  if (!segment) throw new Error("malformed JWS: missing payload segment");
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as T;
}

function b64url(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}
