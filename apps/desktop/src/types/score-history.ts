export interface ScoreInstrument {
  id: string;
  label: string;
  kind: "currency" | "forex" | "commodity";
  base: string;
  quote: string | null;
  defaultThreshold: number;
  scoreName: string;
  priceSymbol: string | null;
  cotSymbol: string | null;
}

export interface ScoreContribution {
  key: string;
  label: string;
  channel: string;
  score: number | null;
  sourceCurrency: string | null;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
  releasedAt: string | null;
  sourceUrl: string | null;
  reason: string | null;
}

export interface AssetScore {
  instrument: ScoreInstrument;
  score: number | null;
  availableComponents: number;
  totalComponents: number;
  contributions: ScoreContribution[];
  scope: string;
}

export interface CommodityScoreDashboard {
  asOf: string;
  modelVersion: string;
  assets: AssetScore[];
}

export interface MacroScoreHistoryInput {
  instrumentId: string;
  from: string;
  to: string;
}

export interface MacroScoreHistoryPoint {
  observationKey: string;
  observedAt: number;
  validUntil: number;
  snapshotId: string;
  modelVersion: string;
  origin:
    | "captured"
    | "archived_snapshot"
    | "cloud_captured"
    | "desktop_captured"
    | "desktop_archived_snapshot";
  score: number | null;
  availableComponents: number;
  totalComponents: number;
}

export interface ScoreDailyCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface ScorePriceSource {
  provider: "mt5" | "eodhd";
  symbol: string;
  label: string;
  inverted: boolean;
  dataKind: "ohlc" | "close";
  unit: string;
  importedAt?: string;
}

export interface MacroScoreHistoryResponse {
  instrument: ScoreInstrument;
  asOf: string;
  modelVersion: string;
  points: MacroScoreHistoryPoint[];
  candles: ScoreDailyCandle[];
  priceSource: ScorePriceSource | null;
  latestContributions: ScoreContribution[];
  earliestObservationAt: number | null;
  reasonCodes: string[];
  from: string;
  to: string;
}

export interface ScoreCaptureResult {
  inserted: number;
  archiveCompleted: boolean;
}
