use super::{
    capacity_models::*,
    catalog,
    energy_models::{EnergyProfile, EnergyYear},
};
use crate::errors::{CommandError, CommandResult};
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, HashSet},
    time::Duration,
};

const SOURCE: &str = "IRENA (2026), Renewable Capacity Statistics 2026, International Renewable Energy Agency (IRENA), Abu Dhabi";
const MAX_BYTES: usize = 4 * 1024 * 1024;

#[derive(Clone, Debug, PartialEq, Deserialize)]
struct Variable {
    code: String,
    values: Vec<String>,
    #[serde(rename = "valueTexts")]
    labels: Vec<String>,
}
#[derive(Clone, Debug, PartialEq, Deserialize)]
struct Metadata {
    title: String,
    variables: Vec<Variable>,
}

fn invalid() -> CommandError {
    CommandError::validation(
        "Die IRENA-Datei entspricht nicht dem geprüften Länder-, Technologie- oder Jahresformat. Der bisherige Stand bleibt erhalten.",
    )
}
fn url(kind: &str) -> String {
    format!("{API_BASE}{kind}_ELECCAP_2026_H1_v-PX%201.px")
}

async fn fetch(
    client: &reqwest::Client,
    kind: &str,
    query: Option<&Value>,
) -> CommandResult<Vec<u8>> {
    let request = if let Some(body) = query {
        client.post(url(kind)).json(body)
    } else {
        client.get(url(kind))
    };
    let mut response = request.send().await.map_err(|_| {
        CommandError::validation(
            "IRENA ist gerade nicht erreichbar. Bereits geladene Bilder bleiben verfügbar.",
        )
    })?;
    if !response.status().is_success() {
        return Err(CommandError::validation(format!(
            "IRENA-Abruf nicht erfolgreich (HTTP {}).",
            response.status().as_u16()
        )));
    }
    if response
        .content_length()
        .is_some_and(|len| len > MAX_BYTES as u64)
    {
        return Err(invalid());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| invalid())? {
        if bytes.len() + chunk.len() > MAX_BYTES {
            return Err(invalid());
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

fn validate_metadata(meta: &Metadata, kind: &str) -> CommandResult<()> {
    let area = if kind == "Country" {
        "Country/area"
    } else {
        "Region"
    };
    if meta.title
        != format!(
            "Electricity capacity statistics by {area}, Technology, Grid connection and Year"
        )
        || meta.variables.len() != 4
    {
        return Err(invalid());
    }
    let expected = [area, "Technology", "Grid connection", "Year"];
    for (variable, code) in meta.variables.iter().zip(expected) {
        if variable.code != code
            || variable.values.is_empty()
            || variable.values.len() != variable.labels.len()
            || variable.values.len() > 300
            || variable.values.iter().collect::<HashSet<_>>().len() != variable.values.len()
            || variable.labels.iter().collect::<HashSet<_>>().len() != variable.labels.len()
        {
            return Err(invalid());
        }
    }
    let config: Value = serde_json::from_str(CONFIG).map_err(|_| invalid())?;
    let tech = config["technologies"].as_array().ok_or_else(invalid)?;
    if meta.variables[1].labels.len() != if kind == "Country" { 26 } else { 13 }
        || meta.variables[1]
            .labels
            .iter()
            .any(|label| !tech.iter().any(|t| t["sourceLabel"] == *label))
        || meta.variables[2].labels != ["OnGrid", "OffGrid"]
        || meta.variables[3].labels
            != (2000..=2025)
                .map(|year| year.to_string())
                .collect::<Vec<_>>()
    {
        return Err(invalid());
    }
    Ok(())
}

// Strict subset of the provider's PC-Axis format. Splitting respects quoted
// semicolons, and duplicate keywords fail rather than silently replacing data.
fn fields(text: &str) -> CommandResult<BTreeMap<String, String>> {
    let mut start = 0;
    let mut quoted = false;
    let mut result = BTreeMap::new();
    for (at, ch) in text.char_indices() {
        if ch == '"' {
            quoted = !quoted;
        }
        if ch == ';' && !quoted {
            let (key, value) = text[start..at].trim().split_once('=').ok_or_else(invalid)?;
            if result
                .insert(key.trim().to_string(), value.trim().to_string())
                .is_some()
            {
                return Err(invalid());
            }
            start = at + 1;
        }
    }
    if quoted || !text[start..].trim().is_empty() {
        return Err(invalid());
    }
    Ok(result)
}
fn strings(value: &str) -> CommandResult<Vec<String>> {
    let mut result = Vec::new();
    let mut rest = value.trim();
    while !rest.is_empty() {
        let tail = rest.strip_prefix('"').ok_or_else(invalid)?;
        let end = tail.find('"').ok_or_else(invalid)?;
        result.push(tail[..end].to_string());
        rest = tail[end + 1..].trim();
        if let Some(next) = rest.strip_prefix(',') {
            rest = next.trim();
            if rest.is_empty() {
                return Err(invalid());
            }
        }
    }
    Ok(result)
}

struct Parsed {
    profiles: Vec<EnergyProfile>,
    updated: String,
    cells: usize,
    numeric: usize,
}
fn parse(bytes: &[u8], meta: &Metadata, kind: &str, selected: &[String]) -> CommandResult<Parsed> {
    let (text, _, errors) = encoding_rs::WINDOWS_1252.decode(bytes);
    if errors {
        return Err(invalid());
    }
    let f = fields(&text)?;
    let scalar = |key: &str| -> CommandResult<String> {
        let values = strings(f.get(key).ok_or_else(invalid)?)?;
        if values.len() != 1 {
            return Err(invalid());
        }
        Ok(values[0].clone())
    };
    if scalar("CODEPAGE")? != "Windows-1252"
        || scalar("UNITS")? != "MW"
        || scalar("MATRIX")?
            != if kind == "Country" {
                "C-ELECCAP"
            } else {
                "R-ELECCAP"
            }
        || scalar("SOURCE")? != SOURCE
        || scalar("TITLE")? != meta.title
    {
        return Err(invalid());
    }
    let updated = scalar("LAST-UPDATED")?;
    let date =
        chrono::NaiveDateTime::parse_from_str(&updated, "%Y%m%d %H:%M").map_err(|_| invalid())?;
    if date.date() > chrono::Utc::now().date_naive()
        || date.date() < chrono::NaiveDate::from_ymd_opt(2026, 1, 1).unwrap()
    {
        return Err(invalid());
    }
    let dims = meta
        .variables
        .iter()
        .map(|v| v.code.clone())
        .collect::<Vec<_>>();
    if strings(f.get("STUB").ok_or_else(invalid)?)? != dims {
        return Err(invalid());
    }
    for (index, variable) in meta.variables.iter().enumerate() {
        let labels = if index == 0 {
            selected
                .iter()
                .map(|code| {
                    variable
                        .values
                        .iter()
                        .position(|c| c == code)
                        .map(|i| variable.labels[i].clone())
                        .ok_or_else(invalid)
                })
                .collect::<CommandResult<Vec<_>>>()?
        } else {
            variable.labels.clone()
        };
        if strings(
            f.get(&format!("VALUES(\"{}\")", variable.code))
                .ok_or_else(invalid)?,
        )? != labels
        {
            return Err(invalid());
        }
    }
    if strings(
        f.get(&format!("CODES(\"{}\")", dims[0]))
            .ok_or_else(invalid)?,
    )? != selected
    {
        return Err(invalid());
    }
    let tech_count = meta.variables[1].labels.len();
    let years = meta.variables[3]
        .labels
        .iter()
        .map(|y| y.parse::<i32>().map_err(|_| invalid()))
        .collect::<CommandResult<Vec<_>>>()?;
    let tokens = f
        .get("DATA")
        .ok_or_else(invalid)?
        .split_whitespace()
        .collect::<Vec<_>>();
    if tokens.len() != selected.len() * tech_count * 2 * years.len() || tokens.len() > 100_000 {
        return Err(invalid());
    }
    let mut numeric = 0;
    let values = tokens
        .iter()
        .map(|token| {
            if *token == "\"-\"" {
                return Ok(None);
            }
            let value: f64 = token.parse().map_err(|_| invalid())?;
            if !value.is_finite() || !(0.0..=100_000_000.0).contains(&value) {
                return Err(invalid());
            }
            numeric += 1;
            Ok(Some(value))
        })
        .collect::<CommandResult<Vec<_>>>()?;
    let config: Value = serde_json::from_str(CONFIG).map_err(|_| invalid())?;
    let geographies = catalog::catalog()?.geographies;
    let mut profiles = Vec::new();
    for (ai, code) in selected.iter().enumerate() {
        let label = &meta.variables[0].labels[meta.variables[0]
            .values
            .iter()
            .position(|c| c == code)
            .ok_or_else(invalid)?];
        if kind == "Country" && matches!(code.as_str(), "REA" | "OCA") {
            if label != if code == "REA" { "Eurasia" } else { "Oceania" } {
                return Err(invalid());
            }
            continue; // Non-country rows in the country table, preserved in the omission audit.
        }
        let id = if kind == "Region" {
            config["regions"]
                .as_array()
                .ok_or_else(invalid)?
                .iter()
                .find(|r| r["code"] == *code && r["sourceLabel"] == *label)
                .and_then(|r| r["id"].as_str())
                .ok_or_else(invalid)?
                .to_string()
        } else {
            geographies
                .iter()
                .find(|g| g.iso3 == *code && g.kind != "aggregate")
                .ok_or_else(invalid)?
                .id
                .clone()
        };
        let mut rows = years
            .iter()
            .map(|year| EnergyYear {
                year: *year,
                values: BTreeMap::new(),
            })
            .collect::<Vec<_>>();
        for (ti, technology) in meta.variables[1].labels.iter().enumerate() {
            let id = config["technologies"]
                .as_array()
                .ok_or_else(invalid)?
                .iter()
                .find(|t| t["sourceLabel"] == *technology)
                .and_then(|t| t["id"].as_str())
                .ok_or_else(invalid)?;
            for (gi, grid) in ["ongrid", "offgrid"].iter().enumerate() {
                for (yi, row) in rows.iter_mut().enumerate() {
                    row.values.insert(
                        format!("{id}.{grid}"),
                        values[((ai * tech_count + ti) * 2 + gi) * years.len() + yi],
                    );
                }
            }
        }
        profiles.push(EnergyProfile {
            geography_id: id,
            provider_label: label.clone(),
            aggregate: kind == "Region",
            years: rows,
        });
    }
    Ok(Parsed {
        profiles,
        updated,
        cells: values.len(),
        numeric,
    })
}

pub async fn download() -> CommandResult<CapacityDownload> {
    // This legacy IIS endpoint negotiates TLS 1.2 CBC ciphers, unsupported by
    // Rustls. Windows Schannel verifies certificates and hostnames as usual.
    // Every other application client explicitly retains its Rustls backend.
    let builder = reqwest::Client::builder()
        .min_tls_version(reqwest::tls::Version::TLS_1_2)
        .http1_only()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(45))
        .user_agent("PersonalMacro-Atlas/0.1");
    #[cfg(windows)]
    let builder = builder.tls_backend_native();
    #[cfg(not(windows))]
    let builder = builder.tls_backend_rustls();
    let client = builder.build().map_err(|_| invalid())?;
    let mut data = CapacityDownload {
        profiles: vec![],
        provenance: CapacityProvenance {
            retrieved_at: chrono::Utc::now().to_rfc3339(),
            source_updated_at: String::new(),
            source_label: SOURCE.into(),
            files: vec![],
            source_cell_count: 0,
            numeric_cell_count: 0,
            area_count: 0,
            omitted_country_codes: vec!["REA".into(), "OCA".into()],
        },
    };
    for kind in ["Country", "Region"] {
        let before = fetch(&client, kind, None).await?;
        let meta: Metadata = serde_json::from_slice(&before).map_err(|_| invalid())?;
        validate_metadata(&meta, kind)?;
        data.provenance.files.push(CapacityFile {
            url: url(kind),
            sha256: Sha256::digest(&before)
                .iter()
                .map(|b| format!("{b:02x}"))
                .collect(),
            table: format!("{kind}-metadata"),
            area_codes: vec![],
        });
        for chunk in meta.variables[0].values.chunks(60) {
            let body = json!({"query": meta.variables.iter().enumerate().map(|(i,v)| json!({"code":v.code,"selection":{"filter":"item","values":if i==0 {chunk} else {&v.values}}})).collect::<Vec<_>>(), "response":{"format":"px"}});
            let bytes = fetch(&client, kind, Some(&body)).await?;
            let parsed = parse(&bytes, &meta, kind, chunk)?;
            if !data.provenance.source_updated_at.is_empty()
                && data.provenance.source_updated_at != parsed.updated
            {
                return Err(invalid());
            }
            data.provenance.source_updated_at = parsed.updated;
            data.provenance.source_cell_count += parsed.cells;
            data.provenance.numeric_cell_count += parsed.numeric;
            data.profiles.extend(parsed.profiles);
            data.provenance.files.push(CapacityFile {
                url: url(kind),
                sha256: Sha256::digest(&bytes)
                    .iter()
                    .map(|b| format!("{b:02x}"))
                    .collect(),
                table: kind.into(),
                area_codes: chunk.to_vec(),
            });
        }
        if fetch(&client, kind, None).await? != before {
            return Err(invalid());
        }
    }
    data.provenance.area_count = data.profiles.len();
    if data
        .profiles
        .iter()
        .map(|p| &p.geography_id)
        .collect::<HashSet<_>>()
        .len()
        != data.profiles.len()
    {
        return Err(invalid());
    }
    Ok(data)
}

#[cfg(test)]
mod tests {
    use super::super::{AtlasState, capacity_store, store};
    use super::*;
    const SAMPLE: &[u8] = include_bytes!("fixtures/irena-country-sample.px");
    fn meta() -> Metadata {
        serde_json::from_str(include_str!("fixtures/irena-country-metadata.json")).unwrap()
    }
    fn sample() -> Parsed {
        parse(SAMPLE, &meta(), "Country", &["DEU".into(), "NGA".into()]).unwrap()
    }
    fn fixture() -> CapacityDownload {
        let data = sample();
        CapacityDownload {
            profiles: data.profiles,
            provenance: CapacityProvenance {
                retrieved_at: Utc::now().to_rfc3339(),
                source_updated_at: data.updated,
                source_label: SOURCE.into(),
                files: vec![],
                source_cell_count: data.cells,
                numeric_cell_count: data.numeric,
                area_count: 2,
                omitted_country_codes: vec![],
            },
        }
    }
    use chrono::Utc;
    #[test]
    fn world_atlas_capacity_original_values_preserve_grid_technology_and_missing_markers() {
        validate_metadata(&meta(), "Country").unwrap();
        let data = sample();
        assert_eq!(data.cells, 2704);
        let de = &data.profiles[0];
        assert_eq!(de.geography_id, "m49:276");
        assert_eq!(de.years[0].values["solar_pv.ongrid"], Some(114.0));
        assert_eq!(de.years[25].values["solar_pv.ongrid"], Some(106272.0));
        assert_eq!(de.years[9].values["solar_thermal.ongrid"], Some(2.0));
        assert_eq!(de.years[25].values["solar_pv.offgrid"], None);
        assert_eq!(de.years[25].values["nuclear.ongrid"], None);
        assert_eq!(data.profiles[1].geography_id, "m49:566");
        assert!(!de.aggregate);
    }
    #[test]
    fn world_atlas_capacity_rejects_units_reordering_conflicts_unknown_markers_and_partial_data() {
        let (text, _, _) = encoding_rs::WINDOWS_1252.decode(SAMPLE);
        for changed in [
            text.replace("UNITS=\"MW\"", "UNITS=\"GW\""),
            text.replace("\"OnGrid\",\"OffGrid\"", "\"OffGrid\",\"OnGrid\""),
            text.replacen("11806.500000", "-11806.500000", 1),
            text.replacen("11806.500000", "NaN", 1),
            text.replacen("\"-\"", "\"..\"", 1),
            text.replace("UNITS=\"MW\";", "UNITS=\"MW\";UNITS=\"MW\";"),
            text.replacen("11806.500000", "", 1),
        ] {
            let (bytes, _, _) = encoding_rs::WINDOWS_1252.encode(&changed);
            assert!(parse(&bytes, &meta(), "Country", &["DEU".into(), "NGA".into()]).is_err());
        }
        assert!(parse(SAMPLE, &meta(), "Country", &["NGA".into(), "DEU".into()]).is_err());
        let zero = text.replacen("11806.500000", "0.000000", 1);
        let (bytes, _, _) = encoding_rs::WINDOWS_1252.encode(&zero);
        assert_eq!(
            parse(&bytes, &meta(), "Country", &["DEU".into(), "NGA".into()])
                .unwrap()
                .profiles[0]
                .years[0]
                .values["renewables.ongrid"],
            Some(0.0)
        );
    }
    #[tokio::test]
    async fn world_atlas_capacity_upgrade_atomic_rollback_offline_reopen_and_shared_gate() {
        let temp = tempfile::tempdir().unwrap();
        let old = sqlx::sqlite::SqlitePoolOptions::new()
            .connect_with(
                sqlx::sqlite::SqliteConnectOptions::new()
                    .filename(temp.path().join("cache.sqlite"))
                    .create_if_missing(true),
            )
            .await
            .unwrap();
        let mut v6 = sqlx::migrate!("./atlas-migrations");
        v6.migrations = v6.iter().take(6).cloned().collect::<Vec<_>>().into();
        v6.run(&old).await.unwrap();
        sqlx::query("INSERT INTO atlas_energy_dataset VALUES ('ember-yearly-electricity','{}','2026-09-09')").execute(&old).await.unwrap();
        old.close().await;
        let state = AtlasState::new(temp.path().to_path_buf());
        let db = state.0.db().await.unwrap();
        assert_eq!(
            capacity_store::read(db, "m49:276").await.unwrap().status,
            "not_downloaded"
        );
        assert_eq!(
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM atlas_energy_dataset")
                .fetch_one(db)
                .await
                .unwrap(),
            1
        );
        capacity_store::replace(db, fixture()).await.unwrap();
        let mut bad = fixture();
        bad.profiles.push(bad.profiles[0].clone());
        bad.provenance.source_updated_at = "broken".into();
        assert!(capacity_store::replace(db, bad).await.is_err());
        assert_eq!(
            capacity_store::read(db, "m49:276")
                .await
                .unwrap()
                .provenance
                .unwrap()
                .source_updated_at,
            "20260416 08:00"
        );
        assert_eq!(
            capacity_store::read(db, "un-wpp:903").await.unwrap().status,
            "unsupported_area"
        );
        assert!(capacity_store::read(db, "../secret").await.is_err());
        let permit = state.0.gate.lock().await;
        assert!(
            state
                .0
                .start_capacity()
                .await
                .unwrap_err()
                .message
                .contains("läuft bereits")
        );
        drop(permit);
        assert!(
            state
                .0
                .start_capacity()
                .await
                .unwrap_err()
                .message
                .contains("24 Stunden")
        );
        assert!(state.0.gate.try_lock().is_ok());
        db.close().await;
        let reopened = store::open(temp.path()).await.unwrap();
        assert_eq!(
            capacity_store::read(&reopened, "m49:276")
                .await
                .unwrap()
                .profile
                .unwrap()
                .years[25]
                .values["solar_pv.offgrid"],
            None
        );
        reopened.close().await;
    }
    #[tokio::test]
    #[ignore = "Explicit public IRENA HTTP audit; temporary public cache only"]
    async fn world_atlas_capacity_live_http_audit() {
        let data = download().await.unwrap();
        assert_eq!(data.profiles.len(), 234);
        assert_eq!(data.provenance.source_cell_count, 312312);
        assert_eq!(data.provenance.numeric_cell_count, 77831);
        let temp = tempfile::tempdir().unwrap();
        let db = store::open(temp.path()).await.unwrap();
        capacity_store::replace(&db, data).await.unwrap();
        let mut responses = Vec::new();
        for area in [
            "world",
            "irena:africa",
            "m49:276",
            "m49:840",
            "m49:356",
            "m49:156",
            "m49:566",
            "m49:710",
        ] {
            let row = capacity_store::read(&db, area).await.unwrap();
            assert_eq!(row.status, "available");
            responses.push(row);
        }
        let path = std::env::var_os("ATLAS_CAPACITY_AUDIT_OUTPUT")
            .expect("Explicit public evidence destination");
        std::fs::write(path, serde_json::to_vec_pretty(&responses).unwrap()).unwrap();
        db.close().await;
    }
}
