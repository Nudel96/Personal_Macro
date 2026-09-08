-- Official central-bank publication archive.  Reports are deliberately kept
-- separate from numerical macro/rates scoring: summaries are research aids
-- and never feed the canonical heatmap automatically.
CREATE TABLE central_bank_reports (
  id TEXT PRIMARY KEY,
  bank_code TEXT NOT NULL CHECK (bank_code IN ('FED','ECB','BOE','BOJ','RBA','RBNZ','BOC','SNB','PBOC')),
  currency TEXT NOT NULL CHECK (currency IN ('USD','EUR','GBP','JPY','AUD','NZD','CAD','CHF','CNY')),
  report_type TEXT NOT NULL CHECK (report_type IN ('decision','monetary_policy_report','projections','special_notice')),
  title TEXT NOT NULL,
  source_url TEXT NOT NULL UNIQUE,
  published_at TEXT,
  discovered_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  mime_type TEXT,
  local_path TEXT,
  sha256 TEXT,
  byte_size INTEGER,
  extracted_text TEXT,
  extraction_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (extraction_status IN ('pending','complete','partial','failed')),
  extraction_error TEXT,
  summary_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (summary_status IN ('pending','complete','local_fallback','failed')),
  summary_json TEXT,
  summary_provider TEXT,
  summary_model TEXT,
  summary_version INTEGER NOT NULL DEFAULT 0,
  summarized_at TEXT,
  read_at TEXT
);

CREATE INDEX idx_central_bank_reports_published
  ON central_bank_reports(published_at DESC, discovered_at DESC);
CREATE INDEX idx_central_bank_reports_bank
  ON central_bank_reports(bank_code, published_at DESC);
CREATE INDEX idx_central_bank_reports_status
  ON central_bank_reports(summary_status, extraction_status);

CREATE TABLE central_bank_report_source_state (
  source_id TEXT PRIMARY KEY,
  bank_code TEXT NOT NULL,
  source_url TEXT NOT NULL,
  etag TEXT,
  last_modified TEXT,
  last_checked_at TEXT,
  last_success_at TEXT,
  next_check_at TEXT,
  last_status TEXT,
  error_message TEXT
);

CREATE INDEX idx_central_bank_report_sources_due
  ON central_bank_report_source_state(next_check_at);

CREATE TABLE central_bank_report_sync_runs (
  id TEXT PRIMARY KEY,
  trigger_kind TEXT NOT NULL CHECK (trigger_kind IN ('startup','scheduler','manual')),
  status TEXT NOT NULL CHECK (status IN ('running','complete','partial','failed')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  sources_checked INTEGER NOT NULL DEFAULT 0,
  reports_discovered INTEGER NOT NULL DEFAULT 0,
  reports_downloaded INTEGER NOT NULL DEFAULT 0,
  reports_summarized INTEGER NOT NULL DEFAULT 0,
  error_message TEXT
);

CREATE INDEX idx_central_bank_report_runs_started
  ON central_bank_report_sync_runs(started_at DESC);

INSERT OR IGNORE INTO schema_migrations (version, name)
VALUES (44, 'central_bank_reports');
