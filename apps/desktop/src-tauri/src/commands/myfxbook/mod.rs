mod diagnostics;
pub(crate) mod provider;
pub(crate) mod reconcile;
#[cfg(test)]
mod tests;

use crate::runtime::{AppHandle, State};
use crate::{
    database::AppState,
    errors::{CommandError, CommandResult},
};
use chrono::{Duration, Utc};
use keyring::Entry;
use provider::{Client, RemoteAccount, Snapshot};
use reconcile::{Local, Plan, Summary};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use std::{collections::HashMap, sync::LazyLock};
use tokio::sync::Mutex;
use uuid::Uuid;

type Result<T> = CommandResult<T>;
const SERVICE: &str = "com.personal-macro.app.myfxbook";
// Network, activation, pause and disconnect share a lock. A queued sync cannot
// resurrect a disconnected connection or race another reconciliation.
static OPERATION: Mutex<()> = Mutex::const_new(());
static AUTH: LazyLock<Mutex<HashMap<String, Authorization>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static PREVIEWS: LazyLock<Mutex<HashMap<String, Preview>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn error(code: &str, message: &str) -> CommandError {
    CommandError {
        code: code.into(),
        message: message.into(),
        details: None,
    }
}
fn busy() -> CommandError {
    error(
        "MYFXBOOK_BUSY",
        "Ein Myfxbook-Vorgang läuft bereits. Bitte kurz warten.",
    )
}
fn credential_error() -> CommandError {
    error(
        "MYFXBOOK_AUTH",
        "Die geschützte Myfxbook-Sitzung fehlt. Bitte erneut anmelden.",
    )
}
fn session_load(account: &str) -> Result<String> {
    Entry::new(SERVICE, account)
        .and_then(|e| e.get_password())
        .map_err(|_| credential_error())
}
fn session_store(account: &str, session: &str) -> Result<()> {
    Entry::new(SERVICE, account)
        .and_then(|e| e.set_password(session))
        .map_err(|_| {
            error(
                "MYFXBOOK_CREDENTIAL",
                "Die Sitzung konnte nicht im Windows-Anmeldedatenspeicher gesichert werden.",
            )
        })
}

