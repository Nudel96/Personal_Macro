-- A separate private cost ledger; no journal revision or personal data changes.
CREATE TABLE report_ai_months (month TEXT PRIMARY KEY);
CREATE TABLE report_ai_usage (
  id TEXT PRIMARY KEY,
  month TEXT NOT NULL REFERENCES report_ai_months(month),
  request_key TEXT NOT NULL,
  model TEXT NOT NULL,
  price_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('reserved','complete','failed','uncertain')),
  reserved_usd_micros BIGINT NOT NULL CHECK(reserved_usd_micros>0),
  spent_usd_micros BIGINT CHECK(spent_usd_micros>=0),
  input_tokens BIGINT, cached_tokens BIGINT, output_tokens BIGINT, reasoning_tokens BIGINT,
  response_id TEXT,
  summary_json TEXT CHECK(octet_length(summary_json)<=128000),
  created_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE UNIQUE INDEX report_ai_inflight ON report_ai_usage(request_key)
  WHERE status IN ('reserved','uncertain');
CREATE INDEX report_ai_month ON report_ai_usage(month);
CREATE INDEX report_ai_cached_summary ON report_ai_usage(request_key,status);

ALTER TABLE cloud_provider_jobs DROP CONSTRAINT cloud_provider_jobs_kind_check;
ALTER TABLE cloud_provider_jobs ADD CONSTRAINT cloud_provider_jobs_kind_check
  CHECK(kind IN ('macro-plan','macro-release','myfxbook','report-discover','report-summary'));
ALTER TABLE cloud_provider_objects DROP CONSTRAINT cloud_provider_objects_kind_check;
ALTER TABLE cloud_provider_objects ADD CONSTRAINT cloud_provider_objects_kind_check
  CHECK(kind IN ('macro','cot','central-bank-reports'));
CREATE TABLE cloud_report_sources (
  source_id TEXT PRIMARY KEY,
  state_json TEXT NOT NULL CHECK(octet_length(state_json)<=8192)
);
