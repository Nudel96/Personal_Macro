use std::{
    collections::{BTreeMap, HashMap, HashSet},
    time::Duration,
};

use chrono::{Datelike, Utc};
use reqwest::Client;
use serde_json::Value;
use sha2::{Digest, Sha256};
use sqlx::SqlitePool;

use super::{catalog, models::*, store};
use crate::errors::{CommandError, CommandResult};

const ORIGIN: &str = "https://api.worldbank.org";
const MAX_BODY: usize = 12 * 1024 * 1024;
const MAX_PAGES: u32 = 20;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RegionDefinition {
    code: String,
    provider_label: String,
    geography_id: String,
}

fn regions() -> CommandResult<&'static [RegionDefinition]> {
    #[derive(serde::Deserialize)]
    struct Config {
        regions: Vec<RegionDefinition>,
    }
    static REGIONS: std::sync::OnceLock<Result<Vec<RegionDefinition>, serde_json::Error>> =
        std::sync::OnceLock::new();
    REGIONS
        .get_or_init(|| {
            serde_json::from_str::<Config>(include_str!(
                "../../../src/features/world-atlas/data/africa-development-catalog.json"
            ))
            .map(|config| config.regions)
        })
        .as_ref()
        .map(Vec::as_slice)
        .map_err(|_| source_error("Die Weltbank-Regionszuordnungen sind ungültig."))
}

/// A WDI aggregate has its own identity and never borrows a country's ISO code.
pub fn geography_code(geography: &Geography) -> CommandResult<String> {
    if !geography.iso3.is_empty() {
        return Ok(geography.iso3.clone());
    }
    Ok(regions()?
        .iter()
        .find(|region| region.geography_id == geography.id)
        .map(|region| region.code.clone())
        .unwrap_or_default())
}

fn supported_areas(countries: &Page) -> CommandResult<Vec<String>> {
    if countries.pages != 1 || countries.rows.len() != countries.total as usize {
        return Err(source_error(
            "Das Weltbank-Gebietsverzeichnis hat sich verändert und muss erneut geprüft werden.",
        ));
    }
    let mut supported = vec!["WLD".into()];
    for country in &countries.rows {
        if country["region"]["id"]
            .as_str()
            .is_some_and(|id| !id.is_empty() && id != "NA")
        {
            let id = text(country, "id", 3);
            if id.len() == 3 {
                supported.push(id);
            }
        }
    }
    for region in regions()? {
        let matches: Vec<_> = countries
            .rows
            .iter()
            .filter(|country| country["id"].as_str() == Some(&region.code))
            .collect();
        if matches.len() != 1
            || matches[0]["name"].as_str().map(str::trim) != Some(region.provider_label.as_str())
            || matches[0]["region"]["id"].as_str() != Some("NA")
        {
            return Err(source_error(
                "Eine Weltbank-Region hat ihre Quellenidentität geändert. Die Zuordnung muss vor dem nächsten Abruf geprüft werden.",
            ));
        }
        supported.push(region.code.clone());
    }
    supported.sort();
    supported.dedup();
    Ok(supported)
}

fn source_error(message: &str) -> CommandError {
    CommandError {
        code: "ATLAS_SOURCE_ERROR".into(),
        message: message.into(),
        details: None,
    }
}

fn integer(value: &Value) -> Option<u32> {
    value
        .as_u64()
        .and_then(|v| v.try_into().ok())
        .or_else(|| value.as_str()?.parse().ok())
}

struct Page {
    page: u32,
    pages: u32,
    total: u32,
    updated_at: String,
    rows: Vec<Value>,
}

