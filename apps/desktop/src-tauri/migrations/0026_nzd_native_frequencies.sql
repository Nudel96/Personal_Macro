UPDATE macro_excel_history
SET frequency = 'Quarterly'
WHERE currency = 'NZD'
  AND source_indicator_key IN (
    SELECT source_indicator_key
    FROM macro_excel_indicator_mappings
    WHERE currency = 'NZD'
      AND canonical_key IN (
        'gdp', 'cpi_yoy', 'retail_sales', 'nfp', 'unemployment_rate'
      )
  );

UPDATE macro_excel_forecast_candidates
SET frequency = 'Quarterly'
WHERE currency = 'NZD'
  AND source_indicator_key IN (
    SELECT source_indicator_key
    FROM macro_excel_indicator_mappings
    WHERE currency = 'NZD'
      AND canonical_key IN (
        'gdp', 'cpi_yoy', 'retail_sales', 'nfp', 'unemployment_rate'
      )
  );

UPDATE macro_excel_fundamental_evaluations
SET frequency = 'Quarterly'
WHERE currency = 'NZD'
  AND canonical_key IN (
    'gdp', 'cpi_yoy', 'retail_sales', 'nfp', 'unemployment_rate'
  );

UPDATE macro_feed_release_events
SET frequency = 'Quarterly'
WHERE currency = 'NZD'
  AND canonical_key IN (
    'gdp', 'cpi_yoy', 'retail_sales', 'nfp', 'unemployment_rate'
  );
