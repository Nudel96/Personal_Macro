import type {
  FundamentalCurrencyView,
  FundamentalIndicatorView,
} from "../../types/domain";

export const preciousMetalDefinitions = [
  { currency: "XAU", name: "Gold", cotSymbol: "GOLD" },
  { currency: "XAG", name: "Silber", cotSymbol: "SILVER" },
] as const;

export interface PreciousMetalUsdView {
  definition: (typeof preciousMetalDefinitions)[number];
  view: FundamentalCurrencyView;
  availableIndicators: number;
  score: number | null;
}

type IndicatorTemplate = Pick<
  FundamentalIndicatorView,
  "key" | "label" | "factor"
>;

export function isAvailableIndicator(indicator: FundamentalIndicatorView) {
  return indicator.status === "scored" || indicator.status === "neutral";
}

function bias(score: number): FundamentalCurrencyView["fundamentalsBias"] {
  return score > 0 ? "Bullish" : score < 0 ? "Bearish" : "Neutral";
}

/**
 * A display model of the USD channel, shared by desktop and private web.
 * US observations stay unchanged. Only their available currency signals are
 * inverted; this is neither a measured correlation nor a total metal forecast.
 */
export function buildPreciousMetalUsdViews(
  usd: FundamentalCurrencyView | undefined,
  template: readonly IndicatorTemplate[],
): PreciousMetalUsdView[] {
  return preciousMetalDefinitions.map((definition) => {
    const indicators: FundamentalIndicatorView[] = template.map((field) => {
      const source = usd?.indicators.find(
        (indicator) => indicator.key === field.key,
      );
      if (!source) {
        return {
          ...field,
          direction: -1,
          score: 0,
          status: "unmapped",
          reasonCodes: ["usd_indicator_unavailable"],
        };
      }
      return {
        ...source,
        direction: source.direction === 1 ? -1 : 1,
        score: isAvailableIndicator(source)
          ? source.score === 0
            ? 0
            : source.score === 1
              ? -1
              : 1
          : 0,
        reasonCodes: [...source.reasonCodes],
      };
    });
    const available = indicators.filter(isAvailableIndicator);
    const factorScore = (factor: FundamentalIndicatorView["factor"]) =>
      available
        .filter((indicator) => indicator.factor === factor)
        .reduce((sum, indicator) => sum + indicator.score, 0);
    const economicGrowthScore = factorScore("growth");
    const inflationScore = factorScore("inflation");
    const ratesScore = factorScore("rates");
    const jobsMarketScore = factorScore("labor");
    const fundamentalsScore = available.reduce(
      (sum, indicator) => sum + indicator.score,
      0,
    );

    return {
      definition,
      availableIndicators: available.length,
      score: available.length ? fundamentalsScore : null,
      view: {
        currency: definition.currency,
        indicators,
        economicGrowthScore,
        inflationScore,
        ratesScore,
        jobsMarketScore,
        fundamentalsScore,
        economicGrowthBias: bias(economicGrowthScore),
        inflationBias: bias(inflationScore),
        ratesBias: bias(ratesScore),
        jobsMarketBias: bias(jobsMarketScore),
        fundamentalsBias: bias(fundamentalsScore),
      },
    };
  });
}
