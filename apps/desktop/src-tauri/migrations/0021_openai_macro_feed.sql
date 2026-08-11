-- OpenAI-assisted, source-backed orchestration for the managed Excel macro feed.
-- Numeric scoring continues to use only the macro_excel_* tables populated by
-- the verified workbook importer.

CREATE TABLE IF NOT EXISTS macro_feed_source_domains (
  domain TEXT PRIMARY KEY,
  source_role TEXT NOT NULL CHECK (source_role IN ('official', 'consensus')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  approved_at TEXT NOT NULL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS macro_feed_sync_runs (
  id TEXT PRIMARY KEY,
  trigger_kind TEXT NOT NULL CHECK (trigger_kind IN ('startup', 'scheduled', 'manual')),
  status TEXT NOT NULL CHECK (status IN ('running', 'complete', 'partial', 'failed', 'skipped')),
  model TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  response_id TEXT,
  events_seen INTEGER NOT NULL DEFAULT 0,
  observations_recorded INTEGER NOT NULL DEFAULT 0,
  review_candidates INTEGER NOT NULL DEFAULT 0,
  workbook_updated INTEGER NOT NULL DEFAULT 0 CHECK (workbook_updated IN (0, 1)),
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS macro_feed_release_events (
  id TEXT PRIMARY KEY,
  release_key TEXT NOT NULL,
  provider_event_id TEXT,
  currency TEXT NOT NULL,
  canonical_key TEXT NOT NULL,
  source_indicator_key TEXT NOT NULL,
  source_label TEXT NOT NULL,
  reference_period TEXT NOT NULL,
  scheduled_at_utc TEXT NOT NULL,
  timing_status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (timing_status IN ('confirmed', 'estimated')),
  unit TEXT NOT NULL,
  frequency TEXT NOT NULL,
  transformation TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'awaiting_actual', 'provisional', 'confirmed', 'revised', 'conflict', 'unavailable', 'superseded')),
  verification_status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (verification_status IN ('scheduled', 'pre_release', 'provisional', 'official_confirmed', 'official_revised', 'conflict', 'unavailable')),
  primary_source_url TEXT,
  source_published_at TEXT,
  superseded_by_event_id TEXT REFERENCES macro_feed_release_events(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(release_key, scheduled_at_utc)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_macro_feed_current_release
  ON macro_feed_release_events(release_key)
  WHERE status != 'superseded';
CREATE INDEX IF NOT EXISTS idx_macro_feed_release_schedule
  ON macro_feed_release_events(status, scheduled_at_utc);

CREATE TABLE IF NOT EXISTS macro_feed_jobs (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES macro_feed_release_events(id) ON DELETE CASCADE,
  job_kind TEXT NOT NULL CHECK (job_kind IN ('forecast', 'actual', 'revision')),
  scheduled_for TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'complete', 'failed', 'cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(event_id, job_kind, scheduled_for)
);
CREATE INDEX IF NOT EXISTS idx_macro_feed_jobs_due
  ON macro_feed_jobs(status, scheduled_for);

CREATE TABLE IF NOT EXISTS macro_feed_observations (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES macro_feed_release_events(id) ON DELETE CASCADE,
  sync_run_id TEXT NOT NULL REFERENCES macro_feed_sync_runs(id) ON DELETE CASCADE,
  observation_kind TEXT NOT NULL CHECK (observation_kind IN ('forecast', 'actual', 'previous', 'revision')),
  value_text TEXT NOT NULL,
  value_decimal TEXT NOT NULL,
  unit TEXT NOT NULL,
  transformation TEXT NOT NULL,
  verification_status TEXT NOT NULL
    CHECK (verification_status IN ('pre_release', 'provisional', 'official_confirmed', 'official_revised', 'rejected')),
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_role TEXT NOT NULL CHECK (source_role IN ('official', 'consensus')),
  source_published_at TEXT,
  captured_at TEXT NOT NULL,
  observation_sha256 TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_macro_feed_observation_event
  ON macro_feed_observations(event_id, observation_kind, captured_at DESC);

CREATE TABLE IF NOT EXISTS macro_feed_evidence (
  id TEXT PRIMARY KEY,
  sync_run_id TEXT NOT NULL REFERENCES macro_feed_sync_runs(id) ON DELETE CASCADE,
  event_id TEXT REFERENCES macro_feed_release_events(id) ON DELETE SET NULL,
  source_url TEXT NOT NULL,
  source_domain TEXT NOT NULL,
  source_title TEXT,
  source_role TEXT NOT NULL CHECK (source_role IN ('official', 'consensus')),
  source_published_at TEXT,
  retrieved_at TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  UNIQUE(sync_run_id, source_url)
);

CREATE TABLE IF NOT EXISTS macro_feed_review_candidates (
  id TEXT PRIMARY KEY,
  sync_run_id TEXT NOT NULL REFERENCES macro_feed_sync_runs(id) ON DELETE CASCADE,
  currency TEXT NOT NULL,
  source_indicator_key TEXT NOT NULL,
  source_label TEXT NOT NULL,
  proposed_canonical_key TEXT,
  rationale TEXT NOT NULL,
  source_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'ignored')),
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(currency, source_indicator_key, source_url)
);
CREATE INDEX IF NOT EXISTS idx_macro_feed_review_status
  ON macro_feed_review_candidates(status, created_at DESC);

CREATE TABLE IF NOT EXISTS macro_feed_workbook_versions (
  id TEXT PRIMARY KEY,
  sync_run_id TEXT REFERENCES macro_feed_sync_runs(id) ON DELETE SET NULL,
  workbook_path TEXT NOT NULL,
  workbook_sha256 TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  imported_at TEXT,
  import_run_id TEXT REFERENCES macro_excel_import_runs(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('staged', 'active', 'failed', 'superseded')),
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_macro_feed_workbook_latest
  ON macro_feed_workbook_versions(status, created_at DESC);

INSERT OR IGNORE INTO macro_feed_source_domains(domain, source_role, approved_at, notes) VALUES
  ('bls.gov', 'official', CURRENT_TIMESTAMP, 'US inflation and labor'),
  ('bea.gov', 'official', CURRENT_TIMESTAMP, 'US GDP and PCE'),
  ('census.gov', 'official', CURRENT_TIMESTAMP, 'US retail and activity'),
  ('federalreserve.gov', 'official', CURRENT_TIMESTAMP, 'Federal Reserve'),
  ('ec.europa.eu', 'official', CURRENT_TIMESTAMP, 'Eurostat'),
  ('ecb.europa.eu', 'official', CURRENT_TIMESTAMP, 'European Central Bank'),
  ('ons.gov.uk', 'official', CURRENT_TIMESTAMP, 'UK Office for National Statistics'),
  ('bankofengland.co.uk', 'official', CURRENT_TIMESTAMP, 'Bank of England'),
  ('statcan.gc.ca', 'official', CURRENT_TIMESTAMP, 'Statistics Canada'),
  ('bankofcanada.ca', 'official', CURRENT_TIMESTAMP, 'Bank of Canada'),
  ('abs.gov.au', 'official', CURRENT_TIMESTAMP, 'Australian Bureau of Statistics'),
  ('rba.gov.au', 'official', CURRENT_TIMESTAMP, 'Reserve Bank of Australia'),
  ('stats.govt.nz', 'official', CURRENT_TIMESTAMP, 'Stats NZ'),
  ('rbnz.govt.nz', 'official', CURRENT_TIMESTAMP, 'Reserve Bank of New Zealand'),
  ('e-stat.go.jp', 'official', CURRENT_TIMESTAMP, 'Japan e-Stat'),
  ('stat.go.jp', 'official', CURRENT_TIMESTAMP, 'Statistics Bureau Japan'),
  ('boj.or.jp', 'official', CURRENT_TIMESTAMP, 'Bank of Japan'),
  ('bfs.admin.ch', 'official', CURRENT_TIMESTAMP, 'Swiss Federal Statistical Office'),
  ('snb.ch', 'official', CURRENT_TIMESTAMP, 'Swiss National Bank'),
  ('stats.gov.cn', 'official', CURRENT_TIMESTAMP, 'National Bureau of Statistics of China'),
  ('pbc.gov.cn', 'official', CURRENT_TIMESTAMP, 'People''s Bank of China'),
  ('tradingeconomics.com', 'consensus', CURRENT_TIMESTAMP, 'Public consensus discovery'),
  ('reuters.com', 'consensus', CURRENT_TIMESTAMP, 'Public economist surveys');
