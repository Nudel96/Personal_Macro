//! Realized private US construction activity: exact workbook, categories and monthly units.
use super::public_models::*;
use crate::errors::CommandResult;
use calamine::{Data, Reader, Xlsx};
use serde::Deserialize;
use std::{collections::BTreeSet, io::Cursor};

const CONTRACT: &str =
    include_str!("../../../src/features/world-atlas/data/public-census-contract.json");

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Contract {
    sheet: String,
    row_count: usize,
    headers: Vec<String>,
    metrics: Vec<Column>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Column {
    id: String,
    column: usize,
    header: String,
    first_period: String,
    expected_values: usize,
}
fn text(cell: &Data) -> CommandResult<&str> {
    match cell {
        Data::String(s) => Ok(s),
        _ => Err(invalid()),
    }
}
fn blank(cell: &Data) -> bool {
    matches!(cell, Data::Empty) || matches!(cell, Data::String(s) if s.is_empty())
}
fn number(cell: &Data) -> CommandResult<String> {
    match cell {
        Data::Int(n) if *n >= 0 => Ok(n.to_string()),
        Data::Float(n) if n.is_finite() && *n >= 0.0 && n.fract() == 0.0 => Ok(n.to_string()),
        _ => Err(invalid()),
    }
}
fn period(raw: &str) -> CommandResult<(String, String)> {
    let bytes = raw.as_bytes();
    if !raw.is_ascii() || !(6..=7).contains(&bytes.len()) || bytes[3] != b'-' {
        return Err(invalid());
    }
    let month = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ]
    .iter()
    .position(|m| *m == &raw[..3])
    .ok_or_else(invalid)?
        + 1;
    let yy = raw[4..6].parse::<u16>().map_err(|_| invalid())?;
    let year = if yy >= 93 { 1900 + yy } else { 2000 + yy };
    let flag = &raw[6..];
    let value = format!("{year:04}-{month:02}");
    if !matches!(flag, "" | "p" | "r") || !("1993-01"..="2026-07").contains(&value.as_str()) {
        return Err(invalid());
    }
    Ok((value, flag.to_owned()))
}

