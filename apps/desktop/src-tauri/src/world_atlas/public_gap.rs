//! Additional IMF/ILO/ICP sources. Preserve original decimals and source identities.
use super::{public_models::*, public_source::decimal};
use crate::errors::CommandResult;
use calamine::{Data, Reader, Xlsx};
use regex::Regex;
use serde::Deserialize;
use serde_json::{Value, value::RawValue};
use std::{
    collections::{BTreeMap, BTreeSet},
    io::{Cursor, Read},
};

const CONTRACTS: &str =
    include_str!("../../../src/features/world-atlas/data/public-gap-contracts.json");
pub const HOURS_URL: &str = "https://rplumber.ilo.org/data/indicator?id=HOW_TEMP_SEX_NB_A&sex=SEX_T&format=.csv&type=both&timefrom=1976&timeto=2024";
pub const WAGE_URL: &str = "https://www.ilo.org/media/627781/download";
pub const ICP_URL: &str = "https://api.worldbank.org/v2/sources/90/country/all/series/9060000/classification/PX.WL;AICZS;ZS;PCAP.PP/time/YR2017;YR2021?format=json&per_page=20000";

pub fn contract(id: &str) -> CommandResult<Value> {
    let mut contracts: BTreeMap<String, Value> =
        serde_json::from_str(CONTRACTS).map_err(|_| invalid())?;
    contracts.remove(id).ok_or_else(invalid)
}
pub fn url(id: &str) -> CommandResult<String> {
    let code = match id {
        "imf-gdd-pvd_ls" => "PVD_LS",
        "imf-gdd-hh_ls" => "HH_LS",
        "imf-gdd-nfc_ls" => "NFC_LS",
        "imf-gdd-privatedebt_all" => "Privatedebt_all",
        "imf-gdd-hh_all" => "HH_ALL",
        "imf-gdd-nfc_all" => "NFC_ALL",
        "ilo-real-wage-growth" => return Ok(WAGE_URL.into()),
        "ilo-weekly-hours" => return Ok(HOURS_URL.into()),
        "worldbank-icp-housing" => return Ok(ICP_URL.into()),
        _ => return Err(invalid()),
    };
    Ok(format!(
        "https://www.imf.org/external/datamapper/api/v1/{code}"
    ))
}
pub fn metrics(source: &PublicSource) -> CommandResult<BTreeMap<String, PublicMetric>> {
    Ok(config()?
        .metrics
        .into_iter()
        .filter(|m| m.source_id == source.id)
        .map(|m| (m.provider_code.clone(), m))
        .collect())
}
pub fn point(period: String, value: Option<String>, status: &str) -> PublicPoint {
    PublicPoint {
        period,
        value,
        status: status.into(),
        break_before: false,
        notes: vec![],
        lower_bound: None,
        upper_bound: None,
    }
}
pub fn profile(
    metric: &PublicMetric,
    area: &PublicArea,
    points: Vec<PublicPoint>,
) -> CommandResult<PublicProfile> {
    Ok(PublicProfile {
        metric_id: metric.id.clone(),
        geography_id: area.geography_id.clone(),
        provider_area: area.code.clone(),
        provider_label: area.label.clone(),
        provider_title: area
            .series_titles
            .get(&metric.provider_code)
            .cloned()
            .ok_or_else(invalid)?,
        unit: metric.unit.clone(),
        points,
    })
}
fn raw_number(value: Option<Box<RawValue>>) -> CommandResult<Option<String>> {
    let Some(value) = value else { return Ok(None) };
    decimal(value.get())
}

