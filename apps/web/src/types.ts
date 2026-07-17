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
