PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  broker TEXT,
  account_type TEXT NOT NULL DEFAULT 'personal',
  base_currency TEXT NOT NULL DEFAULT 'EUR',
  initial_balance_minor INTEGER NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS account_cashflows (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  occurred_at TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('deposit', 'withdrawal', 'adjustment')),
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS strategies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS setups (
  id TEXT PRIMARY KEY,
  strategy_id TEXT REFERENCES strategies(id) ON DELETE SET NULL,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#8b5cf6',
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS setup_versions (
  id TEXT PRIMARY KEY,
  setup_id TEXT NOT NULL REFERENCES setups(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  rules_json TEXT NOT NULL DEFAULT '{}',
  checklist_json TEXT NOT NULL DEFAULT '[]',
  examples_json TEXT NOT NULL DEFAULT '[]',
  notes_html TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(setup_id, version)
);

CREATE TABLE IF NOT EXISTS trades (
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
  planned_risk_minor INTEGER,
  gross_pnl_minor INTEGER,
  fees_minor INTEGER NOT NULL DEFAULT 0,
  commission_minor INTEGER NOT NULL DEFAULT 0,
  swap_minor INTEGER NOT NULL DEFAULT 0,
  net_pnl_minor INTEGER,
  calculated_r TEXT,
  r_override TEXT,
  r_override_reason TEXT,
  mae_r TEXT,
  mfe_r TEXT,
  followed_plan INTEGER CHECK (followed_plan IN (0, 1)),
  followed_risk_rules INTEGER CHECK (followed_risk_rules IN (0, 1)),
  followed_entry_rules INTEGER CHECK (followed_entry_rules IN (0, 1)),
  followed_exit_rules INTEGER CHECK (followed_exit_rules IN (0, 1)),
  impulse_trade INTEGER CHECK (impulse_trade IN (0, 1)),
  process_score INTEGER CHECK (process_score BETWEEN 1 AND 10),
  execution_score INTEGER CHECK (execution_score BETWEEN 1 AND 10),
  setup_quality INTEGER CHECK (setup_quality BETWEEN 1 AND 10),
  confidence_before INTEGER CHECK (confidence_before BETWEEN 1 AND 10),
  focus_before INTEGER CHECK (focus_before BETWEEN 1 AND 10),
  stress_before INTEGER CHECK (stress_before BETWEEN 1 AND 10),
  energy_before INTEGER CHECK (energy_before BETWEEN 1 AND 10),
  satisfaction_after INTEGER CHECK (satisfaction_after BETWEEN 1 AND 10),
  reviewed_at TEXT,
  thesis_html TEXT,
  execution_notes_html TEXT,
  review_notes_html TEXT,
  lessons_html TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  source_metadata_json TEXT NOT NULL DEFAULT '{}',
  is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trade_legs (
  id TEXT PRIMARY KEY,
  trade_id TEXT NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  leg_type TEXT NOT NULL CHECK (leg_type IN ('entry', 'exit')),
  occurred_at TEXT NOT NULL,
  price TEXT NOT NULL,
  quantity TEXT NOT NULL,
  fees_minor INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  color TEXT NOT NULL DEFAULT '#64748b',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trade_tags (
  trade_id TEXT NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (trade_id, tag_id)
);

CREATE TABLE IF NOT EXISTS checklist_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS checklist_template_items (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  category TEXT,
  is_required INTEGER NOT NULL DEFAULT 0 CHECK (is_required IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS trade_checklist_items (
  id TEXT PRIMARY KEY,
  trade_id TEXT NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  template_item_id TEXT REFERENCES checklist_template_items(id) ON DELETE SET NULL,
  label_snapshot TEXT NOT NULL,
  category_snapshot TEXT,
  is_required INTEGER NOT NULL DEFAULT 0 CHECK (is_required IN (0, 1)),
  is_checked INTEGER CHECK (is_checked IN (0, 1)),
  note TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS emotions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  valence TEXT NOT NULL DEFAULT 'neutral' CHECK (valence IN ('positive', 'neutral', 'negative')),
  color TEXT NOT NULL DEFAULT '#64748b',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trade_emotions (
  trade_id TEXT NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  emotion_id TEXT NOT NULL REFERENCES emotions(id) ON DELETE CASCADE,
  phase TEXT NOT NULL CHECK (phase IN ('before', 'during', 'after')),
  intensity INTEGER NOT NULL CHECK (intensity BETWEEN 1 AND 10),
  note TEXT,
  PRIMARY KEY (trade_id, emotion_id, phase)
);

CREATE TABLE IF NOT EXISTS mistakes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  category TEXT NOT NULL DEFAULT 'process',
  description TEXT,
  countermeasure TEXT,
  severity_default INTEGER NOT NULL DEFAULT 2 CHECK (severity_default BETWEEN 1 AND 5),
  color TEXT NOT NULL DEFAULT '#ef4444',
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trade_mistakes (
  trade_id TEXT NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  mistake_id TEXT NOT NULL REFERENCES mistakes(id) ON DELETE CASCADE,
  severity INTEGER NOT NULL CHECK (severity BETWEEN 1 AND 5),
  estimated_cost_minor INTEGER,
  note TEXT,
  PRIMARY KEY (trade_id, mistake_id)
);

CREATE TABLE IF NOT EXISTS media_files (
  id TEXT PRIMARY KEY,
  relative_path TEXT NOT NULL UNIQUE,
  thumbnail_relative_path TEXT,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  captured_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trade_media (
  trade_id TEXT NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL REFERENCES media_files(id) ON DELETE CASCADE,
  slot TEXT NOT NULL DEFAULT 'other',
  caption TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (trade_id, media_id)
);

CREATE TABLE IF NOT EXISTS media_annotations (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL REFERENCES media_files(id) ON DELETE CASCADE,
  annotation_json TEXT NOT NULL,
  preview_relative_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  review_type TEXT NOT NULL CHECK (review_type IN ('daily', 'weekly', 'monthly')),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'completed')),
  metric_snapshot_json TEXT NOT NULL DEFAULT '{}',
  wins_html TEXT,
  challenges_html TEXT,
  lessons_html TEXT,
  actions_html TEXT,
  process_rating INTEGER CHECK (process_rating BETWEEN 1 AND 10),
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(review_type, period_start, period_end)
);

CREATE TABLE IF NOT EXISTS goals (
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

CREATE TABLE IF NOT EXISTS goal_progress (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  recorded_at TEXT NOT NULL,
  value TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'calculated',
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS saved_filters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  scope TEXT NOT NULL,
  filter_json TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS saved_views (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  scope TEXT NOT NULL,
  state_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dashboard_layouts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  layout_json TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS custom_fields (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  name TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK (field_type IN ('text', 'number', 'boolean', 'date', 'select', 'multiselect')),
  options_json TEXT NOT NULL DEFAULT '[]',
  is_required INTEGER NOT NULL DEFAULT 0 CHECK (is_required IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(entity_type, name)
);

CREATE TABLE IF NOT EXISTS custom_field_values (
  id TEXT PRIMARY KEY,
  custom_field_id TEXT NOT NULL REFERENCES custom_fields(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(custom_field_id, entity_type, entity_id)
);

CREATE TABLE IF NOT EXISTS metric_snapshots (
  id TEXT PRIMARY KEY,
  snapshot_type TEXT NOT NULL,
  calculation_version TEXT NOT NULL,
  filter_fingerprint TEXT NOT NULL,
  period_start TEXT,
  period_end TEXT,
  payload_json TEXT NOT NULL,
  source_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deleted_items (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  deleted_at TEXT NOT NULL,
  purge_after TEXT,
  UNIQUE(entity_type, entity_id)
);

CREATE TABLE IF NOT EXISTS import_runs (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_filename TEXT,
  source_sha256 TEXT,
  status TEXT NOT NULL CHECK (status IN ('preview', 'committed', 'failed', 'cancelled')),
  mapping_json TEXT NOT NULL DEFAULT '{}',
  total_rows INTEGER NOT NULL DEFAULT 0,
  valid_rows INTEGER NOT NULL DEFAULT 0,
  invalid_rows INTEGER NOT NULL DEFAULT 0,
  duplicate_rows INTEGER NOT NULL DEFAULT 0,
  report_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  committed_at TEXT
);

CREATE TABLE IF NOT EXISTS import_rows (
  id TEXT PRIMARY KEY,
  import_run_id TEXT NOT NULL REFERENCES import_runs(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  status TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  normalized_json TEXT,
  errors_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS export_runs (
  id TEXT PRIMARY KEY,
  export_type TEXT NOT NULL,
  format TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  filter_json TEXT NOT NULL DEFAULT '{}',
  record_count INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS macro_snapshots (
  id TEXT PRIMARY KEY,
  snapshot_at TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_url TEXT,
  calculation_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'complete',
  notes TEXT
);

CREATE TABLE IF NOT EXISTS macro_indicators (
  id TEXT PRIMARY KEY,
  macro_snapshot_id TEXT NOT NULL REFERENCES macro_snapshots(id) ON DELETE CASCADE,
  currency TEXT NOT NULL,
  factor TEXT NOT NULL CHECK (factor IN ('growth', 'inflation', 'labor', 'rates', 'cot', 'seasonality', 'sentiment', 'technical')),
  indicator_key TEXT NOT NULL,
  label TEXT NOT NULL,
  actual TEXT,
  forecast TEXT,
  previous TEXT,
  surprise TEXT,
  direction INTEGER NOT NULL DEFAULT 1 CHECK (direction IN (-1, 1)),
  signal INTEGER CHECK (signal IN (-1, 0, 1)),
  component_weight TEXT NOT NULL DEFAULT '1',
  quality TEXT NOT NULL DEFAULT '1',
  released_at TEXT,
  UNIQUE(macro_snapshot_id, currency, indicator_key)
);

CREATE TABLE IF NOT EXISTS cot_snapshots (
  id TEXT PRIMARY KEY,
  macro_snapshot_id TEXT NOT NULL REFERENCES macro_snapshots(id) ON DELETE CASCADE,
  asset_code TEXT NOT NULL,
  currency TEXT,
  report_date TEXT NOT NULL,
  long_positions INTEGER,
  short_positions INTEGER,
  net_positions INTEGER,
  net_change INTEGER,
  long_pct TEXT,
  short_pct TEXT,
  z_score TEXT,
  signal INTEGER CHECK (signal IN (-1, 0, 1)),
  UNIQUE(macro_snapshot_id, asset_code, report_date)
);

CREATE TABLE IF NOT EXISTS seasonality_snapshots (
  id TEXT PRIMARY KEY,
  macro_snapshot_id TEXT NOT NULL REFERENCES macro_snapshots(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  horizon TEXT NOT NULL,
  sample_start TEXT,
  sample_end TEXT,
  average_return TEXT,
  positive_ratio TEXT,
  signal INTEGER CHECK (signal IN (-1, 0, 1)),
  curve_json TEXT NOT NULL DEFAULT '[]',
  UNIQUE(macro_snapshot_id, symbol, horizon)
);

CREATE TABLE IF NOT EXISTS policy_rate_snapshots (
  id TEXT PRIMARY KEY,
  macro_snapshot_id TEXT NOT NULL REFERENCES macro_snapshots(id) ON DELETE CASCADE,
  currency TEXT NOT NULL,
  central_bank TEXT NOT NULL,
  effective_at TEXT NOT NULL,
  current_rate TEXT,
  expected_rate TEXT,
  implied_change_bps TEXT,
  hike_probability TEXT,
  hold_probability TEXT,
  cut_probability TEXT,
  global_hiking_share TEXT,
  relative_us_effectiveness TEXT,
  signal INTEGER CHECK (signal IN (-1, 0, 1)),
  UNIQUE(macro_snapshot_id, currency, effective_at)
);

CREATE TABLE IF NOT EXISTS macro_currency_scores (
  id TEXT PRIMARY KEY,
  macro_snapshot_id TEXT NOT NULL REFERENCES macro_snapshots(id) ON DELETE CASCADE,
  currency TEXT NOT NULL,
  factor_scores_json TEXT NOT NULL,
  raw_score TEXT NOT NULL,
  normalized_score TEXT NOT NULL,
  coverage TEXT NOT NULL,
  quality TEXT NOT NULL,
  UNIQUE(macro_snapshot_id, currency)
);

CREATE TABLE IF NOT EXISTS macro_pair_scores (
  id TEXT PRIMARY KEY,
  macro_snapshot_id TEXT NOT NULL REFERENCES macro_snapshots(id) ON DELETE CASCADE,
  base_currency TEXT NOT NULL,
  quote_currency TEXT NOT NULL,
  factor_contributions_json TEXT NOT NULL,
  raw_score TEXT NOT NULL,
  normalized_score TEXT NOT NULL,
  coverage TEXT NOT NULL,
  agreement TEXT NOT NULL,
  quality TEXT NOT NULL,
  conviction INTEGER NOT NULL DEFAULT 0 CHECK (conviction BETWEEN 0 AND 5),
  bias_label TEXT NOT NULL,
  UNIQUE(macro_snapshot_id, base_currency, quote_currency)
);

CREATE TABLE IF NOT EXISTS trade_context_links (
  trade_id TEXT NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  macro_snapshot_id TEXT NOT NULL REFERENCES macro_snapshots(id) ON DELETE CASCADE,
  linked_at TEXT NOT NULL,
  note TEXT,
  PRIMARY KEY (trade_id, macro_snapshot_id)
);

CREATE INDEX IF NOT EXISTS idx_trades_opened_at ON trades(opened_at);
CREATE INDEX IF NOT EXISTS idx_trades_closed_at ON trades(closed_at);
CREATE INDEX IF NOT EXISTS idx_trades_instrument ON trades(instrument);
CREATE INDEX IF NOT EXISTS idx_trades_setup ON trades(setup_id);
CREATE INDEX IF NOT EXISTS idx_trades_strategy ON trades(strategy_id);
CREATE INDEX IF NOT EXISTS idx_trades_account ON trades(account_id);
CREATE INDEX IF NOT EXISTS idx_trades_direction ON trades(direction);
CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
CREATE INDEX IF NOT EXISTS idx_trades_net_pnl ON trades(net_pnl_minor);
CREATE INDEX IF NOT EXISTS idx_trades_calculated_r ON trades(calculated_r);
CREATE INDEX IF NOT EXISTS idx_trades_process_score ON trades(process_score);
CREATE INDEX IF NOT EXISTS idx_trades_deleted ON trades(is_deleted, deleted_at);
CREATE INDEX IF NOT EXISTS idx_trade_mistakes_mistake ON trade_mistakes(mistake_id);
CREATE INDEX IF NOT EXISTS idx_trade_emotions_emotion ON trade_emotions(emotion_id, phase);
CREATE INDEX IF NOT EXISTS idx_metric_snapshots_lookup ON metric_snapshots(snapshot_type, filter_fingerprint, created_at);
CREATE INDEX IF NOT EXISTS idx_macro_indicators_lookup ON macro_indicators(currency, factor, released_at);
CREATE INDEX IF NOT EXISTS idx_macro_pair_scores_lookup ON macro_pair_scores(macro_snapshot_id, normalized_score);

INSERT OR IGNORE INTO app_settings (key, value_json) VALUES
  ('appearance', '{"theme":"dark","density":"comfortable","sidebarCollapsed":false}'),
  ('locale', '{"language":"de-DE","timezone":"Europe/Berlin","currency":"EUR"}'),
  ('analytics', '{"minimumRankingSample":10,"minimumCorrelationSample":20,"rollingWindow":20}'),
  ('backup', '{"automatic":true,"retention":10}');

INSERT OR IGNORE INTO schema_migrations (version, name) VALUES (1, 'initial');
