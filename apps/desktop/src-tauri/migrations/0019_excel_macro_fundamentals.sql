-- Excel-backed macro history and the strictly release-matched fundamentals view.
-- Existing provider, policy-rate, COT, seasonality and market-context tables
-- remain independent so this import cannot overwrite their signals.

CREATE TABLE IF NOT EXISTS macro_excel_import_runs (
  id TEXT PRIMARY KEY,
  source_filename TEXT NOT NULL,
  source_sha256 TEXT NOT NULL UNIQUE,
  source_priority INTEGER NOT NULL,
  imported_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('complete', 'partial', 'failed')),
  historical_rows INTEGER NOT NULL DEFAULT 0,
  forecast_rows INTEGER NOT NULL DEFAULT 0,
  warnings_json TEXT NOT NULL DEFAULT '[]',
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS macro_excel_indicator_mappings (
  id TEXT PRIMARY KEY,
  currency TEXT NOT NULL,
  source_indicator_key TEXT NOT NULL,
  source_label TEXT NOT NULL,
  source_category TEXT,
  canonical_key TEXT,
  factor TEXT,
  direction INTEGER NOT NULL DEFAULT 1 CHECK (direction IN (-1, 1)),
  mapping_rank INTEGER NOT NULL DEFAULT 100,
  mapping_status TEXT NOT NULL
    CHECK (mapping_status IN ('mapped', 'context_only', 'unmapped')),
  rationale TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(currency, source_indicator_key)
);
CREATE INDEX IF NOT EXISTS idx_macro_excel_indicator_canonical
  ON macro_excel_indicator_mappings(currency, canonical_key, mapping_rank);

CREATE TABLE IF NOT EXISTS macro_excel_history (
  id TEXT PRIMARY KEY,
  import_run_id TEXT NOT NULL REFERENCES macro_excel_import_runs(id) ON DELETE CASCADE,
  currency TEXT NOT NULL,
  source_indicator_key TEXT NOT NULL,
  reference_period TEXT NOT NULL,
  date_kind TEXT NOT NULL CHECK (date_kind IN ('release_date', 'reference_period')),
  actual_text TEXT,
  actual_value TEXT,
  previous_text TEXT,
  previous_value TEXT,
  historical_forecast_text TEXT,
  historical_forecast_value TEXT,
  unit TEXT,
  frequency TEXT,
  source_name TEXT,
  source_url TEXT,
  forex_factory_url TEXT,
  notes TEXT,
  source_priority INTEGER NOT NULL,
  row_sha256 TEXT NOT NULL,
  superseded_at TEXT,
  imported_at TEXT NOT NULL,
  UNIQUE(import_run_id, row_sha256)
);
CREATE INDEX IF NOT EXISTS idx_macro_excel_history_latest
  ON macro_excel_history(currency, source_indicator_key, reference_period DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_macro_excel_history_active_release
  ON macro_excel_history(currency, source_indicator_key, reference_period)
  WHERE superseded_at IS NULL;

CREATE TABLE IF NOT EXISTS macro_excel_forecast_candidates (
  id TEXT PRIMARY KEY,
  import_run_id TEXT NOT NULL REFERENCES macro_excel_import_runs(id) ON DELETE CASCADE,
  currency TEXT NOT NULL,
  source_indicator_key TEXT NOT NULL,
  source_label TEXT NOT NULL,
  actual_reference_period TEXT,
  actual_text TEXT,
  actual_value TEXT,
  forecast_text TEXT,
  forecast_value TEXT,
  forecast_date TEXT,
  forecast_transformation TEXT,
  unit TEXT,
  frequency TEXT,
  source_url TEXT,
  origin TEXT NOT NULL CHECK (origin IN ('overview', 'current_forecast')),
  source_priority INTEGER NOT NULL,
  candidate_sha256 TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  UNIQUE(import_run_id, candidate_sha256)
);
CREATE INDEX IF NOT EXISTS idx_macro_excel_forecast_match
  ON macro_excel_forecast_candidates(currency, source_indicator_key, actual_reference_period, forecast_date DESC);

CREATE TABLE IF NOT EXISTS macro_excel_fundamental_snapshots (
  id TEXT PRIMARY KEY,
  built_at TEXT NOT NULL,
  input_fingerprint TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('complete', 'partial')),
  notes TEXT
);

CREATE TABLE IF NOT EXISTS macro_excel_fundamental_evaluations (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL REFERENCES macro_excel_fundamental_snapshots(id) ON DELETE CASCADE,
  currency TEXT NOT NULL,
  canonical_key TEXT NOT NULL,
  source_indicator_key TEXT,
  source_label TEXT,
  factor TEXT NOT NULL,
  direction INTEGER NOT NULL CHECK (direction IN (-1, 1)),
  actual_text TEXT,
  forecast_text TEXT,
  previous_text TEXT,
  surprise_text TEXT,
  score INTEGER NOT NULL CHECK (score IN (-1, 0, 1)),
  evaluation_status TEXT NOT NULL
    CHECK (evaluation_status IN (
      'scored', 'neutral', 'missing_actual', 'missing_forecast',
      'release_mismatch', 'unit_mismatch', 'transformation_mismatch',
      'future_release', 'yield_sma_unavailable', 'unmapped'
    )),
  reason_codes_json TEXT NOT NULL DEFAULT '[]',
  released_at TEXT,
  unit TEXT,
  frequency TEXT,
  source_url TEXT,
  source_history_id TEXT REFERENCES macro_excel_history(id),
  UNIQUE(snapshot_id, currency, canonical_key)
);
CREATE INDEX IF NOT EXISTS idx_macro_excel_fundamental_snapshot
  ON macro_excel_fundamental_evaluations(snapshot_id, currency, canonical_key);
