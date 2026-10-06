//! Controlled initial import from an explicit, consistent SQLite snapshot.
//! This module never opens AppData, discovers personal files, commits PostgreSQL
//! transactions, initializes identities, or exposes row values in its reports.
use super::{CloudError, CloudResult};
use base64::{Engine, engine::general_purpose::STANDARD};
use futures_util::TryStreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{
    ConnectOptions, PgConnection, Postgres, QueryBuilder, Row, SqlitePool, ValueRef,
    postgres::PgRow,
    sqlite::{SqliteConnectOptions, SqlitePoolOptions, SqliteRow},
};
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
};

const MAX_PAYLOAD_BYTES: u64 = 500 * 1024 * 1024;
const MAX_ROW_BYTES: usize = 64 * 1024 * 1024;
const CANDIDATES: &[&str] = &[
    "accounts",
    "app_settings",
    "atlas_notebook_entries",
    "atlas_personal_preferences",
    "checklist_templates",
    "custom_fields",
    "deleted_items",
    "emotions",
    "goals",
    "media_files",
    "mistakes",
    "saved_views",
    "strategies",
    "tags",
    "account_cashflows",
    "broker_account_connections",
    "checklist_template_items",
    "custom_field_values",
    "goal_progress",
    "media_annotations",
    "reviews",
    "setups",
    "setup_versions",
    "trades",
    "trade_checklist_items",
    "trade_emotions",
    "trade_legs",
    "trade_media",
    "trade_mistakes",
    "trade_tags",
];
const RETAINED: &[&str] = &[
    "dashboard_layouts",
    "saved_filters",
    "trade_context_links",
    "metric_snapshots",
    "import_runs",
    "import_rows",
    "export_runs",
    "metatrader_import_sources",
    "metatrader_trade_links",
    "ctrader_import_sources",
    "ctrader_trade_links",
    "myfxbook_connections",
    "myfxbook_links",
    "mt5_accounts",
    "mt5_account_snapshots",
    "mt5_deals",
    "mt5_open_positions",
    "mt5_position_links",
    "mt5_sync_runs",
    "cot_broker_links",
    "eodhd_mapping_candidates",
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TableReport {
    pub table: String,
    pub source_rows: i64,
    pub copied_rows: i64,
    pub canonical_sha256: Option<String>,
    pub retained_as_archive: bool,
    pub requires_cloud_reconnect: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportInspection {
    pub schema_sha256: String,
    pub snapshot_bytes: u64,
    pub candidate_payload_bytes: u64,
    pub tables: Vec<TableReport>,
    pub excluded_provider_rows: i64,
    pub excluded_setting_rows: i64,
    pub requires_private_media_upload: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportReport {
    pub inspection: ImportInspection,
    pub row_hashes_verified: bool,
    pub account_metrics_verified: i64,
    pub identity_initialized: bool,
    pub transaction_committed: bool,
    pub activation_ready: bool,
}

#[derive(Debug, Clone)]
struct ColumnSpec {
    name: String,
    kind: String,
    primary_key_order: i64,
    boolean: bool,
}
#[derive(Debug, Clone)]
struct TableSpec {
    name: String,
    columns: Vec<ColumnSpec>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", content = "value")]
enum Cell {
    Null,
    Integer(i64),
    Real(f64),
    Text(String),
    Bytes(String),
    Boolean(bool),
}
type Record = BTreeMap<String, Cell>;

struct Snapshot {
    pool: SqlitePool,
    path: PathBuf,
    original_length: u64,
    original_modified: std::time::SystemTime,
    schema_hash: String,
    specs: BTreeMap<String, TableSpec>,
}

fn issue(code: &str, message: &str) -> CloudError {
    CloudError::new(code, message)
}
fn ident(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\"\""))
}
fn hex(bytes: impl AsRef<[u8]>) -> String {
    bytes.as_ref().iter().map(|b| format!("{b:02x}")).collect()
}
fn serialized(record: &Record) -> CloudResult<Vec<u8>> {
    let bytes = serde_json::to_vec(record)?;
    if bytes.len() > MAX_ROW_BYTES {
        return Err(issue(
            "IMPORT_ROW_TOO_LARGE",
            "Ein Datensatz überschreitet die sichere Importgröße.",
        ));
    }
    Ok(bytes)
}
fn record_hash(record: &Record) -> CloudResult<String> {
    Ok(hex(Sha256::digest(serialized(record)?)))
}
fn table_hash(mut hashes: Vec<String>) -> String {
    hashes.sort_unstable();
    let mut digest = Sha256::new();
    digest.update(b"personal-macro-table-rows-v1\n");
    for hash in hashes {
        digest.update(hash.as_bytes());
        digest.update(b"\n");
    }
    hex(digest.finalize())
}

fn validate_snapshot_path(path: &Path) -> CloudResult<PathBuf> {
    if !path.is_absolute() {
        return Err(issue(
            "SNAPSHOT_PATH_REQUIRED",
            "Ein absoluter Pfad zu einer konsistenten Sicherung ist erforderlich.",
        ));
    }
    let path = std::fs::canonicalize(path).map_err(|_| {
        issue(
            "SNAPSHOT_UNREADABLE",
            "Die angegebene Sicherung ist nicht lesbar.",
        )
    })?;
    if !path.is_file() {
        return Err(issue(
            "SNAPSHOT_UNREADABLE",
            "Die angegebene Sicherung ist keine Datei.",
        ));
    }
    if let Some(appdata) = std::env::var_os("APPDATA") {
        let live = PathBuf::from(appdata)
            .join("com.personal-macro.app")
            .join("PersonalMacro");
        if let Ok(live) = std::fs::canonicalize(live)
            && path.starts_with(live)
        {
            return Err(issue(
                "LIVE_DATABASE_REJECTED",
                "Die aktive App-Datenbank darf nicht als Importquelle verwendet werden.",
            ));
        }
    }
    for suffix in ["-wal", "-shm", "-journal"] {
        let mut sidecar = path.as_os_str().to_owned();
        sidecar.push(suffix);
        if Path::new(&sidecar).exists() {
            return Err(issue(
                "SNAPSHOT_HAS_SIDECAR",
                "Die Sicherung muss geschlossen und ohne SQLite-Begleitdateien vorliegen.",
            ));
        }
    }
    Ok(path)
}

async fn schema_rows(
    pool: &SqlitePool,
) -> CloudResult<Vec<(String, String, String, Option<String>)>> {
    Ok(sqlx::query_as("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND tbl_name <> '_sqlx_migrations' ORDER BY type,name")
        .fetch_all(pool).await?)
}

impl Snapshot {
    async fn open(path: &Path) -> CloudResult<Self> {
        let path = validate_snapshot_path(path)?;
        let metadata = std::fs::metadata(&path)
            .map_err(|_| issue("SNAPSHOT_UNREADABLE", "Die Sicherung ist nicht lesbar."))?;
        let modified = metadata
            .modified()
            .map_err(|_| issue("SNAPSHOT_UNREADABLE", "Die Sicherung ist nicht lesbar."))?;
        let options = SqliteConnectOptions::new()
            .filename(&path)
            .read_only(true)
            .immutable(true)
            .create_if_missing(false)
            .pragma("query_only", "ON")
            .pragma("trusted_schema", "OFF")
            .disable_statement_logging();
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options)
            .await?;
        let expected = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await?;
        let migrations = sqlx::migrate!("./migrations");
        // 0050 extends public COT observations, 0051 adds excluded AI costs,
        // 0052 adds excluded MT5 market tables. The personal table contracts
        // still receive the exact schema/column comparison below.
        if migrations.iter().count() != 52 {
            expected.close().await;
            pool.close().await;
            return Err(issue(
                "IMPORT_REVIEW_REQUIRED",
                "Der neue SQLite-Migrationsstand benötigt eine erneute Importprüfung.",
            ));
        }
        migrations.run(&expected).await.map_err(|_| {
            issue(
                "SOURCE_SCHEMA_UNAVAILABLE",
                "Das erwartete Quellschema konnte nicht geprüft werden.",
            )
        })?;
        let expected_rows = schema_rows(&expected).await?;
        let actual_rows = schema_rows(&pool).await?;
        expected.close().await;
        if actual_rows != expected_rows {
            pool.close().await;
            return Err(issue(
                "SOURCE_SCHEMA_MISMATCH",
                "Die Sicherung entspricht nicht dem geprüften Quellschema.",
            ));
        }
        let check: Vec<String> = sqlx::query_scalar("PRAGMA quick_check")
            .fetch_all(&pool)
            .await?;
        if check != ["ok"]
            || !sqlx::query("PRAGMA foreign_key_check")
                .fetch_all(&pool)
                .await?
                .is_empty()
        {
            pool.close().await;
            return Err(issue(
                "SOURCE_INTEGRITY_FAILED",
                "Die Sicherung hat einen Integritäts- oder Referenzfehler.",
            ));
        }
        let mut specs = BTreeMap::new();
        for (kind, name, _, _) in &expected_rows {
            if kind != "table" {
                continue;
            }
            let rows = sqlx::query(&format!("PRAGMA table_info({})", ident(name)))
                .fetch_all(&pool)
                .await?;
            let mut columns = Vec::new();
            for row in rows {
                let column: String = row.try_get("name")?;
                let kind: String = row.try_get("type")?;
                if !matches!(kind.as_str(), "TEXT" | "INTEGER" | "REAL" | "BLOB") {
                    return Err(issue(
                        "SOURCE_TYPE_UNSUPPORTED",
                        "Ein Quelltyp benötigt eine ausdrückliche Importprüfung.",
                    ));
                }
                let boolean = CANDIDATES.contains(&name.as_str())
                    && (column.starts_with("is_")
                        || column.starts_with("followed_")
                        || matches!(column.as_str(), "impulse_trade" | "favorite"));
                columns.push(ColumnSpec {
                    name: column,
                    kind,
                    primary_key_order: row.try_get("pk")?,
                    boolean,
                });
            }
            specs.insert(
                name.clone(),
                TableSpec {
                    name: name.clone(),
                    columns,
                },
            );
        }
        let schema_hash = hex(Sha256::digest(serde_json::to_vec(&expected_rows)?));
        Ok(Self {
            pool,
            path,
            original_length: metadata.len(),
            original_modified: modified,
            schema_hash,
            specs,
        })
    }

    fn unchanged(&self) -> CloudResult<()> {
        validate_snapshot_path(&self.path)?;
        let metadata = std::fs::metadata(&self.path).map_err(|_| {
            issue(
                "SNAPSHOT_CHANGED",
                "Die Sicherung wurde während der Prüfung verändert.",
            )
        })?;
        if metadata.len() != self.original_length
            || metadata.modified().ok() != Some(self.original_modified)
        {
            return Err(issue(
                "SNAPSHOT_CHANGED",
                "Die Sicherung wurde während der Prüfung verändert.",
            ));
        }
        Ok(())
    }

    async fn inspect(&self) -> CloudResult<ImportInspection> {
        let mut tables = Vec::new();
        let mut bytes = 0_u64;
        let mut excluded_provider_rows = 0;
        for (name, spec) in &self.specs {
            if name == "schema_migrations" {
                continue;
            }
            let count: i64 = sqlx::query_scalar(&format!("SELECT COUNT(*) FROM {}", ident(name)))
                .fetch_one(&self.pool)
                .await?;
            if CANDIDATES.contains(&name.as_str()) || RETAINED.contains(&name.as_str()) {
                let lengths = spec
                    .columns
                    .iter()
                    .map(|c| format!("COALESCE(length(CAST({} AS BLOB)),0)", ident(&c.name)))
                    .collect::<Vec<_>>()
                    .join("+");
                let size: i64 = sqlx::query_scalar(&format!(
                    "SELECT COALESCE(SUM({lengths}),0) FROM {}{}",
                    ident(name),
                    setting_filter(name)
                ))
                .fetch_one(&self.pool)
                .await?;
                bytes =
                    bytes
                        .checked_add(u64::try_from(size).map_err(|_| {
                            issue("IMPORT_TOO_LARGE", "Die Importgröße ist ungültig.")
                        })?)
                        .ok_or_else(|| issue("IMPORT_TOO_LARGE", "Die Importgröße ist zu groß."))?;
                tables.push(TableReport {
                    table: name.clone(),
                    source_rows: count,
                    copied_rows: 0,
                    canonical_sha256: None,
                    retained_as_archive: RETAINED.contains(&name.as_str()),
                    requires_cloud_reconnect: count > 0
                        && matches!(
                            name.as_str(),
                            "broker_account_connections" | "myfxbook_connections" | "mt5_accounts"
                        ),
                });
            } else {
                excluded_provider_rows += count;
            }
        }
        if bytes > MAX_PAYLOAD_BYTES {
            return Err(issue(
                "IMPORT_BUDGET_EXCEEDED",
                "Der persönliche Import überschreitet das festgelegte Speicherbudget.",
            ));
        }
        let excluded_setting_rows: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM app_settings WHERE key NOT IN ('appearance','analytics')",
        )
        .fetch_one(&self.pool)
        .await?;
        let media_rows: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM media_files")
            .fetch_one(&self.pool)
            .await?;
        Ok(ImportInspection {
            schema_sha256: self.schema_hash.clone(),
            snapshot_bytes: self.original_length,
            candidate_payload_bytes: bytes,
            tables,
            excluded_provider_rows,
            excluded_setting_rows,
            requires_private_media_upload: media_rows > 0,
        })
    }
}