type ImfYears = BTreeMap<String, Option<Box<RawValue>>>;
#[derive(Deserialize)]
struct ImfData {
    values: BTreeMap<String, BTreeMap<String, ImfYears>>,
    api: BTreeMap<String, String>,
}
pub fn parse_imf(
    source: &PublicSource,
    bytes: &[u8],
) -> CommandResult<(Vec<PublicProfile>, usize)> {
    let c = contract(&source.id)?;
    let code = c["code"].as_str().ok_or_else(invalid)?;
    let mut data: ImfData = serde_json::from_slice(bytes).map_err(|_| invalid())?;
    if source.url != url(&source.id)?
        || data.values.len() != 1
        || data.api.get("version").map(String::as_str) != Some("1")
        || data.api.get("output-method").map(String::as_str) != Some("json")
        || c["metadata"]["dataset"] != "GDD"
        || c["metadata"]["unit"] != "Percent of GDP"
    {
        return Err(invalid());
    }
    let values = data.values.remove(code).ok_or_else(invalid)?;
    let ms = metrics(source)?;
    let m = ms.get(code).ok_or_else(invalid)?;
    let areas: BTreeMap<_, _> = source.areas.iter().map(|a| (a.code.as_str(), a)).collect();
    let mut result = Vec::new();
    let mut count = 0;
    for (iso, years) in values {
        let a = areas.get(iso.as_str()).ok_or_else(invalid)?;
        if a.series_titles.get(code).map(String::as_str) != c["metadata"]["label"].as_str() {
            return Err(invalid());
        }
        let mut points = Vec::new();
        for (year, val) in years {
            let n = raw_number(val)?;
            if year.len() != 4
                || !("1950"..="2024").contains(&year.as_str())
                || n.as_ref()
                    .is_some_and(|v| v.parse::<f64>().is_ok_and(|n| n < 0.0))
            {
                return Err(invalid());
            }
            points.push(point(year, n, "source_statistics_with_estimates"));
            count += 1;
        }
        result.push(profile(m, a, points)?);
    }
    Ok((result, count))
}

#[derive(Deserialize)]
struct IcpVariable {
    concept: String,
    id: String,
    value: String,
}
#[derive(Deserialize)]
struct IcpRow {
    variable: Vec<IcpVariable>,
    value: Option<Box<RawValue>>,
}
#[derive(Deserialize)]
struct IcpSource {
    id: String,
    name: String,
    data: Vec<IcpRow>,
}
#[derive(Deserialize)]
struct IcpData {
    page: usize,
    pages: usize,
    total: usize,
    lastupdated: String,
    source: IcpSource,
}
pub fn parse_icp(
    source: &PublicSource,
    bytes: &[u8],
) -> CommandResult<(Vec<PublicProfile>, usize)> {
    let c = contract(&source.id)?;
    let data: IcpData = serde_json::from_slice(bytes).map_err(|_| invalid())?;
    if source.url != ICP_URL
        || data.page != 1
        || data.pages != 1
        || data.source.id != "90"
        || data.source.name != "ICP 2021"
        || c["lastUpdated"] != data.lastupdated
        || data.total != data.source.data.len()
    {
        return Err(invalid());
    }
    let areas: BTreeMap<_, _> = source.areas.iter().map(|a| (a.code.as_str(), a)).collect();
    let ms = metrics(source)?;
    let mut groups: BTreeMap<(String, String), Vec<PublicPoint>> = BTreeMap::new();
    let mut seen = BTreeSet::new();
    for row in data.source.data {
        let vars: BTreeMap<_, _> = row
            .variable
            .iter()
            .map(|v| (v.concept.as_str(), v))
            .collect();
        if vars.len() != 4 || row.variable.len() != 4 {
            return Err(invalid());
        }
        let get = |key| vars.get(key).copied().ok_or_else(invalid);
        let country = get("Country")?;
        let time = get("Time")?;
        let series = get("Series")?;
        let cls = get("Classification")?;
        let a = areas.get(country.id.as_str()).ok_or_else(invalid)?;
        if a.label != country.value
            || c["seriesId"] != series.id
            || c["seriesTitle"] != series.value
            || c["classifications"][&cls.id] != cls.value
            || !ms.contains_key(&cls.id)
            || !["2017", "2021"].contains(&time.value.as_str())
            || time.id != format!("YR{}", time.value)
            || !seen.insert((country.id.clone(), cls.id.clone(), time.value.clone()))
        {
            return Err(invalid());
        }
        let n = raw_number(row.value)?;
        if n.as_ref()
            .is_some_and(|v| v.parse::<f64>().is_ok_and(|n| n < 0.0))
        {
            return Err(invalid());
        }
        groups
            .entry((country.id.clone(), cls.id.clone()))
            .or_default()
            .push(point(time.value.clone(), n, "estimated"));
    }
    let mut profiles = vec![];
    for ((country, code), mut points) in groups {
        points.sort_by(|a, b| a.period.cmp(&b.period));
        profiles.push(profile(
            ms.get(&code).ok_or_else(invalid)?,
            areas[country.as_str()],
            points,
        )?);
    }
    Ok((profiles, data.total))
}

