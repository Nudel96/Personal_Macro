use crate::errors::{CommandError, CommandResult};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const DATASET_ID: &str = "worldbank-commodity-prices";
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommodityMetric {
    pub id: String,
    pub kind: String,
    pub column: usize,
    pub nominal_label: String,
    pub real_label: String,
    pub unit: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommodityConfig {
    pub recipe: String,
    pub release: String,
    pub source_release: String,
    pub source_url: String,
    pub url: String,
    pub bytes: usize,
    pub sha256: String,
    pub first_year: i32,
    pub last_year: i32,
    pub expected_numeric_cells: usize,
    pub expected_missing_cells: usize,
    pub metrics: Vec<CommodityMetric>,
}
pub fn config() -> CommandResult<CommodityConfig> {
    serde_json::from_str(include_str!(
        "../../../src/features/world-atlas/data/commodity-catalog.json"
    ))
    .map_err(|_| CommandError::validation("Der Rohstoffpreiskatalog ist nicht lesbar."))
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommodityPoint {
    pub year: i32,
    // Published values have at most two decimal places. Integer hundredths keep
    // the original values exact through SQLite, JSON and JavaScript round trips.
    pub values: BTreeMap<String, Option<u64>>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommodityProvenance {
    pub retrieved_at: String,
    pub file_modified_at: Option<String>,
    pub url: String,
    pub file_url: String,
    pub sha256: String,
    pub release: String,
    pub source_release: String,
    pub numeric_cell_count: usize,
    pub missing_cell_count: usize,
    pub metric_count: usize,
    pub recipe: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommodityResponse {
    pub status: String,
    pub points: Vec<CommodityPoint>,
    pub provenance: Option<CommodityProvenance>,
}
pub struct CommodityDownload {
    pub points: Vec<CommodityPoint>,
    pub provenance: CommodityProvenance,
}
