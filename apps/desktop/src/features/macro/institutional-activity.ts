import type { CotContractView, CotDashboard } from "../../types/domain";

export type InstitutionalSignal = -1 | 0 | 1;

export interface InstitutionalCurrencyActivity {
  currency: string;
  latestChangeSignal: InstitutionalSignal | null;
  pipelineSignal: InstitutionalSignal | null;
  score: number | null;
  coverage: 0 | 1 | 2;
  biasLabel: string;
  contract: CotContractView | null;
}

export interface InstitutionalPairActivity {
  base: string;
  quote: string;
  latestChangeScore: number | null;
  pipelineScore: number | null;
  score: number | null;
  coverage: 0 | 1 | 2;
  baseActivity: InstitutionalCurrencyActivity;
  quoteActivity: InstitutionalCurrencyActivity;
}

function sumAvailable(values: Array<number | null>) {
  const available = values.filter((value): value is number => value !== null);
  return {
    score: available.length
      ? available.reduce((sum, value) => sum + value, 0)
      : null,
    coverage: available.length as 0 | 1 | 2,
  };
}

function pairComponent(base: number | null, quote: number | null) {
  return base === null || quote === null ? null : base - quote;
}

export function institutionalBias(score: number | null) {
  if (score === null) return "Nicht verfügbar";
  if (score >= 2) return "Sehr Bullish";
  if (score === 1) return "Bullish";
  if (score <= -2) return "Sehr Bearish";
  if (score === -1) return "Bearish";
  return "Neutral";
}

export function buildInstitutionalCurrencyActivity(
  currency: string,
  dashboard?: CotDashboard,
): InstitutionalCurrencyActivity {
  const contract =
    dashboard?.contracts.find((item) => item.currency === currency) ?? null;
  const latestChangeSignal = contract?.latestChangeSignal ?? null;
  const pipelineSignal = contract?.assessment.biasSignal ?? null;
  const { score, coverage } = sumAvailable([
    latestChangeSignal,
    pipelineSignal,
  ]);

  return {
    currency,
    latestChangeSignal,
    pipelineSignal,
    score,
    coverage,
    biasLabel: institutionalBias(score),
    contract,
  };
}

export function buildInstitutionalPairActivity(
  base: string,
  quote: string,
  dashboard?: CotDashboard,
): InstitutionalPairActivity {
  const baseActivity = buildInstitutionalCurrencyActivity(base, dashboard);
  const quoteActivity = buildInstitutionalCurrencyActivity(quote, dashboard);
  const latestChangeScore = pairComponent(
    baseActivity.latestChangeSignal,
    quoteActivity.latestChangeSignal,
  );
  const pipelineScore = pairComponent(
    baseActivity.pipelineSignal,
    quoteActivity.pipelineSignal,
  );
  const { score, coverage } = sumAvailable([latestChangeScore, pipelineScore]);

  return {
    base,
    quote,
    latestChangeScore,
    pipelineScore,
    score,
    coverage,
    baseActivity,
    quoteActivity,
  };
}
