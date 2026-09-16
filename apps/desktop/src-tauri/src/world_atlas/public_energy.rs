//! Reviewed energy and household-heating releases with explicit dimensions and date bounds.
use super::public_models::*;
use crate::errors::CommandResult;
use serde::Deserialize;
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

const CONTRACTS: &str =
    include_str!("../../../src/features/world-atlas/data/public-energy-contract.json");

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Contract {
    source_id: String,
    dataset: String,
    url: String,
    label: String,
    updated: String,
    dimensions: Value,
    ids: Vec<String>,
    sizes: Vec<usize>,
    flag_labels: BTreeMap<String, String>,
    excluded_areas: BTreeSet<String>,
    metric_dimension: String,
    first_year: i32,
    last_year: i32,
    maximum_value: f64,
    ambiguous_zero: bool,
    #[cfg_attr(not(test), allow(dead_code))]
    file: String,
    expected_profiles: usize,
    areas: Value,
    metric_ids: Vec<String>,
}

fn contract(id: &str) -> CommandResult<Contract> {
    serde_json::from_str::<Vec<Contract>>(CONTRACTS)
        .map_err(|_| invalid())?
        .into_iter()
        .find(|c| c.source_id == id)
        .ok_or_else(invalid)
}

pub fn url(id: &str) -> CommandResult<String> {
    let c = contract(id)?;
    let parsed = reqwest::Url::parse(&c.url).map_err(|_| invalid())?;
    if parsed.scheme() != "https"
        || parsed.host_str() != Some("ec.europa.eu")
        || parsed.path()
            != format!(
                "/eurostat/api/dissemination/statistics/1.0/data/{}",
                c.dataset
            )
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.port().is_some()
        || parsed.fragment().is_some()
    {
        return Err(invalid());
    }
    Ok(c.url)
}

