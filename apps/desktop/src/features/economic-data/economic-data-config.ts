import type {
  EconomicValueUnit,
  EodhdIndicatorHistory,
} from "../../types/domain";

export type EconomicCategoryKey = "growth" | "inflation" | "labor" | "rates";

export type EconomicChartMode = "bar" | "line" | "step";

export interface EconomicIndicatorDefinition {
  key: string;
  category: EconomicCategoryKey;
  defaultLabel: string;
  unit: EconomicValueUnit;
  supportedCurrencies?: readonly string[];
  pairComparable?: boolean;
}

export const economicCategories: Array<{
  key: EconomicCategoryKey;
  label: string;
  description: string;
}> = [
  {
    key: "growth",
    label: "Wachstum & Aktivität",
    description: "Produktion, Nachfrage und Unternehmensumfragen",
  },
  {
    key: "inflation",
    label: "Inflation & Preise",
    description: "Verbraucher-, Produzenten- und Kerninflation",
  },
  {
    key: "labor",
    label: "Arbeitsmarkt",
    description: "Beschäftigung, Arbeitslosigkeit und offene Stellen",
  },
  {
    key: "rates",
    label: "Geldpolitik & Zinsen",
    description: "Leitzinsentscheidungen und Markterwartungen",
  },
];

export const economicIndicators: EconomicIndicatorDefinition[] = [
  {
    key: "gdp",
    category: "growth",
    defaultLabel: "GDP / BIP",
    unit: "percent",
  },
  {
    key: "manufacturing_pmi",
    category: "growth",
    defaultLabel: "Manufacturing PMI",
    unit: "index",
  },
  {
    key: "services_pmi",
    category: "growth",
    defaultLabel: "Services PMI",
    unit: "index",
  },
  {
    key: "retail_sales",
    category: "growth",
    defaultLabel: "Retail Sales",
    unit: "percent",
  },
  {
    key: "consumer_confidence",
    category: "growth",
    defaultLabel: "Consumer Confidence",
    unit: "index",
  },
  {
    key: "industrial_production",
    category: "growth",
    defaultLabel: "Industrial Production",
    unit: "percent",
  },
  {
    key: "trade_balance",
    category: "growth",
    defaultLabel: "Trade Balance",
    unit: "billions",
  },
  {
    key: "cpi_yoy",
    category: "inflation",
    defaultLabel: "CPI",
    unit: "percent",
  },
  {
    key: "ppi_yoy",
    category: "inflation",
    defaultLabel: "PPI",
    unit: "percent",
  },
  {
    key: "pce_yoy",
    category: "inflation",
    defaultLabel: "Kerninflation",
    unit: "percent",
  },
  {
    key: "nfp",
    category: "labor",
    defaultLabel: "Employment Change",
    unit: "thousands",
  },
  {
    key: "unemployment_rate",
    category: "labor",
    defaultLabel: "Unemployment Rate",
    unit: "percent",
  },
  {
    key: "unemployment_claims",
    category: "labor",
    defaultLabel: "Unemployment Claims",
    unit: "thousands",
  },
  {
    key: "adp",
    category: "labor",
    defaultLabel: "ADP Employment Change",
    unit: "thousands",
  },
  {
    key: "jolts",
    category: "labor",
    defaultLabel: "Labor Demand",
    unit: "value",
  },
  {
    key: "wage_growth",
    category: "labor",
    defaultLabel: "Wage Growth",
    unit: "percent",
  },
  {
    key: "interest_rates",
    category: "rates",
    defaultLabel: "Interest Rate Decision",
    unit: "percent",
  },
  {
    key: "china_private_manufacturing_pmi",
    category: "growth",
    defaultLabel: "S&P Global / Caixin Manufacturing PMI",
    unit: "index",
    supportedCurrencies: ["CNY"],
    pairComparable: false,
  },
  {
    key: "china_private_services_pmi",
    category: "growth",
    defaultLabel: "S&P Global / Caixin Services PMI",
    unit: "index",
    supportedCurrencies: ["CNY"],
    pairComparable: false,
  },
  {
    key: "fixed_asset_investment",
    category: "growth",
    defaultLabel: "Anlageinvestitionen",
    unit: "percent",
    supportedCurrencies: ["CNY"],
    pairComparable: false,
  },
  {
    key: "exports_yoy",
    category: "growth",
    defaultLabel: "Exporte YoY",
    unit: "percent",
    supportedCurrencies: ["CNY"],
    pairComparable: false,
  },
  {
    key: "imports_yoy",
    category: "growth",
    defaultLabel: "Importe YoY",
    unit: "percent",
    supportedCurrencies: ["CNY"],
    pairComparable: false,
  },
  {
    key: "industrial_profits_yoy",
    category: "growth",
    defaultLabel: "Industriegewinne YoY",
    unit: "percent",
    supportedCurrencies: ["CNY"],
    pairComparable: false,
  },
  {
    key: "industrial_capacity_utilization",
    category: "growth",
    defaultLabel: "Industrie-Kapazitätsauslastung",
    unit: "percent",
    supportedCurrencies: ["CNY"],
    pairComparable: false,
  },
  {
    key: "current_account",
    category: "growth",
    defaultLabel: "Leistungsbilanz",
    unit: "billions",
    supportedCurrencies: ["CNY"],
    pairComparable: false,
  },
  {
    key: "foreign_direct_investment",
    category: "growth",
    defaultLabel: "Ausländische Direktinvestitionen",
    unit: "percent",
    supportedCurrencies: ["CNY"],
    pairComparable: false,
  },
  {
    key: "house_price_index_yoy",
    category: "inflation",
    defaultLabel: "Hauspreisindex YoY",
    unit: "percent",
    supportedCurrencies: ["CNY"],
    pairComparable: false,
  },
  {
    key: "m2_money_supply_yoy",
    category: "rates",
    defaultLabel: "M2-Geldmenge YoY",
    unit: "percent",
    supportedCurrencies: ["CNY"],
    pairComparable: false,
  },
  {
    key: "new_yuan_loans",
    category: "rates",
    defaultLabel: "Neue Yuan-Kredite",
    unit: "billions",
    supportedCurrencies: ["CNY"],
    pairComparable: false,
  },
  {
    key: "total_social_financing",
    category: "rates",
    defaultLabel: "Gesamtfinanzierung",
    unit: "billions",
    supportedCurrencies: ["CNY"],
    pairComparable: false,
  },
  {
    key: "loan_prime_rate_5y",
    category: "rates",
    defaultLabel: "5-Jahres Loan Prime Rate",
    unit: "percent",
    supportedCurrencies: ["CNY"],
    pairComparable: false,
  },
];

