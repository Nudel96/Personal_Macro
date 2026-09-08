use std::{
    fs::File,
    io::Read,
    path::{Path, PathBuf},
};

use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{FromRow, SqlitePool};
use tauri::State;
use uuid::Uuid;

use crate::{
    commands::journal_scope::require_trade_in_account,
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
    account_id: String,
    trade_id: String,
) -> CommandResult<Vec<MediaRecord>> {
    list_trade_media_for_pool(&state.db, &state.paths.root, &account_id, &trade_id).await
}

pub(crate) async fn list_trade_media_for_pool(
    db: &SqlitePool,
    root: &Path,
    account_id: &str,
    trade_id: &str,
) -> CommandResult<Vec<MediaRecord>> {
    require_trade_in_account(db, account_id, trade_id).await?;
    let mut rows = sqlx::query_as::<_, MediaRecord>(r#"SELECT mf.id, mf.relative_path, mf.thumbnail_relative_path, mf.original_filename, mf.mime_type, mf.size_bytes,
        mf.sha256, mf.width, mf.height, mf.captured_at, mf.created_at,
        (SELECT COUNT(*) FROM trade_media linked WHERE linked.media_id = mf.id) AS trade_count, '' AS absolute_path
        FROM media_files mf JOIN trade_media tm ON tm.media_id = mf.id WHERE tm.trade_id = ? ORDER BY tm.sort_order"#)
        .bind(trade_id.trim()).fetch_all(db).await.map_err(AppError::from)?;
    for row in &mut rows {
        row.absolute_path = root.join(&row.relative_path).to_string_lossy().into_owned();
    }
    Ok(rows)
}

#[tauri::command]
pub async fn attach_trade_media(
    state: State<'_, AppState>,
    account_id: String,
    trade_id: String,
    media_id: String,
    slot: Option<String>,
    caption: Option<String>,
) -> CommandResult<()> {
    attach_trade_media_for_pool(&state.db, &account_id, &trade_id, &media_id, slot, caption).await
}

pub(crate) async fn attach_trade_media_for_pool(
    db: &SqlitePool,
    account_id: &str,
    trade_id: &str,
    media_id: &str,
    slot: Option<String>,
    caption: Option<String>,
) -> CommandResult<()> {
    require_trade_in_account(db, account_id, trade_id).await?;
    let trade_id = trade_id.trim();
    let result = sqlx::query("INSERT INTO trade_media (trade_id, media_id, slot, caption, sort_order) SELECT ?, ?, ?, ?, COALESCE((SELECT MAX(sort_order) + 1 FROM trade_media WHERE trade_id = ?), 0) FROM trades WHERE id = ? AND account_id = ? AND is_deleted = 0 ON CONFLICT(trade_id, media_id) DO UPDATE SET slot=excluded.slot, caption=excluded.caption")
        .bind(trade_id).bind(media_id).bind(slot.unwrap_or_else(|| "other".into())).bind(caption).bind(trade_id)
        .bind(trade_id).bind(account_id.trim()).execute(db).await.map_err(AppError::from)?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Trade".into()).into());
    }
    Ok(())
}

#[tauri::command]
pub async fn detach_trade_media(
    state: State<'_, AppState>,
    account_id: String,
    trade_id: String,
    media_id: String,
) -> CommandResult<()> {
    detach_trade_media_for_pool(&state.db, &account_id, &trade_id, &media_id).await
}

pub(crate) async fn detach_trade_media_for_pool(
    db: &SqlitePool,
    account_id: &str,
    trade_id: &str,
    media_id: &str,
) -> CommandResult<()> {
    require_trade_in_account(db, account_id, trade_id).await?;
    sqlx::query("DELETE FROM trade_media WHERE trade_id = ? AND media_id = ? AND EXISTS (SELECT 1 FROM trades WHERE id = ? AND account_id = ? AND is_deleted = 0)")
        .bind(trade_id.trim())
        .bind(media_id)
        .bind(trade_id.trim())
        .bind(account_id.trim())
        .execute(db)
        .await
        .map_err(AppError::from)?;
    Ok(())
}

