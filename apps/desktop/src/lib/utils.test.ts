import { describe, expect, it } from "vitest";
import { formatMoneyMinor, formatR, normalizeDisplayNumber } from "./utils";

describe("display number formatting", () => {
  it("keeps missing values unavailable instead of formatting them as zero", () => {
    expect(formatMoneyMinor(null)).toBe("—");
    expect(formatR(null)).toBe("—");
  });

  it("normalizes negative zero before presentation", () => {
    expect(normalizeDisplayNumber(-0)).toBe(0);
    expect(formatMoneyMinor(-0)).toBe("0,00 €");
    expect(formatR(-0)).toBe("0 R");
  });

  it("preserves genuine values", () => {
    expect(formatMoneyMinor(1250)).toBe("12,50 €");
    expect(formatR(-1.5)).toBe("-1,5 R");
  });
});
