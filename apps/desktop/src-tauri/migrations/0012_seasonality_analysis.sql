-- Audit trail for locally persisted BlackBull D1 history refreshes.
CREATE TABLE IF NOT EXISTS seasonality_sync_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  trigger TEXT NOT NULL,
  provider TEXT NOT NULL,
  symbol TEXT,
  requested_symbols INTEGER NOT NULL DEFAULT 0,
  refreshed_symbols INTEGER NOT NULL DEFAULT 0,
  fetched_candles INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('running','complete','partial','failed')),
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_seasonality_sync_runs_started
  ON seasonality_sync_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_seasonality_sync_runs_symbol_started
  ON seasonality_sync_runs(symbol, started_at DESC);
