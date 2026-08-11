ALTER TABLE economic_provider_events ADD COLUMN canonical_release_id TEXT;
ALTER TABLE economic_provider_events ADD COLUMN data_origin TEXT NOT NULL DEFAULT 'provider_unverified';
ALTER TABLE economic_provider_events ADD COLUMN scoring_eligible INTEGER NOT NULL DEFAULT 0;
ALTER TABLE economic_provider_events ADD COLUMN raw_payload_sha256 TEXT;

ALTER TABLE macro_snapshots ADD COLUMN snapshot_kind TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE macro_snapshots ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'legacy_unverified';
ALTER TABLE macro_snapshots ADD COLUMN input_fingerprint TEXT;

ALTER TABLE macro_indicators ADD COLUMN source_observation_id TEXT;
ALTER TABLE macro_indicators ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'legacy_unverified';

CREATE TABLE IF NOT EXISTS macro_data_sources (
  source_key TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  publisher TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  base_url TEXT NOT NULL,
  terms_url TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  automation_status TEXT NOT NULL DEFAULT 'catalogued',
  expected_latency_minutes INTEGER,
  notes TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS macro_indicator_catalog (
  currency TEXT NOT NULL,
  indicator_key TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  label TEXT NOT NULL,
  factor TEXT NOT NULL,
  direction INTEGER NOT NULL CHECK (direction IN (-1, 1)),
  unit TEXT NOT NULL,
  frequency TEXT NOT NULL,
  seasonal_adjustment TEXT NOT NULL DEFAULT 'source_defined',
  impact_policy TEXT NOT NULL DEFAULT 'catalogued',
  forecast_source_key TEXT REFERENCES macro_data_sources(source_key),
  actual_source_key TEXT NOT NULL REFERENCES macro_data_sources(source_key),
  official_series_id TEXT,
  calendar_source_key TEXT REFERENCES macro_data_sources(source_key),
  enabled INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (currency, indicator_key)
);

CREATE TABLE IF NOT EXISTS macro_releases (
  id TEXT PRIMARY KEY,
  release_key TEXT NOT NULL UNIQUE,
  currency TEXT NOT NULL,
  indicator_key TEXT,
  title TEXT NOT NULL,
  factor TEXT,
  direction INTEGER NOT NULL DEFAULT 1 CHECK (direction IN (-1, 1)),
  impact TEXT,
  scheduled_at_utc TEXT NOT NULL,
  source_timezone TEXT,
  reference_period TEXT NOT NULL,
  calendar_source_key TEXT NOT NULL REFERENCES macro_data_sources(source_key),
  official_source_key TEXT REFERENCES macro_data_sources(source_key),
  official_source_url TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'awaiting_actual', 'confirmed', 'revised', 'failed', 'unsupported', 'context', 'cancelled')),
  scoreable INTEGER NOT NULL DEFAULT 0,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  confirmed_at TEXT,
  last_checked_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS macro_observations (
  id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL REFERENCES macro_releases(id) ON DELETE CASCADE,
  observation_kind TEXT NOT NULL
    CHECK (observation_kind IN ('forecast', 'actual', 'previous', 'provider_actual')),
  value_text TEXT NOT NULL,
  raw_text TEXT,
  source_key TEXT NOT NULL REFERENCES macro_data_sources(source_key),
  source_url TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  published_at TEXT,
  verification_status TEXT NOT NULL
    CHECK (verification_status IN ('pre_release', 'provisional', 'official_confirmed', 'official_revised', 'rejected')),
  revision_number INTEGER NOT NULL DEFAULT 0,
  payload_sha256 TEXT,
  superseded_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(release_id, observation_kind, source_key, value_text, observed_at)
);

CREATE TABLE IF NOT EXISTS macro_actual_check_jobs (
  id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL UNIQUE REFERENCES macro_releases(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'checking', 'retry_wait', 'confirmed', 'failed', 'unsupported', 'cancelled')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  first_attempt_at TEXT,
  last_attempt_at TEXT,
  last_error TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS macro_source_payloads (
  id TEXT PRIMARY KEY,
  source_key TEXT NOT NULL REFERENCES macro_data_sources(source_key),
  source_url TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  http_status INTEGER,
  content_type TEXT,
  payload_sha256 TEXT NOT NULL,
  schema_fingerprint TEXT,
  payload_text TEXT,
  parse_status TEXT NOT NULL,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS macro_sync_runs (
  id TEXT PRIMARY KEY,
  trigger_kind TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'complete', 'partial', 'failed', 'skipped')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  releases_seen INTEGER NOT NULL DEFAULT 0,
  forecasts_recorded INTEGER NOT NULL DEFAULT 0,
  actuals_confirmed INTEGER NOT NULL DEFAULT 0,
  snapshots_created INTEGER NOT NULL DEFAULT 0,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS macro_sync_leases (
  lease_key TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  acquired_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_macro_releases_schedule
  ON macro_releases(status, scheduled_at_utc);
CREATE INDEX IF NOT EXISTS idx_macro_releases_indicator
  ON macro_releases(currency, indicator_key, scheduled_at_utc DESC);
CREATE INDEX IF NOT EXISTS idx_macro_observations_release
  ON macro_observations(release_id, observation_kind, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_macro_actual_jobs_due
  ON macro_actual_check_jobs(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_macro_sync_runs_latest
  ON macro_sync_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_macro_snapshots_verified
  ON macro_snapshots(snapshot_kind, verification_status, snapshot_at DESC);

UPDATE economic_provider_events
SET data_origin = 'embedded_seed', scoring_eligible = 0
WHERE scheduled_at = '2026-06-19T17:55:13.433Z'
  AND provider = 'forex_factory';

UPDATE macro_snapshots
SET snapshot_kind = 'legacy', verification_status = 'legacy_unverified'
WHERE verification_status = 'legacy_unverified';

UPDATE macro_indicators
SET verification_status = 'legacy_unverified'
WHERE verification_status = 'legacy_unverified';

INSERT OR IGNORE INTO app_settings (key, value_json) VALUES
  ('macroSync', '{"backgroundEnabled":true,"taskIntervalMinutes":1,"officialActualOnly":true,"revisionPolicy":"recalculate"}');
