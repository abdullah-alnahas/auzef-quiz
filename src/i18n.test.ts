import { describe, expect, it } from "vitest";
import { dirOf, scopeGroupKey, scopeTitle, t } from "./i18n.ts";
import type { ScopeGroup } from "./types.ts";

const ALL_GROUPS: ScopeGroup[] = [
  "vize",
  "vize-deneme",
  "final",
  "final-deneme",
  "unit",
];

describe("t", () => {
  it("interpolates every provided variable", () => {
    expect(t("tr", "answeredCount", { a: 3, n: 10 })).toBe("10 sorudan 3");
    expect(t("ar", "answeredCount", { a: 3, n: 10 })).toBe("3 من 10");
  });

  it("leaves placeholders without a value untouched", () => {
    expect(t("tr", "answeredCount", { a: 3 })).toBe("{n} sorudan 3");
  });
});

describe("scope labels", () => {
  it("maps every scope group to its own key", () => {
    const keys = ALL_GROUPS.map(scopeGroupKey);
    expect(new Set(keys).size).toBe(ALL_GROUPS.length);
  });

  it("joins the groups in the order given, in both languages", () => {
    expect(scopeTitle("tr", ["vize", "final"])).toBe("Vize + Final + Bütünleme");
    expect(scopeTitle("ar", ["vize", "final"])).toBe("النصفي + النهائي + التكميلي");
    expect(scopeTitle("tr", ["final-deneme", "vize-deneme"])).toBe(
      "Final Deneme + Vize Deneme",
    );
    expect(scopeTitle("tr", [])).toBe("");
  });
});

describe("dirOf", () => {
  it("is RTL for Arabic and LTR for Turkish", () => {
    expect(dirOf("ar")).toBe("rtl");
    expect(dirOf("tr")).toBe("ltr");
  });
});
