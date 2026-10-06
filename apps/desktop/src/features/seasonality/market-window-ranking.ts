import type {
  SeasonalOpportunity,
  SeasonalityScreenerRow,
} from "../../types/domain";
import { distinctOpportunityTop } from "./cloud-seasonality-batches";

export const MARKET_HORIZON_DAYS = 90;

export function marketHorizonEnd(asOf: string) {
  const date = new Date(`${asOf}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + MARKET_HORIZON_DAYS);
  return date.toISOString().slice(0, 10);
}

export function calendarDaysBetween(start: string, end: string) {
  return (
    (Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) /
    86_400_000
  );
}

/** Older annual responses must never masquerade as a rolling 90-day scan. */
export function assertMarketWindowHorizon(
  rows: SeasonalityScreenerRow[],
  asOf: string,
) {
  const horizonEnd = marketHorizonEnd(asOf);
  if (
    rows.some(
      (row) =>
        row.asOf !== asOf ||
        row.horizonEnd !== horizonEnd ||
        !Array.isArray(row.upcomingWindows) ||
        row.upcomingWindows.some(
          (window) =>
            window.symbol !== row.symbol ||
            window.startDate < asOf ||
            window.endDate > horizonEnd ||
            window.calendarDays < 5 ||
            window.calendarDays > MARKET_HORIZON_DAYS ||
            calendarDaysBetween(window.startDate, window.endDate) !==
              window.calendarDays ||
            window.samples < 5 ||
            ![1, -1].includes(window.direction),
        ),
    )
  ) {
    throw new Error(
      "Die Antwort gehört nicht zur aktuellen 90-Tage-Suche. Bitte aktualisiere die Anwendung und berechne die Chancen erneut.",
    );
  }
  return rows;
}

export function rankedMarketWindows(
  rows: SeasonalityScreenerRow[],
  category: string,
  direction: "all" | "long" | "short",
  limit: number,
): SeasonalOpportunity[] {
  const windows = rows
    .filter((row) => category === "all" || row.category === category)
    .flatMap((row) => row.upcomingWindows ?? [])
    .filter(
      (window) =>
        direction === "all" ||
        window.direction === (direction === "long" ? 1 : -1),
    );
  return distinctOpportunityTop(windows, limit);
}
