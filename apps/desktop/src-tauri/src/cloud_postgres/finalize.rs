//! The final, explicit activation step for an imported, unpublished staging
//! schema. The caller owns one transaction, commit and uncertain-commit policy.
use super::{
    CloudError, CloudResult,
    media::{self, Registration},
};
use serde::Deserialize;
use sqlx::PgConnection;
use std::collections::BTreeSet;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MediaDescriptor {
    pub version: u32,
    pub complete: bool,
    pub total_bytes: u64,
    pub media: Vec<Registration>,
}

pub fn safe_stage(schema: &str) -> bool {
    schema.strip_prefix("macro_stage_").is_some_and(|suffix| {
        suffix.len() == 32
            && suffix
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    })
}
pub fn validate_identity(workspace: &str) -> CloudResult<()> {
    if workspace.is_empty()
        || workspace.len() > 128
        || !workspace
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
    {
        return Err(CloudError::validation(
            "Die Workspace-Konfiguration ist ungültig.",
        ));
    }
    Ok(())
}
pub fn validate_descriptor(descriptor: &MediaDescriptor) -> CloudResult<BTreeSet<&str>> {
    if descriptor.version != 1 || !descriptor.complete || descriptor.media.len() > 100 {
        return Err(CloudError::validation(
            "Die Bildübernahme ist nicht vollständig bestätigt.",
        ));
    }
    let mut ids = BTreeSet::new();
    let mut total = 0_u64;
    for item in &descriptor.media {
        media::validate_registration(item)?;
        if item.size_bytes < 1
            || item.size_bytes > 3 * 1024 * 1024
            || !ids.insert(item.id.as_str())
            || item.account_id.is_some()
            || item.trade_id.is_some()
            || item.slot.is_some()
            || item.caption.is_some()
        {
            return Err(CloudError::validation(
                "Der Bildnachweis ist ungültig oder mehrfach vorhanden.",
            ));
        }
        total = total
            .checked_add(item.size_bytes as u64)
            .ok_or_else(|| CloudError::validation("Die Bildübernahme ist zu groß."))?;
    }
    if total != descriptor.total_bytes || total > 100 * 1024 * 1024 {
        return Err(CloudError::validation(
            "Die Gesamtgröße der Bildnachweise stimmt nicht überein.",
        ));
    }
    Ok(ids)
}

