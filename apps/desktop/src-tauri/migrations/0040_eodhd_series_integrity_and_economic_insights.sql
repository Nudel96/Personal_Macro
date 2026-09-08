-- Pin every canonical economic slot to an explicit set of provider-native
-- series. This prevents similarly named releases (especially central-bank
-- speeches) from entering snapshots merely because a fuzzy mapping was once
-- approved.

ALTER TABLE eodhd_indicator_profiles ADD COLUMN unit TEXT;
ALTER TABLE eodhd_indicator_profiles
  ADD COLUMN freshness_days INTEGER NOT NULL DEFAULT 62 CHECK (freshness_days > 0);

ALTER TABLE eodhd_fundamental_evaluations ADD COLUMN unit TEXT;

WITH
currencies(currency) AS (
  VALUES ('AUD'),('CAD'),('CHF'),('CNY'),('EUR'),('GBP'),('JPY'),('NZD'),('USD')
),
fields(canonical_key,target_label,factor,direction,expected_comparison,expected_frequency,unit,freshness_days,mapping_rank) AS (
  VALUES
    ('industrial_production','Industrial Production','growth',1,'yoy','Monthly','percent',62,150),
    ('wage_growth','Wage Growth','labor',1,'yoy','Monthly','percent',62,160),
    ('trade_balance','Balance of Trade','growth',1,NULL,'Monthly','billions',62,170)
)
INSERT INTO eodhd_indicator_profiles(
  id,currency,canonical_key,target_label,factor,direction,
  expected_comparison,expected_frequency,mapping_rank,enabled,updated_at,
  unit,freshness_days
)
SELECT
  'eodhd-profile:' || currencies.currency || ':' || fields.canonical_key,
  currencies.currency,
  fields.canonical_key,
  fields.target_label,
  fields.factor,
  fields.direction,
  fields.expected_comparison,
  fields.expected_frequency,
  fields.mapping_rank,
  1,
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  fields.unit,
  fields.freshness_days
FROM currencies CROSS JOIN fields;