#[tauri::command]
pub async fn import_media_file(
    state: State<'_, AppState>,
    account_id: Option<String>,
    input: MediaImportInput,
) -> CommandResult<MediaRecord> {
    import_media_file_for_pool(&state.db, &state.paths.root, account_id.as_deref(), input).await
}

pub(crate) async fn import_media_file_for_pool(
    db: &SqlitePool,
    root: &Path,
    account_id: Option<&str>,
    input: MediaImportInput,
) -> CommandResult<MediaRecord> {
    if let Some(trade_id) = input.trade_id.as_deref() {
        require_trade_in_account(db, account_id.unwrap_or_default(), trade_id).await?;
    }
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
    let destination = root.join(&relative);
    if !destination.exists() {
        std::fs::copy(&canonical, &destination).map_err(AppError::from)?;
    }
    let existing: Option<String> =
        sqlx::query_scalar("SELECT id FROM media_files WHERE sha256 = ? LIMIT 1")
            .bind(&sha256)
            .fetch_optional(db)
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
        .bind(metadata.len() as i64).bind(&sha256).bind(&now).execute(db).await.map_err(AppError::from)?;
    if let Some(trade_id) = &input.trade_id {
        attach_trade_media_for_pool(
            db,
            account_id.unwrap_or_default(),
            trade_id,
            &id,
            input.slot,
            input.caption,
        )
        .await?;
    }
    let mut record = sqlx::query_as::<_, MediaRecord>(r#"SELECT mf.id, mf.relative_path, mf.thumbnail_relative_path, mf.original_filename, mf.mime_type, mf.size_bytes,
        mf.sha256, mf.width, mf.height, mf.captured_at, mf.created_at, (SELECT COUNT(*) FROM trade_media tm WHERE tm.media_id = mf.id) AS trade_count, '' AS absolute_path
        FROM media_files mf WHERE mf.id = ?"#).bind(id).fetch_one(db).await.map_err(AppError::from)?;
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

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
    use std::str::FromStr;

    async fn trade_media_database() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(
                SqliteConnectOptions::from_str("sqlite::memory:")
                    .unwrap()
                    .foreign_keys(true),
            )
            .await
            .unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        let now = "2026-08-01T00:00:00Z";
        for id in ["account-a", "account-b"] {
            sqlx::query(
                "INSERT INTO accounts (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
            )
            .bind(id)
            .bind(id)
            .bind(now)
            .bind(now)
            .execute(&pool)
            .await
            .unwrap();
        }
        for (trade_id, account_id) in [("trade-a", "account-a"), ("trade-b", "account-b")] {
            sqlx::query("INSERT INTO trades (id, account_id, status, instrument, asset_class, direction, display_timezone, created_at, updated_at) VALUES (?, ?, 'closed', 'EURUSD', 'forex', 'long', 'Europe/Berlin', ?, ?)")
                .bind(trade_id)
                .bind(account_id)
                .bind(now)
                .bind(now)
                .execute(&pool)
                .await
                .unwrap();
        }
        for (id, path, sha) in [
            ("media-b", "media/trades/b.png", "sha-b"),
            ("media-other", "media/trades/other.png", "sha-other"),
        ] {
            sqlx::query("INSERT INTO media_files (id, relative_path, original_filename, mime_type, size_bytes, sha256, created_at) VALUES (?, ?, ?, 'image/png', 3, ?, ?)")
                .bind(id)
                .bind(path)
                .bind(format!("{id}.png"))
                .bind(sha)
                .bind(now)
                .execute(&pool)
                .await
                .unwrap();
        }
        sqlx::query("INSERT INTO trade_media (trade_id, media_id, slot, caption, sort_order) VALUES ('trade-b', 'media-b', 'entry', 'original', 0)")
            .execute(&pool)
            .await
            .unwrap();
        pool
    }

    async fn media_snapshot(pool: &SqlitePool) -> (i64, i64, Option<String>) {
        sqlx::query_as(
            r#"SELECT
                (SELECT COUNT(*) FROM media_files),
                (SELECT COUNT(*) FROM trade_media),
                (SELECT caption FROM trade_media WHERE trade_id = 'trade-b' AND media_id = 'media-b')"#,
        )
        .fetch_one(pool)
        .await
        .unwrap()
    }

    #[tokio::test]
    async fn trade_child_account_scope_blocks_foreign_media_links_and_import_preflight() {
        let pool = trade_media_database().await;
        let temp = tempfile::tempdir().unwrap();
        let media_directory = temp.path().join("media").join("trades");
        std::fs::create_dir_all(&media_directory).unwrap();
        let source = temp.path().join("source.png");
        std::fs::write(&source, b"new media content").unwrap();
        let before = media_snapshot(&pool).await;

        let list_error = list_trade_media_for_pool(&pool, temp.path(), "account-a", "trade-b")
            .await
            .unwrap_err();
        assert_eq!(list_error.code, "NOT_FOUND");

        let attach_error = attach_trade_media_for_pool(
            &pool,
            "account-a",
            "trade-b",
            "media-other",
            Some("exit".into()),
            Some("foreign".into()),
        )
        .await
        .unwrap_err();
        assert_eq!(attach_error.code, "NOT_FOUND");

        let detach_error = detach_trade_media_for_pool(&pool, "account-a", "trade-b", "media-b")
            .await
            .unwrap_err();
        assert_eq!(detach_error.code, "NOT_FOUND");

        let import_error = import_media_file_for_pool(
            &pool,
            temp.path(),
            Some("account-a"),
            MediaImportInput {
                source_path: source.to_string_lossy().into_owned(),
                trade_id: Some("trade-b".into()),
                slot: Some("entry".into()),
                caption: Some("foreign import".into()),
            },
        )
        .await
        .unwrap_err();
        assert_eq!(import_error.code, "NOT_FOUND");
        assert_eq!(media_snapshot(&pool).await, before);
        assert_eq!(std::fs::read_dir(&media_directory).unwrap().count(), 0);

        let global = import_media_file_for_pool(
            &pool,
            temp.path(),
            None,
            MediaImportInput {
                source_path: source.to_string_lossy().into_owned(),
                trade_id: None,
                slot: None,
                caption: None,
            },
        )
        .await
        .unwrap();
        assert_eq!(global.trade_count, 0);
        assert_eq!(media_snapshot(&pool).await.0, before.0 + 1);

        let owned = list_trade_media_for_pool(&pool, temp.path(), "account-b", "trade-b")
            .await
            .unwrap();
        assert_eq!(owned.len(), 1);
        assert_eq!(owned[0].id, "media-b");

        attach_trade_media_for_pool(
            &pool,
            "account-b",
            "trade-b",
            "media-other",
            Some("exit".into()),
            Some("owned".into()),
        )
        .await
        .unwrap();
        assert_eq!(
            list_trade_media_for_pool(&pool, temp.path(), "account-b", "trade-b")
                .await
                .unwrap()
                .len(),
            2
        );
        detach_trade_media_for_pool(&pool, "account-b", "trade-b", "media-other")
            .await
            .unwrap();
        assert_eq!(
            list_trade_media_for_pool(&pool, temp.path(), "account-b", "trade-b")
                .await
                .unwrap()
                .len(),
            1
        );

        let associated = import_media_file_for_pool(
            &pool,
            temp.path(),
            Some("account-b"),
            MediaImportInput {
                source_path: source.to_string_lossy().into_owned(),
                trade_id: Some("trade-b".into()),
                slot: Some("entry".into()),
                caption: Some("owned import".into()),
            },
        )
        .await
        .unwrap();
        assert_eq!(associated.id, global.id);
        assert_eq!(associated.trade_count, 1);
    }
}
