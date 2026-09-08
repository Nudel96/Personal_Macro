use std::{
    collections::{BTreeMap, BTreeSet},
    fs::{self, File},
    io::{Read, Write},
    path::{Component, Path},
    str::FromStr,
};

use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{
    Row, SqliteConnection,
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
};
use tauri::State;
use uuid::Uuid;
use zip::ZipArchive;

use crate::{
    commands::create_backup_for_state,
    database::AppState,
    errors::{AppError, CommandResult},
};

const RESET_CONFIRMATION: &str = "JOURNAL ZURÜCKSETZEN";
const DATABASE_ENTRY: &str = "database/journal.sqlite";
const MAX_BACKUP_ENTRY_BYTES: u64 = 1024 * 1024 * 1024;
const MAX_BACKUP_BYTES: u64 = 2 * 1024 * 1024 * 1024;
const JOURNAL_ENTITY_ROWS_FILTER: &str = "entity_type IN ('trade', 'review', 'goal')";

const RESET_TABLES: &[&str] = &[
    "mt5_sync_runs",
    "mt5_accounts",
    "ctrader_trade_links",
    "ctrader_import_sources",
    "metatrader_trade_links",
    "metatrader_import_sources",
    "custom_field_values",
    "deleted_items",
    "trades",
    "reviews",
    "goals",
    "metric_snapshots",
    "import_runs",
    "saved_filters",
    "saved_views",
    "accounts",
];

