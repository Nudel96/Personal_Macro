use std::collections::BTreeSet;

use sqlx::SqlitePool;

use super::{valuation_metrics, valuation_models::*};
use crate::errors::{CommandError, CommandResult};

fn invalid() -> CommandError {
    CommandError::validation(
        "Der Bewertungsstand ist unvollständig oder passt nicht zur geprüften Quellenzuordnung. Frühere lokale Werte bleiben erhalten.",
    )
}

fn validate(data: &mut ValuationDownload) -> CommandResult<()> {
    let catalog = catalog()?;
    let definition = dataset(&data.dataset_id)?;
    if data.provenance.catalog_version != catalog.version
        || chrono::DateTime::parse_from_rfc3339(&data.provenance.retrieved_at).is_err()
        || data.provenance.files.len() != definition.files.len()
        || data.subjects.is_empty()
        || data.subjects.len() > 1000
    {
        return Err(invalid());
    }
    for (source, expected) in data.provenance.files.iter().zip(&definition.files) {
        if source.file_name != expected.file_name
            || source.url != expected.url
            || source.publication_year != expected.publication_year
            || source.workbook_date != expected.workbook_date
            || source.row_count != expected.expected_subjects
            || source.sha256.len() != 64
            || !source.sha256.bytes().all(|b| b.is_ascii_hexdigit())
            || expected
                .reviewed_sha256
                .as_ref()
                .is_some_and(|hash| hash != &source.sha256)
        {
            return Err(invalid());
        }
    }
    let mut subjects = BTreeSet::new();
    for subject in &mut data.subjects {
        let known = if definition.kind == "countries" {
            catalog.geographies.iter().any(|g| {
                g.geography_id == subject.id
                    && g.provider_label == subject.provider_label
                    && subject.geography_id.as_ref() == Some(&g.geography_id)
            })
        } else {
            subject.geography_id.is_none()
                && catalog
                    .industries
                    .iter()
                    .any(|i| i.id == subject.id && i.provider_label == subject.provider_label)
        };
        if !known || !subjects.insert(subject.id.clone()) || subject.series.is_empty() {
            return Err(invalid());
        }
        let mut metrics = BTreeSet::new();
        for series in &mut subject.series {
            let metric = catalog
                .metrics
                .iter()
                .find(|m| m.id == series.metric_id)
                .ok_or_else(invalid)?;
            if !metrics.insert(series.metric_id.clone())
                || series.points.is_empty()
                || series.points.windows(2).any(|p| p[0].year >= p[1].year)
            {
                return Err(invalid());
            }
            for point in &series.points {
                let file = definition
                    .files
                    .iter()
                    .find(|f| f.file_name == point.source_file && f.publication_year == point.year)
                    .ok_or_else(invalid)?;
                let expected_epoch = if definition.kind == "industries" && point.year < 2014 {
                    "classification_before_2014"
                } else {
                    "classification_from_2014"
                };
                if !file.fields.iter().any(|f| f.metric_id == metric.id)
                    || point.method_epoch != expected_epoch
                    || point.firm_count > 2_000_000
                    || point.value.is_some_and(|v| !v.is_finite())
                {
                    return Err(invalid());
                }
                let valid_status = match point.status.as_str() {
                    "available" => {
                        point.firm_count > 0
                            && point
                                .value
                                .is_some_and(|v| !metric.positive_only || v > 0.0)
                    }
                    "not_meaningful" => {
                        point.firm_count > 0
                            && metric.positive_only
                            && point.value.is_some_and(|v| v <= 0.0)
                    }
                    "no_firms" => point.firm_count == 0,
                    "source_error" | "source_missing" => {
                        point.firm_count > 0 && point.value.is_none()
                    }
                    _ => false,
                };
                if !valid_status {
                    return Err(invalid());
                }
            }
            series.historical_position =
                valuation_metrics::historical_position(&series.points, metric);
        }
    }
    Ok(())
}

