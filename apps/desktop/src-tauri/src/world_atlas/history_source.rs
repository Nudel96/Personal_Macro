use std::{
    collections::{BTreeMap, BTreeSet, HashMap},
    time::Duration,
};

use chrono::Utc;
use reqwest::Client;
use serde_json::Value;
use sha2::{Digest, Sha256};
use sqlx::SqlitePool;

use super::{
    catalog,
    history_models::*,
    models::{SourcePage, SyncJob},
    store,
};
use crate::errors::{CommandError, CommandResult};

const ORIGIN: &str = "https://ourworldindata.org/grapher";
const QUERY: &str = "?v=1&csvType=full&useColumnShortNames=false";
const MAX_CSV: usize = 4 * 1024 * 1024;
const MAX_METADATA: usize = 128 * 1024;
const MAX_ROWS: usize = 50_000;
const MAX_YEAR: i32 = 2022;

struct Measure {
    slug: &'static str,
    column: &'static str,
    metadata_column: &'static str,
    id: u64,
    short_name: &'static str,
    source_rows: usize,
}
const MEASURES: [Measure; 2] = [
    Measure {
        slug: "gdp-per-capita-maddison-project-database",
        column: "GDP per capita",
        metadata_column: "GDP per capita",
        id: 900793,
        short_name: "gdp_per_capita",
        source_rows: 21_586,
    },
    Measure {
        slug: "gdp-maddison-project-database",
        column: "GDP",
        metadata_column: "Gross domestic product (GDP)",
        id: 900795,
        short_name: "gdp",
        source_rows: 16_143,
    },
];

fn error(message: &str) -> CommandError {
    CommandError {
        code: "ATLAS_HISTORY_SOURCE_ERROR".into(),
        message: message.into(),
        details: None,
    }
}

