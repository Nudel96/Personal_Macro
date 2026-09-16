use serde::{Deserialize, Serialize};

use super::models::{Geography, SourcePage};

pub const DATASET_ID: &str = "maddison-2023-owid";
pub const REVISION: &str = "Maddison Project Database 2023 · OWID 26.04.2024";

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryPoint {
    pub year: i32,
    pub gdp_per_capita: Option<f64>,
    pub gdp: Option<f64>,
    pub world_gdp_share: Option<f64>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryProfile {
    pub geography_id: String,
    pub provider_label: String,
    pub notes: Vec<String>,
    pub points: Vec<HistoryPoint>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryProvenance {
    pub revision: String,
    pub retrieved_at: String,
    pub pages: Vec<SourcePage>,
    pub area_count: usize,
    pub source_row_count: usize,
    pub excluded_areas: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryResponse {
    pub geography: Geography,
    pub status: String,
    pub profile: Option<HistoryProfile>,
    pub provenance: Option<HistoryProvenance>,
}

pub struct HistoryDownload {
    pub profiles: Vec<HistoryProfile>,
    pub provenance: HistoryProvenance,
}
