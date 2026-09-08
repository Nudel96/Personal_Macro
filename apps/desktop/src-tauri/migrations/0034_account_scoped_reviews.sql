CREATE TABLE reviews_replacement (
  id TEXT PRIMARY KEY,
  account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
  review_type TEXT NOT NULL CHECK (review_type IN ('daily', 'weekly', 'monthly')),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'completed')),
  metric_snapshot_json TEXT NOT NULL DEFAULT '{}',
  wins_html TEXT,
  challenges_html TEXT,
  lessons_html TEXT,
  actions_html TEXT,
  process_rating INTEGER CHECK (process_rating BETWEEN 1 AND 10),
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(account_id, review_type, period_start, period_end)
);

INSERT INTO reviews_replacement (
  id, account_id, review_type, period_start, period_end, status,
  metric_snapshot_json, wins_html, challenges_html, lessons_html, actions_html,
  process_rating, completed_at, created_at, updated_at
)
SELECT
  id, NULL, review_type, period_start, period_end, status,
  metric_snapshot_json, wins_html, challenges_html, lessons_html, actions_html,
  process_rating, completed_at, created_at, updated_at
FROM reviews;

DROP TABLE reviews;
ALTER TABLE reviews_replacement RENAME TO reviews;
CREATE INDEX idx_reviews_account_period ON reviews(account_id, period_start DESC);
