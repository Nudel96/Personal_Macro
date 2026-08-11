use std::{
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
};

use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::FromRow;
use tauri::State;
use uuid::Uuid;
use walkdir::WalkDir;
use zip::{CompressionMethod, ZipArchive, ZipWriter, write::SimpleFileOptions};

use crate::{
    database::AppState,
    errors::{AppError, CommandResult},
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub path: String,
    pub format: String,
    pub record_count: usize,
    pub sha256: String,
}

#[derive(Debug, FromRow, Serialize)]
struct ExportTrade {
    id: String,
    status: String,
    instrument: String,
    asset_class: String,
    direction: String,
    opened_at: Option<String>,
    closed_at: Option<String>,
    actual_entry: Option<String>,
    initial_stop_loss: Option<String>,
    actual_exit: Option<String>,
    quantity: Option<String>,
    net_pnl_minor: Option<i64>,
    calculated_r: Option<String>,
    process_score: Option<i64>,
    followed_plan: Option<bool>,
    thesis_html: Option<String>,
    review_notes_html: Option<String>,
}

#[tauri::command]
pub async fn export_trades(
    state: State<'_, AppState>,
    format: String,
) -> CommandResult<ExportResult> {
    let trades = sqlx::query_as::<_, ExportTrade>(r#"SELECT id, status, instrument, asset_class, direction, opened_at, closed_at, actual_entry,
        initial_stop_loss, actual_exit, quantity, net_pnl_minor, calculated_r, process_score, followed_plan, thesis_html, review_notes_html
        FROM trades WHERE is_deleted = 0 ORDER BY COALESCE(closed_at, opened_at, created_at)"#)
        .fetch_all(&state.db).await.map_err(AppError::from)?;
    let stamp = Utc::now().format("%Y%m%d-%H%M%S");
    let (path, normalized_format) = match format.as_str() {
        "json" => {
            let path = state.paths.exports.join(format!("trades-{stamp}.json"));
            let payload = serde_json::to_vec_pretty(&trades)
                .map_err(|error| AppError::DataTransfer(error.to_string()))?;
            std::fs::write(&path, payload).map_err(AppError::from)?;
            (path, "json")
        }
        _ => {
            let path = state.paths.exports.join(format!("trades-{stamp}.csv"));
            let mut writer = csv::WriterBuilder::new()
                .delimiter(b';')
                .from_path(&path)
                .map_err(|error| AppError::DataTransfer(error.to_string()))?;
            for trade in &trades {
                writer
                    .serialize(trade)
                    .map_err(|error| AppError::DataTransfer(error.to_string()))?;
            }
            writer.flush().map_err(AppError::from)?;
            (path, "csv")
        }
    };
    let sha256 = sha_file(&path)?;
    let now = Utc::now().to_rfc3339();
    sqlx::query("INSERT INTO export_runs (id, export_type, format, relative_path, record_count, sha256, created_at) VALUES (?, 'trades', ?, ?, ?, ?, ?)")
        .bind(Uuid::new_v4().to_string()).bind(normalized_format).bind(path.strip_prefix(&state.paths.root).unwrap_or(&path).to_string_lossy().replace('\\', "/"))
        .bind(trades.len() as i64).bind(&sha256).bind(now).execute(&state.db).await.map_err(AppError::from)?;
    Ok(ExportResult {
        path: path.to_string_lossy().into_owned(),
        format: normalized_format.into(),
        record_count: trades.len(),
        sha256,
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupRecord {
    pub path: String,
    pub filename: String,
    pub size_bytes: u64,
    pub sha256: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupManifest {
    version: u32,
    created_at: String,
    app_version: String,
    database_file: String,
    files: Vec<ManifestFile>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManifestFile {
    path: String,
    size_bytes: u64,
    sha256: String,
}

#[tauri::command]
pub async fn create_backup(state: State<'_, AppState>) -> CommandResult<BackupRecord> {
    create_backup_for_state(&state).await.map_err(Into::into)
}

pub async fn create_backup_for_state(state: &AppState) -> Result<BackupRecord, AppError> {
    sqlx::query("PRAGMA wal_checkpoint(FULL)")
        .fetch_all(&state.db)
        .await
        .map_err(AppError::from)?;
    let created_at = Utc::now().to_rfc3339();
    let stamp = Utc::now().format("%Y%m%d-%H%M%S");
    let path = state
        .paths
        .backups
        .join(format!("personal-macro-{stamp}.zip"));
    let mut files = vec![state.paths.database.clone()];
    if state.paths.media.exists() {
        files.extend(
            WalkDir::new(&state.paths.media)
                .into_iter()
                .filter_map(Result::ok)
                .filter(|entry| entry.file_type().is_file())
                .map(|entry| entry.into_path()),
        );
    }
    let manifest_files: Vec<ManifestFile> = files
        .iter()
        .map(|file| {
            let relative = file
                .strip_prefix(&state.paths.root)
                .unwrap_or(file)
                .to_string_lossy()
                .replace('\\', "/");
            Ok(ManifestFile {
                path: relative,
                size_bytes: file.metadata()?.len(),
                sha256: sha_file(file)?,
            })
        })
        .collect::<Result<_, AppError>>()?;
    let manifest = BackupManifest {
        version: 1,
        created_at: created_at.clone(),
        app_version: env!("CARGO_PKG_VERSION").into(),
        database_file: "database/journal.sqlite".into(),
        files: manifest_files,
    };
    let output = File::create(&path).map_err(AppError::from)?;
    let mut zip = ZipWriter::new(output);
    let options = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o600);
    for file in &files {
        let name = file
            .strip_prefix(&state.paths.root)
            .unwrap_or(file)
            .to_string_lossy()
            .replace('\\', "/");
        zip.start_file(&name, options)
            .map_err(|error| AppError::DataTransfer(error.to_string()))?;
        let mut input = File::open(file).map_err(AppError::from)?;
        std::io::copy(&mut input, &mut zip).map_err(AppError::from)?;
    }
    zip.start_file("manifest.json", options)
        .map_err(|error| AppError::DataTransfer(error.to_string()))?;
    zip.write_all(
        &serde_json::to_vec_pretty(&manifest)
            .map_err(|error| AppError::DataTransfer(error.to_string()))?,
    )
    .map_err(AppError::from)?;
    zip.finish()
        .map_err(|error| AppError::DataTransfer(error.to_string()))?;
    backup_record(&path, created_at)
}

pub async fn maybe_automatic_backup(state: &AppState) -> Result<(), AppError> {
    let raw: Option<String> =
        sqlx::query_scalar("SELECT value_json FROM app_settings WHERE key = 'backup'")
            .fetch_optional(&state.db)
            .await?;
    let value: serde_json::Value = raw
        .as_deref()
        .and_then(|raw| serde_json::from_str(raw).ok())
        .unwrap_or_else(|| serde_json::json!({ "automatic": true, "retention": 10 }));
    if !value
        .get("automatic")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(true)
    {
        return Ok(());
    }
    let retention = value
        .get("retention")
        .and_then(serde_json::Value::as_u64)
        .unwrap_or(10)
        .clamp(1, 100) as usize;
    let newest = std::fs::read_dir(&state.paths.backups)?
        .filter_map(Result::ok)
        .filter_map(|entry| entry.metadata().ok()?.modified().ok())
        .max();
    let due = newest
        .and_then(|modified| modified.elapsed().ok())
        .map(|age| age.as_secs() >= 24 * 60 * 60)
        .unwrap_or(true);
    if due {
        create_backup_for_state(state).await?;
    }
    let mut backups: Vec<_> = std::fs::read_dir(&state.paths.backups)?
        .filter_map(Result::ok)
        .filter(|entry| entry.path().extension().and_then(|value| value.to_str()) == Some("zip"))
        .collect();
    backups.sort_by_key(|entry| {
        std::cmp::Reverse(entry.metadata().and_then(|meta| meta.modified()).ok())
    });
    for entry in backups.into_iter().skip(retention) {
        let path = entry.path();
        if path.parent() == Some(state.paths.backups.as_path()) {
            std::fs::remove_file(path)?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn list_backups(state: State<'_, AppState>) -> CommandResult<Vec<BackupRecord>> {
    let mut rows = Vec::new();
    for entry in std::fs::read_dir(&state.paths.backups).map_err(AppError::from)? {
        let entry = entry.map_err(AppError::from)?;
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("zip") {
            continue;
        }
        let created = entry
            .metadata()
            .map_err(AppError::from)?
            .modified()
            .ok()
            .map(chrono::DateTime::<Utc>::from)
            .unwrap_or_else(Utc::now)
            .to_rfc3339();
        rows.push(backup_record(&path, created)?);
    }
    rows.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(rows)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestorePreview {
    pub valid: bool,
    pub created_at: Option<String>,
    pub app_version: Option<String>,
    pub file_count: usize,
    pub total_size_bytes: u64,
    pub issues: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreStageResult {
    pub staged: bool,
    pub restart_required: bool,
    pub safety_copy_path: String,
    pub file_count: usize,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PendingRestore {
    staging_root: String,
    staged_at: String,
    source_backup: String,
}

#[tauri::command]
pub async fn preview_backup(path: String) -> CommandResult<RestorePreview> {
    let archive_path = PathBuf::from(path);
    let file = File::open(&archive_path).map_err(AppError::from)?;
    let mut archive =
        ZipArchive::new(file).map_err(|error| AppError::DataTransfer(error.to_string()))?;
    let mut issues = Vec::new();
    let mut manifest_json = String::new();
    match archive.by_name("manifest.json") {
        Ok(mut entry) => {
            entry
                .read_to_string(&mut manifest_json)
                .map_err(AppError::from)?;
        }
        Err(_) => issues.push("manifest.json fehlt".into()),
    }
    let manifest: Option<BackupManifest> = serde_json::from_str(&manifest_json).ok();
    if manifest.is_none() && !manifest_json.is_empty() {
        issues.push("Manifest ist ungültig".into());
    }
    if manifest
        .as_ref()
        .is_none_or(|value| value.database_file != "database/journal.sqlite")
    {
        issues.push("Datenbankdatei fehlt im Manifest".into());
    }
    Ok(RestorePreview {
        valid: issues.is_empty(),
        created_at: manifest.as_ref().map(|value| value.created_at.clone()),
        app_version: manifest.as_ref().map(|value| value.app_version.clone()),
        file_count: manifest
            .as_ref()
            .map(|value| value.files.len())
            .unwrap_or(0),
        total_size_bytes: manifest
            .as_ref()
            .map(|value| value.files.iter().map(|file| file.size_bytes).sum())
            .unwrap_or(0),
        issues,
    })
}

#[tauri::command]
pub async fn stage_backup_restore(
    state: State<'_, AppState>,
    path: String,
) -> CommandResult<RestoreStageResult> {
    let archive_path = PathBuf::from(&path);
    let file = File::open(&archive_path).map_err(AppError::from)?;
    let mut archive =
        ZipArchive::new(file).map_err(|error| AppError::DataTransfer(error.to_string()))?;
    let mut manifest_json = String::new();
    archive
        .by_name("manifest.json")
        .map_err(|_| AppError::DataTransfer("manifest.json fehlt".into()))?
        .read_to_string(&mut manifest_json)
        .map_err(AppError::from)?;
    let manifest: BackupManifest = serde_json::from_str(&manifest_json)
        .map_err(|error| AppError::DataTransfer(format!("Manifest ist ungültig: {error}")))?;
    if manifest.version != 1 || manifest.database_file != "database/journal.sqlite" {
        return Err(AppError::DataTransfer(
            "Backup-Version oder Datenbankpfad wird nicht unterstützt.".into(),
        )
        .into());
    }

    let restore_root = state.paths.root.join("restore-staging");
    fs::create_dir_all(&restore_root).map_err(AppError::from)?;
    let staging = restore_root.join(Uuid::new_v4().to_string());
    fs::create_dir_all(&staging).map_err(AppError::from)?;
    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| AppError::DataTransfer(error.to_string()))?;
        let enclosed = entry
            .enclosed_name()
            .ok_or_else(|| AppError::DataTransfer("Unsicherer Pfad im Backup erkannt.".into()))?
            .to_path_buf();
        if enclosed == Path::new("manifest.json") || entry.is_dir() {
            continue;
        }
        let target = staging.join(&enclosed);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(AppError::from)?;
        }
        let mut output = File::create(&target).map_err(AppError::from)?;
        std::io::copy(&mut entry, &mut output).map_err(AppError::from)?;
    }
    for expected in &manifest.files {
        let relative = Path::new(&expected.path);
        if relative.is_absolute()
            || relative
                .components()
                .any(|component| !matches!(component, std::path::Component::Normal(_)))
        {
            return Err(AppError::DataTransfer("Unsicherer Manifestpfad erkannt.".into()).into());
        }
        let extracted = staging.join(relative);
        let metadata = extracted.metadata().map_err(AppError::from)?;
        if metadata.len() != expected.size_bytes || sha_file(&extracted)? != expected.sha256 {
            return Err(AppError::DataTransfer(format!(
                "Prüfsumme oder Größe stimmt nicht: {}",
                expected.path
            ))
            .into());
        }
    }
    let staged_database = staging.join(&manifest.database_file);
    let mut header = [0_u8; 16];
    File::open(&staged_database)
        .and_then(|mut file| file.read_exact(&mut header))
        .map_err(AppError::from)?;
    if &header != b"SQLite format 3\0" {
        return Err(AppError::DataTransfer(
            "Die enthaltene Datenbank ist keine gültige SQLite-Datei.".into(),
        )
        .into());
    }

    sqlx::query("PRAGMA wal_checkpoint(FULL)")
        .execute(&state.db)
        .await
        .map_err(AppError::from)?;
    let safety_copy = state.paths.backups.join(format!(
        "pre-restore-{}.sqlite",
        Utc::now().format("%Y%m%d-%H%M%S")
    ));
    fs::copy(&state.paths.database, &safety_copy).map_err(AppError::from)?;
    let pending = PendingRestore {
        staging_root: staging.to_string_lossy().into_owned(),
        staged_at: Utc::now().to_rfc3339(),
        source_backup: archive_path.to_string_lossy().into_owned(),
    };
    fs::write(
        state.paths.settings.join("pending-restore.json"),
        serde_json::to_vec_pretty(&pending)
            .map_err(|error| AppError::DataTransfer(error.to_string()))?,
    )
    .map_err(AppError::from)?;
    Ok(RestoreStageResult {
        staged: true,
        restart_required: true,
        safety_copy_path: safety_copy.to_string_lossy().into_owned(),
        file_count: manifest.files.len(),
    })
}

fn backup_record(path: &Path, created_at: String) -> Result<BackupRecord, AppError> {
    Ok(BackupRecord {
        path: path.to_string_lossy().into_owned(),
        filename: path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("backup.zip")
            .into(),
        size_bytes: path.metadata()?.len(),
        sha256: sha_file(path)?,
        created_at,
    })
}

fn sha_file(path: &Path) -> Result<String, AppError> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let count = file.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    Ok(hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}
