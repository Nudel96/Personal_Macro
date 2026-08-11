CREATE TABLE IF NOT EXISTS macro_data_automation_jobs (
  id TEXT PRIMARY KEY,
  job_key TEXT NOT NULL UNIQUE,
  job_type TEXT NOT NULL
    CHECK (job_type IN (
      'catalog_refresh',
      'schedule_delta',
      'forecast_capture',
      'actual_verify',
      'rates_refresh',
      'source_repair',
      'backfill'
    )),
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  release_id TEXT REFERENCES macro_releases(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN (
      'scheduled',
      'running',
      'retry_wait',
      'completed',
      'conflict',
      'rejected',
      'paused'
    )),
  model_tier TEXT NOT NULL DEFAULT 'terra'
    CHECK (model_tier IN ('terra', 'sol')),
  priority INTEGER NOT NULL DEFAULT 100,
  due_at TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 4,
  payload_json TEXT NOT NULL DEFAULT '{}',
  last_error TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS macro_research_evidence (
  id TEXT PRIMARY KEY,
  evidence_fingerprint TEXT NOT NULL UNIQUE,
  job_id TEXT NOT NULL REFERENCES macro_data_automation_jobs(id) ON DELETE CASCADE,
  release_id TEXT REFERENCES macro_releases(id) ON DELETE CASCADE,
  evidence_kind TEXT NOT NULL
    CHECK (evidence_kind IN ('actual', 'forecast', 'previous', 'rate_current', 'rate_expectation')),
  currency TEXT NOT NULL,
  indicator_key TEXT,
  normalized_value TEXT,
  raw_value TEXT,
  unit TEXT,
  reference_period TEXT,
  published_at TEXT,
  observed_at TEXT NOT NULL,
  source_key TEXT,
  source_url TEXT,
  source_domain TEXT,
  source_payload_sha256 TEXT,
  discovery_response_id TEXT,
  discovery_model TEXT,
  discovery_result_json TEXT,
  discovery_result_sha256 TEXT,
  verification_response_id TEXT,
  verification_model TEXT,
  verification_result_json TEXT,
  verification_result_sha256 TEXT,
  status TEXT NOT NULL
    CHECK (status IN (
      'discovered',
      'direct_source_fetched',
      'verification_pending',
      'verified',
      'promoted',
      'conflict',
      'rejected',
      'retry_wait'
    )),
  confidence TEXT NOT NULL DEFAULT '0',
  quality TEXT NOT NULL DEFAULT '0',
  reason_codes_json TEXT NOT NULL DEFAULT '[]',
  source_refs_json TEXT NOT NULL DEFAULT '[]',
  promoted_observation_id TEXT REFERENCES macro_observations(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS macro_research_usage (
  id TEXT PRIMARY KEY,
  job_id TEXT REFERENCES macro_data_automation_jobs(id) ON DELETE SET NULL,
  evidence_id TEXT REFERENCES macro_research_evidence(id) ON DELETE SET NULL,
  request_kind TEXT NOT NULL,
  model_tier TEXT NOT NULL CHECK (model_tier IN ('terra', 'sol')),
  model TEXT NOT NULL,
  response_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('complete', 'failed', 'rate_limited')),
  input_tokens INTEGER NOT NULL DEFAULT 0,
  cached_input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  reasoning_tokens INTEGER NOT NULL DEFAULT 0,
  web_search_calls INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  error_code TEXT
);

ALTER TABLE macro_observations
  ADD COLUMN verification_method TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE macro_observations
  ADD COLUMN evidence_id TEXT REFERENCES macro_research_evidence(id);
ALTER TABLE macro_observations
  ADD COLUMN quality TEXT NOT NULL DEFAULT '1';

ALTER TABLE heatmap_factor_observations
  ADD COLUMN activation_status TEXT NOT NULL DEFAULT 'inactive_unavailable';
ALTER TABLE heatmap_factor_observations
  ADD COLUMN verification_method TEXT;
ALTER TABLE heatmap_factor_observations
  ADD COLUMN evidence_refs_json TEXT NOT NULL DEFAULT '[]';

ALTER TABLE heatmap_pair_components
  ADD COLUMN activation_status TEXT NOT NULL DEFAULT 'inactive_unavailable';
ALTER TABLE heatmap_pair_components
  ADD COLUMN verification_method TEXT;
ALTER TABLE heatmap_pair_components
  ADD COLUMN evidence_refs_json TEXT NOT NULL DEFAULT '[]';

ALTER TABLE macro_pair_scores
  ADD COLUMN activation_status TEXT NOT NULL DEFAULT 'inactive_unavailable';
ALTER TABLE macro_pair_scores
  ADD COLUMN is_provisional INTEGER NOT NULL DEFAULT 0;

ALTER TABLE policy_rate_snapshots
  ADD COLUMN verification_method TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE policy_rate_snapshots
  ADD COLUMN evidence_refs_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE policy_rate_snapshots
  ADD COLUMN quality TEXT NOT NULL DEFAULT '1';

CREATE INDEX IF NOT EXISTS idx_macro_data_automation_jobs_due
  ON macro_data_automation_jobs(status, due_at, priority);
CREATE INDEX IF NOT EXISTS idx_macro_data_automation_jobs_release
  ON macro_data_automation_jobs(release_id, job_type, status);
CREATE INDEX IF NOT EXISTS idx_macro_research_evidence_status
  ON macro_research_evidence(status, evidence_kind, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_macro_research_evidence_release
  ON macro_research_evidence(release_id, evidence_kind, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_macro_research_usage_day
  ON macro_research_usage(model_tier, started_at);
CREATE INDEX IF NOT EXISTS idx_macro_observations_evidence
  ON macro_observations(evidence_id);

UPDATE heatmap_model_configs
SET is_active = 0
WHERE is_active = 1;

INSERT INTO heatmap_model_configs (
  id,
  model_version,
  is_active,
  config_json,
  activated_at,
  created_at
) VALUES (
  'heatmap-v5.1-default',
  'heatmap-v5.1',
  1,
  '{"modelVersion":"heatmap-v5.1","scoreScale":12,"currencies":["USD","EUR","GBP","JPY","CHF","AUD","CAD","NZD","CNY"],"weights":{"growth":1.0,"inflation":1.0,"labor":1.0,"rates":1.0,"cot":0.5,"seasonality":0.5,"usdDxyCotProxy":0.25},"gates":{"minimumCoverage":0.5,"minimumQuality":0.6,"minimumAgreement":0.6},"freshness":{"macroWeekly":{"halfLifeDays":7.0,"unavailableAfterDays":14},"macroMonthly":{"halfLifeDays":30.0,"unavailableAfterDays":45},"macroQuarterly":{"halfLifeDays":90.0,"unavailableAfterDays":135},"cot":{"halfLifeDays":7.0,"unavailableAfterDays":10},"rates":{"halfLifeDays":30.0,"unavailableAfterDays":45},"seasonality":{"halfLifeDays":3.0,"unavailableAfterDays":7}}}',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO app_settings (key, value_json) VALUES (
  'macroDataAutomation',
  '{"enabled":true,"catalogIntervalHours":168,"scheduleDeltaHours":6,"terraDailyLimit":60,"solDailyLimit":12,"backfillPerDay":10,"maxConcurrency":2,"provisionalScores":true,"provisionalConvictionCap":3}'
);
