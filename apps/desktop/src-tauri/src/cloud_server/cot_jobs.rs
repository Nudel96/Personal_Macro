//! Owner-private, signed CFTC release jobs. Provider/file work never holds a
//! PostgreSQL transaction. A durable lease and manifest CAS fence every publish.
use super::*;
use crate::{
    cloud_postgres::{CloudError, CloudResult},
    cloud_public::{
        cache::{Artifact, ArtifactKind, DownloadDescriptor, Encoding},
        manifest::{self, Transport},
    },
    commands::{
        self,
        cot_schedule::{self, CotReleaseCalendar},
    },
};
use base64::{Engine, engine::general_purpose::STANDARD};
use chrono::{DateTime, NaiveDate, Utc};
use flate2::{Compression, write::GzEncoder};
use serde::{Deserialize, Serialize};
use std::{io::Write, path::PathBuf};

const MAX_ATTEMPTS: i32 = 8;
const MAX_JOB_AGE: i64 = 5 * 86400;
const LEASE_SECONDS: i64 = 180;
const RETRY_SECONDS: i64 = 1800;
const MAX_COT_GZIP: usize = 2_900_000;

#[cfg(test)]
#[path = "cot_job_tests.rs"]
mod publication_tests;
static COT_WORK: std::sync::OnceLock<Arc<tokio::sync::Semaphore>> = std::sync::OnceLock::new();

#[derive(Debug, sqlx::FromRow)]
struct Job {
    release_date: String,
    report_date: String,
    due_at: i64,
    retry_at: i64,
    status: String,
    attempts: i32,
    lease_id: Option<String>,
    lease_until: i64,
    stage_json: Option<String>,
}
const JOB_COLUMNS: &str =
    "release_date,report_date,due_at,retry_at,status,attempts,lease_id,lease_until,stage_json";

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Stage {
    previous_generation: String,
    generation: String,
    created_at: String,
    artifact: Artifact,
    transport: Transport,
}
impl Stage {
    fn descriptor(&self) -> CloudResult<DownloadDescriptor> {
        let value = DownloadDescriptor {
            generation: self.generation.clone(),
            object_generation: self.generation.clone(),
            artifact: self.artifact.clone(),
            encoding: self.transport.encoding,
            transfer_bytes: self.transport.transfer_bytes,
            transfer_sha256: self.transport.transfer_sha256.clone(),
        };
        value.validate().map_err(|_| unavailable())?;
        if value.artifact.kind != ArtifactKind::Cot
            || value.artifact.key != "cftc:legacy"
            || !canonical_uuid(&self.previous_generation)
            || self.transport.object_generation.is_some()
            || self.transport.kind != ArtifactKind::Cot
            || self.transport.key != "cftc:legacy"
        {
            return Err(unavailable());
        }
        Ok(value)
    }
}

fn unavailable() -> CloudError {
    CloudError::new(
        "COT_JOB_UNAVAILABLE",
        "Die COT-Aktualisierung konnte noch nicht abgeschlossen werden.",
    )
}
fn timestamp(value: i64) -> String {
    DateTime::from_timestamp(value, 0)
        .unwrap_or_default()
        .to_rfc3339()
}
fn wait(until: i64) -> Value {
    json!({"status":"wait","retryAt":timestamp(until)})
}
fn date(value: &str) -> CloudResult<NaiveDate> {
    let parsed = NaiveDate::parse_from_str(value, "%Y-%m-%d").map_err(|_| unavailable())?;
    if parsed.to_string() != value {
        return Err(unavailable());
    }
    Ok(parsed)
}

