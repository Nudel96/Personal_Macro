use super::{energy_models::EnergyProfile, models::Geography};
use serde::{Deserialize, Serialize};

pub const DATASET_ID: &str = "irena-capacity-2026-h1";
pub const API_BASE: &str =
    "https://pxweb.irena.org/api/v1/en/IRENASTAT/Power%20Capacity%20and%20Generation/";
pub const CONFIG: &str =
    include_str!("../../../src/features/world-atlas/data/capacity-catalog.json");

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapacityFile {
    pub url: String,
    pub sha256: String,
    pub table: String,
    pub area_codes: Vec<String>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapacityProvenance {
    pub retrieved_at: String,
    /// Source-local date/time; the provider does not specify a timezone.
    pub source_updated_at: String,
    pub source_label: String,
    pub files: Vec<CapacityFile>,
    pub source_cell_count: usize,
    pub numeric_cell_count: usize,
    pub area_count: usize,
    pub omitted_country_codes: Vec<String>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapacityResponse {
    pub geography: Geography,
    pub status: String,
    /// Each value is MW of capacity. Keys: technology-id.ongrid/offgrid.
    /// The provider's non-numeric "-" marker remains null, never invented zero.
    pub profile: Option<EnergyProfile>,
    pub provenance: Option<CapacityProvenance>,
}
pub struct CapacityDownload {
    pub profiles: Vec<EnergyProfile>,
    pub provenance: CapacityProvenance,
}
