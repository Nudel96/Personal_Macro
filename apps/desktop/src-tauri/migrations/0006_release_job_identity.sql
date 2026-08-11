CREATE UNIQUE INDEX IF NOT EXISTS idx_macro_research_jobs_logical_release
  ON macro_research_jobs(currency, title, scheduled_at);
