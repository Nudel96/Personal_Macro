//! Explicitly reviewed Eurostat JSON-stat releases, including their sparse cells.
use super::public_models::*;
use crate::errors::CommandResult;
use serde::Deserialize;
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

const CONTRACTS: &str =
    include_str!("../../../src/features/world-atlas/data/public-eurostat-contract.json");

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
    reference_year_offset: i32,
    rental_index: bool,
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
        || (c.rental_index
            && !extension["description"]
                .as_str()
                .is_some_and(|s| s.contains("2025=100")))
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
    let metric_dim = if c.rental_index {
        "coicop18"
    } else {
        "indic_is"
    };
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
        if !(1996..=2025).contains(&year) {
            return Err(invalid());
        }
        let key = position.to_string();
        let flag = statuses
            .get(&key)
            .map(|v| v.as_str().ok_or_else(invalid))
            .transpose()?
            .unwrap_or("");
        let value = values
            .get(&key)
            .filter(|v| !v.is_null())
            .map(|v| {
                let n = v.as_f64().ok_or_else(invalid)?;
                if !n.is_finite()
                    || n < 0.0
                    || n > if c.rental_index { 1_000_000.0 } else { 100.0 }
                    || (c.rental_index && year == 2025 && (n - 100.0).abs() >= 0.001)
                {
                    return Err(invalid());
                }
                Ok(v.to_string())
            })
            .transpose()?;
        if (!flag.is_empty() && !flags.contains_key(flag)) || (flag == "|C" && value.is_some()) {
            return Err(invalid());
        }
        if c.excluded_areas.contains(area_code) {
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
        let period = (year + c.reference_year_offset).to_string();
        let mut notes = Vec::new();
        if c.reference_year_offset == -1 {
            notes.push(format!(
                "Verkaufsjahr {period}; veröffentlicht unter Erhebungsjahr {year}."
            ));
        } else if !c.rental_index {
            notes.push(format!("Erhebungsjahr {year}."));
        }
        if !c.rental_index && year >= 2021 {
            notes.push("Erhebungsrahmen seit 2021 einschließlich Tierarztpraxen (M75).".into());
        }
        if code == "E_AI_TANY" && year == 2025 {
            notes.push(
                "Technologieliste 2025 einschließlich Erzeugung von Bildern, Videos und Audio."
                    .into(),
            );
        }
        let status = match flag {
            "" => "",
            "b" => "Reihenbruch laut Quelle (b)",
            "u" => "Geringe Zuverlässigkeit laut Quelle (u)",
            "|C" => "Vertraulicher Quellenwert (C)",
            _ => return Err(invalid()),
        };
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
                status: status.into(),
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

    #[tokio::test]
    #[ignore = "Explicit original Eurostat releases and independent lattice audit"]
    async fn public_eurostat_reviewed_originals_roundtrip() {
        let raw =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../.tmp/atlas-remaining-40");
        let expected: BTreeMap<String, Vec<PublicProfile>> = serde_json::from_slice(
            &std::fs::read(raw.join("eurostat-expected-profiles.json")).unwrap(),
        )
        .unwrap();
        let root = tempfile::tempdir().unwrap();
        let db = super::super::store::open(root.path()).await.unwrap();
        let contracts: Vec<Contract> = serde_json::from_str(CONTRACTS).unwrap();
        for c in &contracts {
            let bytes = std::fs::read(raw.join(format!("eurostat-{}.json", c.dataset))).unwrap();
            let source = source(&c.source_id).unwrap();
            let data = super::super::public_source::parse_download(&source, &bytes).unwrap();
            assert_eq!(data.profiles, expected[&source.id], "{}", source.id);
            super::super::public_store::replace(&db, data)
                .await
                .unwrap();
            let mut wrong = source.clone();
            wrong.areas[0].geography_id = "m49:356".into();
            assert!(parse(&wrong, &bytes).is_err());
            let mut obj: Value = serde_json::from_slice(&bytes).unwrap();
            obj["dimension"]["unit"]["category"]["label"] =
                serde_json::json!({"PC_ENT":"Wrong denominator"});
            assert!(parse(&source, &serde_json::to_vec(&obj).unwrap()).is_err());
            let mut obj: Value = serde_json::from_slice(&bytes).unwrap();
            obj["value"]["999999"] = 0.into();
            assert!(parse(&source, &serde_json::to_vec(&obj).unwrap()).is_err());
            let mut obj: Value = serde_json::from_slice(&bytes).unwrap();
            obj["dimension"]["time"]["category"]["index"]["2035"] = 99.into();
            assert!(parse(&source, &serde_json::to_vec(&obj).unwrap()).is_err());
            if !c.rental_index {
                let mut obj: Value = serde_json::from_slice(&bytes).unwrap();
                for value in obj["value"].as_object_mut().unwrap().values_mut() {
                    *value = 0.into();
                }
                let (zero, _) = parse(&source, &serde_json::to_vec(&obj).unwrap()).unwrap();
                assert!(
                    zero.iter()
                        .flat_map(|p| &p.points)
                        .filter_map(|p| p.value.as_deref())
                        .all(|v| v == "0")
                );
                *obj["value"]
                    .as_object_mut()
                    .unwrap()
                    .values_mut()
                    .next()
                    .unwrap() = 101.into();
                assert!(parse(&source, &serde_json::to_vec(&obj).unwrap()).is_err());
            }
        }
        db.close().await;
        let db = super::super::store::open(root.path()).await.unwrap();
        for (id, profiles) in &expected {
            for country in profiles
                .iter()
                .map(|p| &p.geography_id)
                .collect::<BTreeSet<_>>()
            {
                let got = super::super::public_store::read(&db, id, country)
                    .await
                    .unwrap();
                let want: Vec<_> = profiles
                    .iter()
                    .filter(|p| &p.geography_id == country)
                    .cloned()
                    .collect();
                assert_eq!(got.profiles, want);
            }
            let india = super::super::public_store::read(&db, id, "m49:356")
                .await
                .unwrap();
            assert_eq!(india.status, "unsupported_area");
            assert!(india.profiles.is_empty());
        }
        let market = expected["eurostat-ecommerce"]
            .iter()
            .find(|p| p.provider_area == "DE" && p.metric_id.ends_with(":E_AWS_CMP"))
            .unwrap();
        assert_eq!(market.points.last().unwrap().period, "2024");
        assert!(market.points.last().unwrap().notes[0].contains("Erhebungsjahr 2025"));
        let all: Vec<_> = expected
            .values()
            .flatten()
            .flat_map(|p| &p.points)
            .collect();
        assert!(all.iter().any(|p| p.break_before && p.value.is_some()));
        assert!(
            all.iter()
                .any(|p| p.status.contains("Vertraulich") && p.value.is_none())
        );
        db.close().await;
    }
}
