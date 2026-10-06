//! Durable jobs: PostgreSQL leases and completion receipts survive restarts and
//! duplicate Queue deliveries. Provider network requests run outside transactions.
use super::*;
use crate::cloud_postgres::{CloudError, CloudResult};
use chrono::{Datelike, Duration as ChronoDuration, TimeZone, Utc};
use serde::{Deserialize, Serialize};

pub(super) const MAX_ATTEMPTS: i32 = 8;
pub(super) const LEASE_SECONDS: i64 = 240;

#[derive(Clone, sqlx::FromRow)]
pub(super) struct Job {
    pub id: String,
    pub kind: String,
    pub payload_json: String,
    pub due_at: i64,
    pub retry_at: i64,
    pub expires_at: i64,
    pub status: String,
    pub attempts: i32,
    pub lease_id: Option<String>,
    pub lease_until: i64,
    pub stage_json: Option<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct MacroPayload {
    pub currency: String,
    pub from: i64,
    pub to: i64,
    pub released_at: Option<i64>,
}
pub(super) fn unavailable() -> CloudError {
    CloudError::new(
        "PROVIDER_JOB_UNAVAILABLE",
        "Die automatische Aktualisierung wird später erneut versucht.",
    )
}
pub(super) fn wait(until: i64) -> Value {
    json!({"status":"wait","retryAt":chrono::DateTime::from_timestamp(until,0).unwrap_or_default().to_rfc3339()})
}
pub(super) async fn enqueue(
    conn: &mut PgConnection,
    key: &str,
    kind: &str,
    payload: Value,
    due: i64,
    expires: i64,
) -> CloudResult<()> {
    sqlx::query("INSERT INTO cloud_provider_jobs(id,task_key,kind,payload_json,due_at,retry_at,expires_at) VALUES($1,$2,$3,$4,$5,$5,$6) ON CONFLICT(task_key) DO UPDATE SET status='pending',attempts=0,lease_id=NULL,lease_until=0,retry_at=excluded.retry_at,error_code=NULL WHERE cloud_provider_jobs.kind='myfxbook' AND cloud_provider_jobs.status='cancelled'")
        .bind(Uuid::new_v4().to_string()).bind(key).bind(kind).bind(payload.to_string()).bind(due).bind(expires).execute(conn).await?;
    Ok(())
}
pub(super) fn week_anchor(now: chrono::DateTime<Utc>) -> chrono::NaiveDate {
    let local = now.with_timezone(&chrono_tz::Europe::Berlin).date_naive();
    let weekday = local.weekday().num_days_from_monday();
    local + ChronoDuration::days(if weekday == 6 { 1 } else { -(weekday as i64) })
}

impl CloudServer {
    pub(super) async fn provider_status(&self) -> CloudResult<Value> {
        if !(self.economic_enabled || self.myfxbook_enabled) {
            return Ok(
                json!({"economicEnabled":false,"myfxbookEnabled":false,"nextRunAt":null,"lastCompletedAt":null,"failedJobs":0}),
            );
        }
        let mut tx = self.pool.begin().await?;
        self.scope(&mut tx).await?;
        let next:Option<i64>=sqlx::query_scalar("SELECT MIN(GREATEST(due_at,retry_at,lease_until)) FROM cloud_provider_jobs WHERE kind IN ('macro-plan','macro-release') AND status IN ('pending','running','staged') AND expires_at>$1").bind(Utc::now().timestamp()).fetch_one(&mut *tx).await?;
        let last: Option<i64> = sqlx::query_scalar(
            "SELECT MAX(completed_at) FROM cloud_provider_jobs WHERE kind IN ('macro-plan','macro-release') AND status='complete'",
        )
        .fetch_one(&mut *tx)
        .await?;
        let failed: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM cloud_provider_jobs WHERE kind IN ('macro-plan','macro-release') AND status='expired' AND expires_at>$1",
        )
        .bind(Utc::now().timestamp() - 7 * 86400)
        .fetch_one(&mut *tx)
        .await?;
        tx.rollback().await?;
        let time = |value: Option<i64>| {
            value
                .and_then(|v| chrono::DateTime::from_timestamp(v, 0))
                .map(|v| v.to_rfc3339())
        };
        Ok(
            json!({"economicEnabled":self.economic_enabled,"myfxbookEnabled":self.myfxbook_enabled,"nextRunAt":time(next),"lastCompletedAt":time(last),"failedJobs":failed}),
        )
    }
    pub(super) async fn provider_job(&self, id: &str) -> CloudResult<Job> {
        let mut tx = self.pool.begin().await?;
        self.scope(&mut tx).await?;
        let job=sqlx::query_as("SELECT id,kind,payload_json,due_at,retry_at,expires_at,status,attempts,lease_id,lease_until,stage_json FROM cloud_provider_jobs WHERE id=$1").bind(id).fetch_one(&mut *tx).await?;
        tx.rollback().await?;
        Ok(job)
    }
    async fn providers_plan(&self) -> CloudResult<Value> {
        let now = Utc::now();
        let mut tx = self.pool.begin().await?;
        self.scope(&mut tx).await?;
        // Weekly planning is keyed by the next Monday on Sundays, current Monday
        // otherwise. Daily dispatch recovers missed invocations without re-fetching.
        if self.economic_enabled {
            let week = week_anchor(now);
            let start = Utc.from_utc_datetime(&week.and_hms_opt(0, 0, 0).ok_or_else(unavailable)?);
            for currency in crate::commands::eodhd_cloud::CURRENCIES {
                let payload = MacroPayload {
                    currency: currency.into(),
                    from: (start - ChronoDuration::days(7)).timestamp(),
                    to: (start + ChronoDuration::days(7)).timestamp() - 1,
                    released_at: None,
                };
                enqueue(
                    &mut tx,
                    &format!("macro-week:{week}:{currency}"),
                    "macro-plan",
                    serde_json::to_value(payload)?,
                    now.timestamp(),
                    now.timestamp() + 7 * 86400,
                )
                .await?;
            }
        }
        if self.myfxbook_enabled {
            let accounts:Vec<String>=sqlx::query_scalar("SELECT c.account_id FROM myfxbook_connections c JOIN accounts a ON a.id=c.account_id JOIN cloud_myfxbook_credentials s ON s.account_id=c.account_id WHERE c.enabled AND NOT a.is_archived AND c.status!='action_required' ORDER BY c.account_id LIMIT 20").fetch_all(&mut *tx).await?;
            let first = now.timestamp().div_euclid(21600) * 21600;
            for account in accounts {
                for n in 0..=4 {
                    let due = first + n * 21600;
                    enqueue(
                        &mut tx,
                        &format!("myfxbook:{account}:{due}"),
                        "myfxbook",
                        json!({"accountId":account}),
                        due,
                        due + 21600,
                    )
                    .await?;
                }
            }
        }
        if self.reports_enabled {
            // Daily polling stays within the existing Hobby cron/queue service.
            for source in crate::commands::central_bank_reports::cloud::sources() {
                enqueue(
                    &mut tx,
                    &format!("report-source:{source}:{}", now.format("%Y-%m-%d")),
                    "report-discover",
                    json!({"sourceId":source,"catchup":false}),
                    now.timestamp(),
                    now.timestamp() + 86400,
                )
                .await?;
            }
        }
        sqlx::query("UPDATE cloud_provider_jobs SET status='expired',error_code='JOB_EXPIRED' WHERE status IN ('pending','running','staged') AND expires_at<=$1 AND lease_until<=$1").bind(now.timestamp()).execute(&mut *tx).await?;
        sqlx::query("DELETE FROM cloud_myfxbook_authorizations WHERE expires_at<$1")
            .bind(now.timestamp())
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM cloud_myfxbook_previews WHERE expires_at<$1")
            .bind(now.timestamp())
            .execute(&mut *tx)
            .await?;
        let rows:Vec<(String,i64)>=sqlx::query_as("SELECT id,GREATEST(due_at,retry_at,lease_until,$1) FROM cloud_provider_jobs WHERE status IN ('pending','running','staged') AND attempts<8 AND expires_at>$1 AND GREATEST(due_at,retry_at,lease_until)<$2 ORDER BY due_at,id LIMIT 256")
            .bind(now.timestamp()).bind(now.timestamp()+86400).fetch_all(&mut *tx).await?;
        tx.commit().await?;
        Ok(
            json!({"jobs":rows.into_iter().map(|(id,at)|json!({"jobId":id,"dueAt":chrono::DateTime::from_timestamp(at,0).unwrap_or_default().to_rfc3339()})).collect::<Vec<_>>()}),
        )
    }
    pub(super) async fn provider_fail(
        &self,
        id: &str,
        lease: &str,
        code: &str,
    ) -> CloudResult<Value> {
        let now = Utc::now().timestamp();
        let mut tx = self.pool.begin().await?;
        self.scope(&mut tx).await?;
        let report_payload:Option<String>=sqlx::query_scalar("SELECT payload_json FROM cloud_provider_jobs WHERE id=$1 AND lease_id=$2 AND kind='report-discover' AND status IN ('running','staged')").bind(id).bind(lease).fetch_optional(&mut *tx).await?;
        if let Some(payload) = report_payload {
            self.report_discovery_failed(&mut tx, &payload).await?;
        }
        sqlx::query("UPDATE cloud_provider_jobs SET status=CASE WHEN attempts>=8 OR expires_at<=$3+1800 THEN 'expired' ELSE 'pending' END,retry_at=$3+1800,lease_until=0,stage_json=NULL,error_code=$4 WHERE id=$1 AND lease_id=$2 AND status IN ('running','staged')")
            .bind(id).bind(lease).bind(now).bind(code).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(wait(now + 1800))
    }
    async fn provider_run(&self, id: &str) -> CloudResult<Value> {
        let job = self.provider_job(id).await?;
        let now = Utc::now().timestamp();
        if matches!(job.status.as_str(), "complete" | "cancelled" | "expired") {
            return Ok(json!({"status":job.status}));
        }
        if job.expires_at <= now || job.attempts >= MAX_ATTEMPTS {
            let mut tx = self.pool.begin().await?;
            self.scope(&mut tx).await?;
            sqlx::query("UPDATE cloud_provider_jobs SET status='expired',error_code='JOB_EXPIRED',stage_json=NULL WHERE id=$1 AND status IN ('pending','running','staged') AND lease_until<=$2").bind(id).bind(now).execute(&mut *tx).await?;
            tx.commit().await?;
            return Ok(json!({"status":"expired"}));
        }
        if job.kind == "myfxbook" && !self.myfxbook_enabled
            || job.kind.starts_with("macro-") && !self.economic_enabled
            || job.kind.starts_with("report-") && !self.reports_enabled
        {
            return Err(unavailable());
        }
        if job.status == "staged"
            && let Some(lease) = &job.lease_id
            && let Ok(result) = if job.kind.starts_with("report-") {
                self.report_complete(id, lease).await
            } else {
                self.economic_complete(id, lease).await
            }
        {
            return Ok(result);
        }
        if now < job.due_at.max(job.retry_at).max(job.lease_until) {
            return Ok(wait(job.due_at.max(job.retry_at).max(job.lease_until)));
        }
        let lease = Uuid::new_v4().to_string();
        let mut tx = self.pool.begin().await?;
        self.scope(&mut tx).await?;
        let claimed=sqlx::query("UPDATE cloud_provider_jobs SET status='running',attempts=attempts+1,lease_id=$2,lease_until=$3,error_code=NULL WHERE id=$1 AND status IN ('pending','running','staged') AND due_at<=$4 AND retry_at<=$4 AND lease_until<=$4 AND expires_at>$4 AND attempts<8")
            .bind(id).bind(&lease).bind(now+LEASE_SECONDS).bind(now).execute(&mut *tx).await?.rows_affected()==1;
        tx.commit().await?;
        if !claimed {
            return Ok(wait(now + LEASE_SECONDS));
        }
        let result = tokio::time::timeout(Duration::from_secs(90), async {
            if job.kind == "myfxbook" {
                self.myfxbook_run(&job, &lease).await
            } else if job.kind.starts_with("report-") {
                self.report_prepare(&job, &lease).await
            } else {
                self.economic_prepare(&job, &lease).await
            }
        })
        .await;
        match result {
            Ok(Ok(value)) => Ok(value),
            _ => {
                self.provider_fail(id, &lease, "PROVIDER_OR_STORAGE_UNAVAILABLE")
                    .await
            }
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Request {
    job_id: String,
    lease_id: Option<String>,
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
    if !(server.economic_enabled || server.myfxbook_enabled || server.reports_enabled) {
        return response((StatusCode::NOT_FOUND, json!({"ok":false})));
    }
    if header(&headers, "content-type")
        .and_then(|s| s.split(';').next())
        .map(str::trim)
        != Some("application/json")
        || body.len() > 4096
    {
        return response((StatusCode::BAD_REQUEST, json!({"ok":false})));
    }
    let result = match uri.path() {
        "/internal/providers/retire"
            if serde_json::from_slice::<Value>(&body).is_ok_and(|v| v == json!({})) =>
        {
            server.provider_retire().await
        }
        "/internal/providers/retired" => {
            #[derive(Deserialize)]
            #[serde(deny_unknown_fields)]
            struct Retired {
                paths: Vec<String>,
            }
            match serde_json::from_slice::<Retired>(&body) {
                Ok(input) => server.provider_retired(&input.paths).await,
                Err(_) => Err(unavailable()),
            }
        }
        "/internal/providers/plan"
            if serde_json::from_slice::<Value>(&body).is_ok_and(|v| v == json!({})) =>
        {
            server.providers_plan().await
        }
        path => match serde_json::from_slice::<Request>(&body) {
            Ok(input) if canonical_uuid(&input.job_id) => match (path, input.lease_id) {
                ("/internal/providers/run", None) => server.provider_run(&input.job_id).await,
                ("/internal/providers/complete", Some(lease)) if canonical_uuid(&lease) => {
                    match server.provider_job(&input.job_id).await {
                        Ok(job) if job.kind.starts_with("report-") => {
                            server.report_complete(&input.job_id, &lease).await
                        }
                        Ok(_) => server.economic_complete(&input.job_id, &lease).await,
                        Err(error) => Err(error),
                    }
                }
                _ => Err(unavailable()),
            },
            _ => Err(unavailable()),
        },
    };
    match result {
        Ok(value) if value.to_string().len() <= MAX_RESPONSE_BYTES => {
            response((StatusCode::OK, value))
        }
        _ => response(failure(
            StatusCode::SERVICE_UNAVAILABLE,
            "PROVIDER_JOB_UNAVAILABLE",
            "Die automatische Aktualisierung wird später erneut versucht.",
            None,
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    #[ignore = "Requires MACRO_TEST_ENV_FILE; a disposable Neon schema, no provider calls"]
    async fn report_cloud_daily_planning_deduplicates_the_twelve_allowlisted_sources() {
        use crate::cloud_postgres::test_support::TestDatabase;
        use futures_util::FutureExt;
        let db = TestDatabase::open().await;
        let result = std::panic::AssertUnwindSafe(async {
            let mut server = CloudServer::from_pool(
                db.pool.clone(),
                db.schema.clone(),
                db.workspace_id.clone(),
                [71; 32],
            )
            .await
            .unwrap();
            assert!(
                server.providers_plan().await.unwrap()["jobs"]
                    .as_array()
                    .unwrap()
                    .is_empty()
            );
            Arc::get_mut(&mut server).unwrap().reports_enabled = true;
            for _ in 0..2 {
                assert_eq!(
                    server.providers_plan().await.unwrap()["jobs"]
                        .as_array()
                        .unwrap()
                        .len(),
                    12
                );
            }
            let rows: Vec<(String, String)> =
                sqlx::query_as("SELECT kind,payload_json FROM cloud_provider_jobs")
                    .fetch_all(&db.pool)
                    .await
                    .unwrap();
            assert_eq!(rows.len(), 12);
            for (kind, payload) in rows {
                assert_eq!(kind, "report-discover");
                let value: Value = serde_json::from_str(&payload).unwrap();
                assert!(
                    crate::commands::central_bank_reports::cloud::source_bank(
                        value["sourceId"].as_str().unwrap()
                    )
                    .is_some()
                );
            }
            assert_eq!(server.revision().await.unwrap(), 0);
        })
        .catch_unwind()
        .await;
        db.close().await;
        if let Err(error) = result {
            std::panic::resume_unwind(error)
        }
    }
    #[test]
    fn sunday_prepares_next_week_and_other_days_recover_same_week() {
        for (at, expected) in [
            ("2026-09-27T12:00:00Z", "2026-09-28"),
            ("2026-09-28T12:00:00Z", "2026-09-28"),
            ("2026-10-25T02:30:00Z", "2026-10-26"),
        ] {
            assert_eq!(
                week_anchor(
                    chrono::DateTime::parse_from_rfc3339(at)
                        .unwrap()
                        .with_timezone(&Utc)
                )
                .to_string(),
                expected
            );
        }
    }

    #[tokio::test]
    #[ignore = "Requires explicitly selected isolated PostgreSQL test database"]
    async fn provider_planning_is_idempotent_release_delayed_and_reactivation_requeues_cancelled_slots()
     {
        use crate::cloud_postgres::test_support::TestDatabase;
        use futures_util::FutureExt;
        use std::panic::{AssertUnwindSafe, resume_unwind};
        let db = TestDatabase::open().await;
        let result=AssertUnwindSafe(async {
            let mut server=CloudServer::from_pool(db.pool.clone(),db.schema.clone(),db.workspace_id.clone(),[7;32]).await.unwrap();
            let flags=Arc::get_mut(&mut server).unwrap();flags.economic_enabled=true;flags.myfxbook_enabled=true;
            for _ in 0..2 {let plan=server.providers_plan().await.unwrap();assert_eq!(plan["jobs"].as_array().unwrap().len(),9);}
            let count:i64=sqlx::query_scalar("SELECT COUNT(*) FROM cloud_provider_jobs").fetch_one(&db.pool).await.unwrap();assert_eq!(count,9);
            let mut tx=db.pool.begin().await.unwrap();let now=Utc::now().timestamp();
            enqueue(&mut tx,"future-release","macro-release",json!({"currency":"USD","from":now,"to":now+86400,"releasedAt":now}),now+3600,now+86400).await.unwrap();
            enqueue(&mut tx,"account-slot","myfxbook",json!({"accountId":"synthetic-account"}),now-1,now+21600).await.unwrap();tx.commit().await.unwrap();
            let future:String=sqlx::query_scalar("SELECT id FROM cloud_provider_jobs WHERE task_key='future-release'").fetch_one(&db.pool).await.unwrap();
            assert_eq!(server.provider_run(&future).await.unwrap()["status"],"wait");
            sqlx::query("UPDATE cloud_provider_jobs SET status='cancelled',attempts=3,lease_id='old-lease' WHERE task_key='account-slot'").execute(&db.pool).await.unwrap();
            let mut tx=db.pool.begin().await.unwrap();enqueue(&mut tx,"account-slot","myfxbook",json!({"accountId":"synthetic-account"}),now-1,now+21600).await.unwrap();tx.commit().await.unwrap();
            let state:(String,i32,Option<String>)=sqlx::query_as("SELECT status,attempts,lease_id FROM cloud_provider_jobs WHERE task_key='account-slot'").fetch_one(&db.pool).await.unwrap();
            assert_eq!(state,("pending".into(),0,None));assert_eq!(server.revision().await.unwrap(),0);
        }).catch_unwind().await;
        db.close().await;
        if let Err(error) = result {
            resume_unwind(error);
        }
    }
}
