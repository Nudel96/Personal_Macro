//! Personal Atlas notebook writes share the gateway's revision/receipt transaction.
use super::{
    CloudError, CloudResult,
    common::{argument, encoded},
};
use crate::world_atlas::notebook::{
    self, CreateEntry, Entry, EntrySummary, SavedContext, UpdateEntry,
};
use base64::{Engine, engine::general_purpose::STANDARD};
use chrono::Utc;
use serde_json::Value;
use sqlx::PgConnection;
use uuid::Uuid;

pub(super) const COMMANDS: &[(&str, bool)] = &[
    ("list_atlas_notebook", false),
    ("get_atlas_notebook_entry", false),
    ("create_atlas_notebook_entry", true),
    ("update_atlas_notebook_entry", true),
    ("trash_atlas_notebook_entry", true),
    ("get_atlas_last_context", false),
    ("save_atlas_last_context", true),
];
fn checked<T>(result: crate::errors::CommandResult<T>) -> CloudResult<T> {
    result.map_err(|error| CloudError::new(error.code, error.message))
}
fn keys(value: &Value, allowed: &[&str]) -> CloudResult<()> {
    let obj = value
        .as_object()
        .ok_or_else(|| CloudError::validation("Ungültige Atlas-Eingabe."))?;
    if obj.keys().any(|key| !allowed.contains(&key.as_str())) {
        return Err(CloudError::validation("Unbekannte Atlas-Eingabe."));
    }
    Ok(())
}
fn id(value: &str) -> CloudResult<()> {
    if value.is_empty() || value.len() > 256 || value.chars().any(char::is_control) {
        return Err(CloudError::validation("Ungültige Atlas-Kennung."));
    }
    Ok(())
}
const SUMMARY: &str = "id,title,substr(note,1,160) AS note_preview,favorite,context_label,snapshot_png IS NOT NULL AS has_image,captured_at,created_at,updated_at,revision,trashed_at";

