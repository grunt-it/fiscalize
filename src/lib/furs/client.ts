import { randomUUID } from "node:crypto";
import { Effect } from "effect";
import * as v from "valibot";
import { InvalidInvoiceError } from "../foundation/errors";
import { type FursCert, loadP12 } from "./cert";
import { DEFAULT_TIMEZONE, formatFursDateTime } from "./datetime";
import { FursConnectionError, FursError, FursResponseSignatureError } from "./errors";
import { decodeJwsPayload, signFursJws, verifyFursResponse } from "./jws";
import {
  buildBusinessPremiseRequest,
  buildInvoiceRequest,
  FursBusinessPremise,
  FursInvoice,
} from "./messages";
import { calculateZoi, zoiToPrintable } from "./zoi";

const ENDPOINTS = {
  test: "https://blagajne-test.fu.gov.si:9002",
  production: "https://blagajne.fu.gov.si:9003",
} as const;

const PATHS = {
  echo: "/v1/cash_registers/echo",
  register: "/v1/cash_registers/invoices/register",
  invoice: "/v1/cash_registers/invoices",
} as const;

export interface FursClientConfig {
  /** Taxpayer PKCS#12 bytes (test cert for the test env; eDavki cert in prod). */
  p12: Uint8Array;
  passphrase: string;
  /** Target the production endpoint instead of test. Default false (test). */
  production?: boolean;
  /** Wall-clock time zone for ZOI/IssueDateTime. Default Europe/Ljubljana. */
  timeZone?: string;
  /**
   * Verify FURS's server TLS certificate. Default false — the FURS test env
   * presents a self-signed CA, matching the reference clients. Set true (and
   * supply the CA out of band) for hardened production use.
   */
  rejectUnauthorized?: boolean;
  /**
   * FURS's response-signing certificate (PEM). When set, every signed response
   * has its JWS signature verified against it before the EOR is trusted —
   * failures raise `FursResponseSignatureError`. Strongly recommended for
   * production. When omitted, responses are decoded without verification.
   */
  fursResponseCertPem?: string;
  requestTimeoutMs?: number;
}

export interface InvoiceResult {
  /** Issuer protective mark. */
  zoi: string;
  /** FURS unique invoice ID (EOR). */
  eor: string;
  /** Printable verification string for the QR / PDF417 / Code128. */
  printable: string;
}

export interface FursClient {
  /** Connectivity check (unsigned, but still over mutual TLS). Returns the echoed text. */
  echo(message?: string): Effect.Effect<string, FursConnectionError>;
  /** Register an immovable business premise. Resolves `true` on success. */
  registerBusinessPremise(
    premise: FursBusinessPremise,
  ): Effect.Effect<true, FursConnectionError | FursError | FursResponseSignatureError | InvalidInvoiceError>;
  /** Fiscally verify an invoice → ZOI + EOR + printable mark. */
  reportInvoice(
    invoice: FursInvoice,
  ): Effect.Effect<
    InvoiceResult,
    FursConnectionError | FursError | FursResponseSignatureError | InvalidInvoiceError
  >;
  /** The loaded certificate's identity (subject/issuer/serial). */
  readonly cert: FursCert;
}

