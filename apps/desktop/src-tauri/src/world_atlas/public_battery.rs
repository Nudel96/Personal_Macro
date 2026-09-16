//! Original IEA chart payloads. Ignore unrelated HTML; verify the selected data and metadata.
use super::{
    public_gap::{metrics, point, profile},
    public_models::*,
    public_source::decimal,
};
use crate::errors::CommandResult;
use scraper::{Html, Selector};
use serde::Deserialize;
use serde_json::Value;
use std::collections::BTreeMap;

const CONTRACTS: &str =
    include_str!("../../../src/features/world-atlas/data/public-battery-contracts.json");
const ATTRIBUTES: [&str; 8] = [
    "identifier",
    "csv",
    "chartoptions",
    "units",
    "credit",
    "crediturl",
    "lasthistoricalyear",
    "futurescenariolabel",
];
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Contract {
    slug: String,
    attributes: Vec<String>,
    delimiter: String,
    headers: Vec<String>,
    groups: Vec<Group>,
}
#[derive(Deserialize)]
struct Group {
    label: String,
    years: Vec<i32>,
}
fn contract(id: &str) -> CommandResult<Contract> {
    let mut all: BTreeMap<String, Contract> =
        serde_json::from_str(CONTRACTS).map_err(|_| invalid())?;
    all.remove(id).ok_or_else(invalid)
}
pub fn url(id: &str) -> CommandResult<String> {
    Ok(format!(
        "https://www.iea.org/data-and-statistics/charts/{}",
        contract(id)?.slug
    ))
}
pub fn normalize(source: &PublicSource, bytes: &[u8]) -> CommandResult<Vec<u8>> {
    let c = contract(&source.id)?;
    if c.attributes != ATTRIBUTES || source.url != url(&source.id)? {
        return Err(invalid());
    }
    let text = std::str::from_utf8(bytes).map_err(|_| invalid())?;
    // The HTML parser replaces NULs; reject them before parsing so they cannot forge fields.
    if text.contains('\0') {
        return Err(invalid());
    }
    let html = Html::parse_document(text);
    let selector =
        Selector::parse("[data-chart-identifier][data-chart-csv]").map_err(|_| invalid())?;
    let nodes: Vec<_> = html
        .select(&selector)
        .filter(|n| n.value().attr("data-chart-identifier") == Some(c.slug.as_str()))
        .collect();
    if nodes.len() != 1 {
        return Err(invalid());
    }
    let values = ATTRIBUTES
        .iter()
        .map(|name| {
            nodes[0]
                .value()
                .attr(&format!("data-chart-{name}"))
                .map(|s| s.replace("\r\n", "\n"))
                .ok_or_else(invalid)
        })
        .collect::<CommandResult<Vec<_>>>()?;
    if values.iter().any(|v| v.contains('\0')) {
        return Err(invalid());
    }
    Ok(values.join("\0").into_bytes())
}
pub fn parse(source: &PublicSource, bytes: &[u8]) -> CommandResult<(Vec<PublicProfile>, usize)> {
    let c = contract(&source.id)?;
    let text = std::str::from_utf8(bytes).map_err(|_| invalid())?;
    let fields: Vec<_> = text.split('\0').collect();
    if fields.len() != ATTRIBUTES.len()
        || fields[0] != c.slug
        || fields[3] != "GW"
        || fields[4] != "IEA. Licence: CC BY 4.0"
        || fields[5] != source.license_url
        || !fields[6].is_empty()
        || !fields[7].is_empty()
        || source.areas.len() != c.groups.len()
    {
        return Err(invalid());
    }
    if c.groups.len() > 1 {
        let options: Value =
            serde_json::from_str(&fields[2].replace("\\\"", "\"")).map_err(|_| invalid())?;
        let lines = options["xAxis"]["plotLines"]
            .as_array()
            .ok_or_else(invalid)?;
        if lines.len() != c.groups.len() {
            return Err(invalid());
        }
        let mut offset = 0usize;
        for (line, group) in lines.iter().zip(&c.groups) {
            if line["label"]["text"] != group.label
                || line["value"].as_f64() != Some(offset as f64 - 0.5)
            {
                return Err(invalid());
            }
            offset += group.years.len();
        }
    }
    let delimiter = c.delimiter.as_bytes();
    if delimiter.len() != 1 || !b",;".contains(&delimiter[0]) {
        return Err(invalid());
    }
    let mut reader = csv::ReaderBuilder::new()
        .delimiter(delimiter[0])
        .from_reader(fields[1].as_bytes());
    if reader
        .headers()
        .map_err(|_| invalid())?
        .iter()
        .ne(c.headers.iter().map(String::as_str))
    {
        return Err(invalid());
    }
    let rows = reader
        .records()
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| invalid())?;
    let codes: &[&str] = if c.headers.len() == 2 {
        &["total"]
    } else {
        &["utility", "behind_meter"]
    };
    let ms = metrics(source)?;
    if ms.len() != codes.len() {
        return Err(invalid());
    }
    let mut offset = 0;
    let mut result = Vec::new();
    for (idx, g) in c.groups.iter().enumerate() {
        let a = source
            .areas
            .iter()
            .find(|a| a.code == idx.to_string() && a.label == g.label)
            .ok_or_else(invalid)?;
        let block = rows
            .get(offset..offset + g.years.len())
            .ok_or_else(invalid)?;
        for (col, code) in codes.iter().enumerate() {
            let m = ms.get(*code).ok_or_else(invalid)?;
            if a.series_titles.get(*code).map(String::as_str) != Some(c.headers[col + 1].trim()) {
                return Err(invalid());
            }
            let mut points = Vec::new();
            for (row, year) in block.iter().zip(&g.years) {
                if row.len() != c.headers.len() || row[0] != year.to_string() {
                    return Err(invalid());
                }
                let value = decimal(&row[col + 1])?.ok_or_else(invalid)?;
                if value.parse::<f64>().map_err(|_| invalid())? < 0.0 {
                    return Err(invalid());
                }
                points.push(point(year.to_string(), Some(value), "estimated"));
            }
            result.push(profile(m, a, points)?);
        }
        offset += g.years.len();
    }
    if offset != rows.len() {
        return Err(invalid());
    }
    Ok((result, rows.len()))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn public_battery_selects_only_identified_chart_and_requires_unique_payload() {
        let s = source("iea-battery-world").unwrap();
        let attrs = ATTRIBUTES
            .iter()
            .map(|a| {
                format!(
                    " data-chart-{a}=\"{}\"",
                    if *a == "identifier" {
                        "global-battery-storage-capacity-additions-2020-2025"
                    } else {
                        ""
                    }
                )
            })
            .collect::<String>();
        let node = format!("<div{attrs}></div>");
        let one = normalize(&s, node.as_bytes()).unwrap();
        assert_eq!(normalize(&s, format!("<p>Changed recommendations</p>{node}<div data-chart-identifier=\"unrelated\" data-chart-csv=\"9\"></div>").as_bytes()).unwrap(), one);
        assert!(normalize(&s, format!("{node}{node}").as_bytes()).is_err());
        assert!(normalize(&s, b"<div></div>").is_err());
        assert!(parse(&s, &one).is_err()); // Identity alone never supplies data or units.
        assert!(normalize(&s, format!("{node}\0").as_bytes()).is_err());
    }
}
