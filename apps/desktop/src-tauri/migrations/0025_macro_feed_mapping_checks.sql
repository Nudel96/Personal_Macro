CREATE TABLE IF NOT EXISTS macro_feed_mapping_checks (
  id TEXT PRIMARY KEY,
  sync_run_id TEXT NOT NULL REFERENCES macro_feed_sync_runs(id) ON DELETE CASCADE,
  currency TEXT NOT NULL,
  canonical_key TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (
    outcome IN ('new_release','scheduled','unchanged','unavailable','review_required')
  ),
  rationale TEXT NOT NULL,
  source_url TEXT,
  checked_at TEXT NOT NULL,
  UNIQUE(sync_run_id, currency, canonical_key)
);

CREATE INDEX IF NOT EXISTS idx_macro_feed_mapping_checks_latest
  ON macro_feed_mapping_checks(currency, canonical_key, checked_at DESC);
