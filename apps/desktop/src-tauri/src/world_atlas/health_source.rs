use super::{catalog, health_models::*};
use crate::errors::{CommandError, CommandResult};
use calamine::{Data, Reader, Xlsx};
use chrono::Utc;
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    io::Cursor,
    time::Duration,
};

const MAX_FILE: usize = 48 * 1024 * 1024;
#[track_caller]
fn invalid() -> CommandError {
    #[cfg(test)]
    eprintln!("WHO validation at {}", std::panic::Location::caller());
    CommandError::validation(
        "Die WHO-Dateien weichen von der geprüften GHED-Ausgabe ab. Der bisherige Stand bleibt erhalten.",
    )
}
fn network() -> CommandError {
    CommandError::validation(
        "Die öffentlichen WHO-Gesundheitsdaten sind momentan nicht erreichbar. Bitte später erneut versuchen.",
    )
}
pub async fn download() -> CommandResult<HealthDownload> {
    let cfg = config()?;
    let client = reqwest::Client::builder()
        .tls_backend_rustls()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(180))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("PersonalMacro-Atlas/0.1")
        .build()
        .map_err(|_| network())?;
    let mut files = vec![];
    for file in &cfg.files {
        // Only the two audited public workbook URLs; no credentials or personal input.
        let mut response = client.get(&file.url).send().await.map_err(|_| network())?;
        if !response.status().is_success()
            || response.url().as_str() != file.url
            || response
                .content_length()
                .is_some_and(|n| n > MAX_FILE as u64)
        {
            return Err(network());
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|_| network())? {
            if bytes.len() + chunk.len() > MAX_FILE {
                return Err(invalid());
            }
            bytes.extend_from_slice(&chunk);
        }
        files.push(bytes);
    }
    let mut data = tokio::task::spawn_blocking(move || parse(&files, &cfg))
        .await
        .map_err(|_| invalid())??;
    data.provenance.retrieved_at = Utc::now().to_rfc3339();
    Ok(data)
}
fn optional_text(cell: &Data) -> CommandResult<Option<String>> {
    match cell {
        Data::Empty => Ok(None),
        Data::String(s) if !s.is_empty() && s.len() <= 64 * 1024 => Ok(Some(s.clone())),
        _ => Err(invalid()),
    }
}
fn text(cell: &Data) -> CommandResult<String> {
    optional_text(cell)?.ok_or_else(invalid)
}
pub(crate) fn number(cell: &Data) -> CommandResult<Option<f64>> {
    match cell {
        Data::Empty => Ok(None),
        Data::Int(n) => Ok(Some(*n as f64)),
        Data::Float(n) if n.is_finite() => Ok(Some(*n)),
        _ => Err(invalid()),
    }
}
fn checked_book<'a>(bytes: &'a [u8], file: &HealthFile) -> CommandResult<Xlsx<Cursor<&'a [u8]>>> {
    let hash = Sha256::digest(bytes)
        .iter()
        .map(|v| format!("{v:02x}"))
        .collect::<String>();
    if bytes.len() > MAX_FILE || bytes.len() != file.bytes || hash != file.sha256 {
        return Err(invalid());
    }
    let archive = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|_| invalid())?;
    if archive.len() > 100
        || archive
            .decompressed_size()
            .is_none_or(|n| n > 200 * 1024 * 1024)
    {
        return Err(invalid());
    }
    Xlsx::new(Cursor::new(bytes)).map_err(|_| invalid())
}
fn check_row(row: &[Data], expected: &[&str]) -> CommandResult<()> {
    if row.len() != expected.len()
        || row.iter().map(text).collect::<CommandResult<Vec<_>>>()? != expected
    {
        return Err(invalid());
    }
    Ok(())
}
fn add_row(
    row: &[Data],
    cfg: &HealthConfig,
    profiles: &mut BTreeMap<String, HealthProfile>,
) -> CommandResult<()> {
    let code = text(&row[1])?;
    let area = cfg
        .areas
        .iter()
        .find(|a| a.code == code)
        .ok_or_else(invalid)?;
    if text(&row[0])? != area.label
        || text(&row[2])? != area.region
        || text(&row[3])? != area.income
    {
        return Err(invalid());
    }
    let year = number(&row[4])?.ok_or_else(invalid)?;
    if year.fract() != 0. || year < cfg.first_year as f64 || year > cfg.last_year as f64 {
        return Err(invalid());
    }
    let profile = profiles.get_mut(&code).ok_or_else(invalid)?;
    if profile.points.iter().any(|p| p.year == year as i32) {
        return Err(invalid());
    }
    let mut values = BTreeMap::new();
    for m in &cfg.metrics {
        values.insert(m.field.clone(), number(&row[m.column])?);
    }
    profile.points.push(HealthPoint {
        year: year as i32,
        values,
    });
    Ok(())
}
pub(crate) fn parse(files: &[Vec<u8>], cfg: &HealthConfig) -> CommandResult<HealthDownload> {
    if files.len() != 2 || cfg.files.len() != 2 {
        return Err(invalid());
    }
    let mut book = checked_book(&files[0], &cfg.files[0])?;
    let mut notes_book = checked_book(&files[1], &cfg.files[1])?;
    if book.sheet_names() != ["Data", "Codebook", "Metadata", "Version"]
        || notes_book.sheet_names() != ["NEW notes (2025)"]
    {
        return Err(invalid());
    }
    let version = book.worksheet_range("Version").map_err(|_| invalid())?;
    if version.width() != 1
        || version
            .rows()
            .map(|r| text(&r[0]))
            .collect::<CommandResult<Vec<_>>>()?
            != cfg.workbook_version
    {
        return Err(invalid());
    }
    let codebook = book.worksheet_range("Codebook").map_err(|_| invalid())?;
    if codebook.height() != 4121 || codebook.width() != 8 {
        return Err(invalid());
    }
    for m in &cfg.metrics {
        let rows: Vec<_> = codebook
            .rows()
            .filter(|r| matches!(&r[0], Data::String(s) if s == &m.field))
            .collect();
        if rows.len() != 1
            || rows[0]
                .iter()
                .map(optional_text)
                .collect::<CommandResult<Vec<_>>>()?
                != m.definition
        {
            return Err(invalid());
        }
    }
    let mut profiles = BTreeMap::new();
    for a in &cfg.areas {
        if catalog::geography(&a.geography_id)?.iso3 != a.code {
            return Err(invalid());
        }
        if profiles
            .insert(
                a.code.clone(),
                HealthProfile {
                    geography_id: a.geography_id.clone(),
                    provider_code: a.code.clone(),
                    provider_label: a.label.clone(),
                    points: vec![],
                    metadata: vec![],
                    notes: HealthNotes::default(),
                },
            )
            .is_some()
        {
            return Err(invalid());
        }
    }
    // The source has 4,120 columns. Stream cells and keep only one sparse row;
    // never allocate a 19-million-cell rectangular worksheet range.
    let mut reader = book.worksheet_cells_reader("Data").map_err(|_| invalid())?;
    let selected: BTreeSet<_> = (0..5).chain(cfg.metrics.iter().map(|m| m.column)).collect();
    let mut row = vec![Data::Empty; cfg.expected_columns];
    let mut row_index = 0;
    let mut previous = None;
    let mut data_rows = 0;
    while let Some(cell) = reader.next_cell().map_err(|_| invalid())? {
        let (r, c) = cell.get_position();
        if r as usize > cfg.expected_rows
            || c as usize >= cfg.expected_columns
            || previous.is_some_and(|p| p >= (r, c))
        {
            return Err(invalid());
        }
        previous = Some((r, c));
        if r as usize != row_index {
            if r as usize != row_index + 1 {
                return Err(invalid());
            }
            if row_index == 0 {
                check_row(&row[..5], &["location", "code", "region", "income", "year"])?;
                for m in &cfg.metrics {
                    if text(&row[m.column])? != m.field {
                        return Err(invalid());
                    }
                }
            } else {
                add_row(&row, cfg, &mut profiles)?;
                data_rows += 1;
            }
            row.fill(Data::Empty);
            row_index = r as usize;
        }
        if selected.contains(&(c as usize)) {
            row[c as usize] = cell.get_value().clone().into();
        }
    }
    drop(reader);
    add_row(&row, cfg, &mut profiles)?;
    data_rows += 1;
    if data_rows != cfg.expected_rows {
        return Err(invalid());
    }
    let metadata = book.worksheet_range("Metadata").map_err(|_| invalid())?;
    if metadata.height() != cfg.metadata_rows + 1 || metadata.width() != 12 {
        return Err(invalid());
    }
    check_row(
        metadata.rows().next().ok_or_else(invalid)?,
        &[
            "location",
            "code",
            "region",
            "income",
            "variable code",
            "long code (GHED data explorer)",
            "variable name",
            "Sources",
            "Comments",
            "Data type",
            "Methods of estimation",
            "Countries and territories footnote",
        ],
    )?;
    let mut metadata_keys = BTreeSet::new();
    for r in metadata.rows().skip(1) {
        let code = text(&r[1])?;
        let area = cfg
            .areas
            .iter()
            .find(|a| a.code == code)
            .ok_or_else(invalid)?;
        if text(&r[0])? != area.label || text(&r[2])? != area.region || text(&r[3])? != area.income
        {
            return Err(invalid());
        }
        let field = text(&r[4])?;
        if !metadata_keys.insert((code.clone(), field.clone())) {
            return Err(invalid());
        }
        profiles
            .get_mut(&code)
            .ok_or_else(invalid)?
            .metadata
            .push(HealthMetadata {
                field,
                long_code: text(&r[5])?,
                label: text(&r[6])?,
                sources: optional_text(&r[7])?,
                comments: optional_text(&r[8])?,
                data_type: optional_text(&r[9])?,
                methods: optional_text(&r[10])?,
                footnote: optional_text(&r[11])?,
            });
    }
    let notes = notes_book
        .worksheet_range("NEW notes (2025)")
        .map_err(|_| invalid())?;
    // Excel's declared 198th row is formatting only; Calamine's used range ends at 197.
    if notes.height() != 197 || notes.width() != 7 {
        return Err(invalid());
    }
    check_row(
        notes.rows().next().ok_or_else(invalid)?,
        &[
            "WHO Region",
            "Countries and territories - Name",
            "ISO code",
            "Country/territory Footnote",
            "December 2025 release note",
            "World Bank Income group (2023)",
            "Reporting currency (NCU)",
        ],
    )?;
    let mut note_codes = BTreeSet::new();
    for r in notes.rows().skip(1) {
        let code = text(&r[2])?;
        if !note_codes.insert(code.clone()) {
            return Err(invalid());
        }
        if let Some(profile) = profiles.get_mut(&code) {
            if text(&r[1])? != profile.provider_label {
                return Err(invalid());
            }
            profile.notes = HealthNotes {
                footnote: optional_text(&r[3])?,
                release_note: optional_text(&r[4])?,
                reporting_currency: optional_text(&r[6])?,
            };
        }
    }
    for p in profiles.values_mut() {
        if p.points.is_empty() || !note_codes.contains(&p.provider_code) {
            return Err(invalid());
        }
        p.points.sort_by_key(|r| r.year);
    }
    let numeric = profiles
        .values()
        .flat_map(|p| &p.points)
        .flat_map(|p| p.values.values())
        .filter(|v| v.is_some())
        .count();
    Ok(HealthDownload {
        provenance: HealthProvenance {
            retrieved_at: String::new(),
            url: cfg.source_url.clone(),
            sha256: cfg.files[0].sha256.clone(),
            notes_sha256: cfg.files[1].sha256.clone(),
            release: cfg.release.clone(),
            source_row_count: data_rows,
            numeric_cell_count: numeric,
            metadata_row_count: cfg.metadata_rows,
            area_count: profiles.len(),
            recipe: cfg.recipe.clone(),
        },
        profiles: profiles.into_values().collect(),
    })
}
