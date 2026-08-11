use std::{collections::BTreeSet, str::FromStr};

use chrono::Utc;
use rust_decimal::{
    Decimal,
    prelude::{FromPrimitive, ToPrimitive},
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::FromRow;
use tauri::State;
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::{
    database::AppState,
    errors::{AppError, CommandError, CommandResult},
};

use super::market::{MarketStatus, market_status, run_connector};

const PROVIDER_KEY: &str = "blackbull_mt5";
const INITIAL_HISTORY_MSC: i64 = 946_684_800_000;
const HISTORY_OVERLAP_MSC: i64 = 86_400_000;
const AUTOMATION_INTERVAL_SECONDS: u64 = 10;
const UNCHANGED_SNAPSHOT_INTERVAL_SECONDS: i64 = 60;

static MT5_SYNC_LOCK: Mutex<()> = Mutex::const_new(());

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConnectorAccount {
    login: String,
    server: String,
    name: Option<String>,
    company: Option<String>,
    currency: Option<String>,
    trade_mode: Option<i64>,
    margin_mode: Option<i64>,
    leverage: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConnectorSnapshot {
    observed_at: String,
    currency: String,
    balance: Option<f64>,
    equity: Option<f64>,
    margin: Option<f64>,
    free_margin: Option<f64>,
    profit: Option<f64>,
    leverage: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConnectorDeal {
    ticket: String,
    order_ticket: Option<String>,
    position_id: Option<String>,
    occurred_at: String,
    time_msc: i64,
    #[serde(rename = "type")]
    deal_type: i64,
    entry: i64,
    symbol: Option<String>,
    volume: String,
    price: String,
    profit: f64,
    commission: f64,
    swap: f64,
    fee: f64,
    magic: Option<String>,
    reason: Option<i64>,
    comment: Option<String>,
    external_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConnectorPosition {
    position_id: String,
    symbol: String,
    #[serde(rename = "type")]
    position_type: i64,
    opened_at: String,
    volume: String,
    price_open: String,
    price_current: Option<String>,
    profit: f64,
    swap: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConnectorSyncPayload {
    account: ConnectorAccount,
    snapshot: ConnectorSnapshot,
    deals: Vec<ConnectorDeal>,
    positions: Vec<ConnectorPosition>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Mt5AccountView {
    pub id: String,
    pub provider: String,
    pub server: String,
    pub login: String,
    pub account_name: Option<String>,
    pub company: Option<String>,
    pub currency: Option<String>,
    pub leverage: Option<i64>,
    pub local_account_id: Option<String>,
    pub local_account_name: Option<String>,
    pub last_seen_at: String,
    pub last_sync_at: Option<String>,
    pub is_connected: bool,
    pub balance_minor: Option<i64>,
    pub equity_minor: Option<i64>,
    pub margin_minor: Option<i64>,
    pub free_margin_minor: Option<i64>,
    pub snapshot_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Mt5AccountsResponse {
    pub accounts: Vec<Mt5AccountView>,
    pub automation_interval_seconds: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Mt5AccountLinkInput {
    pub mt5_account_id: String,
    pub local_account_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Mt5SyncResult {
    pub status: String,
    pub account_id: Option<String>,
    pub deals_seen: usize,
    pub deals_inserted: u64,
    pub trades_updated: usize,
    pub message: String,
}

#[derive(Debug, FromRow)]
struct Mt5AccountRow {
    id: String,
    local_account_id: Option<String>,
    last_deal_time_msc: Option<i64>,
}

#[derive(Debug, FromRow)]
struct StoredDeal {
    occurred_at: String,
    deal_type: i64,
    entry_type: i64,
    symbol: Option<String>,
    volume_text: String,
    price_text: String,
    profit_minor: i64,
    commission_minor: i64,
    swap_minor: i64,
    fee_minor: i64,
}

#[derive(Debug, FromRow)]
struct StoredPosition {
    symbol: String,
    position_type: i64,
    opened_at: String,
    volume_text: String,
    price_open_text: String,
}

#[derive(Debug, FromRow)]
struct LatestSnapshot {
    observed_at: String,
    balance_minor: Option<i64>,
    equity_minor: Option<i64>,
    margin_minor: Option<i64>,
    free_margin_minor: Option<i64>,
    profit_minor: Option<i64>,
}

#[tauri::command]
pub async fn get_mt5_accounts(state: State<'_, AppState>) -> CommandResult<Mt5AccountsResponse> {
    Ok(Mt5AccountsResponse {
        accounts: load_mt5_accounts(&state).await?,
        automation_interval_seconds: AUTOMATION_INTERVAL_SECONDS,
    })
}

#[tauri::command]
pub async fn link_mt5_account(
    state: State<'_, AppState>,
    input: Mt5AccountLinkInput,
) -> CommandResult<Mt5AccountView> {
    let mt5 = sqlx::query_as::<_, (Option<String>, Option<String>)>(
        "SELECT local_account_id,currency FROM mt5_accounts WHERE id=?",
    )
    .bind(&input.mt5_account_id)
    .fetch_optional(&state.db)
    .await
    .map_err(AppError::from)?
    .ok_or_else(|| CommandError {
        code: "NOT_FOUND".into(),
        message: "Das erkannte MT5-Konto wurde nicht gefunden.".into(),
        details: None,
    })?;

    let local_currency: Option<String> =
        sqlx::query_scalar("SELECT base_currency FROM accounts WHERE id=? AND is_archived=0")
            .bind(&input.local_account_id)
            .fetch_optional(&state.db)
            .await
            .map_err(AppError::from)?;
    let local_currency = local_currency.ok_or_else(|| {
        CommandError::validation("Das ausgewählte Journal-Konto ist nicht verfügbar.")
    })?;
    if let Some(mt5_currency) = mt5.1.as_deref()
        && !mt5_currency.eq_ignore_ascii_case(&local_currency)
    {
        return Err(CommandError::validation(format!(
            "Die Kontowährungen stimmen nicht überein: MT5 {mt5_currency}, Journal {local_currency}."
        )));
    }
    if let Some(existing) = mt5.0.as_deref()
        && existing != input.local_account_id
    {
        let imported: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM mt5_position_links WHERE mt5_account_id=?")
                .bind(&input.mt5_account_id)
                .fetch_one(&state.db)
                .await
                .map_err(AppError::from)?;
        if imported > 0 {
            return Err(CommandError::validation(
                "Dieses MT5-Konto hat bereits importierte Trades und kann nicht einem anderen Journal-Konto zugeordnet werden.",
            ));
        }
    }

    let occupied: Option<String> =
        sqlx::query_scalar("SELECT id FROM mt5_accounts WHERE local_account_id=? AND id<>?")
            .bind(&input.local_account_id)
            .bind(&input.mt5_account_id)
            .fetch_optional(&state.db)
            .await
            .map_err(AppError::from)?;
    if occupied.is_some() {
        return Err(CommandError::validation(
            "Dieses Journal-Konto ist bereits mit einem anderen MT5-Konto verbunden.",
        ));
    }

    sqlx::query("UPDATE mt5_accounts SET local_account_id=?,updated_at=? WHERE id=?")
        .bind(&input.local_account_id)
        .bind(Utc::now().to_rfc3339())
        .bind(&input.mt5_account_id)
        .execute(&state.db)
        .await
        .map_err(AppError::from)?;

    load_mt5_accounts(&state)
        .await?
        .into_iter()
        .find(|account| account.id == input.mt5_account_id)
        .ok_or_else(|| CommandError::validation("Die MT5-Zuordnung konnte nicht geladen werden."))
}

#[tauri::command]
pub async fn unlink_mt5_account(
    state: State<'_, AppState>,
    mt5_account_id: String,
) -> CommandResult<()> {
    let imported: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM mt5_position_links WHERE mt5_account_id=?")
            .bind(&mt5_account_id)
            .fetch_one(&state.db)
            .await
            .map_err(AppError::from)?;
    if imported > 0 {
        return Err(CommandError::validation(
            "Die Zuordnung besitzt bereits importierte Trades und kann zum Schutz der Kontentrennung nicht gelöst werden.",
        ));
    }
    sqlx::query("UPDATE mt5_accounts SET local_account_id=NULL,updated_at=? WHERE id=?")
        .bind(Utc::now().to_rfc3339())
        .bind(mt5_account_id)
        .execute(&state.db)
        .await
        .map_err(AppError::from)?;
    Ok(())
}

#[tauri::command]
pub async fn sync_mt5_now(state: State<'_, AppState>) -> CommandResult<Mt5SyncResult> {
    sync_mt5(&state, "manual", true).await
}

pub async fn scheduled_mt5_sync(state: &AppState) -> CommandResult<()> {
    match sync_mt5(state, "scheduler", false).await {
        Ok(_) => Ok(()),
        Err(error)
            if matches!(
                error.code.as_str(),
                "MT5_INITIALIZE_FAILED"
                    | "MT5_NOT_LOGGED_IN"
                    | "PYTHON_NOT_FOUND"
                    | "MT5_PACKAGE_MISSING"
            ) =>
        {
            Ok(())
        }
        Err(error) => Err(error),
    }
}

async fn sync_mt5(
    state: &AppState,
    trigger: &str,
    surface_disconnect: bool,
) -> CommandResult<Mt5SyncResult> {
    let _guard = MT5_SYNC_LOCK.lock().await;
    let status = match market_status(state) {
        Ok(status) => status,
        Err(error) => {
            sqlx::query("UPDATE mt5_accounts SET is_connected=0,updated_at=? WHERE is_connected=1")
                .bind(Utc::now().to_rfc3339())
                .execute(&state.db)
                .await
                .map_err(AppError::from)?;
            if surface_disconnect {
                return Err(error);
            }
            return Ok(Mt5SyncResult {
                status: "disconnected".into(),
                account_id: None,
                deals_seen: 0,
                deals_inserted: 0,
                trades_updated: 0,
                message: "MT5 ist momentan nicht verbunden.".into(),
            });
        }
    };
    let account = upsert_detected_account(state, &status).await?;
    if account.local_account_id.is_none() {
        persist_status_snapshot(state, &account.id, &status).await?;
    }

    let run_id = Uuid::new_v4().to_string();
    let started_at = Utc::now().to_rfc3339();
    sqlx::query("INSERT INTO mt5_sync_runs(id,mt5_account_id,trigger_kind,status,started_at) VALUES(?,?,?,'running',?)")
        .bind(&run_id)
        .bind(&account.id)
        .bind(trigger)
        .bind(&started_at)
        .execute(&state.db)
        .await
        .map_err(AppError::from)?;

    let Some(local_account_id) = account.local_account_id.clone() else {
        finish_run(state, &run_id, "unmapped", 0, 0, 0, None).await?;
        return Ok(Mt5SyncResult {
            status: "unmapped".into(),
            account_id: Some(account.id),
            deals_seen: 0,
            deals_inserted: 0,
            trades_updated: 0,
            message: "Das erkannte MT5-Konto muss zuerst einem Journal-Konto zugeordnet werden."
                .into(),
        });
    };

    let from_time_msc = account
        .last_deal_time_msc
        .unwrap_or(INITIAL_HISTORY_MSC)
        .saturating_sub(HISTORY_OVERLAP_MSC)
        .max(INITIAL_HISTORY_MSC);
    let request = json!({
        "action": "accountSync",
        "expectedLogin": status.account_login.clone(),
        "expectedServer": status.account_server.clone(),
        "fromTimeMsc": from_time_msc,
    });
    let payload: ConnectorSyncPayload = match run_connector(state, request) {
        Ok(payload) => payload,
        Err(error) => {
            let run_status = if error.code == "MT5_ACCOUNT_CHANGED" {
                "account_changed"
            } else {
                "failed"
            };
            finish_run(
                state,
                &run_id,
                run_status,
                0,
                0,
                0,
                Some((&error.code, &error.message)),
            )
            .await?;
            return Err(error);
        }
    };
    if payload.account.login != status.account_login.clone().unwrap_or_default()
        || !payload
            .account
            .server
            .eq_ignore_ascii_case(status.account_server.as_deref().unwrap_or_default())
    {
        let error = CommandError {
            code: "MT5_ACCOUNT_CHANGED".into(),
            message: "Der aktive MT5-Account wurde während der Synchronisierung gewechselt. Es wurden keine Daten übernommen.".into(),
            details: None,
        };
        finish_run(
            state,
            &run_id,
            "account_changed",
            0,
            0,
            0,
            Some((&error.code, &error.message)),
        )
        .await?;
        return Err(error);
    }

    let deals_seen = payload.deals.len();
    let (deals_inserted, affected_positions) =
        persist_sync_payload(state, &account.id, &payload).await?;
    let trades_updated =
        reconcile_trades(state, &account.id, &local_account_id, &affected_positions).await?;
    finish_run(
        state,
        &run_id,
        "complete",
        deals_seen as i64,
        deals_inserted as i64,
        trades_updated as i64,
        None,
    )
    .await?;

    Ok(Mt5SyncResult {
        status: "complete".into(),
        account_id: Some(account.id),
        deals_seen,
        deals_inserted,
        trades_updated,
        message: "MT5-Konto, Positionen und neue Deals wurden aktualisiert.".into(),
    })
}

async fn upsert_detected_account(
    state: &AppState,
    status: &MarketStatus,
) -> CommandResult<Mt5AccountRow> {
    let login = status
        .account_login
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| CommandError::validation("MT5 hat keine eindeutige Login-ID geliefert."))?;
    let server = status
        .account_server
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| CommandError::validation("MT5 hat keinen eindeutigen Server geliefert."))?;
    let server_key = server.to_lowercase();
    let existing: Option<String> = sqlx::query_scalar(
        "SELECT id FROM mt5_accounts WHERE provider=? AND server_key=? AND login=?",
    )
    .bind(PROVIDER_KEY)
    .bind(&server_key)
    .bind(login)
    .fetch_optional(&state.db)
    .await
    .map_err(AppError::from)?;
    let id = existing.unwrap_or_else(|| Uuid::new_v4().to_string());
    let now = Utc::now().to_rfc3339();
    sqlx::query(
        "UPDATE mt5_accounts SET is_connected=0,updated_at=? WHERE id<>? AND is_connected=1",
    )
    .bind(&now)
    .bind(&id)
    .execute(&state.db)
    .await
    .map_err(AppError::from)?;
    sqlx::query(
        "INSERT INTO mt5_accounts(id,provider,server,server_key,login,account_name,company,currency,first_seen_at,last_seen_at,is_connected,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,1,?,?) ON CONFLICT(provider,server_key,login) DO UPDATE SET server=excluded.server,account_name=excluded.account_name,company=excluded.company,currency=excluded.currency,last_seen_at=excluded.last_seen_at,is_connected=1,updated_at=excluded.updated_at",
    )
    .bind(&id)
    .bind(PROVIDER_KEY)
    .bind(server)
    .bind(server_key)
    .bind(login)
    .bind(&status.account_name)
    .bind(&status.account_company)
    .bind(&status.account_currency)
    .bind(&now)
    .bind(&now)
    .bind(&now)
    .bind(&now)
    .execute(&state.db)
    .await
    .map_err(AppError::from)?;
    sqlx::query_as::<_, Mt5AccountRow>(
        "SELECT id,local_account_id,last_deal_time_msc FROM mt5_accounts WHERE provider=? AND server_key=? AND login=?",
    )
    .bind(PROVIDER_KEY)
    .bind(server.to_lowercase())
    .bind(login)
    .fetch_one(&state.db)
    .await
    .map_err(AppError::from)
    .map_err(Into::into)
}

async fn persist_status_snapshot(
    state: &AppState,
    account_id: &str,
    status: &MarketStatus,
) -> CommandResult<()> {
    let Some(currency) = status.account_currency.as_deref() else {
        return Ok(());
    };
    let balance_minor = money_to_minor(status.balance);
    let equity_minor = money_to_minor(status.equity);
    if !snapshot_should_persist(
        state,
        account_id,
        &status.last_update,
        balance_minor,
        equity_minor,
        None,
        None,
        None,
    )
    .await?
    {
        return Ok(());
    }
    sqlx::query("INSERT OR IGNORE INTO mt5_account_snapshots(id,mt5_account_id,observed_at,currency,balance_minor,equity_minor,leverage) VALUES(?,?,?,?,?,?,NULL)")
        .bind(Uuid::new_v4().to_string())
        .bind(account_id)
        .bind(&status.last_update)
        .bind(currency)
        .bind(balance_minor)
        .bind(equity_minor)
        .execute(&state.db)
        .await
        .map_err(AppError::from)?;
    Ok(())
}

async fn persist_sync_payload(
    state: &AppState,
    account_id: &str,
    payload: &ConnectorSyncPayload,
) -> CommandResult<(u64, BTreeSet<String>)> {
    let snapshot = &payload.snapshot;
    let balance_minor = money_to_minor(snapshot.balance);
    let equity_minor = money_to_minor(snapshot.equity);
    let margin_minor = money_to_minor(snapshot.margin);
    let free_margin_minor = money_to_minor(snapshot.free_margin);
    let profit_minor = money_to_minor(snapshot.profit);
    let persist_snapshot = snapshot_should_persist(
        state,
        account_id,
        &snapshot.observed_at,
        balance_minor,
        equity_minor,
        margin_minor,
        free_margin_minor,
        profit_minor,
    )
    .await?;
    let mut transaction = state.db.begin().await.map_err(AppError::from)?;
    if persist_snapshot {
        sqlx::query("INSERT OR IGNORE INTO mt5_account_snapshots(id,mt5_account_id,observed_at,currency,balance_minor,equity_minor,margin_minor,free_margin_minor,profit_minor,leverage) VALUES(?,?,?,?,?,?,?,?,?,?)")
            .bind(Uuid::new_v4().to_string())
            .bind(account_id)
            .bind(&snapshot.observed_at)
            .bind(&snapshot.currency)
            .bind(balance_minor)
            .bind(equity_minor)
            .bind(margin_minor)
            .bind(free_margin_minor)
            .bind(profit_minor)
            .bind(snapshot.leverage)
            .execute(&mut *transaction)
            .await
            .map_err(AppError::from)?;
    }

    let imported_at = Utc::now().to_rfc3339();
    let mut inserted = 0_u64;
    let mut affected = BTreeSet::new();
    let mut max_time = None;
    for deal in &payload.deals {
        if matches!(deal.deal_type, 0 | 1)
            && let Some(position_id) = deal.position_id.as_deref()
            && !position_id.is_empty()
            && position_id != "0"
        {
            affected.insert(position_id.to_string());
        }
        max_time = Some(max_time.unwrap_or(deal.time_msc).max(deal.time_msc));
        let result = sqlx::query("INSERT OR IGNORE INTO mt5_deals(id,mt5_account_id,deal_ticket,order_ticket,position_id,occurred_at,time_msc,deal_type,entry_type,symbol,volume_text,price_text,profit_minor,commission_minor,swap_minor,fee_minor,magic,reason,comment,external_id,imported_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
            .bind(Uuid::new_v4().to_string())
            .bind(account_id)
            .bind(&deal.ticket)
            .bind(&deal.order_ticket)
            .bind(&deal.position_id)
            .bind(&deal.occurred_at)
            .bind(deal.time_msc)
            .bind(deal.deal_type)
            .bind(deal.entry)
            .bind(&deal.symbol)
            .bind(&deal.volume)
            .bind(&deal.price)
            .bind(money_to_minor(Some(deal.profit)).unwrap_or(0))
            .bind(money_to_minor(Some(deal.commission)).unwrap_or(0))
            .bind(money_to_minor(Some(deal.swap)).unwrap_or(0))
            .bind(money_to_minor(Some(deal.fee)).unwrap_or(0))
            .bind(&deal.magic)
            .bind(deal.reason)
            .bind(&deal.comment)
            .bind(&deal.external_id)
            .bind(&imported_at)
            .execute(&mut *transaction)
            .await
            .map_err(AppError::from)?;
        inserted += result.rows_affected();
    }

    sqlx::query("DELETE FROM mt5_open_positions WHERE mt5_account_id=?")
        .bind(account_id)
        .execute(&mut *transaction)
        .await
        .map_err(AppError::from)?;
    for position in &payload.positions {
        affected.insert(position.position_id.clone());
        sqlx::query("INSERT INTO mt5_open_positions(mt5_account_id,position_id,symbol,position_type,opened_at,volume_text,price_open_text,price_current_text,profit_minor,swap_minor,observed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
            .bind(account_id)
            .bind(&position.position_id)
            .bind(&position.symbol)
            .bind(position.position_type)
            .bind(&position.opened_at)
            .bind(&position.volume)
            .bind(&position.price_open)
            .bind(&position.price_current)
            .bind(money_to_minor(Some(position.profit)).unwrap_or(0))
            .bind(money_to_minor(Some(position.swap)).unwrap_or(0))
            .bind(&snapshot.observed_at)
            .execute(&mut *transaction)
            .await
            .map_err(AppError::from)?;
    }

    let now = Utc::now().to_rfc3339();
    sqlx::query("UPDATE mt5_accounts SET account_name=?,company=?,currency=?,trade_mode=?,margin_mode=?,leverage=?,last_seen_at=?,last_sync_at=?,last_deal_time_msc=COALESCE(?,last_deal_time_msc),is_connected=1,updated_at=? WHERE id=?")
        .bind(&payload.account.name)
        .bind(&payload.account.company)
        .bind(&payload.account.currency)
        .bind(payload.account.trade_mode)
        .bind(payload.account.margin_mode)
        .bind(payload.account.leverage)
        .bind(&now)
        .bind(&now)
        .bind(max_time)
        .bind(&now)
        .bind(account_id)
        .execute(&mut *transaction)
        .await
        .map_err(AppError::from)?;
    transaction.commit().await.map_err(AppError::from)?;
    Ok((inserted, affected))
}

async fn reconcile_trades(
    state: &AppState,
    mt5_account_id: &str,
    local_account_id: &str,
    position_ids: &BTreeSet<String>,
) -> CommandResult<usize> {
    let mut updated = 0;
    for position_id in position_ids {
        let deals = sqlx::query_as::<_, StoredDeal>("SELECT occurred_at,deal_type,entry_type,symbol,volume_text,price_text,profit_minor,commission_minor,swap_minor,fee_minor FROM mt5_deals WHERE mt5_account_id=? AND position_id=? AND deal_type IN (0,1) ORDER BY time_msc,deal_ticket")
            .bind(mt5_account_id)
            .bind(position_id)
            .fetch_all(&state.db)
            .await
            .map_err(AppError::from)?;
        let open_position = sqlx::query_as::<_, StoredPosition>("SELECT symbol,position_type,opened_at,volume_text,price_open_text FROM mt5_open_positions WHERE mt5_account_id=? AND position_id=?")
            .bind(mt5_account_id)
            .bind(position_id)
            .fetch_optional(&state.db)
            .await
            .map_err(AppError::from)?;
        if deals.is_empty() && open_position.is_none() {
            continue;
        }
        let trade_id: Option<String> = sqlx::query_scalar(
            "SELECT trade_id FROM mt5_position_links WHERE mt5_account_id=? AND position_id=?",
        )
        .bind(mt5_account_id)
        .bind(position_id)
        .fetch_optional(&state.db)
        .await
        .map_err(AppError::from)?;
        let now = Utc::now().to_rfc3339();
        let is_open = open_position.is_some();
        let first_deal = deals.first();
        let opening_deal = deals
            .iter()
            .find(|deal| deal.entry_type == 0)
            .or(first_deal);
        let symbol = open_position
            .as_ref()
            .map(|position| position.symbol.clone())
            .or_else(|| opening_deal.and_then(|deal| deal.symbol.clone()))
            .unwrap_or_else(|| "UNKNOWN".into());
        let direction = if let Some(position) = &open_position {
            if position.position_type == 0 {
                "long"
            } else {
                "short"
            }
        } else if opening_deal.is_some_and(|deal| deal.deal_type == 0) {
            "long"
        } else {
            "short"
        };
        let opened_at = open_position
            .as_ref()
            .map(|position| position.opened_at.clone())
            .or_else(|| opening_deal.map(|deal| deal.occurred_at.clone()));
        let closing_deals: Vec<&StoredDeal> = deals
            .iter()
            .filter(|deal| matches!(deal.entry_type, 1..=3))
            .collect();
        let closed_at = if is_open {
            None
        } else {
            closing_deals
                .last()
                .map(|deal| deal.occurred_at.clone())
                .or_else(|| deals.last().map(|deal| deal.occurred_at.clone()))
        };
        let actual_entry = open_position
            .as_ref()
            .map(|position| position.price_open_text.clone())
            .or_else(|| weighted_average(deals.iter().filter(|deal| deal.entry_type == 0)));
        let actual_exit = if is_open {
            None
        } else {
            weighted_average(closing_deals.iter().copied())
        };
        let quantity = open_position
            .as_ref()
            .map(|position| position.volume_text.clone())
            .or_else(|| sum_volume(deals.iter().filter(|deal| deal.entry_type == 0)));
        let profit_minor: i64 = deals.iter().map(|deal| deal.profit_minor).sum();
        let signed_commission: i64 = deals.iter().map(|deal| deal.commission_minor).sum();
        let signed_swap: i64 = deals.iter().map(|deal| deal.swap_minor).sum();
        let signed_fee: i64 = deals.iter().map(|deal| deal.fee_minor).sum();
        let commission_minor = -signed_commission;
        let swap_minor = -signed_swap;
        let fees_minor = -signed_fee;
        let net_pnl_minor = if is_open {
            None
        } else {
            Some(profit_minor + signed_commission + signed_swap + signed_fee)
        };
        let source_metadata = json!({
            "provider": PROVIDER_KEY,
            "mt5AccountId": mt5_account_id,
            "mt5PositionId": position_id,
            "ownership": "broker-managed-fields",
        })
        .to_string();

        if let Some(trade_id) = trade_id {
            let result = sqlx::query("UPDATE trades SET account_id=?,status=?,instrument=?,asset_class=?,direction=?,opened_at=?,closed_at=?,actual_entry=?,actual_exit=?,quantity=?,gross_pnl_minor=?,fees_minor=?,commission_minor=?,swap_minor=?,net_pnl_minor=?,updated_at=? WHERE id=? AND is_deleted=0")
                .bind(local_account_id)
                .bind(if is_open { "open" } else { "closed" })
                .bind(symbol.to_uppercase())
                .bind(asset_class(&symbol))
                .bind(direction)
                .bind(opened_at)
                .bind(closed_at)
                .bind(actual_entry)
                .bind(actual_exit)
                .bind(quantity)
                .bind(if is_open { None } else { Some(profit_minor) })
                .bind(fees_minor)
                .bind(commission_minor)
                .bind(swap_minor)
                .bind(net_pnl_minor)
                .bind(&now)
                .bind(trade_id)
                .execute(&state.db)
                .await
                .map_err(AppError::from)?;
            updated += usize::try_from(result.rows_affected()).unwrap_or(0);
        } else {
            let trade_id = Uuid::new_v4().to_string();
            let mut transaction = state.db.begin().await.map_err(AppError::from)?;
            sqlx::query("INSERT INTO trades(id,account_id,status,instrument,asset_class,direction,opened_at,closed_at,display_timezone,actual_entry,actual_exit,quantity,gross_pnl_minor,fees_minor,commission_minor,swap_minor,net_pnl_minor,source,source_metadata_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'mt5',?,?,?)")
                .bind(&trade_id)
                .bind(local_account_id)
                .bind(if is_open { "open" } else { "closed" })
                .bind(symbol.to_uppercase())
                .bind(asset_class(&symbol))
                .bind(direction)
                .bind(opened_at)
                .bind(closed_at)
                .bind("Europe/Berlin")
                .bind(actual_entry)
                .bind(actual_exit)
                .bind(quantity)
                .bind(if is_open { None } else { Some(profit_minor) })
                .bind(fees_minor)
                .bind(commission_minor)
                .bind(swap_minor)
                .bind(net_pnl_minor)
                .bind(source_metadata)
                .bind(&now)
                .bind(&now)
                .execute(&mut *transaction)
                .await
                .map_err(AppError::from)?;
            sqlx::query("INSERT INTO mt5_position_links(mt5_account_id,position_id,trade_id,created_at) VALUES(?,?,?,?)")
                .bind(mt5_account_id)
                .bind(position_id)
                .bind(&trade_id)
                .bind(&now)
                .execute(&mut *transaction)
                .await
                .map_err(AppError::from)?;
            transaction.commit().await.map_err(AppError::from)?;
            updated += 1;
        }
    }
    Ok(updated)
}

async fn finish_run(
    state: &AppState,
    run_id: &str,
    status: &str,
    deals_seen: i64,
    deals_inserted: i64,
    trades_updated: i64,
    error: Option<(&str, &str)>,
) -> CommandResult<()> {
    let (code, message) = error.unzip();
    sqlx::query("UPDATE mt5_sync_runs SET status=?,completed_at=?,deals_seen=?,deals_inserted=?,trades_updated=?,error_code=?,error_message=? WHERE id=?")
        .bind(status)
        .bind(Utc::now().to_rfc3339())
        .bind(deals_seen)
        .bind(deals_inserted)
        .bind(trades_updated)
        .bind(code)
        .bind(message.map(limit_error))
        .bind(run_id)
        .execute(&state.db)
        .await
        .map_err(AppError::from)?;
    Ok(())
}

async fn load_mt5_accounts(state: &AppState) -> CommandResult<Vec<Mt5AccountView>> {
    sqlx::query_as::<_, Mt5AccountView>(
        r#"SELECT m.id,m.provider,m.server,m.login,m.account_name,m.company,m.currency,m.leverage,
        m.local_account_id,a.name AS local_account_name,m.last_seen_at,m.last_sync_at,m.is_connected,
        (SELECT s.balance_minor FROM mt5_account_snapshots s WHERE s.mt5_account_id=m.id ORDER BY s.observed_at DESC LIMIT 1) AS balance_minor,
        (SELECT s.equity_minor FROM mt5_account_snapshots s WHERE s.mt5_account_id=m.id ORDER BY s.observed_at DESC LIMIT 1) AS equity_minor,
        (SELECT s.margin_minor FROM mt5_account_snapshots s WHERE s.mt5_account_id=m.id ORDER BY s.observed_at DESC LIMIT 1) AS margin_minor,
        (SELECT s.free_margin_minor FROM mt5_account_snapshots s WHERE s.mt5_account_id=m.id ORDER BY s.observed_at DESC LIMIT 1) AS free_margin_minor,
        (SELECT s.observed_at FROM mt5_account_snapshots s WHERE s.mt5_account_id=m.id ORDER BY s.observed_at DESC LIMIT 1) AS snapshot_at
        FROM mt5_accounts m LEFT JOIN accounts a ON a.id=m.local_account_id
        ORDER BY m.is_connected DESC,m.last_seen_at DESC"#,
    )
    .fetch_all(&state.db)
    .await
    .map_err(AppError::from)
    .map_err(Into::into)
}

#[allow(clippy::too_many_arguments)]
async fn snapshot_should_persist(
    state: &AppState,
    account_id: &str,
    observed_at: &str,
    balance_minor: Option<i64>,
    equity_minor: Option<i64>,
    margin_minor: Option<i64>,
    free_margin_minor: Option<i64>,
    profit_minor: Option<i64>,
) -> CommandResult<bool> {
    let latest = sqlx::query_as::<_, LatestSnapshot>(
        "SELECT observed_at,balance_minor,equity_minor,margin_minor,free_margin_minor,profit_minor FROM mt5_account_snapshots WHERE mt5_account_id=? ORDER BY observed_at DESC LIMIT 1",
    )
    .bind(account_id)
    .fetch_optional(&state.db)
    .await
    .map_err(AppError::from)?;
    let Some(latest) = latest else {
        return Ok(true);
    };
    let changed = latest.balance_minor != balance_minor
        || latest.equity_minor != equity_minor
        || latest.margin_minor != margin_minor
        || latest.free_margin_minor != free_margin_minor
        || latest.profit_minor != profit_minor;
    if changed {
        return Ok(true);
    }
    let elapsed = chrono::DateTime::parse_from_rfc3339(observed_at)
        .ok()
        .zip(chrono::DateTime::parse_from_rfc3339(&latest.observed_at).ok())
        .map(|(current, previous)| (current - previous).num_seconds())
        .unwrap_or(UNCHANGED_SNAPSHOT_INTERVAL_SECONDS);
    Ok(elapsed >= UNCHANGED_SNAPSHOT_INTERVAL_SECONDS)
}

fn money_to_minor(value: Option<f64>) -> Option<i64> {
    value
        .filter(|number| number.is_finite())
        .and_then(Decimal::from_f64)
        .and_then(|number| (number * Decimal::from(100)).round().to_i64())
}

fn weighted_average<'a>(deals: impl Iterator<Item = &'a StoredDeal>) -> Option<String> {
    let mut weighted = Decimal::ZERO;
    let mut volume = Decimal::ZERO;
    for deal in deals {
        let deal_volume = Decimal::from_str(&deal.volume_text).ok()?;
        let price = Decimal::from_str(&deal.price_text).ok()?;
        weighted += price * deal_volume;
        volume += deal_volume;
    }
    if volume.is_zero() {
        None
    } else {
        Some((weighted / volume).round_dp(10).normalize().to_string())
    }
}

fn sum_volume<'a>(deals: impl Iterator<Item = &'a StoredDeal>) -> Option<String> {
    let mut total = Decimal::ZERO;
    let mut seen = false;
    for deal in deals {
        total += Decimal::from_str(&deal.volume_text).ok()?;
        seen = true;
    }
    seen.then(|| total.normalize().to_string())
}

fn asset_class(symbol: &str) -> &'static str {
    if symbol.to_ascii_uppercase().contains("BTC") || symbol.to_ascii_uppercase().contains("ETH") {
        return "crypto";
    }
    let letters: String = symbol
        .chars()
        .filter(|char| char.is_ascii_alphabetic())
        .collect();
    if letters.len() == 6 { "forex" } else { "cfd" }
}

fn limit_error(message: &str) -> String {
    message.chars().take(500).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn deal(volume: &str, price: &str) -> StoredDeal {
        StoredDeal {
            occurred_at: "2026-01-01T00:00:00Z".into(),
            deal_type: 0,
            entry_type: 0,
            symbol: Some("EURUSD".into()),
            volume_text: volume.into(),
            price_text: price.into(),
            profit_minor: 0,
            commission_minor: 0,
            swap_minor: 0,
            fee_minor: 0,
        }
    }

    #[test]
    fn account_money_uses_minor_units() {
        assert_eq!(money_to_minor(Some(1234.567)), Some(123_457));
        assert_eq!(money_to_minor(None), None);
    }

    #[test]
    fn weighted_prices_and_volumes_are_deterministic() {
        let deals = [deal("1", "1.10"), deal("2", "1.13")];
        assert_eq!(weighted_average(deals.iter()), Some("1.12".into()));
        assert_eq!(sum_volume(deals.iter()), Some("3".into()));
    }

    #[test]
    fn asset_classification_handles_forex_and_crypto() {
        assert_eq!(asset_class("EURUSD"), "forex");
        assert_eq!(asset_class("BTCUSD"), "crypto");
        assert_eq!(asset_class("US500"), "cfd");
    }

    #[tokio::test]
    async fn migration_and_reconciliation_are_idempotent_per_account_position() {
        let state = crate::database::initialize_headless().await.unwrap();
        let status = MarketStatus {
            connected: true,
            provider: "BlackBull MT5".into(),
            account_login: Some("123456".into()),
            account_server: Some("BlackBull-Test".into()),
            account_name: Some("Test Trader".into()),
            account_company: Some("BlackBull".into()),
            account_currency: Some("EUR".into()),
            balance: Some(10_000.0),
            equity: Some(10_000.0),
            last_update: "2026-01-02T00:00:00Z".into(),
            code: None,
            message: None,
        };
        let mt5 = upsert_detected_account(&state, &status).await.unwrap();
        let local_account_id: String = sqlx::query_scalar("SELECT id FROM accounts LIMIT 1")
            .fetch_one(&state.db)
            .await
            .unwrap();
        sqlx::query("UPDATE mt5_accounts SET local_account_id=? WHERE id=?")
            .bind(&local_account_id)
            .bind(&mt5.id)
            .execute(&state.db)
            .await
            .unwrap();
        let payload = ConnectorSyncPayload {
            account: ConnectorAccount {
                login: "123456".into(),
                server: "BlackBull-Test".into(),
                name: Some("Test Trader".into()),
                company: Some("BlackBull".into()),
                currency: Some("EUR".into()),
                trade_mode: Some(0),
                margin_mode: Some(0),
                leverage: Some(100),
            },
            snapshot: ConnectorSnapshot {
                observed_at: "2026-01-02T00:00:00Z".into(),
                currency: "EUR".into(),
                balance: Some(10_000.0),
                equity: Some(10_000.0),
                margin: Some(0.0),
                free_margin: Some(10_000.0),
                profit: Some(0.0),
                leverage: Some(100),
            },
            deals: vec![
                ConnectorDeal {
                    ticket: "1".into(),
                    order_ticket: Some("10".into()),
                    position_id: Some("42".into()),
                    occurred_at: "2026-01-01T10:00:00Z".into(),
                    time_msc: 1_767_262_800_000,
                    deal_type: 0,
                    entry: 0,
                    symbol: Some("EURUSD".into()),
                    volume: "1".into(),
                    price: "1.10".into(),
                    profit: 0.0,
                    commission: -2.0,
                    swap: 0.0,
                    fee: 0.0,
                    magic: None,
                    reason: None,
                    comment: None,
                    external_id: None,
                },
                ConnectorDeal {
                    ticket: "2".into(),
                    order_ticket: Some("11".into()),
                    position_id: Some("42".into()),
                    occurred_at: "2026-01-01T12:00:00Z".into(),
                    time_msc: 1_767_270_000_000,
                    deal_type: 1,
                    entry: 1,
                    symbol: Some("EURUSD".into()),
                    volume: "1".into(),
                    price: "1.11".into(),
                    profit: 100.0,
                    commission: -2.0,
                    swap: -1.0,
                    fee: 0.0,
                    magic: None,
                    reason: None,
                    comment: None,
                    external_id: None,
                },
            ],
            positions: vec![],
        };
        let (inserted, positions) = persist_sync_payload(&state, &mt5.id, &payload)
            .await
            .unwrap();
        assert_eq!(inserted, 2);
        assert_eq!(
            reconcile_trades(&state, &mt5.id, &local_account_id, &positions)
                .await
                .unwrap(),
            1
        );
        let (status, net_pnl_minor, commission_minor, swap_minor):
            (String, Option<i64>, i64, i64) = sqlx::query_as(
                "SELECT status,net_pnl_minor,commission_minor,swap_minor FROM trades WHERE source='mt5'",
            )
            .fetch_one(&state.db)
            .await
            .unwrap();
        assert_eq!(status, "closed");
        assert_eq!(net_pnl_minor, Some(9_500));
        assert_eq!(commission_minor, 400);
        assert_eq!(swap_minor, 100);

        let (inserted_again, positions_again) = persist_sync_payload(&state, &mt5.id, &payload)
            .await
            .unwrap();
        assert_eq!(inserted_again, 0);
        reconcile_trades(&state, &mt5.id, &local_account_id, &positions_again)
            .await
            .unwrap();
        let trade_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM trades WHERE source='mt5'")
            .fetch_one(&state.db)
            .await
            .unwrap();
        assert_eq!(trade_count, 1);
    }
}
