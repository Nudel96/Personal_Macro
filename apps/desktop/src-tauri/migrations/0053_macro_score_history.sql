-- Append-only, locally observed fundamentals. Never backdate current events.
CREATE TABLE macro_score_history (
  observation_key TEXT NOT NULL,
  instrument_id TEXT NOT NULL,
  observed_at INTEGER NOT NULL,
  valid_until INTEGER NOT NULL,
  snapshot_id TEXT NOT NULL,
  model_version TEXT NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('captured','archived_snapshot')),
  score INTEGER,
  available_components INTEGER NOT NULL CHECK (available_components >= 0),
  total_components INTEGER NOT NULL CHECK (total_components >= available_components),
  evidence_json TEXT NOT NULL,
  PRIMARY KEY(instrument_id,observation_key)
);
CREATE INDEX idx_macro_score_history_time
  ON macro_score_history(instrument_id,observed_at,observation_key);
CREATE TRIGGER macro_score_history_immutable
  BEFORE UPDATE ON macro_score_history BEGIN
    SELECT RAISE(ABORT,'Macro score observations are immutable');
  END;
CREATE TABLE macro_score_history_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  archive_completed INTEGER NOT NULL DEFAULT 0 CHECK (archive_completed IN (0,1)),
  last_capture_day TEXT,
  last_snapshot_id TEXT,
  last_fingerprint TEXT,
  last_observed_at INTEGER
);
INSERT INTO macro_score_history_state(id) VALUES(1);
