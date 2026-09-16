use super::models::Geography;
use crate::errors::{CommandError, CommandResult};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const DATASET_ID: &str = "worldbank-findex-2025";
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FindexArea {
    pub code: String,
    pub label: String,
    pub geography_id: String,
    pub iso3: String,
}
#[derive(Deserialize)]
pub struct FindexMetric {
    pub field: String,
}
#[derive(Deserialize)]
pub struct FindexPopulation {
    pub id: String,
    pub group: String,
    pub value: String,
}
#[derive(Deserialize)]
pub struct FindexSourceGroup {
    pub group: String,
    pub value: String,
    pub rows: usize,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FindexConfig {
    pub recipe: String,
    pub release: String,
    pub source_url: String,
    pub url: String,
    pub bytes: usize,
    pub sha256: String,
    pub glossary_sha256: String,
    pub years: Vec<i32>,
    pub headers: Vec<String>,
    pub expected_rows: usize,
    pub expected_selected_rows: usize,
    pub expected_numeric_cells: usize,
    pub metrics: Vec<FindexMetric>,
    pub populations: Vec<FindexPopulation>,
    pub source_groups: Vec<FindexSourceGroup>,
    pub areas: Vec<FindexArea>,
}
pub fn config() -> CommandResult<FindexConfig> {
    serde_json::from_str(include_str!(
        "../../../src/features/world-atlas/data/findex-catalog.json"
    ))
    .map_err(|_| CommandError::validation("Der Findex-Katalog ist nicht lesbar."))
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FindexPoint {
    pub year: i32,
    pub population: String,
    // Preserve the published fractional decimal exactly; percentages are a display conversion.
    pub values: BTreeMap<String, Option<String>>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FindexProfile {
    pub geography_id: String,
    pub provider_code: String,
    pub provider_label: String,
    pub points: Vec<FindexPoint>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FindexProvenance {
    pub retrieved_at: String,
    pub url: String,
    pub sha256: String,
    pub glossary_sha256: String,
    pub release: String,
    pub source_row_count: usize,
    pub selected_row_count: usize,
    pub numeric_cell_count: usize,
    pub area_count: usize,
    pub recipe: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FindexResponse {
    pub geography: Geography,
    pub status: String,
    pub profile: Option<FindexProfile>,
    pub provenance: Option<FindexProvenance>,
}
pub struct FindexDownload {
    pub profiles: Vec<FindexProfile>,
    pub provenance: FindexProvenance,
}
