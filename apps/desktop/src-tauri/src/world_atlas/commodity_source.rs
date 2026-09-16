use super::commodity_models::*;
use crate::errors::{CommandError, CommandResult};
use calamine::{Data, Range, Reader, Xlsx};
use chrono::Utc;
use sha2::{Digest, Sha256};
use std::{collections::BTreeMap, io::Cursor, time::Duration};

const MAX_FILE: usize = 8 * 1024 * 1024;
fn invalid() -> CommandError {
    CommandError::validation(
        "Die Rohstoffdatei weicht von der geprüften Ausgabe ab. Der bisherige Stand bleibt erhalten.",
    )
}
fn network() -> CommandError {
    CommandError::validation(
        "Die öffentliche Rohstoffdatei ist momentan nicht erreichbar. Bitte später erneut versuchen.",
    )
}
pub async fn download() -> CommandResult<CommodityDownload> {
    let cfg = config()?;
    let client = reqwest::Client::builder()
        .tls_backend_rustls()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(90))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("PersonalMacro-Atlas/0.1")
        .build()
        .map_err(|_| network())?;
    let mut response = client.get(&cfg.url).send().await.map_err(|_| network())?;
    if !response.status().is_success()
        || response.url().as_str() != cfg.url
        || response
            .content_length()
            .is_some_and(|n| n > MAX_FILE as u64)
    {
        return Err(network());
    }
    let modified = response
        .headers()
        .get(reqwest::header::LAST_MODIFIED)
        .and_then(|v| v.to_str().ok())
        .filter(|v| v.len() <= 100)
        .map(str::to_owned);
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| network())? {
        if bytes.len() + chunk.len() > MAX_FILE {
            return Err(invalid());
        }
        bytes.extend_from_slice(&chunk);
    }
    let mut data = tokio::task::spawn_blocking(move || parse(&bytes, &cfg))
        .await
        .map_err(|_| invalid())??;
    data.provenance.retrieved_at = Utc::now().to_rfc3339();
    data.provenance.file_modified_at = modified;
    Ok(data)
}
pub(crate) fn hundredths(cell: &Data) -> CommandResult<Option<u64>> {
    let number = match cell {
        Data::Empty => return Ok(None),
        Data::String(s) if s == "…" || s == ".." => return Ok(None),
        Data::Int(n) => *n as f64,
        Data::Float(n) => *n,
        _ => return Err(invalid()),
    };
    let scaled = number * 100.;
    if !scaled.is_finite()
        || !(0. ..=1_000_000_000.).contains(&scaled)
        || (scaled - scaled.round()).abs() > 0.000_001
    {
        return Err(invalid());
    }
    Ok(Some(scaled.round() as u64))
}
fn cell(sheet: &Range<Data>, row: u32, col: u32) -> &Data {
    sheet.get_value((row, col)).unwrap_or(&Data::Empty)
}
fn check_text(sheet: &Range<Data>, row: u32, col: u32, expected: &str) -> CommandResult<()> {
    if cell(sheet, row, col) != &Data::String(expected.into()) {
        return Err(invalid());
    }
    Ok(())
}
pub(crate) fn parse(bytes: &[u8], cfg: &CommodityConfig) -> CommandResult<CommodityDownload> {
    let digest = Sha256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect::<String>();
    if bytes.len() > MAX_FILE || bytes.len() != cfg.bytes || digest != cfg.sha256 {
        return Err(invalid());
    }
    let archive = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|_| invalid())?;
    if archive.len() > 60
        || archive
            .decompressed_size()
            .is_none_or(|n| n > 40 * 1024 * 1024)
    {
        return Err(invalid());
    }
    let mut book: Xlsx<_> = Xlsx::new(Cursor::new(bytes)).map_err(|_| invalid())?;
    let mut points: Vec<_> = (cfg.first_year..=cfg.last_year)
        .map(|year| CommodityPoint {
            year,
            values: BTreeMap::new(),
        })
        .collect();
    let mut numeric = 0;
    let mut missing = 0;
    for kind in ["price", "index"] {
        for basis in ["nominal", "real"] {
            let title = format!(
                "Annual {} ({})",
                if kind == "price" { "Prices" } else { "Indices" },
                if basis == "nominal" {
                    "Nominal"
                } else {
                    "Real"
                }
            );
            let sheet = book.worksheet_range(&title).map_err(|_| invalid())?;
            check_text(
                &sheet,
                0,
                0,
                "World Bank Commodity Price Data (The Pink Sheet)",
            )?;
            check_text(&sheet, 3, 0, &cfg.source_release)?;
            let first_row = if kind == "price" { 8 } else { 9 };
            for metric in cfg.metrics.iter().filter(|m| m.kind == kind) {
                let col = u32::try_from(metric.column.checked_sub(1).ok_or_else(invalid)?)
                    .map_err(|_| invalid())?;
                let expected = if basis == "nominal" {
                    &metric.nominal_label
                } else {
                    &metric.real_label
                };
                if kind == "price" {
                    check_text(&sheet, 6, col, expected)?;
                    check_text(&sheet, 7, col, &metric.unit)?;
                } else if !(5..9)
                    .any(|row| cell(&sheet, row, col) == &Data::String(expected.clone()))
                {
                    return Err(invalid());
                }
                for (index, point) in points.iter_mut().enumerate() {
                    let row = first_row + index as u32;
                    if hundredths(cell(&sheet, row, 0))? != Some(point.year as u64 * 100) {
                        return Err(invalid());
                    }
                    let value = hundredths(cell(&sheet, row, col))?;
                    if value.is_some() {
                        numeric += 1;
                    } else {
                        missing += 1;
                    }
                    if point
                        .values
                        .insert(format!("{}:{basis}", metric.id), value)
                        .is_some()
                    {
                        return Err(invalid());
                    }
                }
            }
            if cell(&sheet, first_row + points.len() as u32, 0) != &Data::Empty {
                return Err(invalid());
            }
        }
    }
    if numeric != cfg.expected_numeric_cells || missing != cfg.expected_missing_cells {
        return Err(invalid());
    }
    Ok(CommodityDownload {
        points,
        provenance: CommodityProvenance {
            retrieved_at: Utc::now().to_rfc3339(),
            file_modified_at: None,
            url: cfg.source_url.clone(),
            file_url: cfg.url.clone(),
            sha256: digest,
            release: cfg.release.clone(),
            source_release: cfg.source_release.clone(),
            numeric_cell_count: numeric,
            missing_cell_count: missing,
            metric_count: cfg.metrics.len(),
            recipe: cfg.recipe.clone(),
        },
    })
}
