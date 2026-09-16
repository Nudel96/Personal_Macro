use super::models::Geography;
use serde::{Deserialize, Serialize};

pub const DATASET_ID: &str = "bis-credit-gap";
pub const SOURCE_URL: &str = "https://data.bis.org/static/bulk/WS_CREDIT_GAP_csv_flat.zip";
pub const CONFIG: &str = include_str!("../../../src/features/world-atlas/data/credit-catalog.json");

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreditPoint {
    pub period: String,
    pub ratio: Option<f64>,
    pub trend: Option<f64>,
    pub gap: Option<f64>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreditProfile {
    pub geography_id: String,
    pub provider_code: String,
    pub provider_label: String,
    pub points: Vec<CreditPoint>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreditProvenance {
    pub retrieved_at: String,
    /// HTTP file timestamp, not the economic observation or release date.
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
pub struct CreditResponse {
    pub geography: Geography,
    pub status: String,
    pub profile: Option<CreditProfile>,
    pub provenance: Option<CreditProvenance>,
}
pub struct CreditDownload {
    pub profiles: Vec<CreditProfile>,
    pub provenance: CreditProvenance,
}
