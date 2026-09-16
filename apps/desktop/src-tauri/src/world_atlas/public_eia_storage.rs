//! EIA's original US battery tables: stock, additions and installation cohorts.
use super::public_models::*;
use crate::errors::CommandResult;
use calamine::{Data, Range, Reader, Xlsx};
use regex::Regex;
use serde::Deserialize;
use std::{
    collections::BTreeMap,
    io::{Cursor, Read},
};

pub const URL: &str = "https://www.eia.gov/analysis/studies/electricity/batterystorage/xls/2024%20Battery%20Storage%20Figures.xlsx";
const ID: &str = "eia-battery-storage";
const CONTRACT: &str =
    include_str!("../../../src/features/world-atlas/data/public-eia-storage-contract.json");

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Contract {
    source_id: String,
    sheet_names: Vec<String>,
    sheets: Vec<Sheet>,
    columns: Vec<Column>,
}
#[derive(Deserialize)]
struct Sheet {
    name: String,
    xml: String,
    headers: Vec<Header>,
}
#[derive(Deserialize)]
struct Header {
    coordinate: String,
    text: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Column {
    code: String,
    sheet: String,
    column: String,
    first_row: u32,
    last_row: u32,
    first_year: u32,
    header: String,
    note: String,
}

fn coordinate(value: &str) -> CommandResult<(u32, u32)> {
    let b = value.as_bytes();
    if b.len() < 2 || !b[0].is_ascii_uppercase() || !b[1..].iter().all(u8::is_ascii_digit) {
        return Err(invalid());
    }
    let row = value[1..].parse::<u32>().map_err(|_| invalid())?;
    if !(1..=200).contains(&row) {
        return Err(invalid());
    }
    Ok((row - 1, (b[0] - b'A') as u32))
}
fn cell<'a>(range: &'a Range<Data>, address: &str) -> CommandResult<&'a Data> {
    range.get_value(coordinate(address)?).ok_or_else(invalid)
}
fn text(value: &Data) -> CommandResult<&str> {
    match value {
        Data::String(s) => Ok(s),
        _ => Err(invalid()),
    }
}
fn number(value: &Data) -> CommandResult<f64> {
    let n = match value {
        Data::Int(n) => *n as f64,
        Data::Float(n) => *n,
        _ => return Err(invalid()),
    };
    if !n.is_finite() || !(0.0..100_000.0).contains(&n) {
        return Err(invalid());
    }
    Ok(n)
}

