use super::{catalog, education_models::*};
use crate::errors::{CommandError, CommandResult};
use chrono::Utc;
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    io::{Cursor, Read},
    time::Duration,
};

const MAX_ZIP: usize = 48 * 1024 * 1024;
const MAX_ENTRY: u64 = 270 * 1024 * 1024;
const FILES: [&str; 7] = [
    "SDG_COUNTRY.csv",
    "SDG_LABEL.csv",
    "SDG_README_RELEASE_2026_February.md",
    "SDG_REGION.csv",
    "SDG_DATA_NATIONAL.csv",
    "SDG_DATA_REGIONAL.csv",
    "SDG_METADATA.csv",
];
type Archive<'a> = zip::ZipArchive<Cursor<&'a [u8]>>;
fn invalid() -> CommandError {
    CommandError::validation(
        "Die UNESCO-Bildungsdaten enthalten ungeprüfte Definitionen, Gebiete, Quellenkennzeichen oder unvollständige Dateien. Der bisherige Stand bleibt erhalten.",
    )
}
fn network() -> CommandError {
    CommandError::validation(
        "Die kostenlosen UNESCO-Bildungsdaten konnten nicht geladen werden. Der bisherige Stand bleibt verfügbar; bitte später erneut versuchen.",
    )
}
pub async fn download() -> CommandResult<EducationDownload> {
    let client = reqwest::Client::builder()
        .tls_backend_rustls()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(90))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("PersonalMacro-Atlas/0.1")
        .build()
        .map_err(|_| network())?;
    let mut response = client.get(SOURCE_URL).send().await.map_err(|_| network())?;
    if !response.status().is_success()
        || response
            .content_length()
            .is_some_and(|n| n > MAX_ZIP as u64)
    {
        return Err(network());
    }
    let modified = response
        .headers()
        .get(reqwest::header::LAST_MODIFIED)
        .and_then(|v| v.to_str().ok())
        .filter(|v| v.len() <= 100)
        .map(str::to_owned);
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| network())? {
        if bytes.len() + chunk.len() > MAX_ZIP {
            return Err(invalid());
        }
        bytes.extend_from_slice(&chunk);
    }
    let mut data = tokio::task::spawn_blocking(move || parse(&bytes))
        .await
        .map_err(|_| invalid())??;
    if data.provenance.source_row_count < 100_000
        || data.provenance.metadata_count < 100_000
        || data.provenance.area_count < 200
    {
        return Err(invalid());
    }
    data.provenance.file_modified_at = modified;
    Ok(data)
}
fn scan(
    archive: &mut Archive<'_>,
    name: &str,
    headers: &[&str],
    mut visit: impl FnMut(&csv::StringRecord) -> CommandResult<()>,
) -> CommandResult<()> {
    let file = archive.by_name(name).map_err(|_| invalid())?;
    let expected = file.size();
    if expected > MAX_ENTRY {
        return Err(invalid());
    }
    let mut reader = csv::Reader::from_reader(file.take(MAX_ENTRY + 1));
    if reader
        .headers()
        .map_err(|_| invalid())?
        .iter()
        .collect::<Vec<_>>()
        != headers
    {
        return Err(invalid());
    }
    for (i, row) in reader.records().enumerate() {
        let row = row.map_err(|_| invalid())?;
        if i > 8_000_000 || row.iter().any(|s| s.len() > 32_000) {
            return Err(invalid());
        }
        visit(&row)?;
    }
    if reader.position().byte() != expected {
        return Err(invalid());
    }
    Ok(())
}
fn point(
    year: &str,
    raw: &str,
    magnitude: &str,
    qualifier: &str,
    bounded: bool,
) -> CommandResult<EducationPoint> {
    let year: i32 = year.parse().map_err(|_| invalid())?;
    if !(1900..=2025).contains(&year) || !["", "NAT_EST", "UIS_EST"].contains(&qualifier) {
        return Err(invalid());
    }
    let numeric = if raw.is_empty() {
        None
    } else {
        Some(raw.parse::<f64>().map_err(|_| invalid())?)
    };
    if numeric.is_some_and(|v| !v.is_finite() || v < 0. || (bounded && v > 100.000001)) {
        return Err(invalid());
    }
    let value = match magnitude {
        "NA" if numeric == Some(0.) => None,
        "NIL" if numeric == Some(0.) => numeric,
        "SUPP" | "INCLUDED" if numeric.is_none() => None,
        "LOWREL" | "INCLUDES" if numeric.is_some() => numeric,
        "" => numeric,
        _ => return Err(invalid()),
    };
    if !qualifier.is_empty() && value.is_none() {
        return Err(invalid());
    }
    Ok(EducationPoint {
        year,
        value,
        magnitude: magnitude.into(),
        qualifier: qualifier.into(),
        notes: vec![],
    })
}
pub(super) fn parse(bytes: &[u8]) -> CommandResult<EducationDownload> {
    if bytes.len() > MAX_ZIP {
        return Err(invalid());
    }
    let config = config()?;
    let mut archive = Archive::new(Cursor::new(bytes)).map_err(|_| invalid())?;
    if archive.len() != FILES.len() {
        return Err(invalid());
    }
    let mut names = BTreeSet::new();
    let mut total = 0;
    for i in 0..archive.len() {
        let file = archive.by_index(i).map_err(|_| invalid())?;
        if !FILES.contains(&file.name())
            || file.is_dir()
            || file.size() > MAX_ENTRY
            || !names.insert(file.name().to_owned())
        {
            return Err(invalid());
        }
        total += file.size();
    }
    if total > 400 * 1024 * 1024 {
        return Err(invalid());
    }
    let mut readme = String::new();
    archive
        .by_name(FILES[2])
        .map_err(|_| invalid())?
        .take(32_001)
        .read_to_string(&mut readme)
        .map_err(|_| invalid())?;
    if readme.len() > 32_000 || !readme.contains("Creative Commons Attribution-ShareAlike 3.0 IGO")
    {
        return Err(invalid());
    }
    let metrics: BTreeMap<_, _> = config
        .metrics
        .iter()
        .map(|m| (m.code.as_str(), m))
        .collect();
    let areas: BTreeMap<_, _> = config.areas.iter().map(|a| (a.code.as_str(), a)).collect();
    let known: BTreeSet<_> = catalog::catalog()?
        .geographies
        .into_iter()
        .map(|g| g.id)
        .collect();
    if metrics.len() != 40
        || areas.len() != config.areas.len()
        || config
            .areas
            .iter()
            .any(|a| !known.contains(&a.geography_id))
    {
        return Err(invalid());
    }
    let mut found = BTreeSet::new();
    scan(
        &mut archive,
        FILES[1],
        &["INDICATOR_ID", "INDICATOR_LABEL_EN"],
        |r| {
            if let Some(m) = metrics.get(&r[0])
                && (r[1].trim() != m.provider_label || !found.insert(r[0].to_owned()))
            {
                return Err(invalid());
            }
            Ok(())
        },
    )?;
    if found.len() != metrics.len() {
        return Err(invalid());
    }
    let mut countries = BTreeSet::new();
    scan(
        &mut archive,
        FILES[0],
        &["COUNTRY_ID", "COUNTRY_NAME_EN"],
        |r| {
            if !countries.insert(r[0].to_owned()) {
                return Err(invalid());
            }
            if let Some(a) = areas.get(&r[0]) {
                if r[1] != a.label {
                    return Err(invalid());
                }
            } else if !matches!(
                (&r[0], &r[1]),
                ("ANT", "Netherlands Antilles")
                    | ("XDN", "Sudan (pre-secession)")
                    | ("ZZA", "Channel Islands")
            ) {
                return Err(invalid());
            }
            Ok(())
        },
    )?;
    if countries.len() != 241
        || config
            .areas
            .iter()
            .filter(|a| !a.code.starts_with("SDG:"))
            .any(|a| !countries.contains(&a.code))
    {
        return Err(invalid());
    }
    let mut memberships = BTreeMap::<String, BTreeSet<String>>::new();
    scan(
        &mut archive,
        FILES[3],
        &["REGION_ID", "COUNTRY_ID", "COUNTRY_NAME_EN"],
        |r| {
            if r[0].starts_with("SDG:")
                && (!countries.contains(&r[1])
                    || !memberships
                        .entry(r[0].to_owned())
                        .or_default()
                        .insert(r[1].to_owned()))
            {
                return Err(invalid());
            }
            Ok(())
        },
    )?;
    if memberships.len() != config.regions.len()
        || config
            .regions
            .iter()
            .any(|r| memberships.get(&r.code) != Some(&r.members.iter().cloned().collect()))
    {
        return Err(invalid());
    }
    let mut values = BTreeMap::<(String, String, i32), EducationPoint>::new();
    for (file, headers) in [
        (
            FILES[4],
            [
                "INDICATOR_ID",
                "COUNTRY_ID",
                "YEAR",
                "VALUE",
                "MAGNITUDE",
                "QUALIFIER",
            ],
        ),
        (
            FILES[5],
            [
                "indicator_id",
                "region_id",
                "year",
                "value",
                "magnitude",
                "qualifier",
            ],
        ),
    ] {
        scan(&mut archive, file, &headers, |r| {
            let Some(metric) = metrics.get(&r[0]) else {
                return Ok(());
            };
            if file == FILES[5] && !r[1].starts_with("SDG:") {
                return Ok(());
            }
            if !areas.contains_key(&r[1]) {
                return Err(invalid());
            }
            let p = point(&r[2], &r[3], &r[4], &r[5], metric.bounded_percentage)?;
            if values
                .insert((r[1].into(), r[0].into(), p.year), p)
                .is_some()
            {
                return Err(invalid());
            }
            Ok(())
        })?;
    }
    let mut metadata_count = 0;
    scan(
        &mut archive,
        FILES[6],
        &["INDICATOR_ID", "COUNTRY_ID", "YEAR", "TYPE", "METADATA"],
        |r| {
            if !metrics.contains_key(&r[0]) || !areas.contains_key(&r[1]) {
                return Ok(());
            }
            let year = r[2].parse::<i32>().map_err(|_| invalid())?;
            if let Some(p) = values.get_mut(&(r[1].into(), r[0].into(), year)) {
                if !["Source:Data sources", "Data Status:Data reporting"].contains(&&r[3])
                    || r[4].is_empty()
                    || p.notes.len() > 50
                {
                    return Err(invalid());
                }
                metadata_count += 1;
                let note = EducationNote {
                    kind: r[3].into(),
                    text: r[4].into(),
                };
                if !p.notes.contains(&note) {
                    p.notes.push(note);
                }
            }
            Ok(())
        },
    )?;
    let source_row_count = values.len();
    let numeric_cell_count = values.values().filter(|p| p.value.is_some()).count();
    if config
        .metrics
        .iter()
        .any(|m| !values.keys().any(|(_, code, _)| code == &m.code))
    {
        return Err(invalid());
    }
    let mut profiles = BTreeMap::<String, EducationProfile>::new();
    for ((code, metric, _), p) in values {
        let area = areas[code.as_str()];
        profiles
            .entry(area.geography_id.clone())
            .or_insert_with(|| EducationProfile {
                geography_id: area.geography_id.clone(),
                provider_code: code,
                series: BTreeMap::new(),
            })
            .series
            .entry(metric)
            .or_default()
            .push(p);
    }
    let area_count = profiles.len();
    Ok(EducationDownload {
        profiles: profiles.into_values().collect(),
        provenance: EducationProvenance {
            retrieved_at: Utc::now().to_rfc3339(),
            file_modified_at: None,
            url: SOURCE_URL.into(),
            sha256: Sha256::digest(bytes)
                .iter()
                .map(|b| format!("{b:02x}"))
                .collect(),
            release: "Februar 2026".into(),
            source_row_count,
            numeric_cell_count,
            metadata_count,
            area_count,
            recipe: "uis-sdg-202602-v1".into(),
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> Vec<u8> {
        include_bytes!("fixtures/uis-education-sample.zip").to_vec()
    }
    fn change(file: &str, from: &str, to: &str) -> Vec<u8> {
        use std::io::Write;
        let bytes = fixture();
        let mut old = Archive::new(Cursor::new(bytes.as_slice())).unwrap();
        let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
        for i in 0..old.len() {
            let mut entry = old.by_index(i).unwrap();
            let name = entry.name().to_owned();
            let mut text = String::new();
            entry.read_to_string(&mut text).unwrap();
            if name == file {
                assert!(text.contains(from));
                text = text.replacen(from, to, 1);
            }
            writer
                .start_file(
                    name,
                    zip::write::SimpleFileOptions::default()
                        .compression_method(zip::CompressionMethod::Deflated),
                )
                .unwrap();
            writer.write_all(text.as_bytes()).unwrap();
        }
        writer.finish().unwrap().into_inner()
    }
    #[test]
    fn original_fixture_preserves_notes_and_separate_models() {
        let data = parse(&fixture()).unwrap();
        assert_eq!(data.provenance.source_row_count, 500);
        assert_eq!(data.provenance.metadata_count, 606);
        let india = data
            .profiles
            .iter()
            .find(|p| p.provider_code == "IND")
            .unwrap();
        assert_eq!(india.series["CR.1"].len(), 5);
        assert!(india.series["CR.MOD.1"].len() > 5);
        let last = india.series["CR.1"].last().unwrap();
        assert_eq!(last.value, Some(94.15231323242188));
        assert_eq!(last.notes.len(), 1);
        assert!(last.notes[0].text.contains("2019"));
    }
    #[test]
    fn changed_labels_unknown_flags_and_duplicate_observations_are_rejected() {
        assert!(
            parse(&change(
                "SDG_LABEL.csv",
                "Completion rate, primary education, both sexes (%)",
                "School entry rate, primary education, both sexes (%)"
            ))
            .is_err()
        );
        let changed = change(
            "SDG_DATA_NATIONAL.csv",
            "IND,2005,76.53,,",
            "IND,2005,76.53,UNKNOWN,",
        );
        assert!(parse(&changed).is_err());
        let duplicate = change(
            "SDG_DATA_NATIONAL.csv",
            "CR.1,IND,2005,76.53,,",
            "CR.1,IND,2005,76.53,,\r\nCR.1,IND,2005,76.53,,",
        );
        assert!(parse(&duplicate).is_err());
    }
    #[tokio::test]
    async fn migration_and_atomic_replacement_preserve_existing_cache() {
        use super::super::{education_store, store};
        let dir = tempfile::tempdir().unwrap();
        let migration_dir = dir.path().join("old-migrations");
        std::fs::create_dir(&migration_dir).unwrap();
        for f in
            std::fs::read_dir(concat!(env!("CARGO_MANIFEST_DIR"), "/atlas-migrations")).unwrap()
        {
            let f = f.unwrap();
            if !f.file_name().to_string_lossy().starts_with("0011") {
                std::fs::copy(f.path(), migration_dir.join(f.file_name())).unwrap();
            }
        }
        let db = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(
                sqlx::sqlite::SqliteConnectOptions::new()
                    .filename(dir.path().join("cache.sqlite"))
                    .create_if_missing(true)
                    .foreign_keys(true),
            )
            .await
            .unwrap();
        sqlx::migrate::Migrator::new(migration_dir.as_path())
            .await
            .unwrap()
            .run(&db)
            .await
            .unwrap();
        sqlx::query("INSERT INTO atlas_housing_ratio_dataset VALUES('existing','{}','2026-01-01')")
            .execute(&db)
            .await
            .unwrap();
        db.close().await;
        let db = store::open(dir.path()).await.unwrap();
        let data = parse(&fixture()).unwrap();
        education_store::replace(&db, data).await.unwrap();
        let before = education_store::read(&db, "m49:356").await.unwrap();
        let mut invalid_data = parse(&fixture()).unwrap();
        invalid_data.provenance.release = "must roll back".into();
        invalid_data.profiles.push(invalid_data.profiles[0].clone());
        assert!(education_store::replace(&db, invalid_data).await.is_err());
        let after = education_store::read(&db, "m49:356").await.unwrap();
        assert_eq!(
            before.provenance.unwrap().release,
            after.provenance.unwrap().release
        );
        assert_eq!(after.profile.unwrap().series["CR.1"].len(), 5);
        assert_eq!(
            sqlx::query_scalar::<_, i32>(
                "SELECT count(*) FROM atlas_housing_ratio_dataset WHERE id='existing'"
            )
            .fetch_one(&db)
            .await
            .unwrap(),
            1
        );
        assert_eq!(
            education_store::read(&db, "world").await.unwrap().status,
            "unsupported_area"
        );
        assert_eq!(
            education_store::read(&db, "uis:world")
                .await
                .unwrap()
                .status,
            "empty"
        );
        db.close().await;
    }
    #[test]
    fn magnitude_qualifier_and_percentages_preserve_meaning() {
        assert_eq!(point("2020", "0", "NA", "", true).unwrap().value, None);
        assert_eq!(point("2020", "0", "NIL", "", true).unwrap().value, Some(0.));
        assert_eq!(point("2020", "", "SUPP", "", true).unwrap().value, None);
        let p = point("2020", "25", "LOWREL", "NAT_EST", true).unwrap();
        assert_eq!(p.magnitude, "LOWREL");
        assert_eq!(p.qualifier, "NAT_EST");
        assert!(point("2020", "166", "", "", false).is_ok());
        for (y, v, m, q) in [
            ("2026", "1", "", ""),
            ("2020", "-1", "", ""),
            ("2020", "NaN", "", ""),
            ("2020", "101", "", ""),
            ("2020", "1", "NA", ""),
            ("2020", "0", "NEW", ""),
            ("2020", "1", "", "NEW"),
        ] {
            assert!(point(y, v, m, q, true).is_err());
        }
    }
    #[test]
    #[ignore = "reads the independently downloaded public SDG release"]
    fn public_bulk_matches_reviewed_scope() {
        let bytes = std::fs::read("../.tmp/atlas-validation/uis/SDG.zip").unwrap();
        let data = parse(&bytes).unwrap();
        assert_eq!(data.provenance.source_row_count, 103593);
        assert_eq!(data.provenance.metadata_count, 124541);
        let india = data
            .profiles
            .iter()
            .find(|p| p.provider_code == "IND")
            .unwrap();
        let original = &india.series["CR.1"];
        assert_eq!(original.len(), 5);
        assert_eq!(original.last().unwrap().year, 2019);
        assert_eq!(original.last().unwrap().value, Some(94.15231323242188));
        assert!(
            original
                .last()
                .unwrap()
                .notes
                .iter()
                .any(|n| n.text.contains("2019"))
        );
    }
}
