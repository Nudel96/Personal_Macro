CREATE TABLE atlas_households_dataset (
    id TEXT PRIMARY KEY,
    provenance_json TEXT NOT NULL,
    retrieved_at TEXT NOT NULL
);
CREATE TABLE atlas_households_areas (
    dataset_id TEXT NOT NULL REFERENCES atlas_households_dataset(id),
    geography_id TEXT NOT NULL,
    profile_json TEXT NOT NULL,
    PRIMARY KEY (dataset_id, geography_id)
);
