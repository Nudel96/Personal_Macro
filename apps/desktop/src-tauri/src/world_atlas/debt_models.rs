use super::models::Geography;
use crate::errors::{CommandError, CommandResult};
use serde::{Deserialize, Serialize};

pub const DATASET_ID: &str = "bis-borrower-debt";
pub const SOURCE_URL: &str = "https://data.bis.org/static/bulk/WS_TC_csv_flat.zip";
const CONFIG: &str = include_str!("../../../src/features/world-atlas/data/debt-catalog.json");

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DebtArea {
    pub code: String,
    pub label: String,
    pub series_label: String,
    pub geography_id: String,
    pub decimals: u8,
}
#[derive(Deserialize)]
pub struct DebtConfig {
    pub recipe: String,
    pub areas: Vec<DebtArea>,
}
pub fn config() -> CommandResult<DebtConfig> {
    serde_json::from_str(CONFIG)
        .map_err(|_| CommandError::validation("Der BIS-Schuldenkatalog ist nicht lesbar."))
}
#[derive(Clone, Debug, Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DebtPoint {
    pub period: String,
    pub households: Option<f64>,
    pub corporations: Option<f64>,
    pub households_break: bool,
    pub corporations_break: bool,
    pub households_pre_break: String,
    pub corporations_pre_break: String,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DebtProfile {
    pub geography_id: String,
    pub provider_code: String,
    pub provider_label: String,
    pub decimals: u8,
    pub points: Vec<DebtPoint>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DebtProvenance {
    pub retrieved_at: String,
    pub file_modified_at: Option<String>,
    pub url: String,
    pub sha256: String,
    pub source_row_count: usize,
    pub numeric_cell_count: usize,
    pub area_count: usize,
    pub recipe: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DebtResponse {
    pub geography: Geography,
    pub status: String,
    pub profile: Option<DebtProfile>,
    pub provenance: Option<DebtProvenance>,
}
pub struct DebtDownload {
    pub profiles: Vec<DebtProfile>,
    pub provenance: DebtProvenance,
}