// Calamine validates the workbook and types. This bounded extraction retains
// the source's decimal spelling instead of round-tripping it through f64.
fn raw_numeric_cells(xml: &str) -> CommandResult<BTreeMap<String, String>> {
    if xml.len() > 256 * 1024 || xml.contains("<!DOCTYPE") || xml.contains("<!ENTITY") {
        return Err(invalid());
    }
    let cells = Regex::new(r#"(?s)<c\b([^>]*)>(.*?)</c>"#).map_err(|_| invalid())?;
    let address = Regex::new(r#"(?:^|\s)r="([A-Z]+[0-9]+)""#).map_err(|_| invalid())?;
    let value = Regex::new(r"^<v>([-+0-9.eE]+)</v>$").map_err(|_| invalid())?;
    let mut result = BTreeMap::new();
    for c in cells.captures_iter(xml) {
        if c[1].contains("t=") {
            continue;
        }
        let Some(v) = value.captures(&c[2]) else {
            continue;
        };
        let a = address.captures(&c[1]).ok_or_else(invalid)?;
        if result.insert(a[1].to_owned(), v[1].to_owned()).is_some() {
            return Err(invalid());
        }
    }
    Ok(result)
}

pub fn parse(source: &PublicSource, bytes: &[u8]) -> CommandResult<(Vec<PublicProfile>, usize)> {
    let contract: Contract = serde_json::from_str(CONTRACT).map_err(|_| invalid())?;
    if source.id != ID
        || source.adapter != "eia_battery"
        || source.url != URL
        || contract.source_id != ID
        || contract.columns.len() != 5
        || contract.sheets.len() != 2
        || source.areas.len() != 1
        || source.areas[0].code != "US"
        || source.areas[0].label != "United States"
        || source.areas[0].geography_id != "m49:840"
        || source.first_period != "2003"
        || source.last_period != "2023"
    {
        return Err(invalid());
    }
    let mut zip = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|_| invalid())?;
    if zip.len() != 206 || zip.decompressed_size().is_none_or(|n| n > 8 * 1024 * 1024) {
        return Err(invalid());
    }
    let mut book = Xlsx::new(Cursor::new(bytes)).map_err(|_| invalid())?;
    if book.sheet_names() != contract.sheet_names {
        return Err(invalid());
    }
    let cfg = config()?;
    let area = &source.areas[0];
    let mut profiles = Vec::new();
    let mut source_rows = 0;
    for sheet in &contract.sheets {
        let range = book.worksheet_range(&sheet.name).map_err(|_| invalid())?;
        for h in &sheet.headers {
            if text(cell(&range, &h.coordinate)?)? != h.text {
                return Err(invalid());
            }
        }
        let mut member = zip.by_name(&sheet.xml).map_err(|_| invalid())?;
        if member.size() > 256 * 1024 {
            return Err(invalid());
        }
        let mut xml = String::new();
        member.read_to_string(&mut xml).map_err(|_| invalid())?;
        let raw = raw_numeric_cells(&xml)?;
        let columns: Vec<_> = contract
            .columns
            .iter()
            .filter(|c| c.sheet == sheet.name)
            .collect();
        let first = columns.first().ok_or_else(invalid)?;
        source_rows += (first.last_row - first.first_row + 1) as usize;
        for col in columns {
            let metric = cfg
                .metrics
                .iter()
                .find(|m| m.source_id == ID && m.provider_code == col.code)
                .ok_or_else(invalid)?;
            if metric.frequency != "annual"
                || metric.comparison != "within_country"
                || !metric.connect_adjacent
                || col.last_row < col.first_row
                || col.last_row - col.first_row + col.first_year != 2023
                || col.column.len() != 1
                || !col.column.as_bytes()[0].is_ascii_uppercase()
                || text(cell(
                    &range,
                    &format!("{}{}", col.column, col.first_row - 1),
                )?)? != col.header
            {
                return Err(invalid());
            }
            let title = format!("{} | {}", text(cell(&range, "A1")?)?.trim(), col.header);
            if area.series_titles.get(&col.code) != Some(&title) {
                return Err(invalid());
            }
            let mut points = Vec::new();
            for row in col.first_row..=col.last_row {
                let year = col.first_year + row - col.first_row;
                if number(cell(&range, &format!("A{row}"))?)? != year as f64 {
                    return Err(invalid());
                }
                let address = format!("{}{row}", col.column);
                let value = raw.get(&address).ok_or_else(invalid)?;
                let numeric = number(cell(&range, &address)?)?;
                if super::public_source::decimal(value)?.is_none()
                    || value.parse::<f64>().map_err(|_| invalid())? != numeric
                {
                    return Err(invalid());
                }
                points.push(PublicPoint {
                    period: year.to_string(),
                    value: Some(value.clone()),
                    status: "Endgültiger Quellenstand 2023".into(),
                    break_before: false,
                    notes: vec![col.note.clone()],
                    lower_bound: None,
                    upper_bound: None,
                });
            }
            profiles.push(PublicProfile {
                metric_id: metric.id.clone(),
                geography_id: area.geography_id.clone(),
                provider_area: area.code.clone(),
                provider_label: area.label.clone(),
                provider_title: title,
                unit: metric.unit.clone(),
                points,
            });
        }
    }
    profiles.sort_by(|a, b| a.metric_id.cmp(&b.metric_id));
    if profiles.len() != 5 || source_rows != 30 {
        return Err(invalid());
    }
    Ok((profiles, source_rows))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn battery_zero_missing_and_source_decimals_remain_distinct() {
        assert_eq!(number(&Data::Int(0)).unwrap(), 0.0);
        for value in [
            Data::Empty,
            Data::String("0".into()),
            Data::Float(-1.0),
            Data::Float(f64::INFINITY),
        ] {
            assert!(number(&value).is_err());
        }
        let xml = r#"<worksheet><c r="C54" s="72"><v>43816.099999999991</v></c><c r="A1" t="s"><v>0</v></c><c r="B2"><f>1+1</f><v>2</v></c></worksheet>"#;
        let values = raw_numeric_cells(xml).unwrap();
        assert_eq!(values.len(), 1);
        assert_eq!(values["C54"], "43816.099999999991");
        assert!(raw_numeric_cells(r#"<c r="A1"><v>1</v></c><c r="A1"><v>2</v></c>"#).is_err());
    }

    #[tokio::test]
    #[ignore = "Audited original EIA workbook and temporary public SQLite cache only"]
    async fn public_eia_storage_original_roundtrip() {
        let dir =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../.tmp/atlas-remaining-40");
        let bytes = std::fs::read(dir.join("eia-battery-2024.xlsx")).unwrap();
        let expected: Vec<PublicProfile> = serde_json::from_slice(
            &std::fs::read(dir.join("eia-storage-expected-profiles.json")).unwrap(),
        )
        .unwrap();
        let s = source(ID).unwrap();
        let download = super::super::public_source::parse_download(&s, &bytes).unwrap();
        assert_eq!(download.profiles, expected);
        assert_eq!(download.provenance.numeric_values, 69);
        assert!(
            download
                .profiles
                .iter()
                .all(|p| p.points.last().unwrap().period == "2023")
        );
        let root = tempfile::tempdir().unwrap();
        let db = super::super::store::open(root.path()).await.unwrap();
        super::super::public_store::replace(&db, download)
            .await
            .unwrap();
        db.close().await;
        let db = super::super::store::open(root.path()).await.unwrap();
        assert_eq!(
            super::super::public_store::read(&db, ID, "m49:840")
                .await
                .unwrap()
                .profiles,
            expected
        );
        for geo in ["world", "m49:276", "m49:356", "m49:156"] {
            let absent = super::super::public_store::read(&db, ID, geo)
                .await
                .unwrap();
            assert_eq!(absent.status, "unsupported_area");
            assert!(absent.profiles.is_empty());
        }
        let mut wrong = s.clone();
        wrong.areas[0].geography_id = "world".into();
        assert!(parse(&wrong, &bytes).is_err());
        let mut changed = bytes.clone();
        changed[20] ^= 1;
        assert!(super::super::public_source::parse_download(&s, &changed).is_err());
        db.close().await;
    }
}
