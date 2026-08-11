-- Audit trail for the independent policy-rate collector. Numerical
-- fundamentals remain exclusively in macro_excel_*; this table only records
-- attempts to refresh current central-bank policy rates.
CREATE TABLE IF NOT EXISTS policy_rate_sync_runs (
  id TEXT PRIMARY KEY,
  trigger TEXT NOT NULL CHECK (trigger IN ('startup', 'scheduler', 'manual')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'partial', 'failed')),
  fetched_currencies INTEGER NOT NULL DEFAULT 0,
  expected_currencies INTEGER NOT NULL DEFAULT 9,
  source_url TEXT NOT NULL,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_policy_rate_sync_runs_started
  ON policy_rate_sync_runs(started_at DESC);

INSERT OR IGNORE INTO schema_migrations (version, name)
VALUES (22, 'policy_rate_automation');
