use super::{catalog, labor_models::*};
use crate::errors::{CommandError, CommandResult};
use chrono::Utc;
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    time::Duration,
};

const MAX_FILE: usize = 48 * 1024 * 1024;
fn invalid() -> CommandError {
    CommandError::validation(
        "Die ILO-Datei weicht von der geprüften Ausgabe ab. Der bisherige Stand bleibt erhalten.",
    )
}
fn network() -> CommandError {
    CommandError::validation(
        "Die öffentlichen ILO-Daten sind momentan nicht erreichbar. Bitte später erneut versuchen.",
    )
}
pub async fn download() -> CommandResult<LaborDownload> {
    let cfg = config()?;
    let client = reqwest::Client::builder()
        .tls_backend_rustls()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(120))
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
    let mut bytes = vec![];
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
    Ok(data)
}
// The published unit is thousands, with at most three decimal places. Preserve
// its exact precision as integer people; never round a changed provider format.
pub(crate) fn number(text: &str) -> CommandResult<Option<u64>> {
    if text.is_empty() {
        return Ok(None);
    }
    let (whole, fraction) = text.split_once('.').unwrap_or((text, ""));
    if whole.is_empty()
        || !whole.bytes().all(|b| b.is_ascii_digit())
        || fraction.len() > 3
        || !fraction.bytes().all(|b| b.is_ascii_digit())
        || (text.contains('.') && fraction.is_empty())
    {
        return Err(invalid());
    }
    let whole: u64 = whole.parse().map_err(|_| invalid())?;
    let fraction: u64 = format!("{fraction:0<3}").parse().map_err(|_| invalid())?;
    let value = whole
        .checked_mul(1000)
        .and_then(|n| n.checked_add(fraction))
        .ok_or_else(invalid)?;
    if value > 9_007_199_254_740_991 {
        return Err(invalid());
    }
    Ok(Some(value))
}
pub(crate) fn parse(bytes: &[u8], cfg: &LaborConfig) -> CommandResult<LaborDownload> {
    let hash = Sha256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect::<String>();
    if bytes.len() > MAX_FILE || bytes.len() != cfg.bytes || hash != cfg.sha256 {
        return Err(invalid());
    }
    let text = std::str::from_utf8(bytes)
        .map_err(|_| invalid())?
        .trim_start_matches('\u{feff}');
    let mut reader = csv::Reader::from_reader(text.as_bytes());
    let expected = [
        "ref_area",
        "ref_area.label",
        "source",
        "source.label",
        "indicator",
        "indicator.label",
        "sex",
        "sex.label",
        "classif1",
        "classif1.label",
        "time",
        "obs_value",
        "obs_status",
        "obs_status.label",
    ];
    if reader.headers().map_err(|_| invalid())?.iter().ne(expected) {
        return Err(invalid());
    }
    let mut fields = cfg
        .metrics
        .iter()
        .map(|m| (m.field.clone(), m.source_label.clone()))
        .collect::<BTreeMap<_, _>>();
    fields.insert(cfg.total_field.clone(), cfg.total_label.clone());
    let mut profiles = BTreeMap::new();
    for area in &cfg.areas {
        if catalog::geography(&area.geography_id)?.iso3 != area.iso3 {
            return Err(invalid());
        }
        let points = (cfg.first_year..=cfg.last_year)
            .map(|year| LaborPoint {
                year,
                values: fields.keys().map(|f| (f.clone(), None)).collect(),
                flags: BTreeMap::new(),
            })
            .collect();
        if profiles
            .insert(
                area.code.clone(),
                LaborProfile {
                    geography_id: area.geography_id.clone(),
                    provider_code: area.code.clone(),
                    provider_label: area.label.clone(),
                    points,
                },
            )
            .is_some()
        {
            return Err(invalid());
        }
    }
    let areas = cfg
        .areas
        .iter()
        .map(|a| (a.code.as_str(), (a.label.as_str(), a.source.as_str())))
        .chain(
            cfg.excluded_areas
                .iter()
                .map(|a| (a.code.as_str(), (a.label.as_str(), a.source.as_str()))),
        )
        .collect::<BTreeMap<_, _>>();
    let mut keys = BTreeSet::new();
    let mut seen = BTreeSet::new();
    let mut numeric = 0;
    let mut current_numeric = 0;
    for result in reader.records() {
        let row = result.map_err(|_| invalid())?;
        let code = &row[0];
        let field = &row[8];
        if areas.get(code) != Some(&(row[1].as_ref(), row[2].as_ref()))
            || row[3] != *"ILO - Modelled Estimates"
            || row[4] != *"EMP_2EMP_SEX_ECO_NB"
            || row[5] != cfg.source_release
            || row[6] != *"SEX_T"
            || row[7] != *"Total"
            || fields.get(field).map(String::as_str) != Some(&row[9])
            || !matches!((&row[12], &row[13]), ("", "") | ("A", "Adjusted"))
        {
            return Err(invalid());
        }
        let year: i32 = row[10].parse().map_err(|_| invalid())?;
        if !(cfg.first_year..=cfg.last_year).contains(&year)
            || !keys.insert((code.to_string(), field.to_string(), year))
        {
            return Err(invalid());
        }
        seen.insert(code.to_string());
        let value = number(&row[11])?;
        numeric += usize::from(value.is_some());
        if let Some(profile) = profiles.get_mut(code) {
            current_numeric += usize::from(value.is_some());
            let point = &mut profile.points[(year - cfg.first_year) as usize];
            point.values.insert(field.to_string(), value);
            point.flags.insert(field.to_string(), row[12].to_string());
        }
    }
    if seen != areas.keys().map(|s| s.to_string()).collect()
        || keys.len() != cfg.expected_rows
        || numeric != cfg.expected_numeric_cells
        || current_numeric != cfg.expected_current_numeric_cells
    {
        return Err(invalid());
    }
    for profile in profiles.values() {
        for point in &profile.points {
            if let Some(total) = point.values[&cfg.total_field]
                && point.values.values().flatten().any(|v| *v > total)
            {
                return Err(invalid());
            }
        }
    }
    Ok(LaborDownload {
        profiles: profiles.into_values().collect(),
        provenance: LaborProvenance {
            retrieved_at: String::new(),
            url: cfg.source_url.clone(),
            sha256: hash,
            release: cfg.release.clone(),
            source_release: cfg.source_release.clone(),
            source_row_count: keys.len(),
            source_numeric_cell_count: numeric,
            numeric_cell_count: current_numeric,
            area_count: cfg.areas.len(),
            recipe: cfg.recipe.clone(),
        },
    })
}
