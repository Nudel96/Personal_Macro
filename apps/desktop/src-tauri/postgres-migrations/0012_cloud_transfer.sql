-- Private journal backups and learning state. Never export to public snapshots.
CREATE TABLE cloud_journal_backups (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    source_revision BIGINT NOT NULL CHECK(source_revision >= 0),
    payload_json TEXT NOT NULL CHECK(octet_length(payload_json) <= 16777216),
    sha256 TEXT NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
    size_bytes BIGINT NOT NULL CHECK(size_bytes BETWEEN 1 AND 16777216),
    safety_copy BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE cloud_learning_progress (
    id BIGINT PRIMARY KEY CHECK(id = 1),
    value_json TEXT NOT NULL CHECK(octet_length(value_json) <= 300000),
    updated_at TEXT NOT NULL
);
