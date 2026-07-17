export type RateSignal = -1 | 0 | 1 | null;

export interface PolicyRate {
  currency_code: string;
  current_target_rate: number | null;
  expected_target_rate: number | null;
  expected_delta_bps: number | null;
  expected_stance: RateSignal;
  actual_target_rate: number | null;
  decision_surprise_bps: number | null;
  decision_surprise: RateSignal;
  next_decision_at: string | null;
  provider_snapshot_at: string | null;
  availability_status: string;
  quality_status: string;
}

export interface UsdRelative {
  foreign_pressure_bps: number | null;
  relative_stance_bps: number | null;
  relative_signal: RateSignal;
  covered_central_banks: number;
  required_central_banks: number;
  hike_count: number;
  hold_count: number;
  cut_count: number;
  availability_status: string;
}

export interface PolicyRatePayload {
  is_demo: boolean;
  rates: PolicyRate[];
  usd_relative: UsdRelative;
}

export type CurrencySignal = -1 | 0 | 1 | null;
export type PairScore = -2 | -1 | 0 | 1 | 2 | null;

export interface CurrencyHeatmapRow {
  currency: string;
  factors: Record<string, CurrencySignal>;
  raw_score: number;
  coverage: number;
}

export interface HeatmapPayload {
  is_demo: boolean;
  factors: string[];
  currencies: CurrencyHeatmapRow[];
}

export interface PairPayload {
  is_demo: boolean;
  symbol: string;
  cells: Record<string, PairScore>;
  raw_score: number;
  coverage: number;
}

export interface SeasonalityItem {
  asset: string;
  symbol: string;
  window: string;
  mean_return: number;
  hit_rate: number;
  samples: number;
  signal: CurrencySignal;
}

export interface SeasonalityPayload {
  is_demo: boolean;
  items: SeasonalityItem[];
}

export interface JournalTrade {
  id: number;
  instrument: string;
  direction: "long" | "short";
  status: "open" | "closed";
  trade_date: string;
  entry_price: number | null;
  exit_price: number | null;
  result_r: number | null;
  pnl_amount: number | null;
  strategy: string | null;
  setup: string | null;
  thesis: string | null;
  emotion: string | null;
  macro_context: string | null;
  seasonality_context: string | null;
  notes: string | null;
  created_at: string;
}
