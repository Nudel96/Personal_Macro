import type {
  FundamentalCurrencyView,
  FundamentalIndicatorView,
} from "../../types/domain";

export type MacroRegimeKey =
  | "goldilocks"
  | "reflation"
  | "expansion"
  | "stagflation"
  | "disinflationary_slowdown"
  | "slowdown"
  | "inflation_pressure"
  | "disinflation"
  | "balanced"
  | "unavailable";

export type RegimeSignal = "positive" | "neutral" | "negative" | "unavailable";
export type RegimeConfidence = "high" | "medium" | "low" | "unavailable";

export interface RegimeDimension {
  score: number | null;
  signal: RegimeSignal;
  coverage: number;
  availableObservations: number;
  expectedObservations: number;
  availableCurrencies: number;
  totalCurrencies: number;
}

export interface MacroRegimeAssessment {
  key: MacroRegimeKey;
  label: string;
  summary: string;
  confidence: RegimeConfidence;
  coverage: number;
  growth: RegimeDimension;
  inflation: RegimeDimension;
  policy: RegimeDimension;
}

const SIGNAL_THRESHOLD = 0.15;
const MIN_CURRENCIES = 4;
const MIN_COVERAGE = 0.4;

const availableStatuses = new Set<FundamentalIndicatorView["status"]>([
  "scored",
  "neutral",
]);

export function detectMacroRegime(
  currencies: FundamentalCurrencyView[],
): MacroRegimeAssessment {
  const growth = aggregateDimension(currencies, ["growth", "labor"]);
  const inflation = aggregateDimension(currencies, ["inflation"]);
  const policy = aggregateDimension(currencies, ["rates"]);
  const coverage = mean([growth.coverage, inflation.coverage]);

  if (!dimensionIsUsable(growth) || !dimensionIsUsable(inflation)) {
    return {
      key: "unavailable",
      label: "Regime nicht belastbar",
      summary:
        "Für eine globale Einordnung werden belastbare Wachstums- und Inflationsdaten aus mindestens vier Währungen benötigt.",
      confidence: "unavailable",
      coverage,
      growth,
      inflation,
      policy,
    };
  }

  const key = classifyRegime(growth.signal, inflation.signal);
  const description = regimeDescription(key);
  const strength = mean([
    Math.abs(growth.score ?? 0),
    Math.abs(inflation.score ?? 0),
  ]);

  return {
    key,
    label: description.label,
    summary: description.summary,
    confidence: confidenceFor(coverage, strength),
    coverage,
    growth,
    inflation,
    policy,
  };
}

function aggregateDimension(
  currencies: FundamentalCurrencyView[],
  factors: FundamentalIndicatorView["factor"][],
): RegimeDimension {
  const factorSet = new Set(factors);
  let availableObservations = 0;
  let expectedObservations = 0;
  const currencyScores: number[] = [];

  for (const currency of currencies) {
    const relevant = currency.indicators.filter((indicator) =>
      factorSet.has(indicator.factor),
    );
    expectedObservations += relevant.length;

    const factorScores = factors.flatMap((factor) => {
      const available = relevant.filter(
        (indicator) =>
          indicator.factor === factor &&
          availableStatuses.has(indicator.status),
      );
      availableObservations += available.length;
      return available.length
        ? [mean(available.map((indicator) => indicator.score))]
        : [];
    });

    if (factorScores.length > 0) {
      currencyScores.push(mean(factorScores));
    }
  }

  const coverage =
    expectedObservations > 0 ? availableObservations / expectedObservations : 0;
  const score = currencyScores.length > 0 ? mean(currencyScores) : null;
  const usable =
    score !== null &&
    currencyScores.length >= MIN_CURRENCIES &&
    coverage >= MIN_COVERAGE;

  return {
    score,
    signal: usable ? signalFor(score) : "unavailable",
    coverage,
    availableObservations,
    expectedObservations,
    availableCurrencies: currencyScores.length,
    totalCurrencies: currencies.length,
  };
}

function dimensionIsUsable(dimension: RegimeDimension) {
  return dimension.signal !== "unavailable";
}

function signalFor(score: number | null): RegimeSignal {
  if (score === null) return "unavailable";
  if (score >= SIGNAL_THRESHOLD) return "positive";
  if (score <= -SIGNAL_THRESHOLD) return "negative";
  return "neutral";
}

function classifyRegime(
  growth: RegimeSignal,
  inflation: RegimeSignal,
): Exclude<MacroRegimeKey, "unavailable"> {
  if (growth === "positive" && inflation === "negative") return "goldilocks";
  if (growth === "positive" && inflation === "positive") return "reflation";
  if (growth === "positive") return "expansion";
  if (growth === "negative" && inflation === "positive") return "stagflation";
  if (growth === "negative" && inflation === "negative") {
    return "disinflationary_slowdown";
  }
  if (growth === "negative") return "slowdown";
  if (inflation === "positive") return "inflation_pressure";
  if (inflation === "negative") return "disinflation";
  return "balanced";
}

function regimeDescription(key: Exclude<MacroRegimeKey, "unavailable">) {
  const descriptions = {
    goldilocks: {
      label: "Disinflationäres Wachstum",
      summary:
        "Wachstums- und Arbeitsmarktdaten überraschen positiv, während der Inflationsdruck unter den Erwartungen liegt.",
    },
    reflation: {
      label: "Reflation",
      summary:
        "Aktivität und Inflation überraschen gleichzeitig positiv. Wachstum ist robust, der Preisdruck nimmt aber zu.",
    },
    expansion: {
      label: "Expansion",
      summary:
        "Wachstum und Arbeitsmarkt überraschen überwiegend positiv; bei der Inflation ist kein klarer Impuls erkennbar.",
    },
    stagflation: {
      label: "Stagflationärer Impuls",
      summary:
        "Die Aktivitätsdaten enttäuschen, während die Inflation oberhalb der Erwartungen liegt.",
    },
    disinflationary_slowdown: {
      label: "Disinflationäre Abkühlung",
      summary:
        "Wachstum, Arbeitsmarkt und Inflation liegen überwiegend unter den Erwartungen.",
    },
    slowdown: {
      label: "Konjunkturelle Abkühlung",
      summary:
        "Wachstum und Arbeitsmarkt enttäuschen; die Inflationssignale liefern keine klare gemeinsame Richtung.",
    },
    inflation_pressure: {
      label: "Inflationsdruck",
      summary:
        "Die Inflation überrascht nach oben, während die globale Aktivität noch kein klares Richtungssignal liefert.",
    },
    disinflation: {
      label: "Disinflation",
      summary:
        "Die Inflation überrascht nach unten, während Wachstum und Arbeitsmarkt in Summe richtungslos bleiben.",
    },
    balanced: {
      label: "Gemischtes Regime",
      summary:
        "Wachstums-, Arbeitsmarkt- und Inflationsüberraschungen gleichen sich derzeit weitgehend aus.",
    },
  } satisfies Record<
    Exclude<MacroRegimeKey, "unavailable">,
    { label: string; summary: string }
  >;

  return descriptions[key];
}

function confidenceFor(coverage: number, strength: number): RegimeConfidence {
  if (coverage >= 0.8 && strength >= 0.35) return "high";
  if (coverage >= 0.6 && strength >= 0.2) return "medium";
  return "low";
}

function mean(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
