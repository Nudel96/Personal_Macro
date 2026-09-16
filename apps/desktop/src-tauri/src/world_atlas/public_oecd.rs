//! OECD annual wages and actual hours: retain native units, worker definitions and missing cells.
use super::{
    public_models::*,
    public_source::{decimal, valid_period},
};
use crate::errors::CommandResult;
use serde::Deserialize;
use std::collections::{BTreeMap, BTreeSet};

const CONTRACTS: &str =
    include_str!("../../../src/features/world-atlas/data/public-oecd-contracts.json");
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Contract {
    headers: Vec<String>,
    fixed_fields: BTreeMap<String, String>,
    area_labels: BTreeMap<String, String>,
    allowed_dimensions: BTreeMap<String, Vec<String>>,
}
pub fn parse(source: &PublicSource, bytes: &[u8]) -> CommandResult<(Vec<PublicProfile>, usize)> {
    let contracts: BTreeMap<String, Contract> =
        serde_json::from_str(CONTRACTS).map_err(|_| invalid())?;
    let contract = contracts.get(&source.id).ok_or_else(invalid)?;
    let cfg = config()?;
    let wages = source.id == "oecd-wages";
    if !wages && source.id != "oecd-hours" {
        return Err(invalid());
    }
    let mut reader = csv::Reader::from_reader(bytes);
    let headers = reader.headers().map_err(|_| invalid())?.clone();
    if headers
        .iter()
        .ne(contract.headers.iter().map(String::as_str))
    {
        return Err(invalid());
    }
    let positions: BTreeMap<&str, usize> =
        headers.iter().enumerate().map(|(i, k)| (k, i)).collect();
    let mut rows = 0;
    let mut seen = BTreeSet::new();
    let mut profiles: BTreeMap<(String, String), PublicProfile> = BTreeMap::new();
    for record in reader.records() {
        let r = record.map_err(|_| invalid())?;
        rows += 1;
        let get = |name: &str| {
            positions
                .get(name)
                .and_then(|i| r.get(*i))
                .ok_or_else(invalid)
        };
        for (field, expected) in &contract.fixed_fields {
            if get(field)? != expected {
                return Err(invalid());
            }
        }
        for (field, allowed) in &contract.allowed_dimensions {
            if !allowed
                .iter()
                .any(|value| value == get(field).unwrap_or("!invalid"))
            {
                return Err(invalid());
            }
        }
        let code = get("REF_AREA")?;
        let label = get("Reference area")?;
        if contract
            .area_labels
            .get(code)
            .is_none_or(|expected| expected != label)
        {
            return Err(invalid());
        }
        let period = get("TIME_PERIOD")?;
        if !valid_period(period, "annual")
            || period < source.first_period.as_str()
            || period > source.last_period.as_str()
        {
            return Err(invalid());
        }
        let value = decimal(get("OBS_VALUE")?)?;
        if value
            .as_ref()
            .is_some_and(|v| !v.parse::<f64>().is_ok_and(|n| n >= 0.0))
        {
            return Err(invalid());
        }
        let (key, metric_code, selected) = if wages {
            let unit = get("UNIT_MEASURE")?;
            let basis = get("PRICE_BASE")?;
            if get("BASE_PER")? != if basis == "Q" { "2025" } else { "" } {
                return Err(invalid());
            }
            (
                (code, unit, basis, period),
                "real_ppp",
                unit == "USD_PPP" && basis == "Q",
            )
        } else {
            let worker = get("WORKER_STATUS")?;
            ((code, worker, "", period), worker, true)
        };
        if !seen.insert((
            key.0.to_owned(),
            key.1.to_owned(),
            key.2.to_owned(),
            key.3.to_owned(),
        )) {
            return Err(invalid());
        }
        // The published OECD group has no matching Atlas source geography. Never call it world.
        if !selected || code == "OECD" {
            continue;
        }
        let area = source
            .areas
            .iter()
            .find(|a| a.code == code && a.label == label)
            .ok_or_else(invalid)?;
        let metric = cfg
            .metrics
            .iter()
            .find(|m| m.source_id == source.id && m.provider_code == metric_code)
            .ok_or_else(invalid)?;
        let title = area.series_titles.get(metric_code).ok_or_else(invalid)?;
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
                period: period.into(),
                value,
                status: get("Observation status")?.into(),
                break_before: false,
                notes: vec![],
                lower_bound: None,
                upper_bound: None,
            });
    }
    Ok((
        profiles
            .into_values()
            .map(|mut p| {
                p.points.sort_by(|a, b| a.period.cmp(&b.period));
                p
            })
            .collect(),
        rows,
    ))
}
