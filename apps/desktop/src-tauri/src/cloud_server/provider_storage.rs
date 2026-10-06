//! Provider-owned immutable objects and bounded retention. Never touches media,
//! original desktop data or public packages uploaded before this automation.
use super::provider_jobs::unavailable;
use super::*;
use crate::cloud_postgres::CloudResult;
use crate::cloud_public::cache::{ArtifactKind, DownloadDescriptor};

pub(super) async fn track(
    conn: &mut PgConnection,
    descriptor: &DownloadDescriptor,
) -> CloudResult<()> {
    descriptor.validate().map_err(|_| unavailable())?;
    if !matches!(
        descriptor.artifact.kind,
        ArtifactKind::Macro | ArtifactKind::Cot | ArtifactKind::CentralBankReports
    ) || descriptor.generation != descriptor.object_generation
    {
        return Err(unavailable());
    }
    sqlx::query("INSERT INTO cloud_provider_objects(object_path,generation,kind,created_at) VALUES($1,$2,$3,$4) ON CONFLICT(object_path) DO NOTHING")
        .bind(descriptor.object_path().map_err(|_|unavailable())?).bind(&descriptor.generation).bind(match descriptor.artifact.kind {
            ArtifactKind::Macro=>"macro",ArtifactKind::Cot=>"cot",ArtifactKind::CentralBankReports=>"central-bank-reports",_=>return Err(unavailable())
        }).bind(chrono::Utc::now().timestamp()).execute(conn).await?;
    Ok(())
}

/// Equivalent to the pinned @vercel/blob 2.8 SDK PUT contract. A fixed API host,
/// private access and no overwrite; the independent loader proves stored bytes.
pub(super) async fn upload(descriptor: &DownloadDescriptor, bytes: Vec<u8>) -> CloudResult<()> {
    descriptor.validate().map_err(|_| unavailable())?;
    if bytes.len() as u64 != descriptor.transfer_bytes
        || hex(&Sha256::digest(&bytes)) != descriptor.transfer_sha256
    {
        return Err(unavailable());
    }
    let path = descriptor.object_path().map_err(|_| unavailable())?;
    let token = std::env::var("BLOB_READ_WRITE_TOKEN").map_err(|_| unavailable())?;
    let mut url = reqwest::Url::parse("https://vercel.com/api/blob/").map_err(|_| unavailable())?;
    url.query_pairs_mut().append_pair("pathname", &path);
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|_| unavailable())?;
    let result = client
        .put(url)
        .bearer_auth(token)
        .header("x-api-version", "12")
        .header("x-vercel-blob-access", "private")
        .header("x-add-random-suffix", "0")
        .header("x-allow-overwrite", "0")
        .header("x-content-type", "application/gzip")
        .header("x-content-length", bytes.len())
        .body(bytes)
        .send()
        .await;
    // A duplicate pathname can mean the upload committed before its response was
    // lost. In either case completion separately downloads and verifies it.
    match result {
        Ok(response)
            if response.status().is_success()
                || response.status() == reqwest::StatusCode::CONFLICT =>
        {
            Ok(())
        }
        _ => Err(unavailable()),
    }
}

impl CloudServer {
    pub(super) async fn provider_retire(&self) -> CloudResult<Value> {
        let now = chrono::Utc::now().timestamp();
        let mut tx = self.pool.begin().await?;
        self.scope(&mut tx).await?;
        // Publication takes the same pointer lock. Its CAS/reuse validation
        // cannot introduce a reference to an already retired object later.
        sqlx::query("SELECT generation FROM cloud_public_active WHERE id=1 FOR UPDATE")
            .fetch_one(&mut *tx)
            .await?;
        let retired:Vec<String>=sqlx::query_scalar("SELECT g.generation FROM cloud_public_generations g JOIN cloud_provider_objects o ON o.generation=g.generation WHERE o.created_at<$1 AND g.generation IS DISTINCT FROM (SELECT generation FROM cloud_public_active WHERE id=1) AND g.generation NOT IN (SELECT generation FROM cloud_public_generations ORDER BY published_at DESC,generation DESC LIMIT 8)")
            .bind(now-86400).fetch_all(&mut *tx).await?;
        if !retired.is_empty() {
            sqlx::query("DELETE FROM cloud_public_transports WHERE generation=ANY($1)")
                .bind(&retired)
                .execute(&mut *tx)
                .await?;
            sqlx::query("DELETE FROM cloud_public_generations WHERE generation=ANY($1)")
                .bind(&retired)
                .execute(&mut *tx)
                .await?;
        }
        let paths:Vec<String>=sqlx::query_scalar("UPDATE cloud_provider_objects o SET retired_at=COALESCE(retired_at,$1) WHERE object_path IN (SELECT candidate.object_path FROM cloud_provider_objects candidate WHERE candidate.deleted_at IS NULL AND candidate.created_at<$2 AND NOT EXISTS(SELECT 1 FROM cloud_public_transports t WHERE COALESCE(t.object_generation,t.generation)=candidate.generation AND t.kind=candidate.kind) AND NOT EXISTS(SELECT 1 FROM cloud_provider_jobs j WHERE j.lease_until>$1 AND j.stage_json::jsonb->>'generation'=candidate.generation) AND NOT EXISTS(SELECT 1 FROM cloud_cot_jobs j WHERE j.lease_until>$1 AND j.stage_json::jsonb->>'generation'=candidate.generation) ORDER BY candidate.created_at LIMIT 128) RETURNING object_path")
            .bind(now).bind(now-86400).fetch_all(&mut *tx).await?;
        sqlx::query("DELETE FROM cloud_provider_jobs WHERE expires_at<$1 AND status IN ('complete','expired','cancelled')").bind(now-90*86400).execute(&mut *tx).await?;
        sqlx::query("DELETE FROM cloud_myfxbook_imports WHERE id IN (SELECT id FROM (SELECT id,row_number() OVER(PARTITION BY account_id ORDER BY created_at DESC,id DESC) AS position FROM cloud_myfxbook_imports) history WHERE position>8)").execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(json!({"paths":paths}))
    }
    pub(super) async fn provider_retired(&self, paths: &[String]) -> CloudResult<Value> {
        if paths.len() > 128 {
            return Err(unavailable());
        }
        let mut tx = self.pool.begin().await?;
        self.scope(&mut tx).await?;
        sqlx::query("UPDATE cloud_provider_objects SET deleted_at=$2 WHERE object_path=ANY($1) AND retired_at IS NOT NULL").bind(paths).bind(chrono::Utc::now().timestamp()).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(json!({"ok":true}))
    }
}
