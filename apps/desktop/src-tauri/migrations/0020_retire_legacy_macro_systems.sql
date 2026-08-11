-- Permanently retire the superseded provider, OpenAI-research and canonical
-- heatmap pipelines. The Excel fundamentals tables introduced in migration
-- 0019 and the independent COT, seasonality and policy-rate stores remain.

DELETE FROM app_settings
WHERE key IN ('macroDataAutomation', 'macroSync', 'weeklyMacroResearch');

DROP TABLE IF EXISTS macro_research_usage;
UPDATE macro_research_evidence SET promoted_observation_id = NULL;
UPDATE macro_observations SET evidence_id = NULL;
DROP TABLE IF EXISTS macro_observations;
DROP TABLE IF EXISTS macro_research_evidence;
DROP TABLE IF EXISTS macro_data_automation_jobs;
DROP TABLE IF EXISTS macro_actual_check_jobs;
DROP TABLE IF EXISTS weekly_macro_research_points;
DROP TABLE IF EXISTS weekly_macro_research_runs;
DROP TABLE IF EXISTS macro_research_jobs;
DROP TABLE IF EXISTS macro_source_payloads;
DROP TABLE IF EXISTS macro_sync_leases;
DROP TABLE IF EXISTS macro_sync_runs;

DROP TABLE IF EXISTS heatmap_pair_components;
DROP TABLE IF EXISTS heatmap_factor_observations;
DROP TABLE IF EXISTS heatmap_validation_metrics;
DROP TABLE IF EXISTS heatmap_validation_runs;
DROP TABLE IF EXISTS heatmap_model_configs;

DROP TABLE IF EXISTS macro_pair_scores;
DROP TABLE IF EXISTS macro_currency_scores;
DROP TABLE IF EXISTS macro_indicators;

DROP TABLE IF EXISTS macro_indicator_aliases;
DROP TABLE IF EXISTS macro_indicator_mappings;
DROP TABLE IF EXISTS macro_indicator_comparability;
DROP TABLE IF EXISTS macro_indicator_profiles;
DROP TABLE IF EXISTS macro_indicator_categories;
DROP TABLE IF EXISTS macro_indicator_catalog;

DROP TABLE IF EXISTS economic_provider_events;
DROP TABLE IF EXISTS provider_sync_runs;
DROP TABLE IF EXISTS macro_releases;
DROP TABLE IF EXISTS macro_data_sources;
DROP TABLE IF EXISTS policy_rate_source_catalog;

DELETE FROM macro_snapshots
WHERE calculation_version IN (
  'heatmap-v5',
  'heatmap-v5.1',
  'macro-category-compare-v4',
  'macro-point-compare-v2',
  'macro-point-compare-v3',
  'macro-score-v1',
  'research-actual-vs-previous-v1',
  'research-actual-vs-previous-v2'
)
OR snapshot_kind IN (
  'canonical_heatmap',
  'combined_market_context',
  'research_market_context'
);
