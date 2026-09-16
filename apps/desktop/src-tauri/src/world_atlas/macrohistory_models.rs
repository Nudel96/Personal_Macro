use super::models::Geography;
use crate::errors::{CommandError, CommandResult};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const DATASET_ID: &str = "jst-macrohistory-r6";
pub const CONFIG: &str =
    include_str!("../../../src/features/world-atlas/data/macrohistory-catalog.json");
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MacrohistoryValue {
    pub value: Option<f64>,
    pub nominal: Option<f64>,
    pub interpolated: bool,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct MacrohistoryPoint {
    pub year: i32,
    pub raw: BTreeMap<String, Option<f64>>,
    pub values: BTreeMap<String, MacrohistoryValue>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MacrohistoryProfile {
    pub geography_id: String,
    pub provider_code: String,
    pub provider_label: String,
    pub points: Vec<MacrohistoryPoint>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MacrohistoryProvenance {
    pub retrieved_at: String,
    pub file_modified_at: Option<String>,
    pub url: String,
    pub resolved_url: String,
    pub sha256: String,
    pub release: String,
    pub source_row_count: usize,
    pub numeric_cell_count: usize,
    pub area_count: usize,
    pub recipe: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MacrohistoryResponse {
    pub geography: Geography,
    pub status: String,
    pub profile: Option<MacrohistoryProfile>,
    pub provenance: Option<MacrohistoryProvenance>,
}
pub struct MacrohistoryDownload {
    pub profiles: Vec<MacrohistoryProfile>,
    pub provenance: MacrohistoryProvenance,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Area {
    pub code: String,
    pub provider_label: String,
    pub ifs: i32,
    pub geography_id: String,
}
#[derive(Deserialize)]
pub struct Metric {
    pub id: String,
    pub field: String,
    pub method: String,
    pub denominator: Option<String>,
    pub flags: Vec<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub url: String,
    pub resolved_url: String,
    pub sha256: String,
    pub sheet: String,
    pub first_year: i32,
    pub last_year: i32,
    pub row_count: usize,
    pub headers: Vec<String>,
    pub areas: Vec<Area>,
    pub metrics: Vec<Metric>,
    pub recipe: String,
    pub release: String,
}
pub fn config() -> CommandResult<Config> {
    serde_json::from_str(CONFIG)
        .map_err(|_| CommandError::validation("Der JST-Katalog ist ungültig."))
}
