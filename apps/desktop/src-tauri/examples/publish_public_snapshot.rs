//! Explicit publication of a verified public-cache upload descriptor.
//! Migrations require an explicit flag and matching active workspace identity.
//! Commit uncertainty never triggers a retry.
use personal_macro_desktop_lib::{
    cloud_postgres::{
        self, CloudError, CloudResult,
        finalize::{safe_stage, validate_identity},
    },
    cloud_public::manifest::{self, MAX_DESCRIPTOR_BYTES, UploadDescriptor},
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
    parse_arguments(std::env::args().skip(1))
}
fn parse_arguments(
    mut args: impl Iterator<Item = String>,
) -> CloudResult<BTreeMap<String, String>> {
    let keys = [
        "--env-file",
        "--schema",
        "--descriptor",
        "--expected-generation",
        "--workspace-id",
    ];
    let flags = ["--apply-migrations", "--migrate-only"];
    let mut result = BTreeMap::new();
    while let Some(key) = args.next() {
        if (!keys.contains(&key.as_str()) && !flags.contains(&key.as_str()))
            || result.contains_key(&key)
        {
            return Err(CloudError::validation(
                "Ungültige Veröffentlichungsargumente.",
            ));
        }
        let value = if flags.contains(&key.as_str()) {
            "true".into()
        } else {
            args.next()
                .ok_or_else(|| CloudError::validation("Ein Veröffentlichungsargument fehlt."))?
        };
        result.insert(key, value);
    }
    if ["--env-file", "--schema"]
        .iter()
        .any(|key| !result.contains_key(*key))
        || (!result.contains_key("--migrate-only")
            && ["--descriptor", "--expected-generation"]
                .iter()
                .any(|key| !result.contains_key(*key)))
    {
        return Err(CloudError::validation(
            "Konfiguration, Schema, Nachweis und erwarteter vorheriger Stand müssen ausdrücklich angegeben werden.",
        ));
    }
    if result.contains_key("--apply-migrations") != result.contains_key("--workspace-id")
        || (result.contains_key("--migrate-only") && !result.contains_key("--apply-migrations"))
        || (result.contains_key("--migrate-only")
            && (result.contains_key("--descriptor")
                || result.contains_key("--expected-generation")))
    {
        return Err(CloudError::validation(
            "Migrationen benötigen --apply-migrations und --workspace-id; --migrate-only darf keine Veröffentlichung enthalten.",
        ));
    }
    Ok(result)
}

fn file(value: &str, outside_repository: bool) -> CloudResult<PathBuf> {
    let path = Path::new(value);
    if !path.is_absolute() {
        return Err(CloudError::validation(
            "Ein absoluter Dateipfad ist erforderlich.",
        ));
    }
    // Reject links in every existing component, including Windows junctions.
    for ancestor in path.ancestors() {
        let metadata = std::fs::symlink_metadata(ancestor).map_err(|_| {
            CloudError::validation("Die ausdrücklich benannte Datei ist nicht lesbar.")
        })?;
        if metadata.file_type().is_symlink() {
            return Err(CloudError::validation(
                "Verknüpfte Dateipfade sind nicht zulässig.",
            ));
        }
    }
    let metadata = std::fs::metadata(path)
        .map_err(|_| CloudError::validation("Die ausdrücklich benannte Datei ist nicht lesbar."))?;
    if !metadata.is_file() {
        return Err(CloudError::validation(
            "Eine reguläre Datei ist erforderlich.",
        ));
    }
    let canonical = path
        .canonicalize()
        .map_err(|_| CloudError::validation("Der Dateipfad kann nicht bestätigt werden."))?;
    if outside_repository {
        let repository = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../..")
            .canonicalize()
            .map_err(|_| {
                CloudError::validation("Die Projektgrenze kann nicht bestätigt werden.")
            })?;
        if canonical.starts_with(repository) {
            return Err(CloudError::validation(
                "Der Veröffentlichungsnachweis muss außerhalb des Repositorys liegen.",
            ));
        }
        if let Some(appdata) = std::env::var_os("APPDATA") {
            let workspace = PathBuf::from(appdata).join("com.personal-macro.app/PersonalMacro");
            if let Ok(workspace) = workspace.canonicalize()
                && canonical.starts_with(&workspace)
                && !canonical.starts_with(workspace.join("backups"))
            {
                return Err(CloudError::validation(
                    "Aktive Arbeitsdateien sind keine Veröffentlichungsnachweise.",
                ));
            }
        }
    }
    Ok(canonical)
}

