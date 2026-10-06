-- Public-provider job state is separate from personal journal revisions.
CREATE TABLE cloud_cot_calendar (
  id SMALLINT PRIMARY KEY CHECK(id=1),
  calendar_json TEXT NOT NULL CHECK(octet_length(calendar_json) BETWEEN 1 AND 131072),
  fetched_at BIGINT NOT NULL
);
CREATE TABLE cloud_cot_jobs (
  release_date TEXT PRIMARY KEY CHECK(release_date ~ '^\d{4}-\d{2}-\d{2}$'),
  report_date TEXT NOT NULL CHECK(report_date ~ '^\d{4}-\d{2}-\d{2}$'),
  due_at BIGINT NOT NULL,
  retry_at BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','staged','complete','expired')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 8),
  lease_id TEXT,
  lease_until BIGINT NOT NULL DEFAULT 0,
  stage_json TEXT CHECK(octet_length(stage_json) <= 131072),
  published_generation TEXT REFERENCES cloud_public_generations(generation),
  completed_at BIGINT,
  error_code TEXT CHECK(error_code IN ('PROVIDER_OR_STORAGE_UNAVAILABLE','RELEASE_EXPIRED'))
);
CREATE INDEX cloud_cot_jobs_pending ON cloud_cot_jobs(status,retry_at);
