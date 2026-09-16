-- Provider market histories are rebuildable and never stored in the journal.
CREATE TABLE atlas_market_datasets (
    proxy_id TEXT PRIMARY KEY NOT NULL,
    provenance_json TEXT NOT NULL,
    retrieved_at TEXT NOT NULL
);
CREATE TABLE atlas_market_months (
    proxy_id TEXT NOT NULL REFERENCES atlas_market_datasets(proxy_id) ON DELETE CASCADE,
    month TEXT NOT NULL CHECK(length(month) = 7),
    adjusted_close REAL CHECK(adjusted_close IS NULL OR adjusted_close > 0),
    PRIMARY KEY(proxy_id, month)
);
