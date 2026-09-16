use super::models::Geography;
use crate::errors::{CommandError, CommandResult};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const DATASET_ID: &str = "ilo-sector-employment";
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaborArea {
    pub source: String,
    pub code: String,
    pub label: String,
    pub geography_id: String,
    pub iso3: String,
}
#[derive(Deserialize)]
pub struct LaborExcludedArea {
    pub source: String,
    pub code: String,
    pub label: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaborMetric {
    pub field: String,
    pub source_label: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaborConfig {
    pub recipe: String,
    pub release: String,
    pub source_release: String,
    pub source_url: String,
    pub url: String,
    pub bytes: usize,
    pub sha256: String,
    pub first_year: i32,
    pub last_year: i32,
    pub expected_rows: usize,
    pub expected_numeric_cells: usize,
    pub expected_current_numeric_cells: usize,
    pub excluded_areas: Vec<LaborExcludedArea>,
    pub total_field: String,
    pub total_label: String,
    pub metrics: Vec<LaborMetric>,
    pub areas: Vec<LaborArea>,
}
pub fn config() -> CommandResult<LaborConfig> {
    serde_json::from_str(include_str!(
        "../../../src/features/world-atlas/data/labor-catalog.json"
    ))
    .map_err(|_| CommandError::validation("Der ILO-Beschäftigungskatalog ist nicht lesbar."))
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaborPoint {
    pub year: i32,
    pub values: BTreeMap<String, Option<u64>>,
    pub flags: BTreeMap<String, String>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaborProfile {
    pub geography_id: String,
    pub provider_code: String,
    pub provider_label: String,
    pub points: Vec<LaborPoint>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaborProvenance {
    pub retrieved_at: String,
    pub url: String,
    pub sha256: String,
    pub release: String,
    pub source_release: String,
    pub source_row_count: usize,
    pub source_numeric_cell_count: usize,
    pub numeric_cell_count: usize,
    pub area_count: usize,
    pub recipe: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaborResponse {
    pub geography: Geography,
    pub status: String,
    pub profile: Option<LaborProfile>,
    pub provenance: Option<LaborProvenance>,
}
pub struct LaborDownload {
    pub profiles: Vec<LaborProfile>,
    pub provenance: LaborProvenance,
}
