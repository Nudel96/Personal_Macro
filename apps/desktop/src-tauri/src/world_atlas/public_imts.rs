//! Reviewed IMF bilateral merchandise flows in original USD, never inferred partner shares.
use super::{
    public_gap::{metrics, point, profile},
    public_models::*,
    public_source::decimal,
};
use crate::errors::CommandResult;
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

const CONTRACTS: &str =
    include_str!("../../../src/features/world-atlas/data/public-imts-contracts.json");
pub const ACCEPT: &str = "application/vnd.sdmx.data+csv;version=2.0.0;labels=both";
pub fn contract(id: &str) -> CommandResult<Value> {
    let mut all: BTreeMap<String, Value> =
        serde_json::from_str(CONTRACTS).map_err(|_| invalid())?;
    all.remove(id).ok_or_else(invalid)
}
pub fn url(id: &str) -> CommandResult<String> {
    let c = contract(id)?;
    let partner = c["partner"].as_str().ok_or_else(invalid)?;
    if ![
        "USA", "CHN", "DEU", "GBR", "FRA", "JPN", "IND", "BRA", "SAU", "ZAF", "NGA", "AUS",
    ]
    .contains(&partner)
    {
        return Err(invalid());
    }
    Ok(format!(
        "https://api.imf.org/external/sdmx/2.1/data/IMF.STA,IMTS,1.0.0/.XG_FOB_USD+MG_CIF_USD.{partner}.A?startPeriod=1960&endPeriod=2025"
    ))
}
pub fn parse(source: &PublicSource, bytes: &[u8]) -> CommandResult<(Vec<PublicProfile>, usize)> {
    let c = contract(&source.id)?;
    if source.url != url(&source.id)? || c["accept"] != ACCEPT {
        return Err(invalid());
    }
    let mut reader = csv::Reader::from_reader(bytes);
    let headers: Vec<String> =
        serde_json::from_value(c["headers"].clone()).map_err(|_| invalid())?;
    if reader
        .headers()
        .map_err(|_| invalid())?
        .iter()
        .ne(headers.iter().map(String::as_str))
    {
        return Err(invalid());
    }
    let ms = metrics(source)?;
    let areas: BTreeMap<_, _> = source.areas.iter().map(|a| (a.code.as_str(), a)).collect();
    let mut groups: BTreeMap<(String, String), Vec<PublicPoint>> = BTreeMap::new();
    let mut seen = BTreeSet::new();
    let mut count = 0;
    for row in reader.records() {
        let r = row.map_err(|_| invalid())?;
        count += 1;
        let field = |name: &str| -> CommandResult<&str> {
            let i = headers.iter().position(|h| h == name).ok_or_else(invalid)?;
            r.get(i).ok_or_else(invalid)
        };
        let iso = field("COUNTRY")?;
        let indicator = field("INDICATOR")?;
        let valuation = match indicator {
            "XG_FOB_USD" => "FOB",
            "MG_CIF_USD" => "CIF",
            _ => return Err(invalid()),
        };
        if field("DATAFLOW")? != "IMF.STA:IMTS(1.0.0)"
            || c["partner"] != field("COUNTERPART_COUNTRY")?
            || field("FREQUENCY")? != "A"
            || field("UNIT")? != "USD"
            || field("SCALE")? != "6"
            || field("DERIVATION_TYPE")? != "M"
            || field("OVERLAP")? != "OL"
            || field("VALUATION")? != valuation
            || field("TRADE_FLOW")? != &indicator[..2]
            || c["titles"][indicator] != field("SERIES_NAME")?
            || !c["allCountries"][iso].is_string()
            || field("PUBLISHER")? != "IMF"
            || field("DEPARTMENT")? != "STA"
            || field("ACCESS_SHARING_LEVEL")? != "PUBLIC_OPEN"
            || !c["sourceCitations"]
                .as_array()
                .ok_or_else(invalid)?
                .iter()
                .any(|s| s.as_str() == field("SHORT_SOURCE_CITATION").ok())
        {
            return Err(invalid());
        }
        let year = field("TIME_PERIOD")?;
        if year.len() != 4 || !("1960"..="2025").contains(&year) {
            return Err(invalid());
        }
        let status = match field("STATUS")? {
            "" => "source_statistics",
            "e" => "estimated",
            _ => return Err(invalid()),
        };
        let value = decimal(field("OBS_VALUE")?)?.ok_or_else(invalid)?;
        if value.parse::<f64>().map_err(|_| invalid())? < 0.0 {
            return Err(invalid());
        }
        let Some(a) = areas.get(iso) else {
            if c["excludedCountries"][iso] != c["allCountries"][iso] {
                return Err(invalid());
            }
            continue;
        };
        if c["allCountries"][iso] != a.label
            || !seen.insert((iso.to_owned(), indicator.to_owned(), year.to_owned()))
        {
            return Err(invalid());
        }
        let m = ms.get(indicator).ok_or_else(invalid)?;
        let mut p = point(year.into(), Some(value), status);
        p.notes = vec![
            format!(
                "Partner: {} ({})",
                c["partnerLabel"].as_str().ok_or_else(invalid)?,
                c["partner"].as_str().ok_or_else(invalid)?
            ),
            format!("Bewertung: {valuation}"),
            format!("Quelle: {}", field("SHORT_SOURCE_CITATION")?),
        ];
        if status == "estimated" {
            p.notes.push("e: IWF-Schätzung".into());
        }
        groups
            .entry((iso.into(), m.provider_code.clone()))
            .or_default()
            .push(p);
    }
    let mut profiles = Vec::new();
    for ((iso, code), mut points) in groups {
        points.sort_by(|a, b| a.period.cmp(&b.period));
        profiles.push(profile(&ms[&code], areas[iso.as_str()], points)?);
    }
    Ok((profiles, count))
}
