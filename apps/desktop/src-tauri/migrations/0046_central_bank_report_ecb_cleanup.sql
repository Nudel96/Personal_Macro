-- Remove ECB navigation pages discovered before the ECB source rules required
-- concrete dated decision and projection releases.
DELETE FROM central_bank_reports
WHERE bank_code = 'ECB'
  AND (
    source_url IN (
      'https://www.ecb.europa.eu/press/govcdec/mopo/html/index.en.html',
      'https://www.ecb.europa.eu/press/projections/html/all-releases.en.html',
      'https://www.ecb.europa.eu/press/projections/html/index.en.html',
      'https://www.ecb.europa.eu/mopo/implement/html/index.en.html',
      'https://www.ecb.europa.eu/press/mopo/implement/html/index.en.html'
    )
    OR title = 'Macroeconomic projections'
    OR title LIKE 'Monetary policy operations%'
  );

INSERT OR IGNORE INTO schema_migrations (version, name)
VALUES (46, 'central_bank_report_ecb_cleanup');
