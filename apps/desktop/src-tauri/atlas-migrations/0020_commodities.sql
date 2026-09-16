CREATE TABLE atlas_commodity_dataset (
    id TEXT PRIMARY KEY,
    provenance_json TEXT NOT NULL,
    retrieved_at TEXT NOT NULL
);
CREATE TABLE atlas_commodity_points (
    dataset_id TEXT NOT NULL REFERENCES atlas_commodity_dataset(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    values_json TEXT NOT NULL,
    PRIMARY KEY (dataset_id, year)
);
