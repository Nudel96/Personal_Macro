//! IEA's historical CSV: retain explicit countries/regions, units and rounded original totals.
use super::public_models::*;
use crate::errors::CommandResult;
use serde::Deserialize;
use std::collections::{BTreeMap, BTreeSet};

const CONTRACT: &str =
    include_str!("../../../src/features/world-atlas/data/public-iea-contract.json");
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Contract {
    url: String,
    headers: Vec<String>,
    selections: Vec<Selection>,
    area_mappings: BTreeMap<String, String>,
    allowed_combinations: Vec<[String; 4]>,
}
#[derive(Deserialize)]
struct Selection {
    id: String,
    parameter: String,
    mode: String,
    powertrain: String,
    unit: String,
}
fn contract() -> CommandResult<Contract> {
    serde_json::from_str(CONTRACT).map_err(|_| invalid())
}
/// This URL comes from the reviewed, bundled contract, never from user input.
pub fn url() -> CommandResult<String> {
    let url = contract()?.url;
    let parsed = reqwest::Url::parse(&url).map_err(|_| invalid())?;
    if parsed.scheme() != "https"
        || parsed.host_str() != Some("api.iea.org")
        || parsed.path() != "/evs/"
        || parsed.port().is_some()
        || !parsed.username().is_empty()
        || parsed.password().is_some()
    {
        return Err(invalid());
    }
    Ok(url)
}

