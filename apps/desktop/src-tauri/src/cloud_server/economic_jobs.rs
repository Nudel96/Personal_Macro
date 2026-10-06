use super::{
    provider_jobs::{self, Job, MacroPayload, unavailable, wait},
    *,
};
use crate::{
    cloud_postgres::{CloudError, CloudResult},
    cloud_public::{
        cache::{Artifact, ArtifactKind, DownloadDescriptor, Encoding},
        manifest::{self, Transport},
    },
    commands::eodhd_cloud::{self, Release},
};
use chrono::{DateTime, Utc};
use flate2::{Compression, write::GzEncoder};
use serde::{Deserialize, Serialize};
use std::{io::Write, path::PathBuf};

static WORK: std::sync::LazyLock<Arc<tokio::sync::Semaphore>> =
    std::sync::LazyLock::new(|| Arc::new(tokio::sync::Semaphore::new(1)));
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Stage {
    previous: String,
    generation: String,
    created_at: String,
    artifact: Artifact,
    transport: Transport,
    releases: Vec<Release>,
    needs_retry: bool,
}
impl Stage {
    fn descriptor(&self) -> CloudResult<DownloadDescriptor> {
        if self.artifact.kind != ArtifactKind::Macro
            || self.artifact.key != "eodhd:macro"
            || self.transport.kind != ArtifactKind::Macro
            || self.transport.key != "eodhd:macro"
            || self.transport.object_generation.is_some()
            || !canonical_uuid(&self.previous)
        {
            return Err(unavailable());
        }
        let result = DownloadDescriptor {
            generation: self.generation.clone(),
            object_generation: self.generation.clone(),
            artifact: self.artifact.clone(),
            encoding: self.transport.encoding,
            transfer_bytes: self.transport.transfer_bytes,
            transfer_sha256: self.transport.transfer_sha256.clone(),
        };
        result.validate().map_err(|_| unavailable())?;
        Ok(result)
    }
}
struct Scratch {
    root: PathBuf,
    pool: Option<sqlx::SqlitePool>,
    permit: Option<tokio::sync::OwnedSemaphorePermit>,
}
impl Scratch {
    fn new(permit: tokio::sync::OwnedSemaphorePermit) -> CloudResult<Self> {
        let root = std::env::temp_dir().join(format!("macro-economic-job-{}", Uuid::new_v4()));
        std::fs::create_dir(&root).map_err(|_| unavailable())?;
        Ok(Self {
            root,
            pool: None,
            permit: Some(permit),
        })
    }
}
fn cleanup(root: &std::path::Path) {
    // Only this job's explicitly created filenames, no recursive deletion.
    for name in ["work.sqlite", "export.sqlite"] {
        for suffix in ["", "-journal", "-wal", "-shm"] {
            let _ = std::fs::remove_file(root.join(format!("{name}{suffix}")));
        }
    }
    let _ = std::fs::remove_dir(root);
}
impl Drop for Scratch {
    fn drop(&mut self) {
        let root = self.root.clone();
        let permit = self.permit.take();
        if let Some(pool) = self.pool.take()
            && let Ok(runtime) = tokio::runtime::Handle::try_current()
        {
            runtime.spawn(async move {
                pool.close().await;
                cleanup(&root);
                drop(permit);
            });
        } else {
            cleanup(&root);
        }
    }
}
impl CloudServer {
    pub(super) async fn economic_prepare(&self, job: &Job, lease: &str) -> CloudResult<Value> {
        let payload: MacroPayload = serde_json::from_str(&job.payload_json)?;
        if !eodhd_cloud::CURRENCIES.contains(&payload.currency.as_str())
            || !matches!(job.kind.as_str(), "macro-plan" | "macro-release")
        {
            return Err(unavailable());
        }
        let permit = WORK
            .clone()
            .try_acquire_owned()
            .map_err(|_| unavailable())?;
        let runtime = self.market.as_ref().ok_or_else(unavailable)?;
        let (_, active) = self.market_snapshot().await.map_err(|_| unavailable())?;
        let active = active.ok_or_else(unavailable)?;
        let shard = runtime
            .load(&active.descriptor(ArtifactKind::Macro, "eodhd:macro")?)
            .await
            .map_err(|_| unavailable())?;
        let scratch = Scratch::new(permit)?;
        let (shard, mut scratch) = tokio::task::spawn_blocking(move || {
            shard
                .copy_sqlite_to_new_file(&scratch.root.join("work.sqlite"))
                .map_err(|_| unavailable())?;
            Ok::<_, CloudError>((shard, scratch))
        })
        .await
        .map_err(|_| unavailable())??;
        shard.close().await;
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(
                sqlx::sqlite::SqliteConnectOptions::new()
                    .filename(scratch.root.join("work.sqlite"))
                    .create_if_missing(false)
                    .journal_mode(sqlx::sqlite::SqliteJournalMode::Delete),
            )
            .await?;
        scratch.pool = Some(pool.clone());
        eodhd_cloud::prepare_working_copy(&pool)
            .await
            .map_err(|_| unavailable())?;
        let from = DateTime::from_timestamp(payload.from, 0).ok_or_else(unavailable)?;
        let to = DateTime::from_timestamp(payload.to, 0).ok_or_else(unavailable)?;
        let before = if job.kind == "macro-release" {
            Some(
                eodhd_cloud::source_fingerprint(&pool, &payload.currency)
                    .await
                    .map_err(|_| unavailable())?,
            )
        } else {
            None
        };
        let releases = eodhd_cloud::refresh(
            &pool,
            &scratch.root,
            &payload.currency,
            from,
            to,
            Utc::now(),
        )
        .await
        .map_err(|_| unavailable())?;
        let needs_retry = payload
            .released_at
            .is_some_and(|at| releases.iter().any(|r| r.released_at == at));
        if let Some(before) = before
            && before
                == eodhd_cloud::source_fingerprint(&pool, &payload.currency)
                    .await
                    .map_err(|_| unavailable())?
        {
            return self
                .economic_unchanged(job, lease, &active.manifest.generation, needs_retry)
                .await;
        }
        let rows = eodhd_cloud::export(&pool, &scratch.root.join("export.sqlite"))
            .await
            .map_err(|_| unavailable())?;
        pool.close().await;
        let (stage, gzip) = tokio::task::spawn_blocking(move || {
            let bytes =
                std::fs::read(scratch.root.join("export.sqlite")).map_err(|_| unavailable())?;
            if bytes.len() > 128 * 1024 * 1024 {
                return Err(unavailable());
            }
            let raw_hash = hex(&Sha256::digest(&bytes));
            let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
            encoder.write_all(&bytes).map_err(|_| unavailable())?;
            let gzip = encoder.finish().map_err(|_| unavailable())?;
            // The existing Macro shard is about 6.5 MiB compressed. Upload it
            // directly to private storage; never enlarge browser JSON limits.
            if gzip.len() > 32 * 1024 * 1024 {
                return Err(unavailable());
            }
            let generation = Uuid::new_v4().to_string();
            let stage = Stage {
                previous: active.manifest.generation,
                generation,
                created_at: Utc::now().to_rfc3339(),
                artifact: Artifact {
                    kind: ArtifactKind::Macro,
                    key: "eodhd:macro".into(),
                    sha256: raw_hash.clone(),
                    size_bytes: bytes.len() as u64,
                    rows,
                    file_name: format!("{raw_hash}.sqlite"),
                    format: "sqlite".into(),
                    schema_version: 1,
                },
                transport: Transport {
                    kind: ArtifactKind::Macro,
                    key: "eodhd:macro".into(),
                    encoding: Encoding::Gzip,
                    transfer_bytes: gzip.len() as u64,
                    transfer_sha256: hex(&Sha256::digest(&gzip)),
                    object_generation: None,
                },
                releases,
                needs_retry,
            };
            stage.descriptor()?;
            Ok::<_, CloudError>((stage, gzip))
        })
        .await
        .map_err(|_| unavailable())??;
        let mut tx = self.pool.begin().await?;
        self.scope(&mut tx).await?;
        let changed=sqlx::query("UPDATE cloud_provider_jobs SET status='staged',stage_json=$3,lease_until=$4 WHERE id=$1 AND lease_id=$2 AND status='running' AND lease_until>$5")
            .bind(&job.id).bind(lease).bind(serde_json::to_string(&stage)?).bind(Utc::now().timestamp()+provider_jobs::LEASE_SECONDS).bind(Utc::now().timestamp()).execute(&mut *tx).await?.rows_affected();
        if changed != 1 {
            return Err(unavailable());
        }
        super::provider_storage::track(&mut tx, &stage.descriptor()?).await?;
        tx.commit().await?;
        super::provider_storage::upload(&stage.descriptor()?, gzip).await?;
        Ok(json!({"status":"uploaded","leaseId":lease}))
    }
    pub(super) async fn economic_complete(&self, id: &str, lease: &str) -> CloudResult<Value> {
        let job = self.provider_job(id).await?;
        if job.status == "complete" {
            return Ok(json!({"status":"already-complete"}));
        }
        if job.status != "staged"
            || job.lease_id.as_deref() != Some(lease)
            || job.lease_until <= Utc::now().timestamp()
            || job.expires_at <= Utc::now().timestamp()
        {
            return Err(unavailable());
        }
        let stage: Stage =
            serde_json::from_str(job.stage_json.as_deref().ok_or_else(unavailable)?)?;
        let shard = self
            .market
            .as_ref()
            .ok_or_else(unavailable)?
            .load(&stage.descriptor()?)
            .await
            .map_err(|_| unavailable())?;
        let checked = crate::cloud_public::macro_readers::read(
            "get_eodhd_fundamentals_dashboard",
            &json!({}),
            &shard,
        )
        .await;
        shard.close().await;
        checked.map_err(|_| unavailable())?;
        self.economic_publish(&job, lease, stage).await
    }

