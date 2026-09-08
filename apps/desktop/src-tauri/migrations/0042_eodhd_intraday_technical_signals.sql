-- Persist provider-native EODHD 1H OHLC candles for reproducible 4H/D1
-- technical confirmation. Daily candles remain canonical in the existing
-- seasonality_provider_daily_candles table.
CREATE TABLE IF NOT EXISTS eodhd_intraday_candles (
  provider_symbol TEXT NOT NULL,
  interval_seconds INTEGER NOT NULL CHECK (interval_seconds = 3600),
  candle_time INTEGER NOT NULL,
  open REAL NOT NULL,
  high REAL NOT NULL,
  low REAL NOT NULL,
  close REAL NOT NULL,
  volume INTEGER,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY(provider_symbol, interval_seconds, candle_time)
);

CREATE INDEX IF NOT EXISTS idx_eodhd_intraday_candles_symbol_time
  ON eodhd_intraday_candles(provider_symbol, interval_seconds, candle_time DESC);

CREATE TABLE IF NOT EXISTS eodhd_technical_sync_state (
  provider_symbol TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('pending','running','complete','failed')),
  last_attempt_at TEXT,
  last_success_at TEXT,
  last_candle_at INTEGER,
  next_refresh_at TEXT,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_eodhd_technical_sync_due
  ON eodhd_technical_sync_state(status, next_refresh_at, provider_symbol);

-- A terminated process must not leave an instrument permanently marked busy.
UPDATE eodhd_technical_sync_state
SET status='failed',
    error_message=COALESCE(error_message, 'Technische Aktualisierung durch App-Neustart beendet.'),
    next_refresh_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE status='running';