fn setting_filter(table: &str) -> &'static str {
    if table == "app_settings" {
        " WHERE key IN ('appearance','analytics')"
    } else {
        ""
    }
}

fn sqlite_record(row: &SqliteRow, spec: &TableSpec) -> CloudResult<Record> {
    let mut values = BTreeMap::new();
    for (index, column) in spec.columns.iter().enumerate() {
        let value = if row.try_get_raw(index)?.is_null() {
            Cell::Null
        } else if column.boolean {
            match row.try_get::<i64, _>(index)? {
                0 => Cell::Boolean(false),
                1 => Cell::Boolean(true),
                _ => {
                    return Err(issue(
                        "INVALID_BOOLEAN",
                        "Ein Wahrheitswert der Sicherung ist ungültig.",
                    ));
                }
            }
        } else {
            match column.kind.as_str() {
                "INTEGER" => Cell::Integer(row.try_get(index)?),
                "REAL" => {
                    let value: f64 = row.try_get(index)?;
                    if !value.is_finite() {
                        return Err(issue(
                            "INVALID_NUMBER",
                            "Ein Zahlenwert der Sicherung ist nicht endlich.",
                        ));
                    }
                    Cell::Real(value)
                }
                "TEXT" => Cell::Text(row.try_get(index)?),
                "BLOB" => Cell::Bytes(STANDARD.encode(row.try_get::<Vec<u8>, _>(index)?)),
                _ => unreachable!(),
            }
        };
        values.insert(column.name.clone(), value);
    }
    Ok(values)
}

