//! TiVA model histories; preserve reported shares and exclude overlapping groups.
use super::public_models::*;
use crate::errors::CommandResult;
use rust_decimal::Decimal;
use rust_decimal::prelude::ToPrimitive;
use serde::Deserialize;
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
use std::str::FromStr;

const CONTRACTS: &str =
    include_str!("../../../src/features/world-atlas/data/public-tiva-contract.json");
const PATH: &str = "/sti-public/rest/v1/data/OECD.STI.PIE,DSD_TIVA_MAINSH@DF_MAINSH,1.1/";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Contract {
    source_id: String,
    #[cfg_attr(not(test), allow(dead_code))]
    file: String,
    url: String,
    flow: String,
    headers: Vec<String>,
    area_labels: BTreeMap<String, String>,
    excluded_areas: BTreeMap<String, String>,
    measures: BTreeSet<String>,
    partners: BTreeSet<String>,
    trade_partners: bool,
    areas: Value,
    metric_ids: BTreeSet<String>,
    expected_rows: usize,
    expected_profiles: usize,
    expected_self_rows: usize,
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
    let key = if c.trade_partners {
        "EXGR_PSH.._T..PT_EXGR.A"
    } else {
        "EXGR_FVA+EXGR_DVA.._T.W.PT_EXGR.A"
    };
    if parsed.scheme() != "https"
        || parsed.host_str() != Some("sdmx.oecd.org")
        || parsed.path() != format!("{PATH}{key}")
        || parsed.query() != Some("startPeriod=1995&endPeriod=2022&format=csvfile")
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.port().is_some()
        || parsed.fragment().is_some()
    {
        return Err(invalid());
    }
    Ok(c.url)
}

fn thousandths(raw: &str) -> CommandResult<i64> {
    if raw.is_empty() || raw.len() > 12 || raw.trim() != raw {
        return Err(invalid());
    }
    let n = Decimal::from_str(raw).map_err(|_| invalid())?;
    if n.scale() > 3 || n < Decimal::ZERO || n > Decimal::from(100) {
        return Err(invalid());
    }
    (n * Decimal::from(1000)).to_i64().ok_or_else(invalid)
}

