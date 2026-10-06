//! Public source acquisition and model work are separate durable queue steps.
//! Both publish only a newly verified report shard using the existing generation CAS.
use super::{
    provider_jobs::{self, Job, unavailable},
    *,
};
use crate::{
    cloud_postgres::{CloudError, CloudResult},
    cloud_public::{
        cache::{Artifact, ArtifactKind, DownloadDescriptor, Encoding},
        manifest::{self, Transport},
    },
    commands::{
        central_bank_reports::{
            self,
            cloud::{self, SourceSnapshot},
        },
        report_ai_budget::BudgetStore,
    },
};
use chrono::Utc;
use flate2::{Compression, write::GzEncoder};
use serde::{Deserialize, Serialize};
use std::{io::Write, path::PathBuf, sync::LazyLock};

static WORK: LazyLock<Arc<tokio::sync::Semaphore>> =
    LazyLock::new(|| Arc::new(tokio::sync::Semaphore::new(1)));
#[cfg(test)]
#[path = "report_jobs_tests.rs"]
mod integration_tests;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DiscoveryPayload {
    source_id: String,
    catchup: bool,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SummaryPayload {
    id: String,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Stage {
    previous: String,
    generation: String,
    created_at: String,
    artifact: Artifact,
    transport: Transport,
    pending: Vec<String>,
    source_id: Option<String>,
    source_state: Option<SourceSnapshot>,
    catchup: bool,
}
impl Stage {
    fn descriptor(&self) -> CloudResult<DownloadDescriptor> {
        if self.artifact.kind != ArtifactKind::CentralBankReports
            || self.artifact.key != "official:central-bank-reports"
            || self.transport.kind != self.artifact.kind
            || self.transport.key != self.artifact.key
            || self.transport.object_generation.is_some()
            || !canonical_uuid(&self.previous)
            || self.pending.len() > 36
            || self.pending.iter().any(|id| !report_id(id))
            || self
                .source_id
                .as_deref()
                .is_some_and(|id| cloud::source_bank(id).is_none())
            || self.source_id.is_some() != self.source_state.is_some()
        {
            return Err(unavailable());
        }
        let descriptor = DownloadDescriptor {
            generation: self.generation.clone(),
            object_generation: self.generation.clone(),
            artifact: self.artifact.clone(),
            encoding: self.transport.encoding,
            transfer_bytes: self.transport.transfer_bytes,
            transfer_sha256: self.transport.transfer_sha256.clone(),
        };
        descriptor.validate().map_err(|_| unavailable())?;
        Ok(descriptor)
    }
}
fn report_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 80
        && id
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
}
struct Scratch {
    root: PathBuf,
    pool: Option<sqlx::SqlitePool>,
    permit: Option<tokio::sync::OwnedSemaphorePermit>,
}
impl Scratch {
    fn new(permit: tokio::sync::OwnedSemaphorePermit) -> CloudResult<Self> {
        let root = std::env::temp_dir().join(format!("macro-report-job-{}", Uuid::new_v4()));
        std::fs::create_dir(&root).map_err(|_| unavailable())?;
        Ok(Self {
            root,
            pool: None,
            permit: Some(permit),
        })
    }
}
fn cleanup(root: &std::path::Path) {
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
    fn report_budget(&self) -> BudgetStore {
        BudgetStore::Postgres {
            pool: self.pool.clone(),
            schema: self.schema.clone(),
        }
    }
    async fn report_source(&self, id: &str) -> CloudResult<Option<SourceSnapshot>> {
        if cloud::source_bank(id).is_none() {
            return Err(unavailable());
        }
        let mut tx = self.pool.begin().await?;
        self.scope(&mut tx).await?;
        let value: Option<String> =
            sqlx::query_scalar("SELECT state_json FROM cloud_report_sources WHERE source_id=$1")
                .bind(id)
                .fetch_optional(&mut *tx)
                .await?;
        tx.rollback().await?;
        value
            .as_deref()
            .map(serde_json::from_str)
            .transpose()
            .map_err(|_| unavailable())
    }
    pub(super) async fn report_status(&self) -> CloudResult<(Value, Value)> {
        let mut tx = self.pool.begin().await?;
        self.scope(&mut tx).await?;
        let rows: Vec<(String, String)> = sqlx::query_as(
            "SELECT source_id,state_json FROM cloud_report_sources ORDER BY source_id LIMIT 12",
        )
        .fetch_all(&mut *tx)
        .await?;
        let last:Option<i64>=sqlx::query_scalar("SELECT MAX(completed_at) FROM cloud_provider_jobs WHERE kind='report-discover' AND status='complete'").fetch_one(&mut *tx).await?;
        let next:Option<i64>=sqlx::query_scalar("SELECT MIN(GREATEST(due_at,retry_at,lease_until)) FROM cloud_provider_jobs WHERE kind='report-discover' AND status IN ('pending','running','staged') AND expires_at>$1").bind(Utc::now().timestamp()).fetch_one(&mut *tx).await?;
        tx.rollback().await?;
        let sources = rows
            .into_iter()
            .filter_map(|(id, json)| {
                serde_json::from_str(&json)
                    .ok()
                    .and_then(|s| cloud::source_status(&id, s))
            })
            .collect::<Vec<_>>();
        let attempted = sources
            .iter()
            .filter_map(|s| s.last_checked_at.as_deref())
            .filter_map(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
            .max()
            .map(|v| v.to_rfc3339());
        let failed = sources
            .iter()
            .any(|s| s.last_status.as_deref() == Some("failed"));
        let budget = self
            .report_budget()
            .status()
            .await
            .map_err(|_| unavailable())?;
        let time = |at: Option<i64>| {
            at.and_then(|v| chrono::DateTime::from_timestamp(v, 0))
                .map(|v| v.to_rfc3339())
        };
        let configured = std::env::var("OPENAI_API_KEY")
            .ok()
            .is_some_and(|v| !v.trim().is_empty())
            && std::env::var("OPENAI_REPORT_SUMMARIES_ENABLED")
                .ok()
                .is_none_or(|v| !matches!(v.as_str(), "0" | "false" | "FALSE" | "off" | "OFF"));
        Ok((
            json!({"enabled":self.reports_enabled,"refreshIntervalMinutes":1440,"lastAttemptAt":attempted,
            "lastSuccessAt":time(last),"lastStatus":if failed {"partial"} else if last.is_some() {"complete"} else {"pending"},
            "errorMessage":if failed {Some("Einzelne offizielle Quellen sind vorübergehend nicht erreichbar. Der bisherige Berichtsstand bleibt verfügbar.")} else {None},"nextRefreshAt":time(next),"openaiConfigured":configured,
            "summaryModel":std::env::var("OPENAI_REPORT_MODEL").unwrap_or_else(|_|"gpt-5-mini".into()),"aiBudget":budget}),
            serde_json::to_value(sources).map_err(|_| unavailable())?,
        ))
    }
    pub(super) async fn report_discovery_failed(
        &self,
        conn: &mut PgConnection,
        payload: &str,
    ) -> CloudResult<()> {
        let Ok(input) = serde_json::from_str::<DiscoveryPayload>(payload) else {
            return Ok(());
        };
        if cloud::source_bank(&input.source_id).is_none() {
            return Ok(());
        }
        let old: Option<String> =
            sqlx::query_scalar("SELECT state_json FROM cloud_report_sources WHERE source_id=$1")
                .bind(&input.source_id)
                .fetch_optional(&mut *conn)
                .await?;
        let mut state: SourceSnapshot = old
            .as_deref()
            .map(serde_json::from_str)
            .transpose()?
            .unwrap_or(SourceSnapshot {
                etag: None,
                last_modified: None,
                last_checked_at: None,
                last_success_at: None,
                next_check_at: None,
                last_status: None,
                error_message: None,
            });
        state.last_checked_at = Some(Utc::now().to_rfc3339());
        state.last_status = Some("failed".into());
        state.error_message =
            Some("Die offizielle Quelle konnte nicht vollständig übernommen werden.".into());
        sqlx::query("INSERT INTO cloud_report_sources(source_id,state_json) VALUES($1,$2) ON CONFLICT(source_id) DO UPDATE SET state_json=excluded.state_json").bind(input.source_id).bind(serde_json::to_string(&state)?).execute(conn).await?;
        Ok(())
    }
    pub(super) async fn report_prepare(&self, job: &Job, lease: &str) -> CloudResult<Value> {
        let permit = WORK
            .clone()
            .try_acquire_owned()
            .map_err(|_| unavailable())?;
        let runtime = self.market.as_ref().ok_or_else(unavailable)?;
        let (_, active) = self.market_snapshot().await.map_err(|_| unavailable())?;
        let active = active.ok_or_else(unavailable)?;
        let shard = runtime
            .load(&active.descriptor(
                ArtifactKind::CentralBankReports,
                "official:central-bank-reports",
            )?)
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
                    .create_if_missing(false),
            )
            .await?;
        scratch.pool = Some(pool.clone());
        cloud::prepare_working_copy(&pool)
            .await
            .map_err(|_| unavailable())?;
        let mut source_id = None;
        let mut source_state = None;
        let mut catchup = false;
        let (changed, pending) = match job.kind.as_str() {
            "report-discover" => {
                let input: DiscoveryPayload = serde_json::from_str(&job.payload_json)?;
                let result = cloud::discover(
                    &pool,
                    &scratch.root,
                    &input.source_id,
                    self.report_source(&input.source_id).await?,
                )
                .await
                .map_err(|_| unavailable())?;
                source_id = Some(input.source_id);
                source_state = Some(result.state);
                catchup = !input.catchup && result.changed;
                (result.changed, result.pending)
            }
            "report-summary" => {
                let input: SummaryPayload = serde_json::from_str(&job.payload_json)?;
                if !report_id(&input.id) {
                    return Err(unavailable());
                }
                if std::env::var("OPENAI_REPORT_SUMMARIES_ENABLED")
                    .ok()
                    .is_some_and(|v| matches!(v.as_str(), "0" | "false" | "FALSE" | "off" | "OFF"))
                {
                    return Err(unavailable());
                }
                let changed =
                    cloud::summarize(&pool, &scratch.root, &input.id, &self.report_budget())
                        .await
                        .map_err(|_| unavailable())?;
                (changed, Vec::new())
            }
            _ => return Err(unavailable()),
        };
        if !changed {
            return self
                .report_unchanged(
                    job,
                    lease,
                    &active.manifest.generation,
                    source_id,
                    source_state,
                    pending,
                )
                .await;
        }
        let rows = cloud::export(&pool, &scratch.root.join("export.sqlite"))
            .await
            .map_err(|_| unavailable())?;
        pool.close().await;
        let (stage, gzip) = tokio::task::spawn_blocking(move || {
            let raw =
                std::fs::read(scratch.root.join("export.sqlite")).map_err(|_| unavailable())?;
            if raw.len() > 128 * 1024 * 1024 {
                return Err(unavailable());
            }
            let hash = hex(&Sha256::digest(&raw));
            let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
            encoder.write_all(&raw).map_err(|_| unavailable())?;
            let gzip = encoder.finish().map_err(|_| unavailable())?;
            if gzip.len() > 32 * 1024 * 1024 {
                return Err(unavailable());
            }
            let stage = Stage {
                previous: active.manifest.generation,
                generation: Uuid::new_v4().to_string(),
                created_at: Utc::now().to_rfc3339(),
                artifact: Artifact {
                    kind: ArtifactKind::CentralBankReports,
                    key: "official:central-bank-reports".into(),
                    sha256: hash.clone(),
                    size_bytes: raw.len() as u64,
                    rows,
                    file_name: format!("{hash}.sqlite"),
                    format: "sqlite".into(),
                    schema_version: 1,
                },
                transport: Transport {
                    kind: ArtifactKind::CentralBankReports,
                    key: "official:central-bank-reports".into(),
                    encoding: Encoding::Gzip,
                    transfer_bytes: gzip.len() as u64,
                    transfer_sha256: hex(&Sha256::digest(&gzip)),
                    object_generation: None,
                },
                pending,
                source_id,
                source_state,
                catchup,
            };
            stage.descriptor()?;
            Ok::<_, CloudError>((stage, gzip))
        })
        .await
        .map_err(|_| unavailable())??;
        let mut tx = self.pool.begin().await?;
        self.scope(&mut tx).await?;
        let changed=sqlx::query("UPDATE cloud_provider_jobs SET status='staged',stage_json=$3,lease_until=$4 WHERE id=$1 AND lease_id=$2 AND status='running' AND lease_until>$5 AND expires_at>$5")
            .bind(&job.id).bind(lease).bind(serde_json::to_string(&stage)?).bind(Utc::now().timestamp()+provider_jobs::LEASE_SECONDS).bind(Utc::now().timestamp())
            .execute(&mut *tx).await?.rows_affected();
        if changed != 1 {
            return Err(unavailable());
        }
        super::provider_storage::track(&mut tx, &stage.descriptor()?).await?;
        tx.commit().await?;
        super::provider_storage::upload(&stage.descriptor()?, gzip).await?;
        Ok(json!({"status":"uploaded","leaseId":lease}))
    }
    #[allow(clippy::too_many_arguments)]
    async fn report_followups(
        &self,
        conn: &mut PgConnection,
        job: &Job,
        source: Option<String>,
        state: Option<SourceSnapshot>,
        pending: Vec<String>,
        catchup: bool,
    ) -> CloudResult<()> {
        let now = Utc::now().timestamp();
        if let (Some(id), Some(state)) = (source, state) {
            if cloud::source_bank(&id).is_none() {
                return Err(unavailable());
            }
            sqlx::query("INSERT INTO cloud_report_sources(source_id,state_json) VALUES($1,$2) ON CONFLICT(source_id) DO UPDATE SET state_json=excluded.state_json")
                .bind(&id).bind(serde_json::to_string(&state)?).execute(&mut *conn).await?;
            if catchup {
                provider_jobs::enqueue(
                    conn,
                    &format!("report-catchup:{}", job.id),
                    "report-discover",
                    json!({"sourceId":id,"catchup":true}),
                    now + 300,
                    now + 86400,
                )
                .await?;
            }
        }
        for id in pending {
            if !report_id(&id) {
                return Err(unavailable());
            }
            provider_jobs::enqueue(
                conn,
                &format!(
                    "report-summary:{id}:v{}:{}",
                    central_bank_reports::SUMMARY_VERSION,
                    Utc::now().format("%Y-%m")
                ),
                "report-summary",
                json!({"id":id}),
                now,
                now + 7 * 86400,
            )
            .await?;
        }
        Ok(())
    }
    async fn report_unchanged(
        &self,
        job: &Job,
        lease: &str,
        previous: &str,
        source: Option<String>,
        state: Option<SourceSnapshot>,
        pending: Vec<String>,
    ) -> CloudResult<Value> {
        let now = Utc::now().timestamp();
        let mut tx = self.pool.begin().await?;
        self.scope(&mut tx).await?;
        let active: Option<String> =
            sqlx::query_scalar("SELECT generation FROM cloud_public_active WHERE id=1 FOR UPDATE")
                .fetch_one(&mut *tx)
                .await?;
        if active.as_deref() != Some(previous) {
            return Err(unavailable());
        }
        let changed=sqlx::query("UPDATE cloud_provider_jobs SET status='complete',lease_until=0,stage_json=NULL,completed_at=$3,outcome_json=$4 WHERE id=$1 AND lease_id=$2 AND status='running' AND lease_until>$3 AND expires_at>$3")
            .bind(&job.id).bind(lease).bind(now).bind(json!({"generation":previous,"sourceUnchanged":true}).to_string()).execute(&mut *tx).await?.rows_affected();
        if changed != 1 {
            return Err(unavailable());
        }
        self.report_followups(&mut tx, job, source, state, pending, false)
            .await?;
        tx.commit().await?;
        Ok(json!({"status":"complete"}))
    }
    pub(super) async fn report_complete(&self, id: &str, lease: &str) -> CloudResult<Value> {
        let job = self.provider_job(id).await?;
        if job.status == "complete" {
            return Ok(json!({"status":"already-complete"}));
        }
        let now = Utc::now().timestamp();
        if !job.kind.starts_with("report-")
            || job.status != "staged"
            || job.lease_id.as_deref() != Some(lease)
            || job.lease_until <= now
            || job.expires_at <= now
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
        let checked = async {
            crate::cloud_public::report_readers::read(
                "get_central_bank_reports",
                &json!({}),
                &shard,
            )
            .await?;
            let mut ids = stage.pending.clone();
            if job.kind == "report-summary" {
                let input: SummaryPayload =
                    serde_json::from_str(&job.payload_json).map_err(|_| {
                        crate::errors::CommandError::validation("Ungültiger Briefingauftrag.")
                    })?;
                ids.push(input.id);
            }
            for id in ids {
                crate::cloud_public::report_readers::read(
                    "get_central_bank_report",
                    &json!({"id":id}),
                    &shard,
                )
                .await?;
            }
            Ok::<_, crate::errors::CommandError>(())
        }
        .await;
        shard.close().await;
        checked.map_err(|_| unavailable())?;
        self.report_publish(&job, lease, stage).await
    }
    async fn report_publish(&self, job: &Job, lease: &str, stage: Stage) -> CloudResult<Value> {
        let now = Utc::now().timestamp();
        let mut tx = self.pool.begin().await?;
        self.scope(&mut tx).await?;
        type SavedJob = (String, Option<String>, Option<String>, i64, i64);
        let saved:Option<SavedJob>=sqlx::query_as("SELECT status,lease_id,stage_json,lease_until,expires_at FROM cloud_provider_jobs WHERE id=$1 FOR UPDATE").bind(&job.id).fetch_optional(&mut *tx).await?;
        let Some((status, saved_lease, saved_stage, until, expires)) = saved else {
            return Err(unavailable());
        };
        if status == "complete" {
            return Ok(json!({"status":"already-complete"}));
        }
        if status != "staged"
            || saved_lease.as_deref() != Some(lease)
            || saved_stage != job.stage_json
            || until <= now
            || expires <= now
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
            .find(|a| {
                a.kind == ArtifactKind::CentralBankReports
                    && a.key == "official:central-bank-reports"
            })
            .ok_or_else(unavailable)? = stage.artifact;
        *descriptor
            .transports
            .iter_mut()
            .find(|t| {
                t.kind == ArtifactKind::CentralBankReports
                    && t.key == "official:central-bank-reports"
            })
            .ok_or_else(unavailable)? = stage.transport;
        manifest::publish(&mut tx, descriptor, Some(&stage.previous)).await?;
        self.report_followups(
            &mut tx,
            job,
            stage.source_id,
            stage.source_state,
            stage.pending,
            stage.catchup,
        )
        .await?;
        sqlx::query("UPDATE cloud_provider_jobs SET status='complete',lease_until=0,stage_json=NULL,completed_at=$3,outcome_json=$4 WHERE id=$1 AND lease_id=$2")
            .bind(&job.id).bind(lease).bind(now).bind(json!({"generation":stage.generation,"briefingUpdated":job.kind=="report-summary"}).to_string()).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(json!({"status":"complete"}))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn report_payloads_never_accept_free_urls_paths_or_unknown_fields() {
        assert!(
            serde_json::from_value::<DiscoveryPayload>(
                json!({"sourceId":"fed-monetary","catchup":false})
            )
            .is_ok()
        );
        assert!(
            serde_json::from_value::<DiscoveryPayload>(
                json!({"sourceId":"fed-monetary","catchup":false,"url":"https://attacker.example"})
            )
            .is_err()
        );
        assert!(
            serde_json::from_value::<SummaryPayload>(json!({"id":"report-1","path":"private"}))
                .is_err()
        );
        assert!(report_id("report-1"));
        assert!(!report_id("../private"));
    }
}
