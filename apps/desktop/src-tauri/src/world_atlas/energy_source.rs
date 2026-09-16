use super::{catalog, energy_models::*, models::SourcePage};
use crate::errors::{CommandError, CommandResult};
use chrono::{Datelike, Utc};
use reqwest::Client;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, HashMap},
    time::Duration,
};

const MAX_BYTES: usize = 60 * 1024 * 1024;
const MAX_ROWS: usize = 600_000;
#[derive(Deserialize)]
struct EnergyCatalog {
    fuels: Vec<Fuel>,
    regions: Vec<Region>,
}
#[derive(Deserialize)]
struct Fuel {
    id: String,
    variable: String,
}
#[derive(Deserialize)]
struct Region {
    id: String,
    name: String,
}

fn source_error(message: &str) -> CommandError {
    CommandError {
        code: "ATLAS_ENERGY_SOURCE_ERROR".into(),
        message: message.into(),
        details: None,
    }
}

fn metric(
    category: &str,
    subcategory: &str,
    variable: &str,
    unit: &str,
    fuels: &HashMap<&str, &str>,
) -> CommandResult<Option<String>> {
    let key = match (category, subcategory, variable) {
        ("Electricity generation", "Fuel", _) | ("Capacity", "Fuel", _) => {
            let fuel = fuels.get(variable).ok_or_else(|| {
                source_error("Die Energiedatei verwendet eine unbekannte Erzeugungsart.")
            })?;
            let prefix = match (category, unit) {
                ("Electricity generation", "TWh") => "generation",
                ("Electricity generation", "%") => "share",
                ("Capacity", "GW") => "capacity",
                _ => {
                    return Err(source_error(
                        "Die Energieeinheit entspricht nicht der geprüften Definition.",
                    ));
                }
            };
            return Ok(Some(format!("{prefix}.{fuel}")));
        }
        ("Electricity generation", "Total", "Total Generation") => ("generation.total", "TWh"),
        ("Electricity demand", "Demand", "Demand") => ("demand", "TWh"),
        ("Electricity demand", "Demand per capita", "Demand per capita") => {
            ("demand_per_capita", "MWh")
        }
        ("Electricity imports", "Electricity imports", "Net Imports") => ("net_imports", "TWh"),
        _ => return Ok(None),
    };
    if unit != key.1 {
        return Err(source_error(
            "Eine Energieeinheit hat sich geändert; der vorherige Stand bleibt erhalten.",
        ));
    }
    Ok(Some(key.0.into()))
}

