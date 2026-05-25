import { describe, expect, test } from "bun:test";
import { signFursJws, verifyFursResponse } from "../lib/furs/jws";
import { makeTestCert } from "./furs-fixtures";

// A second key-pair/cert stands in for FURS's response-signing certificate.
const furs = makeTestCert();

const responsePayload = {
  InvoiceResponse: {
    Header: { MessageID: "m-1", DateTime: "2026-05-25T14:30:01" },
    UniqueInvoiceID: "a1b2c3d4-e5f6-7890-abcd-ef0123456789",
  },
};

/** Mint a JWS as if FURS signed it (RS256 with FURS's key). */
function fursSignedToken(payload: unknown = responsePayload): string {
  return signFursJws(payload, furs.privateKeyPem, {
    subjectName: "CN=blagajne.fu.gov.si",
    issuerName: "CN=Tax CA Test",
    serial: "1",
  });
}

describe("verifyFursResponse", () => {
  test("accepts a genuinely FURS-signed response and returns the payload", () => {
    const decoded = verifyFursResponse<typeof responsePayload>(fursSignedToken(), furs.certPem);
    expect(decoded.InvoiceResponse.UniqueInvoiceID).toBe(responsePayload.InvoiceResponse.UniqueInvoiceID);
  });

  test("rejects a tampered payload (spoofed EOR)", () => {
    const [h, , s] = fursSignedToken().split(".");
    const forged = { InvoiceResponse: { ...responsePayload.InvoiceResponse, UniqueInvoiceID: "ATTACKER-EOR" } };
    const forgedPayloadB64 = Buffer.from(JSON.stringify(forged), "utf8").toString("base64url");
    const tampered = `${h}.${forgedPayloadB64}.${s}`;
    expect(() => verifyFursResponse(tampered, furs.certPem)).toThrow();
  });

  test("rejects a response signed by a different (non-FURS) key", () => {
    const impostor = makeTestCert();
    const token = signFursJws(responsePayload, impostor.privateKeyPem, {
      subjectName: "CN=evil",
      issuerName: "CN=evil",
      serial: "2",
    });
    expect(() => verifyFursResponse(token, furs.certPem)).toThrow();
  });

  test("rejects a non-RS256 / malformed token", () => {
    expect(() => verifyFursResponse("not.a.jws", furs.certPem)).toThrow();
    expect(() => verifyFursResponse("onlyonesegment", furs.certPem)).toThrow();
  });
});
