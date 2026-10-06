-- Immutable public-data generations. These tables are separate from journal
-- revision and operation receipts. Only the explicit publisher changes them.
CREATE TABLE cloud_public_generations (
  generation TEXT PRIMARY KEY CHECK (generation ~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'),
  manifest_json TEXT NOT NULL CHECK (octet_length(manifest_json) BETWEEN 1 AND 1048576),
  published_at TEXT NOT NULL
);

CREATE TABLE cloud_public_transports (
  generation TEXT NOT NULL REFERENCES cloud_public_generations(generation) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN ('rates','seasonality-index','seasonality-symbol')),
  artifact_key TEXT NOT NULL CHECK (octet_length(artifact_key) BETWEEN 1 AND 102),
  encoding TEXT NOT NULL CHECK (encoding = 'gzip'),
  transfer_bytes BIGINT NOT NULL CHECK (transfer_bytes BETWEEN 1 AND 33554432),
  transfer_sha256 TEXT NOT NULL CHECK (transfer_sha256 ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY (generation,kind,artifact_key)
);

CREATE TABLE cloud_public_active (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  generation TEXT REFERENCES cloud_public_generations(generation) ON DELETE RESTRICT
);
INSERT INTO cloud_public_active(id,generation) VALUES(1,NULL);
