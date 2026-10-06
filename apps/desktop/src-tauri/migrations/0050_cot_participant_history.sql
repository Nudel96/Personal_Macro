-- Supplementary Legacy Futures Only participants for descriptive charts.
-- NULL means not yet supplied by the provider; existing scoring is unchanged.
ALTER TABLE cot_legacy_observations ADD COLUMN commercial_long INTEGER CHECK (commercial_long >= 0);
ALTER TABLE cot_legacy_observations ADD COLUMN commercial_short INTEGER CHECK (commercial_short >= 0);
ALTER TABLE cot_legacy_observations ADD COLUMN nonreportable_long INTEGER CHECK (nonreportable_long >= 0);
ALTER TABLE cot_legacy_observations ADD COLUMN nonreportable_short INTEGER CHECK (nonreportable_short >= 0);
