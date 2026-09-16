use std::{
    collections::{BTreeMap, BTreeSet},
    io::Cursor,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};

use calamine::{Data, Range, Reader, Xls};
use chrono::{NaiveDate, Utc};
use reqwest::Client;
use sha2::{Digest, Sha256};
use sqlx::SqlitePool;

use super::{models::SyncJob, store, valuation_metrics, valuation_models::*};
use crate::errors::{CommandError, CommandResult};

const MAX_FILE: usize = 4 * 1024 * 1024;

fn error(message: &str) -> CommandError {
    CommandError {
        code: "ATLAS_VALUATION_SOURCE_ERROR".into(),
        message: message.into(),
        details: None,
    }
}

fn text(cell: Option<&Data>) -> Option<&str> {
    match cell {
        Some(Data::String(value)) => Some(value.trim()),
        _ => None,
    }
}
fn number(cell: Option<&Data>) -> Option<f64> {
    match cell {
        Some(Data::Float(v)) if v.is_finite() => Some(*v),
        Some(Data::Int(v)) => Some(*v as f64),
        _ => None,
    }
}

pub fn source_url(value: &str) -> CommandResult<reqwest::Url> {
    let url = reqwest::Url::parse(value).map_err(|_| error("Ungültige Bewertungsquelle."))?;
    if url.scheme() != "https"
        || url.host_str() != Some("pages.stern.nyu.edu")
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || !(url.path().starts_with("/~adamodar/pc/datasets/")
            || url.path().starts_with("/~adamodar/pc/archives/"))
        || !url.path().ends_with(".xls")
    {
        return Err(error(
            "Die Bewertungsquelle gehört nicht zu den freigegebenen öffentlichen Dateien.",
        ));
    }
    Ok(url)
}

fn cell_value(
    cell: Option<&Data>,
    metric: &MetricDefinition,
    count: u32,
) -> CommandResult<(Option<f64>, String)> {
    let value = number(cell);
    let status = if count == 0 {
        "no_firms"
    } else if matches!(cell, Some(Data::Error(_))) {
        "source_error"
    } else if value.is_none() {
        if !matches!(cell, None | Some(Data::Empty))
            && !text(cell).is_some_and(|v| ["", "NA", "N/A", "n/a", "NM"].contains(&v))
        {
            return Err(error(
                "Eine Bewertungszelle enthält einen unerwarteten Wert. Der bisherige Stand bleibt erhalten.",
            ));
        }
        "source_missing"
    } else if metric.positive_only && value.is_some_and(|v| v <= 0.0) {
        "not_meaningful"
    } else {
        "available"
    };
    if metric.id == "industry_loss_share" && value.is_some_and(|v| !(0.0..=1.0).contains(&v)) {
        return Err(error(
            "Der Quellenanteil der Verlustunternehmen liegt außerhalb des gültigen Bereichs.",
        ));
    }
    Ok((value, status.into()))
}

pub struct ParsedFile {
    pub subjects: Vec<ValuationSubject>,
    pub excluded: Vec<String>,
    pub row_count: usize,
}