fn parse_page(value: Value, expected: u32) -> CommandResult<Page> {
    let array = value
        .as_array()
        .filter(|array| array.len() == 2)
        .ok_or_else(|| source_error("Die Weltbank hat keine gültige Datenseite geliefert."))?;
    let page = integer(&array[0]["page"])
        .filter(|page| *page == expected)
        .ok_or_else(|| {
            source_error("Die Seitennummer der Weltbank-Antwort passt nicht zur Anfrage.")
        })?;
    let pages = integer(&array[0]["pages"])
        .filter(|pages| (1..=MAX_PAGES).contains(pages))
        .ok_or_else(|| {
            source_error("Der Umfang der Weltbank-Antwort liegt außerhalb der Abrufgrenzen.")
        })?;
    let total = integer(&array[0]["total"])
        .filter(|total| *total <= 100_000)
        .ok_or_else(|| source_error("Die Weltbank-Antwort enthält keine gültige Gesamtzahl."))?;
    if page > pages {
        return Err(source_error("Die Weltbank-Seitenfolge ist unvollständig."));
    }
    let rows = if array[1].is_null() && total == 0 {
        vec![]
    } else {
        array[1]
            .as_array()
            .filter(|rows| rows.len() <= 5000)
            .cloned()
            .ok_or_else(|| source_error("Die Weltbank-Datensätze sind nicht lesbar."))?
    };
    let updated_at = array[0]["lastupdated"]
        .as_str()
        .unwrap_or("")
        .chars()
        .take(80)
        .collect();
    Ok(Page {
        page,
        pages,
        total,
        updated_at,
        rows,
    })
}

async fn get(client: &Client, url: &str) -> CommandResult<(Value, SourcePage)> {
    let parsed = reqwest::Url::parse(url).map_err(|_| source_error("Ungültige Quellenadresse."))?;
    if parsed.scheme() != "https"
        || parsed.host_str() != Some("api.worldbank.org")
        || parsed.port().is_some()
        || !parsed.username().is_empty()
        || parsed.password().is_some()
    {
        return Err(source_error(
            "Diese Quellenadresse ist im Atlas nicht freigegeben.",
        ));
    }
    for attempt in 0..3 {
        let result = client.get(parsed.clone()).send().await;
        match result {
            Err(_) if attempt < 2 => {}
            Err(_) => {
                return Err(source_error(
                    "Die Weltbank ist momentan nicht erreichbar. Der vorhandene Datenstand bleibt erhalten.",
                ));
            }
            Ok(response)
                if (response.status().as_u16() == 429 || response.status().is_server_error())
                    && attempt < 2 => {}
            Ok(mut response) => {
                if !response.status().is_success() {
                    return Err(source_error(
                        "Die Weltbank hat den Abruf abgelehnt. Bitte später erneut versuchen.",
                    ));
                }
                if response
                    .content_length()
                    .is_some_and(|length| length > MAX_BODY as u64)
                {
                    return Err(source_error(
                        "Die Quellenantwort überschreitet die erlaubte Größe.",
                    ));
                }
                let mut bytes = Vec::new();
                while let Some(chunk) = response.chunk().await.map_err(|_| {
                    source_error("Die Quellenantwort wurde nicht vollständig übertragen.")
                })? {
                    if bytes.len() + chunk.len() > MAX_BODY {
                        return Err(source_error(
                            "Die Quellenantwort überschreitet die erlaubte Größe.",
                        ));
                    }
                    bytes.extend_from_slice(&chunk);
                }
                let hash = Sha256::digest(&bytes)
                    .iter()
                    .map(|byte| format!("{byte:02x}"))
                    .collect::<String>();
                let value = serde_json::from_slice(&bytes).map_err(|_| {
                    source_error("Die Weltbank-Antwort enthält kein gültiges JSON.")
                })?;
                return Ok((
                    value,
                    SourcePage {
                        url: parsed.to_string(),
                        sha256: hash,
                    },
                ));
            }
        }
        tokio::time::sleep(Duration::from_secs(2 * (attempt + 1))).await;
    }
    Err(source_error(
        "Der Quellenabruf konnte nicht abgeschlossen werden.",
    ))
}

fn text(value: &Value, key: &str, max: usize) -> String {
    value[key]
        .as_str()
        .unwrap_or("")
        .chars()
        .take(max)
        .collect()
}

fn validate_metadata<'a>(
    metadata: &'a Page,
    definition: &SeriesDefinition,
) -> CommandResult<&'a Value> {
    let rows: Vec<_> = metadata
        .rows
        .iter()
        .filter(|row| {
            row["id"].as_str() == Some(&definition.provider_code)
                && row["source"]["id"].as_str() == Some("2")
        })
        .collect();
    if metadata.pages != 1 || metadata.total as usize != metadata.rows.len() || rows.len() != 1 {
        return Err(source_error(
            "Die Statistik ist nicht mehr eindeutig dem WDI-Datensatz zugeordnet.",
        ));
    }
    let info = rows[0];
    let normalize = |name: &str| name.split_whitespace().collect::<Vec<_>>().join(" ");
    if info["name"]
        .as_str()
        .is_none_or(|name| normalize(name) != normalize(&definition.provider_label))
    {
        return Err(source_error(
            "Die Quellenbezeichnung oder Preisbasis dieser Statistik hat sich verändert und muss vor der nächsten Übernahme geprüft werden. Der bisherige Stand bleibt erhalten.",
        ));
    }
    Ok(info)
}

