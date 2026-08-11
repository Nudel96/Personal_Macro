CREATE TABLE IF NOT EXISTS weekly_macro_research_runs (
  id TEXT PRIMARY KEY,
  trigger_kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'complete', 'partial', 'failed', 'skipped')),
  model TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  currency_batches INTEGER NOT NULL DEFAULT 0,
  expected_points INTEGER NOT NULL DEFAULT 0,
  researched_points INTEGER NOT NULL DEFAULT 0,
  official_source_points INTEGER NOT NULL DEFAULT 0,
  upcoming_releases INTEGER NOT NULL DEFAULT 0,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS weekly_macro_research_points (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES weekly_macro_research_runs(id) ON DELETE CASCADE,
  currency TEXT NOT NULL,
  indicator_key TEXT NOT NULL,
  label TEXT NOT NULL,
  factor TEXT NOT NULL,
  unit TEXT NOT NULL,
  frequency TEXT NOT NULL,
  expected_source_key TEXT NOT NULL REFERENCES macro_data_sources(source_key),
  official_series_id TEXT,
  research_status TEXT NOT NULL
    CHECK (research_status IN ('found', 'not_found', 'ambiguous', 'error')),
  actual_text TEXT,
  previous_text TEXT,
  forecast_text TEXT,
  reference_period TEXT,
  published_at TEXT,
  next_release_at_utc TEXT,
  next_release_timezone TEXT,
  next_reference_period TEXT,
  summary TEXT,
  confidence REAL NOT NULL DEFAULT 0,
  source_validation_status TEXT NOT NULL
    CHECK (source_validation_status IN ('official_source_cited', 'research_only', 'ambiguous', 'missing', 'invalid')),
  primary_source_url TEXT,
  calendar_source_url TEXT,
  sources_json TEXT NOT NULL DEFAULT '[]',
  response_id TEXT,
  model TEXT NOT NULL,
  collected_at TEXT NOT NULL,
  result_sha256 TEXT NOT NULL,
  seeded_release_id TEXT REFERENCES macro_releases(id),
  UNIQUE(run_id, currency, indicator_key)
);

CREATE INDEX IF NOT EXISTS idx_weekly_macro_research_runs_latest
  ON weekly_macro_research_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_weekly_macro_research_points_latest
  ON weekly_macro_research_points(currency, indicator_key, collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_weekly_macro_research_points_upcoming
  ON weekly_macro_research_points(next_release_at_utc);

INSERT OR IGNORE INTO macro_data_sources (
  source_key,
  version,
  name,
  publisher,
  source_kind,
  base_url,
  terms_url,
  is_primary,
  automation_status,
  expected_latency_minutes,
  notes,
  updated_at
) VALUES (
  'openai_research',
  1,
  'OpenAI Quellenrecherche',
  'OpenAI',
  'research_orchestration',
  'https://api.openai.com/v1/responses',
  'https://openai.com/policies/row-terms-of-use/',
  0,
  'approved_research_only',
  NULL,
  'Findet Daten und Termine. Keine eigenständige Scoring-Autorität.',
  CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO app_settings (key, value_json) VALUES
  ('weeklyMacroResearch', '{"enabled":true,"intervalDays":7,"officialSourcesOnly":true}');
