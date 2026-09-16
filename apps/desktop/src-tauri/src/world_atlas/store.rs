use std::{path::Path, time::Duration};

use sqlx::{
    Row, SqlitePool,
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions},
};

use super::{catalog, models::*};
use crate::errors::{AppError, CommandError, CommandResult};

fn json_error() -> CommandError {
    CommandError::validation("Die gespeicherten Atlas-Metadaten sind nicht lesbar.")
}

pub async fn open(root: &Path) -> CommandResult<SqlitePool> {
    std::fs::create_dir_all(root).map_err(AppError::from)?;
    let db = SqlitePoolOptions::new()
        .max_connections(4)
        .connect_with(
            SqliteConnectOptions::new()
                .filename(root.join("cache.sqlite"))
                .create_if_missing(true)
                .foreign_keys(true)
                .journal_mode(SqliteJournalMode::Wal)
                .busy_timeout(Duration::from_secs(5)),
        )
        .await?;
    sqlx::migrate!("./atlas-migrations")
        .run(&db)
        .await
        .map_err(|_| {
            CommandError::validation("Der lokale Atlas-Speicher konnte nicht initialisiert werden.")
        })?;
    Ok(db)
}

pub async fn read_series(db: &SqlitePool, input: SeriesInput) -> CommandResult<SeriesResponse> {
    let series = catalog::series(&input.series_id)?;
    let geography = catalog::geography(&input.geography_id)?;
    let mut tx = db.begin().await?;
    let metadata: Option<String> =
        sqlx::query_scalar("SELECT provenance_json FROM atlas_datasets WHERE series_id = ?")
            .bind(&series.id)
            .fetch_optional(&mut *tx)
            .await?;
    let provenance: Option<Provenance> = metadata
        .map(|text| serde_json::from_str(&text))
        .transpose()
        .map_err(|_| json_error())?;
    let points: Vec<Point> = sqlx::query_as("SELECT year, value, source_flag FROM atlas_observations WHERE series_id = ? AND geography_id = ? AND (? IS NULL OR year <= ?) ORDER BY year")
        .bind(&series.id).bind(&geography.id).bind(series.through_year).bind(series.through_year).fetch_all(&mut *tx).await?;
    tx.commit().await?;
    let provider_area = if series.source_id == "unsdg" {
        geography.id.clone()
    } else {
        super::worldbank::geography_code(&geography)?
    };
    let status = match &provenance {
        None => "not_downloaded",
        Some(meta) if !meta.provider_areas.contains(&provider_area) => "unsupported_area",
        Some(_) if !points.iter().any(|point| point.value.is_some()) => "empty",
        Some(_) => "available",
    }
    .into();
    Ok(SeriesResponse {
        series,
        geography,
        status,
        points,
        provenance,
    })
}

pub async fn replace_dataset(
    db: &SqlitePool,
    series_id: &str,
    download: Download,
) -> CommandResult<()> {
    let metadata = serde_json::to_string(&download.provenance).map_err(|_| json_error())?;
    let mut tx = db.begin().await?;
    sqlx::query("INSERT INTO atlas_datasets (series_id, provenance_json, retrieved_at) VALUES (?, ?, ?) ON CONFLICT(series_id) DO UPDATE SET provenance_json=excluded.provenance_json, retrieved_at=excluded.retrieved_at")
        .bind(series_id).bind(metadata).bind(&download.provenance.retrieved_at).execute(&mut *tx).await?;
    sqlx::query("DELETE FROM atlas_observations WHERE series_id = ?")
        .bind(series_id)
        .execute(&mut *tx)
        .await?;
    for chunk in download.observations.chunks(150) {
        let mut query = sqlx::QueryBuilder::new(
            "INSERT INTO atlas_observations (series_id, geography_id, year, value, source_flag) ",
        );
        query.push_values(chunk, |mut row, item| {
            row.push_bind(series_id)
                .push_bind(&item.geography_id)
                .push_bind(item.point.year)
                .push_bind(item.point.value)
                .push_bind(&item.point.source_flag);
        });
        query.build().execute(&mut *tx).await?;
    }
    tx.commit().await?;
    Ok(())
}

pub async fn save_job(db: &SqlitePool, session: &str, job: &SyncJob) -> CommandResult<()> {
    let value = serde_json::to_string(job).map_err(|_| json_error())?;
    sqlx::query("INSERT INTO atlas_ingest_runs (id, session_id, started_at, job_json) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET job_json=excluded.job_json")
        .bind(&job.id).bind(session).bind(&job.started_at).bind(value).execute(db).await?;
    Ok(())
}

/// A library job reports packages, while an individual source reports pages.
/// Keep nested page progress from overwriting the parent package progress.
pub async fn save_source_progress(
    db: &SqlitePool,
    session: &str,
    job: &SyncJob,
) -> CommandResult<()> {
    if job.series_id == super::library_jobs::DATASET_ID {
        return Ok(());
    }
    save_job(db, session, job).await
}