/// The country code and the explicitly named provider region are independent
/// identities. No modern country or regional sum is guessed from a name.
fn parse(body: &[u8], latest_year: i32) -> CommandResult<(Vec<EnergyProfile>, usize)> {
    let config: EnergyCatalog = serde_json::from_str(include_str!(
        "../../../src/features/world-atlas/data/energy-catalog.json"
    ))
    .map_err(|_| source_error("Der Energiekatalog ist ungültig."))?;
    let catalog = catalog::catalog_value()?;
    let areas: Vec<super::models::Geography> =
        serde_json::from_value(catalog["geographies"].clone())
            .map_err(|_| source_error("Der Gebietskatalog ist ungültig."))?;
    let countries: HashMap<_, _> = areas
        .iter()
        .filter(|area| area.kind != "aggregate" && !area.iso3.is_empty())
        .map(|area| (area.iso3.as_str(), area.id.as_str()))
        .collect();
    let regions: HashMap<_, _> = config
        .regions
        .iter()
        .map(|region| (region.name.as_str(), region.id.as_str()))
        .collect();
    let fuels: HashMap<_, _> = config
        .fuels
        .iter()
        .map(|fuel| (fuel.variable.as_str(), fuel.id.as_str()))
        .collect();
    let mut reader = csv::ReaderBuilder::new()
        .trim(csv::Trim::All)
        .from_reader(body);
    let headers = reader
        .headers()
        .map_err(|_| source_error("Die Energiedatei hat keinen lesbaren Tabellenkopf."))?
        .clone();
    let columns = [
        "Area",
        "ISO 3 code",
        "Year",
        "Area type",
        "Category",
        "Subcategory",
        "Variable",
        "Unit",
        "Value",
    ]
    .map(|name| {
        let matches: Vec<_> = headers
            .iter()
            .enumerate()
            .filter(|(_, header)| *header == name)
            .map(|(i, _)| i)
            .collect();
        if matches.len() != 1 {
            Err(source_error(
                "Eine erwartete Energiespalte fehlt oder ist doppelt vorhanden.",
            ))
        } else {
            Ok(matches[0])
        }
    })
    .into_iter()
    .collect::<CommandResult<Vec<_>>>()?;
    let columns: [usize; 9] = columns.try_into().unwrap();
    struct ParsedProfile {
        name: String,
        aggregate: bool,
        years: BTreeMap<i32, BTreeMap<String, Option<f64>>>,
    }
    let mut profiles: BTreeMap<String, ParsedProfile> = BTreeMap::new();
    let mut count = 0;
    for row in reader.records() {
        count += 1;
        if count > MAX_ROWS {
            return Err(source_error(
                "Die Energiedatei überschreitet die geprüfte Zeilengrenze.",
            ));
        }
        let row = row.map_err(|_| source_error("Eine Zeile der Energiedatei ist nicht lesbar."))?;
        if row.as_slice().len() > 8192 {
            return Err(source_error("Eine Energiezeile ist ungewöhnlich groß."));
        }
        let [
            name,
            iso,
            year,
            kind,
            category,
            subcategory,
            variable,
            unit,
            value,
        ] = columns.map(|i| row.get(i).unwrap_or(""));
        let Some(key) = metric(category, subcategory, variable, unit, &fuels)? else {
            continue;
        };
        let id = match kind {
            "Country or economy" => countries.get(iso).copied(),
            "Region" if iso.is_empty() && name == "World" => Some("world"),
            "Region" if iso.is_empty() => regions.get(name).copied(),
            _ => None,
        }
        .ok_or_else(|| {
            source_error("Ein Energiegebiet kann nicht eindeutig dem Atlas zugeordnet werden.")
        })?;
        if name.is_empty() {
            return Err(source_error("Eine Energiegebietsbezeichnung fehlt."));
        }
        let year: i32 = year
            .parse()
            .map_err(|_| source_error("Ein Energiejahr ist ungültig."))?;
        if !(2000..=latest_year).contains(&year) {
            return Err(source_error(
                "Die Energiequelle enthält ein ungeprüftes oder noch laufendes Jahr.",
            ));
        }
        let value = if value.is_empty() {
            None
        } else {
            let number: f64 = value
                .parse()
                .map_err(|_| source_error("Ein Energiewert ist keine Zahl."))?;
            if !number.is_finite()
                || number.abs() > 1e9
                || (key != "net_imports" && number < 0.0)
                || (key.starts_with("share.") && number > 100.0)
            {
                return Err(source_error(
                    "Ein Energiewert liegt außerhalb seiner zulässigen Einheit.",
                ));
            }
            Some(number)
        };
        let profile = profiles.entry(id.into()).or_insert_with(|| ParsedProfile {
            name: name.into(),
            aggregate: kind == "Region",
            years: BTreeMap::new(),
        });
        if profile.name != name || profile.aggregate != (kind == "Region") {
            return Err(source_error(
                "Die Energiequelle vermischt verschiedene Gebietsidentitäten.",
            ));
        }
        if let Some(previous) = profile.years.entry(year).or_default().insert(key, value)
            && previous != value
        {
            return Err(source_error(
                "Die Energiequelle enthält widersprüchliche doppelte Werte.",
            ));
        }
    }
    if profiles.is_empty() {
        return Err(source_error(
            "Die Energiedatei enthält keine passenden Jahreswerte.",
        ));
    }
    let mut output = Vec::new();
    for (
        id,
        ParsedProfile {
            name,
            aggregate,
            years,
        },
    ) in profiles
    {
        for values in years.values() {
            let shares: Option<Vec<_>> = config
                .fuels
                .iter()
                .map(|fuel| values.get(&format!("share.{}", fuel.id)).copied().flatten())
                .collect();
            // Nine two-decimal shares may differ from 100 by up to 0.045 points.
            if let Some(shares) = shares {
                let total: f64 = shares.iter().sum();
                if total != 0.0 && (total - 100.0).abs() > 0.051 {
                    return Err(source_error(
                        "Ein vollständig ausgewiesener Strommix ist nicht schlüssig.",
                    ));
                }
            }
        }
        output.push(EnergyProfile {
            geography_id: id,
            provider_label: name,
            aggregate,
            years: years
                .into_iter()
                .map(|(year, values)| EnergyYear { year, values })
                .collect(),
        });
    }
    Ok((output, count))
}

