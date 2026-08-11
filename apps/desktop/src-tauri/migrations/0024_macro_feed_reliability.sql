-- Reliability metadata for bounded retries, explicit no-change runs and
-- observation-aware release jobs. Existing research data remains unchanged.

ALTER TABLE macro_feed_sync_runs ADD COLUMN outcome_kind TEXT NOT NULL DEFAULT 'changed'
  CHECK (outcome_kind IN ('changed', 'no_change', 'failed'));
ALTER TABLE macro_feed_sync_runs ADD COLUMN no_change_reason TEXT;
ALTER TABLE macro_feed_sync_runs ADD COLUMN next_attempt_at TEXT;

ALTER TABLE macro_feed_jobs ADD COLUMN next_attempt_at TEXT;
ALTER TABLE macro_feed_jobs ADD COLUMN completion_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_macro_feed_runs_retry
  ON macro_feed_sync_runs(status, next_attempt_at, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_macro_feed_jobs_retry
  ON macro_feed_jobs(status, next_attempt_at, scheduled_for);
