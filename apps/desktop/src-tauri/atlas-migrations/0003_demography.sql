-- Published UN demographic estimates and scenarios, never journal data.
CREATE TABLE atlas_demography_dataset (
    id TEXT PRIMARY KEY NOT NULL CHECK(id = 'un-wpp-2024-age5'),
    provenance_json TEXT NOT NULL,
    retrieved_at TEXT NOT NULL
);
CREATE TABLE atlas_demography_areas (
    dataset_id TEXT NOT NULL REFERENCES atlas_demography_dataset(id) ON DELETE CASCADE,
    geography_id TEXT NOT NULL,
    profile_json TEXT NOT NULL,
    PRIMARY KEY(dataset_id, geography_id)
);