pub fn parse(source: &PublicSource, bytes: &[u8]) -> CommandResult<(Vec<PublicProfile>, usize)> {
    let c = contract(&source.id)?;
    let obj: Value = serde_json::from_slice(bytes).map_err(|_| invalid())?;
    let extension = &obj["extension"];
    let flags: BTreeMap<String, String> = extension
        .get("status")
        .and_then(|s| s.get("label"))
        .map(|v| serde_json::from_value(v.clone()))
        .transpose()
        .map_err(|_| invalid())?
        .unwrap_or_default();
    if source.url != c.url
        || source.published_at != c.updated.get(..10).ok_or_else(invalid)?
        || serde_json::to_value(&source.areas).map_err(|_| invalid())? != c.areas
        || obj["class"] != "dataset"
        || obj["version"] != "2.0"
        || obj["label"] != c.label
        || obj["updated"] != c.updated
        || obj["dimension"] != c.dimensions
        || obj["id"] != serde_json::to_value(&c.ids).map_err(|_| invalid())?
        || obj["size"] != serde_json::to_value(&c.sizes).map_err(|_| invalid())?
        || extension["agencyId"] != "ESTAT"
        || extension["id"] != c.dataset.to_uppercase()
        || flags != c.flag_labels
        || c.ids.len() != c.sizes.len()
    {
        return Err(invalid());
    }
    let cfg = config()?;
    let metrics: BTreeMap<_, _> = cfg
        .metrics
        .iter()
        .filter(|m| m.source_id == source.id)
        .map(|m| (m.provider_code.as_str(), m))
        .collect();
    if metrics.values().map(|m| &m.id).collect::<BTreeSet<_>>()
        != c.metric_ids.iter().collect::<BTreeSet<_>>()
        || metrics.values().any(|m| m.frequency != "annual")
    {
        return Err(invalid());
    }
    let areas: BTreeMap<_, _> = source.areas.iter().map(|a| (a.code.as_str(), a)).collect();
    let codes = c
        .ids
        .iter()
        .zip(&c.sizes)
        .map(|(id, size)| {
            let index = c.dimensions[id]["category"]["index"]
                .as_object()
                .ok_or_else(invalid)?;
            let mut ordered = BTreeMap::new();
            for (code, position) in index {
                let position = position.as_u64().ok_or_else(invalid)? as usize;
                if ordered.insert(position, code.as_str()).is_some() {
                    return Err(invalid());
                }
            }
            if ordered.len() != *size || ordered.keys().copied().ne(0..*size) {
                return Err(invalid());
            }
            Ok(ordered.into_values().collect::<Vec<_>>())
        })
        .collect::<CommandResult<Vec<_>>>()?;
    let total = c
        .sizes
        .iter()
        .try_fold(1usize, |n, size| n.checked_mul(*size))
        .filter(|n| *n > 0 && *n < 100_000)
        .ok_or_else(invalid)?;
    let values = obj["value"].as_object().ok_or_else(invalid)?;
    let empty = serde_json::Map::new();
    let statuses = obj
        .get("status")
        .map(|v| v.as_object().ok_or_else(invalid))
        .transpose()?
        .unwrap_or(&empty);
    for key in values.keys().chain(statuses.keys()) {
        let pos = key.parse::<usize>().map_err(|_| invalid())?;
        if pos >= total || pos.to_string() != *key {
            return Err(invalid());
        }
    }
    let metric_dim = c.metric_dimension.as_str();
    let mut profiles: BTreeMap<(String, String), PublicProfile> = BTreeMap::new();
    for position in 0..total {
        let mut rem = position;
        let mut row = BTreeMap::new();
        for index in (0..c.ids.len()).rev() {
            row.insert(c.ids[index].as_str(), codes[index][rem % c.sizes[index]]);
            rem /= c.sizes[index];
        }
        let code = *row.get(metric_dim).ok_or_else(invalid)?;
        let area_code = *row.get("geo").ok_or_else(invalid)?;
        let year = row
            .get("time")
            .ok_or_else(invalid)?
            .parse::<i32>()
            .map_err(|_| invalid())?;
        if !(1990..=2025).contains(&year) {
            return Err(invalid());
        }
        let key = position.to_string();
        let flag = statuses
            .get(&key)
            .map(|v| v.as_str().ok_or_else(invalid))
            .transpose()?
            .unwrap_or("");
        let mut value = values
            .get(&key)
            .filter(|v| !v.is_null())
            .map(|v| {
                let n = v.as_f64().ok_or_else(invalid)?;
                if !n.is_finite() || n < 0.0 || n > c.maximum_value {
                    return Err(invalid());
                }
                Ok(v.to_string())
            })
            .transpose()?;
        if !flag.is_empty() && !flags.contains_key(flag) {
            return Err(invalid());
        }
        let ambiguous_zero = c.ambiguous_zero
            && value
                .as_deref()
                .is_some_and(|v| v.parse::<f64>() == Ok(0.0));
        if ambiguous_zero {
            value = None;
        }
        if c.excluded_areas.contains(area_code) || !(c.first_year..=c.last_year).contains(&year) {
            continue;
        }
        // Some listed countries/metric combinations have no published observations.
        let Some(area) = areas.get(area_code) else {
            if value.is_some() {
                return Err(invalid());
            }
            continue;
        };
        let metric = metrics.get(code).ok_or_else(invalid)?;
        let Some(title) = area.series_titles.get(code) else {
            if value.is_some() {
                return Err(invalid());
            }
            continue;
        };
        let period = year.to_string();
        let mut notes = if source.id == "eurostat-district-heating" {
            vec!["Erhebungsjahr 2023 · Personen in Privathaushalten.".into()]
        } else {
            Vec::new()
        };
        let mut status = match flag {
            "" => "",
            "p" => "Vorläufig laut Quelle (p)",
            "e" => "Quellenschätzung (e)",
            "b" => "Reihenbruch laut Quelle (b)",
            "n" => "Nicht signifikant laut Quelle (n)",
            _ => return Err(invalid()),
        }
        .to_owned();
        if ambiguous_zero {
            if !status.is_empty() {
                status.push_str(" · ");
            }
            status.push_str("Quellen-Null · Bedeutung nicht eindeutig");
            notes.push("Originalwert 0: Das jährliche Energie-Meldesystem trennt echte Null, sehr kleine Mengen, fehlende und vertrauliche Angaben nicht sicher. Ohne weitere Quellenkennzeichnung bleibt die Zahl im Bild offen.".into());
        }
        profiles
            .entry((metric.id.clone(), area.geography_id.clone()))
            .or_insert_with(|| PublicProfile {
                metric_id: metric.id.clone(),
                geography_id: area.geography_id.clone(),
                provider_area: area.code.clone(),
                provider_label: area.label.clone(),
                provider_title: title.clone(),
                unit: metric.unit.clone(),
                points: Vec::new(),
            })
            .points
            .push(PublicPoint {
                period,
                value,
                status,
                break_before: flag == "b",
                notes,
                lower_bound: None,
                upper_bound: None,
            });
    }
    if profiles.len() != c.expected_profiles {
        return Err(invalid());
    }
    Ok((profiles.into_values().collect(), values.len()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn energy_contracts_bind_exact_dimensions_and_reviewed_years() {
        let bio = contract("eurostat-bioenergy").unwrap();
        assert_eq!(
            bio.dimensions["nrg_bal"]["category"]["index"],
            serde_json::json!({"IPRD":0})
        );
        assert_eq!(
            bio.dimensions["unit"]["category"]["index"],
            serde_json::json!({"TJ":0})
        );
        let heat = contract("eurostat-heat-pumps").unwrap();
        assert_eq!((heat.first_year, heat.last_year), (2004, 2024));
        assert_eq!(
            heat.dimensions["plant_tec"]["category"]["index"],
            serde_json::json!({"CAP_HEAT":0})
        );
        let district = contract("eurostat-district-heating").unwrap();
        assert_eq!((district.first_year, district.last_year), (2023, 2023));
        assert_eq!(district.maximum_value, 100.0);
        assert_eq!(
            district.dimensions["hhcomp"]["category"]["index"],
            serde_json::json!({"TOTAL":0})
        );
        assert!(url("arbitrary-url").is_err());
        for id in [bio.source_id, heat.source_id, district.source_id] {
            assert!(
                url(&id)
                    .unwrap()
                    .starts_with("https://ec.europa.eu/eurostat/api/")
            );
            assert!(
                !source(&id)
                    .unwrap()
                    .areas
                    .iter()
                    .any(|a| a.geography_id == "world")
            );
        }
    }

    #[tokio::test]
    #[ignore = "Full original Eurostat files and independent Python Cartesian audit"]
    async fn public_energy_originals_roundtrip() {
        let raw =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../.tmp/atlas-remaining-40");
        let expected: BTreeMap<String, Vec<PublicProfile>> = serde_json::from_slice(
            &std::fs::read(raw.join("energy-expected-profiles.json")).unwrap(),
        )
        .unwrap();
        let root = tempfile::tempdir().unwrap();
        let db = super::super::store::open(root.path()).await.unwrap();
        for c in serde_json::from_str::<Vec<Contract>>(CONTRACTS).unwrap() {
            let bytes = std::fs::read(raw.join(&c.file)).unwrap();
            let source = source(&c.source_id).unwrap();
            let data = super::super::public_source::parse_download(&source, &bytes).unwrap();
            assert_eq!(data.profiles, expected[&source.id], "{}", source.id);
            super::super::public_store::replace(&db, data)
                .await
                .unwrap();
            let mut wrong = source.clone();
            wrong.areas[0].geography_id = "world".into();
            assert!(parse(&wrong, &bytes).is_err());
            for mutation in [
                "unit",
                "year",
                "negative",
                "flag",
                "position",
                "denominator",
            ] {
                let mut obj: Value = serde_json::from_slice(&bytes).unwrap();
                match mutation {
                    "unit" => {
                        obj["dimension"]["unit"]["category"]["label"] =
                            serde_json::json!({"MWH":"Electrical generation"})
                    }
                    "year" => obj["dimension"]["time"]["category"]["index"]["2035"] = 999.into(),
                    "negative" => {
                        *obj["value"]
                            .as_object_mut()
                            .unwrap()
                            .values_mut()
                            .next()
                            .unwrap() = (-1).into()
                    }
                    "flag" => obj["status"]["0"] = "unreviewed".into(),
                    "position" => obj["value"]["999999"] = 0.into(),
                    "denominator" => {
                        obj["dimension"]["hhcomp"] =
                            serde_json::json!({"category":{"index":{"A2":0}}})
                    }
                    _ => unreachable!(),
                }
                assert!(
                    parse(&source, &serde_json::to_vec(&obj).unwrap()).is_err(),
                    "{mutation}"
                );
            }
            let mut zero: Value = serde_json::from_slice(&bytes).unwrap();
            for v in zero["value"].as_object_mut().unwrap().values_mut() {
                *v = 0.into();
            }
            let (zero, _) = parse(&source, &serde_json::to_vec(&zero).unwrap()).unwrap();
            if c.ambiguous_zero {
                assert!(
                    zero.iter()
                        .flat_map(|p| &p.points)
                        .all(|p| p.value.is_none())
                );
                assert!(
                    zero.iter()
                        .flat_map(|p| &p.points)
                        .any(|p| p.status.contains("Quellen-Null"))
                );
            } else {
                assert!(
                    zero.iter()
                        .flat_map(|p| &p.points)
                        .filter_map(|p| p.value.as_deref())
                        .all(|v| v == "0")
                );
            }
        }
        db.close().await;
        let db = super::super::store::open(root.path()).await.unwrap();
        for (id, profiles) in &expected {
            for geo in profiles
                .iter()
                .map(|p| &p.geography_id)
                .collect::<BTreeSet<_>>()
            {
                let got = super::super::public_store::read(&db, id, geo)
                    .await
                    .unwrap();
                let want: Vec<_> = profiles
                    .iter()
                    .filter(|p| &p.geography_id == geo)
                    .cloned()
                    .collect();
                assert_eq!(got.profiles, want);
            }
            assert_eq!(
                super::super::public_store::read(&db, id, "world")
                    .await
                    .unwrap()
                    .status,
                "unsupported_area"
            );
        }
        let heat = &expected["eurostat-heat-pumps"];
        assert!(
            heat.iter()
                .flat_map(|p| &p.points)
                .all(|p| p.period.as_str() >= "2004")
        );
        assert!(
            heat.iter()
                .flat_map(|p| &p.points)
                .any(|p| p.value.is_none())
        );
        assert!(
            heat.iter()
                .flat_map(|p| &p.points)
                .any(|p| p.value.is_none() && p.status.contains("Quellen-Null"))
        );
        let bio = &expected["eurostat-bioenergy"];
        assert!(
            bio.iter()
                .flat_map(|p| &p.points)
                .any(|p| p.status.contains("Vorläufig") && p.value.is_some())
        );
        assert!(
            bio.iter()
                .flat_map(|p| &p.points)
                .any(|p| p.status.contains("Quellenschätzung") && p.value.is_some())
        );
        let district = &expected["eurostat-district-heating"];
        assert!(
            district
                .iter()
                .all(|p| p.points.len() == 1 && p.points[0].period == "2023")
        );
        assert!(
            district
                .iter()
                .any(|p| p.provider_area == "DE" && p.points[0].value.as_deref() == Some("13.7"))
        );
        db.close().await;
    }
}