async fn get(client: &Client, url: &str, limit: usize) -> CommandResult<(Vec<u8>, SourcePage)> {
    // URLs are assembled exclusively from the two compile-time chart definitions.
    let mut response = client.get(url).send().await.map_err(|_| error("Die historische Datenquelle ist momentan nicht erreichbar. Der lokale Stand bleibt erhalten."))?;
    if !response.status().is_success() {
        return Err(error(
            "Der öffentliche Historienabruf wurde abgelehnt. Bitte später erneut versuchen.",
        ));
    }
    if response
        .content_length()
        .is_some_and(|size| size > limit as u64)
    {
        return Err(error("Die historische Quellenantwort ist zu groß."));
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| error("Die historische Quelldatei wurde nicht vollständig übertragen."))?
    {
        if bytes.len() + chunk.len() > limit {
            return Err(error("Die historische Quellenantwort ist zu groß."));
        }
        bytes.extend_from_slice(&chunk);
    }
    let sha256 = Sha256::digest(&bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect();
    Ok((
        bytes,
        SourcePage {
            url: url.into(),
            sha256,
        },
    ))
}

fn metadata(bytes: &[u8], measure: &Measure) -> CommandResult<Value> {
    let data: Value = serde_json::from_slice(bytes)
        .map_err(|_| error("Die historische Quellenbeschreibung ist ungültig."))?;
    let column = &data["columns"][measure.metadata_column];
    if column["owidVariableId"].as_u64() != Some(measure.id)
        || column["shortName"].as_str() != Some(measure.short_name)
        || column["unit"].as_str() != Some("international-$ in 2011 prices")
        || column["lastUpdated"].as_str() != Some("2024-04-26")
        || column["timespan"].as_str() != Some("1-2022")
        || !column["citationShort"].as_str().is_some_and(|s| {
            s.contains("Maddison Project Database 2023") && s.contains("Our World in Data")
        })
    {
        return Err(error(
            "Ausgabe, Definition oder Preisbasis der historischen Quelle hat sich geändert. Dieser neue Stand muss vor der Übernahme geprüft werden.",
        ));
    }
    Ok(column.clone())
}

fn area_id(code: &str, label: &str, iso: &HashMap<String, String>) -> Option<String> {
    if code == "OWID_WRL" && label == "World" {
        return Some("world".into());
    }
    if code.is_empty() {
        let key = match label {
            "East Asia (Maddison)" => "east_asia",
            "Eastern Europe (Maddison)" => "eastern_europe",
            "Latin America (Maddison)" => "latin_america",
            "Middle East and North Africa (Maddison)" => "mena",
            "South and South East Asia (Maddison)" => "south_southeast_asia",
            "Sub Saharan Africa (Maddison)" => "sub_saharan_africa",
            "Western Europe (Maddison)" => "western_europe",
            "Western offshoots (Maddison)" => "western_offshoots",
            _ => return None,
        };
        return Some(format!("maddison:{key}"));
    }
    // Former states have OWID_* identities: never alias USSR to Russia,
    // Yugoslavia to Serbia or former Sudan to present-day Sudan.
    iso.get(code).cloned()
}

#[derive(Debug)]
struct Area {
    label: String,
    notes: BTreeSet<String>,
    values: BTreeMap<i32, Option<f64>>,
}
struct Parsed {
    areas: BTreeMap<String, Area>,
    excluded: BTreeSet<String>,
    row_count: usize,
}

fn parse(bytes: &[u8], measure: &Measure) -> CommandResult<Parsed> {
    if bytes.len() > MAX_CSV {
        return Err(error("Die historische Quelldatei ist zu groß."));
    }
    let catalog = catalog::catalog()?;
    let iso: HashMap<_, _> = catalog
        .geographies
        .into_iter()
        .filter(|a| !a.iso3.is_empty() && a.kind != "aggregate")
        .map(|a| (a.iso3, a.id))
        .collect();
    let mut reader = csv::ReaderBuilder::new().from_reader(bytes);
    let expected = [
        "Entity",
        "Code",
        "Year",
        measure.column,
        &format!("{} (Annotations)", measure.column),
    ];
    let headers = reader
        .headers()
        .map_err(|_| error("Die historische CSV-Kopfzeile ist unlesbar."))?;
    if headers.iter().ne(expected) {
        return Err(error("Die historische CSV-Struktur hat sich geändert."));
    }
    let mut result = Parsed {
        areas: BTreeMap::new(),
        excluded: BTreeSet::new(),
        row_count: 0,
    };
    for record in reader.records() {
        let row =
            record.map_err(|_| error("Die historische CSV-Datei enthält eine ungültige Zeile."))?;
        result.row_count += 1;
        if result.row_count > MAX_ROWS
            || row.as_slice().len() > 8192
            || row[0].is_empty()
            || row[0].len() > 200
            || row[1].len() > 32
        {
            return Err(error(
                "Die historische CSV-Datei überschreitet die erwarteten Grenzen.",
            ));
        }
        let year = row[2].parse::<i32>().ok().filter(|y| (1..=MAX_YEAR).contains(y)).ok_or_else(|| error("Ein historisches Quellenjahr ist ungültig oder gehört zu einer ungeprüften Ausgabe."))?;
        let value = if row[3].is_empty() {
            None
        } else {
            Some(
                row[3]
                    .parse::<f64>()
                    .ok()
                    .filter(|v| v.is_finite() && *v > 0.0 && *v < 1e16)
                    .ok_or_else(|| error("Ein historischer Quellenwert ist nicht gültig."))?,
            )
        };
        let Some(id) = area_id(&row[1], &row[0], &iso) else {
            result.excluded.insert(row[0].to_string());
            continue;
        };
        let area = result.areas.entry(id).or_insert_with(|| Area {
            label: row[0].into(),
            notes: BTreeSet::new(),
            values: BTreeMap::new(),
        });
        if area.label != row[0] {
            return Err(error(
                "Eine historische Gebietskennung besitzt widersprüchliche Namen.",
            ));
        }
        if let Some(old) = area.values.insert(year, value)
            && old != value
        {
            return Err(error(
                "Die historische Quelle enthält widersprüchliche doppelte Werte.",
            ));
        }
        if !row[4].is_empty() {
            area.notes.insert(row[4].into());
        }
    }
    if result.areas.is_empty() {
        return Err(error(
            "Die historische Quelldatei enthält keine zuordenbaren Gebiete.",
        ));
    }
    Ok(result)
}

fn combine(
    per_capita: Parsed,
    output: Parsed,
    pages: Vec<SourcePage>,
) -> CommandResult<HistoryDownload> {
    if per_capita.areas.keys().ne(output.areas.keys()) || per_capita.excluded != output.excluded {
        return Err(error(
            "Die beiden historischen Reihen besitzen unterschiedliche Gebietsstände.",
        ));
    }
    let world = output
        .areas
        .get("world")
        .ok_or_else(|| error("Das veröffentlichte Weltaggregat fehlt."))?;
    let mut profiles = Vec::new();
    for (id, first) in &per_capita.areas {
        let second = &output.areas[id];
        if first.label != second.label {
            return Err(error(
                "Die historischen Gebietsdefinitionen widersprechen sich.",
            ));
        }
        let years: BTreeSet<_> = first
            .values
            .keys()
            .chain(second.values.keys())
            .copied()
            .collect();
        let points = years
            .into_iter()
            .map(|year| {
                let gdp = second.values.get(&year).copied().flatten();
                let world_gdp_share = gdp
                    .zip(world.values.get(&year).copied().flatten())
                    .filter(|(_, total)| *total > 0.0)
                    .map(|(value, total)| value / total * 100.0)
                    .filter(|v| v.is_finite() && (0.0..=100.000001).contains(v));
                HistoryPoint {
                    year,
                    gdp_per_capita: first.values.get(&year).copied().flatten(),
                    gdp,
                    world_gdp_share,
                }
            })
            .collect();
        profiles.push(HistoryProfile {
            geography_id: id.clone(),
            provider_label: first.label.clone(),
            notes: first.notes.union(&second.notes).cloned().collect(),
            points,
        });
    }
    Ok(HistoryDownload {
        provenance: HistoryProvenance {
            revision: REVISION.into(),
            retrieved_at: Utc::now().to_rfc3339(),
            pages,
            area_count: profiles.len(),
            source_row_count: per_capita.row_count + output.row_count,
            excluded_areas: per_capita.excluded.into_iter().collect(),
        },
        profiles,
    })
}

pub async fn download(
    db: &SqlitePool,
    session: &str,
    job: &mut SyncJob,
) -> CommandResult<HistoryDownload> {
    let client = Client::builder()
        .tls_backend_rustls()
        .user_agent("Our World In Data data fetch/1.0")
        .timeout(Duration::from_secs(45))
        .connect_timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| error("Der historische Download konnte nicht vorbereitet werden."))?;
    let mut parsed = Vec::new();
    let mut pages = Vec::new();
    for (index, measure) in MEASURES.iter().enumerate() {
        job.page = index as u32 + 1;
        job.pages = 3;
        job.message =
            "Historische Länder- und Regionsdaten werden mit ihrer Quellenbeschreibung geprüft."
                .into();
        store::save_source_progress(db, session, job).await?;
        let metadata_url = format!("{ORIGIN}/{}.metadata.json{QUERY}", measure.slug);
        let csv_url = format!("{ORIGIN}/{}.csv{QUERY}", measure.slug);
        let (before, before_page) = get(&client, &metadata_url, MAX_METADATA).await?;
        let before = metadata(&before, measure)?;
        let (csv, csv_page) = get(&client, &csv_url, MAX_CSV).await?;
        let (after, after_page) = get(&client, &metadata_url, MAX_METADATA).await?;
        if metadata(&after, measure)? != before {
            return Err(error(
                "Die historische Quelle wurde während des Abrufs revidiert. Bitte erneut laden.",
            ));
        }
        let data = parse(&csv, measure)?;
        if data.row_count != measure.source_rows
            || data.areas.len() != 174
            || data.excluded.len() != 4
        {
            return Err(error(
                "Der Umfang der historischen Ausgabe weicht vom geprüften vollständigen Datenstand ab. Die bisherigen Daten bleiben erhalten.",
            ));
        }
        parsed.push(data);
        pages.extend([before_page, csv_page, after_page]);
    }
    let output = parsed.pop().unwrap();
    let per_capita = parsed.pop().unwrap();
    combine(per_capita, output, pages)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn csv(column: &str, rows: &str) -> Vec<u8> {
        format!("Entity,Code,Year,{column},{column} (Annotations)\n{rows}").into_bytes()
    }

    #[test]
    fn world_atlas_history_preserves_sparse_years_nulls_and_provider_geographies() {
        let bytes = csv(
            "GDP per capita",
            "Germany,DEU,1500,10,\nGermany,DEU,1800,20,\nGermany,DEU,1801,,\nUSSR,OWID_USS,1900,5,\nWorld,OWID_WRL,1800,15,\nEast Asia (Maddison),,1800,12,\n",
        );
        let data = parse(&bytes, &MEASURES[0]).unwrap();
        assert_eq!(data.areas["m49:276"].values.len(), 3);
        assert_eq!(data.areas["m49:276"].values[&1801], None);
        assert!(!data.areas.contains_key("m49:643"));
        assert!(data.excluded.contains("USSR"));
        assert!(data.areas.contains_key("maddison:east_asia"));
        assert!(!data.areas.contains_key("un-wpp:935"));
    }

    #[test]
    fn world_atlas_history_rejects_conflicts_nonfinite_invalid_years_and_metadata_drift() {
        for rows in [
            "Germany,DEU,2000,1,\nGermany,DEU,2000,2,\n",
            "Germany,DEU,2023,1,\n",
            "Germany,DEU,2000,NaN,\n",
            "Germany,DEU,2000,-1,\n",
            "Germany,DEU,2000,0,\n",
        ] {
            assert!(parse(&csv("GDP per capita", rows), &MEASURES[0]).is_err());
        }
        assert!(
            parse(
                &csv(
                    "GDP per capita",
                    "Germany,DEU,2000,1,\nGermany,DEU,2000,1,\n"
                ),
                &MEASURES[0]
            )
            .is_ok()
        );
        assert!(metadata(b"{}", &MEASURES[0]).is_err());
        let mut meta = serde_json::json!({ "columns": { "GDP per capita": { "owidVariableId": 900793, "shortName": "gdp_per_capita", "unit": "international-$ in 2011 prices", "lastUpdated": "2024-04-26", "timespan": "1-2022", "citationShort": "Maddison Project Database 2023 · Our World in Data" } } });
        assert!(metadata(&serde_json::to_vec(&meta).unwrap(), &MEASURES[0]).is_ok());
        meta["columns"]["GDP per capita"]["unit"] = "USD current prices".into();
        assert!(metadata(&serde_json::to_vec(&meta).unwrap(), &MEASURES[0]).is_err());
    }

    #[test]
    fn world_atlas_history_world_share_requires_published_same_year_denominator() {
        let pc = parse(
            &csv(
                "GDP per capita",
                "Germany,DEU,1900,2,\nGermany,DEU,1901,3,\nWorld,OWID_WRL,1900,1,\n",
            ),
            &MEASURES[0],
        )
        .unwrap();
        let gdp = parse(
            &csv(
                "GDP",
                "Germany,DEU,1900,50,\nGermany,DEU,1901,60,\nWorld,OWID_WRL,1900,200,\n",
            ),
            &MEASURES[1],
        )
        .unwrap();
        let data = combine(pc, gdp, vec![]).unwrap();
        let points = &data
            .profiles
            .iter()
            .find(|p| p.geography_id == "m49:276")
            .unwrap()
            .points;
        assert_eq!(points[0].world_gdp_share, Some(25.0));
        assert_eq!(points[1].world_gdp_share, None);
    }
}
