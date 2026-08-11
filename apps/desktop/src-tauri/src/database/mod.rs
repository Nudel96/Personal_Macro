use std::{fs, io::Write, path::PathBuf, str::FromStr, time::Duration};

use chrono::Utc;
use serde::Deserialize;
use sqlx::{
    Sqlite, SqlitePool,
    migrate::MigrateDatabase,
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous},
};
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
}

#[derive(Clone)]
pub struct AppState {
    pub db: SqlitePool,
    pub paths: AppPaths,
}

impl AppPaths {
    pub fn resolve(app: &AppHandle) -> Result<Self, AppError> {
        let root = app
            .path()
            .resolve("PersonalMacro", BaseDirectory::AppData)
            .map_err(|error| AppError::Initialization(error.to_string()))?;
        let database_dir = root.join("database");
        let media = root.join("media");
        let exports = root.join("exports");
        let backups = root.join("backups");
        let logs = root.join("logs");
        let settings = root.join("settings");

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
        })
    }

    #[cfg(test)]
    pub fn resolve_headless() -> Result<Self, AppError> {
        let root =
            std::env::temp_dir().join(format!("personal-macro-test-{}", uuid::Uuid::new_v4()));
        let database_dir = root.join("database");
        let media = root.join("media");
        let exports = root.join("exports");
        let backups = root.join("backups");
        let logs = root.join("logs");
        let settings = root.join("settings");
        for path in [&database_dir, &media, &exports, &backups, &logs, &settings] {
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
        })
    }
}

pub async fn initialize(app: &AppHandle) -> Result<AppState, AppError> {
    let paths = AppPaths::resolve(app)?;
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
        .synchronous(SqliteSynchronous::Normal)
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
    fs::copy(&source_database, &paths.database)?;
    for suffix in ["-wal", "-shm"] {
        let sidecar = PathBuf::from(format!("{}{}", paths.database.to_string_lossy(), suffix));
        if sidecar.is_file() {
            fs::remove_file(sidecar)?;
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

async fn seed_defaults(db: &SqlitePool) -> Result<(), AppError> {
    let now = Utc::now().to_rfc3339();
    let account_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM accounts")
        .fetch_one(db)
        .await?;
    if account_count == 0 {
        sqlx::query(
            "INSERT INTO accounts (id, name, base_currency, initial_balance_minor, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(Uuid::new_v4().to_string())
        .bind("Hauptkonto")
        .bind("EUR")
        .bind(0_i64)
        .bind(&now)
        .bind(&now)
        .execute(db)
        .await?;
    }

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
mod retirement_tests {
    use super::*;

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
