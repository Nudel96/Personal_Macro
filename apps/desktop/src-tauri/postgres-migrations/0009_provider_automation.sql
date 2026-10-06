-- Persistent scheduling and encrypted credentials, separate from desktop SQLite.
CREATE TABLE cloud_provider_jobs (
  id TEXT PRIMARY KEY,
  task_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK(kind IN ('macro-plan','macro-release','myfxbook')),
  payload_json TEXT NOT NULL CHECK(octet_length(payload_json)<=4096),
  due_at BIGINT NOT NULL,
  retry_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','staged','complete','expired','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 8),
  lease_id TEXT,
  lease_until BIGINT NOT NULL DEFAULT 0,
  stage_json TEXT CHECK(octet_length(stage_json)<=262144),
  outcome_json TEXT CHECK(octet_length(outcome_json)<=32768),
  error_code TEXT CHECK(length(error_code)<=80),
  completed_at BIGINT,
  CHECK(expires_at>due_at)
);
CREATE INDEX cloud_provider_jobs_due ON cloud_provider_jobs(status,retry_at,due_at);

CREATE TABLE cloud_myfxbook_authorizations (
  id TEXT PRIMARY KEY,
  sealed_credentials TEXT NOT NULL CHECK(octet_length(sealed_credentials)<=8192),
  expires_at BIGINT NOT NULL
);
CREATE TABLE cloud_myfxbook_previews (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  sealed_preview TEXT NOT NULL CHECK(octet_length(sealed_preview)<=1048576),
  expires_at BIGINT NOT NULL
);
CREATE TABLE cloud_myfxbook_credentials (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id),
  sealed_credentials TEXT NOT NULL CHECK(octet_length(sealed_credentials)<=8192)
);
CREATE TABLE myfxbook_connections (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id),
  external_id TEXT NOT NULL UNIQUE,
  external_name TEXT NOT NULL,
  currency TEXT NOT NULL,
  broker_timezone TEXT NOT NULL,
  pnl_mode TEXT NOT NULL CHECK(pnl_mode IN ('auto','net','gross')),
  enabled BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'paused',
  message TEXT NOT NULL DEFAULT '',
  last_attempt_at TEXT,
  last_sync_at TEXT,
  last_provider_at TEXT,
  balance_minor BIGINT,
  history_keys_json TEXT NOT NULL DEFAULT '[]',
  backup_at TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE myfxbook_links (
  account_id TEXT NOT NULL REFERENCES myfxbook_connections(account_id),
  source_key TEXT NOT NULL,
  trade_id TEXT REFERENCES trades(id),
  cashflow_id TEXT REFERENCES account_cashflows(id),
  initial_capital BOOLEAN NOT NULL DEFAULT false,
  payload_json TEXT NOT NULL,
  PRIMARY KEY(account_id,source_key),
  CHECK((trade_id IS NOT NULL)::int+(cashflow_id IS NOT NULL)::int+initial_capital::int=1)
);
CREATE UNIQUE INDEX myfxbook_trade_identity ON myfxbook_links(trade_id) WHERE trade_id IS NOT NULL;
CREATE UNIQUE INDEX myfxbook_cashflow_identity ON myfxbook_links(cashflow_id) WHERE cashflow_id IS NOT NULL;
-- Before-images of affected account rows are committed with every import.
-- These records stay private, support investigation and never enter market shards.
CREATE TABLE cloud_myfxbook_imports (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  created_at TEXT NOT NULL,
  before_json TEXT NOT NULL CHECK(octet_length(before_json)<=4194304),
  result_json TEXT NOT NULL CHECK(octet_length(result_json)<=1048576)
);
