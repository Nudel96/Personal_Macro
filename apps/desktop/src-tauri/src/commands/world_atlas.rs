#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn sync_atlas_library(
    state: crate::runtime::State<'_, crate::world_atlas::AtlasState>,
    include_markets: bool,
) -> crate::errors::CommandResult<crate::world_atlas::models::SyncJob> {
    state.0.start_library(include_markets).await
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn get_atlas_public_source(
    state: crate::runtime::State<'_, crate::world_atlas::AtlasState>,
    source_id: String,
    geography_id: String,
) -> crate::errors::CommandResult<crate::world_atlas::public_models::PublicResponse> {
    crate::world_atlas::public_store::read(state.0.db().await?, &source_id, &geography_id).await
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn sync_atlas_public_source(
    state: crate::runtime::State<'_, crate::world_atlas::AtlasState>,
    source_id: String,
) -> crate::errors::CommandResult<crate::world_atlas::models::SyncJob> {
    state.0.start_public_source(&source_id).await
}
#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn cancel_atlas_library(
    state: crate::runtime::State<'_, crate::world_atlas::AtlasState>,
    job_id: String,
) -> crate::errors::CommandResult<()> {
    state.0.cancel_library(&job_id).await
}
#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn get_atlas_findex(
    state: crate::runtime::State<'_, crate::world_atlas::AtlasState>,
    geography_id: String,
) -> crate::errors::CommandResult<crate::world_atlas::findex_models::FindexResponse> {
    crate::world_atlas::findex_store::read(state.0.db().await?, &geography_id).await
}
#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn sync_atlas_findex(
    state: crate::runtime::State<'_, crate::world_atlas::AtlasState>,
) -> crate::errors::CommandResult<crate::world_atlas::models::SyncJob> {
    state.0.start_findex().await
}
#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn get_atlas_commodities(
    state: crate::runtime::State<'_, crate::world_atlas::AtlasState>,
) -> crate::errors::CommandResult<crate::world_atlas::commodity_models::CommodityResponse> {
    crate::world_atlas::commodity_store::read(state.0.db().await?).await
}
#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn sync_atlas_commodities(
    state: crate::runtime::State<'_, crate::world_atlas::AtlasState>,
) -> crate::errors::CommandResult<crate::world_atlas::models::SyncJob> {
    state.0.start_commodities().await
}
#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn get_atlas_labor(
    state: crate::runtime::State<'_, crate::world_atlas::AtlasState>,
    geography_id: String,
) -> crate::errors::CommandResult<crate::world_atlas::labor_models::LaborResponse> {
    crate::world_atlas::labor_store::read(state.0.db().await?, &geography_id).await
}
#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn sync_atlas_labor(
    state: crate::runtime::State<'_, crate::world_atlas::AtlasState>,
) -> crate::errors::CommandResult<crate::world_atlas::models::SyncJob> {
    state.0.start_labor().await
}
#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn get_atlas_innovation(
    state: crate::runtime::State<'_, crate::world_atlas::AtlasState>,
    geography_id: String,
) -> crate::errors::CommandResult<crate::world_atlas::innovation_models::InnovationResponse> {
    crate::world_atlas::innovation_store::read(state.0.db().await?, &geography_id).await
}
#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn sync_atlas_innovation(
    state: crate::runtime::State<'_, crate::world_atlas::AtlasState>,
) -> crate::errors::CommandResult<crate::world_atlas::models::SyncJob> {
    state.0.start_innovation().await
}
#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn get_atlas_health(
    state: crate::runtime::State<'_, crate::world_atlas::AtlasState>,
    geography_id: String,
) -> crate::errors::CommandResult<crate::world_atlas::health_models::HealthResponse> {
    crate::world_atlas::health_store::read(state.0.db().await?, &geography_id).await
}
#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn sync_atlas_health(
    state: crate::runtime::State<'_, crate::world_atlas::AtlasState>,
) -> crate::errors::CommandResult<crate::world_atlas::models::SyncJob> {
    state.0.start_health().await
}
#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn get_atlas_fiscal(
    state: crate::runtime::State<'_, crate::world_atlas::AtlasState>,
    geography_id: String,
) -> crate::errors::CommandResult<crate::world_atlas::fiscal_models::FiscalResponse> {
    crate::world_atlas::fiscal_store::read(state.0.db().await?, &geography_id).await
}
#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn sync_atlas_fiscal(
    state: crate::runtime::State<'_, crate::world_atlas::AtlasState>,
) -> crate::errors::CommandResult<crate::world_atlas::models::SyncJob> {
    state.0.start_fiscal().await
}
#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn get_atlas_macrohistory(
    state: crate::runtime::State<'_, crate::world_atlas::AtlasState>,
    geography_id: String,
) -> crate::errors::CommandResult<crate::world_atlas::macrohistory_models::MacrohistoryResponse> {
    crate::world_atlas::macrohistory_store::read(state.0.db().await?, &geography_id).await
}
#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn sync_atlas_macrohistory(
    state: crate::runtime::State<'_, crate::world_atlas::AtlasState>,
) -> crate::errors::CommandResult<crate::world_atlas::models::SyncJob> {
    state.0.start_macrohistory().await
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn get_atlas_housing_ratios(
    state: State<'_, crate::world_atlas::AtlasState>,
    geography_id: String,
) -> crate::errors::CommandResult<crate::world_atlas::ratio_models::HousingRatiosResponse> {
    crate::world_atlas::ratio_store::read(state.0.db().await?, &geography_id).await
}
#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn sync_atlas_housing_ratios(
    state: State<'_, crate::world_atlas::AtlasState>,
) -> crate::errors::CommandResult<crate::world_atlas::models::SyncJob> {
    state.0.start_housing_ratios().await
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn get_atlas_property(
    state: State<'_, crate::world_atlas::AtlasState>,
    geography_id: String,
) -> crate::errors::CommandResult<crate::world_atlas::property_models::PropertyResponse> {
    crate::world_atlas::property_store::read(state.0.db().await?, &geography_id).await
}
#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn sync_atlas_property(
    state: State<'_, crate::world_atlas::AtlasState>,
) -> crate::errors::CommandResult<crate::world_atlas::models::SyncJob> {
    state.0.start_property().await
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn get_atlas_credit(
    state: State<'_, crate::world_atlas::AtlasState>,
    geography_id: String,
) -> crate::errors::CommandResult<crate::world_atlas::credit_models::CreditResponse> {
    crate::world_atlas::credit_store::read(state.0.db().await?, &geography_id).await
}
#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn sync_atlas_credit(
    state: State<'_, crate::world_atlas::AtlasState>,
) -> crate::errors::CommandResult<crate::world_atlas::models::SyncJob> {
    state.0.start_credit().await
}

