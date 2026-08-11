-- COT v2 keeps the CFTC row immutable and stores versioned assessments separately.
CREATE TABLE IF NOT EXISTS cot_source_rows (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES cot_contracts(id) ON DELETE CASCADE,
  report_date TEXT NOT NULL,
  report_family TEXT NOT NULL CHECK (report_family IN ('tff', 'disaggregated')),
  report_scope TEXT NOT NULL CHECK (report_scope IN ('futures_only')),
  source_url TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  source_fingerprint TEXT NOT NULL,
  raw_payload TEXT NOT NULL,
  UNIQUE(contract_id, report_date, report_scope)
);
CREATE INDEX IF NOT EXISTS idx_cot_source_rows_contract_date
  ON cot_source_rows(contract_id, report_date DESC);

CREATE TABLE IF NOT EXISTS cot_evaluations (
  contract_id TEXT NOT NULL REFERENCES cot_contracts(id) ON DELETE CASCADE,
  report_date TEXT NOT NULL,
  scoring_version TEXT NOT NULL,
  calculated_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('available', 'limited_history', 'stale', 'unavailable')),
  quality TEXT NOT NULL CHECK (quality IN ('high', 'limited', 'unavailable')),
  bias_signal INTEGER CHECK (bias_signal IN (-1, 0, 1)),
  level_percentile TEXT,
  flow_percentile TEXT,
  persistence_percentile TEXT,
  crowding_status TEXT,
  reason_codes_json TEXT NOT NULL,
  PRIMARY KEY(contract_id, report_date, scoring_version)
);
CREATE INDEX IF NOT EXISTS idx_cot_evaluations_contract_date
  ON cot_evaluations(contract_id, report_date DESC, scoring_version);
