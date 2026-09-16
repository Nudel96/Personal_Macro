//! Reviewed SBS releases: activity and indicator are jointly identified.
use super::public_models::*;
use crate::errors::CommandResult;
use serde::Deserialize;
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

const CONTRACTS: &str =
    include_str!("../../../src/features/world-atlas/data/public-sbs-contract.json");
const BREAK_NOTE: &str = "Redaktionelle Trennung 2008: Die Eurostat-Metadaten warnen vor dem Klassifikationswechsel; frühere Punkte bleiben sichtbar, ohne Verbindung über diese Grenze.";

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
    indicator_dimension: String,
    first_year: i32,
    last_year: i32,
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

fn status(flag: &str) -> CommandResult<&'static str> {
    Ok(match flag {
        "" => "",
        "p" => "Vorläufig laut Quelle (p)",
        "e" => "Quellenschätzung (e)",
        "b" => "Reihenbruch laut Quelle (b)",
        "d" => "Abweichende Definition laut Quelle (d)",
        "u" => "Geringe Verlässlichkeit laut Quelle (u)",
        "|C" => "Vertraulich laut Quelle (|C)",
        "bd" => "Reihenbruch und abweichende Definition laut Quelle (bd)",
        "de" => "Abweichende Definition und Quellenschätzung (de)",
        "be" => "Reihenbruch und Quellenschätzung (be)",
        _ => return Err(invalid()),
    })
}

