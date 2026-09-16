//! Fixed WITS mirrored exports. Every annual ZIP remains an original file.
use super::public_models::*;
use crate::errors::{CommandError, CommandResult};
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
    include_str!("../../../src/features/world-atlas/data/public-wits-contract.json");
pub const URL: &str = "https://datacatalogfiles.worldbank.org/ddh-published/0064719/DR0092974/bulk_files_Herfindahl-Hirschman_Product_Concentration_Index_Mirrored_Export.xlsx";
const PREFIX: &str = "https://datacatalogfiles.worldbank.org/ddh-published/0064719/DR0092080/DIANA/Herfindahl-Hirschman%20Product%20Concentration%20Index%20Mirrored%20Export/";
const ID: &str = "wits-export-concentration";
const UNIT: &str = "Konzentrationsindex (0–1)";
const MAX_FILE: usize = 1_048_576;
const MAX_CSV: u64 = 8 * 1_048_576;
const END_NOTE: &str = "2022: stark unvollständiger Rand des Quellenstands; deutlich weniger meldende Importmärkte. Redaktionell von der vorherigen Linie getrennt, keine zusätzliche Quellenschätzung.";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Contract {
    source_id: String,
    url: String,
    files: Vec<Original>,
    headers: Vec<String>,
    provider_title: String,
    areas: Value,
    excluded_areas: BTreeMap<String, String>,
    period_starts: BTreeMap<String, i32>,
    expected_profiles: usize,
    expected_selected: usize,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Original {
    year: i32,
    url: String,
    bytes: usize,
    sha256: String,
    member: String,
    rows: usize,
    mapped_rows: usize,
    uncompressed_bytes: u64,
    reporters: BTreeSet<String>,
    partners: BTreeSet<String>,
}

fn hash(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

fn contract() -> CommandResult<Contract> {
    let c: Contract = serde_json::from_str(CONTRACT).map_err(|_| invalid())?;
    if c.source_id != ID || c.url != URL || c.files.len() != 35 {
        return Err(invalid());
    }
    for (i, f) in c.files.iter().enumerate() {
        let year = 1988 + i as i32;
        if f.year != year
            || f.url != format!("{PREFIX}ed_hhpci_{year}_mirroredexport_csv.zip")
            || f.member != format!("ED_HHPCI_{year}_MIRROREXPORT_2023Mar11.csv")
            || f.bytes == 0
            || f.bytes > MAX_FILE
            || f.uncompressed_bytes > MAX_CSV
            || f.sha256.len() != 64
            || !f.sha256.bytes().all(|b| b.is_ascii_hexdigit())
        {
            return Err(invalid());
        }
    }
    Ok(c)
}

/// The package is unmodified original ZIP bytes in year order, not a derived CSV.
/// Each boundary and hash is verified independently before the atomic import.
pub async fn download_bytes(client: &reqwest::Client) -> CommandResult<Vec<u8>> {
    let c = contract()?;
    let mut package = Vec::new();
    let network = || {
        CommandError::validation(
            "Die öffentlichen WITS-Originaldateien konnten nicht vollständig geladen werden. Der bisherige Stand bleibt erhalten.",
        )
    };
    for f in &c.files {
        let mut response = client.get(&f.url).send().await.map_err(|_| network())?;
        if !response.status().is_success()
            || response
                .content_length()
                .is_some_and(|n| n > MAX_FILE as u64)
        {
            return Err(network());
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|_| network())? {
            if bytes.len() + chunk.len() > f.bytes {
                return Err(invalid());
            }
            bytes.extend_from_slice(&chunk);
        }
        if bytes.len() != f.bytes || hash(&bytes) != f.sha256 {
            return Err(invalid());
        }
        package.extend(bytes);
    }
    Ok(package)
}

fn index(raw: &str, products: usize) -> CommandResult<Option<String>> {
    if products == 0 || products > 6000 {
        return Err(invalid());
    }
    if raw.is_empty() {
        return if products == 1 {
            Ok(None)
        } else {
            Err(invalid())
        };
    }
    if products == 1
        || raw.len() > 40
        || raw.trim() != raw
        || !raw
            .bytes()
            .all(|b| b.is_ascii_digit() || b".Ee+-".contains(&b))
    {
        return Err(invalid());
    }
    let n = Decimal::from_str(raw)
        .or_else(|_| Decimal::from_scientific(raw))
        .map_err(|_| invalid())?;
    if !(Decimal::ZERO..=Decimal::ONE).contains(&n) {
        return Err(invalid());
    }
    Ok(Some(raw.to_owned()))
}

fn decode_csv(
    c: &Contract,
    f: &Original,
    source: &PublicSource,
    csv: &[u8],
    profiles: &mut BTreeMap<String, PublicProfile>,
) -> CommandResult<(usize, usize)> {
    let areas: BTreeMap<_, _> = source.areas.iter().map(|a| (a.code.as_str(), a)).collect();
    let mut reader = csv::Reader::from_reader(csv);
    if reader
        .headers()
        .map_err(|_| invalid())?
        .iter()
        .collect::<Vec<_>>()
        != c.headers
    {
        return Err(invalid());
    }
    let mut seen = BTreeSet::new();
    let mut reporters = BTreeSet::new();
    let mut partners = BTreeSet::new();
    let mut rows = 0;
    let mut selected = 0;
    let mut mapped = 0;
    for r in reader.records() {
        let r = r.map_err(|_| invalid())?;
        rows += 1;
        if r.len() != 7
            || &r[0] != "H0"
            || r[1] != f.year.to_string()
            || &r[4] != "Tier3"
            || !f.reporters.contains(&r[2])
            || !f.partners.contains(&r[3])
            || !seen.insert((r[2].to_owned(), r[3].to_owned()))
        {
            return Err(invalid());
        }
        reporters.insert(r[2].to_owned());
        partners.insert(r[3].to_owned());
        let products: usize = r[5].parse().map_err(|_| invalid())?;
        if products == 0 || products > 6000 || r[5] != products.to_string() {
            return Err(invalid());
        }
        if &r[3] != "WLD" {
            continue;
        }
        selected += 1;
        if c.excluded_areas.contains_key(&r[2]) {
            continue;
        }
        if f.year < *c.period_starts.get(&r[2]).unwrap_or(&1988) {
            continue;
        }
        let area = areas.get(&r[2]).ok_or_else(invalid)?;
        let value = index(&r[6], products)?;
        let status = if value.is_some() {
            "WITS-Spiegeldatenindex"
        } else {
            "Ein Produkt: Quelle veröffentlicht keinen Index"
        };
        let profile = profiles
            .entry(area.geography_id.clone())
            .or_insert_with(|| PublicProfile {
                metric_id: format!("{ID}:HHPCI"),
                geography_id: area.geography_id.clone(),
                provider_area: area.code.clone(),
                provider_label: area.label.clone(),
                provider_title: c.provider_title.clone(),
                unit: UNIT.into(),
                points: Vec::new(),
            });
        profile.points.push(PublicPoint {
            period: r[1].to_owned(),
            value,
            status: status.into(),
            break_before: f.year == 2022,
            notes: if f.year == 2022 {
                vec![END_NOTE.into()]
            } else {
                vec![]
            },
            lower_bound: None,
            upper_bound: None,
        });
        mapped += 1;
    }
    if rows != f.rows
        || mapped != f.mapped_rows
        || reporters != f.reporters
        || partners != f.partners
    {
        return Err(invalid());
    }
    Ok((rows, selected))
}

pub fn parse(source: &PublicSource, package: &[u8]) -> CommandResult<(Vec<PublicProfile>, usize)> {
    let c = contract()?;
    if source.id != ID
        || source.url != URL
        || source.adapter != "wits_hhpci"
        || source.published_at != "2023-03-11"
        || source.first_period != "1988"
        || source.last_period != "2022"
        || source.observation_kind != "source_statistic"
        || serde_json::to_value(&source.areas).map_err(|_| invalid())? != c.areas
        || package.len() != c.files.iter().map(|f| f.bytes).sum::<usize>()
    {
        return Err(invalid());
    }
    let metrics: Vec<_> = config()?
        .metrics
        .into_iter()
        .filter(|m| m.source_id == ID)
        .collect();
    if metrics.len() != 1
        || metrics[0].id != format!("{ID}:HHPCI")
        || metrics[0].provider_code != "HHPCI"
        || metrics[0].unit != UNIT
        || metrics[0].frequency != "annual"
        || metrics[0].kind != "source_statistic"
    {
        return Err(invalid());
    }
    let mut offset = 0;
    let mut profiles = BTreeMap::new();
    let mut rows = 0;
    let mut selected = 0;
    for f in &c.files {
        let bytes = &package[offset..offset + f.bytes];
        offset += f.bytes;
        if hash(bytes) != f.sha256 {
            return Err(invalid());
        }
        let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|_| invalid())?;
        if archive.len() != 1 {
            return Err(invalid());
        }
        let member = archive.by_index(0).map_err(|_| invalid())?;
        if member.name() != f.member || member.is_dir() || member.size() != f.uncompressed_bytes {
            return Err(invalid());
        }
        let mut csv = Vec::new();
        member
            .take(MAX_CSV + 1)
            .read_to_end(&mut csv)
            .map_err(|_| invalid())?;
        if csv.len() as u64 != f.uncompressed_bytes {
            return Err(invalid());
        }
        let count = decode_csv(&c, f, source, &csv, &mut profiles)?;
        rows += count.0;
        selected += count.1;
    }
    if profiles.len() != c.expected_profiles
        || selected != c.expected_selected
        || rows != source.expected_rows
    {
        return Err(invalid());
    }
    Ok((profiles.into_values().collect(), rows))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn wits_index_and_historical_area_contract() {
        assert_eq!(index("0", 5).unwrap().as_deref(), Some("0"));
        assert_eq!(
            index("1.180680522971933E-4", 5).unwrap().as_deref(),
            Some("1.180680522971933E-4")
        );
        assert_eq!(
            index("0.0067959865454761586", 4552).unwrap().as_deref(),
            Some("0.0067959865454761586")
        );
        assert_eq!(index("", 1).unwrap(), None);
        for (value, n) in [
            ("-0.1", 2),
            ("1.01", 2),
            ("NaN", 2),
            ("0.5", 1),
            ("", 2),
            (" 0.1", 3),
        ] {
            assert!(index(value, n).is_err());
        }
        let s = source(ID).unwrap();
        assert_eq!(s.areas.len(), 239);
        assert!(
            s.areas
                .iter()
                .any(|a| a.code == "WLD" && a.geography_id == "world")
        );
        assert!(
            s.areas
                .iter()
                .any(|a| a.code == "SUD" && a.geography_id == "m49:729")
        );
        assert!(
            !s.areas
                .iter()
                .any(|a| a.code == "SDN" || a.code == "OAS" || a.code == "SRB")
        );
        assert_eq!(contract().unwrap().files.len(), 35);
    }

    #[tokio::test]
    #[ignore = "Fixed public original ZIPs, independent Decimal audit and temporary SQLite reopen"]
    async fn public_wits_originals_roundtrip() {
        let raw =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../.tmp/atlas-remaining-40");
        let bytes = std::fs::read(raw.join("wits-mirrored-originals.bin")).unwrap();
        let expected: Vec<PublicProfile> = serde_json::from_slice(
            &std::fs::read(raw.join("wits-expected-profiles.json")).unwrap(),
        )
        .unwrap();
        let source = source(ID).unwrap();
        let data = super::super::public_source::parse_download(&source, &bytes).unwrap();
        assert_eq!(data.profiles, expected);
        let root = tempfile::tempdir().unwrap();
        let db = super::super::store::open(root.path()).await.unwrap();
        super::super::public_store::replace(&db, data)
            .await
            .unwrap();
        db.close().await;
        let db = super::super::store::open(root.path()).await.unwrap();
        for p in &expected {
            let actual = super::super::public_store::read(&db, ID, &p.geography_id)
                .await
                .unwrap();
            assert_eq!(actual.profiles, vec![p.clone()]);
        }
        let mut wrong = source.clone();
        wrong.areas[0].geography_id = "world".into();
        assert!(parse(&wrong, &bytes).is_err());
        assert!(parse(&source, &bytes[..bytes.len() - 1]).is_err());
        let c = contract().unwrap();
        let f = &c.files[0];
        let mut archive = zip::ZipArchive::new(Cursor::new(&bytes[..f.bytes])).unwrap();
        let mut csv = Vec::new();
        archive.by_index(0).unwrap().read_to_end(&mut csv).unwrap();
        let mut reader = csv::Reader::from_reader(csv.as_slice());
        let headers = reader.headers().unwrap().clone();
        let rows: Vec<_> = reader.records().collect::<Result<_, _>>().unwrap();
        let target = rows
            .iter()
            .position(|r| &r[3] == "WLD" && source.areas.iter().any(|a| a.code == r[2]))
            .unwrap();
        for (column, bad) in [
            (0, "H4"),
            (1, "2026"),
            (2, "XYZ"),
            (3, "XYZ"),
            (4, "TOTAL"),
            (5, "0"),
            (6, "-0.1"),
            (6, "NaN"),
        ] {
            let mut writer = csv::Writer::from_writer(Vec::new());
            writer.write_record(&headers).unwrap();
            for (i, row) in rows.iter().enumerate() {
                writer
                    .write_record(
                        row.iter()
                            .enumerate()
                            .map(|(j, v)| if i == target && j == column { bad } else { v }),
                    )
                    .unwrap();
            }
            assert!(
                decode_csv(
                    &c,
                    f,
                    &source,
                    &writer.into_inner().unwrap(),
                    &mut BTreeMap::new()
                )
                .is_err(),
                "{column}:{bad}"
            );
        }
        let mut writer = csv::Writer::from_writer(Vec::new());
        writer.write_record(&headers).unwrap();
        for row in &rows {
            writer.write_record(row).unwrap();
        }
        writer.write_record(&rows[target]).unwrap();
        assert!(
            decode_csv(
                &c,
                f,
                &source,
                &writer.into_inner().unwrap(),
                &mut BTreeMap::new()
            )
            .is_err()
        );
        db.close().await;
    }
}
