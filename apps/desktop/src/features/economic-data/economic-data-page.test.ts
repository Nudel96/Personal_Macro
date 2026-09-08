import { describe, expect, it } from "vitest";
import type { EodhdIndicatorHistory } from "../../types/domain";
import {
  buildEconomicChartOption,
  buildEconomicSurpriseChartOption,
  calculateEconomicMetrics,
  parseEconomicValue,
} from "./economic-data-page";
import {
  chartMode,
  economicCategories,
  economicIndicators,
  economicIndicatorsFor,
  indicatorLabel,
  indicatorSupportsCurrency,
  isPairComparableIndicator,
  supportedEconomies,
} from "./economic-data-config";

function history(
  overrides: Partial<EodhdIndicatorHistory> = {},
): EodhdIndicatorHistory {
  return {
    currency: "USD",
    country: "US",
    canonicalKey: "nfp",
    label: "Nonfarm Payrolls",
    factor: "labor",
    direction: 1,
    comparison: null,
    frequency: "Monthly",
    unit: "thousands",
    freshnessDays: 62,
    months: 24,
    from: "2024-08-16T00:00:00Z",
    to: "2026-08-16T00:00:00Z",
    nextReleaseAt: null,
    points: [
      {
        id: "one",
        country: "US",
        providerType: "Nonfarm Payrolls",
        comparison: null,
        period: "Jun 2026",
        releasedAt: "2026-07-03T12:30:00Z",
        actualText: "147",
        forecastText: "110",
        previousText: "139",
        frequency: "Monthly",
        unit: "thousands",
        revisionCount: 0,
        sourceUrl: "https://eodhd.com/",
      },
      {
        id: "two",
        country: "US",
        providerType: "Nonfarm Payrolls",
        comparison: null,
        period: "Jul 2026",
        releasedAt: "2026-08-07T12:30:00Z",
        actualText: null,
        forecastText: "105",
        previousText: "147",
        frequency: "Monthly",
        unit: "thousands",
        revisionCount: 1,
        sourceUrl: "https://eodhd.com/",
      },
    ],
    ...overrides,
  };
}

