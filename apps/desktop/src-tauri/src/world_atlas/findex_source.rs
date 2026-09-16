use super::{catalog, findex_models::*};
use crate::errors::{CommandError, CommandResult};
use chrono::Utc;
use rust_decimal::Decimal;
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    str::FromStr,
    time::Duration,
};

const MAX_FILE: usize = 24 * 1024 * 1024;
fn invalid() -> CommandError {
    CommandError::validation(
        "Die Findex-Datei weicht von der geprüften Ausgabe ab. Der bisherige Stand bleibt erhalten.",
    )
}
fn network() -> CommandError {
    CommandError::validation(
        "Die kostenlosen Findex-Daten sind momentan nicht erreichbar. Bitte später erneut versuchen.",
    )
}
pub async fn download() -> CommandResult<FindexDownload> {
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
pub(crate) fn number(raw: &str) -> CommandResult<Option<String>> {
    if raw == "NA" {
        return Ok(None);
    }
    // The CSV also publishes ten small fractions in scientific notation.
    // Preserve the original spelling without rounding, clipping or imputation.
    if raw.is_empty()
        || raw.len() > 30
        || !raw
            .bytes()
            .all(|b| b.is_ascii_digit() || matches!(b, b'.' | b'e' | b'-'))
        || raw.starts_with('.')
        || raw.ends_with('.')
    {
        return Err(invalid());
    }
    let n = if raw.contains('e') {
        Decimal::from_scientific(raw)
    } else {
        Decimal::from_str(raw)
    }
    .map_err(|_| invalid())?;
    if !(Decimal::ZERO..=Decimal::ONE).contains(&n) {
        return Err(invalid());
    }
    Ok(Some(raw.to_owned()))
}
pub(crate) fn parse(bytes: &[u8], cfg: &FindexConfig) -> CommandResult<FindexDownload> {
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
    if reader
        .headers()
        .map_err(|_| invalid())?
        .iter()
        .ne(cfg.headers.iter().map(String::as_str))
    {
        return Err(invalid());
    }
    let indexes = cfg
        .metrics
        .iter()
        .map(|m| {
            cfg.headers
                .iter()
                .position(|f| f == &m.field)
                .map(|i| (m.field.as_str(), i))
                .ok_or_else(invalid)
        })
        .collect::<CommandResult<Vec<_>>>()?;
    let mut profiles = BTreeMap::new();
    for area in &cfg.areas {
        if catalog::geography(&area.geography_id)?.iso3 != area.iso3 {
            return Err(invalid());
        }
        if profiles
            .insert(
                area.code.as_str(),
                FindexProfile {
                    geography_id: area.geography_id.clone(),
                    provider_code: area.code.clone(),
                    provider_label: area.label.clone(),
                    points: vec![],
                },
            )
            .is_some()
        {
            return Err(invalid());
        }
    }
    let mut keys = BTreeSet::new();
    let mut group_counts = BTreeMap::<(String, String), usize>::new();
    let mut selected = 0;
    let mut numeric = 0;
    for result in reader.records() {
        let row = result.map_err(|_| invalid())?;
        let profile = profiles.get_mut(&row[1]).ok_or_else(invalid)?;
        if profile.provider_label != row[0] {
            return Err(invalid());
        }
        let year: i32 = row[2].parse().map_err(|_| invalid())?;
        if !cfg.years.contains(&year)
            || !keys.insert((
                row[1].to_string(),
                year,
                row[6].to_string(),
                row[7].to_string(),
            ))
        {
            return Err(invalid());
        }
        *group_counts
            .entry((row[6].to_string(), row[7].to_string()))
            .or_default() += 1;
        let Some(population) = cfg
            .populations
            .iter()
            .find(|p| p.group == row[6] && p.value == row[7])
        else {
            continue;
        };
        let mut values = BTreeMap::new();
        for (field, index) in &indexes {
            let value = number(&row[*index])?;
            numeric += usize::from(value.is_some());
            values.insert((*field).to_owned(), value);
        }
        profile.points.push(FindexPoint {
            year,
            population: population.id.clone(),
            values,
        });
        selected += 1;
    }
    let expected_groups = cfg
        .source_groups
        .iter()
        .map(|g| ((g.group.clone(), g.value.clone()), g.rows))
        .collect::<BTreeMap<_, _>>();
    if keys.len() != cfg.expected_rows
        || selected != cfg.expected_selected_rows
        || numeric != cfg.expected_numeric_cells
        || group_counts != expected_groups
        || profiles.values().any(|p| p.points.is_empty())
    {
        return Err(invalid());
    }
    for profile in profiles.values_mut() {
        profile
            .points
            .sort_by(|a, b| (&a.population, a.year).cmp(&(&b.population, b.year)));
    }
    Ok(FindexDownload {
        provenance: FindexProvenance {
            retrieved_at: String::new(),
            url: cfg.source_url.clone(),
            sha256: hash,
            glossary_sha256: cfg.glossary_sha256.clone(),
            release: cfg.release.clone(),
            source_row_count: keys.len(),
            selected_row_count: selected,
            numeric_cell_count: numeric,
            area_count: profiles.len(),
            recipe: cfg.recipe.clone(),
        },
        profiles: profiles.into_values().collect(),
    })
}
