//! Explicit snapshot inspection, or initial import into a new disposable stage.
//! Credentials are read only from the explicitly named environment file.
use personal_macro_desktop_lib::cloud_postgres::{self, CloudError, CloudResult, importer};
use sqlx::{
    ConnectOptions, PgPool,
    postgres::{PgConnectOptions, PgPoolOptions, PgSslMode},
};
use std::{path::PathBuf, str::FromStr};

struct Arguments {
    snapshot: PathBuf,
    env_file: Option<PathBuf>,
    schema: Option<String>,
    apply: bool,
}

fn arguments() -> CloudResult<Arguments> {
    let mut snapshot = None;
    let mut env_file = None;
    let mut schema = None;
    let mut apply = false;
    let mut args = std::env::args().skip(1);
    while let Some(argument) = args.next() {
        match argument.as_str() {
            "--snapshot" => snapshot = args.next().map(PathBuf::from),
            "--env-file" => env_file = args.next().map(PathBuf::from),
            "--schema" => schema = args.next(),
            "--apply" => apply = true,
            _ => return Err(CloudError::validation("Ungültige Importargumente.")),
        }
    }
    let snapshot = snapshot.ok_or_else(|| {
        CloudError::validation("--snapshot benötigt einen absoluten Sicherungspfad.")
    })?;
    if !snapshot.is_absolute() {
        return Err(CloudError::validation(
            "Ein absoluter Sicherungspfad ist erforderlich.",
        ));
    }
    Ok(Arguments {
        snapshot,
        env_file,
        schema,
        apply,
    })
}

fn safe_stage(schema: &str) -> bool {
    schema.strip_prefix("macro_stage_").is_some_and(|suffix| {
        suffix.len() == 32
            && suffix
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    })
}

fn connection_options(path: &PathBuf) -> CloudResult<PgConnectOptions> {
    if !path.is_absolute() {
        return Err(CloudError::validation(
            "Ein absoluter Konfigurationspfad ist erforderlich.",
        ));
    }
    let entries = dotenvy::from_path_iter(path).map_err(|_| {
        CloudError::validation("Die explizite Importkonfiguration ist nicht lesbar.")
    })?;
    let mut primary = None;
    let mut alternate = None;
    for entry in entries {
        let (key, value) =
            entry.map_err(|_| CloudError::validation("Die Importkonfiguration ist ungültig."))?;
        match key.as_str() {
            "DATABASE_URL_UNPOOLED" => primary = Some(value),
            "POSTGRES_URL_NON_POOLING" => alternate = Some(value),
            _ => {}
        }
    }
    let url = primary.or(alternate).ok_or_else(|| {
        CloudError::validation("Eine direkte Datenbankverbindung ist erforderlich.")
    })?;
    Ok(PgConnectOptions::from_str(&url)
        .map_err(|_| CloudError::validation("Die Datenbankkonfiguration ist ungültig."))?
        .ssl_mode(PgSslMode::VerifyFull)
        .disable_statement_logging())
}

async fn remove_new_stage(admin: &PgPool, schema: &str) -> CloudResult<()> {
    if !safe_stage(schema) {
        return Err(CloudError::validation("Unsicherer Stagingname."));
    }
    sqlx::query(&format!("DROP SCHEMA {schema} CASCADE"))
        .execute(admin)
        .await?;
    Ok(())
}

async fn run() -> CloudResult<serde_json::Value> {
    let args = arguments()?;
    let inspection = importer::inspect_snapshot(&args.snapshot).await?;
    if !args.apply {
        return Ok(serde_json::to_value(inspection)?);
    }
    let schema = args.schema.ok_or_else(|| {
        CloudError::validation(
            "--apply benötigt einen ausdrücklich benannten neuen Stagingbereich.",
        )
    })?;
    if !safe_stage(&schema) {
        return Err(CloudError::validation(
            "Der Stagingname muss macro_stage_ und 32 hexadezimale Zeichen enthalten.",
        ));
    }
    let options = connection_options(
        &args
            .env_file
            .ok_or_else(|| CloudError::validation("--apply benötigt --env-file."))?,
    )?;
    let admin = PgPoolOptions::new()
        .max_connections(1)
        .connect_with(options.clone())
        .await?;
    // No IF NOT EXISTS: a pre-existing schema, including a previous successful
    // import, is never overwritten or treated as this invocation's property.
    if sqlx::query(&format!("CREATE SCHEMA {schema}"))
        .execute(&admin)
        .await
        .is_err()
    {
        admin.close().await;
        return Err(CloudError::new(
            "STAGE_NOT_NEW",
            "Der neue Stagingbereich konnte nicht angelegt werden; bestehende Bereiche werden nicht verändert.",
        ));
    }
    let selected_schema = schema.clone();
    let pool = match PgPoolOptions::new()
        .max_connections(1)
        .after_connect(move |connection, _| {
            let schema = selected_schema.clone();
            Box::pin(async move {
                sqlx::query("SELECT set_config('search_path',$1,false)")
                    .bind(schema)
                    .execute(connection)
                    .await?;
                Ok(())
            })
        })
        .connect_with(options)
        .await
    {
        Ok(pool) => pool,
        Err(_) => {
            remove_new_stage(&admin, &schema).await?;
            admin.close().await;
            return Err(CloudError::new(
                "STAGE_UNAVAILABLE",
                "Der Stagingbereich ist nicht erreichbar.",
            ));
        }
    };
    let migration = cloud_postgres::initialize(&pool).await;
    if let Err(error) = migration {
        pool.close().await;
        remove_new_stage(&admin, &schema).await?;
        admin.close().await;
        return Err(error);
    }
    let mut tx = match pool.begin().await {
        Ok(tx) => tx,
        Err(error) => {
            pool.close().await;
            remove_new_stage(&admin, &schema).await?;
            admin.close().await;
            return Err(error.into());
        }
    };
    let current_schema: Result<String, _> = sqlx::query_scalar("SELECT current_schema()")
        .fetch_one(&mut *tx)
        .await;
    if current_schema.as_deref().ok() != Some(schema.as_str()) {
        tx.rollback().await?;
        pool.close().await;
        remove_new_stage(&admin, &schema).await?;
        admin.close().await;
        return Err(CloudError::new(
            "STAGE_MISMATCH",
            "Der ausgewählte Stagingbereich stimmt nicht überein.",
        ));
    }
    let result = importer::import_snapshot(&mut tx, &args.snapshot).await;
    let mut report = match result {
        Ok(report) => report,
        Err(error) => {
            tx.rollback().await?;
            pool.close().await;
            remove_new_stage(&admin, &schema).await?;
            admin.close().await;
            return Err(error);
        }
    };
    if tx.commit().await.is_err() {
        pool.close().await;
        admin.close().await;
        // The server may have committed before the connection failed. Preserve
        // this stage for explicit verification; never blindly import again.
        return Err(CloudError::new(
            "IMPORT_COMMIT_UNCERTAIN",
            "Der Abschluss muss im angegebenen Stagingbereich geprüft werden. Es wurde kein Workspace aktiviert.",
        ));
    }
    report.transaction_committed = true;
    pool.close().await;
    admin.close().await;
    Ok(serde_json::to_value(report)?)
}

#[tokio::main]
async fn main() {
    match run().await {
        Ok(report) => println!(
            "{}",
            serde_json::to_string_pretty(&report).unwrap_or_else(|_| "{\"ok\":false}".into())
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
