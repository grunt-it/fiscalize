import { Data } from "effect";

/** Could not load / decrypt the taxpayer PKCS#12 certificate. */
export class FursCertError extends Data.TaggedError("FursCertError")<{
  message: string;
  status: 400;
  cause?: unknown;
  [key: string]: unknown;
}> {
  constructor(message: string, cause?: unknown) {
    super({ message, status: 400, cause });
  }
}

/** Network/TLS failure talking to FURS (unreachable, timeout, handshake). */
export class FursConnectionError extends Data.TaggedError("FursConnectionError")<{
  message: string;
  status: 503;
  cause?: unknown;
  [key: string]: unknown;
}> {
  constructor(message: string, cause?: unknown) {
    super({ message, status: 503, cause });
  }
}

/**
 * FURS accepted the request but returned a business error in the response
 * envelope (e.g. `S002` schema error, VAT mismatch). Carries the FURS code.
 */
export class FursError extends Data.TaggedError("FursError")<{
  message: string;
  status: 422;
  errorCode: string;
  [key: string]: unknown;
}> {
  constructor(errorCode: string, message: string) {
    super({ message: `FURS error ${errorCode}: ${message}`, status: 422, errorCode });
  }
}

/**
 * FURS's response could not be authenticated: its JWS signature did not verify
 * against the configured FURS public certificate. A potential spoof / MITM , 
 * the response (and any EOR in it) must NOT be trusted.
 */
export class FursResponseSignatureError extends Data.TaggedError("FursResponseSignatureError")<{
  message: string;
  status: 502;
  cause?: unknown;
  [key: string]: unknown;
}> {
  constructor(message = "FURS response signature did not verify", cause?: unknown) {
    super({ message, status: 502, cause });
  }
}

export type FursFailure =
  | FursCertError
  | FursConnectionError
  | FursError
  | FursResponseSignatureError;
