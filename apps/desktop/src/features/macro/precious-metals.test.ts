import { describe, expect, it } from "vitest";
import type { FundamentalCurrencyView } from "../../types/domain";
import { buildPreciousMetalUsdViews } from "./precious-metals";

const template = [
  { key: "gdp", label: "GDP", factor: "growth" },
  { key: "cpi_yoy", label: "CPI YoY", factor: "inflation" },
  { key: "unemployment_rate", label: "Unemployment Rate", factor: "labor" },
  { key: "interest_rates", label: "Interest Rates", factor: "rates" },
] as const;

function usdView(): FundamentalCurrencyView {
  return {
    currency: "USD",
    economicGrowthScore: 1,
    inflationScore: 1,
    ratesScore: 1,
    jobsMarketScore: -1,
    fundamentalsScore: 2,
    economicGrowthBias: "Bullish",
    inflationBias: "Bullish",
    ratesBias: "Bullish",
    jobsMarketBias: "Bearish",
    fundamentalsBias: "Bullish",
    indicators: template.map((field) => ({
      ...field,
      direction: field.factor === "labor" ? -1 : 1,
      actualText: "4.2",
      forecastText: "4.1",
      previousText: "4.0",
      surpriseText: "0.1",
      sourceLabel: `${field.label} US source`,
      sourceUrl: "https://eodhd.com/api/economic-events",
      releasedAt: "2026-10-02T12:30:00Z",
      pendingNewerReleaseAt: "2026-10-09T12:30:00Z",
      frequency: "Monthly",
      unit: "percent",
      score: field.factor === "labor" ? -1 : 1,
      status: "scored",
      reasonCodes: [],
    })),
  };
}

describe("precious metal USD display model", () => {
  it("inverts available USD signals exactly once and preserves US source observations", () => {
    const usd = usdView();
    const original = structuredClone(usd);
    const results = buildPreciousMetalUsdViews(usd, template);
    expect(results.map((metal) => metal.definition.cotSymbol)).toEqual([
      "GOLD",
      "SILVER",
    ]);
    for (const metal of results) {
      expect(metal.score).toBe(-2);
      expect(metal.availableIndicators).toBe(4);
      expect(metal.view).toMatchObject({
        economicGrowthScore: -1,
        inflationScore: -1,
        jobsMarketScore: 1,
        ratesScore: -1,
      });
      metal.view.indicators.forEach((indicator, index) => {
        expect(indicator).toMatchObject({
          ...usd.indicators[index],
          score: -usd.indicators[index].score,
          direction: -usd.indicators[index].direction,
        });
      });
    }
    expect(usd).toEqual(original);
  });

  it.each([-1, 0, 1] as const)(
    "preserves antisymmetry for USD signal %s including true neutral",
    (signal) => {
      const usd = usdView();
      usd.indicators = usd.indicators.map((indicator) => ({
        ...indicator,
        score: signal,
        status: signal === 0 ? "neutral" : "scored",
      }));
      const results = buildPreciousMetalUsdViews(usd, template);
      for (const metal of results) {
        expect(metal.score).toBe(signal === 0 ? 0 : -signal * 4);
        expect(metal.view.indicators[0].score).toBe(signal === 0 ? 0 : -signal);
        expect(Object.is(metal.view.indicators[0].score, -0)).toBe(false);
        expect(metal.availableIndicators).toBe(4);
      }
    },
  );

  it("excludes missing, stale and future releases and recalculates from usable components", () => {
    const usd = usdView();
    usd.indicators[0] = {
      ...usd.indicators[0],
      status: "unmapped",
      reasonCodes: ["stale_release"],
    };
    usd.indicators[1] = {
      ...usd.indicators[1],
      status: "missingForecast",
      forecastText: null,
    };
    usd.indicators[3] = { ...usd.indicators[3], status: "futureRelease" };
    for (const metal of buildPreciousMetalUsdViews(usd, template)) {
      expect(metal.score).toBe(1);
      expect(metal.availableIndicators).toBe(1);
      expect(metal.view.economicGrowthScore).toBe(0);
      expect(metal.view.indicators[0].status).toBe("unmapped");
      expect(metal.view.indicators[0].reasonCodes).toEqual(["stale_release"]);
      expect(metal.view.indicators[1].forecastText).toBeNull();
    }
  });

  it("keeps absent USD and entirely unavailable evidence distinct from a neutral score", () => {
    const usd = usdView();
    usd.indicators = usd.indicators.map((indicator) => ({
      ...indicator,
      status: "missingActual",
    }));
    for (const source of [usd, undefined]) {
      for (const metal of buildPreciousMetalUsdViews(source, template)) {
        expect(metal.score).toBeNull();
        expect(metal.availableIndicators).toBe(0);
        expect(metal.view.indicators).toHaveLength(4);
        expect(
          metal.view.indicators.every(
            (indicator) => indicator.status !== "neutral",
          ),
        ).toBe(true);
      }
    }
  });
});
