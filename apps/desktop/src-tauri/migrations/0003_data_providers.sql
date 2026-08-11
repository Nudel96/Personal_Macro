CREATE TABLE IF NOT EXISTS economic_provider_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  event_key TEXT NOT NULL,
  currency TEXT NOT NULL,
  title TEXT NOT NULL,
  scheduled_at TEXT NOT NULL,
  impact TEXT,
  actual_text TEXT,
  forecast_text TEXT,
  previous_text TEXT,
  actual_value REAL,
  forecast_value REAL,
  previous_value REAL,
  factor TEXT,
  direction INTEGER NOT NULL DEFAULT 1 CHECK (direction IN (-1, 1)),
  source_url TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  UNIQUE(provider, event_key)
);

CREATE TABLE IF NOT EXISTS provider_sync_runs (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  source_url TEXT NOT NULL,
  status TEXT NOT NULL,
  imported_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_provider_events_latest
  ON economic_provider_events(provider, scheduled_at DESC, currency, title);
