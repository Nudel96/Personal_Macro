CREATE TABLE atlas_education_dataset (
    id TEXT PRIMARY KEY,
    provenance_json TEXT NOT NULL,
    retrieved_at TEXT NOT NULL
);
CREATE TABLE atlas_education_areas (
    dataset_id TEXT NOT NULL REFERENCES atlas_education_dataset(id) ON DELETE CASCADE,
    geography_id TEXT NOT NULL,
    profile_json TEXT NOT NULL,
    PRIMARY KEY (dataset_id, geography_id)
);
