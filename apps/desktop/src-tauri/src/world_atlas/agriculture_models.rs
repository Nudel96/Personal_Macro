use super::models::Geography;
use crate::errors::{CommandError, CommandResult};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const DATASET_ID: &str = "fao-production-indices";
pub const SOURCE_URL: &str =
    "https://bulks-faostat.fao.org/production/Production_Indices_E_All_Data_(Normalized).zip";
pub const CONFIG: &str =
    include_str!("../../../src/features/world-atlas/data/agriculture-catalog.json");

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgriculturePoint {
    pub year: i32,
    pub total: Option<f64>,
    pub per_capita: Option<f64>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgricultureProfile {
    pub geography_id: String,
    pub provider_code: String,
    pub provider_label: String,
    pub series: BTreeMap<String, Vec<AgriculturePoint>>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgricultureProvenance {
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
pub struct AgricultureResponse {
    pub geography: Geography,
    pub status: String,
    pub profile: Option<AgricultureProfile>,
    pub provenance: Option<AgricultureProvenance>,
}
pub struct AgricultureDownload {
    pub profiles: Vec<AgricultureProfile>,
    pub provenance: AgricultureProvenance,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Area {
    pub code: String,
    pub m49: String,
    pub provider_label: String,
    pub geography_id: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub code: String,
    pub cpc: String,
    pub provider_label: String,
}
#[derive(Deserialize)]
pub struct Config {
    pub areas: Vec<Area>,
    pub items: Vec<Item>,
    pub elements: BTreeMap<String, String>,
    pub recipe: String,
    pub release: String,
}
pub fn config() -> CommandResult<Config> {
    serde_json::from_str(CONFIG)
        .map_err(|_| CommandError::validation("Der FAO-Katalog ist ungültig."))
}
