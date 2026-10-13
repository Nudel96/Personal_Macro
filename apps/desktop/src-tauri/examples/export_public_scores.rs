use personal_macro_desktop_lib::{
    cloud_public::score_transfer,
    database::{AppPaths, AppState},
};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use std::path::PathBuf;

#[tokio::main]
async fn main() {
    if let Err(error) = run().await {
        if let Some(error) =
            error.downcast_ref::<personal_macro_desktop_lib::cloud_postgres::CloudError>()
        {
            eprintln!("{}", error.code);
        } else {
            eprintln!("PUBLIC_SCORE_EXPORT_FAILED");
        }
        std::process::exit(1);
    }
}
async fn run() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.len() != 2 {
        return Err("Explicit source and destination required".into());
    }
    let source = PathBuf::from(&args[0]);
    let output = PathBuf::from(&args[1]);
    if !source.is_absolute() || !output.is_absolute() || output.exists() {
        return Err("Absolute new output required".into());
    }
    let options = SqliteConnectOptions::new().filename(source).read_only(true);
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await?;
    let root = output
        .parent()
        .ok_or("Output directory required")?
        .to_owned();
    let state = AppState {
        db: pool,
        paths: AppPaths {
            database: root.join("unused"),
            media: root.join("unused"),
            exports: root.join("unused"),
            backups: root.join("unused"),
            logs: root.join("unused"),
            settings: root.join("unused"),
            central_bank_reports: root.join("unused"),
            root,
        },
    };
    let mut tx = state.db.begin().await?;
    sqlx::query("PRAGMA query_only=ON")
        .execute(&mut *tx)
        .await?;
    // All following reads are on a read-only/query-only connection. Historical
    // observations themselves cannot be changed by the running desktop app.
    tx.rollback().await?;
    let value = score_transfer::export(&state, chrono::Utc::now()).await?;
    let bytes = serde_json::to_vec(&value)?;
    std::fs::write(&output, &bytes)?;
    println!(
        "{}",
        serde_json::json!({"ok":true,"observations":value["observations"].as_array().map(Vec::len),"priceSeries":value["prices"].as_array().map(Vec::len),"bytes":bytes.len()})
    );
    state.db.close().await;
    Ok(())
}
