-- Add provider-native China releases to the Wirtschaftsdaten history without
-- changing the fixed 17-cell cross-currency fundamental pair model. These
-- profiles are deliberately CNY-only context series.

INSERT INTO eodhd_indicator_profiles(
  id,currency,canonical_key,target_label,factor,direction,
  expected_comparison,expected_frequency,mapping_rank,enabled,updated_at,
  unit,freshness_days
)
VALUES
  ('eodhd-profile:CNY:china_private_manufacturing_pmi','CNY','china_private_manufacturing_pmi','S&P Global Manufacturing PMI','growth',1,NULL,'Monthly',210,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'index',62),
  ('eodhd-profile:CNY:china_private_services_pmi','CNY','china_private_services_pmi','S&P Global Services PMI','growth',1,NULL,'Monthly',220,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'index',62),
  ('eodhd-profile:CNY:fixed_asset_investment','CNY','fixed_asset_investment','Fixed Asset Investment','growth',1,NULL,'Monthly',230,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'percent',62),
  ('eodhd-profile:CNY:exports_yoy','CNY','exports_yoy','Exports','growth',1,'yoy','Monthly',240,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'percent',62),
  ('eodhd-profile:CNY:imports_yoy','CNY','imports_yoy','Imports','growth',1,'yoy','Monthly',250,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'percent',62),
  ('eodhd-profile:CNY:industrial_profits_yoy','CNY','industrial_profits_yoy','Industrial Profits','growth',1,'yoy','Monthly',260,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'percent',62),
  ('eodhd-profile:CNY:industrial_capacity_utilization','CNY','industrial_capacity_utilization','Industrial Capacity Utilization','growth',1,NULL,'Quarterly',270,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'percent',150),
  ('eodhd-profile:CNY:current_account','CNY','current_account','Current Account','growth',1,NULL,'Quarterly',280,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'billions',150),
  ('eodhd-profile:CNY:foreign_direct_investment','CNY','foreign_direct_investment','FDI','growth',1,NULL,'Monthly',290,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'percent',62),
  ('eodhd-profile:CNY:house_price_index_yoy','CNY','house_price_index_yoy','House Price Index','inflation',1,'yoy','Monthly',300,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'percent',62),
  ('eodhd-profile:CNY:m2_money_supply_yoy','CNY','m2_money_supply_yoy','M2 Money Supply','rates',1,'yoy','Monthly',310,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'percent',62),
  ('eodhd-profile:CNY:new_yuan_loans','CNY','new_yuan_loans','New Yuan Loans','rates',1,NULL,'Monthly',320,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'billions',62),
  ('eodhd-profile:CNY:total_social_financing','CNY','total_social_financing','Total Social Financing','rates',1,NULL,'Monthly',330,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'billions',62),
  ('eodhd-profile:CNY:loan_prime_rate_5y','CNY','loan_prime_rate_5y','Loan Prime Rate 5Y','rates',1,NULL,'Meeting',340,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'percent',240);

-- S&P Global replaced the Caixin labels in the provider feed. Both names map
-- to one continuous private-sector PMI history; current S&P labels win when a
-- duplicate timestamp exists.
-- Preserve any previously approved series row and its id while moving the
-- exact provider identity into the new context profile.
UPDATE eodhd_indicator_series
SET canonical_key = CASE provider_type
      WHEN 'S&P Global Manufacturing PMI' THEN 'china_private_manufacturing_pmi'
      WHEN 'Caixin Manufacturing PMI' THEN 'china_private_manufacturing_pmi'
      WHEN 'S&P Global Services PMI' THEN 'china_private_services_pmi'
      WHEN 'Caixin Services PMI' THEN 'china_private_services_pmi'
      WHEN 'Fixed Asset Investment' THEN 'fixed_asset_investment'
      WHEN 'Exports' THEN 'exports_yoy'
      WHEN 'Imports' THEN 'imports_yoy'
      WHEN 'Industrial Profits' THEN 'industrial_profits_yoy'
      WHEN 'Industrial Capacity Utilization' THEN 'industrial_capacity_utilization'
      WHEN 'Current Account' THEN 'current_account'
      WHEN 'FDI' THEN 'foreign_direct_investment'
      WHEN 'House Price Index' THEN 'house_price_index_yoy'
      WHEN 'M2 Money Supply' THEN 'm2_money_supply_yoy'
      WHEN 'New Yuan Loans' THEN 'new_yuan_loans'
      WHEN 'Total Social Financing' THEN 'total_social_financing'
      WHEN 'Loan Prime Rate 5Y' THEN 'loan_prime_rate_5y'
    END,
    priority = CASE
      WHEN provider_type LIKE 'S&P Global % PMI' THEN 10
      WHEN provider_type LIKE 'Caixin % PMI' THEN 20
      ELSE 10
    END,
    unit = CASE
      WHEN provider_type LIKE '% PMI' THEN 'index'
      WHEN provider_type IN ('Current Account','New Yuan Loans','Total Social Financing') THEN 'billions'
      ELSE 'percent'
    END,
    frequency = CASE
      WHEN provider_type IN ('Industrial Capacity Utilization','Current Account') THEN 'Quarterly'
      WHEN provider_type='Loan Prime Rate 5Y' THEN 'Meeting'
      ELSE 'Monthly'
    END,
    enabled=1
