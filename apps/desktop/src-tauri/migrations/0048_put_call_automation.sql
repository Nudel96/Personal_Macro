-- Network status stays separate from manual imports and the last valid market data.
CREATE TABLE put_call_automation (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    status TEXT NOT NULL DEFAULT 'idle'
        CHECK (status IN ('idle', 'running', 'success', 'failed', 'blocked')),
    last_attempt_at TEXT,
    last_success_at TEXT,
    last_report_date TEXT,
    next_attempt_at TEXT,
    consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
    message TEXT
);

INSERT INTO put_call_automation (id) VALUES (1);
