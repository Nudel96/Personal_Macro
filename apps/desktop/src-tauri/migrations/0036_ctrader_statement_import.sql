CREATE TABLE ctrader_import_sources (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  report_account_sha256 TEXT NOT NULL,
  report_account_masked TEXT NOT NULL,
  base_currency TEXT NOT NULL,
  source_timezone TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (account_id),
  UNIQUE (report_account_sha256)
);

CREATE TABLE ctrader_trade_links (
  source_id TEXT NOT NULL REFERENCES ctrader_import_sources(id) ON DELETE CASCADE,
  source_trade_id TEXT NOT NULL,
  trade_id TEXT NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  payload_sha256 TEXT NOT NULL,
  import_run_id TEXT REFERENCES import_runs(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (source_id, source_trade_id),
  UNIQUE (trade_id)
);

CREATE INDEX idx_ctrader_import_sources_account
  ON ctrader_import_sources(account_id);

CREATE INDEX idx_ctrader_trade_links_run
  ON ctrader_trade_links(import_run_id);
