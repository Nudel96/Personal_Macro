use tauri::State;

use crate::{
    commands::journal_scope::{require_active_account, scope_trade_filter},
    database::AppState,
    domain::models::{PagedTrades, TradeDetail, TradeFilter, TradeInput},
    errors::{AppError, CommandResult},
    repositories::trades,
};

#[tauri::command]
pub async fn create_trade(
    state: State<'_, AppState>,
    mut input: TradeInput,
) -> CommandResult<TradeDetail> {
    input.account_id = input.account_id.trim().to_owned();
    require_active_account(&state.db, &input.account_id).await?;
    trades::create(&state.db, input).await.map_err(Into::into)
}

#[tauri::command]
pub async fn update_trade(
    state: State<'_, AppState>,
    id: String,
    mut input: TradeInput,
) -> CommandResult<TradeDetail> {
    input.account_id = input.account_id.trim().to_owned();
    require_active_account(&state.db, &input.account_id).await?;
    trades::update(&state.db, &id, input)
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub async fn get_trade(
    state: State<'_, AppState>,
    id: String,
    account_id: String,
) -> CommandResult<TradeDetail> {
    require_active_account(&state.db, &account_id).await?;
    trades::get(&state.db, &id, account_id.trim())
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub async fn list_trades(
    state: State<'_, AppState>,
    account_id: String,
    filter: Option<TradeFilter>,
) -> CommandResult<PagedTrades> {
    require_active_account(&state.db, &account_id).await?;
    trades::list(&state.db, scope_trade_filter(&account_id, filter))
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub async fn duplicate_trade(
    state: State<'_, AppState>,
    id: String,
    account_id: String,
) -> CommandResult<TradeDetail> {
    require_active_account(&state.db, &account_id).await?;
    trades::duplicate(&state.db, &id, account_id.trim())
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub async fn trash_trade(
    state: State<'_, AppState>,
    id: String,
    account_id: String,
) -> CommandResult<()> {
    require_active_account(&state.db, &account_id).await?;
    trades::trash(&state.db, &id, account_id.trim())
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub async fn restore_trade(
    state: State<'_, AppState>,
    id: String,
    account_id: String,
) -> CommandResult<TradeDetail> {
    require_active_account(&state.db, &account_id).await?;
    trades::restore(&state.db, &id, account_id.trim())
        .await
        .map_err(Into::into)
}

#[derive(Debug, serde::Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct DeletedTrade {
    pub id: String,
    pub instrument: String,
    pub direction: String,
    pub deleted_at: Option<String>,
    pub net_pnl_minor: Option<i64>,
}

pub(crate) async fn list_deleted_trades_for_pool(
    db: &sqlx::SqlitePool,
    account_id: &str,
) -> CommandResult<Vec<DeletedTrade>> {
    sqlx::query_as::<_, DeletedTrade>(
        "SELECT id, instrument, direction, deleted_at, net_pnl_minor FROM trades WHERE is_deleted = 1 AND account_id = ? ORDER BY deleted_at DESC",
    )
    .bind(account_id.trim())
    .fetch_all(db)
    .await
    .map_err(AppError::from)
    .map_err(Into::into)
}

#[tauri::command]
pub async fn list_deleted_trades(
    state: State<'_, AppState>,
    account_id: String,
) -> CommandResult<Vec<DeletedTrade>> {
    require_active_account(&state.db, &account_id).await?;
    list_deleted_trades_for_pool(&state.db, &account_id).await
}