    pub(super) async fn economic_unchanged(
        &self,
        job: &Job,
        lease: &str,
        previous: &str,
        needs_retry: bool,
    ) -> CloudResult<Value> {
        let now = Utc::now().timestamp();
        let again = needs_retry
            && job.attempts < provider_jobs::MAX_ATTEMPTS
            && job.expires_at > now + 1800;
        let mut tx = self.pool.begin().await?;
        self.scope(&mut tx).await?;
        let changed = sqlx::query("UPDATE cloud_provider_jobs SET status=$3,lease_until=0,stage_json=NULL,completed_at=$4,retry_at=$5,outcome_json=$6,error_code=$7 WHERE id=$1 AND lease_id=$2 AND status='running' AND lease_until>$8 AND expires_at>$8")
            .bind(&job.id).bind(lease).bind(if again {"pending"} else if needs_retry {"expired"} else {"complete"})
            .bind(if again {None} else {Some(now)}).bind(now+1800)
            .bind(json!({"generation":previous,"sourceUnchanged":true,"completeSource":!needs_retry}).to_string())
            .bind(if needs_retry {Some("RELEASE_INCOMPLETE")} else {None::<&str>}).bind(now)
            .execute(&mut *tx).await?.rows_affected();
        if changed != 1 {
            return Err(unavailable());
        }
        let active: Option<String> =
            sqlx::query_scalar("SELECT generation FROM cloud_public_active WHERE id=1 FOR UPDATE")
                .fetch_one(&mut *tx)
                .await?;
        if active.as_deref() != Some(previous) {
            return Err(unavailable());
        }
        tx.commit().await?;
        Ok(if again {
            wait(now + 1800)
        } else {
            json!({"status":"complete"})
        })
    }
    async fn economic_publish(&self, job: &Job, lease: &str, stage: Stage) -> CloudResult<Value> {
        let now = Utc::now().timestamp();
        let mut tx = self.pool.begin().await?;
        self.scope(&mut tx).await?;
        let saved:Option<(String,Option<String>,Option<String>,i64)>=sqlx::query_as("SELECT status,lease_id,stage_json,lease_until FROM cloud_provider_jobs WHERE id=$1 FOR UPDATE").bind(&job.id).fetch_optional(&mut *tx).await?;
        let Some((status, saved_lease, saved_stage, until)) = saved else {
            return Err(unavailable());
        };
        if status == "complete" {
            return Ok(json!({"status":"already-complete"}));
        }
        if status != "staged"
            || saved_lease.as_deref() != Some(lease)
            || saved_stage != job.stage_json
            || until <= now
        {
            return Err(unavailable());
        }
        let active = manifest::load_active(&mut tx)
            .await?
            .ok_or_else(unavailable)?;
        if active.manifest.generation != stage.previous {
            return Err(unavailable());
        }
        let mut descriptor =
            active.reusable_descriptor(stage.generation.clone(), stage.created_at.clone())?;
        *descriptor
            .manifest
            .artifacts
            .iter_mut()
            .find(|a| a.kind == ArtifactKind::Macro && a.key == "eodhd:macro")
            .ok_or_else(unavailable)? = stage.artifact;
        *descriptor
            .transports
            .iter_mut()
            .find(|t| t.kind == ArtifactKind::Macro && t.key == "eodhd:macro")
            .ok_or_else(unavailable)? = stage.transport;
        manifest::publish(&mut tx, descriptor, Some(&stage.previous)).await?;
        for release in stage.releases {
            let payload = MacroPayload {
                currency: release.currency.clone(),
                from: release.released_at - 86400,
                to: release.released_at + 86400,
                released_at: Some(release.released_at),
            };
            provider_jobs::enqueue(
                &mut tx,
                &format!("macro-release:{}:{}", release.currency, release.released_at),
                "macro-release",
                serde_json::to_value(payload)?,
                release.due_at,
                release.due_at + 7 * 86400,
            )
            .await?;
        }
        let again = stage.needs_retry
            && job.attempts < provider_jobs::MAX_ATTEMPTS
            && job.expires_at > now + 1800;
        sqlx::query("UPDATE cloud_provider_jobs SET status=$3,lease_until=0,stage_json=NULL,completed_at=$4,retry_at=$5,outcome_json=$6,error_code=$7 WHERE id=$1 AND lease_id=$2")
            .bind(&job.id).bind(lease).bind(if again{"pending"}else if stage.needs_retry{"expired"}else{"complete"}).bind(if again{None}else{Some(now)}).bind(now+1800)
            .bind(json!({"generation":stage.generation,"completeSource":!stage.needs_retry}).to_string()).bind(if stage.needs_retry{Some("RELEASE_INCOMPLETE")}else{None::<&str>}).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(if again {
            wait(now + 1800)
        } else {
            json!({"status":"complete"})
        })
    }
}
