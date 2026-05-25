import { describe, expect, test } from "bun:test";
import { serializeEslog } from "../lib/eslog/serialize";
import { sampleInvoice } from "./fixtures";

describe("serializeEslog", () => {
  const xml = serializeEslog(sampleInvoice());

  test("emits the e-SLOG 2.0 root and INVOIC message", () => {
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<Invoice xmlns="urn:eslog:2.00"');
    expect(xml).toContain('<M_INVOIC Id="data">');
    expect(xml).toContain("<D_0065>INVOIC</D_0065>");
  });

  test("maps the document header (BGM 380 + invoice number)", () => {
    expect(xml).toContain("<D_1001>380</D_1001>");
    expect(xml).toContain("<D_1004>2026-000123</D_1004>");
  });

  test("maps issue (137) and delivery (35) dates", () => {
    expect(xml).toContain("<D_2005>137</D_2005>");
    expect(xml).toContain("<D_2005>35</D_2005>");
    expect(xml).toContain("<D_2380>2026-05-25</D_2380>");
  });

  test("emits both parties with VAT references, buyer (BY) before seller (SE)", () => {
    expect(xml).toContain("<D_3035>BY</D_3035>");
    expect(xml).toContain("<D_3035>SE</D_3035>");
    expect(xml.indexOf("<D_3035>BY</D_3035>")).toBeLessThan(xml.indexOf("<D_3035>SE</D_3035>"));
    expect(xml).toContain("<D_1154>SI12345678</D_1154>"); // seller VAT
    expect(xml).toContain("<D_1154>SI87654321</D_1154>"); // buyer VAT
  });

  test("emits the seller bank account (FII RB + IBAN + BIC)", () => {
    expect(xml).toContain("<D_3035>RB</D_3035>");
    expect(xml).toContain("<D_3194>SI56020170014356205</D_3194>");
    expect(xml).toContain("<D_3433>LJBASI2X</D_3433>");
  });

  test("maps currency and payment due date", () => {
    expect(xml).toContain("<D_6345>EUR</D_6345>");
    expect(xml).toContain("<D_2005>13</D_2005>"); // due date qualifier
    expect(xml).toContain("<D_2380>2026-06-08</D_2380>");
  });

  test("maps line items with quantity, prices and line VAT", () => {
    expect(xml).toContain("<D_7008>Ekološka detergent koncentrat 1L</D_7008>");
    expect(xml).toContain("<D_6411>H87</D_6411>"); // unit override on line 1
    expect(xml).toContain("<D_5125>AAA</D_5125>"); // net price
    expect(xml).toContain("<D_5125>AAB</D_5125>"); // gross price
    // line 1 amount incl. VAT (50 * 1.22) and net
    expect(xml).toContain("<D_5004>61.00</D_5004>");
    expect(xml).toContain("<D_5004>50.00</D_5004>");
  });

  test("maps document totals to the right MOA qualifiers", () => {
    // 79 sum-of-lines, 389 tax-exclusive, 176 tax-total, 388 tax-inclusive, 9 payable
    for (const [code, amount] of [
      ["79", "90.00"],
      ["389", "90.00"],
      ["176", "14.80"],
      ["388", "104.80"],
      ["9", "104.80"],
    ] as const) {
      expect(xml).toContain(`<D_5025>${code}</D_5025>`);
      expect(xml).toContain(`<D_5004>${amount}</D_5004>`);
    }
  });

  test("emits a VAT breakdown (G_SG52) per rate", () => {
    expect(xml).toContain("<D_5278>22</D_5278>");
    expect(xml).toContain("<D_5278>9.5</D_5278>");
    expect((xml.match(/<G_SG52>/g) ?? []).length).toBe(2);
  });

  test("compact mode drops indentation", () => {
    const compact = serializeEslog(sampleInvoice(), { pretty: false });
    expect(compact).not.toContain("\n  ");
    expect(compact).toContain('<Invoice xmlns="urn:eslog:2.00"');
  });

  test("escapes XML-significant characters in text", () => {
    const inv = sampleInvoice();
    inv.note = "Plačilo <ref> & sklic";
    const out = serializeEslog(inv);
    expect(out).toContain("&lt;ref&gt; &amp; sklic");
  });
});
