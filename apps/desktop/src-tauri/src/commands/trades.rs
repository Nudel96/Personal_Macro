use tauri::State;

use crate::{
    database::AppState,
    domain::models::{PagedTrades, TradeDetail, TradeFilter, TradeInput},
    errors::{AppError, CommandResult},
    repositories::trades,
};

#[tauri::command]
pub async fn create_trade(
    state: State<'_, AppState>,
    input: TradeInput,
) -> CommandResult<TradeDetail> {
    trades::create(&state.db, input).await.map_err(Into::into)
}

#[tauri::command]
pub async fn update_trade(
    state: State<'_, AppState>,
    id: String,
    input: TradeInput,
) -> CommandResult<TradeDetail> {
    trades::update(&state.db, &id, input)
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub async fn get_trade(state: State<'_, AppState>, id: String) -> CommandResult<TradeDetail> {
    trades::get(&state.db, &id).await.map_err(Into::into)
}

#[tauri::command]
pub async fn list_trades(
    state: State<'_, AppState>,
    filter: Option<TradeFilter>,
) -> CommandResult<PagedTrades> {
    trades::list(&state.db, filter.unwrap_or_default())
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub async fn duplicate_trade(state: State<'_, AppState>, id: String) -> CommandResult<TradeDetail> {
    trades::duplicate(&state.db, &id).await.map_err(Into::into)
}

#[tauri::command]
pub async fn trash_trade(state: State<'_, AppState>, id: String) -> CommandResult<()> {
    trades::trash(&state.db, &id).await.map_err(Into::into)
}

#[tauri::command]
pub async fn restore_trade(state: State<'_, AppState>, id: String) -> CommandResult<TradeDetail> {
    trades::restore(&state.db, &id).await.map_err(Into::into)
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

#[tauri::command]
pub async fn list_deleted_trades(state: State<'_, AppState>) -> CommandResult<Vec<DeletedTrade>> {
    sqlx::query_as::<_, DeletedTrade>(
        "SELECT id, instrument, direction, deleted_at, net_pnl_minor FROM trades WHERE is_deleted = 1 ORDER BY deleted_at DESC",
    )
    .fetch_all(&state.db)
    .await
    .map_err(AppError::from)
    .map_err(Into::into)
}
