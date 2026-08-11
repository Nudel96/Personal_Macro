ALTER TABLE policy_rate_snapshots ADD COLUMN actual_rate TEXT;
ALTER TABLE policy_rate_snapshots ADD COLUMN decision_surprise_bps TEXT;
ALTER TABLE policy_rate_snapshots ADD COLUMN next_decision_at TEXT;
ALTER TABLE policy_rate_snapshots ADD COLUMN provider_snapshot_at TEXT;
ALTER TABLE policy_rate_snapshots ADD COLUMN quality_status TEXT NOT NULL DEFAULT 'fresh';
ALTER TABLE policy_rate_snapshots ADD COLUMN weight TEXT NOT NULL DEFAULT '1';
ALTER TABLE policy_rate_snapshots ADD COLUMN availability_status TEXT NOT NULL DEFAULT 'available';
ALTER TABLE seasonality_snapshots ADD COLUMN asset TEXT NOT NULL DEFAULT '';
ALTER TABLE seasonality_snapshots ADD COLUMN samples INTEGER;

INSERT OR IGNORE INTO schema_migrations (version, name) VALUES (2, 'rate_and_review_extensions');