fn connection_options(path: &Path) -> CloudResult<PgConnectOptions> {
    let entries = dotenvy::from_path_iter(path)
        .map_err(|_| CloudError::validation("Die explizite Konfiguration ist nicht lesbar."))?;
    let mut primary = None;
    let mut alternate = None;
    for entry in entries {
        let (key, value) = entry
            .map_err(|_| CloudError::validation("Die explizite Konfiguration ist ungültig."))?;
        match key.as_str() {
            "DATABASE_URL_UNPOOLED" => primary = Some(value),
            "POSTGRES_URL_NON_POOLING" => alternate = Some(value),
            _ => {}
        }
    }
    let url = primary.or(alternate).ok_or_else(|| {
        CloudError::validation("Eine explizite direkte Datenbankverbindung ist erforderlich.")
    })?;
    Ok(PgConnectOptions::from_str(&url)
        .map_err(|_| CloudError::validation("Die Datenbankkonfiguration ist ungültig."))?
        .ssl_mode(PgSslMode::VerifyFull)
        .disable_statement_logging())
}

async fn run() -> CloudResult<serde_json::Value> {
    let args = arguments()?;
    let schema = &args["--schema"];
    if !safe_stage(schema) {
        return Err(CloudError::validation(
            "Ein expliziter gültiger Workspace-Stagingbereich ist erforderlich.",
        ));
    }
    let migrate_only = args.contains_key("--migrate-only");
    let apply_migrations = args.contains_key("--apply-migrations");
    let expected = match args.get("--expected-generation").map(String::as_str) {
        None if migrate_only => None,
        Some("none") => None,
        Some(value)
            if uuid::Uuid::parse_str(value)
                .is_ok_and(|id| id.get_version_num() == 4 && id.to_string() == value) =>
        {
            Some(value)
        }
        _ => {
            return Err(CloudError::validation(
                "Der erwartete Stand muss ausdrücklich none oder eine kanonische Generation sein.",
            ));
        }
    };
    let descriptor = if migrate_only {
        None
    } else {
        let descriptor_path = file(&args["--descriptor"], true)?;
        let mut bytes = Vec::new();
        std::fs::File::open(descriptor_path)
            .map_err(|_| CloudError::validation("Der Veröffentlichungsnachweis ist nicht lesbar."))?
            .take(MAX_DESCRIPTOR_BYTES as u64 + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| {
                CloudError::validation("Der Veröffentlichungsnachweis ist nicht lesbar.")
            })?;
        Some(UploadDescriptor::parse(&bytes)?)
    };
    if apply_migrations {
        validate_identity(&args["--workspace-id"])?;
    }
    let connection_schema = schema.clone();
    let pool = PgPoolOptions::new()
        .max_connections(1)
        .after_connect(move |connection,_| {
            let schema=connection_schema.clone();
            Box::pin(async move {
                sqlx::query("SELECT set_config('search_path',$1,false),set_config('lock_timeout','10000',false),set_config('statement_timeout','80000',false)")
                    .bind(schema).execute(connection).await?;
                Ok(())
            })
        })
        .connect_with(connection_options(&file(&args["--env-file"], false)?)?)
        .await?;
    let active_schema: Option<String> = sqlx::query_scalar("SELECT current_schema()")
        .fetch_one(&pool)
        .await?;
    if active_schema.as_deref() != Some(schema.as_str()) {
        pool.close().await;
        return Err(CloudError::new(
            "STAGE_MISMATCH",
            "Der ausgewählte Workspacebereich stimmt nicht überein.",
        ));
    }
    if apply_migrations {
        // This is deliberately before sqlx::migrate can create or alter anything.
        // Never initialize identity or reset revision from this CLI.
        let identity: Option<String> =
            sqlx::query_scalar("SELECT identity FROM cloud_workspace WHERE id=1")
                .fetch_optional(&pool)
                .await?;
        if identity.as_deref() != Some(args["--workspace-id"].as_str()) {
            pool.close().await;
            return Err(CloudError::new(
                "WORKSPACE_MISMATCH",
                "Die aktive Workspace-Identität stimmt nicht überein. Es wurden keine Migrationen gestartet.",
            ));
        }
        if let Err(error) = cloud_postgres::initialize(&pool).await {
            pool.close().await;
            return Err(error);
        }
    }
    let Some(descriptor) = descriptor else {
        pool.close().await;
        return Ok(serde_json::json!({"ok":true,"migrationsApplied":true,"published":false}));
    };
    let count = descriptor.manifest.artifacts.len();
    let transfer_bytes: u64 = descriptor
        .transports
        .iter()
        .map(|item| item.transfer_bytes)
        .sum();
    let mut tx = pool.begin().await?;
    match manifest::publish(&mut tx, descriptor, expected).await {
        Err(error) => {
            let rollback = tx.rollback().await;
            pool.close().await;
            rollback?;
            Err(error)
        }
        Ok(_) => {
            let committed = tx.commit().await.is_ok();
            pool.close().await;
            if !committed {
                return Err(CloudError::new(
                    "PUBLIC_CACHE_COMMIT_UNCERTAIN",
                    "Der Veröffentlichungsstatus muss geprüft werden. Daten und Objekte bleiben erhalten; nicht automatisch wiederholen.",
                ));
            }
            Ok(
                serde_json::json!({"ok":true,"migrationsApplied":apply_migrations,"published":true,"artifacts":count,"transferBytes":transfer_bytes}),
            )
        }
    }
}

