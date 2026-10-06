-- PostgreSQL schema for the private single-owner workspace.
-- Separate from the immutable desktop SQLite migration history.
-- IDs, UTC timestamp text, decimal text and JSON text preserve frontend contracts.
-- This creates no personal accounts, provider credentials or example journal data.

CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  broker TEXT,
  account_type TEXT NOT NULL DEFAULT 'personal',
  base_currency TEXT NOT NULL DEFAULT 'EUR',
  initial_balance_minor BIGINT NOT NULL DEFAULT 0,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  default_risk_percent DOUBLE PRECISION NOT NULL DEFAULT 1.0
);

CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE TABLE atlas_notebook_entries (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 160),
    note TEXT NOT NULL DEFAULT '' CHECK(length(note) <= 12000),
    favorite BOOLEAN NOT NULL DEFAULT FALSE,
    context_label TEXT NOT NULL,
    context_json TEXT NOT NULL CHECK((context_json::jsonb) IS NOT NULL),
    sources_json TEXT NOT NULL CHECK((sources_json::jsonb) IS NOT NULL),
    snapshot_png BYTEA,
    snapshot_sha256 TEXT,
    captured_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    revision BIGINT NOT NULL DEFAULT 1 CHECK(revision >= 1),
    trashed_at TEXT,
    CHECK((snapshot_png IS NULL) = (snapshot_sha256 IS NULL))
);

CREATE TABLE atlas_personal_preferences (
    id BIGINT PRIMARY KEY CHECK(id = 1),
    last_context_json TEXT NOT NULL CHECK((last_context_json::jsonb) IS NOT NULL),
    updated_at TEXT NOT NULL
);

CREATE TABLE checklist_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE custom_fields (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  name TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK (field_type IN ('text', 'number', 'boolean', 'date', 'select', 'multiselect')),
  options_json TEXT NOT NULL DEFAULT '[]',
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order BIGINT NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(entity_type, name)
);

CREATE TABLE deleted_items (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  deleted_at TEXT NOT NULL,
  purge_after TEXT,
  UNIQUE(entity_type, entity_id)
);

CREATE TABLE emotions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL ,
  valence TEXT NOT NULL DEFAULT 'neutral' CHECK (valence IN ('positive', 'neutral', 'negative')),
  color TEXT NOT NULL DEFAULT '#64748b',
  created_at TEXT NOT NULL
);

CREATE TABLE goals (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  metric_key TEXT NOT NULL,
  target_value TEXT NOT NULL,
  unit TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'at_least' CHECK (direction IN ('at_least', 'at_most', 'exactly')),
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE media_files (
  id TEXT PRIMARY KEY,
  relative_path TEXT NOT NULL UNIQUE,
  thumbnail_relative_path TEXT,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  sha256 TEXT NOT NULL,
  width BIGINT,
  height BIGINT,
  captured_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE mistakes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL ,
  category TEXT NOT NULL DEFAULT 'process',
  description TEXT,
  countermeasure TEXT,
  severity_default BIGINT NOT NULL DEFAULT 2 CHECK (severity_default BETWEEN 1 AND 5),
  color TEXT NOT NULL DEFAULT '#ef4444',
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE saved_views (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  scope TEXT NOT NULL,
  state_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE strategies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL ,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL ,
  color TEXT NOT NULL DEFAULT '#64748b',
  created_at TEXT NOT NULL
);

CREATE TABLE account_cashflows (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  occurred_at TEXT NOT NULL,
  amount_minor BIGINT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('deposit', 'withdrawal', 'adjustment')),
  note TEXT,
  created_at TEXT NOT NULL
);

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
  balance_minor BIGINT,
  equity_minor BIGINT,
  credential_ref TEXT,
  status_message TEXT,
  last_sync_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(local_account_id),
  UNIQUE(platform, external_account_id, environment)
);