fn parse_range(
    data: &Range<Data>,
    epoch1904: bool,
    definition: &DatasetDefinition,
    file: &FileDefinition,
    catalog: &ValuationCatalog,
) -> CommandResult<ParsedFile> {
    if data.height() > 1000 || data.width() > 256 {
        return Err(error(
            "Die Bewertungstabelle hat einen unerwarteten Umfang.",
        ));
    }
    let header = file.header_row;
    if text(data.get_value((header, 0))) != Some(file.subject_header.trim())
        || text(data.get_value((header, 1))) != Some(file.count_header.trim())
    {
        return Err(error(
            "Die Gliederung der veröffentlichten Bewertungstabelle hat sich geändert.",
        ));
    }
    if let Some(expected) = &file.workbook_date {
        let expected = NaiveDate::parse_from_str(expected, "%Y-%m-%d")
            .map_err(|_| error("Ungültiger Quellenstand im Bewertungskatalog."))?;
        let base = if epoch1904 {
            NaiveDate::from_ymd_opt(1904, 1, 1)
        } else {
            NaiveDate::from_ymd_opt(1899, 12, 30)
        }
        .unwrap();
        let serial = match data.get_value((0, 1)) {
            Some(Data::DateTime(v)) => Some(v.as_f64()),
            other => number(other),
        };
        if text(data.get_value((0, 0))) != Some("Date updated:")
            || serial.is_none_or(|v| {
                (v - expected.signed_duration_since(base).num_days() as f64).abs() > 0.0001
            })
        {
            return Err(error(
                "Die Bewertungsdatei gehört zu einem anderen Veröffentlichungsstand. Die Quellenzuordnung muss aktualisiert werden.",
            ));
        }
    }
    if let Some(expected) = &file.region_cell
        && text(data.get_value((2, 5))) != Some(expected.trim())
    {
        return Err(error(
            "Die Bewertungstabelle gehört zu einer anderen Quellenregion.",
        ));
    }
    let end = data
        .end()
        .ok_or_else(|| error("Die Bewertungstabelle ist leer."))?;
    let mut fields = Vec::new();
    for field in &file.fields {
        let columns: Vec<_> = (0..=end.1)
            .filter(|c| text(data.get_value((header, *c))) == Some(field.header.trim()))
            .collect();
        if columns.len() != 1 {
            return Err(error(
                "Eine Bewertungsdefinition fehlt oder ist mehrdeutig.",
            ));
        }
        let metric = catalog
            .metrics
            .iter()
            .find(|m| m.id == field.metric_id)
            .ok_or_else(|| error("Unbekannte Bewertungsdefinition."))?;
        fields.push((columns[0], metric));
    }
    let mut subjects = Vec::new();
    let mut seen = BTreeSet::new();
    let mut excluded = Vec::new();
    let mut row_count = 0;
    let mut source_names = BTreeMap::new();
    for row in header + 1..=end.0 {
        if number(data.get_value((row, 1))).is_some()
            && let Some(name) = text(data.get_value((row, 0)))
        {
            *source_names.entry(name.to_owned()).or_insert(0usize) += 1;
        }
    }
    let ambiguous: Vec<_> = source_names
        .into_iter()
        .filter_map(|(name, count)| (count > 1).then_some(name))
        .collect();
    if ambiguous != file.ambiguous_subjects {
        return Err(error(
            "Die Mehrdeutigkeiten der Bewertungstabelle weichen vom geprüften Quellenstand ab.",
        ));
    }
    for row in header + 1..=end.0 {
        let Some(count) = number(data.get_value((row, 1))) else {
            continue;
        };
        if count.fract() != 0.0 || !(0.0..=2_000_000.0).contains(&count) {
            return Err(error("Eine Firmenzahl ist ungültig."));
        }
        let Some(name) = text(data.get_value((row, 0))).filter(|v| !v.is_empty() && v.len() <= 160)
        else {
            return Err(error(
                "Eine Quellenbranche oder ein Quellenland ist nicht eindeutig bezeichnet.",
            ));
        };
        row_count += 1;
        if file.ambiguous_subjects.iter().any(|n| n == name) {
            excluded.push(format!(
                "{} · {}: Mehrere abweichende Quellenzeilen; kein Wert übernommen.",
                name, file.publication_year
            ));
            continue;
        }
        let (id, label, geography_id, active) = if definition.kind == "countries" {
            if catalog
                .excluded_geographies
                .iter()
                .any(|g| g.provider_label == name)
            {
                excluded.push(name.into());
                continue;
            }
            let geo = catalog
                .geographies
                .iter()
                .find(|g| g.provider_label == name)
                .ok_or_else(|| {
                    error("Ein neues Quellengebiet ist noch nicht dem Atlas zugeordnet.")
                })?;
            (
                geo.geography_id.clone(),
                geo.label.clone(),
                Some(geo.geography_id.clone()),
                true,
            )
        } else {
            let industry = catalog
                .industries
                .iter()
                .find(|i| i.provider_label == name)
                .ok_or_else(|| error("Eine neue Quellenbranche ist noch nicht geprüft."))?;
            (
                industry.id.clone(),
                industry.label.clone(),
                None,
                industry.active,
            )
        };
        if !seen.insert(id.clone()) {
            return Err(error(
                "Eine Bewertungsreihe enthält doppelte Gebiets- oder Branchenzeilen.",
            ));
        }
        let mut series = Vec::new();
        for (column, metric) in &fields {
            let (value, status) = cell_value(data.get_value((row, *column)), metric, count as u32)?;
            let epoch = if definition.kind == "industries" && file.publication_year < 2014 {
                "classification_before_2014"
            } else {
                "classification_from_2014"
            };
            let points = vec![ValuationPoint {
                year: file.publication_year,
                value,
                status,
                firm_count: count as u32,
                method_epoch: epoch.into(),
                source_file: file.file_name.clone(),
            }];
            let historical_position = valuation_metrics::historical_position(&points, metric);
            series.push(ValuationSeries {
                metric_id: metric.id.clone(),
                points,
                historical_position,
            });
        }
        subjects.push(ValuationSubject {
            id,
            label,
            provider_label: name.into(),
            geography_id,
            active,
            series,
        });
    }
    if row_count != file.expected_subjects {
        return Err(error(
            "Der Umfang der Bewertungsdatei weicht vom geprüften Quellenstand ab.",
        ));
    }
    Ok(ParsedFile {
        subjects,
        excluded,
        row_count,
    })
}

