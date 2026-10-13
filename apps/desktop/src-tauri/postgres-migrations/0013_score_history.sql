-- Public market observations are independent of journal revision and receipts.
CREATE TABLE cloud_score_batches (
    observation_key TEXT PRIMARY KEY CHECK(length(observation_key) BETWEEN 1 AND 400),
    observed_at BIGINT NOT NULL CHECK(observed_at > 0),
    snapshot_id TEXT NOT NULL CHECK(length(snapshot_id) <= 200),
    generation TEXT,
    model_version TEXT NOT NULL CHECK(model_version = 'macro-fundamentals-observed-v1'),
    origin TEXT NOT NULL CHECK(origin IN ('cloud_captured','desktop_captured','desktop_archived_snapshot')),
    evidence_json TEXT NOT NULL CHECK(octet_length(evidence_json) <= 2097152)
);
CREATE TABLE cloud_score_points (
    instrument_id TEXT NOT NULL CHECK(length(instrument_id) BETWEEN 1 AND 80),
    observation_key TEXT NOT NULL REFERENCES cloud_score_batches(observation_key),
    observed_at BIGINT NOT NULL CHECK(observed_at > 0),
    valid_until BIGINT NOT NULL CHECK(valid_until >= observed_at AND valid_until <= observed_at + 129600),
    score INTEGER CHECK(score BETWEEN -100 AND 100),
    available_components INTEGER NOT NULL CHECK(available_components >= 0),
    total_components INTEGER NOT NULL CHECK(total_components >= available_components AND total_components <= 100),
    PRIMARY KEY(instrument_id, observation_key)
);
CREATE INDEX cloud_score_points_time ON cloud_score_points(instrument_id, observed_at, observation_key);
CREATE TABLE cloud_score_state (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    last_day TEXT,
    last_snapshot_id TEXT,
    last_fingerprint TEXT,
    last_observed_at BIGINT,
    last_started_at_ms BIGINT
);
INSERT INTO cloud_score_state(id) VALUES(1);
-- Explicit public D1 imports retain their original source and collection date.
-- They contain no account, terminal path, credentials, trades or personal notes.
CREATE TABLE cloud_score_price_snapshots (
    id TEXT PRIMARY KEY CHECK(length(id) = 64),
    instrument_id TEXT NOT NULL CHECK(length(instrument_id) BETWEEN 1 AND 80),
    imported_at BIGINT NOT NULL,
    source_json TEXT NOT NULL CHECK(octet_length(source_json) <= 4096)
);
CREATE INDEX cloud_score_price_snapshots_time ON cloud_score_price_snapshots(instrument_id, imported_at DESC);
CREATE TABLE cloud_score_daily_prices (
    snapshot_id TEXT NOT NULL REFERENCES cloud_score_price_snapshots(id),
    time BIGINT NOT NULL CHECK(time > 0),
    open DOUBLE PRECISION NOT NULL CHECK(open > 0 AND open < 'Infinity'::float8),
    high DOUBLE PRECISION NOT NULL CHECK(high >= open AND high < 'Infinity'::float8),
    low DOUBLE PRECISION NOT NULL CHECK(low > 0 AND low <= open),
    close DOUBLE PRECISION NOT NULL CHECK(close BETWEEN low AND high),
    PRIMARY KEY(snapshot_id, time)
);
CREATE FUNCTION cloud_score_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Public score observations are immutable'; END;
$$;
CREATE TRIGGER cloud_score_batches_immutable BEFORE UPDATE OR DELETE ON cloud_score_batches FOR EACH ROW EXECUTE FUNCTION cloud_score_immutable();
CREATE TRIGGER cloud_score_points_immutable BEFORE UPDATE OR DELETE ON cloud_score_points FOR EACH ROW EXECUTE FUNCTION cloud_score_immutable();
CREATE TRIGGER cloud_score_price_snapshots_immutable BEFORE UPDATE OR DELETE ON cloud_score_price_snapshots FOR EACH ROW EXECUTE FUNCTION cloud_score_immutable();
CREATE TRIGGER cloud_score_daily_prices_immutable BEFORE UPDATE OR DELETE ON cloud_score_daily_prices FOR EACH ROW EXECUTE FUNCTION cloud_score_immutable();
