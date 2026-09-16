//! BGS mineral products retain material basis, source notes and genuinely missing cells.
use super::public_models::*;
use crate::errors::CommandResult;
use serde::Deserialize;
use std::collections::{BTreeMap, BTreeSet};

const CONTRACT: &str =
    include_str!("../../../src/features/world-atlas/data/public-bgs-contract.json");
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Contract {
    source_id: String,
    url: String,
    raw_file: String,
    headers: Vec<String>,
    selections: Vec<String>,
    row_metadata: Vec<[String; 5]>,
    raw_areas: Vec<[String; 3]>,
    areas: Vec<PublicArea>,
    expected_profiles: usize,
}
fn contract(id: &str) -> CommandResult<Contract> {
    let contracts: Vec<Contract> = serde_json::from_str(CONTRACT).map_err(|_| invalid())?;
    contracts
        .into_iter()
        .find(|c| c.source_id == id)
        .ok_or_else(invalid)
}

pub fn url(id: &str) -> CommandResult<String> {
    let url = contract(id)?.url;
    let parsed = reqwest::Url::parse(&url).map_err(|_| invalid())?;
    if parsed.scheme() != "https"
        || parsed.host_str() != Some("ogcapi.bgs.ac.uk")
        || parsed.path() != "/collections/world-mineral-statistics/items"
        || parsed.port().is_some()
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.fragment().is_some()
    {
        return Err(invalid());
    }
    Ok(url)
}

