//! Original GFDD stock-market concentration shares; never historical fund weights.
use super::public_models::*;
use crate::errors::CommandResult;
use calamine::{Data, Reader, Xlsx};
use regex::Regex;
use serde::Deserialize;
use std::{
    collections::{BTreeMap, BTreeSet},
    io::{Cursor, Read},
};

pub const URL: &str = "https://thedocs.worldbank.org/en/doc/5882f2b2117b882d58a78f9c64ea3613-0050062022/original/20220909-global-financial-development-database.xlsx";
const ID: &str = "worldbank-gfdd-concentration";
const CONTRACT: &str =
    include_str!("../../../src/features/world-atlas/data/public-gfdd-contract.json");

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Contract {
    source_id: String,
    sheet_names: Vec<String>,
    sheet: String,
    data_xml: String,
    header: Vec<String>,
    columns: Vec<Column>,
    source_countries: BTreeMap<String, String>,
    zip_entries: usize,
    uncompressed_bytes: u128,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Column {
    code: String,
    column: String,
    index: usize,
    metadata_row: u32,
    metadata: Vec<Option<String>>,
    note: String,
}

fn text(value: &Data) -> CommandResult<&str> {
    match value {
        Data::String(s) => Ok(s),
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
    if !n.is_finite() || !(0.0..=100.0).contains(&n) {
        return Err(invalid());
    }
    Ok(Some(n))
}

fn original_decimals(xml: &str) -> CommandResult<BTreeMap<String, String>> {
    if xml.len() > 44 * 1024 * 1024 || xml.contains("<!DOCTYPE") || xml.contains("<!ENTITY") {
        return Err(invalid());
    }
    let cells =
        Regex::new(r#"(?s)<c r="((?:AR|AS)[0-9]+)"([^>/]*)>(.*?)</c>"#).map_err(|_| invalid())?;
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
        || source.adapter != "gfdd_concentration"
        || source.url != URL
        || source.first_period != "1998"
        || source.last_period != "2020"
        || source.areas.len() != 60
        || contract.source_id != ID
        || contract.sheet != "Data - August 2022"
        || contract.data_xml != "xl/worksheets/sheet3.xml"
        || contract.columns.len() != 2
        || contract.source_countries.len() != 214
    {
        return Err(invalid());
    }
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|_| invalid())?;
    if archive.len() != contract.zip_entries
        || archive.len() != 30
        || archive.decompressed_size() != Some(contract.uncompressed_bytes)
        || contract.uncompressed_bytes > 96 * 1024 * 1024
    {
        return Err(invalid());
    }
    let member = archive.by_name(&contract.data_xml).map_err(|_| invalid())?;
    if member.size() > 44 * 1024 * 1024 {
        return Err(invalid());
    }
    let mut xml = String::new();
    member
        .take(44 * 1024 * 1024 + 1)
        .read_to_string(&mut xml)
        .map_err(|_| invalid())?;
    let raw = original_decimals(&xml)?;
    let mut book = Xlsx::new(Cursor::new(bytes)).map_err(|_| invalid())?;
    if book.sheet_names() != contract.sheet_names {
        return Err(invalid());
    }
    let metadata = book.worksheet_range("Metadata").map_err(|_| invalid())?;
    let data = book
        .worksheet_range(&contract.sheet)
        .map_err(|_| invalid())?;
    if metadata.get_size() != (113, 8)
        || data.get_size() != (13269, 115)
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
    if areas.len() != 60
        || metrics.len() != 2
        || source.areas.iter().any(|a| {
            contract.source_countries.get(&a.code) != Some(&a.label)
                || !geographies
                    .iter()
                    .any(|g| g.id == a.geography_id && g.iso3 == a.code)
        })
    {
        return Err(invalid());
    }
    for column in &contract.columns {
        let (index, letter, meta_row) = match column.code.as_str() {
            "am01" => (43, "AR", 38),
            "am02" => (44, "AS", 39),
            _ => return Err(invalid()),
        };
        let metric = metrics.get(column.code.as_str()).ok_or_else(invalid)?;
        if column.index != index
            || column.column != letter
            || column.metadata_row != meta_row
            || column.metadata.len() != 8
            || metric.frequency != "annual"
            || metric.kind != "source_statistic"
            || metric.comparison != "same_definition"
            || metric.unit != "Anteil außerhalb der Top 10 (%)"
            || !metric.connect_adjacent
        {
            return Err(invalid());
        }
        for (i, expected) in column.metadata.iter().enumerate() {
            let cell = metadata
                .get_value((column.metadata_row - 1, i as u32))
                .ok_or_else(invalid)?;
            if match expected {
                Some(s) => text(cell)? != s,
                None => !matches!(cell, Data::Empty),
            } {
                return Err(invalid());
            }
        }
        for area in &source.areas {
            if let Some(title) = area.series_titles.get(&column.code)
                && Some(title) != column.metadata[2].as_ref()
            {
                return Err(invalid());
            }
        }
    }
    let mut profiles: BTreeMap<(String, String), PublicProfile> = BTreeMap::new();
    let mut seen = BTreeSet::new();
    let mut original_numeric = 0;
    for (i, row) in data.rows().enumerate().skip(1) {
        let code = text(&row[0])?;
        let label = text(&row[3])?;
        if contract.source_countries.get(code).map(String::as_str) != Some(label) {
            return Err(invalid());
        }
        let year = match row[6] {
            Data::Int(n) => n,
            Data::Float(n) if n.is_finite() && n.fract() == 0.0 => n as i64,
            _ => return Err(invalid()),
        };
        if !(1960..=2021).contains(&year) || !seen.insert((code.to_owned(), year)) {
            return Err(invalid());
        }
        for column in &contract.columns {
            let value = number(&row[column.index])?;
            let raw_value = raw.get(&format!("{}{}", column.column, i + 1));
            match (value, raw_value) {
                (None, None) => {}
                (Some(n), Some(s))
                    if super::public_source::decimal(s)?.is_some()
                        && s.parse::<f64>().map_err(|_| invalid())? == n
                        && (1998..=2020).contains(&year) =>
                {
                    original_numeric += 1;
                }
                _ => return Err(invalid()),
            }
            let area = areas
                .get(code)
                .filter(|a| a.series_titles.contains_key(&column.code));
            if value.is_some() && area.is_none() {
                return Err(invalid());
            }
            if !(1998..=2020).contains(&year) {
                continue;
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
                    provider_area: area.code.clone(),
                    provider_label: area.label.clone(),
                    provider_title: area.series_titles[&column.code].clone(),
                    unit: metric.unit.clone(),
                    points: Vec::new(),
                });
            profile.points.push(PublicPoint {
                period: year.to_string(),
                value: raw_value.cloned(),
                status: if value.is_some() {
                    "GFDD-Archiv September 2022"
                } else {
                    "Kein veröffentlichter Zahlenwert"
                }
                .into(),
                break_before: false,
                notes: vec![column.note.clone()],
                lower_bound: None,
                upper_bound: None,
            });
        }
    }
    if original_numeric != 1829
        || raw.len() != original_numeric
        || seen.len() != 13268
        || profiles
            .values()
            .any(|p| p.points.len() != 23 || p.points.iter().all(|v| v.value.is_none()))
    {
        return Err(invalid());
    }
    Ok((profiles.into_values().collect(), seen.len()))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn gfdd_shares_keep_zero_missing_and_exact_decimals() {
        assert_eq!(number(&Data::Int(0)).unwrap(), Some(0.0));
        assert_eq!(number(&Data::Empty).unwrap(), None);
        for value in [
            Data::String("0".into()),
            Data::Float(-0.1),
            Data::Float(100.01),
        ] {
            assert!(number(&value).is_err());
        }
        let values = original_decimals(r#"<c r="AR2" s="1"><v>26.784999999999997</v></c><c r="AS2" s="1"><v>0</v></c><c r="AR1" t="s"><v>32</v></c>"#).unwrap();
        assert_eq!(values["AR2"], "26.784999999999997");
        assert_eq!(values["AS2"], "0");
        assert_eq!(values.len(), 2);
        let after_empty =
            original_decimals(r#"<c r="AR2" s="29"/><c r="AS2" s="29"><v>42.25</v></c>"#).unwrap();
        assert_eq!(after_empty.len(), 1);
        assert_eq!(after_empty["AS2"], "42.25");
    }

    #[tokio::test]
    #[ignore = "Original GFDD workbook and independent XML/OpenPyXL audit; temporary SQLite only"]
    async fn public_gfdd_original_roundtrip() {
        let dir =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../.tmp/atlas-remaining-40");
        let bytes = std::fs::read(dir.join("worldbank-gfdd-2022.xlsx")).unwrap();
        let expected: Vec<PublicProfile> = serde_json::from_slice(
            &std::fs::read(dir.join("gfdd-expected-profiles.json")).unwrap(),
        )
        .unwrap();
        let s = source(ID).unwrap();
        let download = super::super::public_source::parse_download(&s, &bytes).unwrap();
        assert_eq!(download.profiles, expected);
        assert_eq!(download.provenance.numeric_values, 1829);
        let root = tempfile::tempdir().unwrap();
        let db = super::super::store::open(root.path()).await.unwrap();
        super::super::public_store::replace(&db, download)
            .await
            .unwrap();
        db.close().await;
        let db = super::super::store::open(root.path()).await.unwrap();
        for area in &s.areas {
            let row = super::super::public_store::read(&db, ID, &area.geography_id)
                .await
                .unwrap();
            let matching: Vec<_> = expected
                .iter()
                .filter(|p| p.geography_id == area.geography_id)
                .cloned()
                .collect();
            assert_eq!(row.profiles, matching);
        }
        for geo in ["world", "un-wpp:903", "m49:250"] {
            let row = super::super::public_store::read(&db, ID, geo)
                .await
                .unwrap();
            assert_eq!(row.status, "unsupported_area");
            assert!(row.profiles.is_empty());
        }
        let mut bad_area = s.clone();
        bad_area.areas[0].geography_id = "world".into();
        assert!(parse(&bad_area, &bytes).is_err());
        let mut changed = bytes.clone();
        changed[20] ^= 1;
        assert!(super::super::public_source::parse_download(&s, &changed).is_err());
        assert!(
            !super::super::public_store::read(&db, ID, "m49:356")
                .await
                .unwrap()
                .profiles
                .is_empty()
        );
        db.close().await;
    }
}