pub fn parse(
    bytes: &[u8],
    definition: &DatasetDefinition,
    file: &FileDefinition,
    catalog: &ValuationCatalog,
) -> CommandResult<ParsedFile> {
    if bytes.len() > MAX_FILE
        || !bytes.starts_with(&[0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
    {
        return Err(error(
            "Die Quelle hat keine gültige veröffentlichte XLS-Datei geliefert.",
        ));
    }
    if let Some(expected) = &file.reviewed_sha256 {
        let actual: String = Sha256::digest(bytes)
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect();
        if &actual != expected {
            return Err(error(
                "Die historische Bewertungsdatei wurde seit der Quellenprüfung geändert. Der bisherige Stand bleibt erhalten, bis die neue Datei geprüft ist.",
            ));
        }
    }
    let mut book = Xls::new(Cursor::new(bytes))
        .map_err(|_| error("Die veröffentlichte Bewertungstabelle ist nicht lesbar."))?;
    let epoch = book.has_1904_epoch();
    let range = book
        .worksheet_range(&file.sheet_name)
        .map_err(|_| error("Das geprüfte Datenblatt fehlt in der Bewertungsdatei."))?;
    parse_range(&range, epoch, definition, file, catalog)
}

pub fn assemble(
    definition: &DatasetDefinition,
    catalog: &ValuationCatalog,
    parsed: Vec<(ParsedFile, ValuationSourceFile)>,
) -> CommandResult<ValuationDownload> {
    if parsed.len() != definition.files.len() {
        return Err(error("Der Bewertungsabruf ist noch nicht vollständig."));
    }
    let mut subjects: BTreeMap<String, ValuationSubject> = BTreeMap::new();
    let mut excluded = BTreeSet::new();
    let mut files = Vec::new();
    let latest_year = definition
        .files
        .last()
        .map(|f| f.publication_year)
        .unwrap_or_default();
    for (data, source) in parsed {
        excluded.extend(data.excluded);
        let year = source.publication_year;
        files.push(source);
        for mut subject in data.subjects {
            subject.active &= year == latest_year;
            if let Some(existing) = subjects.get_mut(&subject.id) {
                existing.active |= subject.active;
                existing.provider_label = subject.provider_label;
                for series in subject.series {
                    if let Some(prior) = existing
                        .series
                        .iter_mut()
                        .find(|s| s.metric_id == series.metric_id)
                    {
                        prior.points.extend(series.points);
                    } else {
                        existing.series.push(series);
                    }
                }
            } else {
                subjects.insert(subject.id.clone(), subject);
            }
        }
    }
    for subject in subjects.values_mut() {
        for series in &mut subject.series {
            series.points.sort_by_key(|p| p.year);
            if series.points.windows(2).any(|p| p[0].year == p[1].year) {
                return Err(error(
                    "Doppelte Veröffentlichungsjahre in der Bewertungsreihe.",
                ));
            }
            let metric = catalog
                .metrics
                .iter()
                .find(|m| m.id == series.metric_id)
                .ok_or_else(|| error("Ungültige Bewertungsdefinition."))?;
            series.historical_position =
                valuation_metrics::historical_position(&series.points, metric);
        }
    }
    Ok(ValuationDownload {
        dataset_id: definition.id.clone(),
        subjects: subjects.into_values().collect(),
        provenance: ValuationProvenance {
            catalog_version: catalog.version.clone(),
            retrieved_at: Utc::now().to_rfc3339(),
            files,
            excluded_subjects: excluded.into_iter().collect(),
        },
    })
}

pub async fn download(
    definition: &DatasetDefinition,
    db: &SqlitePool,
    session: &str,
    job: &mut SyncJob,
    cancel: Arc<AtomicBool>,
) -> CommandResult<Option<ValuationDownload>> {
    let catalog = catalog()?;
    let client = Client::builder()
        .tls_backend_rustls()
        .timeout(Duration::from_secs(35))
        .connect_timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("PersonalMacro-Atlas/0.1 (public aggregate data)")
        .build()
        .map_err(|_| error("Der öffentliche Bewertungsabruf konnte nicht vorbereitet werden."))?;
    let mut parsed = Vec::new();
    for file in &definition.files {
        if cancel.load(Ordering::Relaxed) {
            return Ok(None);
        }
        let mut response = client
            .get(source_url(&file.url)?)
            .send()
            .await
            .map_err(|_| {
                error("Die öffentliche Bewertungsquelle ist momentan nicht erreichbar.")
            })?;
        if !response.status().is_success() {
            return Err(error(
                "Die öffentliche Bewertungsdatei konnte nicht geladen werden. Der bisherige Stand bleibt erhalten.",
            ));
        }
        if response
            .content_length()
            .is_some_and(|n| n > MAX_FILE as u64)
        {
            return Err(error("Die Bewertungsdatei überschreitet das Größenlimit."));
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| error("Die Bewertungsdatei wurde nicht vollständig übertragen."))?
        {
            if bytes.len() + chunk.len() > MAX_FILE {
                return Err(error("Die Bewertungsdatei überschreitet das Größenlimit."));
            }
            bytes.extend_from_slice(&chunk);
        }
        let data = parse(&bytes, definition, file, &catalog)?;
        let source = ValuationSourceFile {
            url: file.url.clone(),
            file_name: file.file_name.clone(),
            sha256: Sha256::digest(&bytes)
                .iter()
                .map(|byte| format!("{byte:02x}"))
                .collect(),
            publication_year: file.publication_year,
            workbook_date: file.workbook_date.clone(),
            row_count: data.row_count,
        };
        job.page += 1;
        job.observations += data
            .subjects
            .iter()
            .flat_map(|s| &s.series)
            .map(|s| s.points.len())
            .sum::<usize>();
        job.message = format!(
            "Veröffentlichungsstand {} wurde geprüft. Frühere lokale Werte bleiben bis zum vollständigen Abschluss erhalten.",
            file.publication_year
        );
        store::save_source_progress(db, session, job).await?;
        parsed.push((data, source));
        tokio::time::sleep(Duration::from_millis(150)).await;
    }
    if cancel.load(Ordering::Relaxed) {
        return Ok(None);
    }
    assemble(definition, &catalog, parsed).map(Some)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn cache_equivalent(expected: &serde_json::Value, actual: &serde_json::Value, path: &str) {
        use serde_json::Value;
        match (expected, actual) {
            (Value::Number(a), Value::Number(b)) => {
                let a = a.as_f64().unwrap();
                let b = b.as_f64().unwrap();
                assert!(
                    a == b
                        || (a.signum() == b.signum()
                            && (a - b).abs() <= 16.0 * f64::EPSILON * a.abs().max(b.abs())),
                    "Numeric cache drift at {path}: {a} / {b}"
                );
            }
            (Value::Array(a), Value::Array(b)) => {
                assert_eq!(a.len(), b.len(), "Array length at {path}");
                for (i, (a, b)) in a.iter().zip(b).enumerate() {
                    cache_equivalent(a, b, &format!("{path}/{i}"));
                }
            }
            (Value::Object(a), Value::Object(b)) => {
                assert_eq!(a.len(), b.len(), "Object length at {path}");
                for (key, value) in a {
                    cache_equivalent(
                        value,
                        b.get(key)
                            .unwrap_or_else(|| panic!("Missing key at {path}/{key}")),
                        &format!("{path}/{key}"),
                    );
                }
            }
            _ => assert!(expected == actual, "Non-numeric cache drift at {path}"),
        }
    }
    #[test]
    fn world_atlas_valuation_cell_types_and_source_hosts_are_explicit() {
        let metric = catalog()
            .unwrap()
            .metrics
            .into_iter()
            .find(|m| m.id == "industry_pbv")
            .unwrap();
        assert_eq!(
            cell_value(Some(&Data::Empty), &metric, 50).unwrap(),
            (None, "source_missing".into())
        );
        assert_eq!(
            cell_value(Some(&Data::Float(0.0)), &metric, 50).unwrap(),
            (Some(0.0), "not_meaningful".into())
        );
        assert_eq!(
            cell_value(Some(&Data::Float(-3.0)), &metric, 50).unwrap().1,
            "not_meaningful"
        );
        assert_eq!(
            cell_value(
                Some(&Data::Error(calamine::CellErrorType::Div0)),
                &metric,
                50
            )
            .unwrap()
            .1,
            "source_error"
        );
        assert!(cell_value(Some(&Data::String("changed formula".into())), &metric, 50).is_err());
        assert!(cell_value(Some(&Data::Float(f64::NAN)), &metric, 50).is_err());
        assert!(source_url("https://untrusted.invalid/~adamodar/pc/datasets/pbvdata.xls").is_err());
        assert!(
            source_url("https://pages.stern.nyu.edu/~adamodar/pc/datasets/pbvdata.xls?token=x")
                .is_err()
        );
        for dataset in catalog().unwrap().datasets {
            for file in dataset.files {
                assert!(source_url(&file.url).is_ok());
            }
        }
    }

    #[tokio::test]
    #[ignore = "Reads previously downloaded public source audit files; never personal data"]
    async fn world_atlas_valuation_original_archives_match_independent_xlrd() {
        let temporary = tempfile::tempdir().unwrap();
        let db = store::open(temporary.path()).await.unwrap();
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join(".tmp/atlas-validation/valuation");
        let expected: serde_json::Value =
            serde_json::from_slice(&std::fs::read(root.join("extracted.json")).unwrap()).unwrap();
        let catalog = catalog().unwrap();
        let mut all = Vec::new();
        let mut point_count = 0;
        for definition in &catalog.datasets {
            let mut parsed = Vec::new();
            for file in &definition.files {
                let bytes = std::fs::read(root.join(&file.file_name)).unwrap();
                let rows = parse(&bytes, definition, file, &catalog)
                    .unwrap_or_else(|error| panic!("{}: {}", file.file_name, error.message));
                let reference = expected
                    .as_array()
                    .unwrap()
                    .iter()
                    .find(|r| r["file"] == file.file_name)
                    .unwrap();
                let headers = reference["headers"].as_array().unwrap();
                for subject in &rows.subjects {
                    let row = reference["rows"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .find(|r| r[0].as_str().unwrap().trim() == subject.provider_label)
                        .unwrap();
                    for series in &subject.series {
                        let field = file
                            .fields
                            .iter()
                            .find(|f| f.metric_id == series.metric_id)
                            .unwrap();
                        let column = headers.iter().position(|h| h == &field.header).unwrap();
                        let original = row[column].as_f64();
                        let actual = series.points[0].value;
                        match (original, actual) {
                            (Some(a), Some(b)) => assert!(
                                (a - b).abs() <= a.abs().max(1.0) * 1e-12,
                                "{} / {} / {}",
                                file.file_name,
                                subject.provider_label,
                                field.metric_id
                            ),
                            _ => assert_eq!(
                                original, actual,
                                "{} / {} / {}",
                                file.file_name, subject.provider_label, field.metric_id
                            ),
                        }
                        assert_eq!(series.points[0].firm_count as f64, row[1].as_f64().unwrap());
                        point_count += 1;
                    }
                }
                let source = ValuationSourceFile {
                    url: file.url.clone(),
                    file_name: file.file_name.clone(),
                    sha256: Sha256::digest(&bytes)
                        .iter()
                        .map(|byte| format!("{byte:02x}"))
                        .collect(),
                    publication_year: file.publication_year,
                    workbook_date: file.workbook_date.clone(),
                    row_count: rows.row_count,
                };
                parsed.push((rows, source));
            }
            let data = assemble(definition, &catalog, parsed).unwrap();
            println!(
                "{}: {} subjects, {} publications",
                definition.id,
                data.subjects.len(),
                data.provenance.files.len()
            );
            super::super::valuation_store::replace(&db, data.clone())
                .await
                .unwrap();
            let saved = super::super::valuation_store::read(&db, &definition.id)
                .await
                .unwrap()
                .data
                .unwrap();
            cache_equivalent(
                &serde_json::to_value(&data).unwrap(),
                &serde_json::to_value(&saved).unwrap(),
                &definition.id,
            );
            all.push(saved);
        }
        db.close().await;
        let db = store::open(temporary.path()).await.unwrap();
        for definition in &catalog.datasets {
            assert_eq!(
                super::super::valuation_store::read(&db, &definition.id)
                    .await
                    .unwrap()
                    .status,
                "available"
            );
        }
        db.close().await;
        std::fs::write(
            root.join("native-valuation-snapshots.json"),
            serde_json::to_vec(&all).unwrap(),
        )
        .unwrap();
        println!("Independent source values checked: {point_count}");
    }

    #[test]
    fn world_atlas_valuation_earnings_archives_preserve_definitions_and_pinned_identity() {
        let catalog = catalog().unwrap();
        let fixtures: [(&str, &str, &[u8]); 3] = [
            (
                "pe-europe",
                "peEurope11.xls",
                include_bytes!("fixtures/valuation/peEurope11.xls"),
            ),
            (
                "pe-us",
                "pedata13.xls",
                include_bytes!("fixtures/valuation/pedata13.xls"),
            ),
            (
                "pe-us",
                "pedata17.xls",
                include_bytes!("fixtures/valuation/pedata17.xls"),
            ),
        ];
        for (id, name, bytes) in fixtures {
            let definition = catalog.datasets.iter().find(|d| d.id == id).unwrap();
            let file = definition
                .files
                .iter()
                .find(|f| f.file_name == name)
                .unwrap();
            let parsed = parse(bytes, definition, file, &catalog).unwrap();
            assert_eq!(parsed.row_count, file.expected_subjects);
            assert!(
                parsed
                    .subjects
                    .iter()
                    .all(|subject| subject.series.iter().all(|series| {
                        series.points[0].year == file.publication_year
                            && series.points[0].source_file == name
                    }))
            );
            let industry = parsed
                .subjects
                .iter()
                .find(|s| s.provider_label == "Advertising")
                .unwrap();
            let expected_metric = if file.publication_year < 2018 {
                "industry_pe_aggregate_legacy"
            } else {
                "industry_pe_all"
            };
            assert!(
                industry
                    .series
                    .iter()
                    .any(|s| s.metric_id == expected_metric)
            );
            assert!(
                !industry
                    .series
                    .iter()
                    .any(|s| s.metric_id == "industry_loss_share")
            );
            let legacy = industry
                .series
                .iter()
                .find(|s| s.metric_id.ends_with("_legacy"));
            if let Some(legacy) = legacy {
                assert_eq!(
                    legacy.historical_position.status,
                    "not_historical_valuation"
                );
            }
            let mut changed = bytes.to_vec();
            *changed.last_mut().unwrap() ^= 1;
            let error = parse(&changed, definition, file, &catalog).err().unwrap();
            assert!(error.message.contains("seit der Quellenprüfung geändert"));
        }
    }
}
