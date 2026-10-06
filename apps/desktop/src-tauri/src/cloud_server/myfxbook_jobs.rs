use super::{
    provider_jobs::{Job, unavailable},
    *,
};
use crate::{
    cloud_postgres::{
        CloudResult,
        myfxbook::{self, Credentials, Preview},
        myfxbook_apply,
    },
    commands::myfxbook::reconcile,
};

impl CloudServer {
    pub(super) async fn myfxbook_network(&self, command: &str, args: &Value) -> Outcome {
        let result = tokio::time::timeout(Duration::from_secs(80), async {
            if command == "myfxbook_login" {
                self.myfxbook_login(args).await
            } else {
                self.myfxbook_preview(args).await
            }
        })
        .await;
        let revision = self.revision().await.ok();
        match result {
            Ok(Ok(data)) => (
                StatusCode::OK,
                json!({"ok":true,"data":data,"revision":revision}),
            ),
            Ok(Err(error)) => failure(StatusCode::OK, &error.code, &error.message, revision),
            Err(_) => failure(
                StatusCode::OK,
                "MYFXBOOK_TIMEOUT",
                "Myfxbook hat nicht rechtzeitig geantwortet. Bitte erneut versuchen.",
                revision,
            ),
        }
    }
    async fn myfxbook_login(&self, args: &Value) -> CloudResult<Value> {
        let credentials: Credentials =
            serde_json::from_value(args.get("input").cloned().ok_or_else(myfxbook::invalid)?)?;
        let accounts = myfxbook::accounts(&credentials).await?;
        let id = Uuid::new_v4().to_string();
        let sealed = myfxbook::seal(&format!("auth:{id}"), &credentials)?;
        let mut tx = self.pool.begin().await?;
        self.scope(&mut tx).await?;
        let now = chrono::Utc::now().timestamp();
        sqlx::query("DELETE FROM cloud_myfxbook_authorizations WHERE expires_at<=$1")
            .bind(now)
            .execute(&mut *tx)
            .await?;
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM cloud_myfxbook_authorizations")
            .fetch_one(&mut *tx)
            .await?;
        if count >= 10 {
            return Err(myfxbook::invalid());
        }
        sqlx::query("INSERT INTO cloud_myfxbook_authorizations(id,sealed_credentials,expires_at) VALUES($1,$2,$3)").bind(&id).bind(sealed).bind(now+900).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(json!({"authorizationId":id,"accounts":accounts}))
    }
    async fn myfxbook_preview(&self, args: &Value) -> CloudResult<Value> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        struct Input {
            authorization_id: String,
            account_id: String,
            external_id: String,
            broker_timezone: String,
        }
        let input: Input =
            serde_json::from_value(args.get("input").cloned().ok_or_else(myfxbook::invalid)?)?;
        if !canonical_uuid(&input.authorization_id)
            || input.account_id.len() > 128
            || input.external_id.len() > 64
            || input.broker_timezone.len() > 100
            || input.broker_timezone.parse::<chrono_tz::Tz>().is_err()
        {
            return Err(myfxbook::invalid());
        }
        let mut tx = self.pool.begin().await?;
        self.scope(&mut tx).await?;
        let sealed:Option<String>=sqlx::query_scalar("SELECT sealed_credentials FROM cloud_myfxbook_authorizations WHERE id=$1 AND expires_at>$2").bind(&input.authorization_id).bind(chrono::Utc::now().timestamp()).fetch_optional(&mut *tx).await?;
        let credentials: Credentials = myfxbook::open(
            &format!("auth:{}", input.authorization_id),
            &sealed.ok_or_else(myfxbook::invalid)?,
        )?;
        let local = myfxbook_apply::load(&mut tx, &input.account_id).await?;
        tx.rollback().await?;
        let snapshot =
            myfxbook::snapshot(&credentials, &input.external_id, &input.broker_timezone).await?;
        let plan = reconcile::plan(&local, &snapshot).map_err(myfxbook::provider_error)?;
        let external_name = snapshot.account.name.clone();
        let preview = Preview {
            account_id: input.account_id.clone(),
            credentials,
            snapshot,
            fingerprint: local.fingerprint(),
            timezone: input.broker_timezone.clone(),
        };
        let id = Uuid::new_v4().to_string();
        let sealed = myfxbook::seal(&format!("preview:{id}"), &preview)?;
        let mut tx = self.pool.begin().await?;
        self.scope(&mut tx).await?;
        sqlx::query("DELETE FROM cloud_myfxbook_previews WHERE account_id=$1 OR expires_at<=$2")
            .bind(&input.account_id)
            .bind(chrono::Utc::now().timestamp())
            .execute(&mut *tx)
            .await?;
        sqlx::query("INSERT INTO cloud_myfxbook_previews(id,account_id,sealed_preview,expires_at) VALUES($1,$2,$3,$4)").bind(&id).bind(&input.account_id).bind(sealed).bind(chrono::Utc::now().timestamp()+600).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(
            json!({"previewId":id,"summary":plan.summary,"externalName":external_name,"brokerTimezone":input.broker_timezone}),
        )
    }
    pub(super) async fn myfxbook_run(&self, job: &Job, lease: &str) -> CloudResult<Value> {
        let payload: Value = serde_json::from_str(&job.payload_json)?;
        let account = payload["accountId"].as_str().ok_or_else(unavailable)?;
        let mut tx = self.pool.begin().await?;
        self.scope(&mut tx).await?;
        let local = myfxbook_apply::load(&mut tx, account).await?;
        let connection = local
            .connection
            .as_ref()
            .filter(|c| c.enabled && c.status != "action_required");
        let Some(connection) = connection else {
            sqlx::query("UPDATE cloud_provider_jobs SET status='cancelled',lease_until=0 WHERE id=$1 AND lease_id=$2").bind(&job.id).bind(lease).execute(&mut *tx).await?;
            tx.commit().await?;
            return Ok(json!({"status":"cancelled"}));
        };
        let sealed: String = sqlx::query_scalar(
            "SELECT sealed_credentials FROM cloud_myfxbook_credentials WHERE account_id=$1",
        )
        .bind(account)
        .fetch_one(&mut *tx)
        .await?;
        let credentials: Credentials = myfxbook::open(&format!("account:{account}"), &sealed)?;
        tx.rollback().await?;
        let result = async {
            let snapshot = myfxbook::snapshot(
                &credentials,
                &connection.external_id,
                &connection.broker_timezone,
            )
            .await?;
            let plan = reconcile::plan(&local, &snapshot).map_err(myfxbook::provider_error)?;
            Ok::<_, cloud_postgres::CloudError>((snapshot, plan))
        }
        .await;
        let (snapshot, plan) = match result {
            Ok(value) => value,
            Err(error) => {
                let temporary = matches!(
                    error.code.as_str(),
                    "MYFXBOOK_NETWORK" | "MYFXBOOK_PROVIDER" | "MYFXBOOK_CHANGED"
                );
                let mut tx = self.pool.begin().await?;
                self.scope(&mut tx).await?;
                let still_owned:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM cloud_provider_jobs WHERE id=$1 AND lease_id=$2 AND status='running' AND lease_until>$3)").bind(&job.id).bind(lease).bind(chrono::Utc::now().timestamp()).fetch_one(&mut *tx).await?;
                if still_owned {
                    sqlx::query("UPDATE myfxbook_connections SET status=$2,message=$3,last_attempt_at=$4,updated_at=$4 WHERE account_id=$1 AND enabled")
                        .bind(account).bind(if temporary{"error"}else{"action_required"}).bind(&error.message).bind(chrono::Utc::now().to_rfc3339()).execute(&mut *tx).await?;
                }
                tx.commit().await?;
                return Err(error);
            }
        };
        self.myfxbook_finish(job, lease, &local, &plan, &snapshot)
            .await
    }

    pub(super) async fn myfxbook_finish(
        &self,
        job: &Job,
        lease: &str,
        local: &reconcile::Local,
        plan: &reconcile::Plan,
        snapshot: &crate::commands::myfxbook::provider::Snapshot,
    ) -> CloudResult<Value> {
        let connection = local
            .connection
            .as_ref()
            .filter(|c| c.enabled)
            .ok_or_else(unavailable)?;
        let mut tx = self.pool.begin().await?;
        self.scope(&mut tx).await?;
        let revision: i64 = sqlx::query_scalar(
            "SELECT revision FROM cloud_workspace WHERE id=1 AND identity=$1 FOR UPDATE",
        )
        .bind(&self.workspace_id)
        .fetch_one(&mut *tx)
        .await?;
        let owned:Option<String>=sqlx::query_scalar("SELECT lease_id FROM cloud_provider_jobs WHERE id=$1 AND status='running' AND lease_until>$2 AND expires_at>$2 FOR UPDATE").bind(&job.id).bind(chrono::Utc::now().timestamp()).fetch_optional(&mut *tx).await?;
        if owned.as_deref() != Some(lease) {
            return Err(unavailable());
        }
        let changed = myfxbook::changes(local, plan);
        myfxbook::commit(
            &mut tx,
            local,
            plan,
            snapshot,
            &connection.broker_timezone,
            true,
        )
        .await?;
        let next = revision
            .checked_add(i64::from(changed))
            .filter(|r| *r <= MAX_REVISION)
            .ok_or_else(unavailable)?;
        if changed {
            sqlx::query("UPDATE cloud_workspace SET revision=$1 WHERE id=1 AND identity=$2")
                .bind(next)
                .bind(&self.workspace_id)
                .execute(&mut *tx)
                .await?;
        }
        sqlx::query("UPDATE cloud_provider_jobs SET status='complete',lease_until=0,completed_at=$3,outcome_json=$4 WHERE id=$1 AND lease_id=$2")
            .bind(&job.id).bind(lease).bind(chrono::Utc::now().timestamp()).bind(json!({"summary":plan.summary,"revision":next}).to_string()).execute(&mut *tx).await?;
        // Journal changes, before-images, revision and this receipt are atomic.
        // Redelivery after a lost COMMIT response reads 'complete' without import.
        tx.commit().await?;
        Ok(json!({"status":"complete"}))
    }
}
