import type {
  SeasonalOpportunity,
  SeasonalityScreenerRow,
} from "../../../types/domain";
import {
  calendarDaysBetween,
  marketHorizonEnd,
} from "../market-window-ranking";

export const asOf = "2026-10-05";

export function marketWindow(
  overrides: Partial<SeasonalOpportunity> = {},
): SeasonalOpportunity {
  const startDate = overrides.startDate ?? "2026-10-10";
  const endDate = overrides.endDate ?? "2026-10-30";
  return {
    id: "EURUSD:2026-10-10:2026-10-30",
    symbol: "EURUSD",
    label: "Euro gegenüber US-Dollar",
    comparisonSymbol: null,
    comparisonLabel: null,
    startDate,
    endDate,
    calendarDays: calendarDaysBetween(startDate, endDate),
    direction: 1,
    meanReturn: 0.04,
    medianReturn: 0.05,
    comparisonMeanReturn: null,
    comparisonMedianReturn: null,
    meanDifference: null,
    medianDifference: null,
    hitRate: 0.8,
    wilsonLowerBound: 0.58,
    volatility: 0.04,
    samples: 20,
    years: Array.from({ length: 20 }, (_, index) => 2006 + index),
    observations: [],
    curve: [
      { day: 0, mean: 0, samples: 20 },
      { day: 20, mean: 0.04, samples: 20 },
    ],
    source: "Synthetic EODHD test fixture",
    sourceSymbol: "EURUSD.FOREX",
    comparisonSourceSymbol: null,
    inverted: false,
    comparisonInverted: false,
    ...overrides,
  };
}

export function marketRow(
  windows = [marketWindow()],
  category = "Forex",
  today = asOf,
): SeasonalityScreenerRow {
  return {
    symbol: windows[0]?.symbol ?? "EURUSD",
    category,
    completeYears: 20,
    qualityStatus: "available",
    calculatedAt: "2026-10-04T10:00:00Z",
    dataSource: "Synthetic EODHD test fixture",
    missingDays: 0,
    asOf: today,
    horizonEnd: marketHorizonEnd(today),
    upcomingWindows: windows,
  };
}
