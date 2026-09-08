-- EODHD becomes the canonical provider for persisted seasonality price history.
-- The historical Dukascopy rows stay intact for rollback/audit purposes, but
-- runtime queries only consume provider='eodhd' after this migration.
ALTER TABLE seasonality_provider_instruments
  ADD COLUMN data_kind TEXT NOT NULL DEFAULT 'eod';

ALTER TABLE seasonality_provider_instruments
  ADD COLUMN source_code TEXT;

ALTER TABLE seasonality_provider_instruments
  ADD COLUMN sync_priority INTEGER NOT NULL DEFAULT 100;

UPDATE seasonality_provider_instruments
SET source_code = provider_symbol
WHERE source_code IS NULL;

CREATE INDEX IF NOT EXISTS idx_seasonality_provider_instruments_schedule
  ON seasonality_provider_instruments(provider, sync_priority, category, provider_symbol);

-- A terminated app must not leave the new provider permanently looking busy.
UPDATE seasonality_provider_sync_runs
SET status = 'failed',
    completed_at = COALESCE(completed_at, started_at),
    error_message = COALESCE(error_message, 'Synchronisierung durch App-Neustart beendet.')
WHERE status = 'running';
