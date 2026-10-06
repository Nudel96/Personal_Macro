use std::{fs, io::Write, path::PathBuf, str::FromStr, time::Duration};

use chrono::Utc;
use serde::Deserialize;
use sqlx::{
    Sqlite, SqlitePool,
    migrate::MigrateDatabase,
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous},
};
#[cfg(feature = "desktop")]
use tauri::{AppHandle, Manager, path::BaseDirectory};
use uuid::Uuid;
use walkdir::WalkDir;

use crate::errors::AppError;

#[derive(Debug, Clone)]
pub struct AppPaths {
    pub root: PathBuf,
    pub database: PathBuf,
    pub media: PathBuf,
    pub exports: PathBuf,
    pub backups: PathBuf,
    pub logs: PathBuf,
    pub settings: PathBuf,
    pub central_bank_reports: PathBuf,
}

#[derive(Clone)]
pub struct AppState {
    pub db: SqlitePool,
    pub paths: AppPaths,
}

impl AppPaths {
    #[cfg(feature = "desktop")]
    pub fn resolve(app: &AppHandle) -> Result<Self, AppError> {
        let root = app
            .path()
            .resolve("PersonalMacro", BaseDirectory::AppData)
            .map_err(|error| AppError::Initialization(error.to_string()))?;
        Self::from_root(root)
    }

    /// Resolve an explicitly configured persistent data directory.
    ///
    /// This never chooses AppData or a temporary directory implicitly. A server
    /// must provide its own durable volume, separately from any desktop data.
    pub fn from_root(root: PathBuf) -> Result<Self, AppError> {
        if !root.is_absolute() {
            return Err(AppError::Initialization(
                "Das Datenverzeichnis muss ein absoluter Pfad sein.".into(),
            ));
        }
        let database_dir = root.join("database");
        let media = root.join("media");
        let exports = root.join("exports");
        let backups = root.join("backups");
        let logs = root.join("logs");
        let settings = root.join("settings");
        let central_bank_reports = root.join("central-bank-reports");

        for path in [
            &database_dir,
            &media.join("trades"),
            &media.join("setups"),
            &media.join("reviews"),
            &media.join("annotations"),
            &exports,
            &backups,
            &logs,
            &settings,
            &central_bank_reports,
        ] {
            std::fs::create_dir_all(path)?;
        }

        Ok(Self {
            root,
            database: database_dir.join("journal.sqlite"),
            media,
            exports,
            backups,
            logs,
            settings,
            central_bank_reports,
        })
    }

    #[cfg(test)]
    pub fn resolve_headless() -> Result<Self, AppError> {
        let root =
            std::env::temp_dir().join(format!("personal-macro-test-{}", uuid::Uuid::new_v4()));
        Self::from_root(root)
    }
}

#[cfg(feature = "desktop")]
pub async fn initialize(app: &AppHandle) -> Result<AppState, AppError> {
    let paths = AppPaths::resolve(app)?;
    initialize_paths(paths, SqliteSynchronous::Normal).await
}

/// Initialize the same journal core on a durable, explicitly selected volume.
/// Every server connection uses FULL synchronization for acknowledged writes.
pub async fn initialize_at(root: PathBuf) -> Result<AppState, AppError> {
    initialize_paths(AppPaths::from_root(root)?, SqliteSynchronous::Full).await
}

