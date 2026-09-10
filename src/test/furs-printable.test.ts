import { describe, expect, test } from "bun:test";
import { zoiToPrintable } from "../lib/furs/zoi";

describe("FURS printable verification payload", () => {
  test("matches the published section 11 vector and field ordering", () => {
    const printable = zoiToPrintable(
      "a7e5f55e1dbb48b799268e1a6d8618a3",
      new Date("2015-08-15T08:13:32Z"),
      12345678,
      "Europe/Ljubljana",
    );

    expect(printable).toBe(
      "223175087923687075112234402528973166755123456781508151013321",
    );
    expect(printable).toHaveLength(60);
  });
});
