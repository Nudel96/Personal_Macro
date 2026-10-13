//! Diagnose the actual collector on a disposable copy of a public COT package.
//! No journal database, settings or provider credentials are accepted.
use personal_macro_desktop_lib::commands;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use std::{io::Write, path::PathBuf, time::Instant};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.len() != 3 {
        return Err("Expected public package, new working copy and report date".into());
    }
    let source = PathBuf::from(&args[0]);
    let output = PathBuf::from(&args[1]);
    if !source.is_absolute() || !output.is_absolute() || output.exists() {
        return Err("Existing absolute public input and new absolute output required".into());
    }
    let original = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(
            SqliteConnectOptions::new()
                .filename(&source)
                .read_only(true),
        )
        .await?;
    let tables: Vec<String> = sqlx::query_scalar("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
        .fetch_all(&original).await?;
    if tables != ["cot_contracts", "cot_legacy_observations", "cot_sync_runs"] {
        return Err("Only the isolated public COT package is accepted".into());
    }
    sqlx::query("VACUUM INTO ?")
        .bind(output.to_string_lossy().as_ref())
        .execute(&original)
        .await?;
    original.close().await;
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(SqliteConnectOptions::new().filename(&output))
        .await?;
    let started = Instant::now();
    let refreshed = commands::refresh_public_cot(&pool, args[2].parse()?).await;
    pool.close().await;
    match refreshed {
        Ok(result) => {
            let bytes = std::fs::read(&output)?;
            let mut encoder =
                flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::best());
            encoder.write_all(&bytes)?;
            let gzip = encoder.finish()?;
            println!(
                "{}",
                serde_json::json!({"ok":true,"elapsedMs":started.elapsed().as_millis(),"result":result,"rawBytes":bytes.len(),"gzipBytes":gzip.len()})
            );
        }
        Err(error) => {
            println!(
                "{}",
                serde_json::json!({"ok":false,"elapsedMs":started.elapsed().as_millis(),"error":error.to_string()})
            );
            std::process::exit(1);
        }
    }
    Ok(())
}