pub fn parse(source: &PublicSource, bytes: &[u8]) -> CommandResult<(Vec<PublicProfile>, usize)> {
    let contract = contract()?;
    let cfg = config()?;
    let mut reader = csv::ReaderBuilder::new().flexible(false).from_reader(bytes);
    if reader
        .headers()
        .map_err(|_| invalid())?
        .iter()
        .ne(contract.headers.iter().map(String::as_str))
    {
        return Err(invalid());
    }
    let mut profiles: BTreeMap<(String, String), PublicProfile> = BTreeMap::new();
    let mut seen = BTreeSet::new();
    let mut count = 0;
    for row in reader.records() {
        let row = row.map_err(|_| invalid())?;
        count += 1;
        let get = |i| row.get(i).ok_or_else(invalid);
        let name = get(0)?;
        let category = get(1)?;
        let parameter = get(2)?;
        let mode = get(3)?;
        let powertrain = get(4)?;
        let period = get(5)?;
        let unit = get(6)?;
        let raw = get(7)?;
        let geography_id = contract.area_mappings.get(name).ok_or_else(invalid)?;
        if category != "Historical"
            || !super::public_source::valid_period(period, "annual")
            || !("2010"..="2025").contains(&period)
            || !contract.allowed_combinations.iter().any(|c| {
                c.iter()
                    .map(String::as_str)
                    .eq([parameter, mode, powertrain, unit])
            })
            || !seen.insert((
                name.to_owned(),
                parameter.to_owned(),
                mode.to_owned(),
                powertrain.to_owned(),
                period.to_owned(),
            ))
        {
            return Err(invalid());
        }
        let value = super::public_source::decimal(raw)?.ok_or_else(invalid)?;
        let number: f64 = value.parse().map_err(|_| invalid())?;
        if number < 0.0 || (unit == "percent" && mode == "Cars" && number > 100.0) {
            return Err(invalid());
        }
        let Some(selection) = contract
            .selections
            .iter()
            .find(|s| s.parameter == parameter && s.mode == mode && s.powertrain == powertrain)
        else {
            if matches!(mode, "Cars" | "EVSE") {
                return Err(invalid());
            }
            continue;
        };
        let area = source
            .areas
            .iter()
            .find(|a| a.code == name && a.label == name && a.geography_id == *geography_id)
            .ok_or_else(invalid)?;
        let metric = cfg
            .metrics
            .iter()
            .find(|m| m.id == selection.id && m.source_id == source.id)
            .ok_or_else(invalid)?;
        if unit != selection.unit
            || metric.frequency != "annual"
            || metric.provider_code != format!("{parameter}|{mode}|{powertrain}")
        {
            return Err(invalid());
        }
        let title = area
            .series_titles
            .get(&metric.provider_code)
            .ok_or_else(invalid)?;
        let expected_title = format!(
            "Global EV Outlook 2026 | {name} | {} | Historical",
            metric.provider_code
        );
        if title != &expected_title {
            return Err(invalid());
        }
        let profile = profiles
            .entry((geography_id.clone(), metric.id.clone()))
            .or_insert_with(|| PublicProfile {
                metric_id: metric.id.clone(),
                geography_id: geography_id.clone(),
                provider_area: name.into(),
                provider_label: name.into(),
                provider_title: title.clone(),
                unit: metric.unit.clone(),
                points: vec![],
            });
        profile.points.push(PublicPoint {
            period: period.into(),
            value: Some(value),
            status: "Historical".into(),
            break_before: false,
            notes: if unit != "percent" && number.fract() != 0.0 {
                vec!["Die Quelle veröffentlicht eine geschätzte, nicht ganzzahlige Anzahl.".into()]
            } else {
                vec![]
            },
            lower_bound: None,
            upper_bound: None,
        });
    }
    for profile in profiles.values_mut() {
        profile.points.sort_by(|a, b| a.period.cmp(&b.period));
    }
    Ok((profiles.into_values().collect(), count))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    #[ignore = "Explicit full original IEA historical CSV and temporary SQLite verification"]
    async fn public_iea_reviewed_release_roundtrip() {
        let bytes = std::fs::read(
            std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("../.tmp/atlas-remaining-40/iea-ev-historical.csv"),
        )
        .unwrap();
        let source = source("iea-ev").unwrap();
        assert_eq!(url().unwrap(), source.url);
        let download = super::super::public_source::parse_download(&source, &bytes).unwrap();
        assert_eq!(download.provenance.source_rows, 21758);
        assert_eq!(download.provenance.numeric_values, 8649);
        assert_eq!(download.provenance.area_count, 71);
        let get = |metric: &str| {
            download
                .profiles
                .iter()
                .find(|p| p.geography_id == "world" && p.metric_id == metric)
                .unwrap()
                .points
                .iter()
                .find(|p| p.period == "2025")
                .unwrap()
                .value
                .as_deref()
                .unwrap()
        };
        assert_eq!(get("iea-ev:car_stock"), "75000000");
        assert_eq!(get("iea-ev:bev_stock"), "51000000");
        assert_eq!(get("iea-ev:phev_stock"), "25000000");
        assert_eq!(get("iea-ev:car_sales_share"), "25");
        assert_eq!(get("iea-ev:charging_fast"), "1700000");
        assert_eq!(get("iea-ev:charging_ultra"), "970000");
        assert!(
            download
                .profiles
                .iter()
                .flat_map(|p| &p.points)
                .all(|p| p.period.as_str() <= "2025")
        );
        assert!(
            download
                .profiles
                .iter()
                .any(|p| p.geography_id == "iea:africa")
        );
        assert!(
            download
                .profiles
                .iter()
                .all(|p| p.geography_id != "region:Africa")
        );
        let expected = download.profiles.clone();
        let root = tempfile::tempdir().unwrap();
        let db = super::super::store::open(root.path()).await.unwrap();
        super::super::public_store::replace(&db, download)
            .await
            .unwrap();
        db.close().await;
        let reopened = super::super::store::open(root.path()).await.unwrap();
        for area in ["world", "m49:356", "iea:africa"] {
            let read = super::super::public_store::read(&reopened, &source.id, area)
                .await
                .unwrap();
            for p in expected.iter().filter(|p| p.geography_id == area) {
                assert_eq!(
                    read.profiles
                        .iter()
                        .find(|r| r.metric_id == p.metric_id)
                        .unwrap(),
                    p
                );
            }
        }
        let csv = String::from_utf8(bytes).unwrap();
        for (from, to) in [
            ("Historical", "Projection-STEPS"),
            (",2010,", ",2035,"),
            ("Vehicles", "charging points"),
        ] {
            assert!(parse(&source, csv.replacen(from, to, 1).as_bytes()).is_err());
        }
        let mut wrong = source.clone();
        wrong
            .areas
            .iter_mut()
            .find(|a| a.code == "Africa")
            .unwrap()
            .geography_id = "world".into();
        assert!(parse(&wrong, csv.as_bytes()).is_err());
    }
}
