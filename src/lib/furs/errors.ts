import { Data } from "effect";

/** Could not load / decrypt the taxpayer PKCS#12 certificate. */
export class FursCertError extends Data.TaggedError("FursCertError")<{
  message: string;
  status: number;
  cause?: unknown;
}> {
  constructor(message: string, cause?: unknown) {
    super({ message, status: 400, cause });
  }
}

/** Network/TLS failure talking to FURS (unreachable, timeout, handshake). */
export class FursConnectionError extends Data.TaggedError("FursConnectionError")<{
  message: string;
  status: number;
  cause?: unknown;
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
  status: number;
  errorCode: string;
}> {
  constructor(errorCode: string, message: string) {
    super({ message: `FURS error ${errorCode}: ${message}`, status: 422, errorCode });
  }
}

export type FursFailure = FursCertError | FursConnectionError | FursError;
