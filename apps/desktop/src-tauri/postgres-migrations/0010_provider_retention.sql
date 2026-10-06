-- Object identity is authenticated by the active manifest and both content
-- hashes, independently of the lifespan of the original manifest metadata.
ALTER TABLE cloud_public_transports DROP CONSTRAINT cloud_public_transports_object_generation_fkey;
ALTER TABLE cloud_cot_jobs DROP CONSTRAINT cloud_cot_jobs_published_generation_fkey;
ALTER TABLE cloud_cot_jobs ADD CONSTRAINT cloud_cot_jobs_published_generation_fkey
  FOREIGN KEY(published_generation) REFERENCES cloud_public_generations(generation) ON DELETE SET NULL;
-- Track ONLY objects created by these automated provider jobs. Existing market
-- exports and original personal media are never candidates for automatic deletion.
CREATE TABLE cloud_provider_objects (
  object_path TEXT PRIMARY KEY CHECK(object_path ~ '^public-cache/v1/[a-f0-9-]{36}/[a-f0-9]{64}\.sqlite\.gz$'),
  generation TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('macro','cot')),
  created_at BIGINT NOT NULL,
  retired_at BIGINT,
  deleted_at BIGINT
);
CREATE INDEX cloud_provider_objects_retention ON cloud_provider_objects(created_at) WHERE deleted_at IS NULL;