const JOURNAL_EMPTY_TABLES: &[&str] = &[
    "accounts",
    "account_cashflows",
    "trades",
    "trade_legs",
    "trade_tags",
    "trade_checklist_items",
    "trade_emotions",
    "trade_mistakes",
    "trade_media",
    "trade_context_links",
    "reviews",
    "goals",
    "goal_progress",
    "metric_snapshots",
    "import_runs",
    "import_rows",
    "saved_filters",
    "saved_views",
    "mt5_accounts",
    "mt5_account_snapshots",
    "mt5_deals",
    "mt5_open_positions",
    "mt5_position_links",
    "mt5_sync_runs",
    "ctrader_import_sources",
    "ctrader_trade_links",
    "metatrader_import_sources",
    "metatrader_trade_links",
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifiedBackup {
    pub backup_path: String,
    pub file_count: usize,
    pub database_quick_check: String,
    pub reset_target_fingerprint: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreservedTableCount {
    pub row_count: i64,
    pub fingerprint: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalResetResult {
    pub backup_path: String,
    pub deleted_row_counts: BTreeMap<String, i64>,
    pub preserved_table_counts: BTreeMap<String, PreservedTableCount>,
    pub completed_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupManifest {
    version: u32,
    database_file: String,
    files: Vec<ManifestFile>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManifestFile {
    path: String,
    size_bytes: u64,
    sha256: String,
}

#[tauri::command]
#[allow(dead_code)] // Registered by the Tauri integration hunk once the reset UI lands.
pub async fn reset_journal(
    state: State<'_, AppState>,
    confirmation: String,
) -> CommandResult<JournalResetResult> {
    reset_journal_for_state(&state, &confirmation)
        .await
        .map_err(Into::into)
}

pub(crate) async fn reset_journal_for_state(
    state: &AppState,
    confirmation: &str,
) -> Result<JournalResetResult, AppError> {
    if confirmation != RESET_CONFIRMATION {
        return Err(AppError::Validation(format!(
            "Die Bestätigung muss exakt \"{RESET_CONFIRMATION}\" lauten."
        )));
    }

    let backup = create_backup_for_state(state).await?;
    let verified_backup = verify_backup_archive(Path::new(&backup.path)).await?;
    reset_journal_from_verified_backup(state, verified_backup).await
}

async fn reset_journal_from_verified_backup(
    state: &AppState,
    verified_backup: VerifiedBackup,
) -> Result<JournalResetResult, AppError> {
    let mut connection = state.db.acquire().await?;
    sqlx::query("BEGIN IMMEDIATE")
        .execute(&mut *connection)
        .await?;

    let reset_result = async {
        let live_target_fingerprint =
            capture_reset_target_fingerprint(&mut connection).await?;
        if live_target_fingerprint != verified_backup.reset_target_fingerprint {
            return Err(AppError::Conflict(
                "RETRY_RESET_REQUIRED: Die Journal-Daten haben sich nach dem Backup geändert. Bitte den Reset erneut starten, damit kein ungesicherter Datensatz gelöscht wird."
                    .into(),
            ));
        }

        let preserved_before = capture_preserved_tables(&mut connection).await?;
        let mut deleted_row_counts = BTreeMap::new();
        for table in RESET_TABLES {
            if !table_exists_on_connection(&mut connection, table).await? {
                continue;
            }
            let filter = reset_target_filter(table)
                .map(|predicate| format!(" WHERE {predicate}"))
                .unwrap_or_default();
            let count: i64 = sqlx::query_scalar(&format!(
                "SELECT COUNT(*) FROM {table}{filter}"
            ))
            .fetch_one(&mut *connection)
            .await?;
            sqlx::query(&format!("DELETE FROM {table}{filter}"))
                .execute(&mut *connection)
                .await?;
            deleted_row_counts.insert((*table).to_owned(), count);
        }

        let fk_violations = sqlx::query("PRAGMA foreign_key_check")
            .fetch_all(&mut *connection)
            .await?;
        if !fk_violations.is_empty() {
            return Err(AppError::DataTransfer(
                "Journal-Reset abgebrochen: Foreign-Key-Prüfung meldet Fehler.".into(),
            ));
        }

        for table in JOURNAL_EMPTY_TABLES {
            if !table_exists_on_connection(&mut connection, table).await? {
                continue;
            }
            let remaining: i64 = sqlx::query_scalar(&format!(
                "SELECT COUNT(*) FROM {table}"
            ))
            .fetch_one(&mut *connection)
            .await?;
            if remaining != 0 {
                return Err(AppError::DataTransfer(format!(
                    "Journal-Reset ist unvollständig: Tabelle {table} enthält noch {remaining} Zeilen."
                )));
            }
        }
        for table in ["custom_field_values", "deleted_items"] {
            if !table_exists_on_connection(&mut connection, table).await? {
                continue;
            }
            let remaining: i64 = sqlx::query_scalar(&format!(
                "SELECT COUNT(*) FROM {table} WHERE {JOURNAL_ENTITY_ROWS_FILTER}"
            ))
            .fetch_one(&mut *connection)
            .await?;
            if remaining != 0 {
                return Err(AppError::DataTransfer(format!(
                    "Journal-Reset ist unvollständig: Tabelle {table} enthält noch {remaining} Journal-Zeilen."
                )));
            }
        }

        let preserved_after = capture_preserved_tables(&mut connection).await?;
        if preserved_before != preserved_after {
            return Err(AppError::DataTransfer(
                "Journal-Reset abgebrochen: geschützte Macro-/Marktdaten würden verändert.".into(),
            ));
        }
        Ok((deleted_row_counts, preserved_after))
    }
    .await;

    let (deleted_row_counts, preserved_after) = match reset_result {
        Ok(result) => {
            if let Err(error) = sqlx::query("COMMIT").execute(&mut *connection).await {
                let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
                return Err(AppError::Database(error));
            }
            result
        }
        Err(error) => {
            let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
            return Err(error);
        }
    };

    let quick_check: String = sqlx::query_scalar("PRAGMA quick_check")
        .fetch_one(&mut *connection)
        .await?;
    if quick_check != "ok" {
        return Err(AppError::DataTransfer(format!(
            "Journal-Reset wurde abgeschlossen, aber die SQLite-Prüfung ist fehlgeschlagen. Das verifizierte Backup liegt unter {}.",
            verified_backup.backup_path
        )));
    }

    Ok(JournalResetResult {
        backup_path: verified_backup.backup_path,
        deleted_row_counts,
        preserved_table_counts: preserved_after,
        completed_at: Utc::now().to_rfc3339(),
    })
}

pub(crate) async fn verify_backup_archive(path: &Path) -> Result<VerifiedBackup, AppError> {
    let file = File::open(path)?;
    let mut archive = ZipArchive::new(file).map_err(|error| {
        AppError::DataTransfer(format!("Backup konnte nicht gelesen werden: {error}"))
    })?;
    let mut manifest_count = 0_usize;
    let mut archive_files = BTreeSet::new();
    let mut total_size = 0_u64;

    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|error| AppError::DataTransfer(error.to_string()))?;
        let enclosed = entry
            .enclosed_name()
            .ok_or_else(|| AppError::DataTransfer("Unsicherer Pfad im Backup erkannt.".into()))?;
        let entry_name = enclosed.to_string_lossy().replace('\\', "/");
        if entry_name == "manifest.json" {
            manifest_count += 1;
        } else if !entry.is_dir() {
            if !archive_files.insert(entry_name.clone()) {
                return Err(AppError::DataTransfer(format!(
                    "Doppelte Datei im Backup: {entry_name}"
                )));
            }
            if entry.size() > MAX_BACKUP_ENTRY_BYTES {
                return Err(AppError::DataTransfer("Backup-Datei ist zu groß.".into()));
            }
            total_size = total_size.saturating_add(entry.size());
            if total_size > MAX_BACKUP_BYTES {
                return Err(AppError::DataTransfer(
                    "Backup überschreitet die maximale Größe.".into(),
                ));
            }
        }
    }
    if manifest_count != 1 {
        return Err(AppError::DataTransfer(
            "Backup muss genau ein manifest.json enthalten.".into(),
        ));
    }

    let mut manifest_json = String::new();
    archive
        .by_name("manifest.json")
        .map_err(|_| AppError::DataTransfer("manifest.json fehlt".into()))?
        .read_to_string(&mut manifest_json)?;
    let manifest: BackupManifest = serde_json::from_str(&manifest_json)
        .map_err(|error| AppError::DataTransfer(format!("Manifest ist ungültig: {error}")))?;
    if manifest.version != 1 || manifest.database_file != DATABASE_ENTRY {
        return Err(AppError::DataTransfer(
            "Backup-Version oder Datenbankpfad wird nicht unterstützt.".into(),
        ));
    }

    let mut manifest_files = BTreeSet::new();
    for expected in &manifest.files {
        let relative = Path::new(&expected.path);
        if !is_safe_relative_path(relative) || expected.path == "manifest.json" {
            return Err(AppError::DataTransfer(
                "Unsicherer Manifestpfad erkannt.".into(),
            ));
        }
        if !manifest_files.insert(expected.path.clone()) {
            return Err(AppError::DataTransfer(format!(
                "Doppelte Manifestdatei: {}",
                expected.path
            )));
        }
        if expected.size_bytes > MAX_BACKUP_ENTRY_BYTES {
            return Err(AppError::DataTransfer("Manifestdatei ist zu groß.".into()));
        }
    }
    if !manifest_files.contains(DATABASE_ENTRY) || archive_files != manifest_files {
        return Err(AppError::DataTransfer(
            "Backup-Inhalt stimmt nicht mit dem Manifest überein.".into(),
        ));
    }

    let staging =
        std::env::temp_dir().join(format!("personal-macro-backup-check-{}", Uuid::new_v4()));
    fs::create_dir_all(&staging)?;
    let verification_result = async {
        for expected in &manifest.files {
            let (entry_size, entry_sha256) = {
                let mut entry = archive.by_name(&expected.path).map_err(|_| {
                    AppError::DataTransfer(format!(
                        "Manifestdatei fehlt im Backup: {}",
                        expected.path
                    ))
                })?;
                let entry_size = entry.size();
                let entry_sha256 = sha_reader(&mut entry)?;
                (entry_size, entry_sha256)
            };
            if entry_size != expected.size_bytes || entry_sha256 != expected.sha256 {
                return Err(AppError::DataTransfer(format!(
                    "Prüfsumme oder Größe stimmt nicht: {}",
                    expected.path
                )));
            }
            if expected.path == DATABASE_ENTRY {
                let database_path = staging.join(DATABASE_ENTRY);
                fs::create_dir_all(database_path.parent().expect("database file has a parent"))?;
                let mut output = File::create(&database_path)?;
                let mut database_entry = archive.by_name(DATABASE_ENTRY).map_err(|_| {
                    AppError::DataTransfer("Datenbankdatei fehlt im Backup.".into())
                })?;
                std::io::copy(&mut database_entry, &mut output)?;
                output.flush()?;
            }
        }
        verify_staged_database(&staging.join(DATABASE_ENTRY)).await
    }
    .await;
    let cleanup_result = fs::remove_dir_all(&staging);
    match (verification_result, cleanup_result) {
        (Err(error), _) => Err(error),
        (Ok(_), Err(error)) => Err(AppError::Io(error)),
        (Ok((quick_check, reset_target_fingerprint)), Ok(())) => Ok(VerifiedBackup {
            backup_path: path.to_string_lossy().into_owned(),
            file_count: manifest.files.len(),
            database_quick_check: quick_check,
            reset_target_fingerprint,
        }),
    }
}

async fn verify_staged_database(path: &Path) -> Result<(String, String), AppError> {
    let mut header = [0_u8; 16];
    File::open(path)?.read_exact(&mut header)?;
    if &header != b"SQLite format 3\0" {
        return Err(AppError::DataTransfer(
            "Die enthaltene Datenbank ist keine gültige SQLite-Datei.".into(),
        ));
    }
    let database_url = format!("sqlite://{}", path.to_string_lossy().replace('\\', "/"));
    let options = SqliteConnectOptions::from_str(&database_url)?
        .read_only(true)
        .create_if_missing(false);
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await?;
    let mut connection = pool.acquire().await?;
    let quick_check: String = sqlx::query_scalar("PRAGMA quick_check")
        .fetch_one(&mut *connection)
        .await?;
    let reset_target_fingerprint = capture_reset_target_fingerprint(&mut connection).await?;
    drop(connection);
    pool.close().await;
    if quick_check != "ok" {
        return Err(AppError::DataTransfer(format!(
            "SQLite quick_check des Backups fehlgeschlagen: {quick_check}"
        )));
    }
    Ok((quick_check, reset_target_fingerprint))
}

async fn table_exists_on_connection(
    connection: &mut SqliteConnection,
    table: &str,
) -> Result<bool, AppError> {
    Ok(sqlx::query_scalar::<_, i64>(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?)",
    )
    .bind(table)
    .fetch_one(&mut *connection)
    .await?
        != 0)
}

fn reset_target_filter(table: &str) -> Option<&'static str> {
    match table {
        "custom_field_values" | "deleted_items" => Some(JOURNAL_ENTITY_ROWS_FILTER),
        _ => None,
    }
}

async fn capture_reset_target_fingerprint(
    connection: &mut SqliteConnection,
) -> Result<String, AppError> {
    let mut target_tables = BTreeMap::new();
    for table in JOURNAL_EMPTY_TABLES {
        target_tables.insert(*table, None);
    }
    target_tables.insert("custom_field_values", Some(JOURNAL_ENTITY_ROWS_FILTER));
    target_tables.insert("deleted_items", Some(JOURNAL_ENTITY_ROWS_FILTER));

    let mut hasher = Sha256::new();
    update_digest_field(&mut hasher, b"journal-reset-target-v1");
    for (table, filter) in target_tables {
        update_digest_field(&mut hasher, table.as_bytes());
        update_digest_field(&mut hasher, filter.unwrap_or("").as_bytes());
        if !table_exists_on_connection(connection, table).await? {
            hasher.update([0]);
            continue;
        }
        hasher.update([1]);

        let columns = sqlx::query_scalar::<_, String>(&format!(
            "SELECT name FROM pragma_table_info('{table}') ORDER BY cid"
        ))
        .fetch_all(&mut *connection)
        .await?;
        for column in &columns {
            update_digest_field(&mut hasher, column.as_bytes());
        }
        let quoted_columns = columns
            .iter()
            .map(|column| format!("quote(\"{}\")", column.replace('"', "\"\"")))
            .collect::<Vec<_>>()
            .join(", ");
        let filter_clause = filter
            .map(|predicate| format!(" WHERE {predicate}"))
            .unwrap_or_default();
        let rows = sqlx::query(&format!(
            "SELECT {quoted_columns} FROM {table}{filter_clause} ORDER BY {quoted_columns}"
        ))
        .fetch_all(&mut *connection)
        .await?;
        hasher.update((rows.len() as u64).to_le_bytes());
        for row in rows {
            for index in 0..columns.len() {
                let value: String = row.try_get(index)?;
                update_digest_field(&mut hasher, value.as_bytes());
            }
        }
    }
    Ok(hex_digest(hasher))
}

async fn capture_preserved_tables(
    connection: &mut SqliteConnection,
) -> Result<BTreeMap<String, PreservedTableCount>, AppError> {
    let table_names = sqlx::query_scalar::<_, String>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND (name IN ('economic_provider_events', 'provider_sync_runs') OR name GLOB 'macro_*' OR name GLOB 'cot_*' OR name GLOB 'seasonality_*' OR name GLOB 'policy_rate_*' OR name GLOB 'market_*' OR name GLOB 'eodhd_*' OR name GLOB 'put_call_*') ORDER BY name",
    )
    .fetch_all(&mut *connection)
    .await?;
    let mut tables = BTreeMap::new();
    for table in table_names {
        let count: i64 = sqlx::query_scalar(&format!("SELECT COUNT(*) FROM {table}"))
            .fetch_one(&mut *connection)
            .await?;
        let columns = sqlx::query_scalar::<_, String>(&format!(
            "SELECT name FROM pragma_table_info('{table}') ORDER BY cid"
        ))
        .fetch_all(&mut *connection)
        .await?;
        let quoted_columns = columns
            .iter()
            .map(|column| format!("quote(\"{}\")", column.replace('"', "\"\"")))
            .collect::<Vec<_>>()
            .join(", ");
        let mut hasher = Sha256::new();
        hasher.update(table.as_bytes());
        let rows = sqlx::query(&format!(
            "SELECT {quoted_columns} FROM {table} ORDER BY rowid"
        ))
        .fetch_all(&mut *connection)
        .await?;
        for row in rows {
            for index in 0..columns.len() {
                let value: String = row.try_get(index)?;
                hasher.update((value.len() as u64).to_le_bytes());
                hasher.update(value.as_bytes());
            }
        }
        tables.insert(
            table,
            PreservedTableCount {
                row_count: count,
                fingerprint: hex_digest(hasher),
            },
        );
    }
    Ok(tables)
}

