ALTER TABLE put_call_observations
    ADD COLUMN call_value INTEGER NOT NULL DEFAULT 0 CHECK (call_value >= 0);

ALTER TABLE put_call_observations
    ADD COLUMN put_value INTEGER NOT NULL DEFAULT 0 CHECK (put_value >= 0);

ALTER TABLE put_call_observations
    ADD COLUMN value_unit TEXT NOT NULL DEFAULT 'usd_notional'
        CHECK (value_unit IN ('usd_notional', 'contracts', 'weighted_contracts'));

ALTER TABLE put_call_observations
    ADD COLUMN calculation_method TEXT NOT NULL DEFAULT 'official_notional_pdf'
        CHECK (calculation_method IN (
            'official_notional_pdf',
            'reconstructed_weighted_pcr',
            'contract_volume_pcr'
        ));

ALTER TABLE put_call_observations
    ADD COLUMN source_priority INTEGER NOT NULL DEFAULT 30
        CHECK (source_priority IN (10, 20, 30));

ALTER TABLE put_call_observations
    ADD COLUMN source_file TEXT;

ALTER TABLE put_call_observations
    ADD COLUMN is_preliminary INTEGER NOT NULL DEFAULT 0
        CHECK (is_preliminary IN (0, 1));

ALTER TABLE put_call_observations
    ADD COLUMN direct_import INTEGER NOT NULL DEFAULT 1
        CHECK (direct_import IN (0, 1));

ALTER TABLE put_call_observations
    ADD COLUMN product_codes_json TEXT NOT NULL DEFAULT '[]';

ALTER TABLE put_call_observations
    ADD COLUMN parser_version TEXT NOT NULL DEFAULT 'pdf-v1';

UPDATE put_call_observations
SET call_value = call_notional_usd,
    put_value = put_notional_usd
WHERE call_value = 0 AND put_value = 0;

CREATE INDEX idx_put_call_observations_method_date
    ON put_call_observations(calculation_method, trade_date DESC);