pub fn parse(source: &PublicSource, bytes: &[u8]) -> CommandResult<(Vec<PublicProfile>, usize)> {
    let contract: Contract = serde_json::from_str(CONTRACT).map_err(|_| invalid())?;
    let zip = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|_| invalid())?;
    if zip.len() > 100 || zip.decompressed_size().is_none_or(|n| n > 8 * 1024 * 1024) {
        return Err(invalid());
    }
    let mut book = Xlsx::new(Cursor::new(bytes)).map_err(|_| invalid())?;
    if book.sheet_names() != [contract.sheet.clone()] {
        return Err(invalid());
    }
    let range = book
        .worksheet_range(&contract.sheet)
        .map_err(|_| invalid())?;
    let rows: Vec<_> = range.rows().collect();
    if rows.len() != contract.row_count
        || rows.iter().any(|r| r.len() < contract.headers.len())
        || text(&rows[0][0])?
            != "Value of Private Construction Put in Place - Not Seasonally Adjusted"
        || text(&rows[1][0])?
            != "(Millions of dollars. Details may not add to totals since all types of construction are not shown separately.)"
        || text(&rows[409][0])? != "p Preliminary r Revised"
        || !text(&rows[416][0])?.contains("September 1, 2026")
    {
        return Err(invalid());
    }
    let normalized = |s: &str| s.replace("_x000D_", "\r").replace('\r', "");
    for (cell, expected) in rows[3].iter().zip(&contract.headers) {
        if normalized(text(cell)?) != normalized(expected) {
            return Err(invalid());
        }
    }
    let cfg = config()?;
    if source.areas.len() != 1
        || source.areas[0].code != "US"
        || source.areas[0].geography_id != "m49:840"
    {
        return Err(invalid());
    }
    let area = &source.areas[0];
    let mut profiles = Vec::new();
    for spec in &contract.metrics {
        let metric = cfg
            .metrics
            .iter()
            .find(|m| m.id == spec.id && m.source_id == source.id)
            .ok_or_else(invalid)?;
        if spec.column >= contract.headers.len()
            || metric.provider_code != spec.header
            || metric.frequency != "monthly"
        {
            return Err(invalid());
        }
        let mut points = Vec::new();
        let mut seen = BTreeSet::new();
        for row in &rows[4..407] {
            let (period, status) = period(text(&row[0])?)?;
            if !seen.insert(period.clone()) {
                return Err(invalid());
            }
            if period < spec.first_period {
                if !blank(&row[spec.column]) {
                    return Err(invalid());
                }
                continue;
            }
            let notes = match status.as_str() {
                "p" => vec!["Vorläufiger Quellenwert (p)".into()],
                "r" => vec!["Revidierter Quellenwert (r)".into()],
                _ => vec![],
            };
            points.push(PublicPoint {
                period,
                value: Some(number(&row[spec.column])?),
                status,
                break_before: false,
                notes,
                lower_bound: None,
                upper_bound: None,
            });
        }
        points.sort_by(|a, b| a.period.cmp(&b.period));
        if points.len() != spec.expected_values
            || points.first().is_none_or(|p| p.period != spec.first_period)
            || points.last().is_none_or(|p| p.period != source.last_period)
        {
            return Err(invalid());
        }
        profiles.push(PublicProfile {
            metric_id: metric.id.clone(),
            geography_id: area.geography_id.clone(),
            provider_area: area.code.clone(),
            provider_label: area.label.clone(),
            provider_title: area
                .series_titles
                .get(&metric.provider_code)
                .ok_or_else(invalid)?
                .clone(),
            unit: metric.unit.clone(),
            points,
        });
    }
    Ok((profiles, 403))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn census_month_flags_and_original_integer_values() {
        assert_eq!(period("Jan-93").unwrap(), ("1993-01".into(), "".into()));
        assert_eq!(period("Jul-26p").unwrap(), ("2026-07".into(), "p".into()));
        assert_eq!(period("Jun-26r").unwrap(), ("2026-06".into(), "r".into()));
        for wrong in [
            "Jan-92", "Aug-26", "Jul-26e", "Jän-26", "Jan-2026", "Nan-24",
        ] {
            assert!(period(wrong).is_err());
        }
        assert_eq!(number(&Data::Float(0.0)).unwrap(), "0");
        for wrong in [
            Data::Empty,
            Data::String("(D)".into()),
            Data::Float(-1.0),
            Data::Float(1.5),
        ] {
            assert!(number(&wrong).is_err());
        }
    }

    #[tokio::test]
    #[ignore = "Explicit audited original workbook and temporary SQLite verification"]
    async fn public_census_reviewed_release_roundtrip() {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../.tmp/atlas-remaining-40/census-private-nsa.xlsx");
        let bytes = std::fs::read(path).unwrap();
        let source = source("census-construction").unwrap();
        let download = super::super::public_source::parse_download(&source, &bytes).unwrap();
        assert_eq!(download.provenance.numeric_values, 1360);
        let centers = download
            .profiles
            .iter()
            .find(|p| p.metric_id.ends_with(":data_centers"))
            .unwrap();
        assert_eq!(centers.points.len(), 151);
        assert_eq!(centers.points[0].period, "2014-01");
        assert_eq!(centers.points[0].value.as_deref(), Some("124"));
        assert_eq!(centers.points[150].value.as_deref(), Some("6551"));
        assert_eq!(centers.points[150].status, "p");
        assert!(centers.points[150].notes[0].contains("Vorläufig"));
        let general = download
            .profiles
            .iter()
            .find(|p| p.metric_id.ends_with(":commercial_warehouses"))
            .unwrap();
        assert_eq!(general.points[0].value.as_deref(), Some("346"));
        let saved = download.profiles.clone();
        let root = tempfile::tempdir().unwrap();
        let db = super::super::store::open(root.path()).await.unwrap();
        super::super::public_store::replace(&db, download)
            .await
            .unwrap();
        db.close().await;
        let reopened = super::super::store::open(root.path()).await.unwrap();
        let read = super::super::public_store::read(&reopened, &source.id, "m49:840")
            .await
            .unwrap();
        for expected in saved {
            assert_eq!(
                read.profiles
                    .iter()
                    .find(|p| p.metric_id == expected.metric_id)
                    .unwrap(),
                &expected
            );
        }
        assert!(
            super::super::public_store::read(&reopened, &source.id, "world")
                .await
                .unwrap()
                .profiles
                .is_empty()
        );
        let mut wrong = source.clone();
        wrong.areas[0].geography_id = "m49:276".into();
        assert!(parse(&wrong, &bytes).is_err());
        let mut broken = bytes.clone();
        broken[100] ^= 1;
        assert!(super::super::public_source::parse_download(&source, &broken).is_err());
    }
}
