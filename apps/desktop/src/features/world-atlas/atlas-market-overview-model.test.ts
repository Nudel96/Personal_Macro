import { describe, expect, it } from "vitest";
import { browserAtlasMarket } from "../../services/atlas-browser";
import type { AtlasMarketResponse } from "./atlas-market-types";
import {
  marketOverviewFrame,
  marketOverviewPath,
  marketOverviewReading,
  overviewMonth,
} from "./atlas-market-overview-model";

function row(points: [string, number | null][]): AtlasMarketResponse {
  const result = browserAtlasMarket("eodhd:SPY.US");
  return {
    ...result,
    status: "available",
    analysis: {
      ...result.analysis,
      state: "above_trend",
      stale: false,
      points: points.map(([month, wave]) => ({
        month,
        wave,
        adjustedClose: 100,
        percentile: null,
      })),
    },
  };
}
const now = new Date("2026-09-01T00:00:00Z");

describe("Vergleichbare kleine Marktwellen", () => {
  it("verwendet abgeschlossene UTC-Monate und einen gemeinsamen symmetrischen Maßstab", () => {
    const first = row([
      ["2000-01", 900],
      ["2026-07", -12],
      ["2026-08", 8],
      ["2026-09", 1000],
    ]);
    const second = row([["2026-08", 8]]);
    const otherCurrency = row([["2026-08", 9000]]);
    otherCurrency.proxy = { ...otherCurrency.proxy, currency: "EUR" };
    const otherRecipe = row([["2026-08", 8000]]);
    otherRecipe.analysis.recipe = "different";
    const frame = marketOverviewFrame(
      [first, second, otherCurrency, otherRecipe],
      20,
      now,
    );
    expect(overviewMonth(frame.first)).toBe("2006-09");
    expect(overviewMonth(frame.last)).toBe("2026-08");
    expect(frame.extent).toBe(20);
    expect(marketOverviewPath(first, frame).current).toEqual(
      marketOverviewPath(second, frame).current,
    );
    expect(marketOverviewPath(first, frame).current?.x).toBe(312);
    expect(marketOverviewPath(first, frame).current?.y).toBeCloseTo(41.6, 10);
    expect(marketOverviewPath(otherCurrency, frame).path).toBe("");
    expect(marketOverviewPath(otherRecipe, frame).path).toBe("");
  });

  it("lässt explizite und ausgelassene Kalendermonate offen und markiert einzelne Punkte", () => {
    const data = row([
      ["2026-01", 5],
      ["2026-02", null],
      ["2026-03", 6],
      ["2026-05", 8],
      ["2026-06", -8],
      ["2026-08", null],
    ]);
    const picture = marketOverviewPath(
      data,
      marketOverviewFrame([data], null, now),
    );
    expect(picture.path.match(/M/g)).toHaveLength(3);
    expect(picture.path.match(/L/g)).toHaveLength(1);
    expect(picture.isolated).toHaveLength(2);
    expect(picture.current).toBeNull();
    expect(picture.path).not.toMatch(/[CQ]/);
  });

  it("zeigt die tatsächliche verfügbare Wellenhistorie und zeichnet keine Ersatzwelle", () => {
    const data = row([
      ["2019-02", null],
      ["2020-07", 0],
      ["2021-01", 4],
      ["2026-08", null],
    ]);
    const frame = marketOverviewFrame([data], null, now);
    expect(overviewMonth(frame.first)).toBe("2020-07");
    expect(
      marketOverviewPath(data, frame).path.startsWith("M8.000,60.000"),
    ).toBe(true);
    const empty = row([["2026-08", null]]);
    expect(
      marketOverviewPath(empty, marketOverviewFrame([empty], 10, now)).path,
    ).toBe("");
    expect(marketOverviewFrame([empty], 10, now).extent).toBe(10);
  });

  it("ordnet alte oder unzureichende Daten vor einer empfindlichen Trendeinordnung ein", () => {
    const data = row([["2026-08", 3]]);
    data.analysis.parameterSensitive = true;
    expect(marketOverviewReading(data)).toContain("Zeitfenster");
    data.analysis.stale = true;
    expect(marketOverviewReading(data)).toContain("ältere Daten");
    data.analysis.stale = false;
    data.analysis.state = "insufficient_history";
    expect(marketOverviewReading(data)).toContain(
      "keine ausreichend lange Welle",
    );
    expect(marketOverviewReading(browserAtlasMarket(data.proxy.id))).toBe(
      "In der Desktop-App laden",
    );
  });
});
