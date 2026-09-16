CREATE TABLE atlas_credit_dataset (
    id TEXT PRIMARY KEY,
    provenance_json TEXT NOT NULL,
    retrieved_at TEXT NOT NULL
);
CREATE TABLE atlas_credit_areas (
    dataset_id TEXT NOT NULL REFERENCES atlas_credit_dataset(id) ON DELETE CASCADE,
    geography_id TEXT NOT NULL,
    profile_json TEXT NOT NULL,
    PRIMARY KEY (dataset_id, geography_id)
);