pub(super) async fn dispatch(
    db: &mut PgConnection,
    name: &str,
    args: &Value,
) -> CloudResult<Value> {
    match name {
        "list_atlas_notebook" => {
            keys(args, &["trashed"])?;
            encoded(list(db, argument(args, "trashed")?).await?)
        }
        "get_atlas_notebook_entry" => {
            keys(args, &["id"])?;
            encoded(get(db, &argument::<String>(args, "id")?).await?)
        }
        "create_atlas_notebook_entry" => {
            keys(args, &["input"])?;
            encoded(create(db, argument(args, "input")?).await?)
        }
        "update_atlas_notebook_entry" => {
            keys(args, &["input"])?;
            encoded(update(db, argument(args, "input")?).await?)
        }
        "trash_atlas_notebook_entry" => {
            keys(args, &["id", "revision", "trashed"])?;
            encoded(
                trash(
                    db,
                    &argument::<String>(args, "id")?,
                    argument(args, "revision")?,
                    argument(args, "trashed")?,
                )
                .await?,
            )
        }
        "get_atlas_last_context" => {
            keys(args, &[])?;
            encoded(last_context(db).await?)
        }
        "save_atlas_last_context" => {
            keys(args, &["context"])?;
            save_last_context(db, argument(args, "context")?).await?;
            Ok(Value::Null)
        }
        _ => Err(CloudError::new(
            "WEB_COMMAND_NOT_ALLOWED",
            "Diese Atlasfunktion ist nicht freigegeben.",
        )),
    }
}
async fn list(db: &mut PgConnection, trashed: bool) -> CloudResult<Vec<EntrySummary>> {
    Ok(sqlx::query_as(&format!("SELECT {SUMMARY} FROM atlas_notebook_entries WHERE (trashed_at IS NOT NULL)=$1 ORDER BY favorite DESC,updated_at DESC,id ASC"))
        .bind(trashed).fetch_all(&mut *db).await?)
}
async fn get(db: &mut PgConnection, value: &str) -> CloudResult<Entry> {
    id(value)?;
    let summary: EntrySummary = sqlx::query_as(&format!(
        "SELECT {SUMMARY} FROM atlas_notebook_entries WHERE id=$1"
    ))
    .bind(value)
    .fetch_optional(&mut *db)
    .await?
    .ok_or_else(|| CloudError::new("NOT_FOUND", "Die Atlasansicht wurde nicht gefunden."))?;
    let (note,context,sources,image,hash):(String,String,String,Option<Vec<u8>>,Option<String>)=sqlx::query_as(
        "SELECT note,context_json,sources_json,snapshot_png,snapshot_sha256 FROM atlas_notebook_entries WHERE id=$1")
        .bind(value).fetch_one(&mut *db).await?;
    let valid = image.as_ref().map(|bytes| notebook::image_hash(bytes)) == hash;
    let snapshot_status = if !valid {
        "unreadable"
    } else if image.is_some() {
        "available"
    } else {
        "not_captured"
    }
    .into();
    Ok(Entry {
        summary,
        note,
        context: serde_json::from_str(&context)?,
        sources: serde_json::from_str(&sources)?,
        snapshot_status,
        snapshot_data_url: image
            .filter(|_| valid)
            .map(|bytes| format!("data:image/png;base64,{}", STANDARD.encode(bytes))),
    })
}
const MAX_CLOUD_IMAGE_BYTES: usize = 1024 * 1024;
fn decode_cloud_snapshot(input: Option<&str>) -> CloudResult<Option<Vec<u8>>> {
    if input.is_some_and(|value| value.len() > MAX_CLOUD_IMAGE_BYTES.div_ceil(3) * 4) {
        return Err(CloudError::validation(
            "Der Bildstand darf im privaten Webzugriff höchstens 1 MB groß sein. Bitte weniger Diagramme auswählen.",
        ));
    }
    let image = checked(notebook::decode_snapshot(input))?;
    if image
        .as_ref()
        .is_some_and(|bytes| bytes.len() > MAX_CLOUD_IMAGE_BYTES)
    {
        return Err(CloudError::validation(
            "Der Bildstand darf im privaten Webzugriff höchstens 1 MB groß sein. Bitte weniger Diagramme auswählen.",
        ));
    }
    Ok(image)
}
async fn create(db: &mut PgConnection, input: CreateEntry) -> CloudResult<Entry> {
    checked(notebook::validate_text(&input.title, &input.note))?;
    checked(notebook::validate_context(&input.context))?;
    checked(notebook::validate_sources(&input.sources))?;
    if input.context_label.chars().count() > 400 || input.context_label.contains('\0') {
        return Err(CloudError::validation(
            "Die Bildbeschreibung ist zu lang oder ungültig.",
        ));
    }
    let captured = chrono::DateTime::parse_from_rfc3339(&input.captured_at)
        .map_err(|_| CloudError::validation("Der Zeitpunkt des Diagrammstands ist ungültig."))?
        .with_timezone(&Utc)
        .to_rfc3339();
    let image = decode_cloud_snapshot(input.snapshot_base64.as_deref())?;
    let hash = image.as_ref().map(|bytes| notebook::image_hash(bytes));
    let value = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    sqlx::query("INSERT INTO atlas_notebook_entries(id,title,note,favorite,context_label,context_json,sources_json,snapshot_png,snapshot_sha256,captured_at,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)")
        .bind(&value).bind(input.title.trim()).bind(input.note).bind(input.favorite).bind(input.context_label)
        .bind(serde_json::to_string(&input.context)?).bind(serde_json::to_string(&input.sources)?).bind(image).bind(hash).bind(captured).bind(now).execute(&mut *db).await?;
    get(db, &value).await
}
async fn update(db: &mut PgConnection, input: UpdateEntry) -> CloudResult<Entry> {
    id(&input.id)?;
    checked(notebook::validate_text(&input.title, &input.note))?;
    if input.revision < 1 {
        return Err(CloudError::validation("Ungültige Notizrevision."));
    }
    let affected=sqlx::query("UPDATE atlas_notebook_entries SET title=$1,note=$2,favorite=$3,updated_at=$4,revision=revision+1 WHERE id=$5 AND revision=$6 AND trashed_at IS NULL")
        .bind(input.title.trim()).bind(input.note).bind(input.favorite).bind(Utc::now().to_rfc3339()).bind(&input.id).bind(input.revision).execute(&mut *db).await?.rows_affected();
    conflict(affected)?;
    get(db, &input.id).await
}
fn conflict(affected: u64) -> CloudResult<()> {
    if affected == 1 {
        Ok(())
    } else {
        Err(CloudError::new(
            "CONFLICT",
            "Diese Atlasansicht wurde inzwischen verändert. Bitte erneut öffnen.",
        ))
    }
}
async fn trash(
    db: &mut PgConnection,
    value: &str,
    revision: i64,
    trashed: bool,
) -> CloudResult<Entry> {
    id(value)?;
    if revision < 1 {
        return Err(CloudError::validation("Ungültige Notizrevision."));
    }
    let now = Utc::now().to_rfc3339();
    let affected=sqlx::query("UPDATE atlas_notebook_entries SET trashed_at=$1,updated_at=$2,revision=revision+1 WHERE id=$3 AND revision=$4")
        .bind(if trashed{Some(&now)}else{None}).bind(&now).bind(value).bind(revision).execute(&mut *db).await?.rows_affected();
    conflict(affected)?;
    get(db, value).await
}
async fn last_context(db: &mut PgConnection) -> CloudResult<Option<SavedContext>> {
    let value: Option<String> =
        sqlx::query_scalar("SELECT last_context_json FROM atlas_personal_preferences WHERE id=1")
            .fetch_optional(&mut *db)
            .await?;
    value
        .map(|s| serde_json::from_str(&s).map_err(CloudError::from))
        .transpose()
}
async fn save_last_context(db: &mut PgConnection, context: SavedContext) -> CloudResult<()> {
    checked(notebook::validate_context(&context))?;
    sqlx::query("INSERT INTO atlas_personal_preferences(id,last_context_json,updated_at) VALUES(1,$1,$2) ON CONFLICT(id) DO UPDATE SET last_context_json=excluded.last_context_json,updated_at=excluded.updated_at")
        .bind(serde_json::to_string(&context)?).bind(Utc::now().to_rfc3339()).execute(&mut *db).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn personal_contract_rejects_injected_arguments() {
        assert!(keys(&json!({"path":"private.sqlite"}), &["id"]).is_err());
        assert!(id("\0").is_err());
        assert!(conflict(0).is_err());
    }
    #[test]
    fn cloud_image_size_is_bounded_before_and_after_decoding() {
        assert!(
            decode_cloud_snapshot(Some(&"A".repeat(MAX_CLOUD_IMAGE_BYTES.div_ceil(3) * 4 + 1)))
                .is_err()
        );
        let mut png = vec![0_u8; MAX_CLOUD_IMAGE_BYTES + 1];
        png[..16].copy_from_slice(b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR");
        png[16..20].copy_from_slice(&1_u32.to_be_bytes());
        png[20..24].copy_from_slice(&1_u32.to_be_bytes());
        let length = png.len();
        png[length - 12..].copy_from_slice(b"\0\0\0\0IEND\xaeB`\x82");
        let encoded = STANDARD.encode(png);
        assert!(encoded.len() <= MAX_CLOUD_IMAGE_BYTES.div_ceil(3) * 4);
        assert!(decode_cloud_snapshot(Some(&encoded)).is_err());
        assert!(decode_cloud_snapshot(None).unwrap().is_none());
    }
    #[tokio::test]
    #[ignore = "Requires explicit isolated PostgreSQL test configuration"]
    async fn atlas_notes_preserve_context_conflicts_trash_and_transaction_rollback() {
        let fixture = super::super::test_support::TestDatabase::open().await;
        let outcome=async {
            let mut tx=fixture.pool.begin().await?;
            let input:CreateEntry=serde_json::from_value(json!({"title":"Test","note":"persönlich","favorite":true,"contextLabel":"Deutschland","capturedAt":"2026-09-25T10:00:00Z","context":{"version":1,"params":{"area":"m49:276"}},"sources":[],"snapshotBase64":null}))?;
            let created=create(&mut tx,input).await?;
            let key=created.summary.id;
            let edited=update(&mut tx,UpdateEntry{id:key.clone(),revision:1,title:"Neu".into(),note:"Notiz".into(),favorite:false}).await?;
            assert_eq!(edited.summary.revision,2);
            assert_eq!(edited.context,created.context);
            assert_eq!(trash(&mut tx,&key,1,true).await.unwrap_err().code,"CONFLICT");
            let removed=trash(&mut tx,&key,2,true).await?;
            assert!(removed.summary.trashed_at.is_some());
            assert!(list(&mut tx,false).await?.is_empty());
            assert_eq!(list(&mut tx,true).await?.len(),1);
            assert!(trash(&mut tx,&key,3,false).await?.summary.trashed_at.is_none());
            save_last_context(&mut tx,created.context.clone()).await?;
            assert_eq!(last_context(&mut tx).await?,Some(created.context));
            tx.rollback().await?;
            let mut connection=fixture.pool.acquire().await?;
            assert!(list(&mut connection,false).await?.is_empty());
            assert!(last_context(&mut connection).await?.is_none());
            Ok::<(),CloudError>(())
        }.await;
        fixture.close().await;
        outcome.unwrap();
    }
}
