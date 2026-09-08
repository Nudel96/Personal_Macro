import { describe, expect, it } from "vitest";
import type {
  FundamentalCurrencyView,
  FundamentalIndicatorView,
} from "../../types/domain";
import { detectMacroRegime } from "./regime-detection";

const currencyCodes = ["EUR", "GBP", "USD", "JPY"];

function indicator(
  key: string,
  factor: FundamentalIndicatorView["factor"],
  score: -1 | 0 | 1,
  available = true,
): FundamentalIndicatorView {
  return {
    key,
    label: key,
    factor,
    direction: 1,
    score,
    status: available ? (score === 0 ? "neutral" : "scored") : "missingActual",
    reasonCodes: available ? [] : ["missing_actual"],
  };
}

function currency(
  currency: string,
  growth: -1 | 0 | 1,
  inflation: -1 | 0 | 1,
  rates: -1 | 0 | 1 = 0,
): FundamentalCurrencyView {
  return {
    currency,
    economicGrowthScore: growth,
    inflationScore: inflation,
    ratesScore: rates,
    jobsMarketScore: growth,
    fundamentalsScore: growth + inflation + rates,
    economicGrowthBias:
      growth > 0 ? "Bullish" : growth < 0 ? "Bearish" : "Neutral",
    inflationBias:
      inflation > 0 ? "Bullish" : inflation < 0 ? "Bearish" : "Neutral",
    ratesBias: rates > 0 ? "Bullish" : rates < 0 ? "Bearish" : "Neutral",
    jobsMarketBias: growth > 0 ? "Bullish" : growth < 0 ? "Bearish" : "Neutral",
    fundamentalsBias: "Neutral",
    indicators: [
      indicator("gdp", "growth", growth),
      indicator("employment", "labor", growth),
      indicator("cpi", "inflation", inflation),
      indicator("interest_rates", "rates", rates),
    ],
  };
}

function world(
  growth: -1 | 0 | 1,
  inflation: -1 | 0 | 1,
  rates: -1 | 0 | 1 = 0,
) {
  return currencyCodes.map((code) => currency(code, growth, inflation, rates));
}

describe("detectMacroRegime", () => {
  it("recognizes disinflationary growth and a hawkish policy surprise", () => {
    const result = detectMacroRegime(world(1, -1, 1));

    expect(result.key).toBe("goldilocks");
    expect(result.label).toBe("Disinflationäres Wachstum");
    expect(result.growth.score).toBe(1);
    expect(result.inflation.score).toBe(-1);
    expect(result.policy.signal).toBe("positive");
    expect(result.coverage).toBe(1);
    expect(result.confidence).toBe("high");
  });

  it("recognizes a stagflationary impulse", () => {
    const result = detectMacroRegime(world(-1, 1));

    expect(result.key).toBe("stagflation");
    expect(result.growth.signal).toBe("negative");
    expect(result.inflation.signal).toBe("positive");
  });

  it("treats exact forecast matches as available neutral evidence", () => {
    const result = detectMacroRegime(world(0, 0));

    expect(result.key).toBe("balanced");
    expect(result.growth.signal).toBe("neutral");
    expect(result.inflation.signal).toBe("neutral");
    expect(result.coverage).toBe(1);
  });

  it("does not classify a regime with fewer than four covered currencies", () => {
    const sparse = world(1, -1).map((entry, index) => ({
      ...entry,
      indicators: entry.indicators.map((item) =>
        index < 3
          ? item
          : {
              ...item,
              status: "missingActual" as const,
              reasonCodes: ["missing_actual"],
            },
      ),
    }));

    const result = detectMacroRegime(sparse);

    expect(result.key).toBe("unavailable");
    expect(result.confidence).toBe("unavailable");
    expect(result.growth.availableCurrencies).toBe(3);
  });

  it("weights growth and labor equally within each currency", () => {
    const inputs = currencyCodes.map((code) => {
      const view = currency(code, 1, 0);
      return {
        ...view,
        indicators: [
          indicator("gdp", "growth", 1),
          indicator("pmi", "growth", 1),
          indicator("retail", "growth", 1),
          indicator("employment", "labor", -1),
          indicator("cpi", "inflation", 0),
          indicator("rates", "rates", 0),
        ],
      };
    });

    const result = detectMacroRegime(inputs);

    expect(result.growth.score).toBe(0);
    expect(result.growth.signal).toBe("neutral");
  });
});
