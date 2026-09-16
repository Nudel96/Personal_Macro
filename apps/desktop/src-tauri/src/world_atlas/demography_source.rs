use std::{
    collections::{BTreeMap, HashMap},
    io::{Cursor, Read},
    time::Duration,
};

use chrono::Utc;
use flate2::read::MultiGzDecoder;
use reqwest::Client;
use sha2::{Digest, Sha256};
use sqlx::SqlitePool;

use super::{
    catalog,
    demography_models::*,
    models::{SourcePage, SyncJob},
    store,
};
use crate::errors::{CommandError, CommandResult};

pub const BASE_URL: &str = "https://population.un.org/wpp/assets/Excel%20Files/1_Indicator%20(Standard)/CSV_FILES/WPP2024_PopulationByAge5GroupSex_Medium.csv.gz";
pub const UPDATE_URL: &str = "https://population.un.org/wpp/assets/Excel%20Files/1_Indicator%20(Standard)/WPP2024_CSV_files_update.zip";
pub const NOTES_URL: &str = "https://population.un.org/wpp/assets/Excel%20Files/1_Indicator%20(Standard)/CSV_FILES/WPP2024_Locations_notes.csv";
const UPDATE_MEMBER: &str = "WPP2024_PopulationByAge5GroupSex_Medium_Update.csv";
const MAX_EXPANDED: u64 = 512 * 1024 * 1024;

fn invalid(message: &str) -> CommandError {
    CommandError {
        code: "ATLAS_DEMOGRAPHY_SOURCE_ERROR".into(),
        message: message.into(),
        details: None,
    }
}

// An overlong stream must fail, rather than silently truncating at a row boundary.
struct LimitedReader<R> {
    inner: R,
    remaining: u64,
}
impl<R: Read> Read for LimitedReader<R> {
    fn read(&mut self, buffer: &mut [u8]) -> std::io::Result<usize> {
        if buffer.is_empty() {
            return Ok(0);
        }
        if self.remaining == 0 {
            let mut probe = [0];
            return if self.inner.read(&mut probe)? == 0 {
                Ok(0)
            } else {
                Err(std::io::Error::other(
                    "UN source exceeds decompression limit",
                ))
            };
        }
        let size = buffer.len().min(self.remaining as usize);
        let read = self.inner.read(&mut buffer[..size])?;
        self.remaining -= read as u64;
        Ok(read)
    }
}

