-- Read-only MetaTrader 5 account synchronization. A broker account is
-- identified by provider + server + login; display names are never used as an
-- identity key. Broker balances remain separate from the locally calculated
-- journal balance so imported P&L cannot be counted twice.

CREATE TABLE IF NOT EXISTS mt5_accounts (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  server TEXT NOT NULL,
  server_key TEXT NOT NULL,
  login TEXT NOT NULL,
  account_name TEXT,
  company TEXT,
  currency TEXT,
  trade_mode INTEGER,
  margin_mode INTEGER,
  leverage INTEGER,
  local_account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  last_sync_at TEXT,
  last_deal_time_msc INTEGER,
  is_connected INTEGER NOT NULL DEFAULT 0 CHECK (is_connected IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(provider, server_key, login),
  UNIQUE(local_account_id)
);

CREATE INDEX IF NOT EXISTS idx_mt5_accounts_connection
  ON mt5_accounts(is_connected, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS mt5_account_snapshots (
  id TEXT PRIMARY KEY,
  mt5_account_id TEXT NOT NULL REFERENCES mt5_accounts(id) ON DELETE CASCADE,
  observed_at TEXT NOT NULL,
  currency TEXT NOT NULL,
  balance_minor INTEGER,
  equity_minor INTEGER,
  margin_minor INTEGER,
  free_margin_minor INTEGER,
  profit_minor INTEGER,
  leverage INTEGER,
  UNIQUE(mt5_account_id, observed_at)
);

CREATE INDEX IF NOT EXISTS idx_mt5_snapshots_latest
  ON mt5_account_snapshots(mt5_account_id, observed_at DESC);

CREATE TABLE IF NOT EXISTS mt5_deals (
  id TEXT PRIMARY KEY,
  mt5_account_id TEXT NOT NULL REFERENCES mt5_accounts(id) ON DELETE CASCADE,
  deal_ticket TEXT NOT NULL,
  order_ticket TEXT,
  position_id TEXT,
  occurred_at TEXT NOT NULL,
  time_msc INTEGER NOT NULL,
  deal_type INTEGER NOT NULL,
  entry_type INTEGER NOT NULL,
  symbol TEXT,
  volume_text TEXT NOT NULL,
  price_text TEXT NOT NULL,
  profit_minor INTEGER NOT NULL DEFAULT 0,
  commission_minor INTEGER NOT NULL DEFAULT 0,
  swap_minor INTEGER NOT NULL DEFAULT 0,
  fee_minor INTEGER NOT NULL DEFAULT 0,
  magic TEXT,
  reason INTEGER,
  comment TEXT,
  external_id TEXT,
  imported_at TEXT NOT NULL,
  UNIQUE(mt5_account_id, deal_ticket)
);

CREATE INDEX IF NOT EXISTS idx_mt5_deals_position
  ON mt5_deals(mt5_account_id, position_id, time_msc);

CREATE TABLE IF NOT EXISTS mt5_open_positions (
  mt5_account_id TEXT NOT NULL REFERENCES mt5_accounts(id) ON DELETE CASCADE,
  position_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  position_type INTEGER NOT NULL,
  opened_at TEXT NOT NULL,
  volume_text TEXT NOT NULL,
  price_open_text TEXT NOT NULL,
  price_current_text TEXT,
  profit_minor INTEGER NOT NULL DEFAULT 0,
  swap_minor INTEGER NOT NULL DEFAULT 0,
  observed_at TEXT NOT NULL,
  PRIMARY KEY(mt5_account_id, position_id)
);

CREATE TABLE IF NOT EXISTS mt5_position_links (
  mt5_account_id TEXT NOT NULL REFERENCES mt5_accounts(id) ON DELETE CASCADE,
  position_id TEXT NOT NULL,
  trade_id TEXT NOT NULL UNIQUE REFERENCES trades(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  PRIMARY KEY(mt5_account_id, position_id)
);

CREATE TABLE IF NOT EXISTS mt5_sync_runs (
  id TEXT PRIMARY KEY,
  mt5_account_id TEXT REFERENCES mt5_accounts(id) ON DELETE SET NULL,
  trigger_kind TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'complete', 'unmapped', 'failed', 'account_changed')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  deals_seen INTEGER NOT NULL DEFAULT 0,
  deals_inserted INTEGER NOT NULL DEFAULT 0,
  trades_updated INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_mt5_sync_runs_latest
  ON mt5_sync_runs(started_at DESC);
