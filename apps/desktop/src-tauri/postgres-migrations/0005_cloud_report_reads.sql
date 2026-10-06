-- Personal read markers stay separate from immutable official report shards.
CREATE TABLE cloud_report_reads (
    report_id TEXT PRIMARY KEY CHECK (length(report_id) BETWEEN 1 AND 80),
    read_at TEXT NOT NULL
);
