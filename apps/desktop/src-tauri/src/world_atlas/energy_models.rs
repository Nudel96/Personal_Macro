use super::models::{Geography, SourcePage};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const DATASET_ID: &str = "ember-yearly-electricity";
pub const SOURCE_URL: &str =
    "https://files.ember-energy.org/public-downloads/yearly_full_release_long_format.csv";

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnergyYear {
    pub year: i32,
    /// Source values: generation.* in TWh, share.* in %, capacity.* in GW,
    /// demand in TWh, demand_per_capita in MWh, net_imports in TWh.
    /// Missing rows stay absent; explicit empty source cells stay null.
    pub values: BTreeMap<String, Option<f64>>,
}
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnergyProfile {
    pub geography_id: String,
    pub provider_label: String,
    pub aggregate: bool,
    pub years: Vec<EnergyYear>,
}
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnergyProvenance {
    pub retrieved_at: String,
    pub source_updated_at: Option<String>,
    pub etag: Option<String>,
    pub source: SourcePage,
    pub source_row_count: usize,
    pub area_count: usize,
    pub year_first: i32,
    pub year_last: i32,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnergyResponse {
    pub geography: Geography,
    pub status: String,
    pub profile: Option<EnergyProfile>,
    pub provenance: Option<EnergyProvenance>,
}
pub struct EnergyDownload {
    pub profiles: Vec<EnergyProfile>,
    pub provenance: EnergyProvenance,
}
