CREATE TABLE broker_account_connections (
  id TEXT PRIMARY KEY,
  local_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('mt5', 'ctrader')),
  external_account_id TEXT NOT NULL,
  account_login TEXT,
  broker_name TEXT,
  server_name TEXT,
  environment TEXT NOT NULL DEFAULT 'live' CHECK (environment IN ('live', 'demo', 'local')),
  access_scope TEXT NOT NULL DEFAULT 'accounts' CHECK (access_scope = 'accounts'),
  status TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'disconnected', 'action_required')),
  base_currency TEXT,
  balance_minor INTEGER,
  equity_minor INTEGER,
  credential_ref TEXT,
  status_message TEXT,
  last_sync_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(local_account_id),
  UNIQUE(platform, external_account_id, environment)
);

CREATE INDEX idx_broker_connections_status
  ON broker_account_connections(status, last_sync_at DESC);

-- Preserve mappings made by the retired MT5 screen. Secrets were never stored
-- in these legacy tables; the local terminal remains the only credential source.
INSERT OR IGNORE INTO broker_account_connections (
  id,
  local_account_id,
  platform,
  external_account_id,
  account_login,
  broker_name,
  server_name,
  environment,
  status,
  base_currency,
  balance_minor,
  equity_minor,
  status_message,
  last_sync_at,
  created_at,
  updated_at
)
SELECT
  'mt5-' || m.id,
  m.local_account_id,
  'mt5',
  m.server_key || ':' || m.login,
  m.login,
  COALESCE(m.company, m.provider),
  m.server,
  'local',
  CASE WHEN m.is_connected = 1 THEN 'connected' ELSE 'disconnected' END,
  m.currency,
  (SELECT s.balance_minor FROM mt5_account_snapshots s WHERE s.mt5_account_id = m.id ORDER BY s.observed_at DESC LIMIT 1),
  (SELECT s.equity_minor FROM mt5_account_snapshots s WHERE s.mt5_account_id = m.id ORDER BY s.observed_at DESC LIMIT 1),
  'Aus früherer lokaler MT5-Verbindung übernommen.',
  m.last_sync_at,
  m.created_at,
  m.updated_at
FROM mt5_accounts m
WHERE m.local_account_id IS NOT NULL;