export const supportedEconomies = [
  { currency: "AUD", label: "Australien", shortLabel: "AUD · Australien" },
  { currency: "CAD", label: "Kanada", shortLabel: "CAD · Kanada" },
  { currency: "CHF", label: "Schweiz", shortLabel: "CHF · Schweiz" },
  { currency: "CNY", label: "China", shortLabel: "CNY · China" },
  { currency: "EUR", label: "Eurozone", shortLabel: "EUR · Eurozone" },
  {
    currency: "GBP",
    label: "Großbritannien",
    shortLabel: "GBP · Großbritannien",
  },
  { currency: "JPY", label: "Japan", shortLabel: "JPY · Japan" },
  {
    currency: "NZD",
    label: "Neuseeland",
    shortLabel: "NZD · Neuseeland",
  },
  { currency: "USD", label: "USA", shortLabel: "USD · USA" },
] as const;

const countrySpecificLabels: Record<string, Record<string, string>> = {
  AUD: {
    pce_yoy: "Trimmed Mean CPI",
    consumer_confidence: "Westpac Consumer Confidence",
    wage_growth: "Wage Price Index",
  },
  CAD: { pce_yoy: "Median CPI", wage_growth: "Average Hourly Wages" },
  CHF: { nfp: "Non Farm Payrolls" },
  EUR: { pce_yoy: "Core Inflation Rate", wage_growth: "Wage Growth" },
  GBP: {
    pce_yoy: "Core Inflation Rate",
    unemployment_claims: "Claimant Count Change",
    nfp: "Employment Change",
    wage_growth: "Average Earnings ex Bonus",
  },
  JPY: {
    pce_yoy: "Core Inflation Rate",
    jolts: "Jobs-to-Applicants Ratio",
    wage_growth: "Average Cash Earnings",
  },
  NZD: {
    manufacturing_pmi: "Business NZ PMI",
    services_pmi: "Services NZ PSI",
    wage_growth: "Labour Cost Index",
  },
  USD: {
    pce_yoy: "Core PCE Price Index",
    manufacturing_pmi: "ISM Manufacturing PMI",
    services_pmi: "ISM Services PMI",
    nfp: "Nonfarm Payrolls",
    unemployment_claims: "Unemployment Claims",
    jolts: "JOLTS Job Openings",
    wage_growth: "Average Hourly Earnings",
  },
  CNY: {
    manufacturing_pmi: "NBS Manufacturing PMI",
    services_pmi: "NBS Non-Manufacturing PMI",
    interest_rates: "1-Year Loan Prime Rate",
  },
};

