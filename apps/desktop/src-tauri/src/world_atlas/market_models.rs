use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketProxy {
    pub id: String,
    pub symbol: String,
    pub label: String,
    pub topic_ids: Vec<String>,
    pub geography_id: String,
    pub scope: String,
    pub currency: String,
    pub issuer_url: String,
    pub inception: String,
    pub limits: String,
    pub breaks: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct MarketMonth {
    pub month: String,
    pub adjusted_close: Option<f64>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketProvenance {
    pub retrieved_at: String,
    pub source_url: String,
    pub sha256: String,
    pub source_first_date: String,
    pub source_last_date: String,
    pub adjustment: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WavePoint {
    pub month: String,
    pub adjusted_close: Option<f64>,
    pub wave: Option<f64>,
    pub percentile: Option<f64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketAnalysis {
    pub recipe: String,
    pub points: Vec<WavePoint>,
    pub state: String,
    pub history_months: usize,
    pub wave_months: usize,
    pub missing_months: usize,
    pub stale: bool,
    pub last_observation: Option<String>,
    pub parameter_sensitive: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketResponse {
    pub proxy: MarketProxy,
    pub status: String,
    pub provenance: Option<MarketProvenance>,
    pub analysis: MarketAnalysis,
}

pub struct MarketDownload {
    pub provenance: MarketProvenance,
    pub months: Vec<MarketMonth>,
}