pub fn parse(source: &PublicSource, bytes: &[u8]) -> CommandResult<(Vec<PublicProfile>, usize)> {
    let c = contract(&source.id)?;
    if source.url != c.url
        || source.expected_rows != c.expected_rows
        || source.published_at != "2026-01"
        || source.first_period != "1995"
        || source.last_period != "2022"
        || source.observation_kind != "modeled_estimate"
        || serde_json::to_value(&source.areas).map_err(|_| invalid())? != c.areas
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
    if metrics
        .values()
        .map(|m| m.id.clone())
        .collect::<BTreeSet<_>>()
        != c.metric_ids
        || metrics.values().any(|m| {
            m.kind != "modeled_estimate"
                || m.frequency != "annual"
                || m.unit != "Anteil an Bruttoexporten (%)"
        })
    {
        return Err(invalid());
    }
    let areas: BTreeMap<_, _> = source.areas.iter().map(|a| (a.code.as_str(), a)).collect();
    if areas.len() != 80 || c.area_labels.len() != 98 || c.excluded_areas.len() != 18 {
        return Err(invalid());
    }
    let mut reader = csv::Reader::from_reader(bytes);
    if reader
        .headers()
        .map_err(|_| invalid())?
        .iter()
        .ne(c.headers.iter().map(String::as_str))
    {
        return Err(invalid());
    }
    let mut seen = BTreeSet::new();
    let mut profiles: BTreeMap<(String, String), PublicProfile> = BTreeMap::new();
    let mut sums: BTreeMap<(String, i32), (i64, usize)> = BTreeMap::new();
    let (mut rows, mut self_rows) = (0, 0);
    for record in reader.records() {
        let r = record.map_err(|_| invalid())?;
        rows += 1;
        if r.len() != c.headers.len()
            || rows > c.expected_rows
            || r[0] != c.flow
            || !c.measures.contains(&r[1])
            || &r[3] != "_T"
            || &r[5] != "PT_EXGR"
            || &r[6] != "A"
            || &r[9] != "0"
            || !c.area_labels.contains_key(&r[2])
            || (c.trade_partners && &r[4] != "W" && !c.area_labels.contains_key(&r[4]))
            || (!c.trade_partners && &r[4] != "W")
        {
            return Err(invalid());
        }
        let year = r[7].parse::<i32>().map_err(|_| invalid())?;
        if !(1995..=2022).contains(&year)
            || year.to_string() != r[7]
            || !seen.insert((r[1].to_owned(), r[2].to_owned(), r[4].to_owned(), year))
        {
            return Err(invalid());
        }
        let value = thousandths(&r[8])?;
        if c.excluded_areas.contains_key(&r[2]) {
            continue;
        }
        let area = areas.get(&r[2]).ok_or_else(invalid)?;
        if area.label != c.area_labels[&r[2]] {
            return Err(invalid());
        }
        if c.trade_partners {
            if &r[4] == "W" && value != 100_000 {
                return Err(invalid());
            }
            if !c.partners.contains(&r[4]) {
                continue;
            }
        }
        let sum = sums.entry((r[2].to_owned(), year)).or_default();
        sum.0 += value;
        sum.1 += 1;
        if c.trade_partners && r[2] == r[4] {
            if value != 0 {
                return Err(invalid());
            }
            self_rows += 1;
            continue;
        }
        let code = if c.trade_partners { &r[4] } else { &r[1] };
        let metric = metrics.get(code).ok_or_else(invalid)?;
        let title = area.series_titles.get(code).ok_or_else(invalid)?;
        let mut notes = Vec::new();
        if &r[2] == "ISR" {
            notes.push("Israel: Quellenangaben stammen von israelischen Behörden oder Dritten; die OECD leitet daraus keine Aussage zum Status strittiger Gebiete ab.".into());
        }
        if &r[2] == "CYP" {
            notes.push("Zypern: Daten für das Gebiet unter effektiver Kontrolle der Regierung der Republik Zypern.".into());
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
                value: Some(r[8].to_owned()),
                status: "OECD-Modellschätzung".into(),
                break_before: false,
                notes,
                lower_bound: None,
                upper_bound: None,
            });
    }
    let expected_sum_count = if c.trade_partners { 81 } else { 2 };
    let tolerance = if c.trade_partners { 41 } else { 1 };
    if rows != c.expected_rows
        || self_rows != c.expected_self_rows
        || profiles.len() != c.expected_profiles
        || sums.len() != 80 * 28
        || sums.values().any(|(total, count)| {
            *count != expected_sum_count || (total - 100_000).abs() > tolerance
        })
    {
        return Err(invalid());
    }
    for profile in profiles.values_mut() {
        profile.points.sort_by(|a, b| a.period.cmp(&b.period));
        if profile
            .points
            .iter()
            .map(|v| v.period.as_str())
            .ne((1995..=2022)
                .map(|y| y.to_string())
                .collect::<Vec<_>>()
                .iter()
                .map(String::as_str))
        {
            return Err(invalid());
        }
    }
    Ok((profiles.into_values().collect(), rows))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn tiva_shares_bind_denominators_and_exact_source_rounding() {
        assert_eq!(thousandths("0").unwrap(), 0);
        assert_eq!(thousandths("25.875").unwrap(), 25875);
        assert_eq!(thousandths("100").unwrap(), 100000);
        for bad in ["", "-1", "100.001", "NaN", "0.0001", " 1"] {
            assert!(thousandths(bad).is_err());
        }
        for id in ["oecd-tiva-supply", "oecd-tiva-partners"] {
            assert!(url(id).unwrap().contains("PT_EXGR.A"));
            let s = source(id).unwrap();
            assert_eq!(s.areas.len(), 80);
            assert!(!s.areas.iter().any(|a| a.geography_id == "world"));
            if id.ends_with("partners") {
                assert!(
                    s.areas
                        .iter()
                        .all(|a| !a.series_titles.contains_key(&a.code))
                );
                assert!(s.areas.iter().all(|a| a.series_titles.contains_key("WXD")));
            }
        }
        assert!(url("arbitrary-url").is_err());
    }

    #[tokio::test]
    #[ignore = "Full original TiVA matrices and independent Decimal audit"]
    async fn public_tiva_originals_roundtrip() {
        let raw =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../.tmp/atlas-remaining-40");
        let expected: BTreeMap<String, Vec<PublicProfile>> = serde_json::from_slice(
            &std::fs::read(raw.join("tiva-expected-profiles.json")).unwrap(),
        )
        .unwrap();
        let root = tempfile::tempdir().unwrap();
        let db = super::super::store::open(root.path()).await.unwrap();
        for c in serde_json::from_str::<Vec<Contract>>(CONTRACTS).unwrap() {
            let bytes = std::fs::read(raw.join(&c.file)).unwrap();
            let source = source(&c.source_id).unwrap();
            let data = super::super::public_source::parse_download(&source, &bytes).unwrap();
            assert_eq!(data.profiles, expected[&source.id]);
            super::super::public_store::replace(&db, data)
                .await
                .unwrap();
            let mut wrong = source.clone();
            wrong.areas[0].geography_id = "world".into();
            assert!(parse(&wrong, &bytes).is_err());
            let mut reader = csv::Reader::from_reader(bytes.as_slice());
            let headers = reader.headers().unwrap().clone();
            let rows = reader.records().collect::<Result<Vec<_>, _>>().unwrap();
            for (column, bad) in [
                (0, "Wrong flow"),
                (2, "XXX"),
                (3, "C"),
                (4, "XXX"),
                (5, "PT_VA"),
                (6, "Q"),
                (7, "2023"),
                (8, "-1"),
                (9, "3"),
            ] {
                let mut writer = csv::Writer::from_writer(Vec::new());
                writer.write_record(&headers).unwrap();
                for (i, row) in rows.iter().enumerate() {
                    let changed = row
                        .iter()
                        .enumerate()
                        .map(|(j, v)| if i == 0 && j == column { bad } else { v });
                    writer.write_record(changed).unwrap();
                }
                let changed = writer.into_inner().unwrap();
                assert!(parse(&source, &changed).is_err(), "{column}:{bad}");
            }
            let mut duplicate = bytes.clone();
            let mut writer = csv::Writer::from_writer(Vec::new());
            writer.write_record(&rows[0]).unwrap();
            duplicate.extend(writer.into_inner().unwrap());
            assert!(parse(&source, &duplicate).is_err());
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
        let german = expected["oecd-tiva-supply"]
            .iter()
            .find(|p| p.provider_area == "DEU" && p.metric_id.ends_with(":EXGR_FVA"))
            .unwrap();
        assert_eq!(
            german.points.last().unwrap().value.as_deref(),
            Some("25.875")
        );
        let china = expected["oecd-tiva-partners"]
            .iter()
            .find(|p| p.provider_area == "DEU" && p.metric_id.ends_with(":CHN"))
            .unwrap();
        assert_eq!(china.points.last().unwrap().value.as_deref(), Some("7.862"));
        db.close().await;
    }
}
