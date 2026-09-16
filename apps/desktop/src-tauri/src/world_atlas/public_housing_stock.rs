//! Published OECD housing stock: actual reference years and a separate England.
use super::public_models::*;
use crate::errors::CommandResult;
use calamine::{Data, Range, Reader, Xlsx};
use serde::Deserialize;
use std::{collections::BTreeSet, io::Cursor};

const CONTRACT: &str =
    include_str!("../../../src/features/world-atlas/data/public-housing-stock-contract.json");
pub const URL: &str = "https://webfs.oecd.org/Els-com/Affordable_Housing_Database/HM1-1-Housing-stock-and-construction.xlsx";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Contract {
    source_id: String,
    sheet: String,
    headers: Vec<Header>,
    notes: Vec<Header>,
    areas: Vec<Area>,
    expected_undated_blocks: usize,
}
#[derive(Deserialize)]
struct Header {
    row: u32,
    #[serde(default)]
    column: u32,
    text: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Area {
    row: u32,
    label: String,
    geography_id: String,
    years: Vec<Option<i32>>,
}
fn cell(range: &Range<Data>, row: u32, col: u32) -> CommandResult<&Data> {
    range.get_value((row, col)).ok_or_else(invalid)
}
fn text(value: &Data) -> CommandResult<&str> {
    if let Data::String(s) = value {
        Ok(s)
    } else {
        Err(invalid())
    }
}
fn numeric(value: &Data, integer: bool) -> CommandResult<f64> {
    let n = match value {
        Data::Int(n) => *n as f64,
        Data::Float(n) => *n,
        _ => return Err(invalid()),
    };
    if !n.is_finite() || n < 0.0 || (integer && n.fract() != 0.0) {
        return Err(invalid());
    }
    Ok(n)
}

pub fn parse(source: &PublicSource, bytes: &[u8]) -> CommandResult<(Vec<PublicProfile>, usize)> {
    let contract: Contract = serde_json::from_str(CONTRACT).map_err(|_| invalid())?;
    if contract.source_id != source.id || source.url != URL || contract.areas.len() != 43 {
        return Err(invalid());
    }
    let zip = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|_| invalid())?;
    if zip.len() > 150
        || zip
            .decompressed_size()
            .is_none_or(|size| size > 16 * 1024 * 1024)
    {
        return Err(invalid());
    }
    let mut book = Xlsx::new(Cursor::new(bytes)).map_err(|_| invalid())?;
    let range = book
        .worksheet_range(&contract.sheet)
        .map_err(|_| invalid())?;
    for header in contract.headers.iter().chain(&contract.notes) {
        if text(cell(&range, header.row, header.column)?)? != header.text {
            return Err(invalid());
        }
    }
    let cfg = config()?;
    let mut profiles = Vec::new();
    let mut seen_areas = BTreeSet::new();
    let mut undated = 0;
    for spec in &contract.areas {
        if !seen_areas.insert(&spec.geography_id)
            || spec.years.len() != 3
            || text(cell(&range, spec.row, 0)?)? != spec.label
        {
            return Err(invalid());
        }
        let area = source
            .areas
            .iter()
            .find(|a| {
                a.geography_id == spec.geography_id && a.label == spec.label && a.code == spec.label
            })
            .ok_or_else(invalid)?;
        for (code, column, integer) in [("total", 1, true), ("per_1000", 7, false)] {
            let metric = cfg
                .metrics
                .iter()
                .find(|m| m.source_id == source.id && m.provider_code == code)
                .ok_or_else(invalid)?;
            if metric.frequency != "annual" || metric.connect_adjacent {
                return Err(invalid());
            }
            let mut points = Vec::new();
            let mut years = BTreeSet::new();
            for (index, expected) in spec.years.iter().enumerate() {
                let year_cell = cell(&range, spec.row, 10 + index as u32)?;
                let value_cell = cell(&range, spec.row, column + index as u32)?;
                let Some(expected) = expected else {
                    if !matches!(year_cell, Data::Empty) || !matches!(value_cell, Data::Empty) {
                        return Err(invalid());
                    }
                    undated += 1;
                    continue;
                };
                let year = numeric(year_cell, true)? as i32;
                if year != *expected || !(2010..=2022).contains(&year) || !years.insert(year) {
                    return Err(invalid());
                }
                let value = numeric(value_cell, integer)?;
                let mut notes = vec![format!("OECD HM1.1.A1 · tatsächliches Bezugsjahr {year}."),"Originaltabellen und nationale Erhebungen bzw. Schätzungen; einzelne Quellenjahre.".into()];
                match spec.geography_id.as_str() {
                    "oecd:england" => notes.push("Quellengebiet: nur England, nicht das gesamte Vereinigte Königreich.".into()),
                    "m49:196" => notes.push("Quellengebiet: von der Regierung der Republik Zypern kontrolliertes Gebiet.".into()),
                    "m49:170" => notes.push("Kolumbien: Bestandsprojektionen von DANE sind in dieser Quelle enthalten.".into()),
                    "m49:724" => notes.push("Spanien: nationale Schätzung des Wohnungsbestands.".into()),
                    _ => (),
                }
                notes.extend(contract.notes.iter().map(|n| n.text.clone()));
                points.push(PublicPoint {
                    period: year.to_string(),
                    value: Some(value.to_string()),
                    status: String::new(),
                    break_before: false,
                    notes,
                    lower_bound: None,
                    upper_bound: None,
                });
            }
            if points.is_empty() {
                return Err(invalid());
            }
            points.sort_by(|a, b| a.period.cmp(&b.period));
            profiles.push(PublicProfile {
                metric_id: metric.id.clone(),
                geography_id: area.geography_id.clone(),
                provider_area: area.code.clone(),
                provider_label: area.label.clone(),
                provider_title: area.series_titles.get(code).ok_or_else(invalid)?.clone(),
                unit: metric.unit.clone(),
                points,
            });
        }
    }
    if undated != contract.expected_undated_blocks || seen_areas.len() != source.areas.len() {
        return Err(invalid());
    }
    Ok((profiles, contract.areas.len()))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn housing_counts_ratios_and_missing_remain_distinct() {
        assert_eq!(numeric(&Data::Float(0.0), true).unwrap(), 0.0);
        assert_eq!(numeric(&Data::Float(440.912), false).unwrap(), 440.912);
        for wrong in [
            Data::Empty,
            Data::String("..".into()),
            Data::Float(-1.0),
            Data::Float(f64::INFINITY),
        ] {
            assert!(numeric(&wrong, false).is_err());
        }
        assert!(numeric(&Data::Float(4.5), true).is_err());
    }
    #[tokio::test]
    #[ignore = "Independently audited original OECD workbook; temporary SQLite cache only"]
    async fn public_housing_stock_original_roundtrip() {
        let dir =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../.tmp/atlas-remaining-40");
        let bytes = std::fs::read(dir.join("oecd-housing-stock.xlsx")).unwrap();
        let source = source("oecd-housing-stock").unwrap();
        let download = super::super::public_source::parse_download(&source, &bytes).unwrap();
        assert_eq!(download.provenance.numeric_values, 248);
        assert_eq!(download.profiles.len(), 86);
        let expected: Vec<PublicProfile> = serde_json::from_slice(
            &std::fs::read(dir.join("housing-stock-expected-profiles.json")).unwrap(),
        )
        .unwrap();
        for mut original in expected {
            let actual = download
                .profiles
                .iter()
                .find(|p| {
                    p.metric_id == original.metric_id && p.geography_id == original.geography_id
                })
                .unwrap();
            assert_eq!(actual.points.len(), original.points.len());
            for (point, expected) in actual.points.iter().zip(&mut original.points) {
                assert!(
                    (point.value.as_ref().unwrap().parse::<f64>().unwrap()
                        - expected.value.as_ref().unwrap().parse::<f64>().unwrap())
                    .abs()
                        < 1e-10
                );
                expected.value = point.value.clone(); // Same XLSX number; shortest decimal representations may differ.
            }
            assert_eq!(actual, &original);
        }
        let profile = |geo: &str, code: &str| {
            download
                .profiles
                .iter()
                .find(|p| {
                    p.geography_id == geo && p.metric_id == format!("oecd-housing-stock:{code}")
                })
                .unwrap()
        };
        assert_eq!(
            profile("m49:276", "total")
                .points
                .last()
                .unwrap()
                .value
                .as_deref(),
            Some("43084122")
        );
        assert_eq!(
            profile("m49:276", "total").points.last().unwrap().period,
            "2021"
        );
        assert_eq!(profile("m49:752", "total").points[0].period, "2017");
        assert_eq!(profile("m49:410", "total").points.len(), 1);
        assert_eq!(
            profile("oecd:england", "total")
                .points
                .last()
                .unwrap()
                .value
                .as_deref(),
            Some("24927588")
        );
        assert!(
            !download
                .profiles
                .iter()
                .any(|p| p.geography_id == "m49:826" || p.geography_id == "world")
        );
        let mut wrong = source.clone();
        wrong.areas[0].label = "Unknown country".into();
        assert!(parse(&wrong, &bytes).is_err());
        assert!(
            super::super::public_source::parse_download(&source, &bytes[..bytes.len() - 1])
                .is_err()
        );
        let saved = download.profiles.clone();
        let root = tempfile::tempdir().unwrap();
        let db = super::super::store::open(root.path()).await.unwrap();
        super::super::public_store::replace(&db, download)
            .await
            .unwrap();
        db.close().await;
        let db = super::super::store::open(root.path()).await.unwrap();
        for area in &source.areas {
            let read = super::super::public_store::read(&db, &source.id, &area.geography_id)
                .await
                .unwrap();
            for profile in saved.iter().filter(|p| p.geography_id == area.geography_id) {
                assert!(read.profiles.contains(profile));
            }
        }
        db.close().await;
        println!(
            "OECD HM1.1.A1: 43 areas, 86 profiles, all 248 source cells, actual years, England boundary and offline reopen verified."
        );
    }
}