describe("economic data visualization", () => {
  it("keeps missing values unavailable instead of converting them to zero", () => {
    expect(parseEconomicValue(null)).toBeNull();
    expect(parseEconomicValue("not-a-number")).toBeNull();
    expect(parseEconomicValue("0")).toBe(0);

    const option = buildEconomicChartOption(history());
    const series = option.series as Array<{
      name?: string;
      data?: unknown[];
      type?: string;
    }>;
    expect(series[0]).toMatchObject({ name: "Actual", type: "bar" });
    expect(series[0].data).toEqual([147, null]);
    expect(series[1]).toMatchObject({ name: "Forecast", type: "scatter" });
    expect(series[2]).toMatchObject({ name: "Previous", type: "line" });
  });

  it("uses a line for weekly claims and a step line for rates", () => {
    expect(
      chartMode({ canonicalKey: "unemployment_claims", frequency: "Weekly" }),
    ).toBe("line");
    expect(
      chartMode({ canonicalKey: "interest_rates", frequency: "Meeting" }),
    ).toBe("step");
  });

  it("adds the neutral 50 reference to PMI charts", () => {
    const option = buildEconomicChartOption(
      history({ canonicalKey: "manufacturing_pmi", frequency: "Monthly" }),
    );
    const series = option.series as Array<{
      markLine?: { data?: Array<{ yAxis?: number }> };
    }>;
    expect(series[0].markLine?.data).toEqual([{ yAxis: 50 }]);

    const chinaOption = buildEconomicChartOption(
      history({
        currency: "CNY",
        canonicalKey: "china_private_manufacturing_pmi",
        frequency: "Monthly",
      }),
    );
    const chinaSeries = chinaOption.series as Array<{
      markLine?: { data?: Array<{ yAxis?: number }> };
    }>;
    expect(chinaSeries[0].markLine?.data).toEqual([{ yAxis: 50 }]);
  });

  it("derives quality and surprise metrics without treating missing actuals as zero", () => {
    const metrics = calculateEconomicMetrics(history());
    expect(metrics).toMatchObject({
      releaseCount: 2,
      actualCount: 1,
      completeSurpriseCount: 1,
      forecastCoverage: 100,
      directionalPositiveRate: 100,
      meanAbsoluteError: 37,
      momentum: null,
      revisionCount: 1,
    });

    const option = buildEconomicSurpriseChartOption(history());
    const series = option.series as Array<{ name?: string; data?: unknown[] }>;
    expect(series[0].name).toBe("Actual − Forecast");
    expect(series[0].data?.[1]).toBeNull();
  });

  it("uses country-specific indicator labels", () => {
    expect(indicatorLabel("pce_yoy", "USD")).toBe("Core PCE Price Index");
    expect(indicatorLabel("pce_yoy", "AUD")).toBe("Trimmed Mean CPI");
    expect(indicatorLabel("nfp", "GBP")).toBe("Employment Change");
    expect(indicatorLabel("unemployment_claims", "USD")).toBe(
      "Unemployment Claims",
    );
  });

  it("exposes the complete currency-first economic data catalog", () => {
    expect(supportedEconomies.map((economy) => economy.currency)).toEqual([
      "AUD",
      "CAD",
      "CHF",
      "CNY",
      "EUR",
      "GBP",
      "JPY",
      "NZD",
      "USD",
    ]);
    expect(economicCategories.map((category) => category.key)).toEqual([
      "growth",
      "inflation",
      "labor",
      "rates",
    ]);
    expect(economicIndicators).toHaveLength(31);
    expect(
      economicIndicators
        .filter(
          (indicator) =>
            indicator.category === "labor" && !indicator.supportedCurrencies,
        )
        .map((indicator) => indicator.key),
    ).toEqual([
      "nfp",
      "unemployment_rate",
      "unemployment_claims",
      "adp",
      "jolts",
      "wage_growth",
    ]);
    expect(
      economicIndicators
        .filter(
          (indicator) =>
            indicator.category === "inflation" &&
            !indicator.supportedCurrencies,
        )
        .map((indicator) => indicator.key),
    ).toEqual(["cpi_yoy", "ppi_yoy", "pce_yoy"]);
    expect(
      economicIndicators
        .filter(
          (indicator) =>
            indicator.category === "growth" && !indicator.supportedCurrencies,
        )
        .map((indicator) => indicator.key),
    ).toEqual([
      "gdp",
      "manufacturing_pmi",
      "services_pmi",
      "retail_sales",
      "consumer_confidence",
      "industrial_production",
      "trade_balance",
    ]);
  });

  it("shows the additional provider-native releases only for China", () => {
    const chinaGrowth = economicIndicatorsFor("CNY", "growth").map(
      (indicator) => indicator.key,
    );
    const chinaRates = economicIndicatorsFor("CNY", "rates").map(
      (indicator) => indicator.key,
    );
    const usdGrowth = economicIndicatorsFor("USD", "growth").map(
      (indicator) => indicator.key,
    );

    expect(chinaGrowth).toEqual(
      expect.arrayContaining([
        "china_private_manufacturing_pmi",
        "china_private_services_pmi",
        "fixed_asset_investment",
        "exports_yoy",
        "imports_yoy",
        "industrial_profits_yoy",
        "industrial_capacity_utilization",
        "current_account",
        "foreign_direct_investment",
      ]),
    );
    expect(chinaRates).toEqual(
      expect.arrayContaining([
        "m2_money_supply_yoy",
        "new_yuan_loans",
        "total_social_financing",
        "loan_prime_rate_5y",
      ]),
    );
    expect(usdGrowth).not.toContain("fixed_asset_investment");
    expect(indicatorSupportsCurrency("new_yuan_loans", "CNY")).toBe(true);
    expect(indicatorSupportsCurrency("new_yuan_loans", "USD")).toBe(false);
    expect(isPairComparableIndicator("new_yuan_loans")).toBe(false);
    expect(isPairComparableIndicator("gdp")).toBe(true);
  });
});