fn parse_observations(
    rows: Vec<Value>,
    code: &str,
    areas: &HashMap<String, String>,
    first_year: i32,
    last_year: i32,
) -> CommandResult<Vec<Observation>> {
    let mut result = BTreeMap::<(String, i32), Point>::new();
    for row in rows {
        if row["indicator"]["id"].as_str() != Some(code) {
            return Err(source_error(
                "Die Quelle hat eine andere Statistik als angefragt geliefert.",
            ));
        }
        let iso = row["countryiso3code"]
            .as_str()
            .ok_or_else(|| source_error("Eine Gebietszuordnung fehlt in der Quellenantwort."))?;
        let Some(area) = areas.get(iso) else {
            continue;
        };
        let year: i32 = row["date"]
            .as_str()
            .and_then(|year| year.parse().ok())
            .filter(|year| (first_year..=last_year).contains(year))
            .ok_or_else(|| source_error("Die Quelle enthält eine unerwartete Bezugsperiode."))?;
        let raw = row
            .get("value")
            .ok_or_else(|| source_error("Ein Wertefeld fehlt in der Quellenantwort."))?;
        let value = if raw.is_null() {
            None
        } else {
            Some(
                raw.as_f64()
                    .filter(|value| value.is_finite())
                    .ok_or_else(|| source_error("Ein Quellenwert ist nicht numerisch."))?,
            )
        };
        let point = Point {
            year,
            value,
            source_flag: text(&row, "obs_status", 80),
        };
        let key = (area.clone(), year);
        if let Some(previous) = result.get(&key) {
            if previous.value != point.value || previous.source_flag != point.source_flag {
                return Err(source_error(
                    "Die Quelle enthält widersprüchliche Doppelwerte.",
                ));
            }
        } else {
            result.insert(key, point);
        }
    }
    Ok(result
        .into_iter()
        .map(|((geography_id, _), point)| Observation {
            geography_id,
            point,
        })
        .collect())
}

pub async fn download(
    db: &SqlitePool,
    session: &str,
    job: &mut SyncJob,
    definition: &SeriesDefinition,
) -> CommandResult<Download> {
    download_inner(Some((db, session, job)), definition).await
}

pub async fn download_for_batch(definition: &SeriesDefinition) -> CommandResult<Download> {
    download_inner(None, definition).await
}

fn end_year(definition: &SeriesDefinition, current_year: i32) -> CommandResult<i32> {
    match definition.through_year {
        Some(year) if !(1960..=current_year).contains(&year) => Err(source_error(
            "Das freigegebene Zeitfenster dieser Statistik ist ungültig.",
        )),
        Some(year) => Ok(year),
        None => Ok(current_year),
    }
}

