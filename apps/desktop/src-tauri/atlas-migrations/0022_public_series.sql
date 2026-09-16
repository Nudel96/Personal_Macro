-- Validated additional public Atlas sources. No personal or journal data.
CREATE TABLE atlas_public_datasets (
    id TEXT PRIMARY KEY NOT NULL,
    provenance_json TEXT NOT NULL,
    retrieved_at TEXT NOT NULL
);

CREATE TABLE atlas_public_series (
    dataset_id TEXT NOT NULL REFERENCES atlas_public_datasets(id) ON DELETE CASCADE,
    metric_id TEXT NOT NULL,
    geography_id TEXT NOT NULL,
    profile_json TEXT NOT NULL,
    PRIMARY KEY (dataset_id, metric_id, geography_id)
);
CREATE INDEX atlas_public_series_area ON atlas_public_series(dataset_id, geography_id);
