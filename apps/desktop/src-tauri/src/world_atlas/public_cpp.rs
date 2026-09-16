//! BIS national/city commercial prices, retaining each original definition and period.
use super::public_models::*;
use crate::errors::CommandResult;
use rust_decimal::Decimal;
use serde::Deserialize;
use serde_json::Value;
use std::{
    collections::{BTreeMap, BTreeSet},
    io::{Cursor, Read},
    str::FromStr,
};

pub const URL: &str = "https://data.bis.org/static/bulk/WS_CPP_csv_flat.zip";
const ID: &str = "bis-commercial-property";
const CONTRACT: &str =
    include_str!("../../../src/features/world-atlas/data/public-cpp-contract.json");
const MAX_CSV: u64 = 4 * 1_048_576;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Contract {
    source_id: String,
    member: String,
    uncompressed_bytes: u64,
    headers: Vec<String>,
    metadata: Vec<Metadata>,
    series: Vec<Series>,
    excluded: Vec<Excluded>,
    areas: Value,
}
#[derive(Deserialize)]
struct Metadata {
    dimensions: Vec<String>,
    row: Vec<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Series {
    key: String,
    dimensions: Vec<String>,
    geography_id: String,
    unit: String,
    metric: PublicMetric,
    rows: usize,
    numeric: usize,
    first: String,
    last: String,
    breaks: BTreeMap<String, String>,
}
#[derive(Deserialize)]
struct Excluded {
    key: String,
    rows: usize,
}

fn value(raw: &str, status: &str) -> CommandResult<Option<String>> {
    if status == "M: Missing value; data cannot exist" {
        return if raw == "NaN" {
            Ok(None)
        } else {
            Err(invalid())
        };
    }
    if !matches!(status, "A: Normal value" | "P: Provisional value")
        || raw.is_empty()
        || raw.trim() != raw
        || raw.len() > 40
        || !raw
            .bytes()
            .all(|b| b.is_ascii_digit() || b".Ee+-".contains(&b))
    {
        return Err(invalid());
    }
    let n = Decimal::from_str(raw)
        .or_else(|_| Decimal::from_scientific(raw))
        .map_err(|_| invalid())?;
    if n < Decimal::ZERO {
        return Err(invalid());
    }
    Ok(Some(raw.into()))
}

fn decode_csv(
    source: &PublicSource,
    c: &Contract,
    bytes: &[u8],
) -> CommandResult<(Vec<PublicProfile>, usize)> {
    let mut reader = csv::Reader::from_reader(bytes);
    if reader
        .headers()
        .map_err(|_| invalid())?
        .iter()
        .collect::<Vec<_>>()
        != c.headers
    {
        return Err(invalid());
    }
    let metadata: BTreeMap<_, _> = c
        .metadata
        .iter()
        .map(|m| (m.dimensions.join("|"), m))
        .collect();
    let series: BTreeMap<_, _> = c.series.iter().map(|s| (s.key.as_str(), s)).collect();
    let areas: BTreeMap<_, _> = source.areas.iter().map(|a| (a.code.as_str(), a)).collect();
    let mut meta_seen = BTreeSet::new();
    let mut point_seen = BTreeSet::new();
    let mut excluded: BTreeMap<_, usize> = BTreeMap::new();
    let mut profiles: BTreeMap<String, PublicProfile> = BTreeMap::new();
    let mut rows = 0;
    for r in reader.records() {
        let r = r.map_err(|_| invalid())?;
        rows += 1;
        if r.len() != 33
            || &r[0] != "dataflow"
            || &r[1] != "BIS:WS_CPP(1.0): Commercial property prices"
            || &r[2] != "I"
        {
            return Err(invalid());
        }
        let dimensions: Vec<_> = r.iter().skip(3).take(8).collect();
        let meta_key = dimensions[1..].join("|");
        let meta = metadata.get(&meta_key).ok_or_else(invalid)?;
        if r[11].is_empty() {
            if !r[3].is_empty()
                || !meta_seen.insert(meta_key)
                || r.iter().collect::<Vec<_>>() != meta.row
            {
                return Err(invalid());
            }
            continue;
        }
        let key = dimensions
            .iter()
            .map(|d| d.split(':').next().unwrap_or(""))
            .collect::<Vec<_>>()
            .join(".");
        let frequency = match dimensions[0] {
            "A: Annual" => "annual",
            "Q: Quarterly" => "quarterly",
            "M: Monthly" => "monthly",
            "H: Half-yearly" => "half_yearly",
            _ => return Err(invalid()),
        };
        if !super::public_source::valid_period(&r[11], frequency)
            || !point_seen.insert((key.clone(), r[11].to_owned()))
            || r.iter().skip(15).take(15).any(|s| !s.is_empty())
            || &r[30] != "F: Free"
            || !r[31].is_empty()
        {
            return Err(invalid());
        }
        let v = value(&r[12], &r[32])?;
        let Some(spec) = series.get(key.as_str()) else {
            if !c.excluded.iter().any(|e| e.key == key) {
                return Err(invalid());
            }
            *excluded.entry(key).or_default() += 1;
            continue;
        };
        if dimensions != spec.dimensions || frequency != spec.metric.frequency {
            return Err(invalid());
        }
        let area_code = dimensions[1].split(':').next().ok_or_else(invalid)?;
        let area = areas.get(area_code).ok_or_else(invalid)?;
        if area.geography_id != spec.geography_id
            || area.series_titles.get(&key) != Some(&meta.row[25])
            || dimensions[1] != format!("{}: {}", area.code, area.label)
        {
            return Err(invalid());
        }
        let profile = profiles
            .entry(spec.metric.id.clone())
            .or_insert_with(|| PublicProfile {
                metric_id: spec.metric.id.clone(),
                geography_id: area.geography_id.clone(),
                provider_area: area.code.clone(),
                provider_label: area.label.clone(),
                provider_title: meta.row[25].clone(),
                unit: spec.unit.clone(),
                points: vec![],
            });
        let note = spec.breaks.get(&r[11]);
        profile.points.push(PublicPoint {
            period: r[11].into(),
            value: v,
            status: match &r[32] {
                "A: Normal value" => "Veröffentlichter Quellenwert (A)",
                "P: Provisional value" => "Vorläufiger Quellenwert (P)",
                _ => "Keine Beobachtung laut Quelle (M)",
            }
            .into(),
            break_before: note.is_some(),
            notes: note.cloned().into_iter().collect(),
            lower_bound: None,
            upper_bound: None,
        });
    }
    if rows != source.expected_rows
        || meta_seen.len() != c.metadata.len()
        || profiles.len() != c.series.len()
        || c.excluded
            .iter()
            .any(|e| excluded.get(&e.key) != Some(&e.rows))
    {
        return Err(invalid());
    }
    for spec in &c.series {
        let profile = profiles.get_mut(&spec.metric.id).ok_or_else(invalid)?;
        profile.points.sort_by(|a, b| a.period.cmp(&b.period));
        if profile.points.len() != spec.rows
            || profile.points.iter().filter(|p| p.value.is_some()).count() != spec.numeric
            || profile.points.first().map(|p| p.period.as_str()) != Some(&spec.first)
            || profile.points.last().map(|p| p.period.as_str()) != Some(&spec.last)
            || spec.breaks.keys().any(|period| {
                !profile
                    .points
                    .iter()
                    .any(|p| &p.period == period && p.break_before)
            })
        {
            return Err(invalid());
        }
    }
    Ok((profiles.into_values().collect(), rows))
}

pub fn parse(source: &PublicSource, bytes: &[u8]) -> CommandResult<(Vec<PublicProfile>, usize)> {
    let c: Contract = serde_json::from_str(CONTRACT).map_err(|_| invalid())?;
    if c.source_id != ID
        || c.series.len() != 65
        || c.metadata.len() != 68
        || c.excluded.len() != 3
        || source.id != ID
        || source.url != URL
        || source.adapter != "bis_cpp"
        || source.published_at != "2026-08-27"
        || source.observation_kind != "source_estimates"
        || serde_json::to_value(&source.areas).map_err(|_| invalid())? != c.areas
        || c.member != "WS_CPP_csv_flat.csv"
        || c.uncompressed_bytes > MAX_CSV
    {
        return Err(invalid());
    }
    let metrics: Vec<_> = config()?
        .metrics
        .into_iter()
        .filter(|m| m.source_id == ID)
        .collect();
    if metrics.len() != c.series.len() {
        return Err(invalid());
    }
    for spec in &c.series {
        let metric = metrics
            .iter()
            .find(|m| m.provider_code == spec.key)
            .ok_or_else(invalid)?;
        if serde_json::to_value(metric).map_err(|_| invalid())?
            != serde_json::to_value(&spec.metric).map_err(|_| invalid())?
            || metric.unit != spec.unit
            || metric.id != format!("{ID}:{}", spec.key)
            || metric.kind != "commercial_price"
            || metric.comparison != "within_country"
        {
            return Err(invalid());
        }
    }
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|_| invalid())?;
    if archive.len() != 1 {
        return Err(invalid());
    }
    let member = archive.by_index(0).map_err(|_| invalid())?;
    if member.name() != c.member || member.is_dir() || member.size() != c.uncompressed_bytes {
        return Err(invalid());
    }
    let mut csv = Vec::new();
    member
        .take(MAX_CSV + 1)
        .read_to_end(&mut csv)
        .map_err(|_| invalid())?;
    if csv.len() as u64 != c.uncompressed_bytes {
        return Err(invalid());
    }
    decode_csv(source, &c, &csv)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn cpp_values_and_missing_contract() {
        assert_eq!(value("0", "A: Normal value").unwrap().as_deref(), Some("0"));
        assert_eq!(
            value("142.1", "P: Provisional value").unwrap().as_deref(),
            Some("142.1")
        );
        assert_eq!(
            value("NaN", "M: Missing value; data cannot exist").unwrap(),
            None
        );
        for (raw, flag) in [
            ("NaN", "A: Normal value"),
            ("0", "M: Missing value; data cannot exist"),
            ("-1", "A: Normal value"),
            ("1", "X"),
            (" 1", "A: Normal value"),
        ] {
            assert!(value(raw, flag).is_err());
        }
        assert!(super::super::public_source::valid_period(
            "2025-S2",
            "half_yearly"
        ));
        assert!(!super::super::public_source::valid_period(
            "2025-S3",
            "half_yearly"
        ));
        assert!(!super::super::public_source::valid_period(
            "2025-Q2",
            "half_yearly"
        ));
        let end = super::super::public_source::period_span("2026-06")
            .unwrap()
            .1;
        for period in ["2026-Q2", "2026-S1", "2026-06", "2026-06-30"] {
            assert!(super::super::public_source::period_span(period).unwrap().1 <= end);
        }
        for period in ["2026-Q3", "2026-S2", "2026-07", "2026-07-01"] {
            assert!(super::super::public_source::period_span(period).unwrap().1 > end);
        }
    }
    #[tokio::test]
    #[ignore = "Original BIS ZIP, independent Decimal audit and temporary SQLite reopen"]
    async fn public_cpp_original_roundtrip() {
        let raw =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../.tmp/atlas-remaining-40");
        let bytes = std::fs::read(raw.join("WS_CPP.zip")).unwrap();
        let expected: Vec<PublicProfile> =
            serde_json::from_slice(&std::fs::read(raw.join("cpp-expected-profiles.json")).unwrap())
                .unwrap();
        let s = source(ID).unwrap();
        validate_geographies(&s).expect("CPP geography contract");
        let diagnostic: Contract = serde_json::from_str(CONTRACT).unwrap();
        let mut original = zip::ZipArchive::new(Cursor::new(&bytes)).unwrap();
        let mut original_csv = Vec::new();
        original
            .by_index(0)
            .unwrap()
            .read_to_end(&mut original_csv)
            .unwrap();
        decode_csv(&s, &diagnostic, &original_csv).expect("CPP CSV semantics");
        parse(&s, &bytes).expect("CPP catalog and ZIP semantics");
        let data = super::super::public_source::parse_download(&s, &bytes).unwrap();
        assert_eq!(data.profiles, expected);
        assert_eq!(data.provenance.numeric_values, 5586);
        let root = tempfile::tempdir().unwrap();
        let db = super::super::store::open(root.path()).await.unwrap();
        super::super::public_store::replace(&db, data)
            .await
            .unwrap();
        db.close().await;
        let db = super::super::store::open(root.path()).await.unwrap();
        for area in &s.areas {
            let actual = super::super::public_store::read(&db, ID, &area.geography_id)
                .await
                .unwrap();
            assert_eq!(
                actual.profiles,
                expected
                    .iter()
                    .filter(|p| p.geography_id == area.geography_id)
                    .cloned()
                    .collect::<Vec<_>>()
            );
        }
        for id in ["world", "m49:356", "m49:756", "bis:euro_area"] {
            let actual = super::super::public_store::read(&db, ID, id).await.unwrap();
            assert_eq!(actual.status, "unsupported_area");
            assert!(actual.profiles.is_empty());
        }
        let c: Contract = serde_json::from_str(CONTRACT).unwrap();
        let mut z = zip::ZipArchive::new(Cursor::new(&bytes)).unwrap();
        let mut csv = Vec::new();
        z.by_index(0).unwrap().read_to_end(&mut csv).unwrap();
        let mut reader = csv::Reader::from_reader(csv.as_slice());
        let headers = reader.headers().unwrap().clone();
        let rows: Vec<_> = reader.records().collect::<Result<_, _>>().unwrap();
        let first = rows
            .iter()
            .position(|r| !r[11].is_empty() && &r[32] == "A: Normal value")
            .unwrap();
        let meta = rows.iter().position(|r| r[11].is_empty()).unwrap();
        for (target, col, bad) in [
            (first, 4, "XX: Unknown"),
            (first, 11, "2030-Q1"),
            (first, 12, "NaN"),
            (first, 30, "C: Confidential"),
            (meta, 28, "628: Index, 2010 = 100"),
            (meta, 19, "Changed method"),
        ] {
            let mut w = csv::Writer::from_writer(Vec::new());
            w.write_record(&headers).unwrap();
            for (i, row) in rows.iter().enumerate() {
                w.write_record(
                    row.iter()
                        .enumerate()
                        .map(|(j, v)| if i == target && j == col { bad } else { v }),
                )
                .unwrap();
            }
            assert!(
                decode_csv(&s, &c, &w.into_inner().unwrap()).is_err(),
                "{target}:{col}"
            );
        }
        let mut wrong = s.clone();
        wrong.areas[0].geography_id = "world".into();
        assert!(parse(&wrong, &bytes).is_err());
        db.close().await;
    }
}
