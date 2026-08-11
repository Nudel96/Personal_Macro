-- Provider-specific D1 history for reproducible seasonality analysis.
-- BlackBull's market_daily_candles remains untouched and is used only as a
-- clearly labelled fallback when Dukascopy has less than five full years.
CREATE TABLE IF NOT EXISTS seasonality_provider_instruments (
  provider TEXT NOT NULL,
  provider_symbol TEXT NOT NULL,
  display_symbol TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  base_currency TEXT,
  quote_currency TEXT,
  earliest_daily_at INTEGER,
  native_timezone TEXT,
  last_catalogued_at TEXT NOT NULL,
  PRIMARY KEY(provider, provider_symbol)
);

CREATE TABLE IF NOT EXISTS seasonality_provider_daily_candles (
  provider TEXT NOT NULL,
  provider_symbol TEXT NOT NULL,
  candle_time INTEGER NOT NULL,
  bid_open REAL NOT NULL,
  bid_high REAL NOT NULL,
  bid_low REAL NOT NULL,
  bid_close REAL NOT NULL,
  ask_open REAL NOT NULL,
  ask_high REAL NOT NULL,
  ask_low REAL NOT NULL,
  ask_close REAL NOT NULL,
  mid_close REAL NOT NULL,
  volume INTEGER,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY(provider, provider_symbol, candle_time),
  FOREIGN KEY(provider, provider_symbol)
    REFERENCES seasonality_provider_instruments(provider, provider_symbol)
    ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_seasonality_provider_candles_series_time
  ON seasonality_provider_daily_candles(provider, provider_symbol, candle_time DESC);

CREATE TABLE IF NOT EXISTS seasonality_provider_profiles (
  provider TEXT NOT NULL,
  provider_symbol TEXT NOT NULL,
  calculated_at TEXT NOT NULL,
  history_start TEXT,
  history_end TEXT,
  complete_years INTEGER NOT NULL,
  quality_status TEXT NOT NULL CHECK (quality_status IN ('available','insufficient_history','unavailable')),
  missing_days INTEGER NOT NULL DEFAULT 0,
  profile_json TEXT NOT NULL,
  PRIMARY KEY(provider, provider_symbol),
  FOREIGN KEY(provider, provider_symbol)
    REFERENCES seasonality_provider_instruments(provider, provider_symbol)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS seasonality_provider_sync_runs (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  trigger TEXT NOT NULL,
  provider_symbol TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('running','complete','partial','failed','paused')),
  requested_years INTEGER NOT NULL DEFAULT 0,
  fetched_candles INTEGER NOT NULL DEFAULT 0,
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_seasonality_provider_sync_runs_started
  ON seasonality_provider_sync_runs(provider, started_at DESC);
