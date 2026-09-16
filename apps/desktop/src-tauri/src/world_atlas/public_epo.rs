//! Original EPO chart workbooks: historical patent counts, not market values.
use super::public_models::*;
use crate::errors::CommandResult;
use calamine::{Data, Range, Reader, Xlsx};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    io::{Cursor, Read},
};

const CONTRACT: &str =
    include_str!("../../../src/features/world-atlas/data/public-epo-contract.json");
pub fn url(id: &str) -> CommandResult<String> {
    match id {
        "epo-quantum-sensing" => {
            Ok("https://link.epo.org/web/insights-quantum_metrology_and_sensing_en.pptx".into())
        }
        "epo-cosmonautics" => Ok(
            "https://link.epo.org/web/data_mapping_of_cosmonautics_graphs_and_datasets_en.pptx"
                .into(),
        ),
        _ => Err(invalid()),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Contract {
    source_id: String,
    zip_entries: usize,
    first_year: u32,
    last_year: u32,
    books: Vec<Book>,
    columns: Vec<Column>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Book {
    member: String,
    sha256: String,
    sheet_names: Vec<String>,
    headers: Vec<Header>,
    axis_column: Option<u32>,
    axis_first_row: Option<u32>,
    chart: String,
    chart_sha256: String,
}
#[derive(Deserialize)]
struct Header {
    sheet: String,
    row: u32,
    column: u32,
    value: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Column {
    metric_code: String,
    area_code: String,
    area_label: String,
    geography_id: String,
    book: usize,
    sheet: String,
    year_column: u32,
    value_column: u32,
    first_row: u32,
    last_row: u32,
    first_year: u32,
    last_year: u32,
    title: String,
    note: String,
}

fn sha(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}
fn member(
    zip: &mut zip::ZipArchive<Cursor<&[u8]>>,
    name: &str,
    hash: &str,
) -> CommandResult<Vec<u8>> {
    let mut entry = zip.by_name(name).map_err(|_| invalid())?;
    if entry.size() > 1024 * 1024 {
        return Err(invalid());
    }
    let mut bytes = Vec::new();
    entry.read_to_end(&mut bytes).map_err(|_| invalid())?;
    if sha(&bytes) != hash {
        return Err(invalid());
    }
    Ok(bytes)
}
fn cell(range: &Range<Data>, row: u32, col: u32) -> CommandResult<&Data> {
    range.get_value((row, col)).ok_or_else(invalid)
}
fn count(cell: &Data) -> CommandResult<u32> {
    let n = match cell {
        Data::Int(n) => *n as f64,
        Data::Float(n) => *n,
        _ => return Err(invalid()),
    };
    if !n.is_finite() || !(0.0..100_000.0).contains(&n) || n.fract() != 0.0 {
        return Err(invalid());
    }
    Ok(n as u32)
}
fn year(cell: &Data) -> CommandResult<u32> {
    match cell {
        Data::String(s) if s.len() == 4 && s.bytes().all(|b| b.is_ascii_digit()) => {
            s.parse().map_err(|_| invalid())
        }
        _ => count(cell),
    }
}

pub fn parse(source: &PublicSource, bytes: &[u8]) -> CommandResult<(Vec<PublicProfile>, usize)> {
    let contracts: Vec<Contract> = serde_json::from_str(CONTRACT).map_err(|_| invalid())?;
    let contract = contracts
        .iter()
        .find(|c| c.source_id == source.id)
        .ok_or_else(invalid)?;
    let quantum = source.id == "epo-quantum-sensing";
    if source.adapter != "epo_embedded"
        || source.url != url(&source.id)?
        || contract.last_year != 2017
        || source.last_period != "2017"
        || contract.first_year != if quantum { 2000 } else { 1990 }
        || source.first_period != contract.first_year.to_string()
        || contract.columns.len() != if quantum { 4 } else { 28 }
        || contract.books.len() != if quantum { 2 } else { 3 }
        || source.areas.len() != if quantum { 4 } else { 25 }
    {
        return Err(invalid());
    }
    let mut zip = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|_| invalid())?;
    if zip.len() != contract.zip_entries
        || zip.decompressed_size().is_none_or(|n| n > 32 * 1024 * 1024)
    {
        return Err(invalid());
    }
    let mut books = Vec::new();
    for spec in &contract.books {
        member(&mut zip, &spec.chart, &spec.chart_sha256)?;
        let raw = member(&mut zip, &spec.member, &spec.sha256)?;
        let inner = zip::ZipArchive::new(Cursor::new(raw.as_slice())).map_err(|_| invalid())?;
        if inner.len() > 128
            || inner
                .decompressed_size()
                .is_none_or(|n| n > 4 * 1024 * 1024)
        {
            return Err(invalid());
        }
        let mut book = Xlsx::new(Cursor::new(raw)).map_err(|_| invalid())?;
        if book.sheet_names() != spec.sheet_names {
            return Err(invalid());
        }
        let mut ranges = BTreeMap::new();
        for name in &spec.sheet_names {
            let range = book.worksheet_range(name).map_err(|_| invalid())?;
            if range.height() > 600 || range.width() > 100 {
                return Err(invalid());
            }
            ranges.insert(name.clone(), range);
        }
        for h in &spec.headers {
            let range = ranges.get(&h.sheet).ok_or_else(invalid)?;
            if cell(range, h.row, h.column)? != &Data::String(h.value.clone()) {
                return Err(invalid());
            }
        }
        if let (Some(col), Some(row)) = (spec.axis_column, spec.axis_first_row) {
            let range = ranges.get("ChartData").ok_or_else(invalid)?;
            for i in 0..30 {
                if year(cell(range, row + i, col)?)? != 1990 + i {
                    return Err(invalid());
                }
            }
        } else if spec.axis_column.is_some() || spec.axis_first_row.is_some() {
            return Err(invalid());
        }
        books.push(ranges);
    }
    let cfg = config()?;
    let mut profiles = Vec::new();
    for col in &contract.columns {
        let metric = cfg
            .metrics
            .iter()
            .find(|m| m.source_id == source.id && m.provider_code == col.metric_code)
            .ok_or_else(invalid)?;
        let area = source
            .areas
            .iter()
            .find(|a| a.code == col.area_code)
            .ok_or_else(invalid)?;
        if area.geography_id != col.geography_id
            || area.label != col.area_label
            || area.series_titles.get(&col.metric_code) != Some(&col.title)
            || metric.kind != "source_statistic"
            || metric.frequency != "annual"
            || metric.comparison != "same_definition"
            || !metric.connect_adjacent
            || col.first_year != contract.first_year
            || col.last_year != contract.last_year
            || col.last_row < col.first_row
            || col.last_row > 599
        {
            return Err(invalid());
        }
        let spec = contract.books.get(col.book).ok_or_else(invalid)?;
        let range = books
            .get(col.book)
            .and_then(|b| b.get(&col.sheet))
            .ok_or_else(invalid)?;
        let mut values = BTreeMap::new();
        for row in col.first_row..=col.last_row {
            let coordinate = year(cell(range, row, col.year_column)?)?;
            let y =
                if let (Some(axis_col), Some(axis_row)) = (spec.axis_column, spec.axis_first_row) {
                    if !(1..=30).contains(&coordinate) {
                        return Err(invalid());
                    }
                    year(cell(range, axis_row + coordinate - 1, axis_col)?)?
                } else {
                    coordinate
                };
            if !(contract.first_year..=2019).contains(&y) {
                return Err(invalid());
            }
            let n = count(cell(range, row, col.value_column)?)?;
            if values.insert(y, n.to_string()).is_some() {
                return Err(invalid());
            }
        }
        let points = (col.first_year..=col.last_year)
            .map(|y| {
                let value = values.get(&y).cloned();
                let mut notes = vec![col.note.clone()];
                if value.is_none() {
                    notes.push(
                        "Kein veröffentlichter Diagrammpunkt; nicht als Null gezählt.".into(),
                    );
                }
                PublicPoint {
                    period: y.to_string(),
                    value,
                    status: if quantum {
                        "Archivstudie 2019"
                    } else {
                        "Archivstudie 2021"
                    }
                    .into(),
                    break_before: false,
                    notes,
                    lower_bound: None,
                    upper_bound: None,
                }
            })
            .collect::<Vec<_>>();
        if !points.iter().any(|p| p.value.is_some()) {
            return Err(invalid());
        }
        profiles.push(PublicProfile {
            metric_id: metric.id.clone(),
            geography_id: area.geography_id.clone(),
            provider_area: area.code.clone(),
            provider_label: area.label.clone(),
            provider_title: col.title.clone(),
            unit: metric.unit.clone(),
            points,
        });
    }
    profiles.sort_by(|a, b| (&a.metric_id, &a.geography_id).cmp(&(&b.metric_id, &b.geography_id)));
    let rows = profiles.iter().map(|p| p.points.len()).sum();
    Ok((profiles, rows))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn patent_count_is_never_a_missing_or_fractional_value() {
        assert_eq!(count(&Data::Int(0)).unwrap(), 0);
        for c in [
            Data::Empty,
            Data::String("0".into()),
            Data::Float(-1.0),
            Data::Float(0.5),
            Data::Float(f64::NAN),
        ] {
            assert!(count(&c).is_err());
        }
        assert_eq!(year(&Data::String("2000".into())).unwrap(), 2000);
        assert!(year(&Data::String("2000/01".into())).is_err());
        assert!(url("not-reviewed").is_err());
    }

    #[tokio::test]
    #[ignore = "Full original public EPO presentations and independent chart-cache oracles"]
    async fn public_epo_original_roundtrip() {
        let dir =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../.tmp/atlas-remaining-40");
        let root = tempfile::tempdir().unwrap();
        for (id, file, numeric, missing) in [
            ("epo-quantum-sensing", "epo-quantum-sensing.pptx", 72, 0),
            ("epo-cosmonautics", "epo-cosmonautics.pptx", 370, 414),
        ] {
            let bytes = std::fs::read(dir.join(file)).unwrap();
            let expected: Vec<PublicProfile> = serde_json::from_slice(
                &std::fs::read(dir.join(format!("{id}-expected-profiles.json"))).unwrap(),
            )
            .unwrap();
            let source = source(id).unwrap();
            let download = super::super::public_source::parse_download(&source, &bytes).unwrap();
            assert_eq!(download.profiles, expected);
            assert_eq!(download.provenance.numeric_values, numeric);
            assert_eq!(
                download
                    .profiles
                    .iter()
                    .flat_map(|p| &p.points)
                    .filter(|p| p.value.is_none())
                    .count(),
                missing
            );
            assert!(
                download
                    .profiles
                    .iter()
                    .all(|p| p.points.last().unwrap().period == "2017")
            );
            let db = super::super::store::open(root.path()).await.unwrap();
            super::super::public_store::replace(&db, download)
                .await
                .unwrap();
            db.close().await;
            let db = super::super::store::open(root.path()).await.unwrap();
            for area in &source.areas {
                let saved = super::super::public_store::read(&db, id, &area.geography_id)
                    .await
                    .unwrap();
                let original: Vec<_> = expected
                    .iter()
                    .filter(|p| p.geography_id == area.geography_id)
                    .cloned()
                    .collect();
                assert_eq!(saved.status, "available");
                assert_eq!(saved.profiles, original);
            }
            for unsupported in ["m49:356", "m49:688", "m49:499"] {
                let absent = super::super::public_store::read(&db, id, unsupported)
                    .await
                    .unwrap();
                assert_eq!(absent.status, "unsupported_area");
                assert!(absent.profiles.is_empty());
            }
            let mut wrong = source.clone();
            wrong.areas[0].geography_id = "m49:356".into();
            assert!(parse(&wrong, &bytes).is_err());
            let mut changed = bytes.clone();
            changed[20] ^= 1;
            assert!(super::super::public_source::parse_download(&source, &changed).is_err());
            db.close().await;
        }
    }
}