WHERE currency='CNY'
  AND (
    (COALESCE(comparison,'')='' AND provider_type IN (
      'S&P Global Manufacturing PMI','Caixin Manufacturing PMI',
      'S&P Global Services PMI','Caixin Services PMI',
      'Fixed Asset Investment','Industrial Capacity Utilization',
      'Current Account','FDI','New Yuan Loans','Total Social Financing',
      'Loan Prime Rate 5Y'
    ))
    OR
    (LOWER(COALESCE(comparison,''))='yoy' AND provider_type IN (
      'Exports','Imports','Industrial Profits','House Price Index','M2 Money Supply'
    ))
  );

INSERT OR IGNORE INTO eodhd_indicator_series VALUES
  ('series:CNY:china_private_manufacturing_pmi:1','CNY','china_private_manufacturing_pmi','S&P Global Manufacturing PMI',NULL,10,'index','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:CNY:china_private_manufacturing_pmi:2','CNY','china_private_manufacturing_pmi','Caixin Manufacturing PMI',NULL,20,'index','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:CNY:china_private_services_pmi:1','CNY','china_private_services_pmi','S&P Global Services PMI',NULL,10,'index','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:CNY:china_private_services_pmi:2','CNY','china_private_services_pmi','Caixin Services PMI',NULL,20,'index','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:CNY:fixed_asset_investment:1','CNY','fixed_asset_investment','Fixed Asset Investment',NULL,10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:CNY:exports_yoy:1','CNY','exports_yoy','Exports','yoy',10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:CNY:imports_yoy:1','CNY','imports_yoy','Imports','yoy',10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:CNY:industrial_profits_yoy:1','CNY','industrial_profits_yoy','Industrial Profits','yoy',10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:CNY:industrial_capacity_utilization:1','CNY','industrial_capacity_utilization','Industrial Capacity Utilization',NULL,10,'percent','Quarterly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:CNY:current_account:1','CNY','current_account','Current Account',NULL,10,'billions','Quarterly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:CNY:foreign_direct_investment:1','CNY','foreign_direct_investment','FDI',NULL,10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:CNY:house_price_index_yoy:1','CNY','house_price_index_yoy','House Price Index','yoy',10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:CNY:m2_money_supply_yoy:1','CNY','m2_money_supply_yoy','M2 Money Supply','yoy',10,'percent','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:CNY:new_yuan_loans:1','CNY','new_yuan_loans','New Yuan Loans',NULL,10,'billions','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:CNY:total_social_financing:1','CNY','total_social_financing','Total Social Financing',NULL,10,'billions','Monthly',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('series:CNY:loan_prime_rate_5y:1','CNY','loan_prime_rate_5y','Loan Prime Rate 5Y',NULL,10,'percent','Meeting',1,strftime('%Y-%m-%dT%H:%M:%fZ','now'));

-- Reclassify already-downloaded provider rows immediately. A later normal
-- EODHD sync will keep using the explicit series identities above.
UPDATE eodhd_events
SET canonical_key = (
      SELECT s.canonical_key
      FROM eodhd_indicator_series s
      WHERE s.currency=eodhd_events.currency
        AND s.provider_type=eodhd_events.provider_type
        AND LOWER(COALESCE(s.comparison,''))=LOWER(COALESCE(eodhd_events.comparison,''))
        AND s.enabled=1
      LIMIT 1
    ),
    mapping_status='automatic',
    mapping_confidence=100,
    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE currency='CNY'
  AND EXISTS (
    SELECT 1
    FROM eodhd_indicator_series s
    WHERE s.currency=eodhd_events.currency
      AND s.provider_type=eodhd_events.provider_type
      AND LOWER(COALESCE(s.comparison,''))=LOWER(COALESCE(eodhd_events.comparison,''))
      AND s.enabled=1
  );

UPDATE eodhd_mapping_candidates
SET proposed_canonical_key = (
      SELECT s.canonical_key
      FROM eodhd_indicator_series s
      WHERE s.currency=eodhd_mapping_candidates.currency
        AND s.provider_type=eodhd_mapping_candidates.provider_type
        AND LOWER(COALESCE(s.comparison,''))=LOWER(COALESCE(eodhd_mapping_candidates.comparison,''))
        AND s.enabled=1
      LIMIT 1
    ),
    confidence=100,
    runner_up_canonical_key=NULL,
    runner_up_confidence=NULL,
    status='approved',
    reviewed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE currency='CNY'
  AND EXISTS (
    SELECT 1
    FROM eodhd_indicator_series s
    WHERE s.currency=eodhd_mapping_candidates.currency
      AND s.provider_type=eodhd_mapping_candidates.provider_type
      AND LOWER(COALESCE(s.comparison,''))=LOWER(COALESCE(eodhd_mapping_candidates.comparison,''))
      AND s.enabled=1
  );
