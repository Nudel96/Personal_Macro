use super::models::Geography;
use crate::errors::{CommandError, CommandResult};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const DATASET_ID: &str = "wipo-technology";
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InnovationArea {
    pub code: String,
    pub label: String,
    pub geography_id: String,
    pub iso3: String,
}
#[derive(Deserialize)]
pub struct InnovationExcludedArea {
    pub code: String,
    pub label: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InnovationMetric {
    pub field: String,
    pub source_label: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InnovationConfig {
    pub recipe: String,
    pub release: String,
    pub source_release: String,
    pub source_url: String,
    pub release_url: String,
    pub url: String,
    pub bytes: usize,
    pub sha256: String,
    pub first_year: i32,
    pub last_year: i32,
    pub expected_rows: usize,
    pub expected_numeric_cells: usize,
    pub expected_current_numeric_cells: usize,
    pub requested_origins: Vec<String>,
    pub absent_origins: Vec<String>,
    pub excluded_origins: Vec<InnovationExcludedArea>,
    pub metrics: Vec<InnovationMetric>,
    pub areas: Vec<InnovationArea>,
}
pub fn config() -> CommandResult<InnovationConfig> {
    serde_json::from_str(include_str!(
        "../../../src/features/world-atlas/data/innovation-catalog.json"
    ))
    .map_err(|_| CommandError::validation("Der WIPO-Technologiekatalog ist nicht lesbar."))
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InnovationPoint {
    pub year: i32,
    pub values: BTreeMap<String, Option<u64>>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InnovationProfile {
    pub geography_id: String,
    pub provider_code: String,
    pub provider_label: String,
    pub points: Vec<InnovationPoint>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InnovationProvenance {
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
pub struct InnovationResponse {
    pub geography: Geography,
    pub status: String,
    pub profile: Option<InnovationProfile>,
    pub provenance: Option<InnovationProvenance>,
}
pub struct InnovationDownload {
    pub profiles: Vec<InnovationProfile>,
    pub provenance: InnovationProvenance,
}
