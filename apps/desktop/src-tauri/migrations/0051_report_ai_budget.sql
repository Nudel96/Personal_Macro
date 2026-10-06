-- Private accounting, deliberately excluded from public market exports.
CREATE TABLE report_ai_months (
  month TEXT PRIMARY KEY
);
CREATE TABLE report_ai_usage (
  id TEXT PRIMARY KEY,
  month TEXT NOT NULL REFERENCES report_ai_months(month),
  request_key TEXT NOT NULL,
  model TEXT NOT NULL,
  price_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('reserved','complete','failed','uncertain')),
  reserved_usd_micros INTEGER NOT NULL CHECK(reserved_usd_micros>0),
  spent_usd_micros INTEGER CHECK(spent_usd_micros>=0),
  input_tokens INTEGER,
  cached_tokens INTEGER,
  output_tokens INTEGER,
  reasoning_tokens INTEGER,
  response_id TEXT,
  summary_json TEXT CHECK(length(summary_json)<=128000),
  created_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE UNIQUE INDEX report_ai_inflight ON report_ai_usage(request_key)
  WHERE status IN ('reserved','uncertain');
CREATE INDEX report_ai_month ON report_ai_usage(month);
CREATE INDEX report_ai_cached_summary ON report_ai_usage(request_key,status);
