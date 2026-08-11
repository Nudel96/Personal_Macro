-- EODHD becomes the only numeric source for the Economic Overview and the
-- fundamental pair heatmap. The immutable earlier migrations still exist so
-- existing profiles can upgrade, but their Excel/OpenAI runtime tables are
-- retired below after the country-specific mapping labels have been carried
-- into provider-native profiles.

CREATE TABLE eodhd_sync_runs (
  id TEXT PRIMARY KEY,
  trigger_kind TEXT NOT NULL CHECK (trigger_kind IN ('startup','scheduled','manual')),
  status TEXT NOT NULL CHECK (status IN ('running','complete','partial','failed','skipped')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  countries_requested INTEGER NOT NULL DEFAULT 0,
  events_seen INTEGER NOT NULL DEFAULT 0,
  events_updated INTEGER NOT NULL DEFAULT 0,
  mapping_candidates INTEGER NOT NULL DEFAULT 0,
  snapshot_updated INTEGER NOT NULL DEFAULT 0 CHECK (snapshot_updated IN (0,1)),
  error_message TEXT
);

CREATE INDEX idx_eodhd_sync_runs_started
  ON eodhd_sync_runs(started_at DESC);

CREATE TABLE eodhd_indicator_profiles (
  id TEXT PRIMARY KEY,
  currency TEXT NOT NULL,
  canonical_key TEXT NOT NULL,
  target_label TEXT NOT NULL,
  factor TEXT NOT NULL,
  direction INTEGER NOT NULL CHECK (direction IN (-1,1)),
  expected_comparison TEXT,
  expected_frequency TEXT,
  mapping_rank INTEGER NOT NULL DEFAULT 100,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  updated_at TEXT NOT NULL,
  UNIQUE(currency, canonical_key)
);

WITH
currencies(currency) AS (
  VALUES ('AUD'),('CAD'),('CHF'),('CNY'),('EUR'),('GBP'),('JPY'),('NZD'),('USD')
),
fields(canonical_key,target_label,factor,direction,expected_comparison) AS (
  VALUES
    ('gdp','GDP','growth',1,'qoq'),
    ('manufacturing_pmi','Manufacturing PMI','growth',1,NULL),
    ('services_pmi','Services PMI','growth',1,NULL),
    ('retail_sales','Retail Sales','growth',1,NULL),
    ('consumer_confidence','Consumer Confidence','growth',1,NULL),
    ('cpi_yoy','CPI','inflation',1,'yoy'),
    ('ppi_yoy','PPI','inflation',1,'yoy'),
    ('pce_yoy','Core Inflation','inflation',1,'yoy'),
    ('interest_rates','Interest Rate Decision','rates',1,NULL),
    ('nfp','Employment Change','labor',1,NULL),
    ('unemployment_rate','Unemployment Rate','labor',-1,NULL),
    ('unemployment_claims','Unemployment Claims','labor',-1,NULL),
    ('adp','ADP Employment Change','labor',1,NULL),
    ('jolts','JOLTS Job Openings','labor',1,NULL)
)
INSERT INTO eodhd_indicator_profiles(
  id,currency,canonical_key,target_label,factor,direction,
  expected_comparison,expected_frequency,mapping_rank,enabled,updated_at
)
SELECT
  'eodhd-profile:' || currencies.currency || ':' || fields.canonical_key,
  currencies.currency,
  fields.canonical_key,
  fields.target_label,
  fields.factor,
  fields.direction,
  fields.expected_comparison,
  CASE
    WHEN currencies.currency='NZD' AND fields.canonical_key IN ('gdp','cpi_yoy','retail_sales','nfp','unemployment_rate')
      THEN 'Quarterly'
    WHEN fields.canonical_key='interest_rates' THEN 'Meeting'
    WHEN fields.canonical_key='unemployment_claims' THEN 'Weekly'
    ELSE NULL
  END,
  100,
  1,
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM currencies CROSS JOIN fields;

-- Provider-native country variants. They keep genuinely different series
-- (for example ISM vs. S&P and NBS vs. Caixin/S&P) from being mixed.
UPDATE eodhd_indicator_profiles SET target_label='Trimmed Mean CPI',expected_comparison='qoq' WHERE currency='AUD' AND canonical_key='pce_yoy';
UPDATE eodhd_indicator_profiles SET target_label='Median CPI',expected_comparison='yoy' WHERE currency='CAD' AND canonical_key='pce_yoy';
UPDATE eodhd_indicator_profiles SET target_label='Core CPI',expected_comparison='yoy' WHERE currency IN ('EUR','GBP') AND canonical_key='pce_yoy';
UPDATE eodhd_indicator_profiles SET target_label='National Core CPI',expected_comparison='yoy' WHERE currency='JPY' AND canonical_key='pce_yoy';
UPDATE eodhd_indicator_profiles SET target_label='Core PCE Price Index',expected_comparison='mom' WHERE currency='USD' AND canonical_key='pce_yoy';
UPDATE eodhd_indicator_profiles SET target_label='1-Year Loan Prime Rate' WHERE currency='CNY' AND canonical_key='interest_rates';
UPDATE eodhd_indicator_profiles SET target_label='ISM Manufacturing PMI' WHERE currency='USD' AND canonical_key='manufacturing_pmi';
UPDATE eodhd_indicator_profiles SET target_label='ISM Services PMI' WHERE currency='USD' AND canonical_key='services_pmi';
UPDATE eodhd_indicator_profiles SET target_label='NBS Manufacturing PMI' WHERE currency='CNY' AND canonical_key='manufacturing_pmi';
UPDATE eodhd_indicator_profiles SET target_label='NBS Non Manufacturing PMI' WHERE currency='CNY' AND canonical_key='services_pmi';
UPDATE eodhd_indicator_profiles SET target_label='KOF Economic Barometer' WHERE currency='CHF' AND canonical_key='consumer_confidence';
UPDATE eodhd_indicator_profiles SET target_label='procure.ch Manufacturing PMI' WHERE currency='CHF' AND canonical_key='manufacturing_pmi';
UPDATE eodhd_indicator_profiles SET target_label='Tankan Manufacturing Index' WHERE currency='JPY' AND canonical_key='consumer_confidence';
UPDATE eodhd_indicator_profiles SET target_label='Claimant Count Change' WHERE currency='GBP' AND canonical_key='unemployment_claims';
UPDATE eodhd_indicator_profiles SET target_label='Initial Jobless Claims' WHERE currency='USD' AND canonical_key='unemployment_claims';
UPDATE eodhd_indicator_profiles SET expected_comparison='mom' WHERE currency IN ('CAD','GBP') AND canonical_key='gdp';

INSERT OR REPLACE INTO eodhd_indicator_profiles(
  id,currency,canonical_key,target_label,factor,direction,
  expected_comparison,expected_frequency,mapping_rank,enabled,updated_at
)
SELECT
  id,currency,canonical_key,source_label,factor,direction,
  CASE
    WHEN lower(source_label) LIKE '%m/m%' OR lower(source_label) LIKE '%mom%' THEN 'mom'
    WHEN lower(source_label) LIKE '%q/q%' OR lower(source_label) LIKE '%qoq%' THEN 'qoq'
    WHEN lower(source_label) LIKE '%y/y%' OR lower(source_label) LIKE '%yoy%' OR lower(source_label) LIKE '%q/y%' THEN 'yoy'
    WHEN canonical_key IN ('cpi_yoy','ppi_yoy','pce_yoy') THEN 'yoy'
    ELSE NULL
  END,
  CASE
    WHEN currency='NZD' AND canonical_key IN ('gdp','cpi_yoy','retail_sales','nfp','unemployment_rate')
      THEN 'Quarterly'
    WHEN canonical_key='interest_rates' THEN 'Meeting'
    WHEN canonical_key='unemployment_claims' THEN 'Weekly'
    ELSE NULL
  END,
  mapping_rank,1,updated_at
FROM macro_excel_indicator_mappings
WHERE mapping_status='mapped' AND canonical_key IS NOT NULL;

CREATE TABLE eodhd_events (
  id TEXT PRIMARY KEY,
  event_identity TEXT NOT NULL UNIQUE,
  country TEXT NOT NULL,
  currency TEXT NOT NULL,
  provider_type TEXT NOT NULL,
  comparison TEXT,
  period TEXT,
  released_at TEXT NOT NULL,
  actual_value TEXT,
  forecast_value TEXT,
  previous_value TEXT,
  frequency TEXT NOT NULL,
  canonical_key TEXT,
  mapping_status TEXT NOT NULL DEFAULT 'unavailable'
    CHECK (mapping_status IN ('automatic','approved','review','unavailable','ignored')),
  mapping_confidence INTEGER NOT NULL DEFAULT 0,
  source_url TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_eodhd_events_release
  ON eodhd_events(currency, canonical_key, released_at DESC);
CREATE INDEX idx_eodhd_events_mapping
  ON eodhd_events(mapping_status, currency, provider_type);

CREATE TABLE eodhd_mapping_candidates (
  id TEXT PRIMARY KEY,
  currency TEXT NOT NULL,
  provider_type TEXT NOT NULL,
  comparison TEXT,
  proposed_canonical_key TEXT,
  confidence INTEGER NOT NULL,
  runner_up_canonical_key TEXT,
  runner_up_confidence INTEGER,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','ignored')),
  created_at TEXT NOT NULL,
  reviewed_at TEXT,
  UNIQUE(currency, provider_type, comparison)
);

CREATE INDEX idx_eodhd_mapping_candidates_status
  ON eodhd_mapping_candidates(status, created_at DESC);

CREATE TABLE eodhd_release_jobs (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES eodhd_events(id) ON DELETE CASCADE,
  scheduled_for TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','complete','failed','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(event_id, scheduled_for)
);

CREATE INDEX idx_eodhd_release_jobs_due
  ON eodhd_release_jobs(status, scheduled_for);

CREATE TABLE eodhd_fundamental_snapshots (
  id TEXT PRIMARY KEY,
  built_at TEXT NOT NULL,
  input_fingerprint TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('complete','partial')),
  source_name TEXT NOT NULL DEFAULT 'EODHD Economic Events API'
);

CREATE TABLE eodhd_fundamental_evaluations (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL REFERENCES eodhd_fundamental_snapshots(id) ON DELETE CASCADE,
  event_id TEXT REFERENCES eodhd_events(id) ON DELETE SET NULL,
  currency TEXT NOT NULL,
  canonical_key TEXT NOT NULL,
  source_label TEXT,
  factor TEXT NOT NULL,
  direction INTEGER NOT NULL CHECK (direction IN (-1,1)),
  actual_text TEXT,
  forecast_text TEXT,
  previous_text TEXT,
  surprise_text TEXT,
  score INTEGER NOT NULL CHECK (score IN (-1,0,1)),
  evaluation_status TEXT NOT NULL CHECK (evaluation_status IN (
    'scored','neutral','missing_actual','missing_forecast','unmapped','review_required'
  )),
  reason_codes_json TEXT NOT NULL DEFAULT '[]',
  released_at TEXT,
  pending_newer_release_at TEXT,
  frequency TEXT,
  source_url TEXT,
  UNIQUE(snapshot_id, currency, canonical_key)
);

CREATE INDEX idx_eodhd_fundamental_evaluations_snapshot
  ON eodhd_fundamental_evaluations(snapshot_id, currency, canonical_key);

DROP TABLE IF EXISTS macro_feed_mapping_checks;
DROP TABLE IF EXISTS macro_feed_evidence;
DROP TABLE IF EXISTS macro_feed_observations;
DROP TABLE IF EXISTS macro_feed_jobs;
DROP TABLE IF EXISTS macro_feed_review_candidates;
DROP TABLE IF EXISTS macro_feed_workbook_versions;
DROP TABLE IF EXISTS macro_feed_release_events;
DROP TABLE IF EXISTS macro_feed_sync_runs;
DROP TABLE IF EXISTS macro_feed_source_domains;

DROP TABLE IF EXISTS macro_excel_fundamental_evaluations;
DROP TABLE IF EXISTS macro_excel_fundamental_snapshots;
DROP TABLE IF EXISTS macro_excel_forecast_candidates;
DROP TABLE IF EXISTS macro_excel_history;
DROP TABLE IF EXISTS macro_excel_indicator_mappings;
DROP TABLE IF EXISTS macro_excel_import_runs;

DROP TABLE IF EXISTS policy_rate_sync_runs;
