use super::models::Geography;
use crate::errors::{CommandError, CommandResult};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const DATASET_ID: &str = "who-health-finance";
const CONFIG: &str =
    include_str!("../../../src/features/world-atlas/data/health-finance-catalog.json");

#[derive(Clone, Deserialize, Serialize)]
pub struct HealthFile {
    pub url: String,
    pub bytes: usize,
    pub sha256: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthArea {
    pub code: String,
    pub label: String,
    pub region: String,
    pub income: String,
    pub geography_id: String,
}
#[derive(Deserialize)]
pub struct HealthMetric {
    pub field: String,
    pub column: usize,
    pub definition: Vec<Option<String>>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthConfig {
    pub recipe: String,
    pub release: String,
    pub source_url: String,
    pub files: Vec<HealthFile>,
    pub workbook_version: Vec<String>,
    pub expected_rows: usize,
    pub expected_columns: usize,
    pub metadata_rows: usize,
    pub first_year: i32,
    pub last_year: i32,
    pub metrics: Vec<HealthMetric>,
    pub areas: Vec<HealthArea>,
}
pub fn config() -> CommandResult<HealthConfig> {
    serde_json::from_str(CONFIG)
        .map_err(|_| CommandError::validation("Der WHO-Gesundheitskatalog ist nicht lesbar."))
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthPoint {
    pub year: i32,
    pub values: BTreeMap<String, Option<f64>>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthMetadata {
    pub field: String,
    pub long_code: String,
    pub label: String,
    pub sources: Option<String>,
    pub comments: Option<String>,
    pub data_type: Option<String>,
    pub methods: Option<String>,
    pub footnote: Option<String>,
}
#[derive(Clone, Debug, Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct HealthNotes {
    pub footnote: Option<String>,
    pub release_note: Option<String>,
    pub reporting_currency: Option<String>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthProfile {
    pub geography_id: String,
    pub provider_code: String,
    pub provider_label: String,
    pub points: Vec<HealthPoint>,
    pub metadata: Vec<HealthMetadata>,
    pub notes: HealthNotes,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthProvenance {
    pub retrieved_at: String,
    pub url: String,
    pub sha256: String,
    pub notes_sha256: String,
    pub release: String,
    pub source_row_count: usize,
    pub numeric_cell_count: usize,
    pub metadata_row_count: usize,
    pub area_count: usize,
    pub recipe: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthResponse {
    pub geography: Geography,
    pub status: String,
    pub profile: Option<HealthProfile>,
    pub provenance: Option<HealthProvenance>,
}
pub struct HealthDownload {
    pub profiles: Vec<HealthProfile>,
    pub provenance: HealthProvenance,
}
