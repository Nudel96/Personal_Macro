use serde::Deserialize;
use serde_json::Value;

use super::models::{Geography, SeriesDefinition};
use crate::errors::{CommandError, CommandResult};

pub const CATALOG_JSON: &str = include_str!("../../../src/features/world-atlas/data/catalog.json");

#[derive(Deserialize)]
pub struct Catalog {
    pub geographies: Vec<Geography>,
    pub series: Vec<SeriesDefinition>,
}

pub fn catalog() -> CommandResult<Catalog> {
    serde_json::from_str(CATALOG_JSON)
        .map_err(|_| CommandError::validation("Der Atlas-Katalog ist ungültig."))
}

pub fn catalog_value() -> CommandResult<Value> {
    serde_json::from_str(CATALOG_JSON)
        .map_err(|_| CommandError::validation("Der Atlas-Katalog ist ungültig."))
}

pub fn series(id: &str) -> CommandResult<SeriesDefinition> {
    catalog()?
        .series
        .into_iter()
        .find(|row| row.id == id)
        .ok_or_else(|| {
            CommandError::validation("Für dieses Thema ist noch keine Datenreihe angebunden.")
        })
}

pub fn geography(id: &str) -> CommandResult<Geography> {
    catalog()?
        .geographies
        .into_iter()
        .find(|row| row.id == id)
        .ok_or_else(|| CommandError::validation("Unbekanntes Atlas-Gebiet."))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn world_atlas_catalog_has_unique_worldwide_identities_and_explicit_series() {
        let data = catalog().unwrap();
        let ids: HashSet<_> = data.geographies.iter().map(|area| &area.id).collect();
        let iso: HashSet<_> = data
            .geographies
            .iter()
            .filter(|area| !area.iso3.is_empty())
            .map(|area| area.iso3.as_str())
            .collect();
        assert_eq!(ids.len(), data.geographies.len());
        assert_eq!(
            iso.len(),
            data.geographies
                .iter()
                .filter(|area| !area.iso3.is_empty())
                .count()
        );
        assert!(data.geographies.iter().all(|area| !area.iso3.is_empty()
            || area.kind == "aggregate"
            || (area.kind == "provider_area"
                && (area.id.starts_with("wto:") || area.id == "icp:BON"))));
        for expected in [
            "DEU", "USA", "IND", "CHN", "NGA", "ZAF", "TUV", "TWN", "XKX", "WLD",
        ] {
            assert!(iso.contains(expected), "Missing {expected}");
        }
        assert!(series("https://untrusted.invalid").is_err());
        assert!(geography("../../journal.sqlite").is_err());
        let full = catalog_value().unwrap();
        let topics: HashSet<_> = full["topics"]
            .as_array()
            .unwrap()
            .iter()
            .map(|t| t["id"].as_str().unwrap())
            .collect();
        assert!(
            data.series
                .iter()
                .all(|s| topics.contains(s.topic_id.as_str()))
        );
    }
}
