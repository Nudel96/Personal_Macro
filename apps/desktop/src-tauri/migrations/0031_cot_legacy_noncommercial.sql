-- The active COT methodology moves to the Legacy Futures Only report and its
-- Non-Commercial cohort. Existing TFF/Disaggregated observations remain
-- untouched and retain their original provenance.

ALTER TABLE cot_contracts
  ADD COLUMN legacy_cftc_contract_market_code TEXT;

CREATE UNIQUE INDEX idx_cot_contracts_legacy_code
  ON cot_contracts(legacy_cftc_contract_market_code)
  WHERE legacy_cftc_contract_market_code IS NOT NULL;

CREATE TABLE cot_legacy_source_rows (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES cot_contracts(id) ON DELETE CASCADE,
  report_date TEXT NOT NULL,
  report_family TEXT NOT NULL CHECK (report_family = 'legacy'),
  participant_group TEXT NOT NULL CHECK (participant_group = 'Non-Commercial'),
  report_scope TEXT NOT NULL CHECK (report_scope = 'futures_only'),
  source_url TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  source_fingerprint TEXT NOT NULL,
  raw_payload TEXT NOT NULL,
  UNIQUE(contract_id, report_date)
);

CREATE INDEX idx_cot_legacy_source_rows_contract_date
  ON cot_legacy_source_rows(contract_id, report_date DESC);

CREATE TABLE cot_legacy_observations (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES cot_contracts(id) ON DELETE CASCADE,
  report_date TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_fingerprint TEXT NOT NULL,
  open_interest INTEGER NOT NULL CHECK (open_interest > 0),
  open_interest_change INTEGER NOT NULL,
  long_positions INTEGER NOT NULL CHECK (long_positions >= 0),
  short_positions INTEGER NOT NULL CHECK (short_positions >= 0),
  long_change INTEGER NOT NULL,
  short_change INTEGER NOT NULL,
  net_positions INTEGER NOT NULL,
  net_change INTEGER NOT NULL,
  net_position_pct_oi TEXT NOT NULL,
  net_change_pct_oi TEXT NOT NULL,
  long_share TEXT NOT NULL,
  short_share TEXT NOT NULL,
  weekly_long_share_change TEXT,
  UNIQUE(contract_id, report_date)
);

CREATE INDEX idx_cot_legacy_observations_contract_date
  ON cot_legacy_observations(contract_id, report_date DESC);
