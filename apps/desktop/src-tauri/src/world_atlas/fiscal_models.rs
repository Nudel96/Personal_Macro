use super::models::Geography;
use crate::errors::{CommandError, CommandResult};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const DATASET_ID: &str = "imf-fiscal-dec2025";
pub const CONFIG: &str = include_str!("../../../src/features/world-atlas/data/fiscal-catalog.json");

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FiscalPoint {
    pub year: i32,
    pub budget_scope: u8,
    pub debt_scope: u8,
    pub values: BTreeMap<String, Option<f64>>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FiscalProfile {
    pub geography_id: String,
    pub provider_code: String,
    pub provider_labels: Vec<String>,
    pub points: Vec<FiscalPoint>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FiscalProvenance {
    pub retrieved_at: String,
    pub file_modified_at: Option<String>,
    pub url: String,
    pub original_url: String,
    pub sha256: String,
    pub release: String,
    pub source_row_count: usize,
    pub numeric_cell_count: usize,
    pub area_count: usize,
    pub recipe: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FiscalResponse {
    pub geography: Geography,
    pub status: String,
    pub profile: Option<FiscalProfile>,
    pub provenance: Option<FiscalProvenance>,
}
pub struct FiscalDownload {
    pub profiles: Vec<FiscalProfile>,
    pub provenance: FiscalProvenance,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Area {
    pub code: String,
    pub provider_labels: Vec<String>,
    pub ifs: i32,
    pub geography_id: String,
    pub first_row_year: i32,
    pub last_row_year: i32,
    pub row_count: usize,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub url: String,
    pub original_url: String,
    pub sha256: String,
    pub file_size: usize,
    pub sheet: String,
    pub first_year: i32,
    pub last_year: i32,
    pub row_count: usize,
    pub headers: Vec<String>,
    pub areas: Vec<Area>,
    pub recipe: String,
    pub release: String,
}
pub fn config() -> CommandResult<Config> {
    serde_json::from_str(CONFIG)
        .map_err(|_| CommandError::validation("Der Staatsfinanzen-Katalog ist ungültig."))
}
