-- Add the verified daily SOYB.US history to already-catalogued EODHD
-- installations. On a fresh database the runtime catalogue remains empty
-- until the complete provider catalogue is built, which also includes SOYB.
INSERT OR IGNORE INTO seasonality_provider_instruments (
  provider,
  provider_symbol,
  display_symbol,
  category,
  description,
  base_currency,
  quote_currency,
  earliest_daily_at,
  native_timezone,
  last_catalogued_at,
  data_kind,
  source_code,
  sync_priority
)
SELECT
  'eodhd',
  'SOYB.US',
  'SOYB',
  'Commodities',
  'Sojabohnen · Teucrium ETF-Proxy',
  NULL,
  'USD',
  NULL,
  'EODHD provider-native trading date',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  'eod',
  'SOYB.US',
  26
WHERE EXISTS (
  SELECT 1
  FROM seasonality_provider_instruments
  WHERE provider = 'eodhd'
);
