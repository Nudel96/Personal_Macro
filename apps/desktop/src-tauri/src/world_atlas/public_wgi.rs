//! Revised WGI absolute scores, with the original 90% uncertainty bounds.
use super::public_models::*;
use crate::errors::CommandResult;
use calamine::{Data, Reader, Xlsx};
use serde::Deserialize;
use std::{
    collections::{BTreeMap, BTreeSet},
    io::Cursor,
};

const CONTRACT: &str =
    include_str!("../../../src/features/world-atlas/data/public-wgi-contract.json");
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Contract {
    headers: Vec<String>,
    area_labels: BTreeMap<String, String>,
    dimensions: Vec<String>,
    excluded_area: String,
}
fn text(cell: &Data) -> CommandResult<&str> {
    match cell {
        Data::String(s) => Ok(s),
        _ => Err(invalid()),
    }
}
fn number(cell: &Data) -> CommandResult<f64> {
    match cell {
        Data::Int(n) => Ok(*n as f64),
        Data::Float(n) if n.is_finite() => Ok(*n),
        _ => Err(invalid()),
    }
}
pub fn parse(source: &PublicSource, bytes: &[u8]) -> CommandResult<(Vec<PublicProfile>, usize)> {
    let contract: Contract = serde_json::from_str(CONTRACT).map_err(|_| invalid())?;
    let archive = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|_| invalid())?;
    if archive.len() > 100
        || archive
            .decompressed_size()
            .is_none_or(|n| n > 128 * 1024 * 1024)
    {
        return Err(invalid());
    }
    let mut book = Xlsx::new(Cursor::new(bytes)).map_err(|_| invalid())?;
    if book.sheet_names() != contract.dimensions {
        return Err(invalid());
    }
    let cfg = config()?;
    let mut profiles: BTreeMap<(String, String), PublicProfile> = BTreeMap::new();
    let mut seen = BTreeSet::new();
    let mut count = 0;
    for dim in &contract.dimensions {
        let range = book.worksheet_range(dim).map_err(|_| invalid())?;
        let mut rows = range.rows();
        let header = rows.next().ok_or_else(invalid)?;
        if header.len() != contract.headers.len()
            || header
                .iter()
                .zip(&contract.headers)
                .any(|(cell, expected)| !text(cell).is_ok_and(|s| s == expected))
        {
            return Err(invalid());
        }
        for row in rows {
            count += 1;
            if row.len() != contract.headers.len() {
                return Err(invalid());
            }
            let code = text(&row[2])?;
            let label = text(&row[1])?;
            let year = number(&row[5])?;
            if year.fract() != 0.0
                || !(1996.0..=2024.0).contains(&year)
                || text(&row[6])? != dim
                || text(&row[0])? != format!("{code}{dim}{}", year as i32)
                || contract
                    .area_labels
                    .get(code)
                    .is_none_or(|expected| expected != label)
                || !seen.insert((code.to_owned(), dim.clone(), year as i32))
            {
                return Err(invalid());
            }
            let sources = number(&row[7])?;
            if sources.fract() != 0.0 || !(1.0..=35.0).contains(&sources) {
                return Err(invalid());
            }
            for cell in &row[8..16] {
                number(cell)?;
            }
            let score = number(&row[12])?;
            let lower = number(&row[14])?;
            let upper = number(&row[15])?;
            if lower < 0.0
                || lower > score
                || score > upper
                || upper > 100.0
                || number(&row[9])? < 0.0
                || number(&row[13])? < 0.0
            {
                return Err(invalid());
            }
            if code == contract.excluded_area {
                continue;
            } // Former Netherlands Antilles are never spliced into successor states.
            let area = source
                .areas
                .iter()
                .find(|a| a.code == code && a.label == label)
                .ok_or_else(invalid)?;
            let metric = cfg
                .metrics
                .iter()
                .find(|m| m.source_id == source.id && m.provider_code == *dim)
                .ok_or_else(invalid)?;
            let title = area.series_titles.get(dim).ok_or_else(invalid)?;
            profiles
                .entry((area.geography_id.clone(), metric.id.clone()))
                .or_insert_with(|| PublicProfile {
                    metric_id: metric.id.clone(),
                    geography_id: area.geography_id.clone(),
                    provider_area: code.into(),
                    provider_label: label.into(),
                    provider_title: title.clone(),
                    unit: metric.unit.clone(),
                    points: vec![],
                })
                .points
                .push(PublicPoint {
                    period: (year as i32).to_string(),
                    value: Some(score.to_string()),
                    status: "WGI perception estimate".into(),
                    break_before: false,
                    notes: vec!["Veröffentlichtes 90%-Unsicherheitsintervall".into()],
                    lower_bound: Some(lower.to_string()),
                    upper_bound: Some(upper.to_string()),
                });
        }
    }
    Ok((
        profiles
            .into_values()
            .map(|mut p| {
                p.points.sort_by(|a, b| a.period.cmp(&b.period));
                p
            })
            .collect(),
        count,
    ))
}
