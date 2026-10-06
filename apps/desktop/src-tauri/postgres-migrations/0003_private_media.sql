-- Private object storage references are server-only. Existing imported media
-- metadata remains unchanged until its original bytes have been uploaded.
CREATE TABLE cloud_media_objects (
    media_id TEXT PRIMARY KEY REFERENCES media_files(id) ON DELETE RESTRICT,
    blob_pathname TEXT NOT NULL UNIQUE,
    sha256 TEXT NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
    size_bytes BIGINT NOT NULL CHECK(size_bytes BETWEEN 1 AND 3145728),
    mime_type TEXT NOT NULL CHECK(mime_type IN ('image/png','image/jpeg','image/webp')),
    created_at TEXT NOT NULL,
    CHECK(blob_pathname ~ '^media/v1/[a-f0-9-]{36}/[a-f0-9]{64}\.(png|jpg|webp)$')
);
