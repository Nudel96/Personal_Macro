-- EODHD is the single paid provider for Economic Overview and fundamental
-- heatmap release data. The former public/OpenAI discovery domains remain in
-- the immutable migration history but are disabled for future syncs.
UPDATE macro_feed_source_domains SET enabled = 0;

INSERT OR REPLACE INTO macro_feed_source_domains(
  domain,source_role,enabled,approved_at,notes
) VALUES(
  'eodhd.com','official',1,CURRENT_TIMESTAMP,
  'EODHD Economic Events API; provider-sourced actual, estimate and previous values'
);
