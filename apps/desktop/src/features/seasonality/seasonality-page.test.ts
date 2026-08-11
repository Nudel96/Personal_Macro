import { describe, expect, it } from "vitest";
import type { SeasonalityAnalysis } from "../../types/domain";
import { annualOption, parseSeasonalityYears } from "./seasonality-page";

describe("parseSeasonalityYears", () => {
  it("keeps the explicit year cohort numeric, unique and ordered", () => {
    expect(parseSeasonalityYears("2024, 2016, nope, 2024, 2020")).toEqual([
      2016, 2020, 2024,
    ]);
  });

  it("renders one pooled average line for a multi-digit cohort", () => {
    const option = annualOption({
      annualCurve: [
        {
          day: 1,
          mean: 100,
          smoothedMean: 100,
          samples: 4,
          median: 100,
          p25: 99,
          p75: 101,
        },
        {
          day: 2,
          mean: 101,
          smoothedMean: 101,
          samples: 4,
          median: 101,
          p25: 100,
          p75: 102,
        },
      ],
      selectedWindow: { startDate: "01-01", tradingDays: 20 },
      trendSegments: [{ startDay: 1, endDay: 2, phase: "rising" }],
    } as SeasonalityAnalysis);

    expect(Array.isArray(option.series)).toBe(true);
    const series = option.series as unknown[];
    expect(series).toHaveLength(1);
    expect(series[0]).toMatchObject({
      name: "Durchschnitt aller gewählten Jahre",
      data: [100, 101],
    });
  });
});