#[tokio::main]
async fn main() {
    match run().await {
        Ok(result) => println!("{result}"),
        Err(error) => {
            eprintln!(
                "{}",
                serde_json::json!({"ok":false,"code":error.code,"message":error.message})
            );
            std::process::exit(1);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn parse(values: &[&str]) -> CloudResult<BTreeMap<String, String>> {
        parse_arguments(values.iter().map(|value| (*value).into()))
    }
    #[test]
    fn migration_flags_require_explicit_identity_and_never_publish_in_migrate_only() {
        let base = [
            "--env-file",
            "config",
            "--schema",
            "macro_stage_0123456789abcdef0123456789abcdef",
        ];
        let full = [
            base.as_slice(),
            &[
                "--descriptor",
                "descriptor",
                "--expected-generation",
                "none",
            ],
        ]
        .concat();
        let args = parse(&full).unwrap();
        assert!(!args.contains_key("--apply-migrations"));
        for extras in [
            vec!["--migrate-only"],
            vec!["--apply-migrations", "--migrate-only"],
            vec!["--workspace-id", "workspace", "--migrate-only"],
        ] {
            assert!(parse(&[base.as_slice(), extras.as_slice()].concat()).is_err());
        }
        let only = [
            base.as_slice(),
            &[
                "--apply-migrations",
                "--workspace-id",
                "workspace",
                "--migrate-only",
            ],
        ]
        .concat();
        assert!(parse(&only).is_ok());
        assert!(
            parse(
                &[
                    only.as_slice(),
                    &[
                        "--descriptor",
                        "descriptor",
                        "--expected-generation",
                        "none"
                    ]
                ]
                .concat()
            )
            .is_err()
        );
        assert!(
            parse(
                &[
                    full.as_slice(),
                    &["--apply-migrations", "--workspace-id", "workspace"]
                ]
                .concat()
            )
            .is_ok()
        );
        assert!(
            parse(
                &[
                    full.as_slice(),
                    &[
                        "--apply-migrations",
                        "--apply-migrations",
                        "--workspace-id",
                        "workspace"
                    ]
                ]
                .concat()
            )
            .is_err()
        );
    }
}
