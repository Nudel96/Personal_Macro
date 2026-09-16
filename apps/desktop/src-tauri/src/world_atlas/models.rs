use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Geography {
    pub id: String,
    pub label: String,
    // Empty for explicitly identified provider aggregates without a country code.
    pub iso3: String,
    pub region_id: String,
    pub kind: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeriesDefinition {
    pub id: String,
    pub topic_id: String,
    pub source_id: String,
    pub provider_code: String,
    pub label: String,
    pub provider_label: String,
    pub unit: String,
    pub observation_kind: String,
    #[serde(default)]
    pub explanation: String,
    #[serde(default)]
    pub scope_note: String,
    /// Curated historical window, independent of the current calendar year.
    #[serde(default)]
    pub through_year: Option<i32>,
}

#[derive(Debug, Clone, Deserialize, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Point {
    pub year: i32,
    pub value: Option<f64>,
    pub source_flag: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SourcePage {
    pub url: String,
    pub sha256: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Provenance {
    pub retrieved_at: String,
    pub provider_updated_at: String,
    pub source_organization: String,
    pub definition: String,
    pub metadata_url: String,
    pub pages: Vec<SourcePage>,
    pub provider_areas: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeriesInput {
    pub series_id: String,
    pub geography_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeriesResponse {
    pub series: SeriesDefinition,
    pub geography: Geography,
    pub status: String,
    pub points: Vec<Point>,
    pub provenance: Option<Provenance>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncJob {
    pub id: String,
    pub series_id: String,
    pub status: String,
    pub page: u32,
    pub pages: u32,
    pub observations: usize,
    pub message: String,
    pub started_at: String,
    pub finished_at: Option<String>,
}

pub struct Observation {
    pub geography_id: String,
    pub point: Point,
}

pub struct Download {
    pub provenance: Provenance,
    pub observations: Vec<Observation>,
}
