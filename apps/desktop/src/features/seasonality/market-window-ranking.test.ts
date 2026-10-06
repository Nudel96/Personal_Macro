import { describe, expect, it } from "vitest";
import {
  asOf,
  marketRow,
  marketWindow,
} from "./__fixtures__/market-window-fixtures";
import {
  assertMarketWindowHorizon,
  calendarDaysBetween,
  marketHorizonEnd,
  rankedMarketWindows,
} from "./market-window-ranking";

describe("rolling market window ranking", () => {
  it("uses calendar days across year boundaries, leap days and daylight saving changes", () => {
    expect(marketHorizonEnd(asOf)).toBe("2027-01-03");
    expect(marketHorizonEnd("2026-12-15")).toBe("2027-03-15");
    expect(marketHorizonEnd("2024-02-29")).toBe("2024-05-29");
    expect(
      calendarDaysBetween("2026-03-20", marketHorizonEnd("2026-03-20")),
    ).toBe(90);
    expect(
      calendarDaysBetween("2026-10-20", marketHorizonEnd("2026-10-20")),
    ).toBe(90);
  });

  it("rejects annual, stale, outside-horizon and insufficient responses", () => {
    const row = marketRow();
    expect(assertMarketWindowHorizon([row], asOf)).toEqual([row]);
    expect(() =>
      assertMarketWindowHorizon([{ ...row, upcomingWindows: undefined }], asOf),
    ).toThrow(/90-Tage-Suche/);
    expect(() =>
      assertMarketWindowHorizon([{ ...row, asOf: "2026-10-04" }], asOf),
    ).toThrow(/90-Tage-Suche/);
    for (const overrides of [
      { startDate: "2026-10-04" },
      { endDate: "2027-01-04" },
      { samples: 4 },
      { calendarDays: 0 },
    ]) {
      expect(() =>
        assertMarketWindowHorizon([marketRow([marketWindow(overrides)])], asOf),
      ).toThrow(/90-Tage-Suche/);
    }
    const edge = marketWindow({
      startDate: asOf,
      endDate: marketHorizonEnd(asOf),
    });
    expect(assertMarketWindowHorizon([marketRow([edge])], asOf)).toHaveLength(
      1,
    );
  });

  it("ranks both directions by confidence, then strength and samples, before limiting", () => {
    const short = marketWindow({
      id: "short",
      symbol: "GOLD",
      direction: -1,
      meanReturn: -0.02,
      medianReturn: -0.03,
      wilsonLowerBound: 0.8,
    });
    const long = marketWindow();
    const weak = marketWindow({
      id: "weak",
      symbol: "WEAK",
      medianReturn: 0.1,
      volatility: 0.5,
    });
    const strong = marketWindow({
      id: "strong",
      symbol: "STRONG",
      medianReturn: 0.2,
      volatility: 0.01,
    });
    const rows = [
      marketRow([weak]),
      marketRow([long]),
      marketRow([short], "Metals"),
      marketRow([strong]),
    ];
    expect(
      rankedMarketWindows(rows, "all", "all", 3).map((row) => row.id),
    ).toEqual(["short", "strong", long.id]);
    expect(rankedMarketWindows(rows, "all", "short", 10)).toEqual([short]);
    expect(rankedMarketWindows(rows, "Metals", "all", 10)).toEqual([short]);
    expect(
      rankedMarketWindows(rows, "Forex", "long", 10).map((row) => row.id),
    ).toEqual(["strong", long.id, "weak"]);
  });

  it("removes overlapping same-direction windows without suppressing the other direction", () => {
    const base = marketWindow();
    const duplicate = marketWindow({
      id: "overlap",
      startDate: "2026-10-12",
      endDate: "2026-11-01",
    });
    const short = marketWindow({
      id: "short",
      direction: -1,
      meanReturn: -0.04,
      medianReturn: -0.05,
    });
    expect(
      rankedMarketWindows(
        [marketRow([base, duplicate, short])],
        "all",
        "all",
        10,
      ),
    ).toEqual([base, short]);
  });
});
