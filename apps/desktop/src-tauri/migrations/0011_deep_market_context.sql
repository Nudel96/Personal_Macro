-- Read-only market history and derived seasonal profiles. Raw broker data never
-- contains account credentials or trading actions.
CREATE TABLE IF NOT EXISTS market_instruments (
  symbol TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  description TEXT,
  path TEXT,
  base_currency TEXT,
  quote_currency TEXT,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS market_daily_candles (
  symbol TEXT NOT NULL REFERENCES market_instruments(symbol) ON DELETE CASCADE,
  candle_time INTEGER NOT NULL,
  open REAL NOT NULL,
  high REAL NOT NULL,
  low REAL NOT NULL,
  close REAL NOT NULL,
  volume INTEGER,
  volume_kind TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY(symbol, candle_time)
);
CREATE INDEX IF NOT EXISTS idx_market_daily_candles_symbol_time
  ON market_daily_candles(symbol, candle_time DESC);

CREATE TABLE IF NOT EXISTS seasonality_profiles (
  symbol TEXT PRIMARY KEY REFERENCES market_instruments(symbol) ON DELETE CASCADE,
  calculated_at TEXT NOT NULL,
  history_start TEXT,
  history_end TEXT,
  complete_years INTEGER NOT NULL,
  quality_status TEXT NOT NULL CHECK (quality_status IN ('available','insufficient_history','incomplete_history','unavailable')),
  profile_json TEXT NOT NULL
);

-- The existing cot_observations table remains the canonical Macro-factor
-- cohort. This table preserves every reportable participant group for analysis.
CREATE TABLE IF NOT EXISTS cot_group_observations (
  contract_id TEXT NOT NULL REFERENCES cot_contracts(id) ON DELETE CASCADE,
  report_date TEXT NOT NULL,
  participant_group TEXT NOT NULL,
  long_positions INTEGER NOT NULL,
  short_positions INTEGER NOT NULL,
  spreading_positions INTEGER,
  net_positions INTEGER NOT NULL,
  net_position_pct_oi TEXT NOT NULL,
  PRIMARY KEY(contract_id, report_date, participant_group)
);
CREATE INDEX IF NOT EXISTS idx_cot_group_observations_contract_group_date
  ON cot_group_observations(contract_id, participant_group, report_date DESC);

CREATE TABLE IF NOT EXISTS cot_broker_links (
  contract_id TEXT PRIMARY KEY REFERENCES cot_contracts(id) ON DELETE CASCADE,
  broker_symbol TEXT NOT NULL REFERENCES market_instruments(symbol) ON DELETE RESTRICT,
  linked_at TEXT NOT NULL
);
