use super::{CloudError, CloudResult, myfxbook_apply, provider_secrets};
use crate::commands::myfxbook::{
    Connection,
    provider::{Client, RemoteAccount, Snapshot},
    reconcile::{self, Local, Plan},
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::PgConnection;
use uuid::Uuid;

pub const COMMANDS: &[(&str, bool)] = &[
    ("myfxbook_connections", false),
    ("myfxbook_login", false),
    ("myfxbook_preview", false),
    ("myfxbook_activate", true),
    ("myfxbook_set_enabled", true),
    ("myfxbook_disconnect", true),
];
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Credentials {
    pub email: String,
    pub password: String,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Preview {
    pub account_id: String,
    pub credentials: Credentials,
    pub snapshot: Snapshot,
    pub fingerprint: String,
    pub timezone: String,
}
pub fn provider_error(error: crate::errors::CommandError) -> CloudError {
    // The native provider already excludes raw response bodies and credential URLs.
    CloudError::new(
        error.code,
        error.message.chars().take(500).collect::<String>(),
    )
}
pub fn invalid() -> CloudError {
    CloudError::validation(
        "Die Myfxbook-Eingabe ist ungültig oder abgelaufen. Bitte erneut prüfen.",
    )
}
fn scope(id: &str) -> CloudResult<String> {
    let workspace = std::env::var("MACRO_WORKSPACE_ID").map_err(|_| invalid())?;
    Ok(format!("personal-macro/myfxbook/v1/{workspace}/{id}"))
}
pub fn seal<T: Serialize>(id: &str, value: &T) -> CloudResult<String> {
    provider_secrets::seal(&scope(id)?, value)
}
pub fn open<T: serde::de::DeserializeOwned>(id: &str, value: &str) -> CloudResult<T> {
    provider_secrets::open(&scope(id)?, value)
}
async fn session(client: &Client, credentials: &Credentials) -> CloudResult<String> {
    if credentials.email.trim().is_empty()
        || credentials.email.len() > 254
        || credentials.password.is_empty()
        || credentials.password.len() > 1024
    {
        return Err(invalid());
    }
    let response = client
        .request(
            "login",
            &[
                ("email", credentials.email.trim()),
                ("password", &credentials.password),
            ],
        )
        .await
        .map_err(provider_error)?;
    response
        .get("session")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty() && s.len() <= 2048)
        .map(str::to_owned)
        .ok_or_else(invalid)
}
pub async fn accounts(credentials: &Credentials) -> CloudResult<Vec<RemoteAccount>> {
    let client = Client::new().map_err(provider_error)?;
    let session = session(&client, credentials).await?;
    let result = client.accounts(&session).await.map_err(provider_error);
    let _ = client.request("logout", &[("session", &session)]).await;
    result
}
pub async fn snapshot(
    credentials: &Credentials,
    external: &str,
    timezone: &str,
) -> CloudResult<Snapshot> {
    let client = Client::new().map_err(provider_error)?;
    let session = session(&client, credentials).await?;
    let result = client
        .snapshot(&session, external, timezone)
        .await
        .map_err(provider_error);
    let _ = client.request("logout", &[("session", &session)]).await;
    result
}
pub fn changes(local: &Local, plan: &Plan) -> bool {
    !plan.trades.is_empty()
        || !plan.flows.is_empty()
        || plan.links.iter().any(|l| {
            !local
                .links
                .iter()
                .any(|old| old.source_key == l.source_key && old.payload_json == l.payload_json)
        })
}
pub async fn commit(
    db: &mut PgConnection,
    local: &Local,
    plan: &Plan,
    snapshot: &Snapshot,
    timezone: &str,
    enabled: bool,
) -> CloudResult<()> {
    if myfxbook_apply::load(db, &local.account_id)
        .await?
        .fingerprint()
        != plan.fingerprint
    {
        return Err(CloudError::new(
            "CONFLICT",
            "Das Konto hat sich seit der Vorschau verändert. Bitte erneut prüfen.",
        ));
    }
    let now = Utc::now().to_rfc3339();
    if changes(local, plan) {
        let before:String=sqlx::query_scalar("SELECT jsonb_build_object('account',(SELECT to_jsonb(a) FROM accounts a WHERE id=$1),'trades',COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM trades t WHERE account_id=$1),'[]'::jsonb),'cashflows',COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM account_cashflows c WHERE account_id=$1),'[]'::jsonb),'links',COALESCE((SELECT jsonb_agg(to_jsonb(l)) FROM myfxbook_links l WHERE account_id=$1),'[]'::jsonb))::text")
            .bind(&local.account_id).fetch_one(&mut *db).await?;
        if before.len() > 4 * 1024 * 1024 {
            return Err(CloudError::validation(
                "Das Konto benötigt vor dem Import eine separate Sicherung.",
            ));
        }
        sqlx::query("INSERT INTO cloud_myfxbook_imports(id,account_id,created_at,before_json,result_json) VALUES($1,$2,$3,$4,$5)")
            .bind(Uuid::new_v4().to_string()).bind(&local.account_id).bind(&now).bind(before)
            .bind(json!({"summary":plan.summary,"pnlMode":plan.mode,"timezone":timezone,"tradeIds":plan.trades.iter().map(|t|&t.id).collect::<Vec<_>>(),"cashflowIds":plan.flows.iter().map(|(id,_)|id).collect::<Vec<_>>(),"sourceKeys":plan.links.iter().map(|l|&l.source_key).collect::<Vec<_>>(),"sourcePayloads":plan.links.iter().map(|l|&l.payload_json).collect::<Vec<_>>()}).to_string()).execute(&mut *db).await?;
    }
    sqlx::query("INSERT INTO myfxbook_connections(account_id,external_id,external_name,currency,broker_timezone,pnl_mode,enabled,status,message,last_attempt_at,last_sync_at,last_provider_at,balance_minor,history_keys_json,backup_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11,$12,$13,$10,$10) ON CONFLICT(account_id) DO UPDATE SET external_name=excluded.external_name,broker_timezone=excluded.broker_timezone,pnl_mode=excluded.pnl_mode,enabled=excluded.enabled,status=excluded.status,message=excluded.message,last_attempt_at=excluded.last_attempt_at,last_sync_at=excluded.last_sync_at,last_provider_at=excluded.last_provider_at,balance_minor=excluded.balance_minor,history_keys_json=excluded.history_keys_json,backup_at=excluded.backup_at,updated_at=excluded.updated_at")
        .bind(&local.account_id).bind(&snapshot.account.id).bind(&snapshot.account.name).bind(&snapshot.account.currency).bind(timezone).bind(&plan.mode).bind(enabled)
        .bind(if enabled{"connected"}else{"paused"}).bind("Trades und Kontosummen erfolgreich abgeglichen. Automatischer Cloud-Abgleich alle sechs Stunden.").bind(&now).bind(&snapshot.account.updated_at).bind(snapshot.account.balance_minor).bind(serde_json::to_string(&snapshot.history_keys)?).execute(&mut *db).await?;
    if changes(local, plan) {
        myfxbook_apply::apply(db, local, plan, snapshot, timezone, &now).await?;
    }
    Ok(())
}
pub async fn dispatch(db: &mut PgConnection, name: &str, args: &Value) -> CloudResult<Value> {
    match name {
        "myfxbook_connections" => {
            let rows: Vec<Connection> =
                sqlx::query_as("SELECT * FROM myfxbook_connections ORDER BY account_id")
                    .fetch_all(db)
                    .await?;
            Ok(serde_json::to_value(rows)?)
        }
        "myfxbook_activate" => {
            let id = args["previewId"].as_str().ok_or_else(invalid)?;
            let sealed:Option<String>=sqlx::query_scalar("SELECT sealed_preview FROM cloud_myfxbook_previews WHERE id=$1 AND expires_at>$2 FOR UPDATE").bind(id).bind(Utc::now().timestamp()).fetch_optional(&mut *db).await?;
            let preview: Preview = open(&format!("preview:{id}"), &sealed.ok_or_else(invalid)?)?;
            let local = myfxbook_apply::load(db, &preview.account_id).await?;
            if local.fingerprint() != preview.fingerprint {
                return Err(CloudError::new(
                    "CONFLICT",
                    "Das Konto wurde seit der Vorschau geändert. Bitte erneut prüfen.",
                ));
            }
            let plan = reconcile::plan(&local, &preview.snapshot).map_err(provider_error)?;
            commit(
                db,
                &local,
                &plan,
                &preview.snapshot,
                &preview.timezone,
                true,
            )
            .await?;
            let encrypted = seal(
                &format!("account:{}", preview.account_id),
                &preview.credentials,
            )?;
            sqlx::query("INSERT INTO cloud_myfxbook_credentials(account_id,sealed_credentials) VALUES($1,$2) ON CONFLICT(account_id) DO UPDATE SET sealed_credentials=excluded.sealed_credentials").bind(&preview.account_id).bind(encrypted).execute(&mut *db).await?;
            sqlx::query("DELETE FROM cloud_myfxbook_previews WHERE account_id=$1")
                .bind(&preview.account_id)
                .execute(&mut *db)
                .await?;
            Ok(serde_json::to_value(plan.summary)?)
        }
        "myfxbook_set_enabled" | "myfxbook_disconnect" => {
            let account = args["accountId"].as_str().ok_or_else(invalid)?;
            let enabled =
                name == "myfxbook_set_enabled" && args["enabled"].as_bool().ok_or_else(invalid)?;
            if enabled {
                let available:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM myfxbook_connections c JOIN cloud_myfxbook_credentials s ON s.account_id=c.account_id WHERE c.account_id=$1 AND c.status!='action_required')").bind(account).fetch_one(&mut *db).await?;
                if !available {
                    return Err(CloudError::validation(
                        "Bitte Myfxbook erneut anmelden und die Vorschau prüfen.",
                    ));
                }
            }
            let status = if name == "myfxbook_disconnect" {
                "disconnected"
            } else if enabled {
                "connected"
            } else {
                "paused"
            };
            let count=sqlx::query("UPDATE myfxbook_connections SET enabled=$2,status=$3,updated_at=$4 WHERE account_id=$1").bind(account).bind(enabled).bind(status).bind(Utc::now().to_rfc3339()).execute(&mut *db).await?.rows_affected();
            if count != 1 {
                return Err(invalid());
            }
            if !enabled {
                sqlx::query("UPDATE cloud_provider_jobs SET status='cancelled',lease_until=0,stage_json=NULL WHERE kind='myfxbook' AND payload_json::jsonb->>'accountId'=$1 AND status IN ('pending','running','staged')").bind(account).execute(&mut *db).await?;
            }
            if name == "myfxbook_disconnect" {
                sqlx::query("DELETE FROM cloud_myfxbook_credentials WHERE account_id=$1")
                    .bind(account)
                    .execute(&mut *db)
                    .await?;
                sqlx::query("DELETE FROM cloud_myfxbook_previews WHERE account_id=$1")
                    .bind(account)
                    .execute(&mut *db)
                    .await?;
            }
            Ok(Value::Null)
        }
        _ => Err(invalid()),
    }
}