export function indicatorLabel(key: string, currency: string) {
  return (
    countrySpecificLabels[currency]?.[key] ??
    economicIndicators.find((indicator) => indicator.key === key)
      ?.defaultLabel ??
    key
  );
}

export function economicIndicatorsFor(
  currency: string,
  category: EconomicCategoryKey,
) {
  return economicIndicators.filter(
    (indicator) =>
      indicator.category === category &&
      (!indicator.supportedCurrencies ||
        indicator.supportedCurrencies.includes(currency)),
  );
}

export function indicatorSupportsCurrency(key: string, currency: string) {
  const indicator = economicIndicators.find((item) => item.key === key);
  return Boolean(
    indicator &&
    (!indicator.supportedCurrencies ||
      indicator.supportedCurrencies.includes(currency)),
  );
}

export function isPairComparableIndicator(key: string) {
  return (
    economicIndicators.find((indicator) => indicator.key === key)
      ?.pairComparable !== false
  );
}

export function economyLabel(currency: string) {
  return (
    supportedEconomies.find((economy) => economy.currency === currency)
      ?.shortLabel ?? currency
  );
}

export function chartMode(
  history: Pick<EodhdIndicatorHistory, "canonicalKey" | "frequency">,
): EconomicChartMode {
  if (history.canonicalKey === "interest_rates") return "step";
  if (
    history.canonicalKey === "manufacturing_pmi" ||
    history.canonicalKey === "services_pmi" ||
    history.canonicalKey === "china_private_manufacturing_pmi" ||
    history.canonicalKey === "china_private_services_pmi" ||
    history.canonicalKey === "consumer_confidence" ||
    history.canonicalKey === "industrial_production" ||
    history.canonicalKey === "fixed_asset_investment" ||
    history.canonicalKey === "industrial_profits_yoy" ||
    history.canonicalKey === "industrial_capacity_utilization" ||
    history.canonicalKey === "foreign_direct_investment" ||
    history.canonicalKey === "house_price_index_yoy" ||
    history.canonicalKey === "m2_money_supply_yoy" ||
    history.canonicalKey === "wage_growth" ||
    history.canonicalKey === "unemployment_rate" ||
    history.frequency?.toLowerCase().includes("weekly")
  ) {
    return "line";
  }
  return "bar";
}

export function unitLabel(key: string, seriesUnit?: EconomicValueUnit | null) {
  const unit =
    seriesUnit ??
    economicIndicators.find((indicator) => indicator.key === key)?.unit;
  if (unit === "percent") return "%";
  if (unit === "thousands") return "Tsd.";
  if (unit === "millions") return "Mio.";
  if (unit === "billions") return "Mrd.";
  if (unit === "ratio") return "Verhältnis";
  if (unit === "index") return "Indexpunkte";
  return "Wert";
}