pub fn parse(source: &PublicSource, bytes: &[u8]) -> CommandResult<(Vec<PublicProfile>, usize)> {
    let contract = contract(&source.id)?;
    let cfg = config()?;
    if source.url != contract.url
        || serde_json::to_value(&source.areas).map_err(|_| invalid())?
            != serde_json::to_value(&contract.areas).map_err(|_| invalid())?
        || !contract.raw_file.starts_with("bgs-")
        || !contract.raw_file.ends_with(".csv")
    {
        return Err(invalid());
    }
    let metrics: BTreeMap<_, _> = cfg
        .metrics
        .iter()
        .filter(|m| m.source_id == source.id)
        .map(|m| (m.provider_code.as_str(), m))
        .collect();
    if metrics.len() != contract.selections.len()
        || contract
            .selections
            .iter()
            .any(|c| !metrics.contains_key(c.as_str()))
    {
        return Err(invalid());
    }
    let mut reader = csv::ReaderBuilder::new().flexible(false).from_reader(bytes);
    if reader
        .headers()
        .map_err(|_| invalid())?
        .iter()
        .ne(contract.headers.iter().map(String::as_str))
    {
        return Err(invalid());
    }
    let mut profiles: BTreeMap<(String, String), PublicProfile> = BTreeMap::new();
    let mut raw_ids = BTreeSet::new();
    let mut keys = BTreeSet::new();
    let mut count = 0;
    for row in reader.records() {
        let row = row.map_err(|_| invalid())?;
        count += 1;
        let get = |i| row.get(i).ok_or_else(invalid);
        let code = get(10)?;
        let name = get(5)?;
        let area_code = get(7)?;
        let year = get(1)?
            .strip_suffix("-01-01 00:00:00")
            .ok_or_else(invalid)?;
        if !raw_ids.insert(get(0)?.to_owned())
            || get(4)? != "Production"
            || get(22)? != "tonnes (metric)"
            || !super::public_source::valid_period(year, "annual")
            || !("1970"..="2024").contains(&year)
            || !contract.row_metadata.iter().any(|m| {
                m.iter().map(String::as_str).eq([
                    code,
                    get(11).unwrap_or(""),
                    get(12).unwrap_or(""),
                    get(2).unwrap_or(""),
                    get(3).unwrap_or(""),
                ])
            })
            || !contract.raw_areas.iter().any(|a| {
                a.iter()
                    .map(String::as_str)
                    .eq([area_code, name, get(6).unwrap_or("")])
            })
        {
            return Err(invalid());
        }
        let Some(metric) = metrics.get(code) else {
            continue;
        };
        if !keys.insert((code.to_owned(), area_code.to_owned(), year.to_owned()))
            || metric.frequency != "annual"
        {
            return Err(invalid());
        }
        let precision = get(19)?;
        let raw = get(17)?;
        let book = get(18)?;
        let mut status: Vec<String> = vec![];
        let value = match precision {
            "Figures not available" if raw.is_empty() && book == "..." && get(20)? == "O" => {
                status.push("Kein Zahlenwert veröffentlicht (…)".into());
                None
            }
            "Nil (nothing produced)" if raw == "0" && book == "-----" && get(20)? == "A" => {
                status.push("Keine Produktion laut Quelle (—)".into());
                Some("0".into())
            }
            "" if get(20)? == "A" && book == raw => {
                let value = super::public_source::decimal(raw)?.ok_or_else(invalid)?;
                // BGS's printed zero is a positive quantity below half a unit,
                // not nil. This reviewed selection contains no such cells.
                if !value.parse::<f64>().is_ok_and(|v| v > 0.0) {
                    return Err(invalid());
                }
                Some(value)
            }
            _ => return Err(invalid()),
        };
        let mut notes = vec![];
        let mut break_before = false;
        for note in get(26)?.split('|').filter(|n| !n.is_empty()) {
            match note {
                "Estimates." => status.push("Quellenschätzung (*)".into()),
                "Break in series." => {
                    status.push("Reihenbruch laut Quelle".into());
                    break_before = true;
                }
                _ => notes.push(format!("BGS-Quellenhinweis: {note}")),
            }
        }
        if !get(24)?.is_empty() {
            notes.push(format!(
                "BGS-Tabellenhinweise: {}",
                get(24)?.replace('|', " ")
            ));
        }
        // A country whose only selected row is missing stays unavailable.
        let Some(area) = source
            .areas
            .iter()
            .find(|a| a.code == area_code && a.label == name)
        else {
            if value.is_some() {
                return Err(invalid());
            }
            continue;
        };
        let Some(title) = area.series_titles.get(code) else {
            if value.is_some() {
                return Err(invalid());
            }
            continue;
        };
        let expected_title = format!(
            "World Mineral Statistics | {name} | {} | {} | tonnes (metric)",
            get(11)?,
            get(12)?
        );
        if title != &expected_title {
            return Err(invalid());
        }
        let profile = profiles
            .entry((metric.id.clone(), area.geography_id.clone()))
            .or_insert_with(|| PublicProfile {
                metric_id: metric.id.clone(),
                geography_id: area.geography_id.clone(),
                provider_area: area.code.clone(),
                provider_label: area.label.clone(),
                provider_title: title.clone(),
                unit: metric.unit.clone(),
                points: vec![],
            });
        profile.points.push(PublicPoint {
            period: year.into(),
            value,
            status: status.join(" · "),
            break_before,
            notes,
            lower_bound: None,
            upper_bound: None,
        });
    }
    profiles.retain(|_, p| p.points.iter().any(|v| v.value.is_some()));
    for profile in profiles.values_mut() {
        profile.points.sort_by(|a, b| a.period.cmp(&b.period));
    }
    if profiles.len() != contract.expected_profiles {
        return Err(invalid());
    }
    Ok((profiles.into_values().collect(), count))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    #[ignore = "Full BGS original CSV/JSON audit and temporary SQLite roundtrip"]
    async fn public_bgs_original_release_roundtrip() {
        let dir =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../.tmp/atlas-remaining-40");
        let expected: BTreeMap<String, Vec<PublicProfile>> =
            serde_json::from_slice(&std::fs::read(dir.join("bgs-expected-profiles.json")).unwrap())
                .unwrap();
        let test_root = tempfile::tempdir().unwrap();
        let pool = super::super::store::open(test_root.path()).await.unwrap();
        let mut count = 0;
        let mut all = vec![];
        for id in ["bgs-cement", "bgs-lithium", "bgs-rare-earths"] {
            let c = contract(id).unwrap();
            let s = source(id).unwrap();
            assert_eq!(url(id).unwrap(), s.url);
            let raw = std::fs::read(dir.join(&c.raw_file)).unwrap();
            let d = super::super::public_source::parse_download(&s, &raw).unwrap();
            assert_eq!(&d.profiles, &expected[id]);
            count += d.provenance.numeric_values;
            all.extend(d.profiles.clone());
            super::super::public_store::replace(&pool, d).await.unwrap();
            let mut bad = s.clone();
            bad.areas[0].geography_id = "world".into();
            assert!(super::super::public_source::parse_download(&bad, &raw).is_err());
            let wrong_unit = String::from_utf8(raw.clone())
                .unwrap()
                .replace("tonnes (metric)", "kilograms");
            assert!(parse(&s, wrong_unit.as_bytes()).is_err());
            let future = String::from_utf8(raw.clone())
                .unwrap()
                .replace("2024-01-01", "2027-01-01");
            assert!(parse(&s, future.as_bytes()).is_err());
            let wrong_nil = String::from_utf8(raw.clone())
                .unwrap()
                .replace("Nil (nothing produced)", "");
            assert!(parse(&s, wrong_nil.as_bytes()).is_err());
            assert!(
                super::super::public_source::parse_download(&s, &raw[..raw.len() - 1]).is_err()
            );
        }
        assert_eq!(count, 2238);
        let value = |metric: &str, geography: &str, year: &str| {
            all.iter()
                .find(|p| p.metric_id == metric && p.geography_id == geography)
                .unwrap()
                .points
                .iter()
                .find(|p| p.period == year)
                .unwrap()
                .value
                .as_deref()
        };
        // Independently checked against WMP 2020–24 pp. 44, 58, 84–85.
        assert_eq!(
            value("bgs-cement:2004", "m49:276", "2024"),
            Some("26809000")
        );
        assert_eq!(
            value("bgs-cement:2003", "m49:276", "2024"),
            Some("17729182")
        );
        assert_eq!(value("bgs-lithium:896", "m49:036", "2024"), Some("3902057"));
        assert_eq!(value("bgs-lithium:707", "m49:152", "2024"), Some("250605"));
        assert_eq!(
            value("bgs-lithium:20311", "m49:036", "2024"),
            Some("108633")
        );
        assert_eq!(
            value("bgs-rare-earths:20238", "m49:840", "2024"),
            Some("27000")
        );
        assert!(
            all.iter()
                .flat_map(|p| &p.points)
                .any(|p| p.value.as_deref() == Some("0"))
        );
        assert!(
            all.iter()
                .flat_map(|p| &p.points)
                .any(|p| p.value.is_none())
        );
        assert!(all.iter().flat_map(|p| &p.points).any(|p| p.break_before));
        assert!(
            all.iter()
                .all(|p| p.geography_id != "world" && !p.provider_area.is_empty())
        );
        pool.close().await;
        let reopened = super::super::store::open(test_root.path()).await.unwrap();
        for (id, profiles) in expected {
            let s = source(&id).unwrap();
            for area in &s.areas {
                let response = super::super::public_store::read(&reopened, &id, &area.geography_id)
                    .await
                    .unwrap();
                let mut wanted: Vec<_> = profiles
                    .iter()
                    .filter(|p| p.geography_id == area.geography_id)
                    .cloned()
                    .collect();
                wanted.sort_by(|a, b| a.metric_id.cmp(&b.metric_id));
                assert_eq!(response.profiles, wanted);
            }
        }
        reopened.close().await;
    }
}
