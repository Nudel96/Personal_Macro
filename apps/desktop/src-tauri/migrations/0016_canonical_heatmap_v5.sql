-- Canonical, versioned Macro heatmap. Existing snapshots remain immutable and
-- readable; v5 stores its factor evidence and pair arithmetic separately.
CREATE TABLE IF NOT EXISTS heatmap_model_configs (
  id TEXT PRIMARY KEY,
  model_version TEXT NOT NULL UNIQUE,
  config_json TEXT NOT NULL,
  activated_at TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_heatmap_model_configs_active
  ON heatmap_model_configs(is_active) WHERE is_active = 1;

CREATE TABLE IF NOT EXISTS heatmap_factor_observations (
  id TEXT PRIMARY KEY,
  macro_snapshot_id TEXT NOT NULL REFERENCES macro_snapshots(id) ON DELETE CASCADE,
  factor_key TEXT NOT NULL,
  observation_key TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('currency', 'pair')),
  currency TEXT,
  base_currency TEXT,
  quote_currency TEXT,
  signal INTEGER CHECK (signal IN (-1, 0, 1)),
  status TEXT NOT NULL CHECK (status IN ('available', 'neutral', 'unavailable', 'restricted', 'stale')),
  validation_status TEXT NOT NULL CHECK (validation_status IN ('validated', 'exploratory', 'not_supported')),
  quality TEXT NOT NULL,
  freshness TEXT NOT NULL,
  base_weight TEXT NOT NULL,
  effective_weight TEXT NOT NULL,
  available_at TEXT,
  expires_at TEXT,
  proxy_kind TEXT,
  source_refs_json TEXT NOT NULL DEFAULT '[]',
  reason_codes_json TEXT NOT NULL DEFAULT '[]',
  metadata_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_heatmap_factor_snapshot
  ON heatmap_factor_observations(macro_snapshot_id, factor_key, scope);
CREATE INDEX IF NOT EXISTS idx_heatmap_factor_currency_time
  ON heatmap_factor_observations(currency, factor_key, available_at DESC);
CREATE INDEX IF NOT EXISTS idx_heatmap_factor_pair_time
  ON heatmap_factor_observations(base_currency, quote_currency, factor_key, available_at DESC);
CREATE INDEX IF NOT EXISTS idx_heatmap_factor_validation
  ON heatmap_factor_observations(validation_status, factor_key);

CREATE TABLE IF NOT EXISTS heatmap_pair_components (
  id TEXT PRIMARY KEY,
  macro_snapshot_id TEXT NOT NULL REFERENCES macro_snapshots(id) ON DELETE CASCADE,
  base_currency TEXT NOT NULL,
  quote_currency TEXT NOT NULL,
  component_key TEXT NOT NULL,
  factor_key TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('currency', 'pair')),
  base_signal INTEGER CHECK (base_signal IN (-1, 0, 1)),
  quote_signal INTEGER CHECK (quote_signal IN (-1, 0, 1)),
  pair_signal INTEGER CHECK (pair_signal IN (-1, 0, 1)),
  raw_effect TEXT NOT NULL,
  base_weight TEXT NOT NULL,
  quality TEXT NOT NULL,
  freshness TEXT NOT NULL,
  effective_weight TEXT NOT NULL,
  weighted_contribution TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('available', 'neutral', 'unavailable', 'restricted', 'stale')),
  validation_status TEXT NOT NULL CHECK (validation_status IN ('validated', 'exploratory', 'not_supported')),
  available_at TEXT,
  expires_at TEXT,
  proxy_kind TEXT,
  source_refs_json TEXT NOT NULL DEFAULT '[]',
  reason_codes_json TEXT NOT NULL DEFAULT '[]',
  UNIQUE(macro_snapshot_id, base_currency, quote_currency, component_key)
);
CREATE INDEX IF NOT EXISTS idx_heatmap_pair_components_snapshot_pair
  ON heatmap_pair_components(macro_snapshot_id, base_currency, quote_currency);
CREATE INDEX IF NOT EXISTS idx_heatmap_pair_components_factor
  ON heatmap_pair_components(factor_key, validation_status);

CREATE TABLE IF NOT EXISTS heatmap_validation_runs (
  id TEXT PRIMARY KEY,
  model_version TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  period_start TEXT,
  period_end TEXT,
  data_cutoff TEXT NOT NULL,
  trigger_kind TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'complete', 'partial', 'failed')),
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_heatmap_validation_runs_latest
  ON heatmap_validation_runs(model_version, started_at DESC);

CREATE TABLE IF NOT EXISTS heatmap_validation_metrics (
  id TEXT PRIMARY KEY,
  validation_run_id TEXT NOT NULL REFERENCES heatmap_validation_runs(id) ON DELETE CASCADE,
  factor_group TEXT NOT NULL,
  cohort TEXT NOT NULL,
  horizon_days INTEGER NOT NULL CHECK (horizon_days IN (1, 5, 20)),
  sample_size INTEGER NOT NULL,
  fold_count INTEGER NOT NULL,
  median_ic TEXT,
  confidence_low TEXT,
  confidence_high TEXT,
  hit_rate TEXT,
  wilson_lower TEXT,
  positive_folds INTEGER NOT NULL DEFAULT 0,
  data_quality_status TEXT NOT NULL,
  validation_status TEXT NOT NULL CHECK (validation_status IN ('validated', 'exploratory', 'not_supported')),
  reason_codes_json TEXT NOT NULL DEFAULT '[]',
  UNIQUE(validation_run_id, factor_group, cohort, horizon_days)
);
CREATE INDEX IF NOT EXISTS idx_heatmap_validation_metrics_factor
  ON heatmap_validation_metrics(factor_group, cohort, validation_status);

ALTER TABLE macro_pair_scores ADD COLUMN audit_raw_sum TEXT NOT NULL DEFAULT '0';
ALTER TABLE macro_pair_scores ADD COLUMN availability_status TEXT NOT NULL DEFAULT 'available';
ALTER TABLE macro_pair_scores ADD COLUMN available_weight TEXT NOT NULL DEFAULT '0';
ALTER TABLE macro_pair_scores ADD COLUMN planned_weight TEXT NOT NULL DEFAULT '0';
ALTER TABLE macro_pair_scores ADD COLUMN reason_codes_json TEXT NOT NULL DEFAULT '[]';

INSERT OR IGNORE INTO heatmap_model_configs (
  id, model_version, config_json, activated_at, is_active, created_at
) VALUES (
  'heatmap-v5-default',
  'heatmap-v5',
  '{"modelVersion":"heatmap-v5","scoreScale":12,"currencies":["USD","EUR","GBP","JPY","CHF","AUD","CAD","NZD","CNY"],"weights":{"growth":1.0,"inflation":1.0,"labor":1.0,"rates":1.0,"cot":0.5,"seasonality":0.5,"usdDxyCotProxy":0.25},"gates":{"minimumCoverage":0.5,"minimumQuality":0.6,"minimumAgreement":0.6},"freshness":{"macroWeekly":{"halfLifeDays":7.0,"unavailableAfterDays":14},"macroMonthly":{"halfLifeDays":30.0,"unavailableAfterDays":45},"macroQuarterly":{"halfLifeDays":90.0,"unavailableAfterDays":135},"cot":{"halfLifeDays":7.0,"unavailableAfterDays":10},"rates":{"halfLifeDays":30.0,"unavailableAfterDays":45},"seasonality":{"halfLifeDays":3.0,"unavailableAfterDays":7}}}',
  '1970-01-01T00:00:00Z',
  1,
  '1970-01-01T00:00:00Z'
);
