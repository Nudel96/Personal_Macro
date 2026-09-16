use super::models::Geography;
use serde::{Deserialize, Serialize};

pub const DATASET_ID: &str = "oecd-housing-ratios";
pub const SOURCE_URL: &str = "https://sdmx.oecd.org/public/rest/data/OECD.ECO.MPD,DSD_AN_HOUSE_PRICES@DF_HOUSE_PRICES,1.0/.Q.HPI_RPI+HPI_RPI_AVG+HPI_YDH+HPI_YDH_AVG.?dimensionAtObservation=AllDimensions&format=csvfilewithlabels";
pub const CONFIG: &str =
    include_str!("../../../src/features/world-atlas/data/housing-ratios-catalog.json");

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HousingRatioPoint {
    pub period: String,
    pub income: Option<f64>,
    pub rent: Option<f64>,
    /// Published percentage of the OECD long-term average; 100 is the reference.
    pub income_relative: Option<f64>,
    pub rent_relative: Option<f64>,
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RatioBreak {
    pub basis: String,
    pub period: String,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HousingRatioProfile {
    pub geography_id: String,
    pub provider_code: String,
    pub provider_label: String,
    pub points: Vec<HousingRatioPoint>,
    /// Observed changes in index/standardised-value scaling, not dated official methodology notes.
    pub comparability_breaks: Vec<RatioBreak>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HousingRatioProvenance {
    pub retrieved_at: String,
    /// HTTP timestamp only. This endpoint can generate it at request time.
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
pub struct HousingRatiosResponse {
    pub geography: Geography,
    pub status: String,
    pub profile: Option<HousingRatioProfile>,
    pub provenance: Option<HousingRatioProvenance>,
}
pub struct HousingRatioDownload {
    pub profiles: Vec<HousingRatioProfile>,
    pub provenance: HousingRatioProvenance,
}