fn pg_record(row: &PgRow, spec: &TableSpec) -> CloudResult<Record> {
    let mut values = BTreeMap::new();
    for (index, column) in spec.columns.iter().enumerate() {
        let value = if row.try_get_raw(index)?.is_null() {
            Cell::Null
        } else if column.boolean {
            Cell::Boolean(row.try_get(index)?)
        } else {
            match column.kind.as_str() {
                "INTEGER" => Cell::Integer(row.try_get(index)?),
                "REAL" => Cell::Real(row.try_get(index)?),
                "TEXT" => Cell::Text(row.try_get(index)?),
                "BLOB" => Cell::Bytes(STANDARD.encode(row.try_get::<Vec<u8>, _>(index)?)),
                _ => unreachable!(),
            }
        };
        values.insert(column.name.clone(), value);
    }
    Ok(values)
}

fn sanitized_record(mut record: Record, table: &str) -> CloudResult<Record> {
    match table {
        "app_settings" => {
            let Some(Cell::Text(key)) = record.get("key") else {
                return Err(issue(
                    "INVALID_SETTING",
                    "Ein Einstellungsschlüssel ist ungültig.",
                ));
            };
            let Some(Cell::Text(value)) = record.get("value_json") else {
                return Err(issue("INVALID_SETTING", "Eine Einstellung ist ungültig."));
            };
            let safe = super::system::safe_setting_value(key, serde_json::from_str(value)?)?;
            record.insert("value_json".into(), Cell::Text(safe.to_string()));
        }
        "broker_account_connections" => {
            record.insert("credential_ref".into(), Cell::Null);
            record.insert("status".into(), Cell::Text("disconnected".into()));
            record.insert("status_message".into(), Cell::Text("Cloud-Neuverbindung erforderlich; übernommener Kontostand ist ein historischer Snapshot.".into()));
        }
        "myfxbook_connections" => {
            record.insert("enabled".into(), Cell::Integer(0));
            record.insert("status".into(), Cell::Text("paused".into()));
            record.insert(
                "message".into(),
                Cell::Text("Cloud-Neuverbindung erforderlich.".into()),
            );
        }
        "mt5_accounts" => {
            record.insert("is_connected".into(), Cell::Integer(0));
        }
        "mt5_sync_runs" => {
            record.insert("error_message".into(), Cell::Null);
        }
        _ => {}
    }
    Ok(record)
}

