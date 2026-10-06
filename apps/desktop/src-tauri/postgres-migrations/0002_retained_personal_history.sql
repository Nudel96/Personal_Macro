-- Preserved personal/history records whose feature-specific PostgreSQL port is
-- separate from the initial command API. No generic HTTP accessor is exposed.
CREATE TABLE cloud_retained_records (
    source_table TEXT NOT NULL CHECK(source_table IN (
        'dashboard_layouts','saved_filters','trade_context_links','metric_snapshots',
        'import_runs','import_rows','export_runs','metatrader_import_sources',
        'metatrader_trade_links','ctrader_import_sources','ctrader_trade_links',
        'myfxbook_connections','myfxbook_links','mt5_accounts','mt5_account_snapshots',
        'mt5_deals','mt5_open_positions','mt5_position_links','mt5_sync_runs',
        'cot_broker_links','eodhd_mapping_candidates'
    )),
    source_key_sha256 TEXT NOT NULL CHECK(source_key_sha256 ~ '^[a-f0-9]{64}$'),
    record_json TEXT NOT NULL CHECK(jsonb_typeof(record_json::jsonb) = 'object'),
    record_sha256 TEXT NOT NULL CHECK(record_sha256 ~ '^[a-f0-9]{64}$'),
    source_schema_sha256 TEXT NOT NULL CHECK(source_schema_sha256 ~ '^[a-f0-9]{64}$'),
    requires_cloud_reconnect BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY(source_table, source_key_sha256)
);
