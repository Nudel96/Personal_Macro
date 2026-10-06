//! Media metadata uses the caller's transaction. Private object references are
//! accessible only through the separately signed server-to-server media route.
use super::common::{argument, encoded, require_trade_in_account};
use super::{CloudError, CloudResult};
use crate::commands::{MediaAnnotationInput, MediaAnnotationRecord, MediaRecord};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::PgConnection;
use uuid::Uuid;

pub const COMMANDS: &[(&str, bool)] = &[
    ("list_media", false),
    ("list_trade_media", false),
    ("attach_trade_media", true),
    ("detach_trade_media", true),
    ("get_media_annotation", false),
    ("save_media_annotation", true),
];
pub const INTERNAL_COMMANDS: &[(&str, bool)] = &[
    ("get_private_media_object", false),
    ("register_private_media", true),
    ("register_private_trade_media", true),
];
const SELECT_MEDIA: &str = "SELECT mf.id,'' AS relative_path,NULL::TEXT AS thumbnail_relative_path,mf.original_filename,mf.mime_type,mf.size_bytes,mf.sha256,mf.width,mf.height,mf.captured_at,mf.created_at,(SELECT COUNT(*) FROM trade_media tm WHERE tm.media_id=mf.id) AS trade_count,'' AS absolute_path FROM media_files mf";