pub fn parse(source: &PublicSource, bytes: &[u8]) -> CommandResult<(Vec<PublicProfile>, usize)> {
    let c = contract(&source.id)?;
    let obj: Value = serde_json::from_slice(bytes).map_err(|_| invalid())?;
    let extension = &obj["extension"];
    let flags: BTreeMap<String, String> =
        serde_json::from_value(extension["status"]["label"].clone()).map_err(|_| invalid())?;
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
    let statuses = obj["status"].as_object().ok_or_else(invalid)?;
    for key in values.keys().chain(statuses.keys()) {
        let pos = key.parse::<usize>().map_err(|_| invalid())?;
        if pos >= total || pos.to_string() != *key {
            return Err(invalid());
        }
    }
    let mut profiles: BTreeMap<(String, String), PublicProfile> = BTreeMap::new();
    for position in 0..total {
        let mut rem = position;
        let mut row = BTreeMap::new();
        for index in (0..c.ids.len()).rev() {
            row.insert(c.ids[index].as_str(), codes[index][rem % c.sizes[index]]);
            rem /= c.sizes[index];
        }
        let code = format!(
            "{}/{}",
            row.get("nace_r2").ok_or_else(invalid)?,
            row.get(c.indicator_dimension.as_str())
                .ok_or_else(invalid)?
        );
        let area_code = *row.get("geo").ok_or_else(invalid)?;
        let year = row
            .get("time")
            .ok_or_else(invalid)?
            .parse::<i32>()
            .map_err(|_| invalid())?;
        if !(c.first_year..=c.last_year).contains(&year) {
            return Err(invalid());
        }
        let key = position.to_string();
        let flag = statuses
            .get(&key)
            .map(|v| v.as_str().ok_or_else(invalid))
            .transpose()?
            .unwrap_or("");
        if !flag.is_empty() && !flags.contains_key(flag) {
            return Err(invalid());
        }
        let status = status(flag)?.to_owned();
        let value = values
            .get(&key)
            .filter(|v| !v.is_null())
            .map(|v| {
                let n = v.as_f64().ok_or_else(invalid)?;
                if !n.is_finite() || !(0.0..1e10).contains(&n) || n.fract() != 0.0 || flag == "|C" {
                    return Err(invalid());
                }
                Ok((n as u64).to_string())
            })
            .transpose()?;
        if c.excluded_areas.contains(area_code) {
            continue;
        }
        let Some(area) = areas.get(area_code) else {
            if value.is_some() || !flag.is_empty() {
                return Err(invalid());
            }
            continue;
        };
        let metric = metrics.get(code.as_str()).ok_or_else(invalid)?;
        let Some(title) = area.series_titles.get(&code) else {
            if value.is_some() || !flag.is_empty() {
                return Err(invalid());
            }
            continue;
        };
        let mut notes = Vec::new();
        if area_code == "EU27_2020" && flag.contains('d') {
            notes.push("EU-Aggregat: Laut historischer SBS-Methodik bezeichnet d gerundete Schätzungen auf Basis nicht vertraulicher Werte; Rundung kann Abweichungen zu Teilaggregaten verursachen.".into());
        }
        let boundary = source.id == "eurostat-professional-history" && year == 2008;
        if boundary {
            notes.push(BREAK_NOTE.into());
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
                period: year.to_string(),
                value,
                status,
                break_before: flag.contains('b') || boundary,
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
    fn sbs_contracts_keep_business_activity_and_periods_separate() {
        let current = contract("eurostat-business-services").unwrap();
        let history = contract("eurostat-professional-history").unwrap();
        assert_eq!((current.first_year, current.last_year), (2021, 2024));
        assert_eq!((history.first_year, history.last_year), (2005, 2020));
        assert_eq!(
            history.dimensions["nace_r2"]["category"]["index"],
            serde_json::json!({"M":0})
        );
        assert_eq!(current.metric_ids.len(), 4);
        assert_eq!(history.metric_ids.len(), 2);
        assert!(status("bd").unwrap().contains("Reihenbruch"));
        assert!(status("|C").unwrap().contains("Vertraulich"));
        assert!(status("unknown").is_err());
        assert!(url("arbitrary-url").is_err());
        for id in [&current.source_id, &history.source_id] {
            assert!(
                url(id)
                    .unwrap()
                    .starts_with("https://ec.europa.eu/eurostat/api/")
            );
            assert!(
                !source(id)
                    .unwrap()
                    .areas
                    .iter()
                    .any(|a| a.geography_id == "world")
            );
        }
    }

    #[tokio::test]
    #[ignore = "Full original Eurostat SBS files and independent Cartesian audit"]
    async fn public_sbs_originals_roundtrip() {
        let raw =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../.tmp/atlas-remaining-40");
        let expected: BTreeMap<String, Vec<PublicProfile>> =
            serde_json::from_slice(&std::fs::read(raw.join("sbs-expected-profiles.json")).unwrap())
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
                "activity",
                "year",
                "negative",
                "fractional",
                "flag",
                "position",
                "confidential_number",
            ] {
                let mut obj: Value = serde_json::from_slice(&bytes).unwrap();
                match mutation {
                    "unit" => {
                        obj["dimension"][&c.indicator_dimension]["category"]["label"] =
                            serde_json::json!({"EMP_NR":"Full-time equivalents"})
                    }
                    "activity" => {
                        obj["dimension"]["nace_r2"]["category"]["index"] =
                            serde_json::json!({"S96":0})
                    }
                    "year" => obj["dimension"]["time"]["category"]["index"]["2030"] = 0.into(),
                    "negative" | "fractional" => {
                        *obj["value"]
                            .as_object_mut()
                            .unwrap()
                            .values_mut()
                            .next()
                            .unwrap() = if mutation == "negative" {
                            (-1).into()
                        } else {
                            0.5.into()
                        }
                    }
                    "flag" => obj["status"]["0"] = "unreviewed".into(),
                    "position" => obj["value"]["999999"] = 0.into(),
                    "confidential_number" => {
                        let key = obj["status"]
                            .as_object()
                            .unwrap()
                            .iter()
                            .find(|(_, v)| *v == "|C")
                            .unwrap()
                            .0
                            .clone();
                        obj["value"][key] = 0.into();
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
            assert!(
                zero.iter()
                    .flat_map(|p| &p.points)
                    .filter_map(|p| p.value.as_deref())
                    .all(|v| v == "0")
            );
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
        let history = &expected["eurostat-professional-history"];
        assert!(
            history
                .iter()
                .flat_map(|p| &p.points)
                .filter(|p| p.period == "2008")
                .all(|p| p.break_before
                    && p.notes.iter().any(|n| n.contains("Redaktionelle Trennung")))
        );
        assert!(
            history
                .iter()
                .flat_map(|p| &p.points)
                .any(|p| p.status.contains("(bd)") && p.break_before)
        );
        assert!(
            expected
                .values()
                .flatten()
                .flat_map(|p| &p.points)
                .any(|p| p.status.contains("Vertraulich") && p.value.is_none())
        );
        assert!(
            expected["eurostat-business-services"]
                .iter()
                .all(|p| p.points.iter().all(|v| v.period.as_str() >= "2021"))
        );
        db.close().await;
    }
}
