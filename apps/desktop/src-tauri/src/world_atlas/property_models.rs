use super::models::Geography;
use serde::{Deserialize, Serialize};

pub const DATASET_ID: &str = "bis-residential-property";
pub const SOURCE_URL: &str = "https://data.bis.org/static/bulk/WS_SPP_csv_flat.zip";
pub const CONFIG: &str =
    include_str!("../../../src/features/world-atlas/data/property-catalog.json");

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PropertyPoint {
    pub period: String,
    pub real: Option<f64>,
    pub nominal: Option<f64>,
    pub real_change: Option<f64>,
    pub nominal_change: Option<f64>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PropertyProfile {
    pub geography_id: String,
    pub provider_code: String,
    pub provider_label: String,
    pub points: Vec<PropertyPoint>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PropertyProvenance {
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
pub struct PropertyResponse {
    pub geography: Geography,
    pub status: String,
    pub profile: Option<PropertyProfile>,
    pub provenance: Option<PropertyProvenance>,
}
pub struct PropertyDownload {
    pub profiles: Vec<PropertyProfile>,
    pub provenance: PropertyProvenance,
}
