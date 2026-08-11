CREATE TABLE put_call_observations (
    asset_symbol TEXT NOT NULL,
    source_symbol TEXT NOT NULL,
    trade_date TEXT NOT NULL,
    call_notional_usd INTEGER NOT NULL CHECK (call_notional_usd >= 0),
    put_notional_usd INTEGER NOT NULL CHECK (put_notional_usd >= 0),
    source_orientation TEXT NOT NULL CHECK (source_orientation IN ('direct', 'inverse')),
    source_url TEXT NOT NULL,
    collected_at TEXT NOT NULL,
    PRIMARY KEY (asset_symbol, trade_date)
);

CREATE INDEX idx_put_call_observations_asset_date
    ON put_call_observations(asset_symbol, trade_date DESC);

CREATE TABLE put_call_sync_runs (
    id TEXT PRIMARY KEY,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
    fetched_assets INTEGER NOT NULL DEFAULT 0,
    stored_assets INTEGER NOT NULL DEFAULT 0,
    message TEXT
);

CREATE INDEX idx_put_call_sync_runs_started_at
    ON put_call_sync_runs(started_at DESC);