pub async fn download() -> CommandResult<EnergyDownload> {
    let client = Client::builder()
        .tls_backend_rustls()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(90))
        .user_agent("Personal Macro Atlas/1.0")
        .build()
        .map_err(|_| source_error("Der Energieabruf konnte nicht vorbereitet werden."))?;
    let mut response =
        client.get(SOURCE_URL).send().await.map_err(|_| {
            source_error("Die öffentliche Energiequelle ist gerade nicht erreichbar.")
        })?;
    if !response.status().is_success() {
        return Err(source_error(
            "Die öffentliche Energiequelle hat den Abruf abgelehnt. Der lokale Stand bleibt erhalten.",
        ));
    }
    if response
        .content_length()
        .is_some_and(|size| size > MAX_BYTES as u64)
    {
        return Err(source_error(
            "Die Energiedatei überschreitet die Abrufgrenze.",
        ));
    }
    let header = |key| {
        response
            .headers()
            .get(key)
            .and_then(|v| v.to_str().ok())
            .filter(|v| v.len() <= 256)
            .map(str::to_owned)
    };
    let source_updated_at = header(reqwest::header::LAST_MODIFIED);
    let etag = header(reqwest::header::ETAG);
    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| source_error("Der Energieabruf wurde unterbrochen."))?
    {
        if body.len().saturating_add(chunk.len()) > MAX_BYTES {
            return Err(source_error(
                "Die Energiedatei überschreitet die Abrufgrenze.",
            ));
        }
        body.extend_from_slice(&chunk);
    }
    let source = SourcePage {
        url: SOURCE_URL.into(),
        sha256: Sha256::digest(&body)
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect(),
    };
    let (profiles, source_row_count) =
        tokio::task::spawn_blocking(move || parse(&body, Utc::now().year() - 1))
            .await
            .map_err(|_| source_error("Die Energiequelle konnte nicht verarbeitet werden."))??;
    // Reject truncated/small replacements of the worldwide source. Per-topic
    // availability is still evaluated separately; these counts do not imply completeness.
    if profiles.len() < 200
        || source_row_count < 100_000
        || !profiles.iter().any(|p| p.geography_id == "world")
    {
        return Err(source_error(
            "Die Energiequelle enthält keinen vollständigen weltweiten Veröffentlichungsstand.",
        ));
    }
    let year_first = profiles
        .iter()
        .flat_map(|p| p.years.iter())
        .map(|p| p.year)
        .min()
        .unwrap();
    let year_last = profiles
        .iter()
        .flat_map(|p| p.years.iter())
        .map(|p| p.year)
        .max()
        .unwrap();
    let provenance = EnergyProvenance {
        retrieved_at: Utc::now().to_rfc3339(),
        source_updated_at,
        etag,
        source,
        source_row_count,
        area_count: profiles.len(),
        year_first,
        year_last,
    };
    Ok(EnergyDownload {
        profiles,
        provenance,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    const HEADER: &str =
        "Area,ISO 3 code,Year,Area type,Category,Subcategory,Variable,Unit,Value\n";
    #[test]
    fn world_atlas_energy_preserves_zero_null_signed_imports_and_provider_regions() {
        let csv = format!(
            "{HEADER}Germany,DEU,2025,Country or economy,Electricity generation,Fuel,Nuclear,TWh,0\nGermany,DEU,2025,Country or economy,Capacity,Fuel,Solar,GW,\nGermany,DEU,2025,Country or economy,Electricity imports,Electricity imports,Net Imports,TWh,-1.5\nAfrica,,2025,Region,Electricity generation,Fuel,Solar,TWh,39.84\nWorld,,2025,Region,Electricity demand,Demand,Demand,TWh,30000\n"
        );
        let (profiles, count) = parse(csv.as_bytes(), 2025).unwrap();
        assert_eq!(count, 5);
        let germany = profiles
            .iter()
            .find(|p| p.geography_id == "m49:276")
            .unwrap();
        assert_eq!(
            germany.years[0].values.get("generation.nuclear"),
            Some(&Some(0.0))
        );
        assert_eq!(germany.years[0].values.get("capacity.solar"), Some(&None));
        assert_eq!(germany.years[0].values.get("generation.solar"), None);
        assert_eq!(
            germany.years[0].values.get("net_imports"),
            Some(&Some(-1.5))
        );
        assert!(
            profiles
                .iter()
                .find(|p| p.geography_id == "ember:africa")
                .unwrap()
                .aggregate
        );
        assert!(!profiles.iter().any(|p| p.geography_id == "un-wpp:903"));
    }
    #[test]
    fn world_atlas_energy_rejects_wrong_units_unknown_places_conflicts_future_and_nonfinite() {
        let row = "Germany,DEU,2025,Country or economy,Electricity generation,Fuel,Solar,TWh,10\n";
        for bad in [
            row.replace(",TWh,", ",MWh,"),
            row.replace("DEU", "???"),
            row.replace("2025", "2026"),
            row.replace(",10", ",NaN"),
            row.replace(",10", ",-1"),
            row.replace("Solar", "Unknown"),
            format!("{row}{}", row.replace(",10", ",20")),
        ] {
            assert!(parse(format!("{HEADER}{bad}").as_bytes(), 2025).is_err());
        }
        assert!(parse(format!("{HEADER}{row}{row}").as_bytes(), 2025).is_ok());
    }
    #[test]
    fn world_atlas_energy_validates_complete_mix_without_filling_missing_components() {
        let fuels = [
            "Coal",
            "Gas",
            "Other Fossil",
            "Nuclear",
            "Hydro",
            "Bioenergy",
            "Other Renewables",
            "Wind",
            "Solar",
        ];
        let make = |value: &str| {
            format!("{HEADER}{}", fuels.iter().map(|fuel| format!("Germany,DEU,2025,Country or economy,Electricity generation,Fuel,{fuel},%,{value}\n")).collect::<String>())
        };
        assert!(parse(make("11.11").as_bytes(), 2025).is_ok());
        assert!(parse(make("10").as_bytes(), 2025).is_err());
        assert!(parse(make("").as_bytes(), 2025).is_ok());
    }
}
