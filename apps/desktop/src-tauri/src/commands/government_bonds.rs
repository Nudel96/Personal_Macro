use crate::runtime::State;
use crate::{
    errors::CommandResult,
    government_bonds::{GovernmentBondsState, models::*},
};

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn get_government_bonds(
    state: State<'_, GovernmentBondsState>,
) -> CommandResult<Dashboard> {
    state.dashboard().await
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn get_government_bond_detail(
    state: State<'_, GovernmentBondsState>,
    input: DetailInput,
) -> CommandResult<Detail> {
    state.detail(&input).await
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn sync_government_bonds(
    state: State<'_, GovernmentBondsState>,
    country_id: Option<String>,
) -> CommandResult<SyncJob> {
    state.start(country_id).await
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn get_government_bond_sync(
    state: State<'_, GovernmentBondsState>,
) -> CommandResult<Option<SyncJob>> {
    state.job().await
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn cancel_government_bond_sync(
    state: State<'_, GovernmentBondsState>,
    job_id: String,
) -> CommandResult<()> {
    state.cancel(&job_id).await
}
