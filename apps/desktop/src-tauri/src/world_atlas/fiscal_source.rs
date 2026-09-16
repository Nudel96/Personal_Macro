use super::{catalog, fiscal_models::*};
use crate::errors::{CommandError, CommandResult};
use calamine::{Data, Reader, Xlsx};
use chrono::Utc;
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    io::Cursor,
    time::Duration,
};

const MAX_FILE: usize = 4 * 1024 * 1024;
fn invalid() -> CommandError {
    CommandError::validation(
        "Die IMF-Arbeitsmappe weicht von der geprüften Ausgabe ab. Der bisherige Stand bleibt erhalten.",
    )
}
fn network() -> CommandError {
    CommandError::validation(
        "Die öffentliche IMF-Datei im OWID-Archiv ist momentan nicht erreichbar. Bitte später erneut versuchen.",
    )
}
pub async fn download() -> CommandResult<FiscalDownload> {
    let cfg = config()?;
    // A public, content-addressed OWID snapshot of the unmodified IMF workbook.
    // No credentials, redirect, provider fallback or journal data are involved.
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
    let digest = Sha256::digest(&bytes)
        .iter()
        .map(|v| format!("{v:02x}"))
        .collect::<String>();
    if bytes.len() != cfg.file_size || digest != cfg.sha256 {
        return Err(invalid());
    }
    let mut data = tokio::task::spawn_blocking(move || parse(&bytes, &cfg))
        .await
        .map_err(|_| invalid())??;
    data.provenance.sha256 = digest;
    data.provenance.retrieved_at = Utc::now().to_rfc3339();
    data.provenance.file_modified_at = modified;
    Ok(data)
}
fn number(cell: &Data) -> CommandResult<Option<f64>> {
    match cell {
        Data::Empty => Ok(None),
        Data::Int(n) => Ok(Some(*n as f64)),
        Data::Float(n) if n.is_finite() => Ok(Some(*n)),
        _ => Err(invalid()),
    }
}
fn text(cell: &Data) -> CommandResult<&str> {
    match cell {
        Data::String(value) => Ok(value),
        _ => Err(invalid()),
    }
}
fn scope(cell: &Data) -> CommandResult<u8> {
    match number(cell)? {
        Some(0.) => Ok(0),
        Some(1.) => Ok(1),
        _ => Err(invalid()),
    }
}
fn point(row: &[Data], cfg: &Config) -> CommandResult<FiscalPoint> {
    if row.len() != cfg.headers.len() {
        return Err(invalid());
    }
    let year = number(&row[3])?.ok_or_else(invalid)?;
    if year.fract() != 0. || year < cfg.first_year as f64 || year > cfg.last_year as f64 {
        return Err(invalid());
    }
    let mut values = BTreeMap::new();
    for (index, key) in cfg.headers.iter().enumerate().skip(6) {
        let value = number(&row[index])?;
        if matches!(key.as_str(), "rev" | "exp" | "ie" | "prim_exp" | "d")
            && value.is_some_and(|n| n < 0.)
        {
            return Err(invalid());
        }
        // Large genuine published ratios and negative balances/rates are retained.
        values.insert(key.clone(), value);
    }
    Ok(FiscalPoint {
        year: year as i32,
        budget_scope: scope(&row[4])?,
        debt_scope: scope(&row[5])?,
        values,
    })
}
pub(crate) fn parse(bytes: &[u8], cfg: &Config) -> CommandResult<FiscalDownload> {
    if bytes.len() > MAX_FILE {
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
    let mut workbook: Xlsx<_> = Xlsx::new(Cursor::new(bytes)).map_err(|_| invalid())?;
    if workbook.sheet_names() != [cfg.sheet.clone()] {
        return Err(invalid());
    }
    let range = workbook
        .worksheet_range(&cfg.sheet)
        .map_err(|_| invalid())?;
    if range.height() != cfg.row_count + 1 || range.width() != cfg.headers.len() {
        return Err(invalid());
    }
    let mut rows = range.rows();
    if rows
        .next()
        .ok_or_else(invalid)?
        .iter()
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
    let mut areas: BTreeMap<String, FiscalProfile> = BTreeMap::new();
    let mut labels: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    let mut numeric = 0;
    for row in rows {
        let iso = text(&row[1])?;
        let area = identities.get(iso).ok_or_else(invalid)?;
        let label = text(&row[0])?;
        if !area.provider_labels.iter().any(|n| n == label)
            || number(&row[2])? != Some(area.ifs as f64)
            || geographies.get(&area.geography_id).map(String::as_str) != Some(iso)
        {
            return Err(invalid());
        }
        labels.entry(iso.into()).or_default().insert(label.into());
        let p = point(row, cfg)?;
        numeric += p.values.values().filter(|v| v.is_some()).count();
        areas
            .entry(iso.into())
            .or_insert_with(|| FiscalProfile {
                geography_id: area.geography_id.clone(),
                provider_code: iso.into(),
                provider_labels: area.provider_labels.clone(),
                points: vec![],
            })
            .points
            .push(p);
    }
    if areas.len() != cfg.areas.len() {
        return Err(invalid());
    }
    for (code, profile) in areas.iter_mut() {
        let area = identities[code.as_str()];
        profile.points.sort_by_key(|p| p.year);
        if profile.points.len() != area.row_count
            || profile
                .points
                .iter()
                .map(|p| p.year)
                .collect::<BTreeSet<_>>()
                != (area.first_row_year..=area.last_row_year).collect()
            || labels[code] != area.provider_labels.iter().cloned().collect()
        {
            return Err(invalid());
        }
    }
    Ok(FiscalDownload {
        profiles: areas.into_values().collect(),
        provenance: FiscalProvenance {
            retrieved_at: String::new(),
            file_modified_at: None,
            url: cfg.url.clone(),
            original_url: cfg.original_url.clone(),
            sha256: String::new(),
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
    fn world_atlas_fiscal_missing_scopes_years_and_extremes() {
        let cfg = config().unwrap();
        let mut row = vec![Data::Empty; 14];
        row[3] = Data::Int(2024);
        row[4] = Data::Int(1);
        row[5] = Data::Int(0);
        row[7] = Data::Float(594.769786905096);
        row[8] = Data::Int(0);
        row[10] = Data::Float(-549.8397374315783);
        row[12] = Data::Float(-144.975278194573);
        let result = point(&row, &cfg).unwrap();
        assert_eq!(result.values["rev"], None);
        assert_eq!(result.values["ie"], Some(0.));
        assert_eq!(result.values["exp"], Some(594.769786905096));
        assert_eq!(result.values["pb"], Some(-549.8397374315783));
        assert_eq!(result.budget_scope, 1);
        assert_eq!(result.debt_scope, 0);
        row[4] = Data::Empty;
        assert!(point(&row, &cfg).is_err());
        row[4] = Data::Int(2);
        assert!(point(&row, &cfg).is_err());
        row[4] = Data::Int(1);
        row[3] = Data::Int(2025);
        assert!(point(&row, &cfg).is_err());
        row[3] = Data::Float(2024.5);
        assert!(point(&row, &cfg).is_err());
        row[3] = Data::Int(2024);
        row[6] = Data::Float(-1.);
        assert!(point(&row, &cfg).is_err());
        assert!(number(&Data::Float(f64::NAN)).is_err());
        assert!(number(&Data::String("0".into())).is_err());
    }
}
