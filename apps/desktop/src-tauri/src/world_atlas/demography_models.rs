use serde::{Deserialize, Serialize};

use super::models::{Geography, SourcePage};

pub const DATASET_ID: &str = "un-wpp-2024-age5";
pub const ESTIMATE_END: i32 = 2023;
pub const PROJECTION_START: i32 = 2024;

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AgePopulation {
    pub age_start: u8,
    // WPP publishes thousands of people; the adapter converts to people once.
    pub male: Option<f64>,
    pub female: Option<f64>,
    pub total: Option<f64>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DemographyYear {
    pub year: i32,
    pub kind: String,
    pub ages: Vec<AgePopulation>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DemographyProfile {
    pub geography_id: String,
    pub provider_id: String,
    pub provider_label: String,
    pub notes: Vec<String>,
    pub years: Vec<DemographyYear>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DemographyProvenance {
    pub revision: String,
    pub retrieved_at: String,
    pub estimate_end: i32,
    pub projection_start: i32,
    pub pages: Vec<SourcePage>,
    pub area_count: usize,
    pub source_row_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DemographyResponse {
    pub geography: Geography,
    pub status: String,
    pub profile: Option<DemographyProfile>,
    pub provenance: Option<DemographyProvenance>,
}

pub struct DemographyDownload {
    pub provenance: DemographyProvenance,
    pub profiles: Vec<DemographyProfile>,
}