impl CloudServer {
    pub(super) async fn cot_status(&self) -> CloudResult<Value> {
        if !self.cot_enabled {
            return Ok(
                json!({"enabled":false,"calendarAvailable":false,"nextRefreshAt":null,"lastOutcome":null}),
            );
        }
        let mut tx = self.pool.begin().await?;
        self.scope(&mut tx).await?;
        let stored: Option<String> =
            sqlx::query_scalar("SELECT calendar_json FROM cloud_cot_calendar WHERE id=1")
                .fetch_optional(&mut *tx)
                .await?;
        let last: Option<String> =
            sqlx::query_scalar("SELECT status FROM cloud_cot_jobs ORDER BY due_at DESC LIMIT 1")
                .fetch_optional(&mut *tx)
                .await?;
        let pending:Option<i64>=sqlx::query_scalar("SELECT MIN(GREATEST(due_at,retry_at,lease_until)) FROM cloud_cot_jobs WHERE status IN ('pending','running','staged') AND due_at>=$1")
            .bind(Utc::now().timestamp()-MAX_JOB_AGE).fetch_one(&mut *tx).await?;
        tx.rollback().await?;
        let calendar = stored
            .and_then(|text| serde_json::from_str::<CotReleaseCalendar>(&text).ok())
            .filter(|c| c.validate().is_ok());
        let next = calendar
            .as_ref()
            .and_then(|c| c.next_release(Utc::now()))
            .map(|r| r.refresh_at.timestamp());
        Ok(
            json!({"enabled":true,"calendarAvailable":next.is_some(),"nextRefreshAt":pending.or(next).map(timestamp),"lastOutcome":last}),
        )
    }
    async fn cot_job(&self, release: &str) -> CloudResult<Option<Job>> {
        let mut tx = self.pool.begin().await?;
        self.scope(&mut tx).await?;
        let value = sqlx::query_as::<_, Job>(&format!(
            "SELECT {JOB_COLUMNS} FROM cloud_cot_jobs WHERE release_date=$1"
        ))
        .bind(release)
        .fetch_optional(&mut *tx)
        .await?;
        tx.rollback().await?;
        Ok(value)
    }

    async fn cot_plan(&self) -> CloudResult<Value> {
        let now = Utc::now();
        // The official calendar is validated in full before replacing the last
        // known good copy; an unavailable provider does not erase that copy.
        let fetched = cot_schedule::fetch_release_calendar().await;
        let mut tx = self.pool.begin().await?;
        self.scope(&mut tx).await?;
        let calendar: CotReleaseCalendar = match fetched {
            Ok(calendar) => {
                sqlx::query("INSERT INTO cloud_cot_calendar(id,calendar_json,fetched_at) VALUES(1,$1,$2) ON CONFLICT(id) DO UPDATE SET calendar_json=excluded.calendar_json,fetched_at=excluded.fetched_at")
                    .bind(serde_json::to_string(&calendar)?).bind(now.timestamp()).execute(&mut *tx).await?;
                calendar
            }
            Err(_) => {
                let stored: Option<String> =
                    sqlx::query_scalar("SELECT calendar_json FROM cloud_cot_calendar WHERE id=1")
                        .fetch_optional(&mut *tx)
                        .await?;
                serde_json::from_str(&stored.ok_or_else(unavailable)?)?
            }
        };
        tx.commit().await?;
        calendar.validate().map_err(|_| unavailable())?;
        let today = now
            .with_timezone(&chrono_tz::America::New_York)
            .date_naive();
        let release = calendar
            .next_release(now)
            .filter(|release| release.release_date == today)
            .or_else(|| calendar.latest_due(now));
        let Some(release) = release else {
            return Ok(json!({"job":null}));
        };
        if now.timestamp() - release.refresh_at.timestamp() > MAX_JOB_AGE {
            return Ok(json!({"job":null}));
        }
        let release_date = release.release_date.to_string();
        let mut tx = self.pool.begin().await?;
        self.scope(&mut tx).await?;
        sqlx::query("INSERT INTO cloud_cot_jobs(release_date,report_date,due_at,retry_at) VALUES($1,$2,$3,$3) ON CONFLICT(release_date) DO NOTHING")
            .bind(&release_date).bind(release.expected_report_date.to_string()).bind(release.refresh_at.timestamp()).execute(&mut *tx).await?;
        tx.commit().await?;
        let job = self.cot_job(&release_date).await?.ok_or_else(unavailable)?;
        if matches!(job.status.as_str(), "complete" | "expired") {
            return Ok(json!({"job":null}));
        }
        Ok(
            json!({"job":{"releaseDate":job.release_date,"reportDate":job.report_date,
            "dueAt":timestamp(job.due_at.max(job.retry_at).max(now.timestamp()))}}),
        )
    }

