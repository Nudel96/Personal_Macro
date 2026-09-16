//! Shared storage contract for individually validated additional public sources.
use super::{catalog, models::Geography};
use crate::errors::{CommandError, CommandResult};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

const CONFIG: &str =
    include_str!("../../../src/features/world-atlas/data/public-series-catalog.json");

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicArea {
    pub code: String,
    pub label: String,
    pub geography_id: String,
    pub series_titles: BTreeMap<String, String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicSource {
    pub id: String,
    pub label: String,
    pub adapter: String,
    pub url: String,
    pub documentation_url: String,
    pub license_url: String,
    pub published_at: String,
    pub reviewed_at: String,
    pub recipe: String,
    pub observation_kind: String,
    pub expected_sha256: String,
    pub expected_rows: usize,
    pub expected_numeric: usize,
    pub first_period: String,
    pub last_period: String,
    pub areas: Vec<PublicArea>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicMetric {
    pub id: String,
    pub source_id: String,
    pub topic_id: String,
    pub provider_code: String,
    pub label: String,
    pub unit: String,
    pub frequency: String,
    pub kind: String,
    pub comparison: String,
    pub connect_adjacent: bool,
    pub explanation: String,
    pub scope_note: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct PublicCatalog {
    pub version: String,
    pub sources: Vec<PublicSource>,
    pub metrics: Vec<PublicMetric>,
}

pub fn config() -> CommandResult<PublicCatalog> {
    let data: PublicCatalog = serde_json::from_str(CONFIG).map_err(|_| invalid())?;
    let sources: BTreeSet<_> = data.sources.iter().map(|s| &s.id).collect();
    let metrics: BTreeSet<_> = data.metrics.iter().map(|m| &m.id).collect();
    if sources.len() != data.sources.len()
        || metrics.len() != data.metrics.len()
        || data.metrics.iter().any(|m| !sources.contains(&m.source_id))
    {
        return Err(invalid());
    }
    Ok(data)
}

pub fn source(id: &str) -> CommandResult<PublicSource> {
    config()?
        .sources
        .into_iter()
        .find(|s| s.id == id)
        .ok_or_else(invalid)
}

pub fn invalid() -> CommandError {
    CommandError::validation(
        "Die zusätzlichen Atlasdaten entsprechen nicht dem geprüften Quellenvertrag. Der bisherige Stand bleibt erhalten.",
    )
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PublicPoint {
    pub period: String,
    /// Preserve the provider's decimal text, including real zero. None is missing.
    pub value: Option<String>,
    pub status: String,
    #[serde(default)]
    pub break_before: bool,
    #[serde(default)]
    pub notes: Vec<String>,
    #[serde(default)]
    pub lower_bound: Option<String>,
    #[serde(default)]
    pub upper_bound: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PublicProfile {
    pub metric_id: String,
    pub geography_id: String,
    pub provider_area: String,
    pub provider_label: String,
    pub provider_title: String,
    pub unit: String,
    pub points: Vec<PublicPoint>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicProvenance {
    pub source_id: String,
    pub retrieved_at: String,
    pub published_at: String,
    pub url: String,
    pub documentation_url: String,
    pub sha256: String,
    pub recipe: String,
    pub source_rows: usize,
    pub numeric_values: usize,
    pub area_count: usize,
}

pub struct PublicDownload {
    pub profiles: Vec<PublicProfile>,
    pub provenance: PublicProvenance,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicResponse {
    pub source: PublicSource,
    pub geography: Geography,
    pub metrics: Vec<PublicMetric>,
    pub profiles: Vec<PublicProfile>,
    pub status: String,
    pub provenance: Option<PublicProvenance>,
}

pub fn validate_geographies(source: &PublicSource) -> CommandResult<()> {
    let areas = catalog::catalog()?.geographies;
    let mut codes = BTreeSet::new();
    let mut mapped = BTreeSet::new();
    for area in &source.areas {
        if !codes.insert(&area.code)
            || !mapped.insert(&area.geography_id)
            || !areas.iter().any(|g| g.id == area.geography_id)
            || area.series_titles.is_empty()
        {
            return Err(invalid());
        }
    }
    Ok(())
}
