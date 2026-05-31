/**
 * FURS uses wall-clock (Slovenian) time in two formats that must agree for the
 * same instant: the ZOI input (`dd-MM-yyyy HH:mm:ss`) and the message
 * `IssueDateTime` (`yyyy-MM-ddTHH:mm:ss`). We derive both from one `Date` via a
 * fixed time zone so the result is independent of the server's local zone.
 */
export const DEFAULT_TIMEZONE = "Europe/Ljubljana";

export interface FursDateTime {
  /** `dd-MM-yyyy HH:mm:ss`, the ZOI date component. */
  zoi: string;
  /** `yyyy-MM-ddTHH:mm:ss`, the message IssueDateTime / DateTime. */
  iso: string;
}

export function formatFursDateTime(date: Date, timeZone: string = DEFAULT_TIMEZONE): FursDateTime {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const p = (type: Intl.DateTimeFormatPartTypes) => parts.find((x) => x.type === type)?.value ?? "";
  const yyyy = p("year");
  const MM = p("month");
  const dd = p("day");
  // Intl may emit "24" for midnight in some engines; normalise to "00".
  const HH = p("hour") === "24" ? "00" : p("hour");
  const mm = p("minute");
  const ss = p("second");

  return {
    zoi: `${dd}-${MM}-${yyyy} ${HH}:${mm}:${ss}`,
    iso: `${yyyy}-${MM}-${dd}T${HH}:${mm}:${ss}`,
  };
}