fn missing() -> CloudError {
    CloudError::new("NOT_FOUND", "Das Bild ist nicht verfügbar.")
}
fn validate_id(value: &str) -> CloudResult<()> {
    if Uuid::parse_str(value).is_ok_and(|id| id.to_string() == value) {
        Ok(())
    } else {
        Err(CloudError::validation("Die Bildkennung ist ungültig."))
    }
}
fn public_record(mut row: MediaRecord) -> CloudResult<MediaRecord> {
    validate_id(&row.id)?;
    let url = format!("/api/media?id={}", row.id);
    row.relative_path = url.clone();
    row.absolute_path = url;
    row.thumbnail_relative_path = None;
    Ok(row)
}
async fn require_media(db: &mut PgConnection, media_id: &str) -> CloudResult<()> {
    validate_id(media_id)?;
    if !sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM media_files WHERE id=$1)")
        .bind(media_id)
        .fetch_one(db)
        .await?
    {
        return Err(missing());
    }
    Ok(())
}
async fn record(db: &mut PgConnection, id: &str) -> CloudResult<MediaRecord> {
    public_record(
        sqlx::query_as::<_, MediaRecord>(&format!("{SELECT_MEDIA} WHERE mf.id=$1"))
            .bind(id)
            .fetch_optional(db)
            .await?
            .ok_or_else(missing)?,
    )
}
pub async fn dispatch(db: &mut PgConnection, name: &str, args: &Value) -> CloudResult<Value> {
    match name {
        "list_media" => {
            let rows = sqlx::query_as::<_, MediaRecord>(&format!(
                "{SELECT_MEDIA} ORDER BY mf.created_at DESC,mf.id"
            ))
            .fetch_all(db)
            .await?;
            encoded(
                rows.into_iter()
                    .map(public_record)
                    .collect::<CloudResult<Vec<_>>>()?,
            )
        }
        "list_trade_media" => {
            let account: String = argument(args, "accountId")?;
            let trade: String = argument(args, "tradeId")?;
            require_trade_in_account(&mut *db, &account, &trade).await?;
            let rows = sqlx::query_as::<_, MediaRecord>(&format!("{SELECT_MEDIA} JOIN trade_media selected ON selected.media_id=mf.id WHERE selected.trade_id=$1 ORDER BY selected.sort_order,mf.id"))
                .bind(trade.trim()).fetch_all(db).await?;
            encoded(
                rows.into_iter()
                    .map(public_record)
                    .collect::<CloudResult<Vec<_>>>()?,
            )
        }
        "attach_trade_media" => {
            attach(
                db,
                &argument::<String>(args, "accountId")?,
                &argument::<String>(args, "tradeId")?,
                &argument::<String>(args, "mediaId")?,
                argument(args, "slot")?,
                argument(args, "caption")?,
            )
            .await?;
            Ok(Value::Null)
        }
        "detach_trade_media" => {
            let account: String = argument(args, "accountId")?;
            let trade: String = argument(args, "tradeId")?;
            let media: String = argument(args, "mediaId")?;
            require_trade_in_account(&mut *db, &account, &trade).await?;
            validate_id(&media)?;
            sqlx::query("DELETE FROM trade_media WHERE trade_id=$1 AND media_id=$2")
                .bind(trade.trim())
                .bind(media)
                .execute(db)
                .await?;
            Ok(Value::Null)
        }
        "get_media_annotation" => {
            let media: String = argument(args, "mediaId")?;
            require_media(&mut *db, &media).await?;
            encoded(sqlx::query_as::<_, MediaAnnotationRecord>("SELECT id,media_id,annotation_json,created_at,updated_at FROM media_annotations WHERE media_id=$1 ORDER BY updated_at DESC LIMIT 1")
                .bind(media).fetch_optional(db).await?)
        }
        "save_media_annotation" => {
            let input: MediaAnnotationInput = argument(args, "input")?;
            require_media(&mut *db, &input.media_id).await?;
            let annotation = input.annotation.to_string();
            if !input.annotation.is_object() || annotation.len() > 256 * 1024 {
                return Err(CloudError::validation(
                    "Die Bildanmerkungen sind ungültig oder zu umfangreich.",
                ));
            }
            let existing: Option<String> = sqlx::query_scalar("SELECT id FROM media_annotations WHERE media_id=$1 ORDER BY updated_at DESC LIMIT 1")
                .bind(&input.media_id).fetch_optional(&mut *db).await?;
            let id = existing.unwrap_or_else(|| Uuid::new_v4().to_string());
            let now = Utc::now().to_rfc3339();
            sqlx::query("INSERT INTO media_annotations(id,media_id,annotation_json,created_at,updated_at) VALUES($1,$2,$3,$4,$4) ON CONFLICT(id) DO UPDATE SET annotation_json=excluded.annotation_json,updated_at=excluded.updated_at")
                .bind(&id).bind(&input.media_id).bind(annotation).bind(now).execute(&mut *db).await?;
            encoded(sqlx::query_as::<_, MediaAnnotationRecord>("SELECT id,media_id,annotation_json,created_at,updated_at FROM media_annotations WHERE id=$1")
                .bind(id).fetch_one(db).await?)
        }
        _ => Err(CloudError::new(
            "COMMAND_UNAVAILABLE",
            "Diese Medienfunktion ist nicht verfügbar.",
        )),
    }
}
async fn attach(
    db: &mut PgConnection,
    account: &str,
    trade: &str,
    media: &str,
    slot: Option<String>,
    caption: Option<String>,
) -> CloudResult<()> {
    require_trade_in_account(&mut *db, account, trade).await?;
    require_media(&mut *db, media).await?;
    let slot = slot.unwrap_or_else(|| "other".into());
    if slot.len() > 64 || caption.as_ref().is_some_and(|text| text.len() > 4000) {
        return Err(CloudError::validation(
            "Die Bildzuordnung ist zu umfangreich.",
        ));
    }
    sqlx::query("INSERT INTO trade_media(trade_id,media_id,slot,caption,sort_order) VALUES($1,$2,$3,$4,COALESCE((SELECT MAX(sort_order)+1 FROM trade_media WHERE trade_id=$1),0)) ON CONFLICT(trade_id,media_id) DO UPDATE SET slot=excluded.slot,caption=excluded.caption")
        .bind(trade.trim()).bind(media).bind(slot).bind(caption).execute(db).await?;
    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Registration {
    pub id: String,
    pub blob_pathname: String,
    pub original_filename: String,
    pub mime_type: String,
    pub size_bytes: i64,
    pub sha256: String,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub account_id: Option<String>,
    pub trade_id: Option<String>,
    pub slot: Option<String>,
    pub caption: Option<String>,
}
#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct PrivateObject {
    pub blob_pathname: String,
    pub mime_type: String,
    pub size_bytes: i64,
    pub sha256: String,
}
pub(super) fn validate_registration(input: &Registration) -> CloudResult<()> {
    validate_id(&input.id)?;
    let extension = match input.mime_type.as_str() {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/webp" => "webp",
        _ => return Err(CloudError::validation("Erlaubt sind PNG, JPEG und WebP.")),
    };
    let valid_hash = input.sha256.len() == 64
        && input
            .sha256
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b));
    if !valid_hash
        || !(1..=3 * 1024 * 1024).contains(&input.size_bytes)
        || input.blob_pathname != format!("media/v1/{}/{}.{}", input.id, input.sha256, extension)
        || input.original_filename.is_empty()
        || input.original_filename.len() > 255
        || input
            .original_filename
            .chars()
            .any(|c| c.is_control() || matches!(c, '/' | '\\'))
        || [input.width, input.height]
            .into_iter()
            .any(|dimension| dimension.is_some_and(|v| !(1..=32768).contains(&v)))
    {
        return Err(CloudError::validation(
            "Die Bilddatei oder ihr Speichernachweis ist ungültig.",
        ));
    }
    Ok(())
}
pub async fn dispatch_internal(
    db: &mut PgConnection,
    name: &str,
    args: &Value,
) -> CloudResult<Value> {
    match name {
        "get_private_media_object" => {
            let id: String = argument(args, "id")?;
            validate_id(&id)?;
            encoded(sqlx::query_as::<_,PrivateObject>("SELECT blob_pathname,mime_type,size_bytes,sha256 FROM cloud_media_objects WHERE media_id=$1")
                .bind(id).fetch_optional(db).await?.ok_or_else(missing)?)
        }
        "register_private_media" => register(db, argument(args, "input")?).await,
        "register_private_trade_media" => {
            let mut input: Registration = argument(args, "input")?;
            validate_registration(&input)?;
            let trade: crate::domain::models::TradeInput = argument(args, "trade")?;
            if input.trade_id.is_some()
                || input.account_id.as_deref() != Some(trade.account_id.as_str())
            {
                return Err(CloudError::validation(
                    "Das Screenshot-Konto stimmt nicht mit dem Trade überein.",
                ));
            }
            super::common::require_active_account(&mut *db, &trade.account_id).await?;
            let created = super::trades::create(&mut *db, trade).await?;
            input.trade_id = Some(created.id.clone());
            input.slot = Some("entry".into());
            register(db, input).await?;
            encoded(created)
        }
        _ => Err(CloudError::new(
            "COMMAND_UNAVAILABLE",
            "Diese Medienfunktion ist nicht verfügbar.",
        )),
    }
}
/// Also usable by the explicit initial importer after it uploads and verifies
/// an original file. Never discovers local files or changes original metadata.
pub async fn register(db: &mut PgConnection, input: Registration) -> CloudResult<Value> {
    validate_registration(&input)?;
    if let Some(trade) = input.trade_id.as_deref() {
        require_trade_in_account(
            &mut *db,
            input.account_id.as_deref().unwrap_or_default(),
            trade,
        )
        .await?;
    }
    let now = Utc::now().to_rfc3339();
    sqlx::query("INSERT INTO media_files(id,relative_path,original_filename,mime_type,size_bytes,sha256,width,height,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO NOTHING")
        .bind(&input.id).bind(format!("cloud-media/{}",input.id)).bind(&input.original_filename).bind(&input.mime_type).bind(input.size_bytes).bind(&input.sha256).bind(input.width).bind(input.height).bind(&now).execute(&mut *db).await?;
    let existing = record(&mut *db, &input.id).await?;
    if existing.sha256 != input.sha256
        || existing.size_bytes != input.size_bytes
        || existing.mime_type != input.mime_type
    {
        return Err(CloudError::new(
            "CONFLICT",
            "Der Bildnachweis stimmt nicht mit dem vorhandenen Original überein.",
        ));
    }
    sqlx::query("INSERT INTO cloud_media_objects(media_id,blob_pathname,sha256,size_bytes,mime_type,created_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(media_id) DO NOTHING")
        .bind(&input.id).bind(&input.blob_pathname).bind(&input.sha256).bind(input.size_bytes).bind(&input.mime_type).bind(now).execute(&mut *db).await?;
    let stored: String =
        sqlx::query_scalar("SELECT blob_pathname FROM cloud_media_objects WHERE media_id=$1")
            .bind(&input.id)
            .fetch_one(&mut *db)
            .await?;
    if stored != input.blob_pathname {
        return Err(CloudError::new(
            "CONFLICT",
            "Für dieses Bild besteht bereits ein anderer Speichernachweis.",
        ));
    }
    if let Some(trade) = input.trade_id {
        attach(
            &mut *db,
            input.account_id.as_deref().unwrap_or_default(),
            &trade,
            &input.id,
            input.slot,
            input.caption,
        )
        .await?;
    }
    encoded(record(db, &input.id).await?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures_util::FutureExt;
    use std::panic::{AssertUnwindSafe, resume_unwind};

    #[tokio::test]
    #[ignore = "Requires MACRO_TEST_ENV_FILE; uses a temporary isolated Neon schema"]
    async fn postgres_media_original_registration_annotations_and_account_scope() {
        let fixture = super::super::test_support::TestDatabase::open().await;
        let outcome = AssertUnwindSafe(async {
            let mut tx = fixture.pool.begin().await.unwrap();
            let now = "2026-09-24T00:00:00Z";
            for id in ["media-account-a", "media-account-b"] {
                sqlx::query("INSERT INTO accounts(id,name,created_at,updated_at) VALUES($1,$1,$2,$2)")
                    .bind(id).bind(now).execute(&mut *tx).await.unwrap();
            }
            sqlx::query("INSERT INTO trades(id,account_id,status,instrument,asset_class,direction,display_timezone,created_at,updated_at) VALUES('media-trade','media-account-a','closed','EURUSD','forex','long','Europe/Berlin',$1,$1)")
                .bind(now).execute(&mut *tx).await.unwrap();
            let original = input();
            sqlx::query("INSERT INTO media_files(id,relative_path,thumbnail_relative_path,original_filename,mime_type,size_bytes,sha256,width,height,captured_at,created_at) VALUES($1,'media/trades/desktop-original.png','media/thumbnails/private.png','Original.png','image/png',100,$2,100,200,$3,$3)")
                .bind(&original.id).bind(&original.sha256).bind(now).execute(&mut *tx).await.unwrap();
            let before: Value = sqlx::query_scalar("SELECT to_jsonb(mf) FROM media_files mf WHERE id=$1").bind(&original.id).fetch_one(&mut *tx).await.unwrap();
            let first = register(&mut tx, input()).await.unwrap();
            assert_eq!(first["originalFilename"], "Original.png");
            assert_eq!(first["width"], 100);
            assert_eq!(first["absolutePath"], format!("/api/media?id={}", original.id));
            let again = register(&mut tx, input()).await.unwrap();
            assert_eq!(again, first);
            let after: Value = sqlx::query_scalar("SELECT to_jsonb(mf) FROM media_files mf WHERE id=$1").bind(&original.id).fetch_one(&mut *tx).await.unwrap();
            assert_eq!(before, after, "Initial upload must preserve every imported metadata field");
            let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM cloud_media_objects").fetch_one(&mut *tx).await.unwrap();
            assert_eq!(count, 1);
            let lookup = dispatch_internal(&mut tx,"get_private_media_object",&serde_json::json!({"id":original.id})).await.unwrap();
            assert_eq!(lookup["blobPathname"], original.blob_pathname);
            assert_eq!(lookup["sha256"], original.sha256);
            assert_eq!(super::super::dispatch(&mut tx,"get_private_media_object",&serde_json::json!({"id":original.id})).await.unwrap_err().code,"COMMAND_UNAVAILABLE");
            let list = dispatch(&mut tx,"list_media",&serde_json::json!({})).await.unwrap();
            let list_text = list.to_string();
            assert!(!list_text.contains("desktop-original") && !list_text.contains("thumbnails") && !list_text.contains("blobPathname"));
            for command in ["list_trade_media","attach_trade_media","detach_trade_media"] {
                let error=dispatch(&mut tx,command,&serde_json::json!({"accountId":"media-account-b","tradeId":"media-trade","mediaId":original.id})).await.unwrap_err();
                assert_eq!(error.code,"NOT_FOUND");
            }
            let args=serde_json::json!({"accountId":"media-account-a","tradeId":"media-trade","mediaId":original.id,"slot":"entry","caption":"Synthetic chart"});
            dispatch(&mut tx,"attach_trade_media",&args).await.unwrap();
            dispatch(&mut tx,"attach_trade_media",&args).await.unwrap();
            let linked=dispatch(&mut tx,"list_trade_media",&args).await.unwrap();
            assert_eq!(linked.as_array().unwrap().len(),1); assert_eq!(linked[0]["tradeCount"],1);
            let empty=dispatch(&mut tx,"get_media_annotation",&serde_json::json!({"mediaId":original.id})).await.unwrap();
            assert!(empty.is_null());
            let annotation=dispatch(&mut tx,"save_media_annotation",&serde_json::json!({"input":{"mediaId":original.id,"annotation":{"version":1,"shapes":[]}}})).await.unwrap();
            let changed=dispatch(&mut tx,"save_media_annotation",&serde_json::json!({"input":{"mediaId":original.id,"annotation":{"version":1,"shapes":[{"kind":"text","text":"Fixture"}]}}})).await.unwrap();
            assert_eq!(annotation["id"],changed["id"]);assert_eq!(annotation["createdAt"],changed["createdAt"]);
            assert!(changed["annotationJson"].as_str().unwrap().contains("Fixture"));
            let mut mismatched=input();mismatched.sha256="b".repeat(64);mismatched.blob_pathname=format!("media/v1/{}/{}.png",mismatched.id,mismatched.sha256);
            assert_eq!(register(&mut tx,mismatched).await.unwrap_err().code,"CONFLICT");
            dispatch(&mut tx,"detach_trade_media",&args).await.unwrap();
            assert!(dispatch(&mut tx,"list_trade_media",&args).await.unwrap().as_array().unwrap().is_empty());
            let stored: i64=sqlx::query_scalar("SELECT COUNT(*) FROM cloud_media_objects").fetch_one(&mut *tx).await.unwrap();assert_eq!(stored,1);
            let mut new=input();new.id="8e091bba-47ec-4d3d-a87c-745ff487f6be".into();new.blob_pathname=format!("media/v1/{}/{}.png",new.id,new.sha256);
            register(&mut tx,new).await.unwrap();
            tx.commit().await.unwrap();
        }).catch_unwind().await;
        fixture.close().await;
        if let Err(error) = outcome {
            resume_unwind(error);
        }
    }
    fn input() -> Registration {
        let id = "eb761579-7090-4d4d-b3f9-9ce8e0caa01a".to_owned();
        let sha256 = "a".repeat(64);
        Registration {
            blob_pathname: format!("media/v1/{id}/{sha256}.png"),
            id,
            sha256,
            original_filename: "Chart.png".into(),
            mime_type: "image/png".into(),
            size_bytes: 100,
            width: Some(1),
            height: Some(1),
            account_id: None,
            trade_id: None,
            slot: None,
            caption: None,
        }
    }
    #[test]
    fn registration_is_bounded_and_cannot_select_arbitrary_paths() {
        assert!(validate_registration(&input()).is_ok());
        for path in [
            "https://private.blob.vercel-storage.com/secret",
            "../../secret",
            "media/v1/wrong.png",
        ] {
            let mut value = input();
            value.blob_pathname = path.into();
            assert!(validate_registration(&value).is_err());
        }
        for size in [0, 3 * 1024 * 1024 + 1] {
            let mut value = input();
            value.size_bytes = size;
            assert!(validate_registration(&value).is_err());
        }
        let mut value = input();
        value.original_filename = "../chart.png".into();
        assert!(validate_registration(&value).is_err());
        let mut value = input();
        value.mime_type = "image/svg+xml".into();
        assert!(validate_registration(&value).is_err());
        let mut value = input();
        value.sha256 = "G".repeat(64);
        assert!(validate_registration(&value).is_err());
    }
    #[test]
    fn media_urls_are_canonical_same_origin_and_private_references_never_public() {
        let value = input();
        let row = MediaRecord {
            id: value.id,
            relative_path: "PRIVATE-LOCAL-PATH".into(),
            thumbnail_relative_path: Some("PRIVATE-THUMB".into()),
            original_filename: value.original_filename,
            mime_type: value.mime_type,
            size_bytes: value.size_bytes,
            sha256: value.sha256,
            width: None,
            height: None,
            captured_at: None,
            created_at: "now".into(),
            trade_count: 0,
            absolute_path: "PRIVATE-BLOB-URL".into(),
        };
        let encoded = serde_json::to_string(&public_record(row).unwrap()).unwrap();
        assert!(!encoded.contains("PRIVATE-"));
        assert!(encoded.contains("/api/media?id="));
    }
}