    async fn cot_claim(&self, release: &str, now: i64) -> CloudResult<Option<String>> {
        let lease = Uuid::new_v4().to_string();
        let mut tx = self.pool.begin().await?;
        self.scope(&mut tx).await?;
        let claimed:Option<String>=sqlx::query_scalar("UPDATE cloud_cot_jobs SET status='running',attempts=attempts+1,lease_id=$2,lease_until=$3,error_code=NULL WHERE release_date=$1 AND status IN ('pending','running','staged') AND attempts<$4 AND due_at<=$5 AND retry_at<=$5 AND lease_until<=$5 AND due_at>=$6 RETURNING lease_id")
            .bind(release).bind(&lease).bind(now+LEASE_SECONDS).bind(MAX_ATTEMPTS).bind(now).bind(now-MAX_JOB_AGE).fetch_optional(&mut *tx).await?;
        tx.commit().await?;
        Ok(claimed)
    }

    async fn cot_fail(&self, release: &str, lease: &str) -> CloudResult<Value> {
        let now = Utc::now().timestamp();
        let mut tx = self.pool.begin().await?;
        self.scope(&mut tx).await?;
        sqlx::query("UPDATE cloud_cot_jobs SET status=CASE WHEN attempts>=8 OR due_at<$4 THEN 'expired' ELSE 'pending' END,retry_at=$3,lease_until=0,error_code='PROVIDER_OR_STORAGE_UNAVAILABLE' WHERE release_date=$1 AND lease_id=$2 AND status!='complete'")
            .bind(release).bind(lease).bind(now+RETRY_SECONDS).bind(now-MAX_JOB_AGE).execute(&mut *tx).await?;
        tx.commit().await?;
        let job = self.cot_job(release).await?.ok_or_else(unavailable)?;
        Ok(if job.status == "expired" {
            json!({"status":"expired"})
        } else {
            wait(job.retry_at)
        })
    }

    async fn cot_already_current(
        &self,
        job: &Job,
        lease: &str,
        generation: &str,
    ) -> CloudResult<Value> {
        let mut tx = self.pool.begin().await?;
        self.scope(&mut tx).await?;
        let result=sqlx::query("UPDATE cloud_cot_jobs SET status='complete',completed_at=$3,published_generation=$4,lease_until=0,stage_json=NULL WHERE release_date=$1 AND lease_id=$2 AND status='running'")
            .bind(&job.release_date).bind(lease).bind(Utc::now().timestamp()).bind(generation).execute(&mut *tx).await?;
        if result.rows_affected() != 1 {
            return Err(unavailable());
        }
        let active: Option<String> =
            sqlx::query_scalar("SELECT generation FROM cloud_public_active WHERE id=1 FOR UPDATE")
                .fetch_one(&mut *tx)
                .await?;
        if active.as_deref() != Some(generation) {
            return Err(unavailable());
        }
        tx.commit().await?;
        Ok(json!({"status":"already-complete"}))
    }

