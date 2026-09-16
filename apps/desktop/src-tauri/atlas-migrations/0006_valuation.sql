-- Public aggregate valuation snapshots; never journal or individual-company data.
CREATE TABLE atlas_valuation_datasets (
    id TEXT PRIMARY KEY NOT NULL,
    data_json TEXT NOT NULL,
    retrieved_at TEXT NOT NULL
);