use crate::runtime::State;
use serde_json::Value;

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn get_atlas_capacity(
    state: State<'_, crate::world_atlas::AtlasState>,
    geography_id: String,
) -> crate::errors::CommandResult<crate::world_atlas::capacity_models::CapacityResponse> {
    crate::world_atlas::capacity_store::read(state.0.db().await?, &geography_id).await
}
#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn sync_atlas_capacity(
    state: State<'_, crate::world_atlas::AtlasState>,
) -> crate::errors::CommandResult<crate::world_atlas::models::SyncJob> {
    state.0.start_capacity().await
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn list_atlas_notebook(
    state: State<'_, crate::database::AppState>,
    trashed: bool,
) -> crate::errors::CommandResult<Vec<crate::world_atlas::notebook::EntrySummary>> {
    crate::world_atlas::notebook::list(&state.db, trashed).await
}
#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn get_atlas_notebook_entry(
    state: State<'_, crate::database::AppState>,
    id: String,
) -> crate::errors::CommandResult<crate::world_atlas::notebook::Entry> {
    crate::world_atlas::notebook::get(&state.db, &id).await
}
#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn create_atlas_notebook_entry(
    state: State<'_, crate::database::AppState>,
    input: crate::world_atlas::notebook::CreateEntry,
) -> crate::errors::CommandResult<crate::world_atlas::notebook::Entry> {
    crate::world_atlas::notebook::create(&state.db, input).await
}
#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn update_atlas_notebook_entry(
    state: State<'_, crate::database::AppState>,
    input: crate::world_atlas::notebook::UpdateEntry,
) -> crate::errors::CommandResult<crate::world_atlas::notebook::Entry> {
    crate::world_atlas::notebook::update(&state.db, input).await
}
#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn trash_atlas_notebook_entry(
    state: State<'_, crate::database::AppState>,
    id: String,
    revision: i64,
    trashed: bool,
) -> crate::errors::CommandResult<crate::world_atlas::notebook::Entry> {
    crate::world_atlas::notebook::trash(&state.db, &id, revision, trashed).await
}
#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn get_atlas_last_context(
    state: State<'_, crate::database::AppState>,
) -> crate::errors::CommandResult<Option<crate::world_atlas::notebook::SavedContext>> {
    crate::world_atlas::notebook::last_context(&state.db).await
}
#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn save_atlas_last_context(
    state: State<'_, crate::database::AppState>,
    context: crate::world_atlas::notebook::SavedContext,
) -> crate::errors::CommandResult<()> {
    crate::world_atlas::notebook::save_last_context(&state.db, context).await
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn get_atlas_valuation(
    state: State<'_, crate::world_atlas::AtlasState>,
    dataset_id: String,
) -> crate::errors::CommandResult<crate::world_atlas::valuation_models::ValuationResponse> {
    crate::world_atlas::valuation_store::read(state.0.db().await?, &dataset_id).await
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn sync_atlas_valuation(
    state: State<'_, crate::world_atlas::AtlasState>,
    dataset_id: String,
) -> crate::errors::CommandResult<crate::world_atlas::models::SyncJob> {
    state.0.start_valuation(&dataset_id).await
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn cancel_atlas_valuation(
    state: State<'_, crate::world_atlas::AtlasState>,
    job_id: String,
) -> crate::errors::CommandResult<()> {
    state.0.cancel_valuation(&job_id).await
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn sync_atlas_statistics_batch(
    state: State<'_, crate::world_atlas::AtlasState>,
    series_ids: Vec<String>,
) -> crate::errors::CommandResult<crate::world_atlas::models::SyncJob> {
    state.0.start_statistics_batch(series_ids).await
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn cancel_atlas_statistics_batch(
    state: State<'_, crate::world_atlas::AtlasState>,
    job_id: String,
) -> crate::errors::CommandResult<()> {
    state.0.cancel_statistics_batch(&job_id).await
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn get_atlas_energy(
    state: State<'_, crate::world_atlas::AtlasState>,
    geography_id: String,
) -> crate::errors::CommandResult<crate::world_atlas::energy_models::EnergyResponse> {
    crate::world_atlas::energy_store::read(state.0.db().await?, &geography_id).await
}
#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn sync_atlas_energy(
    state: State<'_, crate::world_atlas::AtlasState>,
) -> crate::errors::CommandResult<crate::world_atlas::models::SyncJob> {
    state.0.start_energy().await
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn sync_atlas_market_batch(
    state: State<'_, crate::world_atlas::AtlasState>,
    proxy_ids: Vec<String>,
) -> crate::errors::CommandResult<crate::world_atlas::models::SyncJob> {
    state.0.start_market_batch(proxy_ids).await
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn cancel_atlas_market_batch(
    state: State<'_, crate::world_atlas::AtlasState>,
    job_id: String,
) -> crate::errors::CommandResult<()> {
    state.0.cancel_market_batch(&job_id).await
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn get_atlas_history(
    state: State<'_, crate::world_atlas::AtlasState>,
    geography_id: String,
) -> crate::errors::CommandResult<crate::world_atlas::history_models::HistoryResponse> {
    crate::world_atlas::history_store::read(state.0.db().await?, &geography_id).await
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn sync_atlas_history(
    state: State<'_, crate::world_atlas::AtlasState>,
) -> crate::errors::CommandResult<crate::world_atlas::models::SyncJob> {
    state.0.start_history().await
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn get_atlas_demography(
    state: State<'_, crate::world_atlas::AtlasState>,
    geography_id: String,
) -> crate::errors::CommandResult<crate::world_atlas::demography_models::DemographyResponse> {
    crate::world_atlas::demography_store::read(state.0.db().await?, &geography_id).await
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn sync_atlas_demography(
    state: State<'_, crate::world_atlas::AtlasState>,
) -> crate::errors::CommandResult<crate::world_atlas::models::SyncJob> {
    state.0.start_demography().await
}

use crate::{
    errors::{CommandError, CommandResult},
    world_atlas::{
        AtlasState, catalog,
        models::{SeriesInput, SeriesResponse, SyncJob},
        store,
    },
};

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn get_atlas_market(
    state: State<'_, AtlasState>,
    proxy_id: String,
) -> CommandResult<crate::world_atlas::market_models::MarketResponse> {
    crate::world_atlas::market_store::read(state.0.db().await?, &proxy_id).await
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn sync_atlas_market(
    state: State<'_, AtlasState>,
    proxy_id: String,
) -> CommandResult<SyncJob> {
    state.0.start_market(&proxy_id).await
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn get_atlas_catalog() -> CommandResult<Value> {
    catalog::catalog_value()
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn get_atlas_series(
    state: State<'_, AtlasState>,
    input: SeriesInput,
) -> CommandResult<SeriesResponse> {
    store::read_series(state.0.db().await?, input).await
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn sync_atlas_series(
    state: State<'_, AtlasState>,
    series_id: String,
) -> CommandResult<SyncJob> {
    state.0.start(&series_id).await
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn get_atlas_sync_status(
    state: State<'_, AtlasState>,
    job_id: Option<String>,
) -> CommandResult<Option<SyncJob>> {
    if job_id
        .as_deref()
        .is_some_and(|id| uuid::Uuid::parse_str(id).is_err())
    {
        return Err(CommandError::validation("UngÃ¼ltige Atlas-Abrufkennung."));
    }
    store::read_job(state.0.db().await?, &state.0.session, job_id.as_deref()).await
}
#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn get_atlas_education(
    state: State<'_, crate::world_atlas::AtlasState>,
    geography_id: String,
) -> crate::errors::CommandResult<crate::world_atlas::education_models::EducationResponse> {
    crate::world_atlas::education_store::read(state.0.db().await?, &geography_id).await
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn sync_atlas_education(
    state: State<'_, crate::world_atlas::AtlasState>,
) -> crate::errors::CommandResult<crate::world_atlas::models::SyncJob> {
    state.0.start_education().await
}
#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn get_atlas_agriculture(
    state: crate::runtime::State<'_, crate::world_atlas::AtlasState>,
    geography_id: String,
) -> crate::errors::CommandResult<crate::world_atlas::agriculture_models::AgricultureResponse> {
    crate::world_atlas::agriculture_store::read(state.0.db().await?, &geography_id).await
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn sync_atlas_agriculture(
    state: crate::runtime::State<'_, crate::world_atlas::AtlasState>,
) -> crate::errors::CommandResult<crate::world_atlas::models::SyncJob> {
    state.0.start_agriculture().await
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn get_atlas_households(
    state: State<'_, AtlasState>,
    geography_id: String,
) -> CommandResult<crate::world_atlas::households_models::HouseholdsResponse> {
    crate::world_atlas::households_store::read(state.0.db().await?, &geography_id).await
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn sync_atlas_households(state: State<'_, AtlasState>) -> CommandResult<SyncJob> {
    state.0.start_households().await
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn get_atlas_debt(
    state: State<'_, AtlasState>,
    geography_id: String,
) -> CommandResult<crate::world_atlas::debt_models::DebtResponse> {
    crate::world_atlas::debt_store::read(state.0.db().await?, &geography_id).await
}
#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn sync_atlas_debt(state: State<'_, AtlasState>) -> CommandResult<SyncJob> {
    state.0.start_debt().await
}