async fn insert_record(
    connection: &mut PgConnection,
    spec: &TableSpec,
    record: &Record,
) -> CloudResult<()> {
    let mut query = QueryBuilder::<Postgres>::new(format!("INSERT INTO {} (", ident(&spec.name)));
    query
        .push(
            spec.columns
                .iter()
                .map(|c| ident(&c.name))
                .collect::<Vec<_>>()
                .join(","),
        )
        .push(") VALUES(");
    let mut separated = query.separated(",");
    for column in &spec.columns {
        match &record[&column.name] {
            Cell::Null if column.boolean => {
                separated.push_bind(None::<bool>);
            }
            Cell::Null => match column.kind.as_str() {
                "INTEGER" => {
                    separated.push_bind(None::<i64>);
                }
                "REAL" => {
                    separated.push_bind(None::<f64>);
                }
                "BLOB" => {
                    separated.push_bind(None::<Vec<u8>>);
                }
                _ => {
                    separated.push_bind(None::<String>);
                }
            },
            Cell::Integer(value) => {
                separated.push_bind(*value);
            }
            Cell::Real(value) => {
                separated.push_bind(*value);
            }
            Cell::Text(value) => {
                separated.push_bind(value.clone());
            }
            Cell::Boolean(value) => {
                separated.push_bind(*value);
            }
            Cell::Bytes(value) => {
                separated.push_bind(
                    STANDARD
                        .decode(value)
                        .map_err(|_| issue("INVALID_BLOB", "Ein Binärwert ist ungültig."))?,
                );
            }
        }
    }
    separated.push_unseparated(")");
    query.build().execute(connection).await?;
    Ok(())
}

