use super::{catalog, innovation_models::*};
use crate::errors::{CommandError, CommandResult};
use chrono::Utc;
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    time::Duration,
};

const MAX_FILE: usize = 4 * 1024 * 1024;
fn invalid() -> CommandError {
    CommandError::validation(
        "Der WIPO-Export weicht von der geprüften Ausgabe ab. Der bisherige Stand bleibt erhalten.",
    )
}
fn network() -> CommandError {
    CommandError::validation(
        "Die öffentlichen WIPO-Daten sind momentan nicht erreichbar. Bitte später erneut versuchen.",
    )
}
async fn fetch(client: &reqwest::Client, url: &str, limit: usize) -> CommandResult<Vec<u8>> {
    // Only reviewed public URLs from the bundled catalog; no personal input or credentials.
    let mut response = client
        .get(url)
        .header(reqwest::header::ACCEPT_LANGUAGE, "en")
        .send()
        .await
        .map_err(|_| network())?;
    if !response.status().is_success()
        || response.url().as_str() != url
        || response.content_length().is_some_and(|n| n > limit as u64)
    {
        return Err(network());
    }
    let mut bytes = vec![];
    while let Some(chunk) = response.chunk().await.map_err(|_| network())? {
        if bytes.len() + chunk.len() > limit {
            return Err(invalid());
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}
pub async fn download() -> CommandResult<InnovationDownload> {
    let cfg = config()?;
    let client = reqwest::Client::builder()
        .tls_backend_rustls()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(90))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("PersonalMacro-Atlas/0.1")
        .build()
        .map_err(|_| network())?;
    let before = fetch(&client, &cfg.release_url, 1024).await?;
    if before != cfg.source_release.as_bytes() {
        return Err(invalid());
    }
    let bytes = fetch(&client, &cfg.url, MAX_FILE).await?;
    let after = fetch(&client, &cfg.release_url, 1024).await?;
    if before != after {
        return Err(invalid());
    }
    let mut data = tokio::task::spawn_blocking(move || parse(&bytes, &cfg))
        .await
        .map_err(|_| invalid())??;
    data.provenance.retrieved_at = Utc::now().to_rfc3339();
    Ok(data)
}
pub(crate) fn number(value: &str) -> CommandResult<Option<u64>> {
    if value.is_empty() {
        return Ok(None);
    }
    if !value.bytes().all(|v| v.is_ascii_digit()) {
        return Err(invalid());
    }
    let n: u64 = value.parse().map_err(|_| invalid())?;
    if n > 9_007_199_254_740_991 {
        return Err(invalid());
    }
    Ok(Some(n))
}
pub(crate) fn parse(bytes: &[u8], cfg: &InnovationConfig) -> CommandResult<InnovationDownload> {
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
    let mut lines = text.lines();
    for expected in [
        "Intellectual property right :Patent",
        "",
        "Indicator :4a- Patent publications by technology",
        "",
        &cfg.source_release,
        "",
    ] {
        if lines.next() != Some(expected) {
            return Err(invalid());
        }
    }
    let body = lines.collect::<Vec<_>>().join("\n");
    // WIPO adds exactly one empty terminal column to every row, but not the header.
    let mut reader = csv::ReaderBuilder::new()
        .flexible(true)
        .from_reader(body.as_bytes());
    let mut expected = vec![
        "Origin".to_string(),
        "Origin (Code)".into(),
        "Office".into(),
        "Field of technology".into(),
    ];
    expected.extend((cfg.first_year..=cfg.last_year).map(|y| y.to_string()));
    if reader
        .headers()
        .map_err(|_| invalid())?
        .iter()
        .ne(expected.iter().map(String::as_str))
    {
        return Err(invalid());
    }
    let mut profiles = BTreeMap::new();
    for area in &cfg.areas {
        if catalog::geography(&area.geography_id)?.iso3 != area.iso3 {
            return Err(invalid());
        }
        let points = (cfg.first_year..=cfg.last_year)
            .map(|year| InnovationPoint {
                year,
                values: cfg
                    .metrics
                    .iter()
                    .map(|m| (m.field.clone(), None))
                    .collect(),
            })
            .collect();
        if profiles
            .insert(
                area.code.clone(),
                InnovationProfile {
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
    let mut keys = BTreeSet::new();
    let mut origins = BTreeSet::new();
    let mut numeric = 0;
    let mut current_numeric = 0;
    for result in reader.records() {
        let row = result.map_err(|_| invalid())?;
        if row.len() != expected.len() + 1
            || row.get(expected.len()) != Some("")
            || row.get(2) != Some("Total")
        {
            return Err(invalid());
        }
        let code = &row[1];
        let metric = cfg
            .metrics
            .iter()
            .find(|m| m.source_label == row[3])
            .ok_or_else(invalid)?;
        if !keys.insert((code.to_string(), metric.field.clone())) {
            return Err(invalid());
        }
        origins.insert(code.to_string());
        let label = cfg
            .areas
            .iter()
            .find(|a| a.code == code)
            .map(|a| &a.label)
            .or_else(|| {
                cfg.excluded_origins
                    .iter()
                    .find(|a| a.code == code)
                    .map(|a| &a.label)
            })
            .ok_or_else(invalid)?;
        if label != &row[0] {
            return Err(invalid());
        }
        let values = row
            .iter()
            .skip(4)
            .take(expected.len() - 4)
            .map(number)
            .collect::<CommandResult<Vec<_>>>()?;
        let count = values.iter().flatten().count();
        if count == 0 {
            return Err(invalid());
        }
        numeric += count;
        if let Some(profile) = profiles.get_mut(code) {
            current_numeric += count;
            for (point, value) in profile.points.iter_mut().zip(values) {
                point.values.insert(metric.field.clone(), value);
            }
        }
    }
    let expected_origins: BTreeSet<_> = cfg
        .requested_origins
        .iter()
        .filter(|code| !cfg.absent_origins.contains(code))
        .cloned()
        .collect();
    if origins != expected_origins
        || keys.len() != cfg.expected_rows
        || numeric != cfg.expected_numeric_cells
        || current_numeric != cfg.expected_current_numeric_cells
        || profiles.values().any(|p| {
            !p.points
                .iter()
                .any(|p| p.values.values().any(Option::is_some))
        })
    {
        return Err(invalid());
    }
    Ok(InnovationDownload {
        provenance: InnovationProvenance {
            retrieved_at: String::new(),
            url: cfg.source_url.clone(),
            sha256: hash,
            release: cfg.release.clone(),
            source_release: cfg.source_release.clone(),
            source_row_count: keys.len(),
            source_numeric_cell_count: numeric,
            numeric_cell_count: current_numeric,
            area_count: profiles.len(),
            recipe: cfg.recipe.clone(),
        },
        profiles: profiles.into_values().collect(),
    })
}