pub async fn read(db: &SqlitePool, id: &str) -> CommandResult<ValuationResponse> {
    dataset(id)?;
    let raw: Option<String> =
        sqlx::query_scalar("SELECT data_json FROM atlas_valuation_datasets WHERE id = ?")
            .bind(id)
            .fetch_optional(db)
            .await?;
    let data: Option<ValuationDownload> = raw
        .as_deref()
        .map(serde_json::from_str)
        .transpose()
        .map_err(|_| invalid())?;
    if data.as_ref().is_some_and(|d| d.dataset_id != id) {
        return Err(invalid());
    }
    let status = match &data {
        None => "not_downloaded",
        Some(d) if d.provenance.catalog_version != catalog()?.version => "previous_catalog",
        Some(_) => "available",
    };
    Ok(ValuationResponse {
        dataset_id: id.into(),
        status: status.into(),
        data,
    })
}

/// One complete source selection replaces its old snapshot atomically.
pub async fn replace(db: &SqlitePool, mut data: ValuationDownload) -> CommandResult<()> {
    validate(&mut data)?;
    let json = serde_json::to_string(&data).map_err(|_| invalid())?;
    sqlx::query("INSERT INTO atlas_valuation_datasets (id, data_json, retrieved_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data_json=excluded.data_json, retrieved_at=excluded.retrieved_at")
        .bind(&data.dataset_id).bind(json).bind(&data.provenance.retrieved_at).execute(db).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::world_atlas::{models::SyncJob, store, valuation_source};
    use std::sync::{Arc, atomic::AtomicBool};

    fn fixture() -> ValuationDownload {
        let catalog = catalog().unwrap();
        let definition = dataset("pbv-india").unwrap();
        let file = &definition.files[0];
        let industry = catalog
            .industries
            .iter()
            .find(|i| i.provider_label == "Total Market")
            .unwrap();
        let metric = catalog
            .metrics
            .iter()
            .find(|m| m.id == "industry_pbv")
            .unwrap();
        let points = vec![ValuationPoint {
            year: file.publication_year,
            value: Some(3.0),
            status: "available".into(),
            firm_count: 100,
            method_epoch: "classification_from_2014".into(),
            source_file: file.file_name.clone(),
        }];
        ValuationDownload {
            dataset_id: definition.id.clone(),
            subjects: vec![ValuationSubject {
                id: industry.id.clone(),
                label: industry.label.clone(),
                provider_label: industry.provider_label.clone(),
                geography_id: None,
                active: true,
                series: vec![ValuationSeries {
                    metric_id: metric.id.clone(),
                    historical_position: valuation_metrics::historical_position(&points, metric),
                    points,
                }],
            }],
            provenance: ValuationProvenance {
                catalog_version: catalog.version,
                retrieved_at: "2026-09-09T00:00:00Z".into(),
                files: vec![ValuationSourceFile {
                    url: file.url.clone(),
                    file_name: file.file_name.clone(),
                    sha256: "a".repeat(64),
                    publication_year: file.publication_year,
                    workbook_date: file.workbook_date.clone(),
                    row_count: file.expected_subjects,
                }],
                excluded_subjects: vec![],
            },
        }
    }

    #[tokio::test]
    async fn world_atlas_valuation_migration_atomic_rejection_and_offline_restart() {
        let dir = tempfile::tempdir().unwrap();
        let old = sqlx::sqlite::SqlitePoolOptions::new()
            .connect_with(
                sqlx::sqlite::SqliteConnectOptions::new()
                    .filename(dir.path().join("cache.sqlite"))
                    .create_if_missing(true),
            )
            .await
            .unwrap();
        let mut v5 = sqlx::migrate!("./atlas-migrations");
        v5.migrations = v5.iter().take(5).cloned().collect::<Vec<_>>().into();
        v5.run(&old).await.unwrap();
        sqlx::query("INSERT INTO atlas_history_dataset (id, provenance_json, retrieved_at) VALUES ('maddison-2023-owid', 'upgrade-sentinel', '2026-01-01')").execute(&old).await.unwrap();
        old.close().await;
        let db = store::open(dir.path()).await.unwrap();
        assert_eq!(
            sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) FROM atlas_history_dataset WHERE provenance_json = 'upgrade-sentinel'"
            )
            .fetch_one(&db)
            .await
            .unwrap(),
            1
        );
        assert_eq!(
            read(&db, "pbv-india").await.unwrap().status,
            "not_downloaded"
        );
        replace(&db, fixture()).await.unwrap();
        let definition = dataset("pbv-india").unwrap();
        let mut cancelled_job = SyncJob {
            id: uuid::Uuid::new_v4().to_string(),
            series_id: format!("{JOB_PREFIX}pbv-india"),
            status: "running".into(),
            page: 0,
            pages: 1,
            observations: 0,
            message: String::new(),
            started_at: chrono::Utc::now().to_rfc3339(),
            finished_at: None,
        };
        let cancelled = valuation_source::download(
            &definition,
            &db,
            "cancelled-test",
            &mut cancelled_job,
            Arc::new(AtomicBool::new(true)),
        )
        .await
        .unwrap();
        assert!(cancelled.is_none());
        assert_eq!(cancelled_job.page, 0);
        let mut duplicate = fixture();
        duplicate.subjects.push(duplicate.subjects[0].clone());
        assert!(replace(&db, duplicate).await.is_err());
        let mut incomplete = fixture();
        incomplete.provenance.files.clear();
        assert!(replace(&db, incomplete).await.is_err());
        let mut invalid_value = fixture();
        invalid_value.subjects[0].series[0].points[0].value = Some(-1.0);
        assert!(replace(&db, invalid_value).await.is_err());
        assert!(read(&db, "../../journal.sqlite").await.is_err());
        db.close().await;
        let db = store::open(dir.path()).await.unwrap();
        let saved = read(&db, "pbv-india").await.unwrap().data.unwrap();
        assert_eq!(saved.subjects[0].series[0].points[0].value, Some(3.0));
        assert_eq!(saved.provenance.files.len(), 1);
        db.close().await;
    }

    #[tokio::test]
    #[ignore = "Explicit free public NYU XLS requests; isolated temporary cache"]
    async fn world_atlas_live_valuation_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let db = store::open(dir.path()).await.unwrap();
        for id in ["countries", "pbv-us", "pbv-global", "pe-india", "pe-china"] {
            let definition = dataset(id).unwrap();
            let mut job = SyncJob {
                id: uuid::Uuid::new_v4().to_string(),
                series_id: format!("{JOB_PREFIX}{id}"),
                status: "running".into(),
                page: 0,
                pages: definition.files.len() as u32,
                observations: 0,
                message: String::new(),
                started_at: chrono::Utc::now().to_rfc3339(),
                finished_at: None,
            };
            let data = valuation_source::download(
                &definition,
                &db,
                "valuation-test",
                &mut job,
                Arc::new(AtomicBool::new(false)),
            )
            .await
            .unwrap()
            .unwrap();
            assert_eq!(job.page as usize, definition.files.len());
            println!(
                "{id}: {} publications, {} subjects, {} values",
                job.page,
                data.subjects.len(),
                job.observations
            );
            replace(&db, data).await.unwrap();
            assert_eq!(read(&db, id).await.unwrap().status, "available");
        }
        db.close().await;
        let db = store::open(dir.path()).await.unwrap();
        let countries = read(&db, "countries").await.unwrap().data.unwrap();
        for id in ["m49:276", "m49:840", "m49:356", "m49:156"] {
            assert!(countries.subjects.iter().any(|s| s.id == id && s.active));
        }
        assert_eq!(
            read(&db, "pe-china")
                .await
                .unwrap()
                .data
                .unwrap()
                .provenance
                .files[0]
                .publication_year,
            2025
        );
        db.close().await;
    }
}
