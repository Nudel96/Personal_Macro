ALTER TABLE economic_provider_events ADD COLUMN indicator_key TEXT;

ALTER TABLE provider_sync_runs ADD COLUMN acquisition_method TEXT;
ALTER TABLE provider_sync_runs ADD COLUMN mapped_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE provider_sync_runs ADD COLUMN unmapped_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE provider_sync_runs ADD COLUMN pages_loaded INTEGER NOT NULL DEFAULT 0;
ALTER TABLE provider_sync_runs ADD COLUMN fallback_used INTEGER NOT NULL DEFAULT 0;
ALTER TABLE provider_sync_runs ADD COLUMN payload_sha256 TEXT;
ALTER TABLE provider_sync_runs ADD COLUMN heatmap_updated INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_provider_events_indicator
  ON economic_provider_events(provider, currency, indicator_key, scheduled_at DESC);

CREATE INDEX IF NOT EXISTS idx_provider_sync_runs_latest
  ON provider_sync_runs(provider, completed_at DESC);
