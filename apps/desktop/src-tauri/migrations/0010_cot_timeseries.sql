CREATE TABLE IF NOT EXISTS cot_contracts (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  asset_class TEXT NOT NULL,
  report_family TEXT NOT NULL CHECK (report_family IN ('tff', 'disaggregated')),
  trader_group TEXT NOT NULL,
  cftc_contract_market_code TEXT NOT NULL,
  currency TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  UNIQUE(report_family, cftc_contract_market_code)
);

CREATE TABLE IF NOT EXISTS cot_observations (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES cot_contracts(id) ON DELETE CASCADE,
  report_date TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_fingerprint TEXT NOT NULL,
  open_interest INTEGER NOT NULL,
  long_positions INTEGER NOT NULL,
  short_positions INTEGER NOT NULL,
  long_change INTEGER NOT NULL,
  short_change INTEGER NOT NULL,
  net_positions INTEGER NOT NULL,
  net_change INTEGER NOT NULL,
  net_position_pct_oi TEXT NOT NULL,
  net_change_pct_oi TEXT NOT NULL,
  UNIQUE(contract_id, report_date)
);

CREATE TABLE IF NOT EXISTS cot_sync_runs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('running', 'complete', 'failed')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  records_upserted INTEGER NOT NULL DEFAULT 0,
  source_url TEXT NOT NULL,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_cot_observations_contract_date
  ON cot_observations(contract_id, report_date DESC);
CREATE INDEX IF NOT EXISTS idx_cot_contracts_currency
  ON cot_contracts(currency, is_active);