CREATE TABLE checklist_template_items (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  category TEXT,
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE custom_field_values (
  id TEXT PRIMARY KEY,
  custom_field_id TEXT NOT NULL REFERENCES custom_fields(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(custom_field_id, entity_type, entity_id)
);

CREATE TABLE goal_progress (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  recorded_at TEXT NOT NULL,
  value TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'calculated',
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE media_annotations (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL REFERENCES media_files(id) ON DELETE CASCADE,
  annotation_json TEXT NOT NULL,
  preview_relative_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE "reviews" (
  id TEXT PRIMARY KEY,
  account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
  review_type TEXT NOT NULL CHECK (review_type IN ('daily', 'weekly', 'monthly')),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'completed')),
  metric_snapshot_json TEXT NOT NULL DEFAULT '{}',
  wins_html TEXT,
  challenges_html TEXT,
  lessons_html TEXT,
  actions_html TEXT,
  process_rating BIGINT CHECK (process_rating BETWEEN 1 AND 10),
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(account_id, review_type, period_start, period_end)
);

CREATE TABLE setups (
  id TEXT PRIMARY KEY,
  strategy_id TEXT REFERENCES strategies(id) ON DELETE SET NULL,
  name TEXT NOT NULL ,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#8b5cf6',
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE setup_versions (
  id TEXT PRIMARY KEY,
  setup_id TEXT NOT NULL REFERENCES setups(id) ON DELETE CASCADE,
  version BIGINT NOT NULL,
  rules_json TEXT NOT NULL DEFAULT '{}',
  checklist_json TEXT NOT NULL DEFAULT '[]',
  examples_json TEXT NOT NULL DEFAULT '[]',
  notes_html TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(setup_id, version)
);

CREATE TABLE trades (
  id TEXT PRIMARY KEY,
  legacy_id TEXT,
  account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  strategy_id TEXT REFERENCES strategies(id) ON DELETE SET NULL,
  setup_id TEXT REFERENCES setups(id) ON DELETE SET NULL,
  setup_version_id TEXT REFERENCES setup_versions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'planned', 'open', 'closed', 'cancelled', 'archived', 'trashed')),
  instrument TEXT NOT NULL,
  asset_class TEXT NOT NULL DEFAULT 'forex',
  direction TEXT NOT NULL CHECK (direction IN ('long', 'short')),
  session TEXT,
  timeframe TEXT,
  broker_trade_id TEXT,
  opened_at TEXT,
  closed_at TEXT,
  display_timezone TEXT NOT NULL DEFAULT 'Europe/Berlin',
  planned_entry TEXT,
  actual_entry TEXT,
  initial_stop_loss TEXT,
  actual_exit TEXT,
  take_profit TEXT,
  quantity TEXT,
  contract_multiplier TEXT NOT NULL DEFAULT '1',
  position_value_per_price_unit TEXT NOT NULL DEFAULT '1',
  planned_risk_minor BIGINT,
  gross_pnl_minor BIGINT,
  fees_minor BIGINT NOT NULL DEFAULT 0,
  commission_minor BIGINT NOT NULL DEFAULT 0,
  swap_minor BIGINT NOT NULL DEFAULT 0,
  net_pnl_minor BIGINT,
  calculated_r TEXT,
  r_override TEXT,
  r_override_reason TEXT,
  mae_r TEXT,
  mfe_r TEXT,
  followed_plan BOOLEAN,
  followed_risk_rules BOOLEAN,
  followed_entry_rules BOOLEAN,
  followed_exit_rules BOOLEAN,
  impulse_trade BOOLEAN,
  process_score BIGINT CHECK (process_score BETWEEN 1 AND 10),
  execution_score BIGINT CHECK (execution_score BETWEEN 1 AND 10),
  setup_quality BIGINT CHECK (setup_quality BETWEEN 1 AND 10),
  confidence_before BIGINT CHECK (confidence_before BETWEEN 1 AND 10),
  focus_before BIGINT CHECK (focus_before BETWEEN 1 AND 10),
  stress_before BIGINT CHECK (stress_before BETWEEN 1 AND 10),
  energy_before BIGINT CHECK (energy_before BETWEEN 1 AND 10),
  satisfaction_after BIGINT CHECK (satisfaction_after BETWEEN 1 AND 10),
  reviewed_at TEXT,
  thesis_html TEXT,
  execution_notes_html TEXT,
  review_notes_html TEXT,
  lessons_html TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  source_metadata_json TEXT NOT NULL DEFAULT '{}',
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE trade_checklist_items (
  id TEXT PRIMARY KEY,
  trade_id TEXT NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  template_item_id TEXT REFERENCES checklist_template_items(id) ON DELETE SET NULL,
  label_snapshot TEXT NOT NULL,
  category_snapshot TEXT,
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  is_checked BOOLEAN,
  note TEXT,
  sort_order BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE trade_emotions (
  trade_id TEXT NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  emotion_id TEXT NOT NULL REFERENCES emotions(id) ON DELETE CASCADE,
  phase TEXT NOT NULL CHECK (phase IN ('before', 'during', 'after')),
  intensity BIGINT NOT NULL CHECK (intensity BETWEEN 1 AND 10),
  note TEXT,
  PRIMARY KEY (trade_id, emotion_id, phase)
);

CREATE TABLE trade_legs (
  id TEXT PRIMARY KEY,
  trade_id TEXT NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  leg_type TEXT NOT NULL CHECK (leg_type IN ('entry', 'exit')),
  occurred_at TEXT NOT NULL,
  price TEXT NOT NULL,
  quantity TEXT NOT NULL,
  fees_minor BIGINT NOT NULL DEFAULT 0,
  note TEXT,
  sort_order BIGINT NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE trade_media (
  trade_id TEXT NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL REFERENCES media_files(id) ON DELETE CASCADE,
  slot TEXT NOT NULL DEFAULT 'other',
  caption TEXT,
  sort_order BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (trade_id, media_id)
);

CREATE TABLE trade_mistakes (
  trade_id TEXT NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  mistake_id TEXT NOT NULL REFERENCES mistakes(id) ON DELETE CASCADE,
  severity BIGINT NOT NULL CHECK (severity BETWEEN 1 AND 5),
  estimated_cost_minor BIGINT,
  note TEXT,
  PRIMARY KEY (trade_id, mistake_id)
);

CREATE TABLE trade_tags (
  trade_id TEXT NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (trade_id, tag_id)
);

CREATE INDEX idx_atlas_notebook_list ON atlas_notebook_entries(trashed_at, favorite, updated_at);

CREATE UNIQUE INDEX ux_emotions_name_ascii ON emotions (translate(name, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'));

CREATE UNIQUE INDEX ux_mistakes_name_ascii ON mistakes (translate(name, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'));

CREATE UNIQUE INDEX ux_strategies_name_ascii ON strategies (translate(name, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'));

CREATE UNIQUE INDEX ux_tags_name_ascii ON tags (translate(name, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'));

CREATE INDEX idx_broker_connections_status
  ON broker_account_connections(status, last_sync_at DESC);

CREATE INDEX idx_reviews_account_period ON reviews(account_id, period_start DESC);

CREATE UNIQUE INDEX ux_setups_name_ascii ON setups (translate(name, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'));

CREATE INDEX idx_trades_account ON trades(account_id);

CREATE INDEX idx_trades_calculated_r ON trades(calculated_r);

CREATE INDEX idx_trades_closed_at ON trades(closed_at);

CREATE INDEX idx_trades_deleted ON trades(is_deleted, deleted_at);

CREATE INDEX idx_trades_direction ON trades(direction);

CREATE INDEX idx_trades_instrument ON trades(instrument);

CREATE INDEX idx_trades_net_pnl ON trades(net_pnl_minor);

CREATE INDEX idx_trades_opened_at ON trades(opened_at);

CREATE INDEX idx_trades_process_score ON trades(process_score);

CREATE INDEX idx_trades_setup ON trades(setup_id);

CREATE INDEX idx_trades_status ON trades(status);

CREATE INDEX idx_trades_strategy ON trades(strategy_id);

CREATE INDEX idx_trade_emotions_emotion ON trade_emotions(emotion_id, phase);

CREATE INDEX idx_trade_mistakes_mistake ON trade_mistakes(mistake_id);

CREATE TABLE cloud_workspace (
    id BIGINT PRIMARY KEY CHECK(id = 1),
    identity TEXT UNIQUE NOT NULL,
    revision BIGINT NOT NULL CHECK(revision BETWEEN 0 AND 9007199254740991)
);
CREATE TABLE cloud_operations (
    workspace_id TEXT NOT NULL REFERENCES cloud_workspace(identity),
    operation_id TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    response TEXT,
    revision BIGINT NOT NULL CHECK(revision BETWEEN 0 AND 9007199254740991),
    created_at TEXT NOT NULL,
    PRIMARY KEY(workspace_id, operation_id)
);
CREATE INDEX idx_cloud_operations_created ON cloud_operations(created_at);
CREATE TABLE cloud_nonces (
    nonce TEXT PRIMARY KEY,
    timestamp BIGINT NOT NULL
);
CREATE INDEX idx_cloud_nonces_timestamp ON cloud_nonces(timestamp);

