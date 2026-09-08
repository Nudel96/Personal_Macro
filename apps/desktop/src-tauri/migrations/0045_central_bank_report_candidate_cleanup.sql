-- Remove navigation, schedule and not-yet-published pages that could be
-- discovered by broad official index pages before source-specific filters
-- were applied. These rows contain no personal data and will be replaced by
-- the actual official releases on the next source refresh.
DELETE FROM central_bank_reports
WHERE title LIKE '%to be published%'
   OR title LIKE '%schedule for policy interest rate announcements%'
   OR title IN (
     'Monetary Policy Reports',
     'Overview of Monetary Policy Instrument Operations',
     'Past monetary policy decisions',
     'Statement on Monetary Policy · Monetary Policy Releases',
     'Outlook for Economic Activity and Prices · Outlook for Economic Activity and Prices'
   );

INSERT OR IGNORE INTO schema_migrations (version, name)
VALUES (45, 'central_bank_report_candidate_cleanup');