/// XLSX number text, before a floating-point conversion can change a source digit.
pub fn original_numbers(xml: &str) -> CommandResult<BTreeMap<String, String>> {
    if xml.len() > 4 * 1024 * 1024 || xml.contains("<!DOCTYPE") || xml.contains("<!ENTITY") {
        return Err(invalid());
    }
    let cells = Regex::new(r#"(?s)<c\b([^>]*)>(.*?)</c>"#).map_err(|_| invalid())?;
    let address = Regex::new(r#"(?:^|\s)r="([A-Z]+[0-9]+)""#).map_err(|_| invalid())?;
    let number = Regex::new(r"^<v>([-+0-9.eE]+)</v>$").map_err(|_| invalid())?;
    let mut out = BTreeMap::new();
    for c in cells.captures_iter(xml) {
        if c[1].contains("t=") {
            continue;
        }
        if let Some(n) = number.captures(&c[2]) {
            let a = address.captures(&c[1]).ok_or_else(invalid)?;
            decimal(&n[1])?;
            if out.insert(a[1].into(), n[1].into()).is_some() {
                return Err(invalid());
            }
        }
    }
    Ok(out)
}
fn column(mut one_based: usize) -> String {
    let mut s = String::new();
    while one_based > 0 {
        one_based -= 1;
        s.insert(0, (b'A' + (one_based % 26) as u8) as char);
        one_based /= 26;
    }
    s
}
pub fn parse_wage(
    source: &PublicSource,
    bytes: &[u8],
) -> CommandResult<(Vec<PublicProfile>, usize)> {
    let c = contract(&source.id)?;
    let mut zip = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|_| invalid())?;
    if zip.len() > 100 {
        return Err(invalid());
    }
    let member = zip
        .by_name("xl/worksheets/sheet1.xml")
        .map_err(|_| invalid())?;
    if member.size() > 4 * 1024 * 1024 {
        return Err(invalid());
    }
    let mut xml = String::new();
    member
        .take(4 * 1024 * 1024 + 1)
        .read_to_string(&mut xml)
        .map_err(|_| invalid())?;
    let originals = original_numbers(&xml)?;
    let mut book: Xlsx<_> = Xlsx::new(Cursor::new(bytes)).map_err(|_| invalid())?;
    let names: Vec<String> =
        serde_json::from_value(c["sheetNames"].clone()).map_err(|_| invalid())?;
    if book.sheet_names() != names || source.url != WAGE_URL {
        return Err(invalid());
    }
    let range = book
        .worksheet_range("Real wage growth")
        .map_err(|_| invalid())?;
    let cell = |r, col| range.get_value((r, col)).ok_or_else(invalid);
    let headers = c["header"].as_array().ok_or_else(invalid)?;
    for (i, h) in headers.iter().enumerate() {
        let valid = match (h, cell(0, i as u32)?) {
            (Value::String(s), Data::String(t)) => s == t,
            (Value::Number(n), Data::Float(v)) => n.as_f64() == Some(*v),
            (Value::Number(n), Data::Int(v)) => n.as_i64() == Some(*v),
            _ => false,
        };
        if !valid {
            return Err(invalid());
        }
    }
    let ms = metrics(source)?;
    let m = ms.get("real_growth").ok_or_else(invalid)?;
    let rows = c["rows"].as_array().ok_or_else(invalid)?;
    if range.height() != rows.len() + 1 {
        return Err(invalid());
    }
    let mut profiles = vec![];
    for r in rows {
        let row = r["row"].as_u64().ok_or_else(invalid)? as u32;
        let iso = r["code"].as_str().ok_or_else(invalid)?;
        let a = source
            .areas
            .iter()
            .find(|a| a.code == iso)
            .ok_or_else(invalid)?;
        if !matches!(cell(row-1,4)?,Data::String(s) if s==&a.label)
            || !matches!(cell(row-1,5)?,Data::String(s) if s==iso)
        {
            return Err(invalid());
        }
        let mut points = vec![];
        for year in 2000..=2023 {
            let col = 12 + year - 2000;
            let raw = originals.get(&format!("{}{row}", column(col))).cloned();
            let valid = match (raw.as_ref(), cell(row - 1, (col - 1) as u32)?) {
                (None, Data::Empty) => true,
                (None, Data::String(s)) => s.is_empty(),
                (Some(s), Data::Float(v)) => s.parse::<f64>().ok() == Some(*v),
                (Some(s), Data::Int(v)) => s.parse::<f64>().ok() == Some(*v as f64),
                _ => false,
            };
            if !valid
                || raw
                    .as_ref()
                    .is_some_and(|s| s.parse::<f64>().is_ok_and(|n| n <= -100.0))
            {
                return Err(invalid());
            }
            points.push(point(year.to_string(), raw, "estimated"));
        }
        profiles.push(profile(m, a, points)?);
    }
    Ok((profiles, rows.len()))
}

pub fn parse_hours(
    source: &PublicSource,
    bytes: &[u8],
) -> CommandResult<(Vec<PublicProfile>, usize)> {
    let c = contract(&source.id)?;
    let text = std::str::from_utf8(bytes)
        .map_err(|_| invalid())?
        .trim_start_matches('\u{feff}');
    let mut reader = csv::Reader::from_reader(text.as_bytes());
    let expected: Vec<String> =
        serde_json::from_value(c["headers"].clone()).map_err(|_| invalid())?;
    if source.url != HOURS_URL
        || reader
            .headers()
            .map_err(|_| invalid())?
            .iter()
            .ne(expected.iter().map(String::as_str))
    {
        return Err(invalid());
    }
    let ms = metrics(source)?;
    let m = ms.get("actual_weekly").ok_or_else(invalid)?;
    let areas: BTreeMap<_, _> = source.areas.iter().map(|a| (a.code.as_str(), a)).collect();
    let mut groups: BTreeMap<String, Vec<PublicPoint>> = BTreeMap::new();
    let mut seen = BTreeSet::new();
    let mut count = 0;
    for row in reader.records() {
        let r = row.map_err(|_| invalid())?;
        count += 1;
        if c["allAreas"][&r[0]] != r[1] {
            return Err(invalid());
        }
        let Some(a) = areas.get(&r[0]) else {
            if c["excludedAreas"][&r[0]] != r[1] {
                return Err(invalid());
            }
            continue;
        };
        if a.label != r[1]
            || &r[4] != "HOW_TEMP_SEX_NB"
            || c["indicator"] != r[5]
            || &r[6] != "SEX_T"
            || &r[7] != "Total"
            || r[8].len() != 4
            || !("1976"..="2024").contains(&&r[8])
            || r[3].contains("Modelled")
            || !seen.insert((r[0].to_owned(), r[8].to_owned()))
        {
            return Err(invalid());
        }
        let mut p = point(r[8].into(), decimal(&r[9])?, "source_statistics");
        if p.value
            .as_ref()
            .is_some_and(|s| s.parse::<f64>().is_ok_and(|n| !(0.0..=168.0).contains(&n)))
        {
            return Err(invalid());
        }
        p.break_before = match &r[10] {
            "" => false,
            "B" => true,
            _ => return Err(invalid()),
        };
        p.notes.push(format!("{} ({})", &r[3], &r[2]));
        for i in [13, 15] {
            if !r[i].is_empty() {
                p.notes.push(r[i].into());
            }
        }
        if p.break_before {
            p.notes.push(r[11].into());
        }
        groups.entry(r[0].into()).or_default().push(p);
    }
    let mut profiles = vec![];
    for (country, mut points) in groups {
        points.sort_by(|a, b| a.period.cmp(&b.period));
        profiles.push(profile(m, areas[country.as_str()], points)?);
    }
    Ok((profiles, count))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn world_atlas_gap_decimals_and_benchmark_periods_are_exact() {
        let raw: Option<Box<RawValue>> = serde_json::from_str("4.4439346057362483").unwrap();
        assert_eq!(raw_number(raw).unwrap(), Some("4.4439346057362483".into()));
        assert_eq!(
            raw_number(serde_json::from_str("null").unwrap()).unwrap(),
            None
        );
        assert_eq!(
            raw_number(serde_json::from_str("0").unwrap()).unwrap(),
            Some("0".into())
        );
        assert!(raw_number(serde_json::from_str("\"4\"").unwrap()).is_err());
        let n=original_numbers(r#"<c r="L2"><v>-1.2345678901234567</v></c><c r="M2" t="s"><v>0</v></c><c r="N2"><v>0</v></c>"#).unwrap();
        assert_eq!(n.len(), 2);
        assert_eq!(n["N2"], "0");
        assert_eq!(n["L2"], "-1.2345678901234567");
        assert!(original_numbers(r#"<c r="A1"><v>1</v></c><c r="A1"><v>2</v></c>"#).is_err());
    }
}