#[derive(Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Connection {
    pub account_id: String,
    pub external_id: String,
    pub external_name: String,
    pub currency: String,
    pub broker_timezone: String,
    pub pnl_mode: String,
    pub enabled: bool,
    pub status: String,
    pub message: String,
    pub last_attempt_at: Option<String>,
    pub last_sync_at: Option<String>,
    pub last_provider_at: Option<String>,
    pub balance_minor: Option<i64>,
    #[serde(skip_serializing)]
    pub history_keys_json: String,
    #[serde(skip_serializing)]
    pub backup_at: Option<String>,
    pub updated_at: String,
}
#[derive(Clone)]
struct Authorization {
    session: String,
    accounts: Vec<RemoteAccount>,
    expires: chrono::DateTime<Utc>,
}
struct Preview {
    session: String,
    local: Local,
    plan: Plan,
    snapshot: Snapshot,
    timezone: String,
    expires: chrono::DateTime<Utc>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginResult {
    authorization_id: String,
    accounts: Vec<RemoteAccount>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginInput {
    email: String,
    password: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewInput {
    authorization_id: String,
    account_id: String,
    external_id: String,
    broker_timezone: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewResult {
    preview_id: String,
    summary: Summary,
    external_name: String,
    broker_timezone: String,
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn myfxbook_login(input: LoginInput) -> Result<LoginResult> {
    let _guard = OPERATION.try_lock().map_err(|_| busy())?;
    if input.email.trim().is_empty()
        || input.email.len() > 254
        || input.password.is_empty()
        || input.password.len() > 1024
    {
        return Err(error(
            "VALIDATION_ERROR",
            "Bitte Myfxbook-E-Mail und Passwort eingeben.",
        ));
    }
    let client = Client::new()?;
    let response = client
        .request(
            "login",
            &[("email", input.email.trim()), ("password", &input.password)],
        )
        .await?;
    let session = response
        .get("session")
        .and_then(serde_json::Value::as_str)
        .filter(|s| !s.is_empty() && s.len() < 2000)
        .ok_or_else(provider::invalid)?
        .to_string();
    let accounts = client.accounts(&session).await?;
    let id = Uuid::new_v4().to_string();
    let mut pending = AUTH.lock().await;
    pending.retain(|_, v| v.expires > Utc::now());
    if pending.len() >= 5 {
        pending.clear();
    }
    pending.insert(
        id.clone(),
        Authorization {
            session,
            accounts: accounts.clone(),
            expires: Utc::now() + Duration::minutes(15),
        },
    );
    Ok(LoginResult {
        authorization_id: id,
        accounts,
    })
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn myfxbook_connections(state: State<'_, AppState>) -> Result<Vec<Connection>> {
    connections(&state).await
}
async fn connections(state: &AppState) -> Result<Vec<Connection>> {
    Ok(sqlx::query_as("SELECT c.* FROM myfxbook_connections c JOIN accounts a ON a.id=c.account_id WHERE a.is_archived=0 ORDER BY c.account_id").fetch_all(&state.db).await?)
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn myfxbook_preview(
    state: State<'_, AppState>,
    input: PreviewInput,
) -> Result<PreviewResult> {
    let _guard = OPERATION.try_lock().map_err(|_| busy())?;
    let auth = AUTH
        .lock()
        .await
        .get(&input.authorization_id)
        .filter(|a| a.expires > Utc::now())
        .cloned()
        .ok_or_else(credential_error)?;
    if !auth.accounts.iter().any(|a| a.id == input.external_id) {
        return Err(error(
            "MYFXBOOK_ACCOUNT",
            "Bitte ein Portfolio aus der angemeldeten Sitzung wählen.",
        ));
    }
    let snapshot = match Client::new()?
        .snapshot(&auth.session, &input.external_id, &input.broker_timezone)
        .await
    {
        Ok(snapshot) => snapshot,
        Err(failure) => {
            return Err(
                diagnostics::save_preview_failure(&state, &input, failure, None, None).await,
            );
        }
    };
    let mut db = state.db.acquire().await?;
    let local = reconcile::load(&mut db, &input.account_id).await?;
    drop(db);
    let mut baseline = local.clone();
    // An explicit new preview can re-establish continuity after a statement import;
    // all individual identities and global totals still have to reconcile exactly.
    if let Some(c) = &mut baseline.connection {
        c.history_keys_json = "[]".into();
        if c.broker_timezone != input.broker_timezone {
            return Err(error(
                "MYFXBOOK_TIMEZONE",
                "Die Brokerzeitzone einer bestehenden Verbindung darf nicht still geändert werden.",
            ));
        }
    }
    let mut plan = match reconcile::plan(&baseline, &snapshot) {
        Ok(plan) => plan,
        Err(failure) => {
            return Err(diagnostics::save_preview_failure(
                &state,
                &input,
                failure,
                Some(&snapshot),
                Some(&local),
            )
            .await);
        }
    };
    plan.fingerprint = local.fingerprint();
    let preview_id = Uuid::new_v4().to_string();
    let output = PreviewResult {
        preview_id: preview_id.clone(),
        summary: plan.summary.clone(),
        external_name: snapshot.account.name.clone(),
        broker_timezone: input.broker_timezone.clone(),
    };
    let mut pending = PREVIEWS.lock().await;
    pending.retain(|_, p| p.expires > Utc::now());
    if pending.len() >= 5 {
        pending.clear();
    }
    pending.insert(
        preview_id,
        Preview {
            session: auth.session,
            local,
            plan,
            snapshot,
            timezone: input.broker_timezone,
            expires: Utc::now() + Duration::minutes(10),
        },
    );
    Ok(output)
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn myfxbook_activate(
    state: State<'_, AppState>,
    app: AppHandle,
    preview_id: String,
) -> Result<Summary> {
    crate::runtime::require_desktop()?;
    let _guard = OPERATION.try_lock().map_err(|_| busy())?;
    let preview = PREVIEWS
        .lock()
        .await
        .remove(&preview_id)
        .filter(|p| p.expires > Utc::now())
        .ok_or_else(|| {
            error(
                "MYFXBOOK_PREVIEW",
                "Die Vorschau ist abgelaufen. Bitte erneut prüfen.",
            )
        })?;
    // A backup must complete before any journal mutation.
    super::create_backup_for_state(&state)
        .await
        .map_err(CommandError::from)?;
    let old = session_load(&preview.local.account_id).ok();
    session_store(&preview.local.account_id, &preview.session)?;
    let result = commit(
        &state,
        &preview.local,
        &preview.plan,
        &preview.snapshot,
        &preview.timezone,
        true,
        true,
    )
    .await;
    if result.is_err() {
        if let Some(old) = old {
            let _ = session_store(&preview.local.account_id, &old);
        } else {
            let _ =
                Entry::new(SERVICE, &preview.local.account_id).and_then(|e| e.delete_credential());
        }
    }
    result?;
    crate::runtime::emit_myfxbook_update(&app, &preview.local.account_id);
    Ok(preview.plan.summary)
}

async fn commit(
    state: &AppState,
    local: &Local,
    plan: &Plan,
    snapshot: &Snapshot,
    timezone: &str,
    enabled: bool,
    backed_up: bool,
) -> Result<()> {
    let mut tx = state.db.begin_with("BEGIN IMMEDIATE").await?;
    if reconcile::load(&mut tx, &local.account_id)
        .await?
        .fingerprint()
        != plan.fingerprint
    {
        return Err(error(
            "MYFXBOOK_CONCURRENT",
            "Das Konto hat sich seit der Vorschau verändert. Bitte erneut prüfen.",
        ));
    }
    let now = Utc::now().to_rfc3339();
    sqlx::query("INSERT INTO myfxbook_connections(account_id,external_id,external_name,currency,broker_timezone,pnl_mode,enabled,status,message,last_attempt_at,last_sync_at,last_provider_at,balance_minor,history_keys_json,backup_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET pnl_mode=excluded.pnl_mode,external_name=excluded.external_name,enabled=excluded.enabled,status=excluded.status,message=excluded.message,last_attempt_at=excluded.last_attempt_at,last_sync_at=excluded.last_sync_at,last_provider_at=excluded.last_provider_at,balance_minor=excluded.balance_minor,history_keys_json=excluded.history_keys_json,backup_at=COALESCE(excluded.backup_at,myfxbook_connections.backup_at),updated_at=excluded.updated_at")
        .bind(&local.account_id).bind(&snapshot.account.id).bind(&snapshot.account.name).bind(&snapshot.account.currency).bind(timezone).bind(&plan.mode).bind(enabled).bind(if enabled {"connected"} else {"paused"}).bind("Trades und Kontosummen erfolgreich abgeglichen.").bind(&now).bind(&now).bind(&snapshot.account.updated_at).bind(snapshot.account.balance_minor).bind(serde_json::to_string(&snapshot.history_keys).map_err(|_|provider::invalid())?).bind(backed_up.then_some(&now)).bind(&now).execute(&mut *tx).await?;
    if needs_write(local, plan) {
        reconcile::apply(&mut tx, local, plan, snapshot, timezone, &now).await?;
    }
    tx.commit().await?;
    Ok(())
}
fn needs_write(local: &Local, plan: &Plan) -> bool {
    !plan.trades.is_empty()
        || !plan.flows.is_empty()
        || plan.links.iter().any(|l| {
            !local
                .links
                .iter()
                .any(|p| p.source_key == l.source_key && p.payload_json == l.payload_json)
        })
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn myfxbook_sync(
    state: State<'_, AppState>,
    app: AppHandle,
    account_id: String,
) -> Result<Summary> {
    crate::runtime::require_desktop()?;
    let _guard = OPERATION.try_lock().map_err(|_| busy())?;
    let result = sync_inner(&state, &account_id).await;
    crate::runtime::emit_myfxbook_update(&app, &account_id);
    result
}
async fn sync_inner(state: &AppState, account: &str) -> Result<Summary> {
    let connection: Connection =
        sqlx::query_as("SELECT * FROM myfxbook_connections WHERE account_id=?")
            .bind(account)
            .fetch_optional(&state.db)
            .await?
            .ok_or_else(credential_error)?;
    if connection.status == "disconnected" {
        return Err(credential_error());
    }
    if connection
        .last_attempt_at
        .as_deref()
        .and_then(|t| chrono::DateTime::parse_from_rfc3339(t).ok())
        .is_some_and(|t| Utc::now().signed_duration_since(t).num_seconds() < 60)
    {
        return Err(error(
            "MYFXBOOK_COOLDOWN",
            "Bitte mindestens eine Minute zwischen Abrufen warten.",
        ));
    }
    sqlx::query(
        "UPDATE myfxbook_connections SET last_attempt_at=?,status='syncing' WHERE account_id=?",
    )
    .bind(Utc::now().to_rfc3339())
    .bind(account)
    .execute(&state.db)
    .await?;
    let result: Result<Summary> = async {
        let session = session_load(account)?;
        let snapshot = Client::new()?
            .snapshot(
                &session,
                &connection.external_id,
                &connection.broker_timezone,
            )
            .await?;
        let mut db = state.db.acquire().await?;
        let local = reconcile::load(&mut db, account).await?;
        drop(db);
        let plan = reconcile::plan(&local, &snapshot)?;
        let backup_due = needs_write(&local, &plan)
            && connection
                .backup_at
                .as_deref()
                .and_then(|t| chrono::DateTime::parse_from_rfc3339(t).ok())
                .is_none_or(|t| Utc::now().signed_duration_since(t) >= Duration::hours(24));
        if backup_due {
            super::create_backup_for_state(state)
                .await
                .map_err(CommandError::from)?;
        }
        commit(
            state,
            &local,
            &plan,
            &snapshot,
            &connection.broker_timezone,
            connection.enabled,
            backup_due,
        )
        .await?;
        Ok(plan.summary)
    }
    .await;
    if let Err(e) = &result {
        let recoverable = matches!(
            e.code.as_str(),
            "MYFXBOOK_NETWORK"
                | "MYFXBOOK_CHANGED"
                | "MYFXBOOK_PROVIDER"
                | "DATABASE_ERROR"
                | "MYFXBOOK_CONCURRENT"
        );
        sqlx::query("UPDATE myfxbook_connections SET status=?,message=?,enabled=?,updated_at=? WHERE account_id=?").bind(if recoverable {"error"} else {"action_required"}).bind(&e.message).bind(recoverable&&connection.enabled).bind(Utc::now().to_rfc3339()).bind(account).execute(&state.db).await?;
    }
    result
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn myfxbook_set_enabled(
    state: State<'_, AppState>,
    account_id: String,
    enabled: bool,
) -> Result<()> {
    let _guard = OPERATION.try_lock().map_err(|_| busy())?;
    let connection: Connection =
        sqlx::query_as("SELECT * FROM myfxbook_connections WHERE account_id=?")
            .bind(&account_id)
            .fetch_one(&state.db)
            .await?;
    if enabled {
        if matches!(
            connection.status.as_str(),
            "action_required" | "disconnected"
        ) {
            return Err(error(
                "MYFXBOOK_REVIEW",
                "Bitte erst erneut anmelden und die Verbindung prüfen.",
            ));
        }
        session_load(&account_id)?;
    }
    let preserve_review = !enabled
        && matches!(
            connection.status.as_str(),
            "action_required" | "disconnected"
        );
    let status = if preserve_review {
        connection.status.as_str()
    } else if enabled {
        "connected"
    } else {
        "paused"
    };
    let message = if preserve_review {
        connection.message.as_str()
    } else if enabled {
        "Automatischer Abgleich alle fünf Minuten aktiviert."
    } else {
        "Automatischer Abgleich pausiert."
    };
    sqlx::query("UPDATE myfxbook_connections SET enabled=?,status=?,message=?,updated_at=? WHERE account_id=?").bind(enabled).bind(status).bind(message).bind(Utc::now().to_rfc3339()).bind(account_id).execute(&state.db).await?;
    Ok(())
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn myfxbook_disconnect(state: State<'_, AppState>, account_id: String) -> Result<()> {
    let _guard = OPERATION.try_lock().map_err(|_| busy())?;
    sqlx::query("UPDATE myfxbook_connections SET enabled=0,status='disconnected',message='Verbindung getrennt. Journal und Zuordnungen bleiben erhalten.',updated_at=? WHERE account_id=?").bind(Utc::now().to_rfc3339()).bind(&account_id).execute(&state.db).await?;
    if let Ok(session) = session_load(&account_id) {
        let _ = Client::new()?
            .request("logout", &[("session", &session)])
            .await;
    }
    match Entry::new(SERVICE, &account_id).and_then(|e| e.delete_credential()) {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err(error(
            "MYFXBOOK_CREDENTIAL",
            "Der Abgleich ist gestoppt; die geschützte Sitzung konnte jedoch nicht entfernt werden.",
        )),
    }
}

pub async fn scheduled_myfxbook_sync(state: &AppState, app: &AppHandle) {
    if crate::runtime::require_desktop().is_err() {
        return;
    }
    let Ok(_guard) = OPERATION.try_lock() else {
        return;
    };
    let Ok(items) = connections(state).await else {
        return;
    };
    for c in items.into_iter().filter(|c| c.enabled) {
        let due = c
            .last_attempt_at
            .as_deref()
            .and_then(|t| chrono::DateTime::parse_from_rfc3339(t).ok())
            .is_none_or(|t| Utc::now().signed_duration_since(t) >= Duration::minutes(5));
        if due {
            let _ = sync_inner(state, &c.account_id).await;
            crate::runtime::emit_myfxbook_update(app, &c.account_id);
        }
    }
}

pub async fn recover_myfxbook_sync(state: &AppState) -> Result<()> {
    sqlx::query("UPDATE myfxbook_connections SET status=CASE WHEN enabled=1 THEN 'error' ELSE 'paused' END,message='Der letzte Abruf wurde unterbrochen. Er kann erneut ausgeführt werden.' WHERE status='syncing'")
        .execute(&state.db).await?;
    Ok(())
}