async fn initialize_paths(
    paths: AppPaths,
    synchronous: SqliteSynchronous,
) -> Result<AppState, AppError> {
    apply_pending_restore(&paths)?;
    let database_url = format!(
        "sqlite://{}",
        paths.database.to_string_lossy().replace('\\', "/")
    );

    if !Sqlite::database_exists(&database_url)
        .await
        .unwrap_or(false)
    {
        Sqlite::create_database(&database_url).await?;
    }

    let connect_options = SqliteConnectOptions::from_str(&database_url)?
        .create_if_missing(true)
        .foreign_keys(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(synchronous)
        .busy_timeout(Duration::from_secs(5));

    let db = SqlitePoolOptions::new()
        .max_connections(8)
        .min_connections(1)
        .acquire_timeout(Duration::from_secs(10))
        .connect_with(connect_options)
        .await?;

    sqlx::query("PRAGMA foreign_keys = ON").execute(&db).await?;
    sqlx::query("PRAGMA journal_mode = WAL")
        .execute(&db)
        .await?;
    sqlx::query("PRAGMA busy_timeout = 5000")
        .execute(&db)
        .await?;
    sqlx::migrate!("./migrations")
        .run(&db)
        .await
        .map_err(|error| {
            AppError::Initialization(format!("Datenbankmigration fehlgeschlagen: {error}"))
        })?;

    seed_defaults(&db).await?;

    let state = AppState { db, paths };
    if let Err(error) = crate::commands::maybe_automatic_backup(&state).await {
        tracing::warn!(error = ?error, "Automatisches Backup konnte nicht erstellt werden");
    }
    Ok(state)
}

#[cfg(test)]
pub async fn initialize_headless() -> Result<AppState, AppError> {
    let paths = AppPaths::resolve_headless()?;
    let database_url = format!(
        "sqlite://{}",
        paths.database.to_string_lossy().replace('\\', "/")
    );
    let connect_options = SqliteConnectOptions::from_str(&database_url)?
        .create_if_missing(true)
        .foreign_keys(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal)
        .busy_timeout(Duration::from_secs(5));
    let db = SqlitePoolOptions::new()
        .max_connections(4)
        .min_connections(1)
        .acquire_timeout(Duration::from_secs(10))
        .connect_with(connect_options)
        .await?;
    sqlx::migrate!("./migrations")
        .run(&db)
        .await
        .map_err(|error| {
            AppError::Initialization(format!("Datenbankmigration fehlgeschlagen: {error}"))
        })?;
    seed_defaults(&db).await?;
    Ok(AppState { db, paths })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PendingRestore {
    staging_root: String,
    staged_at: String,
    source_backup: String,
}

fn apply_pending_restore(paths: &AppPaths) -> Result<(), AppError> {
    let pending_path = paths.settings.join("pending-restore.json");
    if !pending_path.exists() {
        return Ok(());
    }
    let pending: PendingRestore =
        serde_json::from_slice(&fs::read(&pending_path)?).map_err(|error| {
            AppError::Initialization(format!("Wiederherstellungsauftrag ist ungültig: {error}"))
        })?;
    let restore_root = paths.root.join("restore-staging");
    let staging = PathBuf::from(&pending.staging_root);
    let canonical_root = restore_root.canonicalize()?;
    let canonical_staging = staging.canonicalize()?;
    if !canonical_staging.starts_with(&canonical_root) {
        return Err(AppError::Initialization(
            "Wiederherstellungspfad liegt außerhalb des sicheren Staging-Verzeichnisses.".into(),
        ));
    }
    let source_database = canonical_staging.join("database/journal.sqlite");
    if !source_database.is_file() {
        return Err(AppError::Initialization(
            "Staging-Datenbank für Wiederherstellung fehlt.".into(),
        ));
    }
    fs::copy(&source_database, &paths.database).map_err(|error| {
        AppError::Initialization(format!(
            "Die geschlossene Journal-Datenbank konnte nicht wiederhergestellt werden: {error}"
        ))
    })?;
    for suffix in ["-wal", "-shm"] {
        let sidecar = PathBuf::from(format!("{}{}", paths.database.to_string_lossy(), suffix));
        if sidecar.is_file() {
            fs::remove_file(sidecar).map_err(|error| {
                AppError::Initialization(format!("Eine SQLite-Begleitdatei konnte bei der Wiederherstellung nicht entfernt werden: {error}"))
            })?;
        }
    }
    let staged_media = canonical_staging.join("media");
    if staged_media.is_dir() {
        for entry in WalkDir::new(&staged_media)
            .into_iter()
            .filter_map(Result::ok)
        {
            if !entry.file_type().is_file() {
                continue;
            }
            let relative = entry
                .path()
                .strip_prefix(&canonical_staging)
                .map_err(|error| {
                    AppError::Initialization(format!(
                        "Medienpfad konnte nicht validiert werden: {error}"
                    ))
                })?;
            let target = paths.root.join(relative);
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::copy(entry.path(), target)?;
        }
    }
    fs::remove_file(&pending_path)?;
    fs::remove_dir_all(&canonical_staging)?;
    let mut log = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(paths.logs.join("restore.log"))?;
    writeln!(
        log,
        "{} | wiederhergestellt aus {}",
        pending.staged_at, pending.source_backup
    )?;
    Ok(())
}

#[cfg(test)]
pub(crate) fn apply_pending_restore_for_test(paths: &AppPaths) -> Result<(), AppError> {
    apply_pending_restore(paths)
}

async fn seed_defaults(db: &SqlitePool) -> Result<(), AppError> {
    let now = Utc::now().to_rfc3339();
    let defaults = [
        ("Breakout", "#22c55e"),
        ("Trend Continuation", "#3b82f6"),
        ("S/R Rejection", "#8b5cf6"),
        ("Range", "#f59e0b"),
    ];
    for (name, color) in defaults {
        sqlx::query(
            "INSERT OR IGNORE INTO setups (id, name, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(name)
        .bind(color)
        .bind(&now)
        .bind(&now)
        .execute(db)
        .await?;
    }

    let emotions = [
        ("Ruhig", "positive", "#22c55e"),
        ("Fokussiert", "positive", "#3b82f6"),
        ("Ängstlich", "negative", "#f59e0b"),
        ("Gierig", "negative", "#ef4444"),
        ("Ungeduldig", "negative", "#f97316"),
    ];
    for (name, valence, color) in emotions {
        sqlx::query(
            "INSERT OR IGNORE INTO emotions (id, name, valence, color, created_at) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(name)
        .bind(valence)
        .bind(color)
        .bind(&now)
        .execute(db)
        .await?;
    }

    let mistakes = [
        ("FOMO-Einstieg", "entry"),
        ("Stop verschoben", "risk"),
        ("Zu früh geschlossen", "exit"),
        ("Overtrading", "discipline"),
        ("Kein gültiges Setup", "process"),
    ];
    for (name, category) in mistakes {
        sqlx::query(
            "INSERT OR IGNORE INTO mistakes (id, name, category, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(name)
        .bind(category)
        .bind(&now)
        .bind(&now)
        .execute(db)
        .await?;
    }

    Ok(())
}

#[cfg(test)]
mod configured_startup_tests {
    use super::*;

    #[test]
    fn configured_root_must_be_absolute() {
        assert!(matches!(
            AppPaths::from_root(PathBuf::from("relative-data")),
            Err(AppError::Initialization(_))
        ));
    }

    #[tokio::test]
    async fn configured_volume_migrates_backs_up_and_preserves_data_on_restart() {
        let volume = tempfile::tempdir().unwrap();
        let root = volume.path().join("workspace");
        let first = initialize_at(root.clone()).await.unwrap();
        assert_eq!(first.paths.root, root);
        assert!(first.paths.media.join("trades").is_dir());
        let migration_count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM _sqlx_migrations WHERE success = 1")
                .fetch_one(&first.db)
                .await
                .unwrap();
        assert_eq!(migration_count, 52);
        let (accounts, setups): (i64, i64) =
            sqlx::query_as("SELECT (SELECT COUNT(*) FROM accounts), (SELECT COUNT(*) FROM setups)")
                .fetch_one(&first.db)
                .await
                .unwrap();
        assert_eq!(accounts, 0);
        assert!(setups > 0);
        let foreign_keys: i64 = sqlx::query_scalar("PRAGMA foreign_keys")
            .fetch_one(&first.db)
            .await
            .unwrap();
        let journal_mode: String = sqlx::query_scalar("PRAGMA journal_mode")
            .fetch_one(&first.db)
            .await
            .unwrap();
        assert_eq!(foreign_keys, 1);
        assert_eq!(journal_mode, "wal");
        let mut connections = Vec::new();
        for _ in 0..8 {
            let mut connection = first.db.acquire().await.unwrap();
            let synchronous: i64 = sqlx::query_scalar("PRAGMA synchronous")
                .fetch_one(&mut *connection)
                .await
                .unwrap();
            assert_eq!(synchronous, 2, "every server connection must use FULL");
            connections.push(connection);
        }
        drop(connections);
        let backups: Vec<_> = fs::read_dir(&first.paths.backups)
            .unwrap()
            .map(|entry| entry.unwrap().path())
            .filter(|path| path.extension().is_some_and(|extension| extension == "zip"))
            .collect();
        assert_eq!(backups.len(), 1);
        let preview = crate::commands::preview_backup(backups[0].to_string_lossy().into_owned())
            .await
            .unwrap();
        assert!(preview.valid);
        sqlx::query("INSERT INTO accounts (id, name, created_at, updated_at) VALUES ('persistent-account', 'Headless persistence test', '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z')")
            .execute(&first.db)
            .await
            .unwrap();
        first.db.close().await;

        let second = initialize_at(root).await.unwrap();
        let persisted: String =
            sqlx::query_scalar("SELECT name FROM accounts WHERE id = 'persistent-account'")
                .fetch_one(&second.db)
                .await
                .unwrap();
        assert_eq!(persisted, "Headless persistence test");
        let second_setup_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM setups")
            .fetch_one(&second.db)
            .await
            .unwrap();
        assert_eq!(second_setup_count, setups);
        assert_eq!(fs::read_dir(&second.paths.backups).unwrap().count(), 1);
        second.db.close().await;
    }

    #[cfg(not(feature = "desktop"))]
    #[tokio::test]
    async fn headless_native_actions_fail_before_querying_or_contacting_providers() {
        let volume = tempfile::tempdir().unwrap();
        let state = initialize_at(volume.path().join("workspace"))
            .await
            .unwrap();
        let error = crate::commands::open_central_bank_report_file(
            crate::runtime::AppHandle,
            crate::runtime::State::new(&state),
            "missing-report".into(),
        )
        .await
        .unwrap_err();
        assert_eq!(error.code, "DESKTOP_REQUIRED");
        let error = crate::commands::myfxbook_sync(
            crate::runtime::State::new(&state),
            crate::runtime::AppHandle,
            "missing-account".into(),
        )
        .await
        .err()
        .unwrap();
        assert_eq!(error.code, "DESKTOP_REQUIRED");
        state.db.close().await;
    }

    #[tokio::test]
    async fn configured_startup_applies_only_the_previously_validated_restore() {
        let volume = tempfile::tempdir().unwrap();
        let root = volume.path().join("workspace");
        let state = initialize_at(root.clone()).await.unwrap();
        let backup = fs::read_dir(&state.paths.backups)
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .path();
        sqlx::query("INSERT INTO accounts (id, name, created_at, updated_at) VALUES ('after-backup', 'After backup', '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z')")
            .execute(&state.db)
            .await
            .unwrap();
        let staged = crate::commands::stage_backup_restore_for_state(
            &state,
            backup.to_string_lossy().into_owned(),
        )
        .await
        .unwrap();
        assert!(staged.staged);
        assert!(PathBuf::from(&staged.safety_copy_path).is_file());
        assert!(state.paths.settings.join("pending-restore.json").is_file());
        // Model process exit: explicitly close every SQLite handle before the
        // restart. Pool on-release pings otherwise briefly retain WAL handles
        // on Windows even after the pool's close future has completed.
        let mut connections = Vec::new();
        for _ in 0..8 {
            connections.push(state.db.acquire().await.unwrap());
        }
        let closing = state.db.close();
        for connection in connections {
            connection.close().await.unwrap();
        }
        closing.await;

        let restored = initialize_at(root).await.unwrap();
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM accounts")
            .fetch_one(&restored.db)
            .await
            .unwrap();
        assert_eq!(count, 0);
        assert!(
            !restored
                .paths
                .settings
                .join("pending-restore.json")
                .exists()
        );
        assert!(PathBuf::from(staged.safety_copy_path).is_file());
        restored.db.close().await;
    }
}

#[cfg(test)]
mod retirement_tests {
    use super::*;

    #[tokio::test]
    async fn fresh_and_reopened_journals_do_not_seed_an_account() {
        let state = initialize_headless().await.unwrap();
        let account_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM accounts")
            .fetch_one(&state.db)
            .await
            .unwrap();
        let setup_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM setups")
            .fetch_one(&state.db)
            .await
            .unwrap();
        let emotion_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM emotions")
            .fetch_one(&state.db)
            .await
            .unwrap();
        let mistake_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM mistakes")
            .fetch_one(&state.db)
            .await
            .unwrap();

        assert_eq!(account_count, 0);
        assert!(setup_count > 0);
        assert!(emotion_count > 0);
        assert!(mistake_count > 0);

        seed_defaults(&state.db).await.unwrap();
        let account_count_after_restart: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM accounts")
            .fetch_one(&state.db)
            .await
            .unwrap();
        assert_eq!(account_count_after_restart, 0);
    }

    #[tokio::test]
    async fn legacy_macro_systems_are_absent_after_migration() {
        let state = initialize_headless().await.unwrap();
        for table in [
            "economic_provider_events",
            "macro_research_jobs",
            "macro_data_automation_jobs",
            "macro_indicators",
            "macro_pair_scores",
            "heatmap_factor_observations",
            "heatmap_model_configs",
            "macro_excel_import_runs",
            "macro_excel_indicator_mappings",
            "macro_excel_history",
            "macro_excel_forecast_candidates",
            "macro_excel_fundamental_snapshots",
            "macro_excel_fundamental_evaluations",
            "macro_feed_sync_runs",
            "macro_feed_release_events",
            "macro_feed_workbook_versions",
        ] {
            let count: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?",
            )
            .bind(table)
            .fetch_one(&state.db)
            .await
            .unwrap();
            assert_eq!(count, 0, "legacy table still exists: {table}");
        }

        for table in [
            "eodhd_sync_runs",
            "eodhd_indicator_profiles",
            "eodhd_events",
            "eodhd_mapping_candidates",
            "eodhd_release_jobs",
            "eodhd_fundamental_snapshots",
            "eodhd_fundamental_evaluations",
            "eodhd_intraday_candles",
            "eodhd_technical_sync_state",
            "cot_observations",
            "seasonality_snapshots",
            "policy_rate_snapshots",
        ] {
            let count: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?",
            )
            .bind(table)
            .fetch_one(&state.db)
            .await
            .unwrap();
            assert_eq!(count, 1, "current table is missing: {table}");
        }

        let retired_settings: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM app_settings WHERE key IN ('macroDataAutomation','macroSync','weeklyMacroResearch')",
        )
        .fetch_one(&state.db)
        .await
        .unwrap();
        assert_eq!(retired_settings, 0);

        let migrated_profiles: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM eodhd_indicator_profiles")
                .fetch_one(&state.db)
                .await
                .unwrap();
        assert!(migrated_profiles > 0);
    }
}
