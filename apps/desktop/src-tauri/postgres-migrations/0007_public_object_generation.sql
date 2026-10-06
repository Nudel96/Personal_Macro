-- An unchanged public package can remain in its original immutable Blob path.
-- NULL preserves all earlier publications and publishers: use generation.
-- The application additionally checks identity and both hashes against the
-- transaction-locked active manifest before permitting an existing reference.
ALTER TABLE cloud_public_transports
  ADD COLUMN object_generation TEXT
    REFERENCES cloud_public_generations(generation) ON DELETE RESTRICT
    CHECK (object_generation IS NULL OR
      object_generation ~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$');

CREATE INDEX cloud_public_transports_object_generation
  ON cloud_public_transports(object_generation)
  WHERE object_generation IS NOT NULL;
