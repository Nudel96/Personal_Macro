use super::{catalog, credit_models::*};
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
const MEMBER: &str = "WS_CREDIT_GAP_csv_flat.csv";
const HEADERS: [&str; 19] = [
    "STRUCTURE",
    "STRUCTURE_ID",
    "ACTION",
    "FREQ:Frequency",
    "BORROWERS_CTY:Borrowers' country",
    "TC_BORROWERS:Borrowing sector",
    "TC_LENDERS:Lending sector",
    "CG_DTYPE:Credit gap data type",
    "TIME_PERIOD:Time period or range",
    "OBS_VALUE:Observation Value",
    "COLLECTION:Collection Indicator",
    "DECIMALS:Decimals",
    "UNIT_MEASURE:Unit of measure",
    "UNIT_MULT:Unit Multiplier",
    "TIME_FORMAT:Time Format",
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
        "Die BIS-Kreditdatei hat unerwartete Einheiten, Gebiete, Statusangaben oder widersprüchliche Werte. Der bisherige Stand bleibt erhalten.",
    )
}
fn network() -> CommandError {
    CommandError::validation(
        "Die öffentliche BIS-Kreditdatei konnte nicht geladen werden. Bitte später erneut versuchen.",
    )
}
pub async fn download() -> CommandResult<CreditDownload> {
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
    if data.profiles.len() != config.areas.len() || data.provenance.source_row_count < 20_000 {
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
fn parse(bytes: &[u8]) -> CommandResult<CreditDownload> {
    if bytes.len() as u64 > MAX_CSV {
        return Err(invalid());
    }
    let config: Config = serde_json::from_str(CONFIG).map_err(|_| invalid())?;
    let mut reader = csv::Reader::from_reader(bytes);
    // Exact schema; extra/missing columns and shifted dimensions must not be accepted.
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
    for record in reader.records() {
        let r = record.map_err(|_| invalid())?;
        for (col, expected) in [
            (0, "dataflow"),
            (1, "BIS:WS_CREDIT_GAP(1.0): Credit-to-GDP gaps"),
            (2, "I"),
            (3, "Q: Quarterly"),
            (5, "P: Private non-financial sector"),
            (6, "A: All sectors"),
            (10, "E: End of period"),
            (11, "1: One"),
            (12, "770: Percentage of GDP"),
            (13, "0: Units"),
            (14, ""),
            (15, ""),
            (16, "A: Normal value"),
            (17, "F: Free"),
            (18, ""),
        ] {
            if &r[col] != expected {
                return Err(invalid());
            }
        }
        let area = config
            .areas
            .iter()
            .find(|area| r[4] == format!("{}: {}", area.code, area.label))
            .ok_or_else(invalid)?;
        if !geographies.contains(&area.geography_id) {
            return Err(invalid());
        }
        let metric = match &r[7] {
            "A: Credit-to-GDP ratios (actual data)" => "ratio",
            "B: Credit-to-GDP trend (HP filter)" => "trend",
            "C: Credit-to-GDP gaps (actual-trend)" => "gap",
            _ => return Err(invalid()),
        };
        let period = &r[8];
        let b = period.as_bytes();
        if b.len() != 7
            || &b[4..6] != b"-Q"
            || !(b'1'..=b'4').contains(&b[6])
            || !b[..4].iter().all(u8::is_ascii_digit)
        {
            return Err(invalid());
        }
        let year = period[..4].parse::<i32>().map_err(|_| invalid())?;
        let now = Utc::now();
        if year < 1900
            || year > now.year()
            || (year == now.year() && (b[6] - b'0') as u32 > (now.month() - 1) / 3 + 1)
        {
            return Err(invalid());
        }
        let value = if r[9].is_empty() {
            None
        } else {
            let v = r[9].parse::<f64>().map_err(|_| invalid())?;
            if !v.is_finite() || v.abs() > 100_000.0 || (metric != "gap" && v < 0.0) {
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
        if metrics != BTreeSet::from(["ratio", "trend", "gap"]) {
            return Err(invalid());
        }
        let periods: BTreeSet<_> = area_values.iter().map(|((_, p, _), _)| p.clone()).collect();
        let mut points = Vec::new();
        for period in periods {
            let get =
                |metric: &str| values.get(&(area.code.clone(), period.clone(), metric.into()));
            if get("ratio").is_none() || get("trend").is_some() != get("gap").is_some() {
                return Err(invalid());
            }
            let ratio = get("ratio").copied().flatten();
            let trend = get("trend").copied().flatten();
            let gap = get("gap").copied().flatten();
            if let (Some(a), Some(b), Some(c)) = (ratio, trend, gap) {
                // BIS publishes trend/gap rounded to four decimals while the
                // ratio has more precision. Preserve all three original values.
                if (a - b - c).abs() > 0.000_101 {
                    return Err(invalid());
                }
            }
            points.push(CreditPoint {
                period,
                ratio,
                trend,
                gap,
            });
        }
        profiles.push(CreditProfile {
            geography_id: area.geography_id,
            provider_code: area.code,
            provider_label: area.label,
            points,
        });
    }
    if profiles.is_empty() {
        return Err(invalid());
    }
    let provenance = CreditProvenance {
        retrieved_at: Utc::now().to_rfc3339(),
        file_modified_at: None,
        url: SOURCE_URL.into(),
        sha256: String::new(),
        source_row_count: rows,
        numeric_cell_count: values.values().filter(|v| v.is_some()).count(),
        area_count: profiles.len(),
        recipe: "bis-published-one-sided-hp400000-gap-v1".into(),
    };
    Ok(CreditDownload {
        profiles,
        provenance,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::world_atlas::{AtlasState, credit_store, store};
    const SAMPLE: &[u8] = include_bytes!("fixtures/bis-credit-sample.csv");
    #[test]
    fn world_atlas_credit_original_quarters_preserve_warmup_and_published_rounding() {
        let data = parse(SAMPLE).unwrap();
        assert_eq!(data.provenance.source_row_count, 1520);
        assert_eq!(data.profiles.len(), 2);
        let de = &data.profiles[0];
        assert_eq!(de.geography_id, "m49:276");
        assert_eq!(de.points[0].period, "1960-Q4");
        assert_eq!(de.points[0].ratio, Some(62.987783248936));
        assert_eq!(de.points[0].gap, None);
        assert_eq!(de.points[40].period, "1970-Q4");
        assert_eq!(de.points[40].gap, Some(-1.9975));
        assert_eq!(de.points.last().unwrap().gap, Some(-3.9645));
        assert_eq!(data.profiles[1].points.last().unwrap().gap, Some(1.7416));
    }
    #[test]
    fn world_atlas_credit_rejects_changed_units_scope_dates_flags_duplicates_and_inconsistent_models()
     {
        let sample = std::str::from_utf8(SAMPLE).unwrap();
        for changed in [
            sample.replace("770: Percentage of GDP", "771: Percent change"),
            sample.replace("0: Units", "6: Millions"),
            sample.replace("P: Private non-financial sector", "G: General government"),
            sample.replace("DE: Germany", "ZZ: Germany"),
            sample.replace("Q: Quarterly", "A: Annual"),
            sample.replace("2025-Q4", "2025-Q5"),
            sample.replace("2025-Q4", "2999-Q4"),
            sample.replace("A: Normal value", "B: Break in series"),
            sample.replace("F: Free", "C: Confidential"),
            sample.replace("62.987783248936", "NaN"),
            sample.replace("62.987783248936", "-62.987783248936"),
            sample.replace("1.7416", "12.7416"),
            format!("{sample}{}\n", sample.lines().nth(1).unwrap()),
        ] {
            assert!(parse(changed.as_bytes()).is_err());
        }
        let zero = sample.replace("62.987783248936", "0");
        assert_eq!(
            parse(zero.as_bytes()).unwrap().profiles[0].points[0].ratio,
            Some(0.0)
        );
        let missing = sample.replace("62.987783248936", "");
        assert_eq!(
            parse(missing.as_bytes()).unwrap().profiles[0].points[0].ratio,
            None
        );
        let removed = sample
            .lines()
            .filter(|l| {
                !(l.contains("DE: Germany")
                    && l.contains("2025-Q4")
                    && l.contains("B: Credit-to-GDP"))
            })
            .collect::<Vec<_>>()
            .join("\n");
        assert!(parse(removed.as_bytes()).is_err());
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
    fn world_atlas_credit_zip_is_bounded_and_never_extracts_paths() {
        assert_eq!(unzip(&zipped(MEMBER, SAMPLE)).unwrap(), SAMPLE);
        assert!(unzip(&zipped("../journal.sqlite", SAMPLE)).is_err());
        assert!(unzip(b"<html>Service error</html>").is_err());
        assert!(unzip(&vec![0; MAX_ZIP + 1]).is_err());
    }
    #[tokio::test]
    async fn world_atlas_credit_upgrade_atomic_rollback_offline_reopen_and_cooldown() {
        let temp = tempfile::tempdir().unwrap();
        let old = sqlx::sqlite::SqlitePoolOptions::new()
            .connect_with(
                sqlx::sqlite::SqliteConnectOptions::new()
                    .filename(temp.path().join("cache.sqlite"))
                    .create_if_missing(true),
            )
            .await
            .unwrap();
        let mut v7 = sqlx::migrate!("./atlas-migrations");
        v7.migrations = v7.iter().take(7).cloned().collect::<Vec<_>>().into();
        v7.run(&old).await.unwrap();
        sqlx::query("INSERT INTO atlas_capacity_dataset VALUES ('irena-capacity-2026-h1','{}','2026-09-09')").execute(&old).await.unwrap();
        old.close().await;
        let state = AtlasState::new(temp.path().to_path_buf());
        let db = state.0.db().await.unwrap();
        assert_eq!(
            credit_store::read(db, "m49:276").await.unwrap().status,
            "not_downloaded"
        );
        assert_eq!(
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM atlas_capacity_dataset")
                .fetch_one(db)
                .await
                .unwrap(),
            1
        );
        credit_store::replace(db, parse(SAMPLE).unwrap())
            .await
            .unwrap();
        let mut bad = parse(SAMPLE).unwrap();
        bad.profiles.push(bad.profiles[0].clone());
        bad.provenance.recipe = "invalid".into();
        assert!(credit_store::replace(db, bad).await.is_err());
        assert_ne!(
            credit_store::read(db, "m49:276")
                .await
                .unwrap()
                .provenance
                .unwrap()
                .recipe,
            "invalid"
        );
        assert_eq!(
            credit_store::read(db, "world").await.unwrap().status,
            "unsupported_area"
        );
        assert!(credit_store::read(db, "../private").await.is_err());
        let permit = state.0.gate.lock().await;
        assert!(
            state
                .0
                .start_credit()
                .await
                .unwrap_err()
                .message
                .contains("läuft bereits")
        );
        drop(permit);
        assert!(
            state
                .0
                .start_credit()
                .await
                .unwrap_err()
                .message
                .contains("24 Stunden")
        );
        assert!(state.0.gate.try_lock().is_ok());
        db.close().await;
        let reopened = store::open(temp.path()).await.unwrap();
        assert_eq!(
            credit_store::read(&reopened, "m49:276")
                .await
                .unwrap()
                .profile
                .unwrap()
                .points[0]
                .gap,
            None
        );
        reopened.close().await;
    }
    #[tokio::test]
    #[ignore = "Explicit public BIS HTTP audit; temporary public cache only"]
    async fn world_atlas_credit_live_http_audit() {
        let data = download().await.unwrap();
        assert_eq!(data.profiles.len(), 44);
        assert!(data.provenance.numeric_cell_count >= 24488);
        let temp = tempfile::tempdir().unwrap();
        let db = store::open(temp.path()).await.unwrap();
        credit_store::replace(&db, data).await.unwrap();
        let mut responses = Vec::new();
        for area in [
            "m49:276",
            "m49:840",
            "m49:356",
            "m49:156",
            "m49:710",
            "bis:euro_area",
            "world",
        ] {
            let response = credit_store::read(&db, area).await.unwrap();
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
        let path = std::env::var_os("ATLAS_CREDIT_AUDIT_OUTPUT")
            .expect("Explicit public evidence destination");
        std::fs::write(path, serde_json::to_vec_pretty(&responses).unwrap()).unwrap();
        db.close().await;
    }
}
