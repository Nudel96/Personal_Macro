//! A published multi-year patent table; never distribute totals across invented years.
use super::public_models::*;
use crate::errors::CommandResult;
use regex::Regex;
use serde::Deserialize;
use std::collections::BTreeMap;

pub const URL: &str = "https://op.europa.eu/o/opportal-service/download-handler?identifier=18eaba28-a5ac-11f1-b25c-01aa75ed71a1&format=pdf&language=en&productionSystem=cellar&part=";
const ID: &str = "eu-advanced-materials";
const CONTRACT: &str =
    include_str!("../../../src/features/world-atlas/data/public-materials-contract.json");
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Contract {
    source_id: String,
    pages: usize,
    table_page: usize,
    table_title: String,
    period: String,
    rows: Vec<Row>,
    geographies: Vec<PublicArea>,
    profile_notes: BTreeMap<String, Vec<String>>,
}
#[derive(Deserialize)]
struct Row {
    code: String,
    pattern: String,
    values: BTreeMap<String, BTreeMap<String, String>>,
}
fn normalize(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}
fn parse_table(
    text: &str,
    contract: &Contract,
) -> CommandResult<BTreeMap<(String, String), String>> {
    let text = normalize(text);
    if !text.contains(&contract.table_title)
        || !text.contains("Company data (2010-2024)")
        || !text.contains("EU US China")
    {
        return Err(invalid());
    }
    let tail = text.split_once("Construction ").ok_or_else(invalid)?.1;
    let body = format!(
        "Construction {}",
        tail.split_once("Source: PATSTAT data.")
            .ok_or_else(invalid)?
            .0
    );
    let mut values = BTreeMap::new();
    for row in &contract.rows {
        let regex = Regex::new(&format!(
            r"{}\s+([0-9,]+)\s+([0-9.]+)%\s+([0-9,]+)\s+([0-9.]+)%\s+([0-9,]+)\s+([0-9.]+)%",
            row.pattern
        ))
        .map_err(|_| invalid())?;
        let captures = regex.captures_iter(&body).collect::<Vec<_>>();
        if captures.len() != 1 {
            return Err(invalid());
        }
        let v = &captures[0];
        for (i, area) in ["EU", "US", "China"].iter().enumerate() {
            for (j, field) in ["count", "triadic"].iter().enumerate() {
                let raw = if j == 0 {
                    v[1 + 2 * i + j].replace(',', "")
                } else {
                    v[1 + 2 * i + j].to_owned()
                };
                let n = raw.parse::<f64>().map_err(|_| invalid())?;
                if !n.is_finite()
                    || n < 0.0
                    || (j == 0 && (n.fract() != 0.0 || n > 200_000.0))
                    || (j == 1 && n > 100.0)
                    || row.values.get(*area).and_then(|m| m.get(*field)) != Some(&raw)
                    || values
                        .insert((format!("{}_{}", row.code, field), (*area).into()), raw)
                        .is_some()
                {
                    return Err(invalid());
                }
            }
        }
    }
    if values.len() != 36 {
        return Err(invalid());
    }
    Ok(values)
}
pub fn parse(source: &PublicSource, bytes: &[u8]) -> CommandResult<(Vec<PublicProfile>, usize)> {
    let contract: Contract = serde_json::from_str(CONTRACT).map_err(|_| invalid())?;
    if source.id != ID
        || source.adapter != "eu_materials_pdf"
        || source.url != URL
        || source.first_period != "2010"
        || source.last_period != "2024"
        || source.observation_kind != "period_aggregate"
        || contract.source_id != ID
        || contract.pages != 106
        || contract.table_page != 17
        || contract.period != "2010/2024"
        || contract.rows.len() != 6
        || source.areas.len() != 3
        || contract.geographies.len() != 3
        || bytes.len() > 6 * 1024 * 1024
    {
        return Err(invalid());
    }
    let pages = pdf_extract::extract_text_from_mem_by_pages(bytes).map_err(|_| invalid())?;
    if pages.len() != 106
        || pages.iter().map(String::len).sum::<usize>() > 4 * 1024 * 1024
        || !normalize(&pages[1]).contains("10.2777/0610738")
        || !normalize(&pages[69]).contains("Priority jurisdiction classification")
        || !normalize(&pages[69]).contains("not limited strictly to the EU-27 member states")
    {
        return Err(invalid());
    }
    let values = parse_table(&pages[16], &contract)?;
    for a in &source.areas {
        let original = contract
            .geographies
            .iter()
            .find(|g| g.code == a.code)
            .ok_or_else(invalid)?;
        let expected = match a.code.as_str() {
            "EU" => "eu:am_priority",
            "US" => "m49:840",
            "China" => "m49:156",
            _ => return Err(invalid()),
        };
        if a.geography_id != expected
            || a.label != original.label
            || a.geography_id != original.geography_id
            || a.series_titles != original.series_titles
        {
            return Err(invalid());
        }
    }
    let cfg = config()?;
    let metrics = cfg
        .metrics
        .iter()
        .filter(|m| m.source_id == ID)
        .collect::<Vec<_>>();
    if metrics.len() != 12 {
        return Err(invalid());
    }
    let mut profiles = Vec::new();
    for m in metrics {
        let unit = if m.provider_code.ends_with("_count") {
            "Patentfamilien (Anzahl)"
        } else if m.provider_code.ends_with("_triadic") {
            "Anteil triadischer Patentfamilien (%)"
        } else {
            return Err(invalid());
        };
        if m.frequency != "period_total"
            || m.kind != "period_snapshot"
            || m.comparison != "same_definition"
            || m.connect_adjacent
            || m.unit != unit
        {
            return Err(invalid());
        }
        for a in &source.areas {
            let value = values
                .get(&(m.provider_code.clone(), a.code.clone()))
                .ok_or_else(invalid)?;
            let notes = contract
                .profile_notes
                .get(&format!("{}:{}", m.id, a.geography_id))
                .ok_or_else(invalid)?;
            profiles.push(PublicProfile {
                metric_id: m.id.clone(),
                geography_id: a.geography_id.clone(),
                provider_area: a.code.clone(),
                provider_label: a.label.clone(),
                provider_title: a
                    .series_titles
                    .get(&m.provider_code)
                    .ok_or_else(invalid)?
                    .clone(),
                unit: m.unit.clone(),
                points: vec![PublicPoint {
                    period: contract.period.clone(),
                    value: Some(value.clone()),
                    status: "Veröffentlichter Zeitraumwert 2010–2024".into(),
                    break_before: false,
                    notes: notes.clone(),
                    lower_bound: None,
                    upper_bound: None,
                }],
            });
        }
    }
    profiles.sort_by(|a, b| (&a.metric_id, &a.geography_id).cmp(&(&b.metric_id, &b.geography_id)));
    Ok((profiles, 6))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn materials_period_table_rejects_invented_annual_or_shifted_columns() {
        let contract: Contract = serde_json::from_str(CONTRACT).unwrap();
        assert!(parse_table("Company data (2024) Construction 11779 24.1% 9932 18.4% 53771 0.7% Source: PATSTAT data.",&contract).is_err());
        assert_eq!(normalize("EU \n US \t China"), "EU US China");
        assert!(!super::super::public_source::valid_period(
            "2010/2024",
            "annual"
        ));
        assert!(super::super::public_source::valid_period(
            "2010/2024",
            "period_total"
        ));
        assert!(!super::super::public_source::valid_period(
            "2024/2010",
            "period_total"
        ));
    }
    #[tokio::test]
    #[ignore = "Original EU PDF, independent visual/PyPDF audit and temporary SQLite"]
    async fn public_materials_original_roundtrip() {
        let dir =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../.tmp/atlas-remaining-40");
        let bytes = std::fs::read(dir.join("eu-materials-2026.pdf")).unwrap();
        let expected: Vec<PublicProfile> = serde_json::from_slice(
            &std::fs::read(dir.join("materials-expected-profiles.json")).unwrap(),
        )
        .unwrap();
        let s = source(ID).unwrap();
        let data = super::super::public_source::parse_download(&s, &bytes).unwrap();
        assert_eq!(data.profiles, expected);
        assert!(
            data.profiles
                .iter()
                .all(|p| p.points.len() == 1 && p.points[0].period == "2010/2024")
        );
        let root = tempfile::tempdir().unwrap();
        let db = super::super::store::open(root.path()).await.unwrap();
        super::super::public_store::replace(&db, data)
            .await
            .unwrap();
        db.close().await;
        let db = super::super::store::open(root.path()).await.unwrap();
        for a in &s.areas {
            assert_eq!(
                super::super::public_store::read(&db, ID, &a.geography_id)
                    .await
                    .unwrap()
                    .profiles,
                expected
                    .iter()
                    .filter(|p| p.geography_id == a.geography_id)
                    .cloned()
                    .collect::<Vec<_>>()
            );
        }
        for geo in ["world", "m49:276", "m49:356", "eurostat:eu27_2020"] {
            assert_eq!(
                super::super::public_store::read(&db, ID, geo)
                    .await
                    .unwrap()
                    .status,
                "unsupported_area"
            );
        }
        let mut bad = s.clone();
        bad.areas[0].geography_id = "m49:276".into();
        assert!(parse(&bad, &bytes).is_err());
        let mut changed = bytes;
        changed[20] ^= 1;
        assert!(super::super::public_source::parse_download(&s, &changed).is_err());
        db.close().await;
    }
}
