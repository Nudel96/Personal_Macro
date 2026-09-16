CREATE TABLE bond_series (
    symbol TEXT PRIMARY KEY,
    active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
    fetched_at TEXT,
    last_attempt_at TEXT,
    last_error TEXT
);
CREATE TABLE bond_observations (
    symbol TEXT NOT NULL REFERENCES bond_series(symbol) ON DELETE CASCADE,
    observation_date TEXT NOT NULL,
    yield_pct TEXT,
    PRIMARY KEY(symbol, observation_date)
);
CREATE INDEX bond_observations_date ON bond_observations(observation_date, symbol);
CREATE TABLE bond_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE bond_sync_jobs (id TEXT PRIMARY KEY, started_at TEXT NOT NULL, payload TEXT NOT NULL);
