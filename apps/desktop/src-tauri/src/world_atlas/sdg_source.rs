//! Official UN SDG observations, with exact reviewed dimension slices.
use super::{catalog, models::*};
use crate::errors::{CommandError, CommandResult};
use chrono::Utc;
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    time::Duration,
};

const ORIGIN: &str = "https://unstats.un.org/SDGAPI/v1/sdg";
const PAGE_SIZE: u64 = 1000;
const MAX_BODY: usize = 16 * 1024 * 1024;
const CONFIG: &str = include_str!("../../../src/features/world-atlas/data/sdg-catalog.json");

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Config {
    release: String,
    areas: Vec<Area>,
    series: Vec<Definition>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Area {
    code: String,
    provider_label: String,
    geography_id: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Definition {
    #[serde(flatten)]
    series: SeriesDefinition,
    dimensions: BTreeMap<String, String>,
    indicator: String,
    expected_unit: String,
    expected_rows: usize,
    expected_numeric: usize,
    #[serde(default)]
    unfiltered: bool,
}
fn invalid(message: &str) -> CommandError {
    CommandError {
        code: "ATLAS_SDG_SOURCE_ERROR".into(),
        message: message.into(),
        details: None,
    }
}
fn config() -> CommandResult<Config> {
    serde_json::from_str(CONFIG).map_err(|_| invalid("Der UN-SDG-Katalog ist nicht lesbar."))
}

async fn get(client: &reqwest::Client, url: &str) -> CommandResult<(Value, SourcePage)> {
    let parsed = reqwest::Url::parse(url).map_err(|_| invalid("Ungültige UN-SDG-Adresse."))?;
    if parsed.scheme() != "https"
        || parsed.host_str() != Some("unstats.un.org")
        || !parsed.path().starts_with("/SDGAPI/v1/sdg/")
        || parsed.port().is_some()
        || !parsed.username().is_empty()
        || parsed.password().is_some()
    {
        return Err(invalid("Diese UN-SDG-Adresse ist nicht freigegeben."));
    }
    let mut response = client.get(parsed).send().await.map_err(|_| {
        invalid(
            "Die UN-SDG-Quelle ist derzeit nicht erreichbar. Vorhandene Werte bleiben erhalten.",
        )
    })?;
    if !response.status().is_success() {
        return Err(invalid(
            "Die UN-SDG-Quelle hat den Abruf nicht vollständig beantwortet. Bitte später erneut versuchen.",
        ));
    }
    if response
        .content_length()
        .is_some_and(|n| n > MAX_BODY as u64)
    {
        return Err(invalid(
            "Die UN-SDG-Antwort überschreitet die Größenbegrenzung.",
        ));
    }
    let mut bytes = Vec::new();
    while let Some(part) = response
        .chunk()
        .await
        .map_err(|_| invalid("Der UN-SDG-Download wurde unterbrochen."))?
    {
        if bytes.len() + part.len() > MAX_BODY {
            return Err(invalid(
                "Die UN-SDG-Antwort überschreitet die Größenbegrenzung.",
            ));
        }
        bytes.extend_from_slice(&part);
    }
    let value = serde_json::from_slice(&bytes)
        .map_err(|_| invalid("Die UN-SDG-Antwort ist kein gültiger Datensatz."))?;
    Ok((
        value,
        SourcePage {
            url: url.into(),
            sha256: Sha256::digest(&bytes)
                .iter()
                .map(|b| format!("{b:02x}"))
                .collect(),
        },
    ))
}

fn metadata(value: &Value, cfg: &Config, def: &Definition) -> CommandResult<()> {
    let rows = value
        .as_array()
        .ok_or_else(|| invalid("Die UN-SDG-Metadaten sind unvollständig."))?;
    let matches: Vec<_> = rows
        .iter()
        .filter(|r| r["code"] == def.series.provider_code)
        .collect();
    if matches.len() != 1
        || matches[0]["release"] != cfg.release
        || matches[0]["description"] != def.series.provider_label
        || !matches[0]["indicator"]
            .as_array()
            .is_some_and(|v| v.contains(&json!(def.indicator)))
    {
        return Err(invalid(
            "Die UN-SDG-Ausgabe oder Definition weicht vom geprüften Quellenstand ab. Bisherige Werte bleiben erhalten.",
        ));
    }
    Ok(())
}

fn data_url(cfg: &Config, def: &Definition, page: u64) -> String {
    let mut url = reqwest::Url::parse(&format!("{ORIGIN}/Series/Data")).expect("static source URL");
    url.query_pairs_mut()
        .append_pair("seriesCode", &def.series.provider_code)
        .append_pair("releaseCode", &cfg.release)
        .append_pair("page", &page.to_string())
        .append_pair("pageSize", &PAGE_SIZE.to_string());
    // Multiple server filters, including year bounds, returned false empty
    // pages during review. One dimension narrows the response; the exact full
    // slice and historical window are always checked locally below.
    for key in [
        "Sex",
        "Type of renewable technology",
        "Location",
        "Mode of transportation",
    ] {
        // These reviewed service series return HTTP 500 even with one server
        // dimension filter. Their complete pages are validated locally instead.
        if def.unfiltered {
            break;
        }
        if let Some(value) = def.dimensions.get(key) {
            url.query_pairs_mut().append_pair(
                "dimensions",
                &json!([{"name":key,"values":[value]}]).to_string(),
            );
            break;
        }
    }
    url.into()
}

fn collect(rows: &[Value], cfg: &Config, def: &Definition) -> CommandResult<Vec<Observation>> {
    let areas: BTreeMap<_, _> = cfg.areas.iter().map(|a| (a.code.as_str(), a)).collect();
    let mut points = BTreeMap::new();
    for row in rows {
        if row["series"] != def.series.provider_code
            || row["seriesDescription"] != def.series.provider_label
        {
            return Err(invalid(
                "Eine UN-SDG-Zeile gehört zu einer anderen Messgröße.",
            ));
        }
        let dimensions: BTreeMap<String, String> =
            serde_json::from_value(row["dimensions"].clone())
                .map_err(|_| invalid("Die UN-SDG-Untergruppen sind nicht lesbar."))?;
        if dimensions != def.dimensions {
            continue;
        }
        if !row["indicator"]
            .as_array()
            .is_some_and(|ids| ids.contains(&json!(def.indicator)))
        {
            continue;
        }
        let code = row["geoAreaCode"]
            .as_str()
            .ok_or_else(|| invalid("Der UN-SDG-Gebietscode fehlt."))?;
        let Some(area) = areas.get(code) else {
            continue;
        };
        if row["geoAreaName"] != area.provider_label {
            return Err(invalid(
                "Die UN-SDG-Gebietsbezeichnung wurde verändert. Die Zuordnung benötigt eine Quellenprüfung.",
            ));
        }
        let year = row["timePeriodStart"]
            .as_f64()
            .filter(|v| v.is_finite() && v.fract() == 0.0 && (1900.0..=2100.0).contains(v))
            .ok_or_else(|| {
                invalid("Eine UN-SDG-Beobachtung besitzt kein eindeutiges Kalenderjahr.")
            })? as i32;
        if year > def.series.through_year.unwrap_or(2025) {
            continue;
        }
        if row["attributes"]["Units"] != def.expected_unit
            || !matches!(
                row["attributes"]["UnitMultiplier"].as_str(),
                None | Some("UNIT")
            )
        {
            return Err(invalid(
                "Einheit oder Größenfaktor der UN-SDG-Reihe weichen von der geprüften Definition ab.",
            ));
        }
        let value = match row["valueType"].as_str() {
            Some("Float" | "Integer") => {
                let raw = row["value"]
                    .as_str()
                    .ok_or_else(|| invalid("Ein numerischer UN-SDG-Wert fehlt."))?;
                if raw == "NaN" {
                    None
                } else {
                    Some(
                        raw.parse::<f64>()
                            .ok()
                            .filter(|v| v.is_finite())
                            .ok_or_else(|| invalid("Ein numerischer UN-SDG-Wert ist ungültig."))?,
                    )
                }
            }
            Some("String" | "Null") | None => None,
            _ => return Err(invalid("Ein UN-SDG-Wertetyp ist noch nicht geprüft.")),
        };
        for field in [
            "source",
            "time_detail",
            "timeCoverage",
            "basePeriod",
            "lowerBound",
            "upperBound",
        ] {
            if !row[field].is_null() && !row[field].is_string() {
                return Err(invalid(
                    "Ein UN-SDG-Quellenhinweis besitzt ein ungeprüftes Format.",
                ));
            }
        }
        if (!row["footnotes"].is_null()
            && !row["footnotes"]
                .as_array()
                .is_some_and(|notes| notes.iter().all(Value::is_string)))
            || !row["attributes"]
                .as_object()
                .is_some_and(|flags| flags.values().all(Value::is_string))
        {
            return Err(invalid(
                "Die UN-SDG-Fußnoten oder Datenkennzeichen sind nicht lesbar.",
            ));
        }
        // Preserve the original value, bounds, source and flags, even for a
        // non-numeric or suppressed cell. They remain available in the UI.
        let flag=json!({"provider":"unsdg","value":row["value"],"valueType":row["valueType"],"lowerBound":row["lowerBound"],"upperBound":row["upperBound"],"timeDetail":row["time_detail"],"timeCoverage":row["timeCoverage"],"basePeriod":row["basePeriod"],"source":row["source"],"footnotes":row["footnotes"],"attributes":row["attributes"],"dimensions":row["dimensions"]}).to_string();
        if flag.len() > 32768 {
            return Err(invalid(
                "Die UN-SDG-Quellenangaben überschreiten den geprüften Umfang.",
            ));
        }
        if points
            .insert(
                (area.geography_id.clone(), year),
                Point {
                    year,
                    value,
                    source_flag: flag,
                },
            )
            .is_some()
        {
            return Err(invalid(
                "Mehrere UN-SDG-Beobachtungen konkurrieren im selben Länderjahr. Sie werden nicht gemittelt.",
            ));
        }
    }
    if points.values().filter(|p| p.value.is_some()).count() != def.expected_numeric {
        return Err(invalid(
            "Der vollständige UN-SDG-Datenumfang stimmt nicht mit der geprüften Ausgabe überein. Der bisherige lokale Stand bleibt erhalten.",
        ));
    }
    Ok(points
        .into_iter()
        .map(|((geography_id, _), point)| Observation {
            geography_id,
            point,
        })
        .collect())
}

pub async fn download(series: &SeriesDefinition) -> CommandResult<Download> {
    let cfg = config()?;
    let def = cfg
        .series
        .iter()
        .find(|d| d.series.id == series.id)
        .ok_or_else(|| invalid("Unbekannte UN-SDG-Reihe."))?;
    catalog::series(&def.series.id)?;
    let client = reqwest::Client::builder()
        .tls_backend_rustls()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(120))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("PersonalMacro-Atlas/0.1")
        .build()
        .map_err(|_| invalid("Der UN-SDG-Datenclient konnte nicht gestartet werden."))?;
    let metadata_url = format!("{ORIGIN}/Series/List");
    let (before, before_page) = get(&client, &metadata_url).await?;
    metadata(&before, &cfg, def)?;
    let mut pages = vec![before_page];
    let mut rows = Vec::new();
    let mut page = 1;
    let mut expected_pages = None;
    loop {
        let (data, provenance) = get(&client, &data_url(&cfg, def, page)).await?;
        let total_pages = data["totalPages"]
            .as_u64()
            .filter(|v| (1..=100).contains(v))
            .ok_or_else(|| invalid("Die UN-SDG-Seitenfolge ist leer oder zu groß."))?;
        if data["pageNumber"] != page
            || data["size"] != PAGE_SIZE
            || data["totalElements"] != def.expected_rows
            || expected_pages.is_some_and(|n| n != total_pages)
            || total_pages != (def.expected_rows as u64).div_ceil(PAGE_SIZE)
        {
            return Err(invalid(
                "Die UN-SDG-Paginierung oder der Umfang der Ausgabe wurden verändert.",
            ));
        }
        expected_pages = Some(total_pages);
        let next = data["data"]
            .as_array()
            .filter(|v| v.len() <= PAGE_SIZE as usize)
            .ok_or_else(|| invalid("Die UN-SDG-Datenseite ist unvollständig."))?;
        rows.extend(next.iter().cloned());
        pages.push(provenance);
        if page == total_pages {
            break;
        }
        page += 1;
    }
    if rows.len() != def.expected_rows {
        return Err(invalid("Der UN-SDG-Download ist unvollständig."));
    }
    let observations = collect(&rows, &cfg, def)?;
    let (after, after_page) = get(&client, &metadata_url).await?;
    metadata(&after, &cfg, def)?;
    pages.push(after_page);
    let source_organizations: BTreeSet<String> = rows
        .iter()
        .filter_map(|r| r["source"].as_str().map(str::to_owned))
        .collect();
    Ok(Download {
        provenance: Provenance {
            retrieved_at: Utc::now().to_rfc3339(),
            provider_updated_at: cfg.release.clone(),
            source_organization: format!(
                "UN Statistics Division · Global SDG Database. {} getrennte Originalquellenangaben; die jeweilige Angabe steht am Datenpunkt.",
                source_organizations.len()
            ),
            definition: format!("{}\n{}", def.series.provider_label, def.series.explanation),
            metadata_url: format!(
                "https://unstats.un.org/sdgs/dataportal/database?indicator={}",
                def.indicator
            ),
            pages,
            provider_areas: cfg.areas.iter().map(|a| a.geography_id.clone()).collect(),
        },
        observations,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::world_atlas::store;

    fn fixture() -> (Config, Value) {
        let mut cfg = config().unwrap();
        cfg.series
            .retain(|d| d.series.provider_code == "ER_RSK_LST");
        cfg.series[0].expected_numeric = 1;
        let def = &cfg.series[0];
        let row = json!({"series":def.series.provider_code,"seriesDescription":def.series.provider_label,
            "indicator":[def.indicator],"dimensions":def.dimensions,"geoAreaCode":"276","geoAreaName":"Germany",
            "timePeriodStart":2020,"value":"0","valueType":"Float","attributes":{"Units":def.expected_unit,"Nature":"E"},
            "lowerBound":"0","upperBound":"0.02","footnotes":["Uncertainty retained"],"source":"Test source"});
        (cfg, row)
    }

    #[test]
    fn sdg_preserves_zero_missing_uncertainty_and_exact_slices() {
        let (cfg, row) = fixture();
        let mut missing = row.clone();
        missing["timePeriodStart"] = json!(2021);
        missing["valueType"] = json!("String");
        missing["value"] = json!("..");
        let mut other = row.clone();
        other["dimensions"]["Sex"] = json!("FEMALE");
        let mut other_indicator = row.clone();
        other_indicator["indicator"] = json!(["different duplicate indicator"]);
        let mut future = row.clone();
        future["timePeriodStart"] = json!(2026);
        let mut nan = row.clone();
        nan["timePeriodStart"] = json!(2022);
        nan["value"] = json!("NaN");
        let points = collect(
            &[row, missing, other, other_indicator, future, nan],
            &cfg,
            &cfg.series[0],
        )
        .unwrap();
        assert_eq!(points.len(), 3);
        assert_eq!(points[0].point.value, Some(0.0));
        assert_eq!(points[1].point.value, None);
        assert_eq!(points[2].point.value, None);
        let flag: Value = serde_json::from_str(&points[0].point.source_flag).unwrap();
        assert_eq!(flag["upperBound"], "0.02");
        assert_eq!(flag["attributes"]["Nature"], "E");
        assert_eq!(flag["source"], "Test source");
        let missing_flag: Value = serde_json::from_str(&points[1].point.source_flag).unwrap();
        assert_eq!(missing_flag["value"], "..");
    }

    #[test]
    fn sdg_rejects_changed_identity_units_duplicates_and_release() {
        let (cfg, row) = fixture();
        for (field, value) in [
            ("seriesDescription", json!("different")),
            ("geoAreaName", json!("France")),
            ("timePeriodStart", json!(2020.5)),
            ("value", json!("Infinity")),
            ("valueType", json!("RoundedRange")),
            ("footnotes", json!({"invalid":"object"})),
        ] {
            let mut changed = row.clone();
            changed[field] = value;
            assert!(
                collect(&[changed], &cfg, &cfg.series[0]).is_err(),
                "{field}"
            );
        }
        let mut changed = row.clone();
        changed["attributes"]["Units"] = json!("PERCENT");
        assert!(collect(&[changed], &cfg, &cfg.series[0]).is_err());
        assert!(collect(&[row.clone(), row], &cfg, &cfg.series[0]).is_err());
        let def = &cfg.series[0];
        let mut meta = json!([{"code":def.series.provider_code,"description":def.series.provider_label,"release":cfg.release,"indicator":[def.indicator]}]);
        metadata(&meta, &cfg, def).unwrap();
        meta[0]["release"] = json!("new-unreviewed-release");
        assert!(metadata(&meta, &cfg, def).is_err());
        let url = data_url(&cfg, def, 2);
        assert!(!url.contains("timePeriod"));
        assert!(url.contains("releaseCode=2026.Q2.G.02"));
        let live = config().unwrap();
        let services = live
            .series
            .iter()
            .find(|d| d.series.provider_code == "SP_PSR_OSATIS_GOV")
            .unwrap();
        assert!(!data_url(&live, services, 1).contains("dimensions="));
        assert!(data_url(&live, services, 1).contains("pageSize=1000"));
    }

    #[tokio::test]
    #[ignore = "Full independently downloaded UN release in .tmp; only a temporary SQLite cache"]
    async fn sdg_reviewed_release_roundtrip() {
        let cfg = config().unwrap();
        let source =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../.tmp/atlas-expansion");
        let metadata_rows: Value =
            serde_json::from_slice(&std::fs::read(source.join("sdg-series.json")).unwrap())
                .unwrap();
        let temp = tempfile::tempdir().unwrap();
        let db = store::open(temp.path()).await.unwrap();
        let mut total = 0;
        for def in &cfg.series {
            metadata(&metadata_rows, &cfg, def).unwrap();
            let file_id = def.series.id.replace(':', "_");
            let mut rows = Vec::new();
            for page in 1..=def.expected_rows.div_ceil(PAGE_SIZE as usize) {
                let path = source.join(format!("{file_id}-slice-{page}.json"));
                let data: Value = serde_json::from_slice(
                    &std::fs::read(&path).unwrap_or_else(|_| panic!("{}", path.display())),
                )
                .unwrap();
                assert_eq!(data["totalElements"], def.expected_rows);
                assert_eq!(data["pageNumber"], page);
                rows.extend(data["data"].as_array().unwrap().iter().cloned());
            }
            assert_eq!(rows.len(), def.expected_rows);
            let observations = collect(&rows, &cfg, def)
                .unwrap_or_else(|e| panic!("{}: {}", def.series.id, e.message));
            total += observations
                .iter()
                .filter(|p| p.point.value.is_some())
                .count();
            store::replace_dataset(
                &db,
                &def.series.id,
                Download {
                    provenance: Provenance {
                        retrieved_at: "2026-09-10T12:00:00Z".into(),
                        provider_updated_at: cfg.release.clone(),
                        source_organization: "UN SDG".into(),
                        definition: def.series.explanation.clone(),
                        metadata_url: ORIGIN.into(),
                        pages: vec![],
                        provider_areas: cfg.areas.iter().map(|a| a.geography_id.clone()).collect(),
                    },
                    observations,
                },
            )
            .await
            .unwrap();
        }
        assert_eq!(total, 80_641);
        db.close().await;
        let db = store::open(temp.path()).await.unwrap();
        let count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM atlas_observations WHERE value IS NOT NULL")
                .fetch_one(&db)
                .await
                .unwrap();
        assert_eq!(count, 80_641);
        let expected: Vec<Value> = serde_json::from_slice(
            &std::fs::read(source.join("../atlas-remaining-40/sdg-services-expected.json"))
                .unwrap(),
        )
        .unwrap();
        assert_eq!(expected.len(), 730);
        for original in expected {
            let (value, flag): (Option<f64>, String) = sqlx::query_as("SELECT value, source_flag FROM atlas_observations WHERE series_id=? AND geography_id=? AND year=?")
                .bind(original["seriesId"].as_str().unwrap())
                .bind(original["geographyId"].as_str().unwrap())
                .bind(original["year"].as_i64().unwrap())
                .fetch_one(&db).await.unwrap();
            assert_eq!(value, original["value"].as_f64());
            assert_eq!(
                serde_json::from_str::<Value>(&flag).unwrap(),
                original["sourceFlag"]
            );
        }
        let germany = store::read_series(
            &db,
            SeriesInput {
                series_id: "unsdg:ER_RSK_LST".into(),
                geography_id: "m49:276".into(),
            },
        )
        .await
        .unwrap();
        assert_eq!(germany.status, "available");
        assert!(germany.points.len() > 20);
        assert!(!germany.points[0].source_flag.is_empty());
        let africa = store::read_series(
            &db,
            SeriesInput {
                series_id: "unsdg:ER_RSK_LST".into(),
                geography_id: "un-wpp:903".into(),
            },
        )
        .await
        .unwrap();
        assert_eq!(africa.status, "unsupported_area");
        assert!(africa.points.is_empty());
        db.close().await;
        println!(
            "38 UN SDG perspectives, 80,641 original numeric values, 278 NaN source markers retained as missing; all 730 service observations independently compared including complete flags and footnotes; exact country mapping and offline reopen verified."
        );
    }
}