    async fn cot_prepare(
        &self,
        job: &Job,
        lease: &str,
        permit: tokio::sync::OwnedSemaphorePermit,
    ) -> CloudResult<Value> {
        let runtime = self.market.as_ref().ok_or_else(unavailable)?;
        let (_, manifest) = self.market_snapshot().await.map_err(|_| unavailable())?;
        let manifest = manifest.ok_or_else(unavailable)?;
        let old = manifest.descriptor(ArtifactKind::Cot, "cftc:legacy")?;
        let shard = runtime.load(&old).await.map_err(|_| unavailable())?;
        let expected = date(&job.report_date)?;
        let current = is_current(shard.pool(), expected).await?;
        if current {
            shard.close().await;
            return self
                .cot_already_current(job, lease, &manifest.manifest.generation)
                .await;
        }
        let scratch = Scratch::new(permit)?;
        let (shard, mut scratch) = tokio::task::spawn_blocking(move || {
            shard
                .copy_sqlite_to_new_file(&scratch.file)
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
                    .filename(&scratch.file)
                    .create_if_missing(false)
                    .journal_mode(sqlx::sqlite::SqliteJournalMode::Delete)
                    .busy_timeout(Duration::from_secs(5)),
            )
            .await?;
        scratch.pool = Some(pool.clone());
        let refreshed = commands::refresh_public_cot(&pool, expected).await;
        let current = is_current(&pool, expected).await;
        let rows:Result<i64,sqlx::Error>=sqlx::query_scalar("SELECT (SELECT COUNT(*) FROM cot_contracts)+(SELECT COUNT(*) FROM cot_legacy_observations)+(SELECT COUNT(*) FROM cot_sync_runs)").fetch_one(&pool).await;
        pool.close().await;
        refreshed.map_err(|_| unavailable())?;
        if !current? {
            return Err(unavailable());
        }
        let rows = rows?;
        let prepared = tokio::task::spawn_blocking(move || {
            let bytes = std::fs::read(&scratch.file).map_err(|_| unavailable())?;
            if bytes.len() > 32 * 1024 * 1024 {
                return Err(unavailable());
            }
            let raw_hash = hex(&Sha256::digest(&bytes));
            let mut gzip = GzEncoder::new(Vec::new(), Compression::best());
            gzip.write_all(&bytes).map_err(|_| unavailable())?;
            let gzip = gzip.finish().map_err(|_| unavailable())?;
            if gzip.len() > MAX_COT_GZIP {
                return Err(unavailable());
            }
            let generation = Uuid::new_v4().to_string();
            let stage = Stage {
                previous_generation: manifest.manifest.generation,
                generation,
                created_at: Utc::now().to_rfc3339(),
                artifact: Artifact {
                    kind: ArtifactKind::Cot,
                    key: "cftc:legacy".into(),
                    sha256: raw_hash.clone(),
                    size_bytes: bytes.len() as u64,
                    rows: rows as u64,
                    file_name: format!("{raw_hash}.sqlite"),
                    format: "sqlite".into(),
                    schema_version: 1,
                },
                transport: Transport {
                    kind: ArtifactKind::Cot,
                    key: "cftc:legacy".into(),
                    encoding: Encoding::Gzip,
                    transfer_bytes: gzip.len() as u64,
                    transfer_sha256: hex(&Sha256::digest(&gzip)),
                    object_generation: None,
                },
            };
            stage.descriptor()?;
            Ok::<_, CloudError>((stage, gzip))
        })
        .await
        .map_err(|_| unavailable())??;
        let (stage, gzip) = prepared;
        let mut tx = self.pool.begin().await?;
        self.scope(&mut tx).await?;
        let changed=sqlx::query("UPDATE cloud_cot_jobs SET status='staged',stage_json=$3,lease_until=$4 WHERE release_date=$1 AND lease_id=$2 AND status='running' AND lease_until>$5")
            .bind(&job.release_date).bind(lease).bind(serde_json::to_string(&stage)?).bind(Utc::now().timestamp()+LEASE_SECONDS).bind(Utc::now().timestamp()).execute(&mut *tx).await?;
        if changed.rows_affected() != 1 {
            return Err(unavailable());
        }
        super::provider_storage::track(&mut tx, &stage.descriptor()?).await?;
        tx.commit().await?;
        Ok(
            json!({"status":"prepared","prepared":{"leaseId":lease,"generation":stage.generation,
            "objectPath":stage.descriptor()?.object_path().map_err(|_|unavailable())?,"transferSha256":stage.transport.transfer_sha256,
            "transferBytes":gzip.len(),"dataBase64":STANDARD.encode(gzip)}}),
        )
    }

    async fn cot_complete(&self, release: &str, lease: &str) -> CloudResult<Value> {
        let job = self.cot_job(release).await?.ok_or_else(unavailable)?;
        if job.status == "complete" {
            return Ok(json!({"status":"already-complete"}));
        }
        if job.lease_id.as_deref() != Some(lease) || job.status != "staged" {
            return Err(unavailable());
        }
        if Utc::now().timestamp() - job.due_at > MAX_JOB_AGE {
            return Err(unavailable());
        }
        let stage: Stage =
            serde_json::from_str(job.stage_json.as_deref().ok_or_else(unavailable)?)?;
        // This independent read verifies remote bytes, both hashes, SQLite
        // schema, identity and row count; worker success alone is insufficient.
        let shard = self
            .market
            .as_ref()
            .ok_or_else(unavailable)?
            .load(&stage.descriptor()?)
            .await
            .map_err(|_| unavailable())?;
        let check = is_current(shard.pool(), date(&job.report_date)?).await;
        let reader =
            crate::cloud_public::macro_readers::read("get_cot_dashboard", &json!({}), &shard).await;
        shard.close().await;
        if !check? || reader.is_err() {
            return Err(unavailable());
        }
        self.cot_publish(&job, lease, stage).await
    }

    /// Called only after independent object loading and native COT validation.
    /// The generation and successful-release receipt commit in one transaction.
    async fn cot_publish(&self, job: &Job, lease: &str, stage: Stage) -> CloudResult<Value> {
        let release = &job.release_date;
        let mut tx = self.pool.begin().await?;
        self.scope(&mut tx).await?;
        let locked:Option<(String,Option<String>,Option<String>)>=sqlx::query_as("SELECT status,lease_id,stage_json FROM cloud_cot_jobs WHERE release_date=$1 FOR UPDATE")
            .bind(release).fetch_optional(&mut *tx).await?;
        let Some((status, saved_lease, saved_stage)) = locked else {
            return Err(unavailable());
        };
        if status == "complete" {
            tx.rollback().await?;
            return Ok(json!({"status":"already-complete"}));
        }
        if status != "staged"
            || saved_lease.as_deref() != Some(lease)
            || saved_stage != job.stage_json
        {
            return Err(unavailable());
        }
        let active = manifest::load_active(&mut tx)
            .await?
            .ok_or_else(unavailable)?;
        if active.manifest.generation != stage.previous_generation {
            return Err(unavailable());
        }
        let mut descriptor =
            active.reusable_descriptor(stage.generation.clone(), stage.created_at.clone())?;
        let target = descriptor
            .manifest
            .artifacts
            .iter_mut()
            .find(|a| a.kind == ArtifactKind::Cot && a.key == "cftc:legacy")
            .ok_or_else(unavailable)?;
        *target = stage.artifact;
        let transport = descriptor
            .transports
            .iter_mut()
            .find(|t| t.kind == ArtifactKind::Cot && t.key == "cftc:legacy")
            .ok_or_else(unavailable)?;
        *transport = stage.transport;
        manifest::publish(&mut tx, descriptor, Some(&stage.previous_generation)).await?;
        sqlx::query("UPDATE cloud_cot_jobs SET status='complete',published_generation=$2,completed_at=$3,lease_until=0,stage_json=NULL,error_code=NULL WHERE release_date=$1")
            .bind(release).bind(&stage.generation).bind(Utc::now().timestamp()).execute(&mut *tx).await?;
        // The same transaction commits generation and release receipt. A lost
        // commit response is recovered by reading this receipt on redelivery.
        tx.commit().await?;
        Ok(json!({"status":"complete"}))
    }

    async fn cot_run(&self, release: &str) -> CloudResult<Value> {
        date(release)?;
        let job = self.cot_job(release).await?.ok_or_else(unavailable)?;
        let now = Utc::now().timestamp();
        if job.status == "complete" {
            return Ok(json!({"status":"already-complete"}));
        }
        if job.status == "staged"
            && let Some(lease) = &job.lease_id
            && let Ok(value) = self.cot_complete(release, lease).await
        {
            return Ok(value);
        }
        if job.status == "expired" || now - job.due_at > MAX_JOB_AGE || job.attempts >= MAX_ATTEMPTS
        {
            let mut tx = self.pool.begin().await?;
            self.scope(&mut tx).await?;
            sqlx::query("UPDATE cloud_cot_jobs SET status='expired',error_code='RELEASE_EXPIRED' WHERE release_date=$1 AND status!='complete' AND lease_until<=$2")
                .bind(release).bind(now).execute(&mut *tx).await?;
            tx.commit().await?;
            return Ok(json!({"status":"expired"}));
        }
        if now < job.due_at.max(job.retry_at).max(job.lease_until) {
            return Ok(wait(job.due_at.max(job.retry_at).max(job.lease_until)));
        }
        let Ok(permit) = COT_WORK
            .get_or_init(|| Arc::new(tokio::sync::Semaphore::new(1)))
            .clone()
            .try_acquire_owned()
        else {
            return Ok(wait(now + LEASE_SECONDS));
        };
        let Some(lease) = self.cot_claim(release, now).await? else {
            return Ok(wait(now + LEASE_SECONDS));
        };
        match tokio::time::timeout(
            Duration::from_secs(80),
            self.cot_prepare(&job, &lease, permit),
        )
        .await
        {
            Ok(Ok(value)) => Ok(value),
            _ => self.cot_fail(release, &lease).await,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cloud_postgres::test_support::TestDatabase;
    use futures_util::FutureExt;
    use std::panic::{AssertUnwindSafe, resume_unwind};

    #[test]
    fn job_dates_and_staged_metadata_reject_untrusted_shapes() {
        assert!(date("2026-09-25").is_ok());
        for value in ["2026-9-25", "2026-02-30", "2026-09-25Z", "../../secret"] {
            assert!(date(value).is_err());
        }
        assert!(
            serde_json::from_value::<RunRequest>(
                json!({"releaseDate":"2026-09-25","url":"https://evil.invalid"})
            )
            .is_err()
        );
        assert!(
            serde_json::from_value::<CompleteRequest>(
                json!({"releaseDate":"2026-09-25","leaseId":"x","descriptor":{}})
            )
            .is_err()
        );
    }

    #[tokio::test]
    #[ignore = "Requires explicitly selected isolated PostgreSQL test database"]
    async fn cot_release_lease_is_durable_fenced_bounded_and_separate_from_journal() {
        let db = TestDatabase::open().await;
        let result=AssertUnwindSafe(async {
            let server=CloudServer::from_pool(db.pool.clone(),db.schema.clone(),db.workspace_id.clone(),[7;32]).await.unwrap();
            let now=Utc::now().timestamp();
            let release="2026-09-25";
            sqlx::query("INSERT INTO cloud_cot_jobs(release_date,report_date,due_at,retry_at) VALUES($1,'2026-09-22',$2,$2)")
                .bind(release).bind(now+1800).execute(&db.pool).await.unwrap();
            assert!(server.cot_claim(release,now).await.unwrap().is_none(),"Never refresh before release + 30m");
            sqlx::query("UPDATE cloud_cot_jobs SET due_at=$1,retry_at=$1").bind(now-1).execute(&db.pool).await.unwrap();
            let (first,second)=tokio::join!(server.cot_claim(release,now),server.cot_claim(release,now));
            let winners=[first.unwrap(),second.unwrap()];
            assert_eq!(winners.iter().filter(|v|v.is_some()).count(),1);
            let lease=winners.into_iter().flatten().next().unwrap();
            let job=server.cot_job(release).await.unwrap().unwrap();
            assert_eq!(job.attempts,1);
            assert_eq!(job.status,"running");
            // An old delivery cannot release another worker's lease.
            server.cot_fail(release,&Uuid::new_v4().to_string()).await.unwrap();
            assert_eq!(server.cot_job(release).await.unwrap().unwrap().lease_until,now+LEASE_SECONDS);
            server.cot_fail(release,&lease).await.unwrap();
            assert!(server.cot_claim(release,now).await.unwrap().is_none(),"Retry delay persists across instances");
            sqlx::query("UPDATE cloud_cot_jobs SET attempts=8,retry_at=$1,lease_until=0").bind(now-1).execute(&db.pool).await.unwrap();
            assert!(server.cot_claim(release,now).await.unwrap().is_none());
            assert_eq!(server.cot_run(release).await.unwrap()["status"],"expired");
            let revision:i64=sqlx::query_scalar("SELECT revision FROM cloud_workspace WHERE id=1").fetch_one(&db.pool).await.unwrap();
            assert_eq!(revision,0);
            // Neither a missing signature nor a disabled scheduler can run a job.
            use axum::{body::Body,http::Request};
            use tower::ServiceExt;
            let response=router(server.clone()).oneshot(Request::builder().method("POST").uri("/internal/cot/run").header("content-type","application/json").body(Body::from(format!("{{\"releaseDate\":\"{release}\"}}"))).unwrap()).await.unwrap();
            assert_eq!(response.status(),StatusCode::UNAUTHORIZED);
            let body=serde_json::to_vec(&json!({"releaseDate":release})).unwrap();
            let nonce=Uuid::new_v4().to_string();
            let timestamp=Utc::now().timestamp().to_string();
            let mut mac=Hmac::<Sha256>::new_from_slice(&[7;32]).unwrap();
            mac.update(canonical(&timestamp,&nonce,"POST","/internal/cot/run",&body).as_bytes());
            let signed=Request::builder().method("POST").uri("/internal/cot/run")
                .header("content-type","application/json").header("x-macro-timestamp",timestamp)
                .header("x-macro-nonce",nonce).header("x-macro-signature",hex(&mac.finalize().into_bytes()))
                .body(Body::from(body)).unwrap();
            let response=router(server).oneshot(signed).await.unwrap();
            assert_eq!(response.status(),StatusCode::NOT_FOUND);
        }).catch_unwind().await;
        db.close().await;
        if let Err(error) = result {
            resume_unwind(error);
        }
    }
}

async fn is_current(pool: &sqlx::SqlitePool, expected: NaiveDate) -> CloudResult<bool> {
    let (active,complete):(i64,i64)=sqlx::query_as("SELECT (SELECT COUNT(*) FROM cot_contracts WHERE is_active=1),(SELECT COUNT(*) FROM cot_contracts c WHERE c.is_active=1 AND EXISTS(SELECT 1 FROM cot_legacy_observations o WHERE o.contract_id=c.id AND o.report_date>=?))")
        .bind(expected.to_string()).fetch_one(pool).await?;
    Ok(active == 35 && complete == active)
}
struct Scratch {
    directory: PathBuf,
    file: PathBuf,
    pool: Option<sqlx::SqlitePool>,
    permit: Option<tokio::sync::OwnedSemaphorePermit>,
}
impl Scratch {
    fn new(permit: tokio::sync::OwnedSemaphorePermit) -> CloudResult<Self> {
        let directory = std::env::temp_dir().join(format!("macro-cot-job-{}", Uuid::new_v4()));
        std::fs::create_dir(&directory).map_err(|_| unavailable())?;
        Ok(Self {
            file: directory.join("cot.sqlite"),
            directory,
            pool: None,
            permit: Some(permit),
        })
    }
}
impl Drop for Scratch {
    fn drop(&mut self) {
        let directory = self.directory.clone();
        let permit = self.permit.take();
        if let Some(pool) = self.pool.take()
            && let Ok(runtime) = tokio::runtime::Handle::try_current()
        {
            runtime.spawn(async move {
                pool.close().await;
                cleanup_scratch(&directory);
                drop(permit);
            });
        } else {
            cleanup_scratch(&directory);
        }
    }
}
fn cleanup_scratch(directory: &std::path::Path) {
    // Only filenames created by this one unique job; no recursive deletion.
    for suffix in ["", "-wal", "-shm", "-journal"] {
        let _ = std::fs::remove_file(directory.join(format!("cot.sqlite{suffix}")));
    }
    let _ = std::fs::remove_dir(directory);
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RunRequest {
    release_date: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CompleteRequest {
    release_date: String,
    lease_id: String,
}

pub(super) async fn route(
    State(server): State<Arc<CloudServer>>,
    OriginalUri(uri): OriginalUri,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    if !server
        .authenticate(&headers, "POST", &uri.to_string(), &body)
        .await
    {
        return unauthorized();
    }
    if !server.cot_enabled {
        return response(failure(
            StatusCode::NOT_FOUND,
            "COT_DISABLED",
            "Die automatische COT-Aktualisierung ist nicht aktiviert.",
            None,
        ));
    }
    if header(&headers, "content-type")
        .and_then(|s| s.split(';').next())
        .map(str::trim)
        != Some("application/json")
        || body.len() > 1024
    {
        return response(failure(
            StatusCode::BAD_REQUEST,
            "INVALID_REQUEST",
            "Ungültige COT-Anfrage.",
            None,
        ));
    }
    let result = match uri.path() {
        "/internal/cot/plan"
            if serde_json::from_slice::<Value>(&body).is_ok_and(|v| v == json!({})) =>
        {
            server.cot_plan().await
        }
        "/internal/cot/run" => match serde_json::from_slice::<RunRequest>(&body) {
            Ok(input) => server.cot_run(&input.release_date).await,
            Err(_) => Err(unavailable()),
        },
        "/internal/cot/complete" => match serde_json::from_slice::<CompleteRequest>(&body) {
            Ok(input) if canonical_uuid(&input.lease_id) && date(&input.release_date).is_ok() => {
                server
                    .cot_complete(&input.release_date, &input.lease_id)
                    .await
            }
            _ => Err(unavailable()),
        },
        _ => Err(unavailable()),
    };
    match result {
        Ok(value) if serde_json::to_vec(&value).is_ok_and(|v| v.len() <= MAX_RESPONSE_BYTES) => {
            response((StatusCode::OK, value))
        }
        _ => response(failure(
            StatusCode::SERVICE_UNAVAILABLE,
            "COT_JOB_UNAVAILABLE",
            "Die COT-Aktualisierung wird später erneut versucht.",
            None,
        )),
    }
}
