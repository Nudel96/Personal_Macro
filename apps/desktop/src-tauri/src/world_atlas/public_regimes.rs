//! Original historical exchange-rate classifications, not numeric regime scores.
use super::public_models::*;
use crate::errors::CommandResult;
use calamine::{Data, Reader, Xlsx};
use serde::Deserialize;
use std::{
    collections::{BTreeMap, BTreeSet},
    io::Cursor,
};

pub const URL: &str = "https://sfff5b3ac9317c4be.jimcontent.com/download/version/1763503850/module/9834512569/name/JSTdatasetR6.xlsx";
const ID: &str = "jst-exchange-regimes";
const CONTRACT: &str =
    include_str!("../../../src/features/world-atlas/data/public-regimes-contract.json");
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Contract {
    source_id: String,
    sheet: String,
    header: Vec<String>,
    columns: Vec<Column>,
    countries: BTreeMap<String, Country>,
    type_labels: BTreeMap<String, String>,
    base_labels: BTreeMap<String, String>,
    zip_entries: usize,
    uncompressed_bytes: u128,
}
#[derive(Deserialize)]
struct Column {
    code: String,
    index: usize,
    title: String,
    note: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Country {
    label: String,
    ifs: i64,
    geography_id: String,
}
fn integer(d: &Data) -> CommandResult<i64> {
    match d {
        Data::Int(n) => Ok(*n),
        Data::Float(n) if n.is_finite() && n.fract() == 0.0 => Ok(*n as i64),
        _ => Err(invalid()),
    }
}
fn text(d: &Data) -> CommandResult<&str> {
    match d {
        Data::String(s) => Ok(s),
        _ => Err(invalid()),
    }
}
fn binary(d: &Data) -> CommandResult<Option<i64>> {
    if matches!(d, Data::Empty) {
        return Ok(None);
    }
    let n = integer(d)?;
    if !(0..=1).contains(&n) {
        return Err(invalid());
    }
    Ok(Some(n))
}
fn category(d: &Data) -> CommandResult<&str> {
    if matches!(d, Data::Empty) {
        return Ok("");
    }
    text(d)
}

pub fn parse(source: &PublicSource, bytes: &[u8]) -> CommandResult<(Vec<PublicProfile>, usize)> {
    let contract: Contract = serde_json::from_str(CONTRACT).map_err(|_| invalid())?;
    if source.id != ID
        || source.adapter != "jst_regimes"
        || source.url != URL
        || source.first_period != "1870"
        || source.last_period != "2020"
        || source.observation_kind != "historical_classification"
        || source.areas.len() != 18
        || contract.source_id != ID
        || contract.sheet != "Sheet1"
        || contract.countries.len() != 18
        || contract.columns.len() != 2
        || contract.type_labels.len() != 3
        || contract.base_labels.len() != 5
    {
        return Err(invalid());
    }
    let zip = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|_| invalid())?;
    if zip.len() != contract.zip_entries
        || zip.decompressed_size() != Some(contract.uncompressed_bytes)
        || contract.uncompressed_bytes > 32 * 1024 * 1024
    {
        return Err(invalid());
    }
    let mut book = Xlsx::new(Cursor::new(bytes)).map_err(|_| invalid())?;
    if book.sheet_names() != [contract.sheet.clone()] {
        return Err(invalid());
    }
    let data = book
        .worksheet_range(&contract.sheet)
        .map_err(|_| invalid())?;
    if data.get_size() != (2719, 59)
        || data
            .rows()
            .next()
            .ok_or_else(invalid)?
            .iter()
            .map(text)
            .collect::<CommandResult<Vec<_>>>()?
            != contract.header
    {
        return Err(invalid());
    }
    let cfg = config()?;
    let metrics: BTreeMap<_, _> = cfg
        .metrics
        .iter()
        .filter(|m| m.source_id == ID)
        .map(|m| (m.provider_code.as_str(), m))
        .collect();
    let areas: BTreeMap<_, _> = source.areas.iter().map(|a| (a.code.as_str(), a)).collect();
    if metrics.len() != 2 || areas.len() != 18 {
        return Err(invalid());
    }
    let geographies = super::catalog::catalog()?.geographies;
    for a in &source.areas {
        let c = contract.countries.get(&a.code).ok_or_else(invalid)?;
        if c.label != a.label
            || c.geography_id != a.geography_id
            || !geographies
                .iter()
                .any(|g| g.id == a.geography_id && g.iso3 == a.code)
        {
            return Err(invalid());
        }
    }
    for c in &contract.columns {
        let (index, title) = match c.code.as_str() {
            "peg" => (35, "Peg dummy"),
            "peg_strict" => (36, "Strict peg dummy"),
            _ => return Err(invalid()),
        };
        let m = metrics.get(c.code.as_str()).ok_or_else(invalid)?;
        if c.index != index
            || c.title != title
            || contract.header[index] != c.code
            || m.kind != "binary_regime"
            || m.frequency != "annual"
            || m.connect_adjacent
            || m.comparison != "same_definition"
            || m.unit != "Historische Einordnung je Jahr"
            || source
                .areas
                .iter()
                .any(|a| a.series_titles.get(&c.code) != Some(&c.title))
        {
            return Err(invalid());
        }
    }
    let mut profiles: BTreeMap<(String, String), PublicProfile> = BTreeMap::new();
    let mut seen = BTreeSet::new();
    let mut missing = 0;
    for row in data.rows().skip(1) {
        let year = integer(&row[0])?;
        let iso = text(&row[2])?;
        let a = areas.get(iso).ok_or_else(invalid)?;
        let c = &contract.countries[iso];
        if !(1870..=2020).contains(&year)
            || text(&row[1])? != c.label
            || integer(&row[3])? != c.ifs
            || !seen.insert((iso.to_owned(), year))
        {
            return Err(invalid());
        }
        let peg = binary(&row[35])?;
        let strict = binary(&row[36])?;
        let typ = category(&row[37])?;
        let base = category(&row[38])?;
        if peg.is_none() {
            if strict.is_some()
                || !typ.is_empty()
                || !base.is_empty()
                || iso != "IRL"
                || year > 1919
            {
                return Err(invalid());
            }
            missing += 1;
        } else if strict.is_none()
            || strict > peg
            || !contract.type_labels.contains_key(typ)
            || !contract.base_labels.contains_key(base)
            || (typ == "PEG" && peg != Some(1))
            || (typ == "FLOAT" && peg != Some(0))
        {
            return Err(invalid());
        }
        for column in &contract.columns {
            let value = binary(&row[column.index])?;
            let m = metrics[column.code.as_str()];
            let p = profiles
                .entry((m.id.clone(), a.geography_id.clone()))
                .or_insert_with(|| PublicProfile {
                    metric_id: m.id.clone(),
                    geography_id: a.geography_id.clone(),
                    provider_area: iso.into(),
                    provider_label: a.label.clone(),
                    provider_title: column.title.clone(),
                    unit: m.unit.clone(),
                    points: Vec::new(),
                });
            let mut notes = vec![column.note.clone()];
            if value.is_some() {
                notes.push(format!("Modellrolle: {}", contract.type_labels[typ]));
                notes.push(format!(
                    "Modell-Bezugsbasis: {}",
                    contract.base_labels[base]
                ));
            }
            p.points.push(PublicPoint {
                period: year.to_string(),
                value: value.map(|n| n.to_string()),
                status: match value {
                    None => "Keine Quellenklassifikation",
                    Some(1) => "Gebunden nach Quellenregel",
                    _ => "Nicht gebunden nach Quellenregel",
                }
                .into(),
                break_before: false,
                notes,
                lower_bound: None,
                upper_bound: None,
            });
        }
    }
    for p in profiles.values_mut() {
        p.points.sort_by(|a, b| a.period.cmp(&b.period));
    }
    if seen.len() != 2718
        || missing != 50
        || profiles.len() != 36
        || profiles.values().any(|p| p.points.len() != 151)
    {
        return Err(invalid());
    }
    Ok((profiles.into_values().collect(), seen.len()))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn regime_categories_are_not_neutral_numeric_scores() {
        assert_eq!(binary(&Data::Empty).unwrap(), None);
        assert_eq!(binary(&Data::Int(0)).unwrap(), Some(0));
        assert_eq!(binary(&Data::Float(1.0)).unwrap(), Some(1));
        assert!(binary(&Data::Float(0.5)).is_err());
        assert!(binary(&Data::Int(2)).is_err());
        assert_eq!(category(&Data::String("NA".into())).unwrap(), "NA");
        assert_eq!(category(&Data::Empty).unwrap(), "");
    }
    #[tokio::test]
    #[ignore = "Original JST workbook and independent 36-profile oracle; temporary SQLite only"]
    async fn public_regimes_original_roundtrip() {
        let dir =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../.tmp/atlas-remaining-40");
        let bytes = std::fs::read(dir.join("jst-regimes-r6.xlsx")).unwrap();
        let expected: Vec<PublicProfile> = serde_json::from_slice(
            &std::fs::read(dir.join("regimes-expected-profiles.json")).unwrap(),
        )
        .unwrap();
        let s = source(ID).unwrap();
        let data = super::super::public_source::parse_download(&s, &bytes).unwrap();
        assert_eq!(data.profiles, expected);
        let root = tempfile::tempdir().unwrap();
        let db = super::super::store::open(root.path()).await.unwrap();
        super::super::public_store::replace(&db, data)
            .await
            .unwrap();
        db.close().await;
        let db = super::super::store::open(root.path()).await.unwrap();
        for a in &s.areas {
            let row = super::super::public_store::read(&db, ID, &a.geography_id)
                .await
                .unwrap();
            assert_eq!(
                row.profiles,
                expected
                    .iter()
                    .filter(|p| p.geography_id == a.geography_id)
                    .cloned()
                    .collect::<Vec<_>>()
            );
        }
        let irl = expected
            .iter()
            .find(|p| p.geography_id == "m49:372" && p.metric_id.ends_with(":peg"))
            .unwrap();
        assert_eq!(irl.points.iter().filter(|p| p.value.is_none()).count(), 50);
        let aus = expected
            .iter()
            .find(|p| p.provider_area == "AUS" && p.metric_id.ends_with(":peg"))
            .unwrap();
        let strict = expected
            .iter()
            .find(|p| p.provider_area == "AUS" && p.metric_id.ends_with(":peg_strict"))
            .unwrap();
        assert_eq!(
            aus.points
                .iter()
                .find(|p| p.period == "1975")
                .unwrap()
                .value
                .as_deref(),
            Some("1")
        );
        assert_eq!(
            strict
                .points
                .iter()
                .find(|p| p.period == "1975")
                .unwrap()
                .value
                .as_deref(),
            Some("0")
        );
        for geo in ["world", "m49:356", "m49:710"] {
            assert_eq!(
                super::super::public_store::read(&db, ID, geo)
                    .await
                    .unwrap()
                    .status,
                "unsupported_area"
            );
        }
        let mut bad = s.clone();
        bad.areas[0].geography_id = "world".into();
        assert!(parse(&bad, &bytes).is_err());
        let mut changed = bytes;
        changed[20] ^= 1;
        assert!(super::super::public_source::parse_download(&s, &changed).is_err());
        db.close().await;
    }
}
