//! ND-GAIN's published models. Constant exposure is a single projection snapshot.
use super::public_models::*;
use crate::errors::CommandResult;
use rust_decimal::Decimal;
use serde::Deserialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    io::{Cursor, Read},
    str::FromStr,
};

const CONTRACT: &str =
    include_str!("../../../src/features/world-atlas/data/public-ndgain-contract.json");
pub const URL: &str = "https://gain.nd.edu/assets/647440/ndgain_countryindex_2026.zip";
const ID: &str = "ndgain-climate";
const UNIT: &str = "Modellindex (0–1)";
const MAX_MEMBER: u64 = 1_048_576;
const EXPOSURE_NOTE: &str = "Zeitlich konstantes Projektionsmodell für Klimaexposition. Die Teilmodelle verwenden unterschiedliche Szenarien, Basisperioden und Zukunftshorizonte, unter anderem 2030, die Jahrhundertmitte und das Jahrhundertende. Kein einheitliches Zukunftsjahr und keine beobachtete Entwicklung. Der Anbieter wiederholt denselben Modellwert in allen Archivjahren; hier wird nur ein einzelnes Vergleichsbild aus der letzten Archivspalte gezeigt.";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Contract {
    source_id: String,
    url: String,
    headers: Vec<String>,
    archive_entries: usize,
    files: Vec<Original>,
    labels: BTreeMap<String, String>,
    areas: Value,
    expected_profiles: usize,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Original {
    code: String,
    member: String,
    sha256: String,
    bytes: u64,
    rows: usize,
    profiles: usize,
    numeric: usize,
    missing_cells: usize,
    snapshot: bool,
}

fn index(raw: &str) -> CommandResult<Option<String>> {
    if raw.is_empty() {
        return Ok(None);
    }
    if raw.len() > 40 || raw.trim() != raw || !raw.bytes().all(|b| b.is_ascii_digit() || b == b'.')
    {
        return Err(invalid());
    }
    let n = Decimal::from_str(raw).map_err(|_| invalid())?;
    if !(Decimal::ZERO..=Decimal::ONE).contains(&n) {
        return Err(invalid());
    }
    Ok(Some(raw.to_owned()))
}

fn decode_csv(
    c: &Contract,
    f: &Original,
    source: &PublicSource,
    bytes: &[u8],
) -> CommandResult<Vec<PublicProfile>> {
    let mut reader = csv::Reader::from_reader(bytes);
    if reader
        .headers()
        .map_err(|_| invalid())?
        .iter()
        .collect::<Vec<_>>()
        != c.headers
    {
        return Err(invalid());
    }
    let areas: BTreeMap<_, _> = source.areas.iter().map(|a| (a.code.as_str(), a)).collect();
    let mut seen = BTreeSet::new();
    let mut profiles = Vec::new();
    let mut numeric = 0;
    let mut missing = 0;
    for row in reader.records() {
        let row = row.map_err(|_| invalid())?;
        if row.len() != 32
            || c.labels.get(&row[0]).map(String::as_str) != Some(&row[1])
            || !seen.insert(row[0].to_owned())
        {
            return Err(invalid());
        }
        let area = areas.get(&row[0]).ok_or_else(invalid)?;
        let values: Vec<_> = row
            .iter()
            .skip(2)
            .map(index)
            .collect::<CommandResult<_>>()?;
        // The source repeats one projection model across archival year columns.
        // A changed/empty column must not become a fabricated exposure history.
        if f.snapshot && (values[0].is_none() || values.iter().any(|v| v != &values[0])) {
            return Err(invalid());
        }
        let points: Vec<_> = values
            .into_iter()
            .enumerate()
            .filter(|(i, _)| !f.snapshot || *i == 29)
            .map(|(i, value)| PublicPoint {
                period: (1995 + i).to_string(),
                value,
                status: if f.snapshot {
                    "Zeitlich konstantes Projektionsmodell"
                } else {
                    "ND-GAIN-Modellwert · Quelleninterpolation möglich"
                }
                .into(),
                break_before: false,
                notes: if f.snapshot {
                    vec![EXPOSURE_NOTE.into()]
                } else {
                    vec![]
                },
                lower_bound: None,
                upper_bound: None,
            })
            .collect();
        let n = points.iter().filter(|p| p.value.is_some()).count();
        numeric += n;
        missing += points.len() - n;
        let title = format!("ND-GAIN 2026 | vulnerability/{}.csv", f.code);
        if n == 0 {
            if area.series_titles.contains_key(&f.code) {
                return Err(invalid());
            }
            continue;
        }
        if area.series_titles.get(&f.code) != Some(&title) {
            return Err(invalid());
        }
        profiles.push(PublicProfile {
            metric_id: format!("{ID}:{}", f.code),
            geography_id: area.geography_id.clone(),
            provider_area: area.code.clone(),
            provider_label: area.label.clone(),
            provider_title: title,
            unit: UNIT.into(),
            points,
        });
    }
    if seen.len() != f.rows
        || profiles.len() != f.profiles
        || numeric != f.numeric
        || missing != f.missing_cells
    {
        return Err(invalid());
    }
    Ok(profiles)
}

pub fn parse(source: &PublicSource, bytes: &[u8]) -> CommandResult<(Vec<PublicProfile>, usize)> {
    let c: Contract = serde_json::from_str(CONTRACT).map_err(|_| invalid())?;
    if c.source_id != ID
        || c.url != URL
        || c.files.len() != 10
        || c.labels.len() != 192
        || c.archive_entries != 550
        || source.id != ID
        || source.url != URL
        || source.adapter != "ndgain"
        || source.published_at != "2026"
        || source.observation_kind != "modeled_estimate"
        || source.first_period != "1995"
        || source.last_period != "2024"
        || serde_json::to_value(&source.areas).map_err(|_| invalid())? != c.areas
        || c.headers
            != [
                vec!["ISO3".to_owned(), "Name".to_owned()],
                (1995..=2024).map(|y| y.to_string()).collect(),
            ]
            .concat()
    {
        return Err(invalid());
    }
    let metrics: Vec<_> = config()?
        .metrics
        .into_iter()
        .filter(|m| m.source_id == ID)
        .collect();
    if metrics.len() != c.files.len() {
        return Err(invalid());
    }
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|_| invalid())?;
    if archive.len() != c.archive_entries
        || archive.file_names().collect::<BTreeSet<_>>().len() != c.archive_entries
    {
        return Err(invalid());
    }
    let mut profiles = Vec::new();
    let mut codes = BTreeSet::new();
    for f in &c.files {
        let metric = metrics
            .iter()
            .find(|m| m.provider_code == f.code)
            .ok_or_else(invalid)?;
        if !codes.insert(&f.code)
            || f.rows != 192
            || f.snapshot != (f.code == "exposure")
            || f.member != format!("resources 2/vulnerability/{}.csv", f.code)
            || f.bytes > MAX_MEMBER
            || metric.id != format!("{ID}:{}", f.code)
            || metric.unit != UNIT
            || metric.frequency != "annual"
            || metric.kind
                != if f.snapshot {
                    "projection_snapshot"
                } else {
                    "modeled_estimate"
                }
            || metric.connect_adjacent == f.snapshot
            || metric.comparison != "same_definition"
        {
            return Err(invalid());
        }
        // Only the ten fixed members are read in memory; no ZIP path is extracted.
        let member = archive.by_name(&f.member).map_err(|_| invalid())?;
        if member.is_dir() || member.size() != f.bytes {
            return Err(invalid());
        }
        let mut csv = Vec::new();
        member
            .take(MAX_MEMBER + 1)
            .read_to_end(&mut csv)
            .map_err(|_| invalid())?;
        let hash = Sha256::digest(&csv)
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect::<String>();
        if csv.len() as u64 != f.bytes || hash != f.sha256 {
            return Err(invalid());
        }
        profiles.extend(decode_csv(&c, f, source, &csv)?);
    }
    let rows = c.files.iter().map(|f| f.rows).sum();
    if profiles.len() != c.expected_profiles || rows != source.expected_rows {
        return Err(invalid());
    }
    profiles.sort_by(|a, b| (&a.metric_id, &a.geography_id).cmp(&(&b.metric_id, &b.geography_id)));
    Ok((profiles, rows))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn ndgain_decimal_contract() {
        for value in ["0", "1", "0.306084788083834"] {
            assert_eq!(index(value).unwrap().as_deref(), Some(value));
        }
        assert_eq!(index("").unwrap(), None);
        for value in ["NaN", "-0.1", "1.001", " 0.4", "0,5", "Infinity"] {
            assert!(index(value).is_err());
        }
    }

    #[tokio::test]
    #[ignore = "Fixed ND-GAIN original ZIP, independent Decimal audit and temporary SQLite reopen"]
    async fn public_ndgain_original_roundtrip() {
        let raw =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../.tmp/atlas-remaining-40");
        let bytes = std::fs::read(raw.join("ndgain-2026.zip")).unwrap();
        let expected: Vec<PublicProfile> = serde_json::from_slice(
            &std::fs::read(raw.join("ndgain-expected-profiles.json")).unwrap(),
        )
        .unwrap();
        let source = source(ID).unwrap();
        let data = super::super::public_source::parse_download(&source, &bytes).unwrap();
        assert_eq!(data.profiles, expected);
        assert_eq!(data.provenance.numeric_values, 49_842);
        assert_eq!(data.provenance.area_count, 192);
        let root = tempfile::tempdir().unwrap();
        let db = super::super::store::open(root.path()).await.unwrap();
        super::super::public_store::replace(&db, data)
            .await
            .unwrap();
        db.close().await;
        let db = super::super::store::open(root.path()).await.unwrap();
        for area in &source.areas {
            let row = super::super::public_store::read(&db, ID, &area.geography_id)
                .await
                .unwrap();
            assert_eq!(row.status, "available");
            assert_eq!(
                row.profiles,
                expected
                    .iter()
                    .filter(|p| p.geography_id == area.geography_id)
                    .cloned()
                    .collect::<Vec<_>>()
            );
        }
        let world = super::super::public_store::read(&db, ID, "world")
            .await
            .unwrap();
        assert_eq!(world.status, "unsupported_area");
        assert!(world.profiles.is_empty());
        let lie = super::super::public_store::read(&db, ID, "m49:438")
            .await
            .unwrap();
        assert!(
            !lie.profiles
                .iter()
                .any(|p| p.metric_id == format!("{ID}:vulnerability"))
        );
        assert_eq!(
            lie.profiles
                .iter()
                .find(|p| p.metric_id == format!("{ID}:exposure"))
                .unwrap()
                .points
                .len(),
            1
        );
        let mut wrong = source.clone();
        wrong.areas[0].geography_id = "world".into();
        assert!(parse(&wrong, &bytes).is_err());
        let c: Contract = serde_json::from_str(CONTRACT).unwrap();
        let f = c.files.iter().find(|f| f.snapshot).unwrap();
        let mut archive = zip::ZipArchive::new(Cursor::new(&bytes)).unwrap();
        let mut csv = Vec::new();
        archive
            .by_name(&f.member)
            .unwrap()
            .read_to_end(&mut csv)
            .unwrap();
        let mut reader = csv::Reader::from_reader(csv.as_slice());
        let headers = reader.headers().unwrap().clone();
        let rows: Vec<_> = reader.records().collect::<Result<_, _>>().unwrap();
        // Mutations bypass the outer hash deliberately to exercise semantic checks.
        for (column, bad) in [
            (0, "XYZ"),
            (1, "Another country"),
            (2, "0.9"),
            (2, ""),
            (31, "1.5"),
        ] {
            let mut writer = csv::Writer::from_writer(Vec::new());
            writer.write_record(&headers).unwrap();
            for (i, row) in rows.iter().enumerate() {
                writer
                    .write_record(
                        row.iter()
                            .enumerate()
                            .map(|(j, v)| if i == 0 && j == column { bad } else { v }),
                    )
                    .unwrap();
            }
            assert!(
                decode_csv(&c, f, &source, &writer.into_inner().unwrap()).is_err(),
                "{column}:{bad}"
            );
        }
        let mut writer = csv::Writer::from_writer(Vec::new());
        writer
            .write_record(headers.iter().map(|h| if h == "2024" { "2025" } else { h }))
            .unwrap();
        for row in &rows {
            writer.write_record(row).unwrap();
        }
        assert!(decode_csv(&c, f, &source, &writer.into_inner().unwrap()).is_err());
        let mut writer = csv::Writer::from_writer(Vec::new());
        writer.write_record(&headers).unwrap();
        for row in &rows {
            writer.write_record(row).unwrap();
        }
        writer.write_record(&rows[0]).unwrap();
        assert!(decode_csv(&c, f, &source, &writer.into_inner().unwrap()).is_err());
        db.close().await;
    }
}
