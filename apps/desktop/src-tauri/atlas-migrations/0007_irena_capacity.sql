CREATE TABLE atlas_capacity_dataset (
    id TEXT PRIMARY KEY NOT NULL,
    provenance_json TEXT NOT NULL,
    retrieved_at TEXT NOT NULL
);
CREATE TABLE atlas_capacity_areas (
    dataset_id TEXT NOT NULL REFERENCES atlas_capacity_dataset(id) ON DELETE CASCADE,
    geography_id TEXT NOT NULL,
    profile_json TEXT NOT NULL,
    PRIMARY KEY(dataset_id, geography_id)
);
