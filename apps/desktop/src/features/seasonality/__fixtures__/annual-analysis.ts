import type { SeasonalityAnalysis } from "../../../types/domain";

/** Synthetic chart evidence, never provider data. */
export function annualAnalysisFixture(): SeasonalityAnalysis {
  return {
    symbol: "TEST",
    category: "Forex",
    calculatedAt: "2026-01-01T00:00:00Z",
    selectedYears: [2020, 2021, 2022, 2023, 2024],
    qualityStatus: "available",
    qualityReason: "Synthetische Testdaten · 5 vollständige Jahre",
    referenceDate: "01-02",
    annualCurve: [100, 102, 99, 104, 103].map((mean, index) => ({
      day: index + 1,
      mean,
      smoothedMean: 777,
      samples: 5,
      median: mean - 0.5,
      p25: mean - 1,
      p75: mean + 1,
    })),
    trendSegments: [{ startDay: 1, endDay: 5, phase: "rising" }],
    months: [],
    quarters: [],
    forwardReturns: [],
    selectedWindow: {
      startDate: "01-02",
      tradingDays: 20,
      averageReturn: 0.025,
      medianReturn: 0.02,
      positiveRatio: 0.8,
      samples: 5,
      years: [2020, 2021, 2022, 2023, 2024],
      yearReturns: [0.02, -0.01, 0.03, 0.02, 0.065].map(
        (returnValue, index) => ({ year: 2020 + index, returnValue }),
      ),
      qualityStatus: "available",
    },
    bullishWindows: [],
    bearishWindows: [],
    heatmap: [],
    dataSource: "Synthetische Testdaten",
    missingDays: 0,
  };
}