async fn get(
    client: &Client,
    url: &'static str,
    limit: usize,
) -> CommandResult<(Vec<u8>, SourcePage)> {
    // Only static official release files are accepted. There is no user-supplied URL.
    if ![BASE_URL, UPDATE_URL, NOTES_URL].contains(&url) {
        return Err(invalid("Unbekannte UN-Quelldatei."));
    }
    let mut response = client.get(url).send().await.map_err(|_| {
        invalid(
            "Die UN-Quelle ist momentan nicht erreichbar. Die bisherigen Daten bleiben erhalten.",
        )
    })?;
    if !response.status().is_success() {
        return Err(invalid(
            "Die UN-Quelle hat die Datei nicht freigegeben. Bitte später erneut versuchen.",
        ));
    }
    if response
        .content_length()
        .is_some_and(|size| size > limit as u64)
    {
        return Err(invalid(
            "Die UN-Datei überschreitet die erlaubte Downloadgröße.",
        ));
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| invalid("Die UN-Datei wurde unvollständig übertragen."))?
    {
        if bytes.len() + chunk.len() > limit {
            return Err(invalid(
                "Die UN-Datei überschreitet die erlaubte Downloadgröße.",
            ));
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

fn parse_notes(bytes: &[u8]) -> CommandResult<HashMap<String, String>> {
    let mut reader = csv::Reader::from_reader(bytes);
    if reader
        .headers()
        .map_err(|_| invalid("Die UN-Gebietsnoten sind nicht lesbar."))?
        .iter()
        .collect::<Vec<_>>()
        != ["Notes", "Text"]
    {
        return Err(invalid("Das Format der UN-Gebietsnoten hat sich geändert."));
    }
    let mut notes = HashMap::new();
    for row in reader.records() {
        let row = row.map_err(|_| invalid("Die UN-Gebietsnoten sind nicht lesbar."))?;
        if row[0].len() > 8
            || row[1].len() > 16000
            || notes.insert(row[0].into(), row[1].into()).is_some()
        {
            return Err(invalid("Die UN-Gebietsnoten sind nicht eindeutig."));
        }
    }
    Ok(notes)
}

fn people(value: &str) -> CommandResult<Option<f64>> {
    if value.is_empty() || value == ".." {
        return Ok(None);
    }
    value
        .parse::<f64>()
        .ok()
        .filter(|v| v.is_finite() && (0.0..=100_000_000.0).contains(v))
        .map(|v| Some(v * 1000.0))
        .ok_or_else(|| invalid("Eine UN-Bevölkerungszahl ist ungültig."))
}

struct PendingProfile {
    provider_id: String,
    provider_label: String,
    note_key: String,
    years: BTreeMap<i32, BTreeMap<u8, AgePopulation>>,
}

fn parse_profiles<R: Read>(
    source: R,
    notes: &HashMap<String, String>,
    correction_only: bool,
) -> CommandResult<(BTreeMap<String, DemographyProfile>, usize)> {
    let areas: HashMap<_, _> = catalog::catalog()?
        .geographies
        .into_iter()
        .filter(|g| !g.iso3.is_empty())
        .map(|g| (g.iso3, g.id))
        .collect();
    let aggregates = HashMap::from([
        ("900", "world"),
        ("903", "un-wpp:903"),
        ("935", "un-wpp:935"),
        ("908", "un-wpp:908"),
        ("5505", "un-wpp:5505"),
        ("909", "un-wpp:909"),
    ]);
    let mut reader = csv::Reader::from_reader(LimitedReader {
        inner: source,
        remaining: MAX_EXPANDED,
    });
    let headers = reader
        .headers()
        .map_err(|_| invalid("Die UN-Altersdatei ist nicht lesbar."))?
        .clone();
    let column = |name: &str| {
        headers
            .iter()
            .position(|h| h == name)
            .ok_or_else(|| invalid("Das Format der UN-Altersdatei hat sich geändert."))
    };
    let loc = column("LocID")?;
    let iso = column("ISO3_code")?;
    let loc_type = column("LocTypeName")?;
    let label = column("Location")?;
    let note = column("Notes")?;
    let var = column("VarID")?;
    let variant = column("Variant")?;
    let time = column("Time")?;
    let midpoint = column("MidPeriod")?;
    let age = column("AgeGrpStart")?;
    let span = column("AgeGrpSpan")?;
    let age_label = column("AgeGrp")?;
    let male = column("PopMale")?;
    let female = column("PopFemale")?;
    let total = column("PopTotal")?;
    let mut pending: BTreeMap<String, PendingProfile> = BTreeMap::new();
    let mut count = 0;
    for record in reader.records() {
        let row = record.map_err(|_| {
            invalid("Die UN-Altersdatei enthält beschädigte oder zu große Datensätze.")
        })?;
        count += 1;
        if count > 2_000_000 || row.as_slice().len() > 4096 {
            return Err(invalid(
                "Die UN-Altersdatei überschreitet die erwartete Größe.",
            ));
        }
        if correction_only && (row.get(iso) != Some("TGO") || row.get(loc) != Some("768")) {
            return Err(invalid(
                "Die UN-Zwischenkorrektur enthält unerwartete Gebiete.",
            ));
        }
        let geography_id = if row.get(loc_type) == Some("Country/Area") {
            areas.get(&row[iso]).map(String::as_str)
        } else {
            aggregates.get(&row[loc]).copied()
        };
        let Some(geography_id) = geography_id else {
            continue;
        };
        if row.get(var) != Some("2") || row.get(variant) != Some("Medium") {
            return Err(invalid(
                "Die UN-Datei enthält eine unerwartete Projektionsvariante.",
            ));
        }
        let year = row[time]
            .parse::<i32>()
            .ok()
            .filter(|y| (1950..=2100).contains(y))
            .ok_or_else(|| invalid("Die UN-Datei enthält einen unerwarteten Zeitraum."))?;
        if row[midpoint].parse::<f64>().ok() != Some(f64::from(year) + 0.5) {
            return Err(invalid(
                "Die UN-Bevölkerung bezieht sich nicht auf die Jahresmitte.",
            ));
        }
        let start = row[age]
            .parse::<u8>()
            .ok()
            .filter(|a| *a <= 100 && a % 5 == 0)
            .ok_or_else(|| invalid("Die Altersgruppen der UN-Datei sind nicht vergleichbar."))?;
        let expected_label = if start == 100 {
            "100+".into()
        } else {
            format!("{start}-{}", start + 4)
        };
        if row[age_label] != expected_label
            || row.get(span) != Some(if start == 100 { "-1" } else { "5" })
        {
            return Err(invalid(
                "Die Altersgruppen der UN-Datei haben sich geändert.",
            ));
        }
        let population = AgePopulation {
            age_start: start,
            male: people(&row[male])?,
            female: people(&row[female])?,
            total: people(&row[total])?,
        };
        if let (Some(m), Some(f), Some(t)) = (population.male, population.female, population.total)
            && (m + f - t).abs() > 1.05
        {
            return Err(invalid(
                "Die Geschlechterzahlen passen nicht zur UN-Gesamtbevölkerung.",
            ));
        }
        let profile = pending
            .entry(geography_id.into())
            .or_insert_with(|| PendingProfile {
                provider_id: row[loc].into(),
                provider_label: row[label].into(),
                note_key: row[note].into(),
                years: BTreeMap::new(),
            });
        if profile.provider_id != row[loc]
            || profile.provider_label != row[label]
            || profile.note_key != row[note]
        {
            return Err(invalid(
                "Eine UN-Gebietskennung ist innerhalb der Datei nicht eindeutig.",
            ));
        }
        let groups = profile.years.entry(year).or_default();
        if let Some(previous) = groups.get(&start) {
            if previous != &population {
                return Err(invalid(
                    "Die UN-Datei enthält widersprüchliche Alterswerte.",
                ));
            }
        } else {
            groups.insert(start, population);
        }
    }
    let mut result = BTreeMap::new();
    for (geography_id, profile) in pending {
        let mut location_notes = Vec::new();
        for key in profile
            .note_key
            .split([',', ';', ' '])
            .filter(|key| !key.is_empty())
        {
            let text = notes
                .get(key)
                .ok_or_else(|| invalid("Eine UN-Gebietsfußnote fehlt in der Quelle."))?;
            location_notes.push(text.clone());
        }
        if profile.years.len() != 151 || profile.years.values().any(|ages| ages.len() != 21) {
            return Err(invalid(
                "Die UN-Altershistorie wurde nicht vollständig geliefert.",
            ));
        }
        result.insert(
            geography_id.clone(),
            DemographyProfile {
                geography_id,
                provider_id: profile.provider_id,
                provider_label: profile.provider_label,
                notes: location_notes,
                years: profile
                    .years
                    .into_iter()
                    .map(|(year, ages)| DemographyYear {
                        year,
                        kind: if year <= ESTIMATE_END {
                            "estimate"
                        } else {
                            "projection"
                        }
                        .into(),
                        ages: ages.into_values().collect(),
                    })
                    .collect(),
            },
        );
    }
    Ok((result, count))
}

pub(super) fn parse_files(
    base: &[u8],
    update: &[u8],
    notes: &[u8],
    pages: Vec<SourcePage>,
) -> CommandResult<DemographyDownload> {
    let notes = parse_notes(notes)?;
    // UN bulk CSVs concatenate gzip members; a single-member decoder would stop after the header.
    let (mut profiles, source_row_count) =
        parse_profiles(MultiGzDecoder::new(base), &notes, false)?;
    if profiles.len() < 236 || !profiles.contains_key("world") {
        return Err(invalid(
            "Die UN-Datei enthält keine vollständige weltweite Gebietsgrundlage.",
        ));
    }
    let mut archive = zip::ZipArchive::new(Cursor::new(update))
        .map_err(|_| invalid("Das UN-Korrekturarchiv ist nicht lesbar."))?;
    // Read a named entry in memory; archive paths are never extracted to disk.
    let member = archive
        .by_name(UPDATE_MEMBER)
        .map_err(|_| invalid("Die benötigte UN-Korrekturdatei fehlt."))?;
    if member.size() > 2 * 1024 * 1024 {
        return Err(invalid("Die UN-Korrekturdatei ist unerwartet groß."));
    }
    let (mut correction, _) = parse_profiles(member, &notes, true)?;
    if correction.len() != 1 || !profiles.contains_key("m49:768") {
        return Err(invalid("Die UN-Togo-Korrektur ist unvollständig."));
    }
    let togo = correction
        .remove("m49:768")
        .ok_or_else(|| invalid("Die UN-Togo-Korrektur fehlt."))?;
    profiles.insert("m49:768".into(), togo);
    let profiles: Vec<_> = profiles.into_values().collect();
    Ok(DemographyDownload {
        provenance: DemographyProvenance {
            revision: "WPP 2024 · Togo-Korrektur vom 19.01.2026".into(),
            retrieved_at: Utc::now().to_rfc3339(),
            estimate_end: ESTIMATE_END,
            projection_start: PROJECTION_START,
            pages,
            area_count: profiles.len(),
            source_row_count,
        },
        profiles,
    })
}

pub async fn download(
    db: &SqlitePool,
    session: &str,
    job: &mut SyncJob,
) -> CommandResult<DemographyDownload> {
    let client = Client::builder()
        .tls_backend_rustls()
        .timeout(Duration::from_secs(90))
        .connect_timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("PersonalMacro-WorldAtlas/0.1")
        .build()
        .map_err(|_| invalid("Der UN-Datenclient konnte nicht gestartet werden."))?;
    job.pages = 5;
    job.message = "Die weltweite UN-Altershistorie wird geladen (rund 30 MB).".into();
    store::save_source_progress(db, session, job).await?;
    let (base, base_page) = get(&client, BASE_URL, 48 * 1024 * 1024).await?;
    job.page = 1;
    job.message = "Die veröffentlichte UN-Länderkorrektur wird geladen.".into();
    store::save_source_progress(db, session, job).await?;
    let (update, update_page) = get(&client, UPDATE_URL, 4 * 1024 * 1024).await?;
    job.page = 2;
    job.message = "Die UN-Gebietsdefinitionen werden geladen.".into();
    store::save_source_progress(db, session, job).await?;
    let (notes, notes_page) = get(&client, NOTES_URL, 256 * 1024).await?;
    job.page = 3;
    job.message = "Altersgruppen, Schätzungen und Projektionen werden geprüft.".into();
    store::save_source_progress(db, session, job).await?;
    let result = tokio::task::spawn_blocking(move || {
        parse_files(
            &base,
            &update,
            &notes,
            vec![base_page, update_page, notes_page],
        )
    })
    .await
    .map_err(|_| invalid("Die UN-Dateien konnten nicht verarbeitet werden."))??;
    job.page = 4;
    job.message = "Die geprüften Länderprofile werden gemeinsam lokal gespeichert.".into();
    store::save_source_progress(db, session, job).await?;
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn fixture() -> String {
        let mut csv = String::from(
            "LocID,ISO3_code,LocTypeName,Location,Notes,VarID,Variant,Time,MidPeriod,AgeGrpStart,AgeGrpSpan,AgeGrp,PopMale,PopFemale,PopTotal\n",
        );
        for year in 1950..=2100 {
            for age in (0..=100).step_by(5) {
                csv.push_str(&format!("276,DEU,Country/Area,Germany,,2,Medium,{year},{year}.5,{age},{},{},1.001,2.002,3.003\n",
                if age == 100 { "-1" } else { "5" }, if age == 100 { "100+".into() } else { format!("{age}-{}", age+4) }));
            }
        }
        csv
    }

    #[test]
    fn world_atlas_demography_preserves_age_units_boundary_nulls_and_duplicate_rules() {
        let csv = fixture();
        let parse = |s: &str| parse_profiles(s.as_bytes(), &HashMap::new(), false);
        let (profiles, _) = parse(&csv).unwrap();
        let profile = &profiles["m49:276"];
        assert_eq!(profile.years.len(), 151);
        assert_eq!(profile.years[73].kind, "estimate");
        assert_eq!(profile.years[74].kind, "projection");
        assert!((profile.years[0].ages[0].male.unwrap() - 1001.0).abs() < 1e-6);
        assert_eq!(profile.years[0].ages[20].age_start, 100);
        let null = parse(&csv.replacen(",1.001,2.002,3.003", ",,2.002,3.003", 1)).unwrap();
        assert_eq!(null.0["m49:276"].years[0].ages[0].male, None);
        assert!(parse(&csv.replacen(",Medium,", ",High,", 1)).is_err());
        assert!(parse(&csv.replacen(",1.001,2.002,3.003", ",1.001,2.002,9.003", 1)).is_err());
        assert!(parse(&csv.replacen(",1950.5,", ",1950,", 1)).is_err());
        assert!(parse(&csv.replacen(",1.001,", ",-1.001,", 1)).is_err());
        let first = csv.lines().nth(1).unwrap();
        assert!(parse(&format!("{csv}{first}\n")).is_ok());
        assert!(
            parse(&format!(
                "{csv}{}\n",
                first.replace("1.001,2.002,3.003", "2.001,2.002,4.003")
            ))
            .is_err()
        );
        assert!(parse(&csv.replacen(&format!("{first}\n"), "", 1)).is_err());
        assert!(parse_profiles(csv.as_bytes(), &HashMap::new(), true).is_err());
    }

    #[test]
    fn world_atlas_demography_rejects_expansion_and_corrupt_gzip() {
        let mut reader = LimitedReader {
            inner: Cursor::new(b"abcd"),
            remaining: 3,
        };
        assert!(reader.read_to_end(&mut Vec::new()).is_err());
        let mut exact = LimitedReader {
            inner: Cursor::new(b"abc"),
            remaining: 3,
        };
        assert_eq!(exact.read_to_end(&mut Vec::new()).unwrap(), 3);
        let mut gzip = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::fast());
        gzip.write_all(fixture().as_bytes()).unwrap();
        let mut bytes = gzip.finish().unwrap();
        let index = bytes.len() - 8;
        bytes[index] ^= 0xFF;
        assert!(
            parse_profiles(
                MultiGzDecoder::new(bytes.as_slice()),
                &HashMap::new(),
                false
            )
            .is_err()
        );
    }

    #[test]
    fn world_atlas_demography_reads_all_concatenated_gzip_members() {
        let csv = fixture();
        let (header, body) = csv.split_once('\n').unwrap();
        let mut bytes = Vec::new();
        for text in [format!("{header}\n"), body.into()] {
            let mut member = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::fast());
            member.write_all(text.as_bytes()).unwrap();
            bytes.extend(member.finish().unwrap());
        }
        let (profiles, rows) = parse_profiles(
            MultiGzDecoder::new(bytes.as_slice()),
            &HashMap::new(),
            false,
        )
        .unwrap();
        assert_eq!(rows, 151 * 21);
        assert_eq!(profiles["m49:276"].years.len(), 151);
    }
}