async fn download_inner(
    mut progress: Option<(&SqlitePool, &str, &mut SyncJob)>,
    definition: &SeriesDefinition,
) -> CommandResult<Download> {
    let end_year = end_year(definition, Utc::now().year())?;
    let client = Client::builder()
        .tls_backend_rustls()
        .timeout(Duration::from_secs(30))
        .connect_timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("PersonalMacro-WorldAtlas/0.1")
        .build()
        .map_err(|_| source_error("Der Atlas-Datenclient konnte nicht gestartet werden."))?;
    let code = &definition.provider_code;
    let metadata_url = format!("{ORIGIN}/v2/indicator/{code}?source=2&format=json");
    let (metadata_json, metadata_page) = get(&client, &metadata_url).await?;
    let metadata = parse_page(metadata_json, 1)?;
    let info = validate_metadata(&metadata, definition)?;
    let mut provenance = Provenance {
        retrieved_at: Utc::now().to_rfc3339(),
        provider_updated_at: String::new(),
        source_organization: text(info, "sourceOrganization", 8000),
        definition: text(info, "sourceNote", 16000),
        metadata_url,
        pages: vec![metadata_page],
        provider_areas: vec![],
    };
    let (country_json, country_page) = get(
        &client,
        &format!("{ORIGIN}/v2/country?format=json&per_page=500"),
    )
    .await?;
    let countries = parse_page(country_json, 1)?;
    provenance.pages.push(country_page);
    provenance.provider_areas = supported_areas(&countries)?;
    let supported: HashSet<_> = provenance.provider_areas.iter().cloned().collect();
    let mut area_map = HashMap::new();
    for area in catalog::catalog()?.geographies {
        let code = geography_code(&area)?;
        if supported.contains(&code) && area_map.insert(code, area.id).is_some() {
            return Err(source_error(
                "Eine Weltbank-Gebietskennung ist mehrfach zugeordnet.",
            ));
        }
    }
    let mut rows = Vec::new();
    let mut total = None;
    let mut expected_pages = None;
    for page_number in 1..=MAX_PAGES {
        let url = format!(
            "{ORIGIN}/v2/country/all/indicator/{code}?source=2&format=json&date=1960:{end_year}&per_page=5000&page={page_number}"
        );
        let (value, source_page) = get(&client, &url).await?;
        let page = parse_page(value, page_number)?;
        if total.is_some_and(|total| page.total != total)
            || expected_pages.is_some_and(|pages| pages != page.pages)
            || (page_number > 1 && page.updated_at != provenance.provider_updated_at)
        {
            return Err(source_error(
                "Die Quelle wurde während des Abrufs verändert. Bitte den Abruf wiederholen.",
            ));
        }
        total = Some(page.total);
        expected_pages = Some(page.pages);
        provenance.provider_updated_at = page.updated_at;
        provenance.pages.push(source_page);
        rows.extend(page.rows);
        if let Some((db, session, job)) = progress.as_mut() {
            job.page = page.page;
            job.pages = page.pages;
            job.message =
                "Länderzeitreihen werden geladen. Der bisherige Datenstand bleibt verfügbar."
                    .into();
            store::save_job(db, session, job).await?;
        }
        if page.page == page.pages {
            break;
        }
    }
    if rows.len() != total.unwrap_or_default() as usize {
        return Err(source_error(
            "Die Quelle wurde nicht vollständig abgerufen. Der vorherige Datenstand bleibt erhalten.",
        ));
    }
    let observations = parse_observations(rows, code, &area_map, 1960, end_year)?;
    Ok(Download {
        provenance,
        observations,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn africa_countries() -> Page {
        let mut rows: Vec<Value> = regions().unwrap().iter().map(|region|
            json!({"id":region.code,"name":format!("{} ", region.provider_label),"region":{"id":"NA"}})
        ).collect();
        rows.push(json!({"id":"NGA","name":"Nigeria","region":{"id":"SSF"}}));
        rows.push(json!({"id":"AFR","name":"Africa","region":{"id":"NA"}}));
        rows.push(json!({"id":"CHI","name":"Channel Islands","region":{"id":"ECS"}}));
        parse_page(json!([{"page":1,"pages":1,"total":rows.len()}, rows]), 1).unwrap()
    }

    #[test]
    fn world_atlas_africa_regions_require_explicit_matching_provider_identities() {
        let mut countries = africa_countries();
        let supported = supported_areas(&countries).unwrap();
        assert!(supported.contains(&"SSF".into()));
        assert!(supported.contains(&"NGA".into()));
        assert!(!supported.contains(&"AFR".into()));
        for (id, expected) in [
            ("worldbank:SSF", "SSF"),
            ("m49:566", "NGA"),
            ("un-wpp:903", ""),
            ("m49:832", "JEY"),
        ] {
            assert_eq!(
                geography_code(&catalog::geography(id).unwrap()).unwrap(),
                expected
            );
        }
        countries.rows[0]["name"] = json!("Different regional boundary");
        assert!(supported_areas(&countries).is_err());
        let mut duplicate = africa_countries();
        duplicate.rows.push(duplicate.rows[0].clone());
        duplicate.total += 1;
        assert!(supported_areas(&duplicate).is_err());
        let mut wrong_kind = africa_countries();
        wrong_kind.rows[0]["region"]["id"] = json!("SSF");
        assert!(supported_areas(&wrong_kind).is_err());
    }

    #[tokio::test]
    async fn world_atlas_africa_cache_preserves_published_regions_nulls_and_signed_values() {
        let dir = tempfile::tempdir().unwrap();
        let db = store::open(dir.path()).await.unwrap();
        let id = "worldbank:2:DT.ODA.ODAT.GN.ZS";
        let code = "DT.ODA.ODAT.GN.ZS";
        let map = HashMap::from([
            ("SSF".into(), "worldbank:SSF".into()),
            ("NGA".into(), "m49:566".into()),
        ]);
        let row = |area, year, value| json!({"indicator":{"id":code},"countryiso3code":area,"date":year,"value":value,"obs_status":""});
        let data = parse_observations(
            vec![
                row("SSF", "2021", json!(-2)),
                row("SSF", "2022", json!(0)),
                row("SSF", "2023", json!(null)),
                row("NGA", "2021", json!(120)),
                row("AFR", "2021", json!(999)),
            ],
            code,
            &map,
            1960,
            2024,
        )
        .unwrap();
        let provenance = Provenance {
            retrieved_at: "2026-09-15T00:00:00Z".into(),
            provider_updated_at: "2026-07-13".into(),
            source_organization: "World Bank".into(),
            definition: "Reviewed source".into(),
            metadata_url: format!("{ORIGIN}/v2/indicator/{code}"),
            pages: vec![],
            provider_areas: supported_areas(&africa_countries()).unwrap(),
        };
        store::replace_dataset(
            &db,
            id,
            Download {
                provenance,
                observations: data,
            },
        )
        .await
        .unwrap();
        let read = |area: &str| {
            store::read_series(
                &db,
                SeriesInput {
                    series_id: id.into(),
                    geography_id: area.into(),
                },
            )
        };
        let region = read("worldbank:SSF").await.unwrap();
        assert_eq!(region.status, "available");
        assert_eq!(
            region.points.iter().map(|p| p.value).collect::<Vec<_>>(),
            vec![Some(-2.0), Some(0.0), None]
        );
        assert_eq!(read("worldbank:AFE").await.unwrap().status, "empty");
        assert_eq!(read("un-wpp:903").await.unwrap().status, "unsupported_area");
        assert_eq!(read("m49:832").await.unwrap().status, "unsupported_area");
        assert_eq!(read("m49:566").await.unwrap().points[0].value, Some(120.0));
        db.close().await;
    }

    #[test]
    fn world_atlas_curated_model_window_does_not_roll_forward_with_the_calendar() {
        let model = catalog::series("worldbank:2:SL.AGR.EMPL.ZS").unwrap();
        assert_eq!(end_year(&model, 2026).unwrap(), 2024);
        assert_eq!(end_year(&model, 2032).unwrap(), 2024);
        assert!(end_year(&model, 2023).is_err());
        let mut ordinary = catalog::series("worldbank:2:NV.MNF.CHEM.ZS.UN").unwrap();
        assert_eq!(end_year(&ordinary, 2026).unwrap(), 2026);
        ordinary.through_year = Some(1959);
        assert!(end_year(&ordinary, 2026).is_err());
        let areas = HashMap::from([("IND".into(), "m49:356".into())]);
        let unreviewed = json!({"indicator":{"id":model.provider_code},"countryiso3code":"IND","date":"2025","value":40,"obs_status":""});
        assert!(
            parse_observations(vec![unreviewed], &model.provider_code, &areas, 1960, 2024).is_err()
        );
    }

    #[tokio::test]
    #[ignore = "Explicit worldwide statistics source and isolated SQLite integration review"]
    async fn world_atlas_live_statistics_expansion_roundtrip() {
        let directory = tempfile::tempdir().unwrap();
        let db = store::open(directory.path()).await.unwrap();
        let catalog = catalog::catalog().unwrap();
        let export = std::env::var("ATLAS_WRITE_STATISTICS_REVIEW").as_deref() == Ok("1");
        let review_dir = std::path::Path::new("../.tmp/atlas-validation");
        let mut fixtures = Vec::new();
        let mut evidence = Vec::new();
        let mut failures = Vec::new();
        for series in &catalog.series {
            let mut job = SyncJob {
                id: uuid::Uuid::new_v4().to_string(),
                series_id: series.id.clone(),
                status: "running".into(),
                page: 0,
                pages: 0,
                observations: 0,
                message: String::new(),
                started_at: Utc::now().to_rfc3339(),
                finished_at: None,
            };
            let result = match download(&db, "statistics-integration", &mut job, series).await {
                Ok(result) => result,
                Err(error) => {
                    println!("{}: FAILED {}", series.provider_code, error.message);
                    failures.push(series.id.clone());
                    continue;
                }
            };
            assert!(job.pages > 1, "Pagination was not exercised");
            assert!(result.provenance.provider_areas.len() > 200);
            assert!(
                result
                    .provenance
                    .pages
                    .iter()
                    .all(|page| page.sha256.len() == 64 && page.url.starts_with(ORIGIN))
            );
            let mut area_values = BTreeMap::<String, Vec<&Point>>::new();
            for observation in &result.observations {
                if observation.point.value.is_some() {
                    area_values
                        .entry(observation.geography_id.clone())
                        .or_default()
                        .push(&observation.point);
                }
            }
            let count = result.observations.len();
            let non_null: usize = area_values.values().map(Vec::len).sum();
            assert!(count > 5_000 && non_null > 0);
            let coverage: Vec<Value> = catalog.geographies.iter().map(|area| {
                let points = area_values.get(&area.id);
                json!({"geographyId":area.id,"iso3":area.iso3,"availableYears":points.map_or(0, Vec::len),
                    "first":points.and_then(|points| points.iter().map(|point| point.year).min()),
                    "last":points.and_then(|points| points.iter().map(|point| point.year).max()),
                    "providerArea":result.provenance.provider_areas.contains(&area.iso3)})
            }).collect();
            let mapped: HashSet<_> = catalog
                .geographies
                .iter()
                .map(|area| area.iso3.as_str())
                .collect();
            let unmapped: Vec<_> = result
                .provenance
                .provider_areas
                .iter()
                .filter(|iso| !mapped.contains(iso.as_str()))
                .collect();
            evidence.push(json!({"seriesId":series.id,"code":series.provider_code,"storedRowsIncludingNull":count,"nonNullValues":non_null,
                "sourceUpdatedAt":result.provenance.provider_updated_at,"retrievedAt":result.provenance.retrieved_at,
                "sourcePages":result.provenance.pages,"unmappedProviderAreas":unmapped,"coverage":coverage}));
            let areas_with_values = area_values.len();
            store::replace_dataset(&db, &series.id, result)
                .await
                .unwrap();
            for iso in [
                "DEU", "USA", "IND", "CHN", "BRA", "NGA", "ZAF", "JPN", "WLD",
            ] {
                let area = catalog
                    .geographies
                    .iter()
                    .find(|area| area.iso3 == iso)
                    .unwrap();
                let response = store::read_series(
                    &db,
                    SeriesInput {
                        series_id: series.id.clone(),
                        geography_id: area.id.clone(),
                    },
                )
                .await
                .unwrap();
                let values = response
                    .points
                    .iter()
                    .filter(|point| point.value.is_some())
                    .count();
                assert_eq!(
                    response.status,
                    if values > 0 { "available" } else { "empty" }
                );
                if series.explanation.is_empty() && ["DEU", "USA", "IND", "CHN"].contains(&iso) {
                    assert!(
                        values > 10,
                        "Original baseline lost coverage: {} {iso}",
                        series.id
                    );
                }
                fixtures.push(serde_json::to_value(response).unwrap());
            }
            println!(
                "{}: {areas_with_values} areas with data, {non_null} usable values; {count} stored rows including null",
                series.provider_code
            );
            if export {
                std::fs::create_dir_all(review_dir).unwrap();
                std::fs::write(
                    review_dir.join("statistics-review.json"),
                    serde_json::to_vec(&fixtures).unwrap(),
                )
                .unwrap();
                std::fs::write(
                    review_dir.join("statistics/coverage.json"),
                    serde_json::to_vec_pretty(&evidence).unwrap(),
                )
                .unwrap();
            }
        }
        db.close().await;
        let reopened = store::open(directory.path()).await.unwrap();
        for fixture in &fixtures {
            let response = store::read_series(
                &reopened,
                SeriesInput {
                    series_id: fixture["series"]["id"].as_str().unwrap().into(),
                    geography_id: fixture["geography"]["id"].as_str().unwrap().into(),
                },
            )
            .await
            .unwrap();
            assert_eq!(
                serde_json::to_value(response).unwrap(),
                *fixture,
                "Offline restart must preserve the full response"
            );
        }
        reopened.close().await;
        assert!(failures.is_empty(), "Failed series: {failures:?}");
        assert_eq!(fixtures.len(), catalog.series.len() * 9);
        println!(
            "Verified {} statistics and {} isolated native/offline responses",
            catalog.series.len(),
            fixtures.len()
        );
    }

    #[tokio::test]
    #[ignore = "Explicit current WDI purchasing-power originals and temporary SQLite verification"]
    async fn world_atlas_purchasing_power_release_roundtrip() {
        let directory = tempfile::tempdir().unwrap();
        let db = store::open(directory.path()).await.unwrap();
        let geographies = catalog::catalog().unwrap().geographies;
        let geo_ids: HashMap<_, _> = geographies
            .iter()
            .filter(|g| !g.iso3.is_empty())
            .map(|g| (g.iso3.clone(), g.id.clone()))
            .collect();
        for (code, expected) in [("PA.NUS.GDP.PLI", 7023), ("PA.NUS.PRVT.PLI", 6323)] {
            let id = format!("worldbank:2:{code}");
            let definition = catalog::series(&id).unwrap();
            assert_eq!(definition.unit, "price_level_us100");
            assert_eq!(definition.through_year, Some(2025));
            assert_eq!(definition.observation_kind, "modeled_estimate");
            let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join(format!("../.tmp/atlas-remaining-40/{code}.json"));
            let original: Value = serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
            let original_values: BTreeMap<_, _> = original[1]
                .as_array()
                .unwrap()
                .iter()
                .filter(|r| !r["value"].is_null())
                .map(|r| {
                    (
                        (
                            geo_ids[r["countryiso3code"].as_str().unwrap()].clone(),
                            r["date"].as_str().unwrap().parse::<i32>().unwrap(),
                        ),
                        r["value"].as_f64().unwrap(),
                    )
                })
                .collect();
            let download = download_for_batch(&definition).await.unwrap();
            assert_eq!(
                download.provenance.provider_updated_at,
                original[0]["lastupdated"].as_str().unwrap()
            );
            let actual_values: BTreeMap<_, _> = download
                .observations
                .iter()
                .filter_map(|r| {
                    r.point
                        .value
                        .map(|v| ((r.geography_id.clone(), r.point.year), v))
                })
                .collect();
            assert_eq!(actual_values.len(), expected);
            assert_eq!(actual_values, original_values);
            assert!(
                actual_values
                    .iter()
                    .filter(|((area, _), _)| area == "m49:840")
                    .all(|(_, v)| *v == 100.0)
            );
            store::replace_dataset(&db, &id, download).await.unwrap();
            let result = store::read_series(
                &db,
                SeriesInput {
                    series_id: id.clone(),
                    geography_id: "m49:276".into(),
                },
            )
            .await
            .unwrap();
            assert!(!result.points.is_empty());
            assert!(result.points.iter().all(|p| p.year <= 2025));
            let world = store::read_series(
                &db,
                SeriesInput {
                    series_id: id,
                    geography_id: "world".into(),
                },
            )
            .await
            .unwrap();
            assert!(world.points.iter().all(|p| p.value.is_none()));
        }
    }

    #[tokio::test]
    #[ignore = "Explicit public-source integration test; no personal database is used"]
    async fn world_atlas_live_worldbank_roundtrip() {
        let directory = tempfile::tempdir().unwrap();
        let db = store::open(directory.path()).await.unwrap();
        for series in catalog::catalog()
            .unwrap()
            .series
            .into_iter()
            .filter(|series| series.explanation.is_empty())
        {
            let mut job = SyncJob {
                id: uuid::Uuid::new_v4().to_string(),
                series_id: series.id.clone(),
                status: "running".into(),
                page: 0,
                pages: 0,
                observations: 0,
                message: String::new(),
                started_at: Utc::now().to_rfc3339(),
                finished_at: None,
            };
            let result = download(&db, "integration-test", &mut job, &series)
                .await
                .unwrap();
            assert!(job.pages > 1, "The test must exercise real pagination");
            assert!(result.provenance.provider_areas.len() > 200);
            assert!(
                result
                    .provenance
                    .pages
                    .iter()
                    .all(|page| page.sha256.len() == 64 && page.url.starts_with(ORIGIN))
            );
            let count = result.observations.len();
            assert!(count > 5_000);
            store::replace_dataset(&db, &series.id, result)
                .await
                .unwrap();
            for iso in ["DEU", "USA", "IND", "CHN"] {
                let area = catalog::catalog()
                    .unwrap()
                    .geographies
                    .into_iter()
                    .find(|area| area.iso3 == iso)
                    .unwrap();
                let response = store::read_series(
                    &db,
                    SeriesInput {
                        series_id: series.id.clone(),
                        geography_id: area.id,
                    },
                )
                .await
                .unwrap();
                assert_eq!(response.status, "available", "{iso}");
                assert!(
                    response
                        .points
                        .iter()
                        .filter(|point| point.value.is_some())
                        .count()
                        > 10,
                    "{iso}"
                );
                println!(
                    "{iso}: {} annual observations in isolated native cache",
                    response.points.len()
                );
            }
            println!(
                "{}: verified {} source pages and {count} stored worldwide observations",
                series.provider_code, job.pages
            );
        }
        db.close().await;
    }

    #[test]
    fn world_atlas_metadata_rejects_changed_price_bases_and_ambiguous_sources() {
        let series = catalog::series("worldbank:2:SL.GDP.PCAP.EM.KD").unwrap();
        let info =
            json!({"id":series.provider_code,"source":{"id":"2"},"name":series.provider_label});
        let page = |rows: Vec<Value>| {
            parse_page(json!([{"page":1,"pages":1,"total":rows.len()},rows]), 1).unwrap()
        };
        assert!(validate_metadata(&page(vec![info.clone()]), &series).is_ok());
        let mut old_base = info.clone();
        old_base["name"] = json!("GDP per person employed (constant 2017 PPP $)");
        assert!(validate_metadata(&page(vec![old_base]), &series).is_err());
        assert!(validate_metadata(&page(vec![info.clone(), info.clone()]), &series).is_err());
        let mut other_source = info;
        other_source["source"]["id"] = json!("99");
        assert!(validate_metadata(&page(vec![other_source]), &series).is_err());
    }

    #[test]
    fn world_atlas_pagination_and_error_payloads_are_validated() {
        let page = json!([{ "page": 2, "pages": "3", "total": 10001 }, []]);
        assert_eq!(parse_page(page.clone(), 2).unwrap().pages, 3);
        assert!(parse_page(page, 1).is_err());
        assert!(parse_page(json!([{ "message": [{"id": "120"}] }]), 1).is_err());
        assert!(parse_page(json!([{ "page": 1, "pages": 999, "total": 100 }, []]), 1).is_err());
    }

    #[test]
    fn world_atlas_values_preserve_null_zero_estimates_and_gross_percentages() {
        let areas = HashMap::from([("IND".into(), "m49:356".into())]);
        let row = |year, value, flag| json!({"indicator":{"id":"SE.SEC.ENRR"},"countryiso3code":"IND","date":year,"value":value,"obs_status":flag});
        let data = parse_observations(
            vec![
                row("2020", json!(null), ""),
                row("2021", json!(0), ""),
                row("2022", json!(113.5), "e"),
            ],
            "SE.SEC.ENRR",
            &areas,
            1960,
            2026,
        )
        .unwrap();
        assert_eq!(data[0].point.value, None);
        assert_eq!(data[1].point.value, Some(0.0));
        assert_eq!(data[2].point.value, Some(113.5));
        assert_eq!(data[2].point.source_flag, "e");
        assert!(
            parse_observations(
                vec![row("2021", json!(5), ""), row("2021", json!(6), "")],
                "SE.SEC.ENRR",
                &areas,
                1960,
                2026
            )
            .is_err()
        );
        assert!(
            parse_observations(
                vec![row("2021", json!("garbage"), "")],
                "SE.SEC.ENRR",
                &areas,
                1960,
                2026
            )
            .is_err()
        );
        assert!(
            parse_observations(vec![row("2021", json!(4), "")], "WRONG", &areas, 1960, 2026)
                .is_err()
        );
    }
}
