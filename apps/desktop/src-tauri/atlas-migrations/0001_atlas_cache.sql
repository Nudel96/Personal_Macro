-- Public, rebuildable data only. This database is separate from journal.sqlite.
CREATE TABLE atlas_datasets (
    series_id TEXT PRIMARY KEY NOT NULL,
    provenance_json TEXT NOT NULL,
    retrieved_at TEXT NOT NULL
);

CREATE TABLE atlas_observations (
    series_id TEXT NOT NULL REFERENCES atlas_datasets(series_id) ON DELETE CASCADE,
    geography_id TEXT NOT NULL,
    year INTEGER NOT NULL CHECK(year BETWEEN 1 AND 2500),
    value REAL,
    source_flag TEXT NOT NULL DEFAULT '',
    PRIMARY KEY(series_id, geography_id, year)
);

CREATE TABLE atlas_ingest_runs (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL,
    started_at TEXT NOT NULL,
    job_json TEXT NOT NULL
);
CREATE INDEX atlas_ingest_runs_latest ON atlas_ingest_runs(started_at DESC);
