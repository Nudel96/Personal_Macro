use super::models::Geography;
use crate::errors::{CommandError, CommandResult};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const DATASET_ID: &str = "un-households-2026";
pub const CONFIG: &str =
    include_str!("../../../src/features/world-atlas/data/households-catalog.json");

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HouseholdObservation {
    pub record_id: String,
    pub source_row: usize,
    pub year: i32,
    pub source_category: String,
    pub source_catalog_id: String,
    pub source_name: String,
    pub unweighted: bool,
    pub values: BTreeMap<String, Option<f64>>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HouseholdsProfile {
    pub geography_id: String,
    pub provider_code: String,
    pub provider_labels: Vec<String>,
    pub observations: Vec<HouseholdObservation>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HouseholdsProvenance {
    pub retrieved_at: String,
    pub file_modified_at: Option<String>,
    pub url: String,
    pub sha256: String,
    pub release: String,
    pub source_row_count: usize,
    pub numeric_cell_count: usize,
    pub area_count: usize,
    pub recipe: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HouseholdsResponse {
    pub geography: Geography,
    pub status: String,
    pub profile: Option<HouseholdsProfile>,
    pub provenance: Option<HouseholdsProvenance>,
}
pub struct HouseholdsDownload {
    pub profiles: Vec<HouseholdsProfile>,
    pub provenance: HouseholdsProvenance,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Area {
    pub code: String,
    pub location_id: i32,
    pub provider_labels: Vec<String>,
    pub geography_id: String,
    pub years: Vec<i32>,
    pub row_count: usize,
}
#[derive(Deserialize)]
pub struct Metric {
    pub id: String,
    pub column: usize,
    pub unit: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub url: String,
    pub sha256: String,
    pub file_size: usize,
    pub sheet: String,
    pub sheets: Vec<String>,
    pub first_year: i32,
    pub last_year: i32,
    pub row_count: usize,
    pub numeric_cell_count: usize,
    pub headers: Vec<String>,
    pub areas: Vec<Area>,
    pub metrics: Vec<Metric>,
    pub source_categories: Vec<String>,
    pub unweighted_mics_catalog_ids: Vec<String>,
    pub recipe: String,
    pub release: String,
}
pub fn config() -> CommandResult<Config> {
    serde_json::from_str(CONFIG)
        .map_err(|_| CommandError::validation("Der Haushaltsdaten-Katalog ist ungültig."))
}
