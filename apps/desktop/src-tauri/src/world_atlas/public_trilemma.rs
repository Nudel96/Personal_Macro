//! Three published ACI research dimensions, with original decimals and vintage.
use super::public_models::*;
use crate::errors::CommandResult;
use calamine::{Data, Reader, Xlsx};
use regex::Regex;
use serde::Deserialize;
use std::{
    collections::{BTreeMap, BTreeSet},
    io::{Cursor, Read},
};

pub const URL: &str = "https://web.pdx.edu/~ito/trilemma_indexes_update2020.xlsx";
const ID: &str = "aci-trilemma";
const CONTRACT: &str =
    include_str!("../../../src/features/world-atlas/data/public-trilemma-contract.json");

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Contract {
    source_id: String,
    sheet: String,
    header: Vec<String>,
    columns: Vec<Column>,
    countries: BTreeMap<String, Country>,
    original_numeric: usize,
    zip_entries: usize,
    uncompressed_bytes: u128,
}
#[derive(Deserialize)]
struct Column {
    code: String,
    index: usize,
    column: String,
    title: String,
    note: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Country {
    label: String,
    iso3: Option<String>,
    geography_id: Option<String>,
    break_years: Vec<i64>,
    note: String,
}

fn text(value: &Data) -> CommandResult<&str> {
    match value {
        Data::String(s) => Ok(s),
        _ => Err(invalid()),
    }
}
fn integer(value: &Data) -> CommandResult<i64> {
    match value {
        Data::Int(n) => Ok(*n),
        Data::Float(n) if n.is_finite() && n.fract() == 0.0 => Ok(*n as i64),
        _ => Err(invalid()),
    }
}
fn number(value: &Data) -> CommandResult<Option<f64>> {
    let n = match value {
        Data::Empty => return Ok(None),
        Data::Float(n) => *n,
        Data::Int(n) => *n as f64,
        _ => return Err(invalid()),
    };
    if !n.is_finite() || !(0.0..=1.0).contains(&n) {
        return Err(invalid());
    }
    Ok(Some(n))
}
fn original_decimals(xml: &str) -> CommandResult<BTreeMap<String, String>> {
    if xml.len() > 3 * 1024 * 1024 || xml.contains("<!DOCTYPE") || xml.contains("<!ENTITY") {
        return Err(invalid());
    }
    let cells =
        Regex::new(r#"(?s)<c r="([CDE][0-9]+)"([^>/]*)>(.*?)</c>"#).map_err(|_| invalid())?;
    let numeric = Regex::new(r"^<v>([-+0-9.eE]+)</v>$").map_err(|_| invalid())?;
    let mut values = BTreeMap::new();
    for c in cells.captures_iter(xml) {
        if c[2].contains("t=") {
            continue;
        }
        if let Some(v) = numeric.captures(&c[3])
            && values.insert(c[1].into(), v[1].into()).is_some()
        {
            return Err(invalid());
        }
    }
    Ok(values)
}

pub fn parse(source: &PublicSource, bytes: &[u8]) -> CommandResult<(Vec<PublicProfile>, usize)> {
    let contract: Contract = serde_json::from_str(CONTRACT).map_err(|_| invalid())?;
    if source.id != ID
        || source.adapter != "aci_trilemma"
        || source.url != URL
        || source.first_period != "1960"
        || source.last_period != "2020"
        || contract.source_id != ID
        || contract.sheet != "Sheet1"
        || contract.countries.len() != 199
        || contract.columns.len() != 3
        || contract.original_numeric != 24761
    {
        return Err(invalid());
    }
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|_| invalid())?;
    if archive.len() != contract.zip_entries
        || archive.len() != 7
        || archive.decompressed_size() != Some(contract.uncompressed_bytes)
        || contract.uncompressed_bytes > 4 * 1024 * 1024
    {
        return Err(invalid());
    }
    let member = archive
        .by_name("xl/worksheets/sheet1.xml")
        .map_err(|_| invalid())?;
    if member.size() > 3 * 1024 * 1024 {
        return Err(invalid());
    }
    let mut xml = String::new();
    member
        .take(3 * 1024 * 1024 + 1)
        .read_to_string(&mut xml)
        .map_err(|_| invalid())?;
    let raw = original_decimals(&xml)?;
    let mut book = Xlsx::new(Cursor::new(bytes)).map_err(|_| invalid())?;
    if book.sheet_names() != ["Sheet1"] {
        return Err(invalid());
    }
    let data = book
        .worksheet_range(&contract.sheet)
        .map_err(|_| invalid())?;
    if data.get_size() != (12078, 6)
        || data
            .rows()
            .next()
            .ok_or_else(invalid)?
            .iter()
            .map(text)
            .collect::<CommandResult<Vec<_>>>()?
            != contract.header
    {
        return Err(invalid());
    }
    let cfg = config()?;
    let metrics: BTreeMap<_, _> = cfg
        .metrics
        .iter()
        .filter(|m| m.source_id == ID)
        .map(|m| (m.provider_code.as_str(), m))
        .collect();
    let areas: BTreeMap<_, _> = source.areas.iter().map(|a| (a.code.as_str(), a)).collect();
    let geographies = super::catalog::catalog()?.geographies;
    if metrics.len() != 3 || areas.len() != source.areas.len() || areas.is_empty() {
        return Err(invalid());
    }
    for a in &source.areas {
        let c = contract.countries.get(&a.code).ok_or_else(invalid)?;
        if a.label != c.label
            || c.geography_id.as_ref() != Some(&a.geography_id)
            || !geographies
                .iter()
                .any(|g| g.id == a.geography_id && Some(&g.iso3) == c.iso3.as_ref())
        {
            return Err(invalid());
        }
    }
    for c in &contract.columns {
        let (index, col) = match c.code.as_str() {
            "ers" => (2, "C"),
            "mi" => (3, "D"),
            "kaopen" => (4, "E"),
            _ => return Err(invalid()),
        };
        let m = metrics.get(c.code.as_str()).ok_or_else(invalid)?;
        if c.index != index
            || c.column != col
            || c.title != contract.header[index]
            || m.frequency != "annual"
            || m.unit != "Forschungsindex (0–1)"
            || m.kind != "model_estimate"
            || m.comparison != "same_definition"
            || !m.connect_adjacent
            || source
                .areas
                .iter()
                .any(|a| a.series_titles.get(&c.code).is_some_and(|t| t != &c.title))
        {
            return Err(invalid());
        }
    }
    let mut profiles: BTreeMap<(String, String), PublicProfile> = BTreeMap::new();
    let mut seen = BTreeSet::new();
    let mut numeric = 0;
    for (i, row) in data.rows().enumerate().skip(1) {
        let code = integer(&row[0])?.to_string();
        let year = integer(&row[1])?;
        let c = contract.countries.get(&code).ok_or_else(invalid)?;
        if text(&row[5])? != c.label
            || !(1960..=2020).contains(&year)
            || !seen.insert((code.clone(), year))
        {
            return Err(invalid());
        }
        for column in &contract.columns {
            let value = number(&row[column.index])?;
            let raw_value = raw.get(&format!("{}{}", column.column, i + 1));
            match (value, raw_value) {
                (None, None) => {}
                (Some(n), Some(s))
                    if super::public_source::decimal(s)?.is_some()
                        && s.parse::<f64>().map_err(|_| invalid())? == n =>
                {
                    numeric += 1;
                }
                _ => return Err(invalid()),
            }
            let area = areas
                .get(code.as_str())
                .filter(|a| a.series_titles.contains_key(&column.code));
            if value.is_some() && area.is_none() && code != "353" {
                return Err(invalid());
            }
            let Some(area) = area else {
                continue;
            };
            let metric = metrics[column.code.as_str()];
            let profile = profiles
                .entry((metric.id.clone(), area.geography_id.clone()))
                .or_insert_with(|| PublicProfile {
                    metric_id: metric.id.clone(),
                    geography_id: area.geography_id.clone(),
                    provider_area: code.clone(),
                    provider_label: area.label.clone(),
                    provider_title: column.title.clone(),
                    unit: metric.unit.clone(),
                    points: Vec::new(),
                });
            let mut notes = vec![column.note.clone()];
            if !c.note.is_empty() {
                notes.push(c.note.clone());
            }
            profile.points.push(PublicPoint {
                period: year.to_string(),
                value: raw_value.cloned(),
                status: if value.is_some() {
                    "Veröffentlichter Forschungsindex"
                } else {
                    "Kein veröffentlichter Zahlenwert"
                }
                .into(),
                break_before: c.break_years.contains(&year),
                notes,
                lower_bound: None,
                upper_bound: None,
            });
        }
    }
    for p in profiles.values_mut() {
        p.points.sort_by(|a, b| a.period.cmp(&b.period));
    }
    if numeric != contract.original_numeric
        || raw.len() != numeric
        || seen.len() != 12077
        || profiles
            .values()
            .any(|p| p.points.is_empty() || p.points.iter().all(|v| v.value.is_none()))
    {
        return Err(invalid());
    }
    Ok((profiles.into_values().collect(), seen.len()))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn trilemma_original_indices_do_not_turn_missing_into_midpoint() {
        assert_eq!(number(&Data::Empty).unwrap(), None);
        assert_eq!(number(&Data::Int(0)).unwrap(), Some(0.0));
        assert_eq!(number(&Data::Float(0.5)).unwrap(), Some(0.5));
        assert!(number(&Data::Float(1.0001)).is_err());
        assert!(number(&Data::Float(-0.01)).is_err());
        let v = original_decimals(r#"<c r="C2" s="1"/><c r="D2" s="1"><v>0.4858701229095459</v></c><c r="E2" s="1"><v>0</v></c>"#).unwrap();
        assert_eq!(v.len(), 2);
        assert_eq!(v["D2"], "0.4858701229095459");
        assert_eq!(v["E2"], "0");
    }
    #[tokio::test]
    #[ignore = "Original ACI workbook, independent XML/OpenPyXL oracle and temporary SQLite"]
    async fn public_trilemma_original_roundtrip() {
        let dir =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../.tmp/atlas-remaining-40");
        let bytes = std::fs::read(dir.join("aci-trilemma-2020.xlsx")).unwrap();
        let expected: Vec<PublicProfile> = serde_json::from_slice(
            &std::fs::read(dir.join("trilemma-expected-profiles.json")).unwrap(),
        )
        .unwrap();
        let s = source(ID).unwrap();
        let download = super::super::public_source::parse_download(&s, &bytes).unwrap();
        assert_eq!(download.profiles, expected);
        assert!(
            expected
                .iter()
                .filter(|p| p.metric_id.ends_with(":kaopen"))
                .flat_map(|p| &p.points)
                .filter(|p| p.value.is_some())
                .all(|p| p.period.as_str() <= "2019")
        );
        let root = tempfile::tempdir().unwrap();
        let db = super::super::store::open(root.path()).await.unwrap();
        super::super::public_store::replace(&db, download)
            .await
            .unwrap();
        db.close().await;
        let db = super::super::store::open(root.path()).await.unwrap();
        for a in &s.areas {
            let row = super::super::public_store::read(&db, ID, &a.geography_id)
                .await
                .unwrap();
            assert_eq!(
                row.profiles,
                expected
                    .iter()
                    .filter(|p| p.geography_id == a.geography_id)
                    .cloned()
                    .collect::<Vec<_>>()
            );
        }
        for geo in ["world", "m49:840", "un-wpp:903", "m49:688"] {
            let row = super::super::public_store::read(&db, ID, geo)
                .await
                .unwrap();
            assert_eq!(row.status, "unsupported_area");
            assert!(row.profiles.is_empty());
        }
        let mut bad_area = s.clone();
        bad_area.areas[0].geography_id = "world".into();
        assert!(parse(&bad_area, &bytes).is_err());
        let mut changed = bytes;
        changed[20] ^= 1;
        assert!(super::super::public_source::parse_download(&s, &changed).is_err());
        db.close().await;
    }
}
