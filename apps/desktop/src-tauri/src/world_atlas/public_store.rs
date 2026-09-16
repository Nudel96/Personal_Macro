use super::{catalog, public_models::*, public_source};
use crate::errors::CommandResult;
use sqlx::SqlitePool;
use std::collections::{BTreeMap, BTreeSet};

pub async fn read(
    db: &SqlitePool,
    source_id: &str,
    geography_id: &str,
) -> CommandResult<PublicResponse> {
    let source = source(source_id)?;
    let geography = catalog::geography(geography_id)?;
    let metrics = config()?
        .metrics
        .into_iter()
        .filter(|m| m.source_id == source_id)
        .collect();
    let mut tx = db.begin().await?;
    let provenance_json: Option<String> =
        sqlx::query_scalar("SELECT provenance_json FROM atlas_public_datasets WHERE id=?")
            .bind(source_id)
            .fetch_optional(&mut *tx)
            .await?;
    let raw: Vec<String> = sqlx::query_scalar("SELECT profile_json FROM atlas_public_series WHERE dataset_id=? AND geography_id=? ORDER BY metric_id")
        .bind(source_id).bind(geography_id).fetch_all(&mut *tx).await?;
    let provenance: Option<PublicProvenance> = provenance_json
        .map(|j| serde_json::from_str(&j))
        .transpose()
        .map_err(|_| invalid())?;
    let profiles: Vec<PublicProfile> = raw
        .into_iter()
        .map(|j| serde_json::from_str(&j).map_err(|_| invalid()))
        .collect::<CommandResult<_>>()?;
    if let Some(p) = &provenance
        && (p.source_id != source.id
            || p.recipe != source.recipe
            || p.sha256 != source.expected_sha256)
    {
        return Err(invalid());
    }
    tx.commit().await?;
    let status = if !source.areas.iter().any(|a| a.geography_id == geography_id) {
        "unsupported_area"
    } else if provenance.is_none() {
        "not_downloaded"
    } else if profiles
        .iter()
        .flat_map(|p| &p.points)
        .any(|p| p.value.is_some())
    {
        "available"
    } else {
        "empty"
    }
    .into();
    Ok(PublicResponse {
        source,
        geography,
        metrics,
        profiles,
        status,
        provenance,
    })
}

pub async fn replace(db: &SqlitePool, data: PublicDownload) -> CommandResult<()> {
    let source = source(&data.provenance.source_id)?;
    validate_geographies(&source)?;
    let p = &data.provenance;
    if p.url != source.url
        || p.recipe != source.recipe
        || p.sha256 != source.expected_sha256
        || p.source_rows != source.expected_rows
        || p.numeric_values != source.expected_numeric
        || p.area_count != source.areas.len()
    {
        return Err(invalid());
    }
    let cfg = config()?;
    let metrics: BTreeMap<_, _> = cfg
        .metrics
        .iter()
        .filter(|m| m.source_id == source.id)
        .map(|m| (m.id.as_str(), m))
        .collect();
    let mut seen = BTreeSet::new();
    let mut numeric = 0;
    let first = public_source::period_span(&source.first_period)
        .ok_or_else(invalid)?
        .0;
    let last = public_source::period_span(&source.last_period)
        .ok_or_else(invalid)?
        .1;
    for profile in &data.profiles {
        let metric = metrics
            .get(profile.metric_id.as_str())
            .ok_or_else(invalid)?;
        let area = source
            .areas
            .iter()
            .find(|a| a.geography_id == profile.geography_id)
            .ok_or_else(invalid)?;
        if !seen.insert((&profile.geography_id, &profile.metric_id))
            || profile.provider_area != area.code
            || profile.provider_label != area.label
            || profile.unit != metric.unit
            || area.series_titles.get(&metric.provider_code) != Some(&profile.provider_title)
            || profile.points.is_empty()
        {
            return Err(invalid());
        }
        let mut previous: Option<&str> = None;
        for point in &profile.points {
            let span = public_source::period_span(&point.period).ok_or_else(invalid)?;
            if !public_source::valid_period(&point.period, &metric.frequency)
                || span.0 < first
                || span.1 > last
                || previous.is_some_and(|p| p >= point.period.as_str())
            {
                return Err(invalid());
            }
            if let Some(value) = &point.value {
                public_source::decimal(value)?.ok_or_else(invalid)?;
                numeric += 1;
            }
            for bound in [&point.lower_bound, &point.upper_bound]
                .into_iter()
                .flatten()
            {
                public_source::decimal(bound)?.ok_or_else(invalid)?;
            }
            previous = Some(&point.period);
        }
    }
    let expected = source
        .areas
        .iter()
        .map(|a| a.series_titles.len())
        .sum::<usize>();
    if seen.len() != expected || numeric != p.numeric_values {
        return Err(invalid());
    }
    let mut tx = db.begin().await?;
    sqlx::query("INSERT INTO atlas_public_datasets(id,provenance_json,retrieved_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET provenance_json=excluded.provenance_json,retrieved_at=excluded.retrieved_at")
        .bind(&source.id).bind(serde_json::to_string(p).map_err(|_| invalid())?).bind(&p.retrieved_at).execute(&mut *tx).await?;
    sqlx::query("DELETE FROM atlas_public_series WHERE dataset_id=?")
        .bind(&source.id)
        .execute(&mut *tx)
        .await?;
    for profile in &data.profiles {
        sqlx::query("INSERT INTO atlas_public_series(dataset_id,metric_id,geography_id,profile_json) VALUES(?,?,?,?)")
            .bind(&source.id).bind(&profile.metric_id).bind(&profile.geography_id)
            .bind(serde_json::to_string(profile).map_err(|_| invalid())?).execute(&mut *tx).await?;
    }
    tx.commit().await?;
    Ok(())
}
