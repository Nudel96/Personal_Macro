//! Explicit activation of an already verified initial snapshot and its images.
//! No automatic retry or stage deletion, including an uncertain commit.
use personal_macro_desktop_lib::cloud_postgres::{
    CloudError, CloudResult,
    finalize::{self, MediaDescriptor},
};
use sqlx::{
    ConnectOptions,
    postgres::{PgConnectOptions, PgPoolOptions, PgSslMode},
};
use std::{
    collections::BTreeMap,
    io::Read,
    path::{Path, PathBuf},
    str::FromStr,
};

fn arguments() -> CloudResult<BTreeMap<String, String>> {
    let mut values = BTreeMap::new();
    let mut args = std::env::args().skip(1);
    while let Some(key) = args.next() {
        if ![
            "--env-file",
            "--runtime-env-file",
            "--schema",
            "--descriptor",
        ]
        .contains(&key.as_str())
            || values.contains_key(&key)
        {
            return Err(CloudError::validation("Ungültige Abschlussargumente."));
        }
        let value = args
            .next()
            .ok_or_else(|| CloudError::validation("Ein Abschlussargument fehlt."))?;
        values.insert(key, value);
    }
    if [
        "--env-file",
        "--runtime-env-file",
        "--schema",
        "--descriptor",
    ]
    .iter()
    .any(|key| !values.contains_key(*key))
    {
        return Err(CloudError::validation(
            "Explizite Datenbank- und Laufzeitkonfiguration, Stagingbereich und Bildnachweis sind erforderlich.",
        ));
    }
    Ok(values)
}
fn absolute_file(value: &str) -> CloudResult<PathBuf> {
    let path = Path::new(value);
    let metadata = std::fs::symlink_metadata(path).map_err(|_| {
        CloudError::validation("Eine explizite lesbare Datei mit absolutem Pfad ist erforderlich.")
    })?;
    if !path.is_absolute() || !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err(CloudError::validation(
            "Eine explizite lesbare Datei mit absolutem Pfad ist erforderlich.",
        ));
    }
    Ok(path.to_owned())
}
fn environment(path: &Path) -> CloudResult<BTreeMap<String, String>> {
    dotenvy::from_path_iter(path)
        .map_err(|_| CloudError::validation("Die explizite Konfiguration ist nicht lesbar."))?
        .map(|entry| {
            entry.map_err(|_| CloudError::validation("Die explizite Konfiguration ist ungültig."))
        })
        .collect()
}
async fn run() -> CloudResult<usize> {
    let args = arguments()?;
    let schema = &args["--schema"];
    if !finalize::safe_stage(schema) {
        return Err(CloudError::validation(
            "Ein gültiger expliziter Stagingbereich ist erforderlich.",
        ));
    }
    let db_env = environment(&absolute_file(&args["--env-file"])?)?;
    let runtime_env = environment(&absolute_file(&args["--runtime-env-file"])?)?;
    let workspace = runtime_env
        .get("MACRO_WORKSPACE_ID")
        .ok_or_else(|| CloudError::validation("Die Workspace-Konfiguration fehlt."))?;
    finalize::validate_identity(workspace)?;
    if runtime_env
        .get("MACRO_PG_SCHEMA")
        .is_some_and(|configured| configured != schema)
    {
        return Err(CloudError::validation(
            "Laufzeit und Abschluss müssen denselben Stagingbereich verwenden.",
        ));
    }
    let descriptor_path = absolute_file(&args["--descriptor"])?;
    let size = std::fs::metadata(&descriptor_path)
        .map_err(|_| CloudError::validation("Der Bildnachweis ist nicht lesbar."))?
        .len();
    if size > 1024 * 1024 {
        return Err(CloudError::validation("Der Bildnachweis ist zu groß."));
    }
    let mut bytes = Vec::new();
    std::fs::File::open(&descriptor_path)
        .map_err(|_| CloudError::validation("Der Bildnachweis ist nicht lesbar."))?
        .take(1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| CloudError::validation("Der Bildnachweis ist nicht lesbar."))?;
    if bytes.len() > 1024 * 1024 {
        return Err(CloudError::validation("Der Bildnachweis ist zu groß."));
    }
    let descriptor: MediaDescriptor = serde_json::from_slice(&bytes)?;
    finalize::validate_descriptor(&descriptor)?;
    let url = db_env
        .get("DATABASE_URL_UNPOOLED")
        .or_else(|| db_env.get("POSTGRES_URL_NON_POOLING"))
        .ok_or_else(|| {
            CloudError::validation("Eine direkte Datenbankverbindung ist erforderlich.")
        })?;
    let options = PgConnectOptions::from_str(url)
        .map_err(|_| CloudError::validation("Die Datenbankkonfiguration ist ungültig."))?
        .ssl_mode(PgSslMode::VerifyFull)
        .disable_statement_logging();
    let pool = PgPoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await?;
    let mut tx = pool.begin().await?;
    sqlx::query("SELECT set_config('search_path',$1,true),set_config('lock_timeout','10000',true),set_config('statement_timeout','80000',true)")
        .bind(schema).execute(&mut *tx).await?;
    let result = finalize::finalize_snapshot(&mut tx, schema, workspace, descriptor).await;
    match result {
        Err(error) => {
            tx.rollback().await?;
            pool.close().await;
            Err(error)
        }
        Ok(count) => {
            let committed = tx.commit().await.is_ok();
            pool.close().await;
            if !committed {
                return Err(CloudError::new(
                    "ACTIVATION_COMMIT_UNCERTAIN",
                    "Der Abschlussstatus muss geprüft werden. Der Stagingbereich wurde erhalten; nicht automatisch wiederholen.",
                ));
            }
            Ok(count)
        }
    }
}
#[tokio::main]
async fn main() {
    match run().await {
        Ok(count) => println!(
            "{}",
            serde_json::json!({"ok":true,"mediaVerified":count,"identityActivated":true,"revision":0})
        ),
        Err(error) => {
            eprintln!(
                "{}",
                serde_json::json!({"ok":false,"code":error.code,"message":error.message})
            );
            std::process::exit(1);
        }
    }
}