fn columns(spec: &TableSpec) -> String {
    spec.columns
        .iter()
        .map(|c| ident(&c.name))
        .collect::<Vec<_>>()
        .join(",")
}

pub async fn inspect_snapshot(path: &Path) -> CloudResult<ImportInspection> {
    let source = Snapshot::open(path).await?;
    let report = source.inspect().await;
    let unchanged = source.unchanged();
    source.pool.close().await;
    unchanged?;
    report
}

pub async fn import_snapshot(
    connection: &mut PgConnection,
    path: &Path,
) -> CloudResult<ImportReport> {
    let source = Snapshot::open(path).await?;
    let result = import_open_snapshot(connection, &source).await;
    let unchanged = source.unchanged();
    source.pool.close().await;
    unchanged?;
    result
}

async fn import_open_snapshot(
    connection: &mut PgConnection,
    source: &Snapshot,
) -> CloudResult<ImportReport> {
    let mut inspection = source.inspect().await?;
    for table in CANDIDATES
        .iter()
        .copied()
        .chain(["cloud_retained_records", "cloud_operations"])
    {
        let count: i64 = sqlx::query_scalar(&format!("SELECT COUNT(*) FROM {}", ident(table)))
            .fetch_one(&mut *connection)
            .await?;
        if count != 0 {
            return Err(issue(
                "IMPORT_TARGET_NOT_EMPTY",
                "Die Zieldatenbank muss vor der ersten Übernahme leer sein.",
            ));
        }
    }
    let revision: Option<i64> =
        sqlx::query_scalar("SELECT revision FROM cloud_workspace WHERE id=1")
            .fetch_optional(&mut *connection)
            .await?;
    if revision.is_some_and(|revision| revision != 0) {
        return Err(issue(
            "IMPORT_TARGET_NOT_EMPTY",
            "Der Zielworkspace wurde bereits verwendet.",
        ));
    }
    let mut serialized_bytes = 0_u64;
    for table in CANDIDATES.iter().chain(RETAINED.iter()) {
        let spec = source.specs.get(*table).ok_or_else(|| {
            issue(
                "SOURCE_SCHEMA_MISMATCH",
                "Eine erforderliche Tabelle fehlt.",
            )
        })?;
        let archive = RETAINED.contains(table);
        let query = format!(
            "SELECT {} FROM {}{}",
            columns(spec),
            ident(table),
            setting_filter(table)
        );
        let mut stream = sqlx::query(&query).fetch(&source.pool);
        let mut expected_hashes = Vec::new();
        let mut count = 0_i64;
        while let Some(row) = stream.try_next().await? {
            let record = sanitized_record(sqlite_record(&row, spec)?, table)?;
            let bytes = serialized(&record)?;
            serialized_bytes = serialized_bytes
                .checked_add(bytes.len() as u64)
                .ok_or_else(|| issue("IMPORT_TOO_LARGE", "Die Importgröße ist zu groß."))?;
            if serialized_bytes > MAX_PAYLOAD_BYTES {
                return Err(issue(
                    "IMPORT_BUDGET_EXCEEDED",
                    "Der Import überschreitet das festgelegte Speicherbudget.",
                ));
            }
            let hash = record_hash(&record)?;
            if archive {
                let keys: Record = spec
                    .columns
                    .iter()
                    .filter(|c| c.primary_key_order > 0)
                    .map(|c| (c.name.clone(), record[&c.name].clone()))
                    .collect();
                if keys.is_empty() || keys.values().any(|v| *v == Cell::Null) {
                    return Err(issue(
                        "IMPORT_KEY_REQUIRED",
                        "Ein historischer Datensatz hat keine sichere Identität.",
                    ));
                }
                let reconnect = matches!(*table, "myfxbook_connections" | "mt5_accounts");
                sqlx::query("INSERT INTO cloud_retained_records(source_table,source_key_sha256,record_json,record_sha256,source_schema_sha256,requires_cloud_reconnect) VALUES($1,$2,$3,$4,$5,$6)")
                    .bind(*table).bind(record_hash(&keys)?).bind(String::from_utf8(bytes).map_err(|_| issue("INVALID_RECORD", "Ein Datensatz ist ungültig."))?)
                    .bind(&hash).bind(&source.schema_hash).bind(reconnect).execute(&mut *connection).await?;
            } else {
                insert_record(&mut *connection, spec, &record).await?;
            }
            expected_hashes.push(hash);
            count += 1;
        }
        drop(stream);
        let expected = table_hash(expected_hashes);
        let mut readback_hashes = Vec::new();
        if archive {
            let mut rows = sqlx::query("SELECT record_json,record_sha256 FROM cloud_retained_records WHERE source_table=$1").bind(*table).fetch(&mut *connection);
            while let Some(row) = rows.try_next().await? {
                let data: String = row.try_get("record_json")?;
                let stored_hash: String = row.try_get("record_sha256")?;
                let actual = record_hash(&serde_json::from_str::<Record>(&data)?)?;
                if actual != stored_hash {
                    return Err(issue(
                        "IMPORT_HASH_MISMATCH",
                        "Ein übernommener Datensatz stimmt nicht mit der Sicherung überein.",
                    ));
                }
                readback_hashes.push(actual);
            }
        } else {
            let query = format!("SELECT {} FROM {}", columns(spec), ident(table));
            let mut rows = sqlx::query(&query).fetch(&mut *connection);
            while let Some(row) = rows.try_next().await? {
                readback_hashes.push(record_hash(&pg_record(&row, spec)?)?);
            }
        }
        if readback_hashes.len() as i64 != count || table_hash(readback_hashes) != expected {
            return Err(issue(
                "IMPORT_HASH_MISMATCH",
                "Die Übernahme stimmt nicht mit der geprüften Sicherung überein.",
            ));
        }
        let report = inspection
            .tables
            .iter_mut()
            .find(|r| r.table == *table)
            .expect("candidate report exists");
        report.copied_rows = count;
        report.canonical_sha256 = Some(expected);
    }
    let accounts: Vec<String> =
        sqlx::query_scalar("SELECT id FROM accounts WHERE NOT is_archived ORDER BY id")
            .fetch_all(&mut *connection)
            .await?;
    let mut metrics_verified = 0;
    for account in accounts {
        let native = crate::commands::account_journal_for_pool(&source.pool, &account)
            .await
            .map_err(|_| {
                issue(
                    "IMPORT_METRICS_FAILED",
                    "Die Quell-Kontorechnung konnte nicht geprüft werden.",
                )
            })?;
        let cloud = super::dispatch(
            &mut *connection,
            "get_account_journal",
            &serde_json::json!({"accountId":account}),
        )
        .await?;
        if serde_json::to_value(native)? != cloud {
            return Err(issue(
                "IMPORT_METRICS_MISMATCH",
                "Die Kontorechnung der Übernahme stimmt nicht mit der Sicherung überein.",
            ));
        }
        let native_dashboard =
            crate::commands::calculate_dashboard_for_pool(&source.pool, &account, None)
                .await
                .map_err(|_| {
                    issue(
                        "IMPORT_METRICS_FAILED",
                        "Die Quell-Journalkennzahlen konnten nicht geprüft werden.",
                    )
                })?;
        let cloud_dashboard = super::dispatch(
            &mut *connection,
            "calculate_dashboard",
            &serde_json::json!({"accountId":account}),
        )
        .await?;
        if serde_json::to_value(native_dashboard.metrics)? != cloud_dashboard["metrics"] {
            return Err(issue(
                "IMPORT_METRICS_MISMATCH",
                "Die Journalkennzahlen der Übernahme stimmen nicht mit der Sicherung überein.",
            ));
        }
        metrics_verified += 1;
    }
    source.unchanged()?;
    Ok(ImportReport {
        inspection,
        row_hashes_verified: true,
        account_metrics_verified: metrics_verified,
        identity_initialized: false,
        transaction_committed: false,
        activation_ready: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures_util::FutureExt;
    use std::panic::{AssertUnwindSafe, resume_unwind};

    async fn snapshot_fixture() -> (tempfile::TempDir, PathBuf) {
        let temp = tempfile::tempdir().unwrap();
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            // SQLx opens :memory: with SQLITE_OPEN_MEMORY, which can also make
            // VACUUM INTO's output transient. Use a disposable on-disk source
            // so this fixture exercises the same closed snapshot as the CLI.
            .connect_with(
                SqliteConnectOptions::new()
                    .filename(temp.path().join("fixture-source.sqlite"))
                    .create_if_missing(true)
                    .disable_statement_logging(),
            )
            .await
            .unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        sqlx::raw_sql(r#"
            INSERT INTO accounts(id,name,initial_balance_minor,created_at,updated_at) VALUES('fixture-account','Private fixture name',100000,'2026-09-01T00:00:00Z','2026-09-01T00:00:00Z');
            INSERT INTO trades(id,account_id,status,instrument,direction,closed_at,net_pnl_minor,actual_entry,quantity,created_at,updated_at) VALUES('fixture-trade','fixture-account','closed','EURUSD','long','2026-09-02T00:00:00Z',1234,'1.123456789012345678901','0.00001','2026-09-01T00:00:00Z','2026-09-01T00:00:00Z');
            INSERT INTO account_cashflows(id,account_id,occurred_at,amount_minor,kind,created_at) VALUES('fixture-flow','fixture-account','2026-09-03T00:00:00Z',500,'deposit','2026-09-03T00:00:00Z');
            INSERT INTO broker_account_connections(id,local_account_id,platform,external_account_id,credential_ref,balance_minor,created_at,updated_at) VALUES('fixture-broker','fixture-account','mt5','fixture-external','fixture-credential-do-not-upload',900000,'2026-09-01T00:00:00Z','2026-09-01T00:00:00Z');
            INSERT INTO saved_filters(id,name,scope,filter_json,created_at,updated_at) VALUES('fixture-filter','Private saved filter','trades','{"zero":0,"absent":null}','2026-09-01','2026-09-01');
            INSERT INTO myfxbook_connections(account_id,external_id,external_name,currency,broker_timezone,pnl_mode,enabled,status,message,updated_at) VALUES('fixture-account','fixture-external','Fixture external','EUR','Europe/Berlin','net',1,'active','fixture-sensitive-message','2026-09-01');
            INSERT INTO app_settings(key,value_json) VALUES('providerToken','"fixture-token-never-transfer"');
            UPDATE app_settings SET value_json='{"theme":"dark","density":"compact","apiKey":"fixture-token-never-transfer"}' WHERE key='appearance';
            INSERT INTO atlas_notebook_entries(id,title,context_label,context_json,sources_json,snapshot_png,snapshot_sha256,captured_at,created_at,updated_at) VALUES('fixture-note','Fixture note','Fixture context','{}','[]',x'0001020304','fixture-hash','2026-09-01','2026-09-01','2026-09-01');
        "#).execute(&pool).await.unwrap();
        let path = temp.path().join("consistent.sqlite");
        sqlx::query("VACUUM INTO ?")
            .bind(path.to_string_lossy().as_ref())
            .execute(&pool)
            .await
            .unwrap();
        pool.close().await;
        (temp, path)
    }

    #[tokio::test]
    async fn cloud_import_inspection_is_value_free_and_rejects_schema_drift() {
        let (_temp, path) = snapshot_fixture().await;
        let before = std::fs::read(&path).unwrap();
        let report = inspect_snapshot(&path).await.unwrap();
        let output = serde_json::to_string(&report).unwrap();
        assert!(!output.contains("Private fixture name"));
        assert!(!output.contains("fixture-token-never-transfer"));
        assert!(!output.contains("fixture-credential"));
        assert!(
            report
                .tables
                .iter()
                .any(|t| t.table == "broker_account_connections" && t.requires_cloud_reconnect)
        );
        assert_eq!(std::fs::read(&path).unwrap(), before);
        let write = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(SqliteConnectOptions::new().filename(&path))
            .await
            .unwrap();
        sqlx::query("ALTER TABLE accounts ADD COLUMN unexpected TEXT")
            .execute(&write)
            .await
            .unwrap();
        write.close().await;
        assert!(inspect_snapshot(&path).await.is_err());
    }

    #[tokio::test]
    #[ignore = "Requires MACRO_TEST_ENV_FILE; imports temporary fixture only into isolated Neon schema"]
    async fn cloud_import_roundtrip_preserves_values_and_rollback_is_atomic() {
        let fixture = super::super::test_support::TestDatabase::open().await;
        let result = AssertUnwindSafe(async {
            let (_temp, path) = snapshot_fixture().await;
            let before = std::fs::read(&path).unwrap();
            let mut tx = fixture.pool.begin().await.unwrap();
            let report = import_snapshot(&mut tx, &path).await.unwrap();
            assert!(report.row_hashes_verified);
            assert_eq!(report.account_metrics_verified, 1);
            assert!(!report.activation_ready && !report.transaction_committed);
            let values: (String, String, Option<String>) = sqlx::query_as(
                "SELECT actual_entry,quantity,actual_exit FROM trades WHERE id='fixture-trade'",
            )
            .fetch_one(&mut *tx)
            .await
            .unwrap();
            assert_eq!(
                values,
                ("1.123456789012345678901".into(), "0.00001".into(), None)
            );
            let credential: (Option<String>, String) =
                sqlx::query_as("SELECT credential_ref,status FROM broker_account_connections")
                    .fetch_one(&mut *tx)
                    .await
                    .unwrap();
            assert_eq!(credential, (None, "disconnected".into()));
            let archive: Vec<String> =
                sqlx::query_scalar("SELECT record_json FROM cloud_retained_records")
                    .fetch_all(&mut *tx)
                    .await
                    .unwrap();
            assert!(
                archive
                    .iter()
                    .any(|record| record.contains("Private saved filter"))
            );
            assert!(
                !archive
                    .iter()
                    .any(|record| record.contains("fixture-sensitive-message"))
            );
            let settings: Vec<String> = sqlx::query_scalar("SELECT value_json FROM app_settings")
                .fetch_all(&mut *tx)
                .await
                .unwrap();
            assert!(
                !settings
                    .iter()
                    .any(|value| value.contains("fixture-token-never-transfer"))
            );
            let bytes: Vec<u8> =
                sqlx::query_scalar("SELECT snapshot_png FROM atlas_notebook_entries")
                    .fetch_one(&mut *tx)
                    .await
                    .unwrap();
            assert_eq!(bytes, [0, 1, 2, 3, 4]);
            assert_eq!(
                import_snapshot(&mut tx, &path).await.unwrap_err().code,
                "IMPORT_TARGET_NOT_EMPTY"
            );
            tx.rollback().await.unwrap();
            let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM accounts")
                .fetch_one(&fixture.pool)
                .await
                .unwrap();
            assert_eq!(count, 0);
            let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM cloud_retained_records")
                .fetch_one(&fixture.pool)
                .await
                .unwrap();
            assert_eq!(count, 0);
            assert_eq!(std::fs::read(&path).unwrap(), before);
            let mut committed = fixture.pool.begin().await.unwrap();
            import_snapshot(&mut committed, &path).await.unwrap();
            committed.commit().await.unwrap();
            let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM trades")
                .fetch_one(&fixture.pool)
                .await
                .unwrap();
            assert_eq!(count, 1);
        })
        .catch_unwind()
        .await;
        fixture.close().await;
        if let Err(error) = result {
            resume_unwind(error);
        }
    }
}
