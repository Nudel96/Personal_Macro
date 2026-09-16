use super::{catalog, households_models::*};
use crate::errors::{CommandError, CommandResult};
use calamine::{Data, Reader, Xlsx};
use chrono::Utc;
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    io::Cursor,
    time::Duration,
};

const MAX_FILE: usize = 2 * 1024 * 1024;
fn invalid() -> CommandError {
    CommandError::validation(
        "Die UN-Haushaltsdatei weicht von der geprüften Ausgabe ab. Der bisherige Stand bleibt erhalten.",
    )
}
fn network() -> CommandError {
    CommandError::validation(
        "Die öffentliche UN-Haushaltsdatei ist momentan nicht erreichbar. Bitte später erneut versuchen.",
    )
}
pub async fn download() -> CommandResult<HouseholdsDownload> {
    let cfg = config()?;
    // Fixed public workbook. No keys, redirects, uploads or substitute providers.
    let client = reqwest::Client::builder()
        .tls_backend_rustls()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(45))
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
fn text(cell: &Data) -> CommandResult<&str> {
    match cell {
        Data::String(s) if !s.is_empty() && s.len() <= 2000 => Ok(s),
        _ => Err(invalid()),
    }
}
fn number(cell: &Data) -> CommandResult<Option<f64>> {
    let value = match cell {
        Data::String(s) if s == ".." => return Ok(None),
        Data::String(s)
            if !s.is_empty()
                && s.len() <= 24
                && s.bytes().all(|b| b.is_ascii_digit() || b == b'.') =>
        {
            s.parse::<f64>().map_err(|_| invalid())?
        }
        Data::Int(n) => *n as f64,
        Data::Float(n) => *n,
        _ => return Err(invalid()),
    };
    if !value.is_finite() || value < 0. {
        return Err(invalid());
    }
    Ok(Some(value))
}
fn integer(cell: &Data) -> CommandResult<i32> {
    let n = number(cell)?.ok_or_else(invalid)?;
    if n.fract() != 0. || n > i32::MAX as f64 {
        return Err(invalid());
    }
    Ok(n as i32)
}
fn observation(
    row: &[Data],
    source_row: usize,
    cfg: &Config,
) -> CommandResult<HouseholdObservation> {
    if row.len() < cfg.headers.len()
        || row
            .iter()
            .skip(cfg.headers.len())
            .any(|c| *c != Data::Empty)
    {
        return Err(invalid());
    }
    let year = integer(&row[8])?;
    if !(cfg.first_year..=cfg.last_year).contains(&year) {
        return Err(invalid());
    }
    let category = text(&row[6])?;
    if !cfg.source_categories.iter().any(|s| s == category) {
        return Err(invalid());
    }
    let id = integer(&row[7])?.to_string();
    let mut values = BTreeMap::new();
    for metric in &cfg.metrics {
        let value = number(&row[metric.column - 1])?;
        let max = if metric.unit == "percent" { 100. } else { 30. };
        if value.is_some_and(|v| v > max) {
            return Err(invalid());
        }
        values.insert(metric.id.clone(), value);
    }
    Ok(HouseholdObservation {
        record_id: format!("unhh2026:{source_row}"),
        source_row,
        year,
        source_category: category.into(),
        source_catalog_id: id.clone(),
        source_name: text(&row[9])?.into(),
        unweighted: category == "MICS" && cfg.unweighted_mics_catalog_ids.contains(&id),
        values,
    })
}
pub(crate) fn parse(bytes: &[u8], cfg: &Config) -> CommandResult<HouseholdsDownload> {
    let digest = Sha256::digest(bytes)
        .iter()
        .map(|v| format!("{v:02x}"))
        .collect::<String>();
    if bytes.len() > MAX_FILE || bytes.len() != cfg.file_size || digest != cfg.sha256 {
        return Err(invalid());
    }
    let archive = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|_| invalid())?;
    if archive.len() > 100
        || archive
            .decompressed_size()
            .is_none_or(|n| n > 32 * 1024 * 1024)
    {
        return Err(invalid());
    }
    let mut book: Xlsx<_> = Xlsx::new(Cursor::new(bytes)).map_err(|_| invalid())?;
    if book.sheet_names() != cfg.sheets {
        return Err(invalid());
    }
    let range = book.worksheet_range(&cfg.sheet).map_err(|_| invalid())?;
    if range.start() != Some((0, 0))
        || range.height() != cfg.row_count + 5
        || range.width() < cfg.headers.len()
    {
        return Err(invalid());
    }
    let header = range.rows().nth(4).ok_or_else(invalid)?;
    if header
        .iter()
        .take(49)
        .map(text)
        .collect::<CommandResult<Vec<_>>>()?
        != cfg.headers.iter().map(String::as_str).collect::<Vec<_>>()
    {
        return Err(invalid());
    }
    let geographies: BTreeMap<_, _> = catalog::catalog()?
        .geographies
        .into_iter()
        .map(|a| (a.id, a.iso3))
        .collect();
    let identities: BTreeMap<_, _> = cfg.areas.iter().map(|a| (a.code.as_str(), a)).collect();
    let mut profiles: BTreeMap<String, HouseholdsProfile> = BTreeMap::new();
    let mut records = BTreeSet::new();
    let mut numeric = 0;
    let mut unweighted = 0;
    for (index, row) in range.rows().enumerate().skip(5) {
        let code = text(&row[2])?;
        let area = identities.get(code).ok_or_else(invalid)?;
        if integer(&row[1])? != area.location_id
            || !area
                .provider_labels
                .iter()
                .any(|s| s == text(&row[0]).unwrap_or(""))
            || geographies.get(&area.geography_id).map(String::as_str) != Some(code)
        {
            return Err(invalid());
        }
        let p = observation(row, index + 1, cfg)?;
        // Preserve all sources for a country/year, including DYB and IPUMS sharing a catalog ID.
        if !records.insert((p.source_category.clone(), p.source_catalog_id.clone())) {
            return Err(invalid());
        }
        numeric += p.values.values().filter(|v| v.is_some()).count();
        unweighted += usize::from(p.unweighted);
        profiles
            .entry(code.into())
            .or_insert_with(|| HouseholdsProfile {
                geography_id: area.geography_id.clone(),
                provider_code: code.into(),
                provider_labels: area.provider_labels.clone(),
                observations: vec![],
            })
            .observations
            .push(p);
    }
    if profiles.len() != cfg.areas.len()
        || numeric != cfg.numeric_cell_count
        || unweighted != cfg.unweighted_mics_catalog_ids.len()
    {
        return Err(invalid());
    }
    for (code, profile) in &mut profiles {
        let area = identities[code.as_str()];
        profile.observations.sort_by_key(|p| (p.year, p.source_row));
        if profile.observations.len() != area.row_count
            || profile
                .observations
                .iter()
                .map(|p| p.year)
                .collect::<BTreeSet<_>>()
                != area.years.iter().copied().collect()
        {
            return Err(invalid());
        }
    }
    Ok(HouseholdsDownload {
        profiles: profiles.into_values().collect(),
        provenance: HouseholdsProvenance {
            retrieved_at: String::new(),
            file_modified_at: None,
            url: cfg.url.clone(),
            sha256: digest,
            release: cfg.release.clone(),
            source_row_count: cfg.row_count,
            numeric_cell_count: numeric,
            area_count: cfg.areas.len(),
            recipe: cfg.recipe.clone(),
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn world_atlas_households_missing_zero_bounds_and_sample_flags() {
        let cfg = config().unwrap();
        let mut row = vec![Data::String("..".into()); 49];
        row[6] = Data::String("MICS".into());
        row[7] = Data::Int(1912);
        row[8] = Data::String("2000".into());
        row[9] = Data::String("Source description".into());
        row[10] = Data::String("4.38".into());
        row[11] = Data::String("0.00".into());
        let p = observation(&row, 6, &cfg).unwrap();
        assert!(p.unweighted);
        assert_eq!(p.values["averageSize"], Some(4.38));
        assert_eq!(p.values["size1"], Some(0.));
        assert_eq!(p.values["size2to3"], None);
        row[6] = Data::String("DYB".into());
        assert!(!observation(&row, 6, &cfg).unwrap().unweighted);
        row[11] = Data::Float(101.);
        assert!(observation(&row, 6, &cfg).is_err());
        for bad in [
            Data::Empty,
            Data::Float(f64::NAN),
            Data::Float(-1.),
            Data::String("nan".into()),
            Data::String("1e2".into()),
        ] {
            assert!(number(&bad).is_err());
        }
        assert!(integer(&Data::Float(2000.5)).is_err());
        assert!(parse(b"changed source", &cfg).is_err());
    }
}
