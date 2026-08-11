ALTER TABLE accounts ADD COLUMN default_risk_percent REAL NOT NULL DEFAULT 1.0;

CREATE TABLE IF NOT EXISTS macro_research_jobs (
  id TEXT PRIMARY KEY,
  provider_event_id TEXT NOT NULL REFERENCES economic_provider_events(id) ON DELETE CASCADE,
  currency TEXT NOT NULL,
  indicator_key TEXT NOT NULL,
  title TEXT NOT NULL,
  scheduled_at TEXT NOT NULL,
  run_after TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'researching', 'retry_wait', 'completed', 'failed', 'skipped')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  last_error TEXT,
  response_id TEXT,
  model TEXT,
  summary TEXT,
  market_context TEXT,
  surprise_label TEXT,
  confidence REAL,
  sources_json TEXT NOT NULL DEFAULT '[]',
  researched_actual_text TEXT,
  researched_forecast_text TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE(provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_macro_research_jobs_due
  ON macro_research_jobs(status, next_attempt_at, run_after);

CREATE INDEX IF NOT EXISTS idx_macro_research_jobs_currency
  ON macro_research_jobs(currency, scheduled_at DESC);
