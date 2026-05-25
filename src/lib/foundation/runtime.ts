import { Cause, Effect, Exit } from "effect";

/**
 * Discriminated result for running an Effect at a Promise boundary — lets a
 * non-Effect host (a Medusa plugin, an HTTP handler) consume fiscalize without
 * adopting Effect. Mirrors `@grunt-it/utility-belt`'s `runSafe`.
 */
export type EffectSuccess<R> = { ok: true; data: R };
export type EffectFailure = {
  ok: false;
  error: { message: string; status: number; [key: string]: unknown };
};
export type EffectResult<R> = EffectSuccess<R> | EffectFailure;

export function handleCause(cause: Cause.Cause<unknown>): { message: string; status: number } {
  let message = Cause.pretty(cause);
  let status = 500;

  if (Cause.isFailType(cause)) {
    const error = cause.error as { status?: number; message?: string };
    if (typeof error.status === "number") status = error.status;
    if (typeof error.message === "string") message = error.message;
  }

  return { message, status };
}

/**
 * Run an Effect to a plain `{ ok }` result — never throws. Failures (including
 * defects) collapse into `{ ok: false, error: { message, status } }`.
 */
export async function runSafe<R>(effect: Effect.Effect<R, unknown, never>): Promise<EffectResult<R>> {
  const result = await Effect.runPromiseExit(effect);
  return Exit.match(result, {
    onSuccess: (data) => ({ ok: true, data }),
    onFailure: (cause) => ({ ok: false, error: handleCause(cause) }),
  });
}
