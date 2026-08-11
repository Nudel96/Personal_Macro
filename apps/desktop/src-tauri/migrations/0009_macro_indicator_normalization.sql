CREATE TABLE IF NOT EXISTS macro_indicator_categories (
  category_key TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 1,
  factor TEXT NOT NULL CHECK (factor IN ('growth', 'inflation', 'labor', 'rates')),
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  display_order INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS macro_indicator_profiles (
  profile_key TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 1,
  category_key TEXT NOT NULL REFERENCES macro_indicator_categories(category_key),
  change_basis TEXT NOT NULL CHECK (change_basis IN ('level', 'absolute_change', 'mom', 'qoq', 'yoy', 'irregular')),
  frequency_class TEXT NOT NULL,
  scope TEXT NOT NULL,
  index_standard TEXT NOT NULL,
  geography_scope TEXT NOT NULL,
  seasonal_adjustment TEXT NOT NULL,
  methodology_family TEXT NOT NULL,
  unit TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS macro_indicator_mappings (
  currency TEXT NOT NULL,
  indicator_key TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  category_key TEXT NOT NULL REFERENCES macro_indicator_categories(category_key),
  profile_key TEXT NOT NULL REFERENCES macro_indicator_profiles(profile_key),
  mapping_role TEXT NOT NULL CHECK (mapping_role IN ('primary', 'alternate', 'context_only', 'disabled')),
  priority INTEGER NOT NULL DEFAULT 100,
  enabled INTEGER NOT NULL DEFAULT 1,
  rationale TEXT NOT NULL,
  valid_from TEXT,
  valid_to TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (currency, indicator_key),
  FOREIGN KEY (currency, indicator_key) REFERENCES macro_indicator_catalog(currency, indicator_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_macro_indicator_primary_category
  ON macro_indicator_mappings(currency, category_key)
  WHERE enabled = 1 AND mapping_role = 'primary';

CREATE INDEX IF NOT EXISTS idx_macro_indicator_mapping_category
  ON macro_indicator_mappings(category_key, currency, mapping_role);

CREATE TABLE IF NOT EXISTS macro_indicator_aliases (
  id TEXT PRIMARY KEY,
  source_key TEXT NOT NULL,
  currency TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  indicator_key TEXT NOT NULL,
  match_kind TEXT NOT NULL CHECK (match_kind IN ('exact_title', 'series_id', 'provider_id')),
  priority INTEGER NOT NULL DEFAULT 100,
  version INTEGER NOT NULL DEFAULT 1,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  UNIQUE(source_key, currency, normalized_alias, match_kind),
  FOREIGN KEY (currency, indicator_key) REFERENCES macro_indicator_catalog(currency, indicator_key)
);

CREATE TABLE IF NOT EXISTS macro_indicator_comparability (
  category_key TEXT NOT NULL REFERENCES macro_indicator_categories(category_key),
  left_profile_key TEXT NOT NULL REFERENCES macro_indicator_profiles(profile_key),
  right_profile_key TEXT NOT NULL REFERENCES macro_indicator_profiles(profile_key),
  version INTEGER NOT NULL DEFAULT 1,
  comparison_status TEXT NOT NULL CHECK (comparison_status IN ('direct', 'restricted', 'not_comparable')),
  score_eligible INTEGER NOT NULL DEFAULT 0,
  rationale TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (category_key, left_profile_key, right_profile_key)
);

ALTER TABLE macro_indicators ADD COLUMN normalized_category_key TEXT REFERENCES macro_indicator_categories(category_key);
ALTER TABLE macro_indicators ADD COLUMN comparison_profile_key TEXT REFERENCES macro_indicator_profiles(profile_key);
ALTER TABLE macro_indicators ADD COLUMN normalization_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE macro_snapshots ADD COLUMN normalization_version INTEGER NOT NULL DEFAULT 0;