CREATE TABLE eodhd_indicator_series (
  id TEXT PRIMARY KEY,
  currency TEXT NOT NULL,
  canonical_key TEXT NOT NULL,
  provider_type TEXT NOT NULL,
  comparison TEXT,
  priority INTEGER NOT NULL DEFAULT 100,
  unit TEXT NOT NULL,
  frequency TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  created_at TEXT NOT NULL,
  FOREIGN KEY(currency, canonical_key)
    REFERENCES eodhd_indicator_profiles(currency, canonical_key) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_eodhd_indicator_series_identity
  ON eodhd_indicator_series(currency, provider_type, COALESCE(comparison,''));
CREATE INDEX idx_eodhd_indicator_series_profile
  ON eodhd_indicator_series(currency, canonical_key, enabled, priority);

-- Growth and activity. Country-native frequencies are intentional and remain
-- visible in the UI; scoring always compares Actual with the same release's
-- Forecast before currencies are compared.
INSERT INTO eodhd_indicator_series VALUES
  ('series:AUD:gdp:1','AUD','gdp','GDP Growth Rate','qoq',10,'percent','Quarterly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:CAD:gdp:1','CAD','gdp','Gross Domestic Product','mom',10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:CHF:gdp:1','CHF','gdp','GDP Growth Rate','qoq',10,'percent','Quarterly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:CNY:gdp:1','CNY','gdp','GDP Growth Rate','yoy',10,'percent','Quarterly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:EUR:gdp:1','EUR','gdp','GDP Growth Rate','qoq',10,'percent','Quarterly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:GBP:gdp:1','GBP','gdp','Gross Domestic Product','mom',10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:JPY:gdp:1','JPY','gdp','GDP Growth Rate','qoq',10,'percent','Quarterly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:NZD:gdp:1','NZD','gdp','GDP Growth Rate','qoq',10,'percent','Quarterly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:USD:gdp:1','USD','gdp','GDP Growth Rate','qoq',10,'percent','Quarterly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  ('series:AUD:manufacturing_pmi:1','AUD','manufacturing_pmi','S&P Global Manufacturing PMI',NULL,10,'index','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:AUD:manufacturing_pmi:2','AUD','manufacturing_pmi','Judo Bank Manufacturing PMI',NULL,20,'index','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:CAD:manufacturing_pmi:1','CAD','manufacturing_pmi','S&P Global Manufacturing PMI',NULL,10,'index','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:CHF:manufacturing_pmi:1','CHF','manufacturing_pmi','procure.ch Manufacturing PMI',NULL,10,'index','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:CNY:manufacturing_pmi:1','CNY','manufacturing_pmi','NBS Manufacturing PMI',NULL,10,'index','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:EUR:manufacturing_pmi:1','EUR','manufacturing_pmi','S&P Global Manufacturing PMI',NULL,10,'index','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:EUR:manufacturing_pmi:2','EUR','manufacturing_pmi','HCOB Manufacturing PMI',NULL,20,'index','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:GBP:manufacturing_pmi:1','GBP','manufacturing_pmi','S&P Global Manufacturing PMI',NULL,10,'index','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:JPY:manufacturing_pmi:1','JPY','manufacturing_pmi','S&P Global Manufacturing PMI',NULL,10,'index','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:JPY:manufacturing_pmi:2','JPY','manufacturing_pmi','Jibun Bank Manufacturing PMI',NULL,20,'index','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:NZD:manufacturing_pmi:1','NZD','manufacturing_pmi','Business NZ PMI',NULL,10,'index','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:USD:manufacturing_pmi:1','USD','manufacturing_pmi','ISM Manufacturing PMI',NULL,10,'index','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  ('series:AUD:services_pmi:1','AUD','services_pmi','S&P Global Services PMI',NULL,10,'index','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:AUD:services_pmi:2','AUD','services_pmi','Judo Bank Services PMI',NULL,20,'index','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:CAD:services_pmi:1','CAD','services_pmi','S&P Global Services PMI',NULL,10,'index','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:CNY:services_pmi:1','CNY','services_pmi','NBS Non Manufacturing PMI',NULL,10,'index','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:EUR:services_pmi:1','EUR','services_pmi','S&P Global Services PMI',NULL,10,'index','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:EUR:services_pmi:2','EUR','services_pmi','HCOB Services PMI',NULL,20,'index','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:GBP:services_pmi:1','GBP','services_pmi','S&P Global Services PMI',NULL,10,'index','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:JPY:services_pmi:1','JPY','services_pmi','S&P Global Services PMI',NULL,10,'index','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:JPY:services_pmi:2','JPY','services_pmi','Jibun Bank Services PMI',NULL,20,'index','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:NZD:services_pmi:1','NZD','services_pmi','Services NZ PSI',NULL,10,'index','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:USD:services_pmi:1','USD','services_pmi','ISM Non-Manufacturing PMI',NULL,10,'index','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:USD:services_pmi:2','USD','services_pmi','ISM Services PMI',NULL,20,'index','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  ('series:AUD:retail_sales:1','AUD','retail_sales','Household Spending','mom',10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:CAD:retail_sales:1','CAD','retail_sales','Retail Sales','mom',10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:CHF:retail_sales:1','CHF','retail_sales','Retail Sales','yoy',10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:CNY:retail_sales:1','CNY','retail_sales','Retail Sales','yoy',10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:EUR:retail_sales:1','EUR','retail_sales','Retail Sales','mom',10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:GBP:retail_sales:1','GBP','retail_sales','Retail Sales','mom',10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:JPY:retail_sales:1','JPY','retail_sales','Retail Sales','yoy',10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:NZD:retail_sales:1','NZD','retail_sales','Retail Sales','qoq',10,'percent','Quarterly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:USD:retail_sales:1','USD','retail_sales','Retail Sales','mom',10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  ('series:AUD:consumer_confidence:1','AUD','consumer_confidence','Westpac Consumer Confidence Index',NULL,10,'index','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:CHF:consumer_confidence:1','CHF','consumer_confidence','Consumer Confidence',NULL,10,'index','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:EUR:consumer_confidence:1','EUR','consumer_confidence','Consumer Confidence',NULL,10,'index','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:GBP:consumer_confidence:1','GBP','consumer_confidence','Consumer Confidence',NULL,10,'index','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:JPY:consumer_confidence:1','JPY','consumer_confidence','Consumer Confidence',NULL,10,'index','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:NZD:consumer_confidence:1','NZD','consumer_confidence','ANZ Roy Morgan Consumer Confidence',NULL,10,'index','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:USD:consumer_confidence:1','USD','consumer_confidence','CB Consumer Confidence',NULL,10,'index','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now'));

-- Inflation and prices. Year-over-year variants are preferred wherever EODHD
-- offers them; NZD PPI is only available as a quarterly change.
INSERT INTO eodhd_indicator_series VALUES
  ('series:AUD:cpi_yoy:1','AUD','cpi_yoy','Inflation Rate','yoy',10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:CAD:cpi_yoy:1','CAD','cpi_yoy','Inflation Rate','yoy',10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:CHF:cpi_yoy:1','CHF','cpi_yoy','Inflation Rate','yoy',10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:CNY:cpi_yoy:1','CNY','cpi_yoy','Inflation Rate','yoy',10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:EUR:cpi_yoy:1','EUR','cpi_yoy','Inflation Rate','yoy',10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:GBP:cpi_yoy:1','GBP','cpi_yoy','Inflation Rate','yoy',10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:JPY:cpi_yoy:1','JPY','cpi_yoy','Inflation Rate','yoy',10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:NZD:cpi_yoy:1','NZD','cpi_yoy','Inflation Rate','yoy',10,'percent','Quarterly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:USD:cpi_yoy:1','USD','cpi_yoy','Inflation Rate','yoy',10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  ('series:AUD:ppi_yoy:1','AUD','ppi_yoy','Producer Price Index','yoy',10,'percent','Quarterly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:CAD:ppi_yoy:1','CAD','ppi_yoy','Producer Price Index','yoy',10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:CHF:ppi_yoy:1','CHF','ppi_yoy','Producer & Import Prices','yoy',10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:CNY:ppi_yoy:1','CNY','ppi_yoy','Producer Price Index','yoy',10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:EUR:ppi_yoy:1','EUR','ppi_yoy','Producer Price Index','yoy',10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:GBP:ppi_yoy:1','GBP','ppi_yoy','PPI Output','yoy',10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:JPY:ppi_yoy:1','JPY','ppi_yoy','Producer Price Index','yoy',10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:NZD:ppi_yoy:1','NZD','ppi_yoy','PPI Output','qoq',10,'percent','Quarterly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:USD:ppi_yoy:1','USD','ppi_yoy','Producer Price Index','yoy',10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  ('series:AUD:pce_yoy:1','AUD','pce_yoy','RBA Trimmed Mean CPI','yoy',10,'percent','Quarterly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:CAD:pce_yoy:1','CAD','pce_yoy','Median CPI','yoy',10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:EUR:pce_yoy:1','EUR','pce_yoy','Core Inflation Rate','yoy',10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:GBP:pce_yoy:1','GBP','pce_yoy','Core Inflation Rate','yoy',10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:JPY:pce_yoy:1','JPY','pce_yoy','Core Inflation Rate','yoy',10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:USD:pce_yoy:1','USD','pce_yoy','Core PCE Price Index','yoy',10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now'));

-- Only actual rate decisions are admitted. Speeches, minutes, bulletins,
-- surveys and press conferences intentionally have no row here.
INSERT INTO eodhd_indicator_series VALUES
  ('series:AUD:interest_rates:1','AUD','interest_rates','Interest Rate Decision',NULL,10,'percent','Meeting',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:AUD:interest_rates:2','AUD','interest_rates','RBA Interest Rate Decision',NULL,20,'percent','Meeting',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:CAD:interest_rates:1','CAD','interest_rates','BoC Interest Rate Decision',NULL,10,'percent','Meeting',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:CHF:interest_rates:1','CHF','interest_rates','SNB Interest Rate Decision',NULL,10,'percent','Meeting',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:CHF:interest_rates:2','CHF','interest_rates','Interest Rate Decision',NULL,20,'percent','Meeting',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:CNY:interest_rates:1','CNY','interest_rates','Loan Prime Rate 1Y',NULL,10,'percent','Meeting',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:EUR:interest_rates:1','EUR','interest_rates','Interest Rate Decision',NULL,10,'percent','Meeting',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:EUR:interest_rates:2','EUR','interest_rates','ECB Interest Rate Decision',NULL,20,'percent','Meeting',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:GBP:interest_rates:1','GBP','interest_rates','BoE Interest Rate Decision',NULL,10,'percent','Meeting',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:GBP:interest_rates:2','GBP','interest_rates','Interest Rate Decision',NULL,20,'percent','Meeting',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:JPY:interest_rates:1','JPY','interest_rates','BoJ Interest Rate Decision',NULL,10,'percent','Meeting',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:NZD:interest_rates:1','NZD','interest_rates','RBNZ Interest Rate Decision',NULL,10,'percent','Meeting',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:NZD:interest_rates:2','NZD','interest_rates','Interest Rate Decision',NULL,20,'percent','Meeting',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:USD:interest_rates:1','USD','interest_rates','Fed Interest Rate Decision',NULL,10,'percent','Meeting',1,strftime('%Y-%m-%dT%H:%M:%fZ','now'));

-- Labour market.
INSERT INTO eodhd_indicator_series VALUES
  ('series:AUD:nfp:1','AUD','nfp','Employment Change',NULL,10,'thousands','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:CAD:nfp:1','CAD','nfp','Employment Change',NULL,10,'thousands','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:CHF:nfp:1','CHF','nfp','Non Farm Payrolls',NULL,10,'millions','Quarterly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:EUR:nfp:1','EUR','nfp','Employment Change','qoq',10,'percent','Quarterly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:GBP:nfp:1','GBP','nfp','Employment Change',NULL,10,'thousands','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:NZD:nfp:1','NZD','nfp','Employment Change','qoq',10,'percent','Quarterly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:USD:nfp:1','USD','nfp','Non Farm Payrolls',NULL,10,'thousands','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  ('series:AUD:unemployment_rate:1','AUD','unemployment_rate','Unemployment Rate',NULL,10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:CAD:unemployment_rate:1','CAD','unemployment_rate','Unemployment Rate',NULL,10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:CHF:unemployment_rate:1','CHF','unemployment_rate','Unemployment Rate',NULL,10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:CNY:unemployment_rate:1','CNY','unemployment_rate','Unemployment Rate',NULL,10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:EUR:unemployment_rate:1','EUR','unemployment_rate','Unemployment Rate',NULL,10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:GBP:unemployment_rate:1','GBP','unemployment_rate','Unemployment Rate',NULL,10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:JPY:unemployment_rate:1','JPY','unemployment_rate','Unemployment Rate',NULL,10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:NZD:unemployment_rate:1','NZD','unemployment_rate','Unemployment Rate',NULL,10,'percent','Quarterly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:USD:unemployment_rate:1','USD','unemployment_rate','Unemployment Rate',NULL,10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  ('series:GBP:unemployment_claims:1','GBP','unemployment_claims','Claimant Count Change',NULL,10,'thousands','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:USD:unemployment_claims:1','USD','unemployment_claims','Initial Jobless Claims',NULL,10,'thousands','Weekly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:USD:adp:1','USD','adp','ADP Employment Change',NULL,10,'thousands','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:JPY:jolts:1','JPY','jolts','Jobs/applications ratio',NULL,10,'ratio','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:USD:jolts:1','USD','jolts','JOLTs Job Openings',NULL,10,'millions','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now'));

-- Additional comparable cross-currency datapoints.
INSERT INTO eodhd_indicator_series VALUES
  ('series:CHF:industrial_production:1','CHF','industrial_production','Industrial Production','yoy',10,'percent','Quarterly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:CNY:industrial_production:1','CNY','industrial_production','Industrial Production','yoy',10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:EUR:industrial_production:1','EUR','industrial_production','Industrial Production','yoy',10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:GBP:industrial_production:1','GBP','industrial_production','Industrial Production','yoy',10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:JPY:industrial_production:1','JPY','industrial_production','Industrial Production','yoy',10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:USD:industrial_production:1','USD','industrial_production','Industrial Production','yoy',10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  ('series:AUD:wage_growth:1','AUD','wage_growth','Wage Price Index','yoy',10,'percent','Quarterly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:CAD:wage_growth:1','CAD','wage_growth','Average Hourly Wages','yoy',10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:EUR:wage_growth:1','EUR','wage_growth','Wage Growth','yoy',10,'percent','Quarterly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:GBP:wage_growth:1','GBP','wage_growth','Average Earnings excl. Bonus',NULL,10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:JPY:wage_growth:1','JPY','wage_growth','Average Cash Earnings','yoy',10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:NZD:wage_growth:1','NZD','wage_growth','Labour Cost Index','yoy',10,'percent','Quarterly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:USD:wage_growth:1','USD','wage_growth','Average Hourly Earnings','yoy',10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  ('series:AUD:trade_balance:1','AUD','trade_balance','Balance of Trade',NULL,10,'billions','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:CAD:trade_balance:1','CAD','trade_balance','Balance of Trade',NULL,10,'billions','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:CHF:trade_balance:1','CHF','trade_balance','Balance of Trade',NULL,10,'billions','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:CNY:trade_balance:1','CNY','trade_balance','Balance of Trade',NULL,10,'billions','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:EUR:trade_balance:1','EUR','trade_balance','Balance of Trade',NULL,10,'billions','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:GBP:trade_balance:1','GBP','trade_balance','Balance of Trade',NULL,10,'billions','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:JPY:trade_balance:1','JPY','trade_balance','Balance of Trade',NULL,10,'billions','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:NZD:trade_balance:1','NZD','trade_balance','Balance of Trade',NULL,10,'billions','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:USD:trade_balance:1','USD','trade_balance','Balance of Trade',NULL,10,'billions','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now'));

-- Provider-native metadata becomes the display and freshness contract for a
-- profile. Profiles without a valid counterpart deliberately retain their
-- generic label and are shown as unavailable, never silently substituted.
UPDATE eodhd_indicator_profiles
SET target_label = (
      SELECT provider_type FROM eodhd_indicator_series s
      WHERE s.currency=eodhd_indicator_profiles.currency
        AND s.canonical_key=eodhd_indicator_profiles.canonical_key
        AND s.enabled=1 ORDER BY s.priority LIMIT 1
    ),
    expected_comparison = (
      SELECT comparison FROM eodhd_indicator_series s
      WHERE s.currency=eodhd_indicator_profiles.currency
        AND s.canonical_key=eodhd_indicator_profiles.canonical_key
        AND s.enabled=1 ORDER BY s.priority LIMIT 1
    ),
    expected_frequency = (
      SELECT frequency FROM eodhd_indicator_series s
      WHERE s.currency=eodhd_indicator_profiles.currency
        AND s.canonical_key=eodhd_indicator_profiles.canonical_key
        AND s.enabled=1 ORDER BY s.priority LIMIT 1
    ),
    unit = (
      SELECT unit FROM eodhd_indicator_series s
      WHERE s.currency=eodhd_indicator_profiles.currency
        AND s.canonical_key=eodhd_indicator_profiles.canonical_key
        AND s.enabled=1 ORDER BY s.priority LIMIT 1
    ),
    freshness_days = CASE (
      SELECT frequency FROM eodhd_indicator_series s
      WHERE s.currency=eodhd_indicator_profiles.currency
        AND s.canonical_key=eodhd_indicator_profiles.canonical_key
        AND s.enabled=1 ORDER BY s.priority LIMIT 1
    )
      WHEN 'Weekly' THEN 21
      WHEN 'Quarterly' THEN 150
      WHEN 'Meeting' THEN 240
      ELSE 62
    END,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE EXISTS (
  SELECT 1 FROM eodhd_indicator_series s
  WHERE s.currency=eodhd_indicator_profiles.currency
    AND s.canonical_key=eodhd_indicator_profiles.canonical_key
    AND s.enabled=1
);

-- Preserve prior provider values before a later API response overwrites them.
CREATE TABLE eodhd_event_revisions (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES eodhd_events(id) ON DELETE CASCADE,
  event_identity TEXT NOT NULL,
  actual_value TEXT,
  forecast_value TEXT,
  previous_value TEXT,
  observed_at TEXT NOT NULL
);
CREATE INDEX idx_eodhd_event_revisions_event
  ON eodhd_event_revisions(event_id, observed_at DESC);

-- Clean existing false rate mappings. The explicit series table is the
-- authority, so this also removes previously approved speeches and minutes.
UPDATE eodhd_mapping_candidates
SET status='ignored', reviewed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE proposed_canonical_key='interest_rates'
  AND NOT EXISTS (
    SELECT 1 FROM eodhd_indicator_series s
    WHERE s.currency=eodhd_mapping_candidates.currency
      AND s.canonical_key='interest_rates'
      AND s.provider_type=eodhd_mapping_candidates.provider_type
      AND COALESCE(s.comparison,'')=COALESCE(eodhd_mapping_candidates.comparison,'')
      AND s.enabled=1
  );

UPDATE eodhd_events
SET canonical_key=NULL,
    mapping_status='ignored',
    mapping_confidence=0,
    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE canonical_key='interest_rates'
  AND NOT EXISTS (
    SELECT 1 FROM eodhd_indicator_series s
    WHERE s.currency=eodhd_events.currency
      AND s.canonical_key='interest_rates'
      AND s.provider_type=eodhd_events.provider_type
      AND COALESCE(s.comparison,'')=COALESCE(eodhd_events.comparison,'')
      AND s.enabled=1
  );
