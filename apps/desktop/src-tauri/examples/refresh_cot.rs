//! Explicit local COT refresh through the existing provider command.
//! Requires an existing absolute database and a new backup outside the repository.
use personal_macro_desktop_lib::{
    commands,
    database::{AppPaths, AppState},
    runtime::State,
};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use std::{
    path::{Path, PathBuf},
    time::Duration,
};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.len() != 2 {
        return Err("Expected explicit database and new backup paths".into());
    }
    let database = PathBuf::from(&args[0]);
    let backup = PathBuf::from(&args[1]);
    let repository = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../..")
        .canonicalize()?;
    if !database.is_absolute()
        || !database.is_file()
        || !backup.is_absolute()
        || backup.exists()
        || backup
            .parent()
            .ok_or("Backup parent missing")?
            .canonicalize()?
            .starts_with(&repository)
        || database.canonicalize()?.starts_with(&repository)
    {
        return Err("Explicit existing external database and new external backup required".into());
    }
    let root = database
        .parent()
        .and_then(Path::parent)
        .ok_or("Database root missing")?
        .to_owned();
    let paths = AppPaths {
        database: database.clone(),
        media: root.join("media"),
        exports: root.join("exports"),
        backups: root.join("backups"),
        logs: root.join("logs"),
        settings: root.join("settings"),
        central_bank_reports: root.join("central-bank-reports"),
        root,
    };
    let db = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(
            SqliteConnectOptions::new()
                .filename(&database)
                .create_if_missing(false)
                .foreign_keys(true)
                .busy_timeout(Duration::from_secs(10)),
        )
        .await?;
    sqlx::query("VACUUM INTO ?")
        .bind(backup.to_string_lossy().as_ref())
        .execute(&db)
        .await?;
    let previous: Option<String> =
        sqlx::query_scalar("SELECT MAX(report_date) FROM cot_legacy_observations")
            .fetch_one(&db)
            .await?;
    let state = AppState { db, paths };
    let result = tokio::time::timeout(
        Duration::from_secs(180),
        commands::sync_cot_data(State::new(&state)),
    )
    .await?
    .map_err(|_| "COT refresh failed; previous data retained")?;
    let latest: Option<String> =
        sqlx::query_scalar("SELECT MAX(report_date) FROM cot_legacy_observations")
            .fetch_one(&state.db)
            .await?;
    let contracts: i64 = sqlx::query_scalar(
        "SELECT COUNT(DISTINCT contract_id) FROM cot_legacy_observations WHERE report_date=?",
    )
    .bind(&latest)
    .fetch_one(&state.db)
    .await?;
    println!(
        "{}",
        serde_json::json!({"ok":true,"previousReportDate":previous,"latestReportDate":latest,
        "contractsAtLatestDate":contracts,"result":result,"backupCreated":true})
    );
    state.db.close().await;
    Ok(())
}
