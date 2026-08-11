-- A source catalogue is required before the first verified policy-rate
-- snapshot exists.  Keeping the allow-list in SQLite makes the OpenAI
-- bootstrap deterministic and independently auditable.
CREATE TABLE IF NOT EXISTS policy_rate_source_catalog (
  currency TEXT PRIMARY KEY,
  central_bank TEXT NOT NULL,
  rate_definition TEXT NOT NULL,
  official_source_url TEXT NOT NULL,
  expectation_source_url TEXT NOT NULL,
  weight TEXT NOT NULL DEFAULT '1',
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

INSERT INTO policy_rate_source_catalog (
  currency,
  central_bank,
  rate_definition,
  official_source_url,
  expectation_source_url,
  weight,
  enabled,
  updated_at
) VALUES
  ('USD', 'Federal Reserve', 'Federal Funds Target Range', 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm', 'https://www.forexfactory.com/calendar', '1', 1, CURRENT_TIMESTAMP),
  ('EUR', 'European Central Bank', 'Deposit Facility Rate', 'https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html', 'https://www.forexfactory.com/calendar', '1', 1, CURRENT_TIMESTAMP),
  ('GBP', 'Bank of England', 'Bank Rate', 'https://www.bankofengland.co.uk/boeapps/database/Bank-Rate.asp', 'https://www.forexfactory.com/calendar', '1', 1, CURRENT_TIMESTAMP),
  ('JPY', 'Bank of Japan', 'Uncollateralized Overnight Call Rate', 'https://www.boj.or.jp/en/mopo/mpmdeci/index.htm', 'https://www.forexfactory.com/calendar', '1', 1, CURRENT_TIMESTAMP),
  ('CHF', 'Swiss National Bank', 'SNB Policy Rate', 'https://www.snb.ch/en/the-snb/mandates-goals/statistics/statistics-pub/current_interest_exchange_rates', 'https://www.forexfactory.com/calendar', '1', 1, CURRENT_TIMESTAMP),
  ('AUD', 'Reserve Bank of Australia', 'Cash Rate Target', 'https://www.rba.gov.au/statistics/cash-rate/', 'https://www.forexfactory.com/calendar', '1', 1, CURRENT_TIMESTAMP),
  ('CAD', 'Bank of Canada', 'Target for the Overnight Rate', 'https://www.bankofcanada.ca/core-functions/monetary-policy/key-interest-rate/', 'https://www.forexfactory.com/calendar', '1', 1, CURRENT_TIMESTAMP),
  ('NZD', 'Reserve Bank of New Zealand', 'Official Cash Rate', 'https://www.rbnz.govt.nz/monetary-policy/about-monetary-policy/the-official-cash-rate', 'https://www.forexfactory.com/calendar', '1', 1, CURRENT_TIMESTAMP),
  ('CNY', 'People''s Bank of China', 'One-Year Loan Prime Rate', 'https://www.pbc.gov.cn/en/3688229/3688353/index.html', 'https://www.forexfactory.com/calendar', '1', 1, CURRENT_TIMESTAMP)
ON CONFLICT(currency) DO UPDATE SET
  central_bank = excluded.central_bank,
  rate_definition = excluded.rate_definition,
  official_source_url = excluded.official_source_url,
  expectation_source_url = excluded.expectation_source_url,
  weight = excluded.weight,
  enabled = excluded.enabled,
  updated_at = excluded.updated_at;

-- Failed Dukascopy symbols must not monopolise the minute scheduler.  This
-- state survives application restarts and lets the collector continue with
-- the next eligible instrument while the failing symbol cools down.
CREATE TABLE IF NOT EXISTS seasonality_provider_retry_state (
  provider TEXT NOT NULL,
  provider_symbol TEXT NOT NULL,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  next_retry_at TEXT NOT NULL,
  last_error_code TEXT NOT NULL,
  last_error_message TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(provider, provider_symbol),
  FOREIGN KEY(provider, provider_symbol)
    REFERENCES seasonality_provider_instruments(provider, provider_symbol)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_seasonality_provider_retry_due
  ON seasonality_provider_retry_state(provider, next_retry_at);
