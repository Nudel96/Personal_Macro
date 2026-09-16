use super::{agriculture_models::*, catalog};
use crate::errors::{CommandError, CommandResult};
use chrono::{Datelike, Utc};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    io::{Cursor, Read},
    time::Duration,
};

const MAX_ZIP: usize = 32 * 1024 * 1024;
const MAX_CSV: u64 = 420 * 1024 * 1024;
const MEMBER: &str = "Production_Indices_E_All_Data_(Normalized).csv";
const INDEX_URL: &str = "https://bulks-faostat.fao.org/production/datasets_E.json";
const HEADERS: [&str; 13] = [
    "Area Code",
    "Area Code (M49)",
    "Area",
    "Item Code",
    "Item Code (CPC)",
    "Item",
    "Element Code",
    "Element",
    "Year Code",
    "Year",
    "Unit",
    "Value",
    "Flag",
];
fn invalid() -> CommandError {
    CommandError::validation(
        "Die FAO-Produktionsdatei enthält ungeprüfte Gebiete, Definitionen, Quellenkennzeichen oder widersprüchliche Werte. Der bisherige Stand bleibt erhalten.",
    )
}
fn network() -> CommandError {
    CommandError::validation(
        "Die kostenlosen FAO-Produktionsdaten konnten nicht geladen werden. Der bisherige Stand bleibt verfügbar; bitte später erneut versuchen.",
    )
}
async fn fetch(
    client: &reqwest::Client,
    url: &str,
    limit: usize,
) -> CommandResult<(Vec<u8>, Option<String>)> {
    let mut response = client.get(url).send().await.map_err(|_| network())?;
    if !response.status().is_success()
        || response.content_length().is_some_and(|n| n > limit as u64)
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
        if bytes.len() + chunk.len() > limit {
            return Err(invalid());
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok((bytes, modified))
}
async fn release(client: &reqwest::Client) -> CommandResult<serde_json::Value> {
    let (bytes, _) = fetch(client, INDEX_URL, 2 * 1024 * 1024).await?;
    let json: serde_json::Value = serde_json::from_slice(&bytes).map_err(|_| invalid())?;
    let matches = json["Datasets"]["Dataset"]
        .as_array()
        .ok_or_else(invalid)?
        .iter()
        .filter(|d| d["DatasetCode"] == "QI")
        .collect::<Vec<_>>();
    if matches.len() != 1
        || matches[0]["FileLocation"] != SOURCE_URL
        || matches[0]["DatasetName"] != "Production: Production Indices"
    {
        return Err(invalid());
    }
    Ok(matches[0].clone())
}
pub async fn download() -> CommandResult<AgricultureDownload> {
    let client = reqwest::Client::builder()
        .tls_backend_rustls()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(90))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("PersonalMacro-Atlas/0.1")
        .build()
        .map_err(|_| network())?;
    let before = release(&client).await?;
    let (bytes, modified) = fetch(&client, SOURCE_URL, MAX_ZIP).await?;
    let after = release(&client).await?;
    if before != after {
        return Err(invalid());
    }
    let mut data = tokio::task::spawn_blocking(move || parse(&bytes))
        .await
        .map_err(|_| invalid())??;
    let date = before["DateUpdate"].as_str().ok_or_else(invalid)?;
    chrono::NaiveDateTime::parse_from_str(date, "%Y-%m-%dT%H:%M:%S").map_err(|_| invalid())?;
    if before["FileRows"].as_u64() != Some(data.provenance.source_row_count as u64)
        || data.profiles.len() != config()?.areas.len()
        || data.provenance.source_row_count < 1_000_000
    {
        return Err(invalid());
    }
    data.provenance.release = date.into();
    data.provenance.file_modified_at = modified;
    Ok(data)
}
fn parse(bytes: &[u8]) -> CommandResult<AgricultureDownload> {
    if bytes.len() > MAX_ZIP {
        return Err(invalid());
    }
    let mut zip = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|_| invalid())?;
    let names = [
        MEMBER,
        "Production_Indices_E_AreaCodes.csv",
        "Production_Indices_E_Elements.csv",
        "Production_Indices_E_Flags.csv",
        "Production_Indices_E_ItemCodes.csv",
    ];
    if zip.len() != names.len() {
        return Err(invalid());
    }
    let mut seen = BTreeSet::new();
    for i in 0..zip.len() {
        let entry = zip.by_index(i).map_err(|_| invalid())?;
        if !names.contains(&entry.name())
            || !seen.insert(entry.name().to_owned())
            || entry.is_dir()
            || entry.size() > MAX_CSV
        {
            return Err(invalid());
        }
    }
    // Explicit published estimated flag; no unreviewed measured/provisional status.
    let mut flags = String::new();
    zip.by_name(names[3])
        .map_err(|_| invalid())?
        .take(4096)
        .read_to_string(&mut flags)
        .map_err(|_| invalid())?;
    if flags.replace('\r', "").trim() != "Flag, Description\nE,Estimated value" {
        return Err(invalid());
    }
    let entry = zip.by_name(MEMBER).map_err(|_| invalid())?;
    let size = entry.size();
    let mut reader = csv::Reader::from_reader(entry.take(MAX_CSV + 1));
    if reader
        .headers()
        .map_err(|_| invalid())?
        .iter()
        .collect::<Vec<_>>()
        != HEADERS
    {
        return Err(invalid());
    }
    let cfg = config()?;
    let areas: BTreeMap<_, _> = cfg.areas.iter().map(|a| (a.code.as_str(), a)).collect();
    let items: BTreeMap<_, _> = cfg.items.iter().map(|a| (a.code.as_str(), a)).collect();
    let geographies: BTreeSet<_> = catalog::catalog()?
        .geographies
        .into_iter()
        .map(|g| g.id)
        .collect();
    struct RowValues {
        point: AgriculturePoint,
        mask: u8,
    }
    type Values = BTreeMap<String, BTreeMap<String, BTreeMap<i32, RowValues>>>;
    let mut values = Values::new();
    let mut rows = 0;
    let mut numeric = 0;
    for record in reader.records() {
        let r = record.map_err(|_| invalid())?;
        rows += 1;
        if rows > 3_000_000 || r.iter().any(|s| s.len() > 500) {
            return Err(invalid());
        }
        let area = areas.get(&r[0]).ok_or_else(invalid)?;
        let item = items.get(&r[3]).ok_or_else(invalid)?;
        let year = r[9].parse::<i32>().map_err(|_| invalid())?;
        if r[1] != area.m49
            || r[2] != area.provider_label
            || !geographies.contains(&area.geography_id)
            || r[4] != item.cpc
            || r[5] != item.provider_label
            || cfg.elements.get(&r[6]).map(String::as_str) != Some(&r[7])
            || r[8] != r[9]
            || !(1961..Utc::now().year()).contains(&year)
            || !r[10].is_empty()
            || &r[12] != "E"
        {
            return Err(invalid());
        }
        let value = if r[11].is_empty() {
            None
        } else {
            Some(r[11].parse::<f64>().map_err(|_| invalid())?)
        };
        if value.is_some_and(|v| !v.is_finite() || v < 0.) {
            return Err(invalid());
        }
        numeric += usize::from(value.is_some());
        let row = values
            .entry(r[0].to_owned())
            .or_default()
            .entry(r[3].to_owned())
            .or_default()
            .entry(year)
            .or_insert(RowValues {
                point: AgriculturePoint {
                    year,
                    total: None,
                    per_capita: None,
                },
                mask: 0,
            });
        let bit = match &r[6] {
            "432" => 1,
            "434" => 2,
            _ => return Err(invalid()),
        };
        if row.mask & bit != 0 {
            return Err(invalid());
        }
        row.mask |= bit;
        if bit == 1 {
            row.point.total = value;
        } else {
            row.point.per_capita = value;
        }
    }
    if reader.position().byte() != size || rows == 0 {
        return Err(invalid());
    }
    let profiles = values
        .into_iter()
        .map(|(code, series)| {
            let area = areas[code.as_str()];
            AgricultureProfile {
                geography_id: area.geography_id.clone(),
                provider_code: code,
                provider_label: area.provider_label.clone(),
                series: series
                    .into_iter()
                    .map(|(k, v)| (k, v.into_values().map(|row| row.point).collect()))
                    .collect(),
            }
        })
        .collect::<Vec<_>>();
    let provenance = AgricultureProvenance {
        retrieved_at: Utc::now().to_rfc3339(),
        file_modified_at: None,
        url: SOURCE_URL.into(),
        sha256: Sha256::digest(bytes)
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect(),
        release: cfg.release,
        source_row_count: rows,
        numeric_cell_count: numeric,
        area_count: profiles.len(),
        recipe: cfg.recipe,
    };
    Ok(AgricultureDownload {
        profiles,
        provenance,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::world_atlas::{AtlasState, agriculture_store, store};
    use std::io::Write;
    const SAMPLE: &[u8] = include_bytes!("fixtures/fao-agriculture-sample.zip");
    fn revised(change: impl FnOnce(String) -> String) -> Vec<u8> {
        let mut original = zip::ZipArchive::new(Cursor::new(SAMPLE)).unwrap();
        let mut out = zip::ZipWriter::new(Cursor::new(Vec::new()));
        let mut change = Some(change);
        for i in 0..original.len() {
            let mut entry = original.by_index(i).unwrap();
            let mut bytes = Vec::new();
            entry.read_to_end(&mut bytes).unwrap();
            if entry.name() == MEMBER {
                bytes = change.take().unwrap()(String::from_utf8(bytes).unwrap()).into_bytes();
            }
            out.start_file(entry.name(), zip::write::SimpleFileOptions::default())
                .unwrap();
            out.write_all(&bytes).unwrap();
        }
        out.finish().unwrap().into_inner()
    }
    #[test]
    fn world_atlas_agriculture_original_values_and_distinct_china_areas() {
        let data = parse(SAMPLE).unwrap();
        assert_eq!(data.provenance.source_row_count, 160);
        let get = |id: &str| {
            data.profiles
                .iter()
                .find(|p| p.geography_id == id)
                .unwrap()
                .series["15"]
                .last()
                .unwrap()
        };
        assert_eq!(get("m49:356").total, Some(123.74));
        assert_eq!(get("m49:356").per_capita, Some(113.23));
        assert_eq!(get("m49:156").per_capita, Some(105.44));
        assert_eq!(get("fao:351").per_capita, Some(105.49));
        assert_eq!(get("fao:5100").per_capita, Some(80.91));
        assert!(data.profiles.iter().all(|p| p.geography_id != "world"));
    }
    #[test]
    fn world_atlas_agriculture_rejects_definition_drift_and_preserves_missing_zero_and_gaps() {
        for (from, to) in [
            ("2014-2016 = 100", "2010 = 100"),
            ("123.740000", "NaN"),
            ("123.740000", "-1"),
            ("'356", "'156"),
            ("2024,2024", "2024,2025"),
            ("2024,2024", "2999,2999"),
        ] {
            let bytes = revised(|s| s.replace(from, to));
            assert!(parse(&bytes).is_err(), "{from}");
        }
        assert!(
            parse(&revised(|s| {
                let row = s.lines().nth(1).unwrap().to_owned();
                format!("{s}{row}\n")
            }))
            .is_err()
        );
        assert!(parse(&revised(|s| s.replace(",E\r\n", ",A\r\n"))).is_err());
        let zero = parse(&revised(|s| s.replace("123.740000", "0"))).unwrap();
        let india = zero
            .profiles
            .iter()
            .find(|p| p.geography_id == "m49:356")
            .unwrap();
        assert_eq!(india.series["15"].last().unwrap().total, Some(0.));
        let missing = parse(&revised(|s| s.replace("123.740000", ""))).unwrap();
        let india = missing
            .profiles
            .iter()
            .find(|p| p.geography_id == "m49:356")
            .unwrap();
        assert_eq!(india.series["15"].last().unwrap().total, None);
        assert_eq!(india.series["15"].last().unwrap().per_capita, Some(113.23));
        let gap = parse(&revised(|s| {
            s.lines()
                .filter(|l| !l.contains(",2022,2022,"))
                .collect::<Vec<_>>()
                .join("\n")
        }))
        .unwrap();
        assert!(
            gap.profiles
                .iter()
                .flat_map(|p| p.series.values())
                .flatten()
                .all(|p| p.year != 2022)
        );
        assert!(parse(b"<html>provider failure</html>").is_err());
        assert!(parse(&vec![0; MAX_ZIP + 1]).is_err());
    }
    #[tokio::test]
    async fn world_atlas_agriculture_migration_rollback_reopen_and_cooldown() {
        let temp = tempfile::tempdir().unwrap();
        let old = sqlx::sqlite::SqlitePoolOptions::new()
            .connect_with(
                sqlx::sqlite::SqliteConnectOptions::new()
                    .filename(temp.path().join("cache.sqlite"))
                    .create_if_missing(true),
            )
            .await
            .unwrap();
        let mut v11 = sqlx::migrate!("./atlas-migrations");
        v11.migrations = v11.iter().take(11).cloned().collect::<Vec<_>>().into();
        v11.run(&old).await.unwrap();
        sqlx::query(
            "INSERT INTO atlas_education_dataset VALUES ('uis-education','{}','2026-09-09')",
        )
        .execute(&old)
        .await
        .unwrap();
        old.close().await;
        let state = AtlasState::new(temp.path().to_path_buf());
        let db = state.0.db().await.unwrap();
        assert_eq!(
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM atlas_education_dataset")
                .fetch_one(db)
                .await
                .unwrap(),
            1
        );
        agriculture_store::replace(db, parse(SAMPLE).unwrap())
            .await
            .unwrap();
        let original = agriculture_store::read(db, "m49:356").await.unwrap();
        let mut broken = parse(SAMPLE).unwrap();
        broken.profiles.push(broken.profiles[0].clone());
        broken.provenance.sha256 = "bad".into();
        assert!(agriculture_store::replace(db, broken).await.is_err());
        assert_eq!(
            agriculture_store::read(db, "m49:356")
                .await
                .unwrap()
                .provenance
                .unwrap()
                .sha256,
            original.provenance.unwrap().sha256
        );
        assert_eq!(
            agriculture_store::read(db, "world").await.unwrap().status,
            "unsupported_area"
        );
        let permit = state.0.gate.lock().await;
        assert!(
            state
                .0
                .start_agriculture()
                .await
                .unwrap_err()
                .message
                .contains("läuft bereits")
        );
        drop(permit);
        assert!(
            state
                .0
                .start_agriculture()
                .await
                .unwrap_err()
                .message
                .contains("24 Stunden")
        );
        db.close().await;
        let reopened = store::open(temp.path()).await.unwrap();
        assert_eq!(
            agriculture_store::read(&reopened, "m49:356")
                .await
                .unwrap()
                .profile
                .unwrap()
                .series["15"]
                .last()
                .unwrap()
                .total,
            Some(123.74)
        );
        reopened.close().await;
    }
    #[tokio::test]
    #[ignore = "Explicit complete public FAO source audit; temporary cache only"]
    async fn world_atlas_agriculture_original_source_audit() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../.tmp/atlas-validation/agriculture");
        let bytes = std::fs::read(root.join("source.zip"))
            .expect("Run the public source audit generator first");
        let data = parse(&bytes).unwrap();
        assert_eq!(data.profiles.len(), 234);
        assert_eq!(data.provenance.source_row_count, 1_995_192);
        let areas = data
            .profiles
            .iter()
            .map(|p| p.geography_id.clone())
            .collect::<Vec<_>>();
        let temp = tempfile::tempdir().unwrap();
        let db = store::open(temp.path()).await.unwrap();
        agriculture_store::replace(&db, data).await.unwrap();
        db.close().await;
        let reopened = store::open(temp.path()).await.unwrap();
        let out = root.join("rust-profiles");
        std::fs::create_dir_all(&out).unwrap();
        for id in areas {
            let response = agriculture_store::read(&reopened, &id).await.unwrap();
            std::fs::write(
                out.join(format!("{}.json", id.replace(':', "-"))),
                serde_json::to_vec(&response).unwrap(),
            )
            .unwrap();
        }
        reopened.close().await;
    }
}
