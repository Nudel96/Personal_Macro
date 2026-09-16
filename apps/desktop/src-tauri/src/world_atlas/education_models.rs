use super::models::Geography;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const DATASET_ID: &str = "uis-education";
pub const SOURCE_URL: &str = "https://download.uis.unesco.org/bdds/202602/SDG.zip";
pub const CONFIG: &str =
    include_str!("../../../src/features/world-atlas/data/education-catalog.json");

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EducationNote {
    pub kind: String,
    pub text: String,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EducationPoint {
    pub year: i32,
    pub value: Option<f64>,
    pub magnitude: String,
    pub qualifier: String,
    pub notes: Vec<EducationNote>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EducationProfile {
    pub geography_id: String,
    pub provider_code: String,
    pub series: BTreeMap<String, Vec<EducationPoint>>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EducationProvenance {
    pub retrieved_at: String,
    pub file_modified_at: Option<String>,
    pub url: String,
    pub sha256: String,
    pub release: String,
    pub source_row_count: usize,
    pub numeric_cell_count: usize,
    pub metadata_count: usize,
    pub area_count: usize,
    pub recipe: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EducationResponse {
    pub geography: Geography,
    pub status: String,
    pub profile: Option<EducationProfile>,
    pub provenance: Option<EducationProvenance>,
}
pub struct EducationDownload {
    pub profiles: Vec<EducationProfile>,
    pub provenance: EducationProvenance,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EducationMetric {
    pub code: String,
    pub provider_label: String,
    pub bounded_percentage: bool,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EducationArea {
    pub code: String,
    pub label: String,
    pub geography_id: String,
}
#[derive(Deserialize)]
pub struct EducationRegion {
    pub code: String,
    pub members: Vec<String>,
}
#[derive(Deserialize)]
pub struct EducationConfig {
    pub metrics: Vec<EducationMetric>,
    pub areas: Vec<EducationArea>,
    pub regions: Vec<EducationRegion>,
}
pub fn config() -> crate::errors::CommandResult<EducationConfig> {
    serde_json::from_str(CONFIG).map_err(|_| {
        crate::errors::CommandError::validation("Der Bildungskatalog ist nicht lesbar.")
    })
}