pub async fn read_job(
    db: &SqlitePool,
    session: &str,
    id: Option<&str>,
) -> CommandResult<Option<SyncJob>> {
    let row = if let Some(id) = id {
        sqlx::query("SELECT session_id, job_json FROM atlas_ingest_runs WHERE id = ?")
            .bind(id)
            .fetch_optional(db)
            .await?
    } else {
        sqlx::query(
            "SELECT session_id, job_json FROM atlas_ingest_runs ORDER BY started_at DESC LIMIT 1",
        )
        .fetch_optional(db)
        .await?
    };
    row.map(|row| {
        let mut job: SyncJob = serde_json::from_str(row.get("job_json")).map_err(|_| json_error())?;
        if job.status == "running" && row.get::<String, _>("session_id") != session {
            job.status = "interrupted".into();
            job.message = "Der frühere Abruf wurde unterbrochen. Er kann neu gestartet werden; der letzte vollständige Datenstand bleibt erhalten.".into();
        }
        Ok(job)
    }).transpose()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn download(value: Option<f64>) -> Download {
        Download {
            provenance: Provenance {
                retrieved_at: "2026-09-08T00:00:00Z".into(),
                provider_updated_at: "2026-08-01".into(),
                source_organization: "Test".into(),
                definition: "Test".into(),
                metadata_url: "https://api.worldbank.org/".into(),
                pages: vec![],
                provider_areas: vec!["DEU".into()],
            },
            observations: vec![Observation {
                geography_id: "m49:276".into(),
                point: Point {
                    year: 2020,
                    value,
                    source_flag: "e".into(),
                },
            }],
        }
    }

    fn input() -> SeriesInput {
        SeriesInput {
            series_id: "worldbank:2:SP.POP.TOTL".into(),
            geography_id: "m49:276".into(),
        }
    }

    #[tokio::test]
    async fn world_atlas_model_window_also_applies_to_cached_observations() {
        let dir = tempfile::tempdir().unwrap();
        let db = open(dir.path()).await.unwrap();
        let id = "worldbank:2:SL.AGR.EMPL.ZS";
        let mut data = download(Some(12.));
        data.observations[0].point.year = 2024;
        data.observations.push(Observation {
            geography_id: "m49:276".into(),
            point: Point {
                year: 2025,
                value: Some(99.),
                source_flag: String::new(),
            },
        });
        replace_dataset(&db, id, data).await.unwrap();
        let result = read_series(
            &db,
            SeriesInput {
                series_id: id.into(),
                geography_id: "m49:276".into(),
            },
        )
        .await
        .unwrap();
        assert_eq!(result.status, "available");
        assert_eq!(result.points.len(), 1);
        assert_eq!(result.points[0].year, 2024);
        assert_eq!(result.points[0].value, Some(12.));
        assert_eq!(
            sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) FROM atlas_observations WHERE year = 2025"
            )
            .fetch_one(&db)
            .await
            .unwrap(),
            1
        );
    }

    #[tokio::test]
    async fn world_atlas_interrupted_download_does_not_stay_running_after_restart() {
        let dir = tempfile::tempdir().unwrap();
        let db = open(dir.path()).await.unwrap();
        let job = SyncJob {
            id: "test-job".into(),
            series_id: input().series_id,
            status: "running".into(),
            page: 2,
            pages: 4,
            observations: 0,
            message: "Abruf".into(),
            started_at: "2026-09-08T00:00:00Z".into(),
            finished_at: None,
        };
        save_job(&db, "session-a", &job).await.unwrap();
        assert_eq!(
            read_job(&db, "session-a", None)
                .await
                .unwrap()
                .unwrap()
                .status,
            "running"
        );
        assert_eq!(
            read_job(&db, "session-b", None)
                .await
                .unwrap()
                .unwrap()
                .status,
            "interrupted"
        );
        assert_eq!(
            read_series(&db, input()).await.unwrap().status,
            "not_downloaded"
        );
        db.close().await;
    }

    #[tokio::test]
    async fn world_atlas_cache_migration_reopen_revision_null_and_atomic_failure() {
        let dir = tempfile::tempdir().unwrap();
        let db = open(dir.path()).await.unwrap();
        assert_eq!(
            read_series(&db, input()).await.unwrap().status,
            "not_downloaded"
        );
        replace_dataset(&db, &input().series_id, download(Some(10.0)))
            .await
            .unwrap();
        let mut invalid = download(Some(99.0));
        invalid.observations.push(Observation {
            geography_id: "m49:276".into(),
            point: Point {
                year: 2020,
                value: Some(3.0),
                source_flag: "".into(),
            },
        });
        assert!(
            replace_dataset(&db, &input().series_id, invalid)
                .await
                .is_err()
        );
        assert_eq!(
            read_series(&db, input()).await.unwrap().points[0].value,
            Some(10.0)
        );
        db.close().await;
        let reopened = open(dir.path()).await.unwrap();
        assert_eq!(
            read_series(&reopened, input()).await.unwrap().points[0].value,
            Some(10.0)
        );
        replace_dataset(&reopened, &input().series_id, download(None))
            .await
            .unwrap();
        let data = read_series(&reopened, input()).await.unwrap();
        assert_eq!(data.status, "empty");
        assert_eq!(data.points[0].value, None);
        assert_eq!(data.points[0].source_flag, "e");
        assert_eq!(
            read_series(
                &reopened,
                SeriesInput {
                    geography_id: "provider:TWN".into(),
                    ..input()
                }
            )
            .await
            .unwrap()
            .status,
            "unsupported_area"
        );
        reopened.close().await;
    }
}