fn is_safe_relative_path(path: &Path) -> bool {
    !path.as_os_str().is_empty()
        && !path.is_absolute()
        && path
            .components()
            .all(|component| matches!(component, Component::Normal(_)))
}

fn sha_reader(reader: &mut impl Read) -> Result<String, AppError> {
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let count = reader.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    Ok(hex_digest(hasher))
}

fn update_digest_field(hasher: &mut Sha256, value: &[u8]) {
    hasher.update((value.len() as u64).to_le_bytes());
    hasher.update(value);
}

fn hex_digest(hasher: Sha256) -> String {
    hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

#[cfg(test)]
mod tests {
    use std::fs::OpenOptions;
    use std::io::Write;

    use crate::{commands::create_backup_for_state, database::initialize_headless};

    use super::{
        reset_journal_for_state, reset_journal_from_verified_backup, verify_backup_archive,
    };

    #[tokio::test]
    async fn verifies_a_fresh_backup_and_rejects_a_corrupted_archive() {
        let state = initialize_headless().await.unwrap();
        let backup = create_backup_for_state(&state).await.unwrap();
        let verified = verify_backup_archive(std::path::Path::new(&backup.path))
            .await
            .unwrap();
        assert_eq!(verified.database_quick_check, "ok");

        let corrupted = state.paths.backups.join("corrupted.zip");
        std::fs::copy(&backup.path, &corrupted).unwrap();
        let mut file = OpenOptions::new().write(true).open(&corrupted).unwrap();
        file.write_all(&[0, 0, 0, 0]).unwrap();
        file.flush().unwrap();
        assert!(verify_backup_archive(&corrupted).await.is_err());
    }

    #[tokio::test]
    async fn rejects_an_incorrect_confirmation_without_mutating_the_journal() {
        let state = initialize_headless().await.unwrap();
        sqlx::query(
            "INSERT INTO accounts (id, name, base_currency, initial_balance_minor, created_at, updated_at) VALUES ('account-a', 'A', 'EUR', 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
        )
        .execute(&state.db)
        .await
        .unwrap();

        let error = reset_journal_for_state(&state, "nein").await.unwrap_err();
        assert!(error.to_string().contains("JOURNAL ZURÜCKSETZEN"));

        let account_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM accounts")
            .fetch_one(&state.db)
            .await
            .unwrap();
        assert_eq!(account_count, 1);
    }

    #[tokio::test]
    async fn aborts_when_the_journal_changes_after_backup_before_the_write_lock() {
        let state = initialize_headless().await.unwrap();
        sqlx::query(
            "INSERT INTO accounts (id, name, base_currency, initial_balance_minor, created_at, updated_at) VALUES ('account-before-backup', 'Vor Backup', 'EUR', 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
        )
        .execute(&state.db)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO trades (id, account_id, status, instrument, asset_class, direction, created_at, updated_at) VALUES ('trade-before-backup', 'account-before-backup', 'closed', 'EURUSD', 'forex', 'long', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
        )
        .execute(&state.db)
        .await
        .unwrap();

        let backup = create_backup_for_state(&state).await.unwrap();
        let verified_backup = verify_backup_archive(std::path::Path::new(&backup.path))
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO accounts (id, name, base_currency, initial_balance_minor, created_at, updated_at) VALUES ('account-after-backup', 'Nach Backup', 'EUR', 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
        )
        .execute(&state.db)
        .await
        .unwrap();

        let reset_result = reset_journal_from_verified_backup(&state, verified_backup).await;

        let error = reset_result.unwrap_err();
        assert!(matches!(
            &error,
            crate::errors::AppError::Conflict(message)
                if message.starts_with("RETRY_RESET_REQUIRED:") && message.contains("erneut")
        ));
        let account_ids: Vec<String> = sqlx::query_scalar("SELECT id FROM accounts ORDER BY id")
            .fetch_all(&state.db)
            .await
            .unwrap();
        let trade_ids: Vec<String> = sqlx::query_scalar("SELECT id FROM trades ORDER BY id")
            .fetch_all(&state.db)
            .await
            .unwrap();
        assert_eq!(
            account_ids,
            vec!["account-after-backup", "account-before-backup"]
        );
        assert_eq!(trade_ids, vec!["trade-before-backup"]);
    }

    #[tokio::test]
    async fn resets_journal_rows_but_preserves_definitions_and_macro_tables() {
        let state = initialize_headless().await.unwrap();
        sqlx::query(
            "INSERT INTO accounts (id, name, base_currency, initial_balance_minor, created_at, updated_at) VALUES ('account-a', 'A', 'EUR', 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
        )
        .execute(&state.db)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO trades (id, account_id, status, instrument, asset_class, direction, created_at, updated_at) VALUES ('trade-a', 'account-a', 'closed', 'EURUSD', 'forex', 'long', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
        )
        .execute(&state.db)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO mt5_accounts (id, provider, server, server_key, login, first_seen_at, last_seen_at, created_at, updated_at) VALUES ('mt5-a', 'legacy', 'server', 'server', '1', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
        )
        .execute(&state.db)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO custom_fields (id, entity_type, name, field_type, created_at, updated_at) VALUES ('field-media', 'media', 'Mediennotiz', 'text', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
        )
        .execute(&state.db)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO custom_field_values (id, custom_field_id, entity_type, entity_id, value_json, updated_at) VALUES ('field-value-media', 'field-media', 'media', 'media-a', '\"behalten\"', '2026-01-01T00:00:00Z')",
        )
        .execute(&state.db)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO deleted_items (id, entity_type, entity_id, display_name, payload_json, deleted_at) VALUES ('deleted-media', 'media', 'media-a', 'Medienoriginal', '{}', '2026-01-01T00:00:00Z')",
        )
        .execute(&state.db)
        .await
        .unwrap();
        let setup_count_before: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM setups")
            .fetch_one(&state.db)
            .await
            .unwrap();
        let eodhd_count_before: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM eodhd_events")
            .fetch_one(&state.db)
            .await
            .unwrap();

        let result = reset_journal_for_state(&state, "JOURNAL ZURÜCKSETZEN")
            .await
            .unwrap();

        assert!(std::path::Path::new(&result.backup_path).is_file());
        assert_eq!(result.deleted_row_counts["accounts"], 1);
        for table in [
            "accounts",
            "trades",
            "account_cashflows",
            "import_runs",
            "mt5_accounts",
        ] {
            let count: i64 = sqlx::query_scalar(&format!("SELECT COUNT(*) FROM {table}"))
                .fetch_one(&state.db)
                .await
                .unwrap();
            assert_eq!(count, 0, "{table} was not reset");
        }
        let setup_count_after: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM setups")
            .fetch_one(&state.db)
            .await
            .unwrap();
        let eodhd_count_after: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM eodhd_events")
            .fetch_one(&state.db)
            .await
            .unwrap();
        assert_eq!(setup_count_after, setup_count_before);
        assert_eq!(eodhd_count_after, eodhd_count_before);
        let preserved_custom_values: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM custom_field_values WHERE entity_type = 'media'",
        )
        .fetch_one(&state.db)
        .await
        .unwrap();
        let preserved_deleted_media: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM deleted_items WHERE entity_type = 'media'")
                .fetch_one(&state.db)
                .await
                .unwrap();
        assert_eq!(preserved_custom_values, 1);
        assert_eq!(preserved_deleted_media, 1);
    }
}
