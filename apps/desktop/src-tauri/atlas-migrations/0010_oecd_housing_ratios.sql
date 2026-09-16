CREATE TABLE atlas_housing_ratio_dataset (
    id TEXT PRIMARY KEY NOT NULL,
    provenance_json TEXT NOT NULL,
    retrieved_at TEXT NOT NULL
);
CREATE TABLE atlas_housing_ratio_areas (
    dataset_id TEXT NOT NULL REFERENCES atlas_housing_ratio_dataset(id) ON DELETE CASCADE,
    geography_id TEXT NOT NULL,
    profile_json TEXT NOT NULL,
    PRIMARY KEY (dataset_id, geography_id)
);
