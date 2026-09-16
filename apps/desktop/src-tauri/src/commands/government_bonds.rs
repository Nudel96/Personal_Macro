use crate::{
    errors::CommandResult,
    government_bonds::{GovernmentBondsState, models::*},
};
use tauri::State;

#[tauri::command]
pub async fn get_government_bonds(
    state: State<'_, GovernmentBondsState>,
) -> CommandResult<Dashboard> {
    state.dashboard().await
}

#[tauri::command]
pub async fn get_government_bond_detail(
    state: State<'_, GovernmentBondsState>,
    input: DetailInput,
) -> CommandResult<Detail> {
    state.detail(&input).await
}

#[tauri::command]
pub async fn sync_government_bonds(
    state: State<'_, GovernmentBondsState>,
    country_id: Option<String>,
) -> CommandResult<SyncJob> {
    state.start(country_id).await
}

#[tauri::command]
pub async fn get_government_bond_sync(
    state: State<'_, GovernmentBondsState>,
) -> CommandResult<Option<SyncJob>> {
    state.job().await
}

#[tauri::command]
pub async fn cancel_government_bond_sync(
    state: State<'_, GovernmentBondsState>,
    job_id: String,
) -> CommandResult<()> {
    state.cancel(&job_id).await
}
