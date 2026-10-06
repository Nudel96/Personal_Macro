-- Broker-native chart candles, separate from EODHD/Seasonality and the journal.
CREATE TABLE mt5_technical_refresh (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  status TEXT NOT NULL CHECK (status IN ('pending','running','complete','failed')),
  last_attempt_at INTEGER,
  last_success_at INTEGER,
  next_refresh_at INTEGER NOT NULL DEFAULT 0,
  lease_token TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0,
  source_label TEXT,
  terminal_path TEXT,
  error_code TEXT,
  error_message TEXT
);
INSERT INTO mt5_technical_refresh(id,status) VALUES(1,'pending');

CREATE TABLE mt5_technical_pairs (
  base TEXT NOT NULL,
  quote TEXT NOT NULL,
  source_symbol TEXT,
  inverted INTEGER NOT NULL CHECK (inverted IN (0,1)),
  four_hour_reason TEXT,
  daily_reason TEXT,
  PRIMARY KEY(base,quote)
);

CREATE TABLE mt5_technical_candles (
  base TEXT NOT NULL,
  quote TEXT NOT NULL,
  timeframe TEXT NOT NULL CHECK (timeframe IN ('H4','D1')),
  candle_time INTEGER NOT NULL,
  open REAL NOT NULL CHECK (open > 0),
  high REAL NOT NULL CHECK (high >= open AND high >= close AND high >= low),
  low REAL NOT NULL CHECK (low > 0 AND low <= open AND low <= close),
  close REAL NOT NULL CHECK (close > 0),
  PRIMARY KEY(base,quote,timeframe,candle_time),
  FOREIGN KEY(base,quote) REFERENCES mt5_technical_pairs(base,quote) ON DELETE CASCADE
);
