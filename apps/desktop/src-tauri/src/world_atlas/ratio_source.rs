use super::{catalog, ratio_models::*};
use crate::errors::{CommandError, CommandResult};
use chrono::{Datelike, Utc};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    time::Duration,
};

const MAX_CSV: usize = 16 * 1024 * 1024;
const HEADERS: [&str; 26] = [
    "STRUCTURE",
    "STRUCTURE_ID",
    "STRUCTURE_NAME",
    "ACTION",
    "REF_AREA",
    "Reference area",
    "FREQ",
    "Frequency of observation",
    "MEASURE",
    "Measure",
    "UNIT_MEASURE",
    "Unit of measure",
    "TIME_PERIOD",
    "Time period",
    "OBS_VALUE",
    "Observation value",
    "OBS_STATUS",
    "Observation status",
    "UNIT_MULT",
    "Unit multiplier",
    "ADJUSTMENT",
    "Adjustment",
    "DECIMALS",
    "Decimals",
    "BASE_PER",
    "Base period",
];
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Area {
    code: String,
    label: String,
    geography_id: String,
    reviewed_breaks: Vec<RatioBreak>,
}
#[derive(Deserialize)]
struct Config {
    areas: Vec<Area>,
}
fn invalid() -> CommandError {
    CommandError::validation(
        "Die OECD-Wohnvergleichsdaten enthalten ungeprüfte Einheiten, Gebiete, Statusangaben oder historische Abgrenzungen. Der bisherige Stand bleibt erhalten.",
    )
}
fn network() -> CommandError {
    CommandError::validation(
        "Die öffentlichen OECD-Wohnvergleichsdaten konnten nicht geladen werden. Bitte später erneut versuchen.",
    )
}
pub async fn download() -> CommandResult<HousingRatioDownload> {
    let client = reqwest::Client::builder()
        .tls_backend_rustls()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(45))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("PersonalMacro-Atlas/0.1")
        .build()
        .map_err(|_| network())?;
    let mut response = client.get(SOURCE_URL).send().await.map_err(|_| network())?;
    if response.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return Err(CommandError::validation(
            "Die OECD begrenzt gerade die Datenabrufe. Der gespeicherte Stand bleibt verfügbar; bitte später erneut versuchen.",
        ));
    }
    if !response.status().is_success()
        || response
            .content_length()
            .is_some_and(|n| n > MAX_CSV as u64)
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
        if bytes.len() + chunk.len() > MAX_CSV {
            return Err(invalid());
        }
        bytes.extend_from_slice(&chunk);
    }
    let mut data = parse(&bytes)?;
    let config: Config = serde_json::from_str(CONFIG).map_err(|_| invalid())?;
    if data.profiles.len() != config.areas.len() || data.provenance.source_row_count < 20_000 {
        return Err(invalid());
    }
    data.provenance.file_modified_at = modified;
    Ok(data)
}
fn parse(bytes: &[u8]) -> CommandResult<HousingRatioDownload> {
    if bytes.len() > MAX_CSV {
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
            (0, "DATAFLOW"),
            (1, "OECD.ECO.MPD:DSD_AN_HOUSE_PRICES@DF_HOUSE_PRICES(1.0)"),
            (2, "Analytical house prices indicators"),
            (3, "I"),
            (6, "Q"),
            (7, "Quarterly"),
            (13, ""),
            (15, ""),
            (16, "A"),
            (17, "Normal value"),
            (18, "0"),
            (19, "Units"),
            (20, "S"),
            (21, "Seasonally adjusted, not calendar adjusted"),
            (22, "1"),
            (23, "One"),
            (25, ""),
        ] {
            if &r[col] != expected {
                return Err(invalid());
            }
        }
        let area = config
            .areas
            .iter()
            .find(|a| a.code == r[4] && a.label == r[5])
            .ok_or_else(invalid)?;
        if !geographies.contains(&area.geography_id) {
            return Err(invalid());
        }
        let metric = match (&r[8], &r[9], &r[10], &r[11], &r[24]) {
            ("HPI_YDH", "Price to income ratio", "IX", "Index", "2015") => "income",
            ("HPI_RPI", "Price to rent ratio", "IX", "Index", "2015") => "rent",
            (
                "HPI_YDH_AVG",
                "Standardised price-income ratio",
                "PT_AVG_L_TERM",
                "Percentage of long term average",
                "",
            ) => "income_relative",
            (
                "HPI_RPI_AVG",
                "Standardised price-rent ratio",
                "PT_AVG_L_TERM",
                "Percentage of long term average",
                "",
            ) => "rent_relative",
            _ => return Err(invalid()),
        };
        let period = &r[12];
        let p = period.as_bytes();
        if p.len() != 7
            || &p[4..6] != b"-Q"
            || !(b'1'..=b'4').contains(&p[6])
            || !p[..4].iter().all(u8::is_ascii_digit)
        {
            return Err(invalid());
        }
        let year = period[..4].parse::<i32>().map_err(|_| invalid())?;
        if year < 1900
            || year > now.year()
            || (year == now.year() && (p[6] - b'0') as u32 > (now.month() - 1) / 3 + 1)
        {
            return Err(invalid());
        }
        let value = if r[14].is_empty() {
            None
        } else {
            let v = r[14].parse::<f64>().map_err(|_| invalid())?;
            if !v.is_finite() || v <= 0.0 || v > 100_000.0 {
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
        let periods: BTreeSet<_> = values
            .keys()
            .filter(|(a, _, _)| a == &area.code)
            .map(|(_, p, _)| p.clone())
            .collect();
        if periods.is_empty() {
            continue;
        }
        let mut points = Vec::new();
        for period in periods {
            let get = |m: &str| {
                values
                    .get(&(area.code.clone(), period.clone(), m.into()))
                    .copied()
                    .flatten()
            };
            points.push(HousingRatioPoint {
                income: get("income"),
                rent: get("rent"),
                income_relative: get("income_relative"),
                rent_relative: get("rent_relative"),
                period,
            });
        }
        let mut comparability_breaks = Vec::new();
        for basis in ["income", "rent"] {
            let mut previous: Option<f64> = None;
            for point in &points {
                let (index, relative) = if basis == "income" {
                    (point.income, point.income_relative)
                } else {
                    (point.rent, point.rent_relative)
                };
                if let Some(relative) = relative {
                    let divisor = index.ok_or_else(invalid)? / relative;
                    if previous.is_some_and(|p| (divisor / p - 1.0).abs() > 1e-8) {
                        comparability_breaks.push(RatioBreak {
                            basis: basis.into(),
                            period: point.period.clone(),
                        });
                    }
                    previous = Some(divisor);
                }
            }
        }
        if comparability_breaks != area.reviewed_breaks {
            return Err(invalid());
        }
        profiles.push(HousingRatioProfile {
            geography_id: area.geography_id,
            provider_code: area.code,
            provider_label: area.label,
            points,
            comparability_breaks,
        });
    }
    if profiles.is_empty() {
        return Err(invalid());
    }
    Ok(HousingRatioDownload {
        provenance: HousingRatioProvenance {
            retrieved_at: Utc::now().to_rfc3339(),
            file_modified_at: None,
            url: SOURCE_URL.into(),
            sha256: Sha256::digest(bytes)
                .iter()
                .map(|byte| format!("{byte:02x}"))
                .collect(),
            source_row_count: rows,
            numeric_cell_count: values.values().filter(|v| v.is_some()).count(),
            area_count: profiles.len(),
            recipe: "oecd-published-housing-ratios-v1".into(),
        },
        profiles,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::world_atlas::{AtlasState, ratio_store, store};
    const SAMPLE: &[u8] = include_bytes!("fixtures/oecd-housing-ratios-sample.csv");
    #[test]
    fn world_atlas_housing_ratios_preserve_published_values_starts_missing_metrics_and_boundaries()
    {
        let data = parse(SAMPLE).unwrap();
        assert_eq!(data.provenance.source_row_count, 4737);
        assert_eq!(data.profiles.len(), 7);
        let de = data
            .profiles
            .iter()
            .find(|p| p.provider_code == "DEU")
            .unwrap();
        assert_eq!(de.points[0].period, "1970-Q1");
        assert_eq!(de.points[0].rent, Some(131.972044369528));
        assert_eq!(de.points[0].income, None);
        assert_eq!(
            de.points
                .iter()
                .find(|p| p.income.is_some())
                .unwrap()
                .period,
            "1980-Q1"
        );
        assert_eq!(
            de.points.last().unwrap().income_relative,
            Some(85.8190653831815)
        );
        let us = data
            .profiles
            .iter()
            .find(|p| p.provider_code == "USA")
            .unwrap();
        assert_eq!(us.points.last().unwrap().period, "2026-Q2");
        assert_eq!(us.points.last().unwrap().rent, None);
        let sa = data
            .profiles
            .iter()
            .find(|p| p.provider_code == "ZAF")
            .unwrap();
        assert!(sa.points.iter().all(|p| p.rent_relative.is_none()));
        assert!(sa.points.iter().any(|p| p.income_relative.is_some()));
        let mx = data
            .profiles
            .iter()
            .find(|p| p.provider_code == "MEX")
            .unwrap();
        assert!(
            mx.points
                .iter()
                .all(|p| p.income.is_none() && p.income_relative.is_none())
        );
        let es = data
            .profiles
            .iter()
            .find(|p| p.provider_code == "ESP")
            .unwrap();
        assert_eq!(
            es.comparability_breaks,
            vec![RatioBreak {
                basis: "income".into(),
                period: "1985-Q1".into()
            }]
        );
    }
    #[test]
    fn world_atlas_housing_ratios_reject_unreviewed_definitions_forecasts_conflicts_and_oversize() {
        let original = std::str::from_utf8(SAMPLE).unwrap();
        for changed in [
            original.replace(",Q,Quarterly,", ",A,Annual,"),
            original.replace(",A,Normal value,", ",F,Forecast value,"),
            original.replace(",S,Seasonally adjusted,", ",N,Not seasonally adjusted,"),
            original.replace(
                "Seasonally adjusted, not calendar adjusted",
                "Calendar and seasonally adjusted",
            ),
            original.replace(",DEU,Germany,", ",DEU,France,"),
            original.replace(",2015,", ",2020,"),
            original.replace("Percentage of long term average", "Index"),
            original.replace("2026-Q2", "2099-Q2"),
            original.replace("1985-Q1", "1985-Q5"),
            original.replacen("131.972044369528", "NaN", 1),
            original.replacen("131.972044369528", "0", 1),
            original.replacen("131.972044369528", "-100", 1),
            original.replacen("131.972044369528", "180", 1),
            format!("{original}{}\n", original.lines().nth(1).unwrap()),
        ] {
            if changed != original {
                assert!(parse(changed.as_bytes()).is_err());
            }
        }
        assert!(parse(&vec![0; MAX_CSV + 1]).is_err());
        assert!(parse(b"<html>Too many requests</html>").is_err());
        // An explicit empty cell remains missing; an exact published reference is real data.
        let mut reader = csv::Reader::from_reader(SAMPLE);
        let record = reader
            .records()
            .find_map(|r| r.ok().filter(|r| &r[4] == "DEU" && &r[8] == "HPI_YDH"))
            .unwrap();
        let mut writer = csv::Writer::from_writer(Vec::new());
        writer.write_record(HEADERS).unwrap();
        let mut r = record.iter().map(str::to_owned).collect::<Vec<_>>();
        r[14] = String::new();
        writer.write_record(&r).unwrap();
        let empty = parse(&writer.into_inner().unwrap()).unwrap();
        assert_eq!(empty.profiles[0].points[0].income, None);
    }
    #[tokio::test]
    async fn world_atlas_housing_ratios_upgrade_preserves_bis_rollback_offline_and_cooldown() {
        let temp = tempfile::tempdir().unwrap();
        let old = sqlx::sqlite::SqlitePoolOptions::new()
            .connect_with(
                sqlx::sqlite::SqliteConnectOptions::new()
                    .filename(temp.path().join("cache.sqlite"))
                    .create_if_missing(true),
            )
            .await
            .unwrap();
        let mut v9 = sqlx::migrate!("./atlas-migrations");
        v9.migrations = v9.iter().take(9).cloned().collect::<Vec<_>>().into();
        v9.run(&old).await.unwrap();
        sqlx::query("INSERT INTO atlas_property_dataset VALUES('bis-residential-property','{}','2026-09-09')").execute(&old).await.unwrap();
        old.close().await;
        let state = AtlasState::new(temp.path().to_path_buf());
        let db = state.0.db().await.unwrap();
        assert_eq!(
            ratio_store::read(db, "m49:276").await.unwrap().status,
            "not_downloaded"
        );
        assert_eq!(
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM atlas_property_dataset")
                .fetch_one(db)
                .await
                .unwrap(),
            1
        );
        ratio_store::replace(db, parse(SAMPLE).unwrap())
            .await
            .unwrap();
        let mut bad = parse(SAMPLE).unwrap();
        bad.profiles.push(bad.profiles[0].clone());
        bad.provenance.recipe = "invalid".into();
        assert!(ratio_store::replace(db, bad).await.is_err());
        assert_ne!(
            ratio_store::read(db, "m49:276")
                .await
                .unwrap()
                .provenance
                .unwrap()
                .recipe,
            "invalid"
        );
        for id in ["world", "m49:356", "m49:156"] {
            assert_eq!(
                ratio_store::read(db, id).await.unwrap().status,
                "unsupported_area"
            );
        }
        assert!(ratio_store::read(db, "../private").await.is_err());
        let permit = state.0.gate.lock().await;
        assert!(
            state
                .0
                .start_housing_ratios()
                .await
                .unwrap_err()
                .message
                .contains("läuft bereits")
        );
        drop(permit);
        assert!(
            state
                .0
                .start_housing_ratios()
                .await
                .unwrap_err()
                .message
                .contains("24 Stunden")
        );
        assert!(state.0.gate.try_lock().is_ok());
        db.close().await;
        let reopened = store::open(temp.path()).await.unwrap();
        assert_eq!(
            ratio_store::read(&reopened, "m49:276")
                .await
                .unwrap()
                .profile
                .unwrap()
                .points[0]
                .rent,
            Some(131.972044369528)
        );
        reopened.close().await;
    }
    #[tokio::test]
    #[ignore = "Explicit public OECD HTTP audit; temporary cache only"]
    async fn world_atlas_housing_ratios_live_http_audit() {
        let data = download().await.unwrap();
        assert_eq!(data.profiles.len(), 45);
        assert!(data.provenance.numeric_cell_count >= 23535);
        let ids = data
            .profiles
            .iter()
            .map(|p| p.geography_id.clone())
            .collect::<Vec<_>>();
        let temp = tempfile::tempdir().unwrap();
        let db = store::open(temp.path()).await.unwrap();
        ratio_store::replace(&db, data).await.unwrap();
        let mut responses = Vec::new();
        for area in ids
            .iter()
            .map(String::as_str)
            .chain(["world", "m49:356", "m49:156"])
        {
            let row = ratio_store::read(&db, area).await.unwrap();
            assert_eq!(
                row.status,
                if ["world", "m49:356", "m49:156"].contains(&area) {
                    "unsupported_area"
                } else {
                    "available"
                }
            );
            responses.push(row);
        }
        let out = std::env::var_os("ATLAS_HOUSING_RATIOS_AUDIT_OUTPUT")
            .expect("Explicit public evidence output");
        std::fs::write(out, serde_json::to_vec_pretty(&responses).unwrap()).unwrap();
        db.close().await;
    }
}
