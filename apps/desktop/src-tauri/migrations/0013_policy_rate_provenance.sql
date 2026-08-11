-- A policy-rate observation is only trustworthy when its instrument and
-- primary-source provenance are stored with the value.  Forecast provenance is
-- deliberately separate: a central bank publishes the current rate, not the
-- market-implied rate for its next meeting.
ALTER TABLE policy_rate_snapshots ADD COLUMN rate_definition TEXT;
ALTER TABLE policy_rate_snapshots ADD COLUMN current_rate_low TEXT;
ALTER TABLE policy_rate_snapshots ADD COLUMN current_rate_high TEXT;
ALTER TABLE policy_rate_snapshots ADD COLUMN official_source_url TEXT;
ALTER TABLE policy_rate_snapshots ADD COLUMN official_published_at TEXT;
ALTER TABLE policy_rate_snapshots ADD COLUMN expected_source_url TEXT;
ALTER TABLE policy_rate_snapshots ADD COLUMN expected_observed_at TEXT;
ALTER TABLE policy_rate_snapshots ADD COLUMN expected_for_decision_at TEXT;

CREATE INDEX IF NOT EXISTS idx_policy_rate_snapshots_effective
  ON policy_rate_snapshots(currency, effective_at DESC);

-- Values created by the old demonstration button must never look like live
-- rates or contribute to the USD-relative calculation.
UPDATE policy_rate_snapshots
SET quality_status = 'unverified', availability_status = 'unavailable'
WHERE macro_snapshot_id IN (
  SELECT id FROM macro_snapshots
  WHERE source_name LIKE 'Synthetische Beispieldaten%'
);

INSERT OR IGNORE INTO schema_migrations (version, name)
VALUES (13, 'policy_rate_provenance');