pub async fn finalize_snapshot(
    db: &mut PgConnection,
    schema: &str,
    workspace: &str,
    descriptor: MediaDescriptor,
) -> CloudResult<usize> {
    if !safe_stage(schema) {
        return Err(CloudError::validation(
            "Nur ein ausdrücklich benannter Stagingbereich kann aktiviert werden.",
        ));
    }
    validate_identity(workspace)?;
    let descriptor_ids = validate_descriptor(&descriptor)?;
    let active_schema: String = sqlx::query_scalar("SELECT current_schema()")
        .fetch_one(&mut *db)
        .await?;
    if active_schema != schema {
        return Err(CloudError::new(
            "STAGE_MISMATCH",
            "Der ausgewählte Stagingbereich stimmt nicht überein.",
        ));
    }
    // A missing identity row cannot be protected with SELECT FOR UPDATE. This
    // transaction-scoped table lock serializes two explicit activation attempts.
    sqlx::query(
        "LOCK TABLE cloud_workspace,media_files,cloud_media_objects IN SHARE ROW EXCLUSIVE MODE",
    )
    .execute(&mut *db)
    .await?;
    let workspace_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM cloud_workspace")
        .fetch_one(&mut *db)
        .await?;
    if workspace_count != 0 {
        return Err(CloudError::new(
            "WORKSPACE_ALREADY_ACTIVE",
            "Ein bereits aktivierter Workspace wird nicht verändert.",
        ));
    }
    let accounts: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM accounts")
        .fetch_one(&mut *db)
        .await?;
    if accounts < 1 {
        return Err(CloudError::validation(
            "Die überprüfte Kontoübernahme fehlt.",
        ));
    }
    let existing_ids: Vec<String> = sqlx::query_scalar("SELECT id FROM media_files ORDER BY id")
        .fetch_all(&mut *db)
        .await?;
    let expected: BTreeSet<&str> = existing_ids.iter().map(String::as_str).collect();
    if expected != descriptor_ids {
        return Err(CloudError::new(
            "MEDIA_SET_MISMATCH",
            "Die Bildnachweise passen nicht vollständig zur übernommenen Sicherung.",
        ));
    }
    let count = descriptor.media.len();
    // Validate every original before inserting any object mapping. The importer
    // retains the exact original metadata, dates, dimensions and relative paths.
    for item in &descriptor.media {
        let existing: (String, String, i64, String) = sqlx::query_as(
            "SELECT original_filename,mime_type,size_bytes,sha256 FROM media_files WHERE id=$1",
        )
        .bind(&item.id)
        .fetch_one(&mut *db)
        .await?;
        if existing
            != (
                item.original_filename.clone(),
                item.mime_type.clone(),
                item.size_bytes,
                item.sha256.clone(),
            )
        {
            return Err(CloudError::new(
                "MEDIA_ORIGINAL_MISMATCH",
                "Ein Bildnachweis stimmt nicht mit dem übernommenen Original überein.",
            ));
        }
    }
    for item in descriptor.media {
        media::register(&mut *db, item).await?;
    }
    let verified: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM media_files mf JOIN cloud_media_objects cm ON cm.media_id=mf.id AND cm.sha256=mf.sha256 AND cm.size_bytes=mf.size_bytes AND cm.mime_type=mf.mime_type")
        .fetch_one(&mut *db).await?;
    let objects: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM cloud_media_objects")
        .fetch_one(&mut *db)
        .await?;
    if verified != count as i64 || objects != count as i64 {
        return Err(CloudError::new(
            "MEDIA_INCOMPLETE",
            "Die privaten Originalbilder sind noch nicht vollständig bestätigt.",
        ));
    }
    sqlx::query("INSERT INTO cloud_workspace(id,identity,revision) VALUES(1,$1,0)")
        .bind(workspace)
        .execute(db)
        .await?;
    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures_util::FutureExt;
    use std::panic::{AssertUnwindSafe, resume_unwind};
    fn descriptor(complete: bool) -> MediaDescriptor {
        MediaDescriptor {
            version: 1,
            complete,
            total_bytes: 0,
            media: vec![],
        }
    }
    fn image_descriptor() -> MediaDescriptor {
        let id = "af6064b4-e39e-4d09-bd0d-5c23fb72cc74";
        let hash = "b".repeat(64);
        serde_json::from_value(serde_json::json!({"version":1,"complete":true,"totalBytes":68,"media":[{
            "id":id,"blobPathname":format!("media/v1/{id}/{hash}.png"),"originalFilename":"fixture.png",
            "mimeType":"image/png","sizeBytes":68,"sha256":hash,"width":1,"height":1
        }]})).unwrap()
    }
    #[test]
    fn activation_requires_exact_stage_name_and_complete_descriptor() {
        assert!(safe_stage("macro_stage_0123456789abcdef0123456789abcdef"));
        for schema in [
            "public",
            "macro_private",
            "macro_stage_0123456789abcdef0123456789abcdef\n",
            "macro_stage_0123456789abcdef0123456789abcdef;DROP TABLE accounts",
        ] {
            assert!(!safe_stage(schema));
        }
        assert!(validate_descriptor(&descriptor(true)).is_ok());
        assert!(validate_descriptor(&descriptor(false)).is_err());
        let mut invalid = descriptor(true);
        invalid.total_bytes = 1;
        assert!(validate_descriptor(&invalid).is_err());
        assert!(validate_descriptor(&image_descriptor()).is_ok());
        let mut invalid = image_descriptor();
        invalid.media[0].blob_pathname = "https://external.invalid/image".into();
        assert!(validate_descriptor(&invalid).is_err());
        let mut invalid = image_descriptor();
        invalid.media.push(image_descriptor().media.remove(0));
        invalid.total_bytes = 136;
        assert!(validate_descriptor(&invalid).is_err());
        let mut invalid = image_descriptor();
        invalid.media[0].trade_id = Some("unexpected".into());
        assert!(validate_descriptor(&invalid).is_err());
        for identity in ["", "with space", "secret/other", "line\nfeed"] {
            assert!(validate_identity(identity).is_err());
        }
    }
    #[tokio::test]
    #[ignore = "Requires MACRO_TEST_ENV_FILE; creates a disposable isolated Neon schema"]
    async fn finalization_is_atomic_complete_and_never_overwrites_an_identity() {
        let fixture = super::super::test_support::TestDatabase::open().await;
        let outcome=AssertUnwindSafe(async {
            // This identity belongs exclusively to the disposable fixture.
            sqlx::query("DELETE FROM cloud_workspace").execute(&fixture.pool).await.unwrap();
            sqlx::query("INSERT INTO accounts(id,name,created_at,updated_at) VALUES('fixture','Fixture','2026-09-24','2026-09-24')").execute(&fixture.pool).await.unwrap();
            let stage=format!("macro_stage_{}",uuid::Uuid::new_v4().simple());
            // Rename within each transaction so a failed assertion/rollback
            // always restores the fixture's generated cleanup schema name.
                let mut tx=fixture.pool.begin().await.unwrap();
                sqlx::query(&format!("ALTER SCHEMA {} RENAME TO {stage}",fixture.schema)).execute(&mut *tx).await.unwrap();
                sqlx::query("SELECT set_config('search_path',$1,true)").bind(&stage).execute(&mut *tx).await.unwrap();
                assert!(finalize_snapshot(&mut tx,&stage,"fixture_workspace",descriptor(false)).await.is_err());
                assert_eq!(finalize_snapshot(&mut tx,&stage,"fixture_workspace",descriptor(true)).await.unwrap(),0);
                tx.rollback().await.unwrap();

                sqlx::query("INSERT INTO media_files(id,relative_path,thumbnail_relative_path,original_filename,mime_type,size_bytes,sha256,width,height,captured_at,created_at) VALUES($1,'media/fixture.png','media/thumb.png','fixture.png','image/png',68,$2,NULL,NULL,'2025-01-01','2026-09-24')")
                    .bind(&image_descriptor().media[0].id).bind("b".repeat(64)).execute(&fixture.pool).await.unwrap();
                let original:serde_json::Value=sqlx::query_scalar("SELECT to_jsonb(mf) FROM media_files mf").fetch_one(&fixture.pool).await.unwrap();
                let mut tx=fixture.pool.begin().await.unwrap();
                sqlx::query(&format!("ALTER SCHEMA {} RENAME TO {stage}",fixture.schema)).execute(&mut *tx).await.unwrap();
                sqlx::query("SELECT set_config('search_path',$1,true)").bind(&stage).execute(&mut *tx).await.unwrap();
                let identities:i64=sqlx::query_scalar("SELECT COUNT(*) FROM cloud_workspace").fetch_one(&mut *tx).await.unwrap();assert_eq!(identities,0);
                assert_eq!(finalize_snapshot(&mut tx,&stage,"fixture_workspace",descriptor(true)).await.unwrap_err().code,"MEDIA_SET_MISMATCH");
                let mut mismatch=image_descriptor();mismatch.media[0].original_filename="other.png".into();
                assert_eq!(finalize_snapshot(&mut tx,&stage,"fixture_workspace",mismatch).await.unwrap_err().code,"MEDIA_ORIGINAL_MISMATCH");
                assert_eq!(finalize_snapshot(&mut tx,&stage,"fixture_workspace",image_descriptor()).await.unwrap(),1);
                let unchanged:serde_json::Value=sqlx::query_scalar("SELECT to_jsonb(mf) FROM media_files mf").fetch_one(&mut *tx).await.unwrap();assert_eq!(unchanged,original);
                tx.rollback().await.unwrap();

                let mut tx=fixture.pool.begin().await.unwrap();
                sqlx::query(&format!("ALTER SCHEMA {} RENAME TO {stage}",fixture.schema)).execute(&mut *tx).await.unwrap();
                sqlx::query("SELECT set_config('search_path',$1,true)").bind(&stage).execute(&mut *tx).await.unwrap();
                let counts:(i64,i64)=sqlx::query_as("SELECT (SELECT COUNT(*) FROM cloud_workspace),(SELECT COUNT(*) FROM cloud_media_objects)").fetch_one(&mut *tx).await.unwrap();assert_eq!(counts,(0,0));
                finalize_snapshot(&mut tx,&stage,"fixture_workspace",image_descriptor()).await.unwrap();
                sqlx::query(&format!("ALTER SCHEMA {stage} RENAME TO {}",fixture.schema)).execute(&mut *tx).await.unwrap();tx.commit().await.unwrap();
                let mut tx=fixture.pool.begin().await.unwrap();
                sqlx::query(&format!("ALTER SCHEMA {} RENAME TO {stage}",fixture.schema)).execute(&mut *tx).await.unwrap();
                sqlx::query("SELECT set_config('search_path',$1,true)").bind(&stage).execute(&mut *tx).await.unwrap();
                assert_eq!(finalize_snapshot(&mut tx,&stage,"other_workspace",image_descriptor()).await.unwrap_err().code,"WORKSPACE_ALREADY_ACTIVE");
                let original:(String,i64)=sqlx::query_as("SELECT identity,revision FROM cloud_workspace WHERE id=1").fetch_one(&mut *tx).await.unwrap();assert_eq!(original,("fixture_workspace".into(),0));tx.rollback().await.unwrap();
        }).catch_unwind().await;
        fixture.close().await;
        if let Err(error) = outcome {
            resume_unwind(error);
        }
    }
}
