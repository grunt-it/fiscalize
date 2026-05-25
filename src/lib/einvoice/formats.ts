/** Output formats fiscalize can produce. */
export const FORMATS = ["eslog", "ubl", "cii"] as const;
export type Format = (typeof FORMATS)[number];

/**
 * Map a fiscalize format to the `@e-invoice-eu/core` format string. `eslog` is
 * handled by our own serializer and is intentionally absent here.
 */
export const LIB_FORMAT: Record<Exclude<Format, "eslog">, string> = {
  ubl: "UBL",
  cii: "CII",
};

export function isFormat(value: string): value is Format {
  return (FORMATS as readonly string[]).includes(value);
}
