import { describe, expect, it } from "vitest";
import { atlasCatalog } from "./atlas-catalog";
import { atlasUnits } from "./atlas-analysis";
import { atlasSeriesComparable } from "./atlas-source-series";
import { coverageOptions } from "./atlas-coverage";

describe("WDI purchasing-power replacement", () => {
  it("keeps current US=100 definitions distinct from the old ratio and each other", () => {
    const rows = atlasCatalog.series.filter(
      (s) => s.topicId === "macro:purchasing_power",
    );
    expect(rows.map((s) => s.providerCode)).toEqual([
      "PA.NUS.GDP.PLI",
      "PA.NUS.PRVT.PLI",
    ]);
    expect(rows[0].providerLabel).toBe("Price level index (GDP)");
    expect(rows[1].providerLabel).toContain("Households and NPISHs");
    for (const row of rows) {
      expect(row.unit).toBe("price_level_us100");
      expect(atlasUnits[row.unit]).toContain("USA = 100");
      expect(row.throughYear).toBe(2025);
      expect(row.observationKind).toBe("modeled_estimate");
      expect(row.scopeNote).toContain("fortgeschrieben");
      expect(atlasSeriesComparable(row)).toBe(true);
    }
    expect(
      atlasCatalog.series.some((s) => s.providerCode === "PA.NUS.PPPC.RF"),
    ).toBe(false);
  });
  it("offers both actual statistical perspectives in coverage", () => {
    const ids = coverageOptions("m49:276", {
      series: {},
      demography: {},
      history: {},
      energy: {},
      markets: {},
    })
      .filter((o) => o.topicId === "macro:purchasing_power")
      .map((o) => o.id);
    expect(ids.join(" ")).toContain("PA.NUS.GDP.PLI");
    expect(ids.join(" ")).toContain("PA.NUS.PRVT.PLI");
  });
});
