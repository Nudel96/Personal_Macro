use std::{
    fs::File,
    io::Read,
    path::{Path, PathBuf},
};

use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::FromRow;
use tauri::State;
use uuid::Uuid;

use crate::{
    database::AppState,
    errors::{AppError, CommandResult},
};

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct MediaRecord {
    pub id: String,
    pub relative_path: String,
    pub thumbnail_relative_path: Option<String>,
    pub original_filename: String,
    pub mime_type: String,
    pub size_bytes: i64,
    pub sha256: String,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub captured_at: Option<String>,
    pub created_at: String,
    pub trade_count: i64,
    #[sqlx(default)]
    pub absolute_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaImportInput {
    pub source_path: String,
    pub trade_id: Option<String>,
    pub slot: Option<String>,
    pub caption: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct MediaAnnotationRecord {
    pub id: String,
    pub media_id: String,
    pub annotation_json: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaAnnotationInput {
    pub media_id: String,
    pub annotation: serde_json::Value,
}

#[tauri::command]
pub async fn list_media(state: State<'_, AppState>) -> CommandResult<Vec<MediaRecord>> {
    let mut rows = sqlx::query_as::<_, MediaRecord>(r#"SELECT mf.id, mf.relative_path, mf.thumbnail_relative_path, mf.original_filename, mf.mime_type, mf.size_bytes,
        mf.sha256, mf.width, mf.height, mf.captured_at, mf.created_at,
        (SELECT COUNT(*) FROM trade_media tm WHERE tm.media_id = mf.id) AS trade_count,
        '' AS absolute_path
        FROM media_files mf ORDER BY mf.created_at DESC"#)
        .fetch_all(&state.db).await.map_err(AppError::from)?;
    for row in &mut rows {
        row.absolute_path = state
            .paths
            .root
            .join(&row.relative_path)
            .to_string_lossy()
            .into_owned();
    }
    Ok(rows)
}

#[tauri::command]
pub async fn list_trade_media(
    state: State<'_, AppState>,
    trade_id: String,
) -> CommandResult<Vec<MediaRecord>> {
    let mut rows = sqlx::query_as::<_, MediaRecord>(r#"SELECT mf.id, mf.relative_path, mf.thumbnail_relative_path, mf.original_filename, mf.mime_type, mf.size_bytes,
        mf.sha256, mf.width, mf.height, mf.captured_at, mf.created_at,
        (SELECT COUNT(*) FROM trade_media linked WHERE linked.media_id = mf.id) AS trade_count, '' AS absolute_path
        FROM media_files mf JOIN trade_media tm ON tm.media_id = mf.id WHERE tm.trade_id = ? ORDER BY tm.sort_order"#)
        .bind(trade_id).fetch_all(&state.db).await.map_err(AppError::from)?;
    for row in &mut rows {
        row.absolute_path = state
            .paths
            .root
            .join(&row.relative_path)
            .to_string_lossy()
            .into_owned();
    }
    Ok(rows)
}

#[tauri::command]
pub async fn attach_trade_media(
    state: State<'_, AppState>,
    trade_id: String,
    media_id: String,
    slot: Option<String>,
    caption: Option<String>,
) -> CommandResult<()> {
    sqlx::query("INSERT OR REPLACE INTO trade_media (trade_id, media_id, slot, caption, sort_order) VALUES (?, ?, ?, ?, COALESCE((SELECT MAX(sort_order) + 1 FROM trade_media WHERE trade_id = ?), 0))")
        .bind(&trade_id).bind(&media_id).bind(slot.unwrap_or_else(|| "other".into())).bind(caption).bind(&trade_id).execute(&state.db).await.map_err(AppError::from)?;
    Ok(())
}

#[tauri::command]
pub async fn detach_trade_media(
    state: State<'_, AppState>,
    trade_id: String,
    media_id: String,
) -> CommandResult<()> {
    sqlx::query("DELETE FROM trade_media WHERE trade_id = ? AND media_id = ?")
        .bind(trade_id)
        .bind(media_id)
        .execute(&state.db)
        .await
        .map_err(AppError::from)?;
    Ok(())
}

#[tauri::command]
pub async fn import_media_file(
    state: State<'_, AppState>,
    input: MediaImportInput,
) -> CommandResult<MediaRecord> {
    let source = PathBuf::from(&input.source_path);
    let canonical = source
        .canonicalize()
        .map_err(|_| AppError::Validation("Ausgewählte Datei wurde nicht gefunden.".into()))?;
    if !canonical.is_file() {
        return Err(crate::errors::CommandError::validation(
            "Auswahl ist keine Datei.",
        ));
    }
    let metadata = canonical.metadata().map_err(AppError::from)?;
    const MAX_MEDIA_SIZE: u64 = 50 * 1024 * 1024;
    if metadata.len() > MAX_MEDIA_SIZE {
        return Err(crate::errors::CommandError::validation(
            "Datei ist größer als 50 MB.",
        ));
    }
    let mut file = File::open(&canonical).map_err(AppError::from)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let count = file.read(&mut buffer).map_err(AppError::from)?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    let sha256: String = hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect();
    let extension = canonical
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("bin")
        .to_lowercase();
    let relative = Path::new("media")
        .join("trades")
        .join(format!("{sha256}.{extension}"));
    let destination = state.paths.root.join(&relative);
    if !destination.exists() {
        std::fs::copy(&canonical, &destination).map_err(AppError::from)?;
    }
    let existing: Option<String> =
        sqlx::query_scalar("SELECT id FROM media_files WHERE sha256 = ? LIMIT 1")
            .bind(&sha256)
            .fetch_optional(&state.db)
            .await
            .map_err(AppError::from)?;
    let id = existing.unwrap_or_else(|| Uuid::new_v4().to_string());
    let now = Utc::now().to_rfc3339();
    let original_filename = canonical
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("Datei")
        .to_string();
    let mime = mime_guess::from_path(&canonical)
        .first_or_octet_stream()
        .to_string();
    sqlx::query("INSERT OR IGNORE INTO media_files (id, relative_path, original_filename, mime_type, size_bytes, sha256, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(&id).bind(relative.to_string_lossy().replace('\\', "/")).bind(&original_filename).bind(&mime)
        .bind(metadata.len() as i64).bind(&sha256).bind(&now).execute(&state.db).await.map_err(AppError::from)?;
    if let Some(trade_id) = &input.trade_id {
        sqlx::query("INSERT OR REPLACE INTO trade_media (trade_id, media_id, slot, caption, sort_order) VALUES (?, ?, ?, ?, COALESCE((SELECT MAX(sort_order)+1 FROM trade_media WHERE trade_id = ?), 0))")
            .bind(trade_id).bind(&id).bind(input.slot.as_deref().unwrap_or("other")).bind(&input.caption).bind(trade_id)
            .execute(&state.db).await.map_err(AppError::from)?;
    }
    let mut record = sqlx::query_as::<_, MediaRecord>(r#"SELECT mf.id, mf.relative_path, mf.thumbnail_relative_path, mf.original_filename, mf.mime_type, mf.size_bytes,
        mf.sha256, mf.width, mf.height, mf.captured_at, mf.created_at, (SELECT COUNT(*) FROM trade_media tm WHERE tm.media_id = mf.id) AS trade_count, '' AS absolute_path
        FROM media_files mf WHERE mf.id = ?"#).bind(id).fetch_one(&state.db).await.map_err(AppError::from)?;
    record.absolute_path = destination.to_string_lossy().into_owned();
    Ok(record)
}

#[tauri::command]
pub async fn get_media_annotation(
    state: State<'_, AppState>,
    media_id: String,
) -> CommandResult<Option<MediaAnnotationRecord>> {
    sqlx::query_as::<_, MediaAnnotationRecord>(
        "SELECT id, media_id, annotation_json, created_at, updated_at FROM media_annotations WHERE media_id = ? ORDER BY updated_at DESC LIMIT 1",
    )
    .bind(media_id)
    .fetch_optional(&state.db)
    .await
    .map_err(AppError::from)
    .map_err(Into::into)
}

#[tauri::command]
pub async fn save_media_annotation(
    state: State<'_, AppState>,
    input: MediaAnnotationInput,
) -> CommandResult<MediaAnnotationRecord> {
    let now = Utc::now().to_rfc3339();
    let existing: Option<String> = sqlx::query_scalar(
        "SELECT id FROM media_annotations WHERE media_id = ? ORDER BY updated_at DESC LIMIT 1",
    )
    .bind(&input.media_id)
    .fetch_optional(&state.db)
    .await
    .map_err(AppError::from)?;
    let id = existing.unwrap_or_else(|| Uuid::new_v4().to_string());
    sqlx::query("INSERT INTO media_annotations (id, media_id, annotation_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET annotation_json=excluded.annotation_json, updated_at=excluded.updated_at")
        .bind(&id).bind(&input.media_id).bind(input.annotation.to_string()).bind(&now).bind(&now)
        .execute(&state.db).await.map_err(AppError::from)?;
    sqlx::query_as::<_, MediaAnnotationRecord>("SELECT id, media_id, annotation_json, created_at, updated_at FROM media_annotations WHERE id = ?")
        .bind(id).fetch_one(&state.db).await.map_err(AppError::from).map_err(Into::into)
}
