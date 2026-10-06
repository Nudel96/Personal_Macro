import { describe, expect, it, vi } from "vitest";
import type {
  SeasonalOpportunity,
  SeasonalityScreenerRow,
} from "../../types/domain";
import {
  collectCloudBatches,
  distinctOpportunityTop,
  mergeScreenerBatches,
} from "./cloud-seasonality-batches";

const row = (
  id: string,
  overrides: Partial<SeasonalOpportunity> = {},
): SeasonalOpportunity => ({
  id,
  symbol: "EUR",
  label: "Euro",
  comparisonSymbol: null,
  comparisonLabel: null,
  startDate: "2026-09-01",
  endDate: "2026-09-21",
  calendarDays: 20,
  direction: 1,
  meanReturn: 0.1,
  medianReturn: 0.1,
  comparisonMeanReturn: null,
  comparisonMedianReturn: null,
  meanDifference: null,
  medianDifference: null,
  hitRate: 0.8,
  wilsonLowerBound: 0.7,
  volatility: 0.2,
  samples: 20,
  years: [],
  observations: [],
  curve: [],
  source: "EODHD",
  sourceSymbol: "EURUSD.FOREX",
  comparisonSourceSymbol: null,
  inverted: false,
  comparisonInverted: false,
  ...overrides,
});
describe("bounded cloud Seasonality collection", () => {
  it("serializes batches and completes only a single pinned generation", async () => {
    const request = vi.fn(async (cursor: number) => ({
      generation: "g",
      nextCursor: cursor === 0 ? 5 : null,
      total: 7,
      completed: cursor === 0 ? 5 : 7,
      value: cursor,
    }));
    const progress = vi.fn();
    expect(
      await collectCloudBatches("g", request, () => false, progress),
    ).toEqual([0, 5]);
    expect(request.mock.calls).toEqual([[0], [5]]);
    expect(progress).toHaveBeenLastCalledWith(7, 7);
  });
  it("rejects a generation change or cursor cycle without exposing partial results", async () => {
    const request = vi.fn(async (cursor: number) => ({
      generation: cursor === 0 ? "g" : "changed",
      nextCursor: cursor === 0 ? 5 : null,
      total: 7,
      completed: cursor === 0 ? 5 : 7,
      value: cursor,
    }));
    await expect(
      collectCloudBatches(
        "g",
        request,
        () => false,
        () => {},
      ),
    ).rejects.toThrow(/Datenstand/);
    await expect(
      collectCloudBatches(
        "g",
        async () => ({
          generation: "g",
          nextCursor: 0,
          total: 7,
          completed: 0,
          value: 1,
        }),
        () => false,
        () => {},
      ),
    ).rejects.toThrow(/Datenstand/);
  });
  it("stops after the in-flight batch on cancellation", async () => {
    let cancelled = false;
    const request = vi.fn(async () => {
      cancelled = true;
      return {
        generation: "g",
        nextCursor: 5,
        total: 7,
        completed: 5,
        value: 1,
      };
    });
    await expect(
      collectCloudBatches(
        "g",
        request,
        () => cancelled,
        () => {},
      ),
    ).rejects.toThrow(/abgebrochen/);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("keeps exact native strength, sample and deterministic id ordering", () => {
    const a = row("a"),
      b = row("b", { symbol: "JPY", samples: 21 }),
      c = row("c", { symbol: "GBP", medianReturn: 0.2 });
    expect(distinctOpportunityTop([a, b, c], 10).map((v) => v.id)).toEqual([
      "c",
      "b",
      "a",
    ]);
    expect(
      distinctOpportunityTop([row("z"), row("a")], 10).map((v) => v.id),
    ).toEqual(["a"]);
  });
  it("removes 75 percent overlap only within the same symbol, comparison and direction", () => {
    const base = row("a");
    const duplicate = row("b", {
      startDate: "2026-09-06",
      endDate: "2026-09-26",
    });
    const separate = row("c", {
      startDate: "2026-09-07",
      endDate: "2026-09-27",
    });
    const short = row("d", { direction: -1 });
    const other = row("e", { comparisonSymbol: "JPY" });
    expect(
      distinctOpportunityTop([base, duplicate, separate, short, other], 10).map(
        (v) => v.id,
      ),
    ).toEqual(["a", "c", "d", "e"]);
  });
  it("ranks screener confidence with the native five-sample threshold", () => {
    const make = (
      symbol: string,
      n: number,
      p: number,
    ): SeasonalityScreenerRow => ({
      symbol,
      category: "Forex",
      completeYears: n,
      qualityStatus: "available",
      calculatedAt: "2026-09-01",
      dataSource: "EODHD",
      missingDays: 0,
      bullishWindow: {
        startDate: "09-01",
        tradingDays: 20,
        samples: n,
        positiveRatio: p,
        qualityStatus: "available",
        years: [],
        yearReturns: [],
      },
    });
    expect(
      mergeScreenerBatches([
        [make("tiny", 4, 1)],
        [make("short", 5, 1), make("long", 20, 1)],
      ]).map((v) => v.symbol),
    ).toEqual(["long", "short", "tiny"]);
    expect(() =>
      mergeScreenerBatches([[make("same", 5, 1)], [make("same", 20, 1)]]),
    ).toThrow(/doppelte/);
  });
});
