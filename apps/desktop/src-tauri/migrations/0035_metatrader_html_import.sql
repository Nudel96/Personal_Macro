ALTER TABLE import_runs
ADD COLUMN target_account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL;

ALTER TABLE import_runs
ADD COLUMN source_timezone TEXT;

CREATE TABLE metatrader_import_sources (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('mt4', 'mt5')),
  report_account_sha256 TEXT NOT NULL,
  report_account_masked TEXT NOT NULL,
  base_currency TEXT NOT NULL,
  source_timezone TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (account_id, platform),
  UNIQUE (platform, report_account_sha256)
);

CREATE TABLE metatrader_trade_links (
  source_id TEXT NOT NULL REFERENCES metatrader_import_sources(id) ON DELETE CASCADE,
  source_position_id TEXT NOT NULL,
  trade_id TEXT NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  payload_sha256 TEXT NOT NULL,
  import_run_id TEXT REFERENCES import_runs(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (source_id, source_position_id),
  UNIQUE (trade_id)
);

CREATE INDEX idx_import_runs_target_account
  ON import_runs(target_account_id, created_at DESC);

CREATE INDEX idx_metatrader_import_sources_account
  ON metatrader_import_sources(account_id, platform);

CREATE INDEX idx_metatrader_trade_links_run
  ON metatrader_trade_links(import_run_id);