/** Construct a FURS client (loads + validates the certificate once). */
export const makeFursClient = Effect.fn("makeFursClient")(function* (config: FursClientConfig) {
  const cert = yield* loadP12(config.p12, config.passphrase);
  const baseUrl = config.production ? ENDPOINTS.production : ENDPOINTS.test;
  const timeZone = config.timeZone ?? DEFAULT_TIMEZONE;
  const timeout = config.requestTimeoutMs ?? 10_000;

  const postRaw = (path: string, body: unknown) =>
    Effect.tryPromise({
      try: async () => {
        const res = await fetch(`${baseUrl}${path}`, {
          method: "POST",
          headers: { "content-type": "application/json; charset=UTF-8" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeout),
          // bun extension: mutual-TLS client cert + server-verify toggle.
          tls: {
            cert: cert.certPem,
            key: cert.privateKeyPem,
            rejectUnauthorized: config.rejectUnauthorized ?? false,
          },
        } as RequestInit);
        if (!res.ok) throw new Error(`FURS HTTP ${res.status} ${res.statusText}`);
        return (await res.json()) as Record<string, unknown>;
      },
      catch: (cause) => new FursConnectionError(`FURS request to ${path} failed`, cause),
    });

  /** Post a signed (JWS) request and decode the response envelope, raising FursError on a FURS error. */
  const postSigned = (path: string, message: Record<string, unknown>) =>
    Effect.gen(function* () {
      const token = signFursJws(message, cert.privateKeyPem, {
        subjectName: cert.subjectName,
        issuerName: cert.issuerName,
        serial: cert.serial,
      });
      const json = yield* postRaw(path, { token });
      const responseToken = json.token;
      if (typeof responseToken !== "string") {
        return yield* Effect.fail(new FursConnectionError("FURS response missing token"));
      }
      // Verify FURS's signature when a cert is configured; otherwise decode unverified.
      const decoded = config.fursResponseCertPem
        ? yield* Effect.try({
            try: () =>
              verifyFursResponse<Record<string, Record<string, any>>>(
                responseToken,
                config.fursResponseCertPem as string,
              ),
            catch: (cause) => new FursResponseSignatureError(undefined, cause),
          })
        : decodeJwsPayload<Record<string, Record<string, any>>>(responseToken);
      const envelope = decoded[Object.keys(decoded)[0] ?? ""];
      if (envelope?.Error) {
        return yield* Effect.fail(new FursError(envelope.Error.ErrorCode, envelope.Error.ErrorMessage));
      }
      return decoded;
    });

  const echo: FursClient["echo"] = (message = "ping") =>
    Effect.gen(function* () {
      const json = yield* postRaw(PATHS.echo, { EchoRequest: message });
      return String(json.EchoResponse ?? "");
    });

  const registerBusinessPremise: FursClient["registerBusinessPremise"] = (premiseInput) =>
    Effect.gen(function* () {
      const premise = yield* parse(FursBusinessPremise, premiseInput);
      const now = formatFursDateTime(new Date(), timeZone);
      const validity = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(premise.validityDate); // en-CA → yyyy-MM-dd
      const message = buildBusinessPremiseRequest(premise, {
        messageId: randomUUID(),
        headerIso: now.iso,
        validityDateYmd: validity,
      });
      yield* postSigned(PATHS.register, message);
      return true as const;
    });

  const reportInvoice: FursClient["reportInvoice"] = (invoiceInput) =>
    Effect.gen(function* () {
      const invoice = yield* parse(FursInvoice, invoiceInput);
      const issued = formatFursDateTime(invoice.issueDateTime, timeZone);
      const now = formatFursDateTime(new Date(), timeZone);

      const zoi = calculateZoi(
        {
          taxNumber: invoice.taxNumber,
          issueDateTime: issued.zoi,
          invoiceNumber: invoice.invoiceNumber,
          businessPremiseId: invoice.businessPremiseId,
          electronicDeviceId: invoice.electronicDeviceId,
          invoiceAmount: invoice.invoiceAmount,
        },
        cert.privateKeyPem,
      );

      const message = buildInvoiceRequest(invoice, {
        zoi,
        issueIso: issued.iso,
        messageId: randomUUID(),
        headerIso: now.iso,
      });

      const decoded = yield* postSigned(PATHS.invoice, message);
      const eor = decoded?.InvoiceResponse?.UniqueInvoiceID;
      if (typeof eor !== "string" || !eor) {
        return yield* Effect.fail(new FursConnectionError("FURS response missing UniqueInvoiceID (EOR)"));
      }
      return {
        zoi,
        eor,
        printable: zoiToPrintable(zoi, invoice.issueDateTime, invoice.taxNumber, timeZone),
      } satisfies InvoiceResult;
    });

  return { echo, registerBusinessPremise, reportInvoice, cert } satisfies FursClient;
});

const parse = Effect.fn("parseFursInput")(function* <T extends v.GenericSchema>(schema: T, input: unknown) {
  const result = v.safeParse(schema, input, { abortPipeEarly: false });
  if (result.success) return result.output;
  return yield* Effect.fail(
    new InvalidInvoiceError(
      `FURS input failed validation (${result.issues.length} issue${result.issues.length === 1 ? "" : "s"}).`,
      result.issues.map((i) => ({
        path: i.path?.map((p) => String((p as { key: unknown }).key)).join(".") ?? "",
        message: i.message,
      })),
    ),
  );
});
