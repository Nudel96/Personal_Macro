-- No credentials: sessions live only in the operating system credential store.
CREATE TABLE myfxbook_connections (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL UNIQUE,
  external_name TEXT NOT NULL,
  currency TEXT NOT NULL,
  broker_timezone TEXT NOT NULL,
  pnl_mode TEXT NOT NULL CHECK (pnl_mode IN ('auto', 'net', 'gross')),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'paused',
  message TEXT NOT NULL DEFAULT '',
  last_attempt_at TEXT,
  last_sync_at TEXT,
  last_provider_at TEXT,
  balance_minor INTEGER,
  history_keys_json TEXT NOT NULL DEFAULT '[]',
  backup_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE myfxbook_links (
  account_id TEXT NOT NULL REFERENCES myfxbook_connections(account_id) ON DELETE CASCADE,
  source_key TEXT NOT NULL,
  trade_id TEXT REFERENCES trades(id) ON DELETE RESTRICT,
  cashflow_id TEXT REFERENCES account_cashflows(id) ON DELETE RESTRICT,
  initial_capital INTEGER NOT NULL DEFAULT 0 CHECK (initial_capital IN (0, 1)),
  payload_json TEXT NOT NULL,
  PRIMARY KEY (account_id, source_key),
  CHECK ((trade_id IS NOT NULL) + (cashflow_id IS NOT NULL) + initial_capital = 1)
);
CREATE UNIQUE INDEX myfxbook_trade_identity ON myfxbook_links(trade_id) WHERE trade_id IS NOT NULL;
CREATE UNIQUE INDEX myfxbook_cashflow_identity ON myfxbook_links(cashflow_id) WHERE cashflow_id IS NOT NULL;
