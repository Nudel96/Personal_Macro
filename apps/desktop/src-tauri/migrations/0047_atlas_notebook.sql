-- Personal Atlas observations belong to the journal backup, not its public cache.
CREATE TABLE atlas_notebook_entries (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 160),
    note TEXT NOT NULL DEFAULT '' CHECK(length(note) <= 12000),
    favorite INTEGER NOT NULL DEFAULT 0 CHECK(favorite IN (0, 1)),
    context_label TEXT NOT NULL,
    context_json TEXT NOT NULL CHECK(json_valid(context_json)),
    sources_json TEXT NOT NULL CHECK(json_valid(sources_json)),
    snapshot_png BLOB,
    snapshot_sha256 TEXT,
    captured_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
    trashed_at TEXT,
    CHECK((snapshot_png IS NULL) = (snapshot_sha256 IS NULL))
);
CREATE INDEX idx_atlas_notebook_list ON atlas_notebook_entries(trashed_at, favorite, updated_at);

CREATE TABLE atlas_personal_preferences (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    last_context_json TEXT NOT NULL CHECK(json_valid(last_context_json)),
    updated_at TEXT NOT NULL
);
