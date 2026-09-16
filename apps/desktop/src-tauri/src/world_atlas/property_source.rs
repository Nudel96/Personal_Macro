use super::{catalog, property_models::*};
use crate::errors::{CommandError, CommandResult};
use chrono::{Datelike, Utc};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    io::{Cursor, Read},
    time::Duration,
};

const MAX_ZIP: usize = 4 * 1024 * 1024;
const MAX_CSV: u64 = 32 * 1024 * 1024;
const MEMBER: &str = "WS_SPP_csv_flat.csv";
const HEADERS: [&str; 16] = [
    "STRUCTURE",
    "STRUCTURE_ID",
    "ACTION",
    "FREQ:Frequency",
    "REF_AREA:Reference area",
    "VALUE:Value",
    "UNIT_MEASURE:Unit of measure",
    "TIME_PERIOD:Time period or range",
    "OBS_VALUE:Observation Value",
    "UNIT_MULT:Unit Multiplier",
    "BREAKS:Breaks",
    "COVERAGE:Coverage",
    "TITLE_TS:Title (tseries level)",
    "OBS_STATUS:Observation Status",
    "OBS_CONF:Observation confidentiality",
    "OBS_PRE_BREAK:Pre-Break Observation",
];
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Area {
    code: String,
    label: String,
    geography_id: String,
}
#[derive(Deserialize)]
struct Config {
    areas: Vec<Area>,
}
fn invalid() -> CommandError {
    CommandError::validation(
        "Die BIS-Immobiliendatei hat unerwartete Einheiten, Gebiete, Statusangaben oder widersprüchliche Werte. Der bisherige Stand bleibt erhalten.",
    )
}
fn network() -> CommandError {
    CommandError::validation(
        "Die öffentliche BIS-Immobiliendatei konnte nicht geladen werden. Bitte später erneut versuchen.",
    )
}
pub async fn download() -> CommandResult<PropertyDownload> {
    let client = reqwest::Client::builder()
        .tls_backend_rustls()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(45))
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
    let csv = unzip(&bytes)?;
    let mut data = parse(&csv)?;
    let config: Config = serde_json::from_str(CONFIG).map_err(|_| invalid())?;
    if data.profiles.len() != config.areas.len() || data.provenance.source_row_count < 30_000 {
        return Err(invalid());
    }
    data.provenance.sha256 = Sha256::digest(&bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect();
    data.provenance.file_modified_at = modified;
    Ok(data)
}
fn unzip(bytes: &[u8]) -> CommandResult<Vec<u8>> {
    if bytes.len() > MAX_ZIP {
        return Err(invalid());
    }
    let mut zip = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|_| invalid())?;
    if zip.len() != 1 {
        return Err(invalid());
    }
    let entry = zip.by_index(0).map_err(|_| invalid())?;
    if entry.name() != MEMBER || entry.is_dir() || entry.size() > MAX_CSV {
        return Err(invalid());
    }
    let expected = entry.size();
    let mut result = Vec::new();
    entry
        .take(MAX_CSV + 1)
        .read_to_end(&mut result)
        .map_err(|_| invalid())?;
    if result.len() as u64 != expected || result.len() as u64 > MAX_CSV {
        return Err(invalid());
    }
    Ok(result)
}
fn parse(bytes: &[u8]) -> CommandResult<PropertyDownload> {
    if bytes.len() as u64 > MAX_CSV {
        return Err(invalid());
    }
    let config: Config = serde_json::from_str(CONFIG).map_err(|_| invalid())?;
    let mut reader = csv::Reader::from_reader(bytes);
    if reader
        .headers()
        .map_err(|_| invalid())?
        .iter()
        .collect::<Vec<_>>()
        != HEADERS
    {
        return Err(invalid());
    }
    let geographies: BTreeSet<_> = catalog::catalog()?
        .geographies
        .into_iter()
        .map(|g| g.id)
        .collect();
    let mut values = BTreeMap::<(String, String, String), Option<f64>>::new();
    let mut rows = 0;
    let now = Utc::now();
    for record in reader.records() {
        let r = record.map_err(|_| invalid())?;
        for (col, expected) in [
            (0, "dataflow"),
            (1, "BIS:WS_SPP(1.0): Selected residential property prices"),
            (2, "I"),
            (3, "Q: Quarterly"),
            (9, "0: Units"),
            (10, ""),
            (11, ""),
            (12, ""),
            (13, "A: Normal value"),
            (14, "F: Free"),
            (15, ""),
        ] {
            if &r[col] != expected {
                return Err(invalid());
            }
        }
        let area = config
            .areas
            .iter()
            .find(|a| r[4] == format!("{}: {}", a.code, a.label))
            .ok_or_else(invalid)?;
        if !geographies.contains(&area.geography_id) {
            return Err(invalid());
        }
        let metric = match (&r[5], &r[6]) {
            ("R: Real", "628: Index, 2010 = 100") => "real",
            ("N: Nominal", "628: Index, 2010 = 100") => "nominal",
            ("R: Real", "771: Year-on-year changes, in per cent") => "real_change",
            ("N: Nominal", "771: Year-on-year changes, in per cent") => "nominal_change",
            _ => return Err(invalid()),
        };
        let period = &r[7];
        let p = period.as_bytes();
        if p.len() != 7
            || &p[4..6] != b"-Q"
            || !(b'1'..=b'4').contains(&p[6])
            || !p[..4].iter().all(u8::is_ascii_digit)
        {
            return Err(invalid());
        }
        let year = period[..4].parse::<i32>().map_err(|_| invalid())?;
        if year < 1800
            || year > now.year()
            || (year == now.year() && (p[6] - b'0') as u32 > (now.month() - 1) / 3 + 1)
        {
            return Err(invalid());
        }
        let value = if r[8].is_empty() {
            None
        } else {
            let v = r[8].parse::<f64>().map_err(|_| invalid())?;
            if !v.is_finite()
                || v.abs() > 100_000.0
                || (!metric.ends_with("change") && v <= 0.0)
                || (metric.ends_with("change") && v < -100.0)
            {
                return Err(invalid());
            }
            Some(v)
        };
        if values
            .insert((area.code.clone(), period.into(), metric.into()), value)
            .is_some()
        {
            return Err(invalid());
        }
        rows += 1;
    }
    let mut profiles = Vec::new();
    for area in config.areas {
        let area_values: Vec<_> = values
            .iter()
            .filter(|((a, _, _), _)| a == &area.code)
            .collect();
        if area_values.is_empty() {
            continue;
        }
        let metrics: BTreeSet<_> = area_values
            .iter()
            .map(|((_, _, m), _)| m.as_str())
            .collect();
        if metrics != BTreeSet::from(["real", "nominal", "real_change", "nominal_change"]) {
            return Err(invalid());
        }
        let periods: BTreeSet<_> = area_values.iter().map(|((_, p, _), _)| p.clone()).collect();
        let mut points = Vec::new();
        for period in periods {
            let get = |m: &str, p: &str| {
                values
                    .get(&(area.code.clone(), p.into(), m.into()))
                    .copied()
                    .flatten()
            };
            let real = get("real", &period);
            let nominal = get("nominal", &period);
            let real_change = get("real_change", &period);
            let nominal_change = get("nominal_change", &period);
            let prior = format!(
                "{}{}",
                period[..4].parse::<i32>().map_err(|_| invalid())? - 1,
                &period[4..]
            );
            for (index, change, key) in [
                (real, real_change, "real"),
                (nominal, nominal_change, "nominal"),
            ] {
                if let (Some(current), Some(rate), Some(previous)) =
                    (index, change, get(key, &prior))
                {
                    // All four published measures are rounded to four decimal places.
                    // Compare intervals, not recomputed rounded rates (very small historical indices).
                    let epsilon = 0.000_05;
                    if previous > epsilon {
                        let low = ((current - epsilon) / (previous + epsilon) - 1.0) * 100.0
                            - epsilon
                            - 1e-8;
                        let high = ((current + epsilon) / (previous - epsilon) - 1.0) * 100.0
                            + epsilon
                            + 1e-8;
                        if rate < low || rate > high {
                            return Err(invalid());
                        }
                    }
                }
            }
            points.push(PropertyPoint {
                period,
                real,
                nominal,
                real_change,
                nominal_change,
            });
        }
        profiles.push(PropertyProfile {
            geography_id: area.geography_id,
            provider_code: area.code,
            provider_label: area.label,
            points,
        });
    }
    if profiles.is_empty() {
        return Err(invalid());
    }
    let provenance = PropertyProvenance {
        retrieved_at: Utc::now().to_rfc3339(),
        file_modified_at: None,
        url: SOURCE_URL.into(),
        sha256: String::new(),
        source_row_count: rows,
        numeric_cell_count: values.values().filter(|v| v.is_some()).count(),
        area_count: profiles.len(),
        recipe: "bis-spp-published-2010-index-yoy-v1".into(),
    };
    Ok(PropertyDownload {
        profiles,
        provenance,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::world_atlas::{AtlasState, property_store, store};
    const SAMPLE: &[u8] = include_bytes!("fixtures/bis-property-sample.csv");
    #[test]
    fn world_atlas_property_original_indices_growth_and_different_historical_starts() {
        let d = parse(SAMPLE).unwrap();
        assert_eq!(d.provenance.source_row_count, 2580);
        assert_eq!(d.profiles.len(), 3);
        let de = d.profiles.iter().find(|p| p.provider_code == "DE").unwrap();
        assert_eq!(de.points.len(), 225);
        assert_eq!(de.points[0].period, "1970-Q1");
        assert_eq!(de.points[0].real, Some(118.9348));
        assert_eq!(de.points[0].real_change, None);
        assert_eq!(de.points.last().unwrap().nominal, Some(179.9463));
        let it = d.profiles.iter().find(|p| p.provider_code == "IT").unwrap();
        assert_eq!(it.points[0].period, "1927-Q1");
        assert_eq!(it.points[0].nominal, Some(0.0189));
        assert_eq!(it.points[0].real, None);
        assert_eq!(
            it.points.iter().find(|p| p.real.is_some()).unwrap().period,
            "1947-Q1"
        );
        let india = d.profiles.iter().find(|p| p.provider_code == "IN").unwrap();
        assert_eq!(india.points[0].period, "2009-Q1");
        assert_eq!(india.points.last().unwrap().real, Some(161.9391));
    }
    #[test]
    fn world_atlas_property_rejects_changed_basis_flags_scope_dates_and_inconsistent_growth() {
        let s = std::str::from_utf8(SAMPLE).unwrap();
        for changed in [
            s.replace("628: Index, 2010 = 100", "628: Index, 2020 = 100"),
            s.replace("0: Units", "6: Millions"),
            s.replace("Q: Quarterly", "A: Annual"),
            s.replace("R: Real", "X: Estimated"),
            s.replace("A: Normal value", "E: Estimated value"),
            s.replace("F: Free", "C: Confidential"),
            s.replace("DE: Germany", "DE: France"),
            s.replace("2009-Q1", "2009-Q5"),
            s.replace("2009-Q1", "2099-Q1"),
            s.replacen("88.9013", "NaN", 1),
            s.replacen("88.9013", "-88.9013", 1),
            s.replacen("88.9013", "0", 1),
            s.replacen("161.9391", "1000", 1),
            format!("{s}{}\n", s.lines().nth(1).unwrap()),
        ] {
            assert!(parse(changed.as_bytes()).is_err());
        }
        let mut reader = csv::Reader::from_reader(SAMPLE);
        let record = reader.records().next().unwrap().unwrap();
        let mut out = csv::Writer::from_writer(Vec::new());
        out.write_record(HEADERS).unwrap();
        for (basis, unit, val) in [
            ("R: Real", "628: Index, 2010 = 100", ""),
            ("N: Nominal", "628: Index, 2010 = 100", "100"),
            ("R: Real", "771: Year-on-year changes, in per cent", "0"),
            ("N: Nominal", "771: Year-on-year changes, in per cent", "0"),
        ] {
            let mut r: Vec<String> = record.iter().map(str::to_owned).collect();
            r[5] = basis.into();
            r[6] = unit.into();
            r[8] = val.into();
            out.write_record(r).unwrap();
        }
        let d = parse(&out.into_inner().unwrap()).unwrap();
        assert_eq!(d.profiles[0].points[0].real, None);
        assert_eq!(d.profiles[0].points[0].real_change, Some(0.0));
    }
    fn zipped(name: &str, bytes: &[u8]) -> Vec<u8> {
        use std::io::Write;
        let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
        zip.start_file(name, zip::write::SimpleFileOptions::default())
            .unwrap();
        zip.write_all(bytes).unwrap();
        zip.finish().unwrap().into_inner()
    }
    #[test]
    fn world_atlas_property_zip_is_bounded_and_never_extracts_paths() {
        assert_eq!(unzip(&zipped(MEMBER, SAMPLE)).unwrap(), SAMPLE);
        assert!(unzip(&zipped("../journal.sqlite", SAMPLE)).is_err());
        assert!(unzip(b"<html>Service error</html>").is_err());
        assert!(unzip(&vec![0; MAX_ZIP + 1]).is_err());
    }
    #[tokio::test]
    async fn world_atlas_property_upgrade_atomic_rollback_offline_reopen_and_cooldown() {
        let temp = tempfile::tempdir().unwrap();
        let old = sqlx::sqlite::SqlitePoolOptions::new()
            .connect_with(
                sqlx::sqlite::SqliteConnectOptions::new()
                    .filename(temp.path().join("cache.sqlite"))
                    .create_if_missing(true),
            )
            .await
            .unwrap();
        let mut v8 = sqlx::migrate!("./atlas-migrations");
        v8.migrations = v8.iter().take(8).cloned().collect::<Vec<_>>().into();
        v8.run(&old).await.unwrap();
        sqlx::query("INSERT INTO atlas_credit_dataset VALUES ('bis-credit-gap','{}','2026-09-09')")
            .execute(&old)
            .await
            .unwrap();
        old.close().await;
        let state = AtlasState::new(temp.path().to_path_buf());
        let db = state.0.db().await.unwrap();
        assert_eq!(
            property_store::read(db, "m49:276").await.unwrap().status,
            "not_downloaded"
        );
        assert_eq!(
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM atlas_credit_dataset")
                .fetch_one(db)
                .await
                .unwrap(),
            1
        );
        property_store::replace(db, parse(SAMPLE).unwrap())
            .await
            .unwrap();
        let mut bad = parse(SAMPLE).unwrap();
        bad.profiles.push(bad.profiles[0].clone());
        bad.provenance.recipe = "invalid".into();
        assert!(property_store::replace(db, bad).await.is_err());
        assert_ne!(
            property_store::read(db, "m49:276")
                .await
                .unwrap()
                .provenance
                .unwrap()
                .recipe,
            "invalid"
        );
        assert_eq!(
            property_store::read(db, "world").await.unwrap().status,
            "unsupported_area"
        );
        assert!(property_store::read(db, "../private").await.is_err());
        let permit = state.0.gate.lock().await;
        assert!(
            state
                .0
                .start_property()
                .await
                .unwrap_err()
                .message
                .contains("läuft bereits")
        );
        drop(permit);
        assert!(
            state
                .0
                .start_property()
                .await
                .unwrap_err()
                .message
                .contains("24 Stunden")
        );
        assert!(state.0.gate.try_lock().is_ok());
        db.close().await;
        let reopened = store::open(temp.path()).await.unwrap();
        assert_eq!(
            property_store::read(&reopened, "m49:276")
                .await
                .unwrap()
                .profile
                .unwrap()
                .points[0]
                .real,
            Some(118.9348)
        );
        reopened.close().await;
    }
    #[tokio::test]
    #[ignore = "Explicit public BIS HTTP audit; temporary public cache only"]
    async fn world_atlas_property_live_http_audit() {
        let data = download().await.unwrap();
        assert_eq!(data.profiles.len(), 61);
        assert!(data.provenance.numeric_cell_count >= 35652);
        let temp = tempfile::tempdir().unwrap();
        let db = store::open(temp.path()).await.unwrap();
        property_store::replace(&db, data).await.unwrap();
        let mut responses = Vec::new();
        for area in [
            "m49:276",
            "m49:840",
            "m49:356",
            "m49:156",
            "m49:710",
            "m49:380",
            "bis:property_world",
            "bis:advanced_economies",
            "bis:emerging_economies",
            "bis:euro_area",
            "world",
        ] {
            let response = property_store::read(&db, area).await.unwrap();
            assert_eq!(
                response.status,
                if area == "world" {
                    "unsupported_area"
                } else {
                    "available"
                }
            );
            responses.push(response);
        }
        let path = std::env::var_os("ATLAS_PROPERTY_AUDIT_OUTPUT")
            .expect("Explicit public evidence destination");
        std::fs::write(path, serde_json::to_vec_pretty(&responses).unwrap()).unwrap();
        db.close().await;
    }
}
