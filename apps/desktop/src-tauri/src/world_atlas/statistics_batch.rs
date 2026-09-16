use std::{
    collections::HashSet,
    future::Future,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
};

use chrono::{DateTime, Utc};
use sqlx::SqlitePool;
use uuid::Uuid;

use super::{
    AtlasService, catalog,
    models::{Download, SeriesDefinition, SyncJob},
    sdg_source, store, worldbank,
};
use crate::errors::{CommandError, CommandResult};

pub const DATASET_ID: &str = "statistics-overview";

async fn pending(
    db: &SqlitePool,
    ids: &[String],
    now: DateTime<Utc>,
) -> CommandResult<Vec<SeriesDefinition>> {
    let catalog = catalog::catalog()?;
    if ids.is_empty()
        || ids.len() > catalog.series.len()
        || ids.iter().collect::<HashSet<_>>().len() != ids.len()
    {
        return Err(CommandError::validation(
            "Bitte eine eindeutige Auswahl bekannter Atlas-Statistiken laden.",
        ));
    }
    let requested = ids
        .iter()
        .map(|id| catalog::series(id))
        .collect::<CommandResult<Vec<_>>>()?;
    let mut result = Vec::new();
    for series in requested {
        let retrieved: Option<String> =
            sqlx::query_scalar("SELECT retrieved_at FROM atlas_datasets WHERE series_id = ?")
                .bind(&series.id)
                .fetch_optional(db)
                .await?;
        let recent = retrieved
            .as_deref()
            .and_then(|time| DateTime::parse_from_rfc3339(time).ok())
            .is_some_and(|time| now.signed_duration_since(time).num_hours() < 24);
        if !recent {
            result.push(series);
        }
    }
    Ok(result)
}

async fn run<F, Fut>(
    db: &SqlitePool,
    session: &str,
    job: &mut SyncJob,
    definitions: Vec<SeriesDefinition>,
    cancel: &AtomicBool,
    mut download: F,
) -> CommandResult<()>
where
    F: FnMut(SeriesDefinition) -> Fut,
    Fut: Future<Output = CommandResult<Download>>,
{
    for series in definitions {
        if cancel.load(Ordering::Relaxed) {
            break;
        }
        job.message = format!(
            "{} wird weltweit geladen. Bereits gespeicherte Bilder bleiben verfügbar.",
            series.label
        );
        store::save_job(db, session, job).await?;
        let data = download(series.clone()).await?;
        let count = data
            .observations
            .iter()
            .filter(|row| row.point.value.is_some())
            .count();
        store::replace_dataset(db, &series.id, data).await?;
        job.page += 1;
        job.observations += count;
        job.message = format!("{} ist lokal gespeichert.", series.label);
        store::save_job(db, session, job).await?;
    }
    if job.page < job.pages {
        job.status = "interrupted".into();
        job.message = "Der Abruf wurde auf deinen Wunsch gestoppt. Bereits geladene Statistiken bleiben gespeichert; die Auswahl kann später weitergeladen werden.".into();
    } else {
        job.status = "complete".into();
        job.message =
            "Die ausgewählten Statistiken sind für die verfügbaren Länder lokal gespeichert."
                .into();
    }
    Ok(())
}

impl AtlasService {
    pub async fn start_statistics_batch(
        self: &Arc<Self>,
        ids: Vec<String>,
    ) -> CommandResult<SyncJob> {
        let permit = self
            .gate
            .clone()
            .try_lock_owned()
            .map_err(|_| CommandError::validation("Ein Atlas-Abruf läuft bereits."))?;
        let db = self.db().await?.clone();
        let definitions = pending(&db, &ids, Utc::now()).await?;
        if definitions.is_empty() {
            return Err(CommandError::validation(
                "Alle ausgewählten Statistiken wurden innerhalb der letzten 24 Stunden bereits geladen.",
            ));
        }
        let mut job = SyncJob {
            id: Uuid::new_v4().to_string(), series_id: DATASET_ID.into(), status: "running".into(),
            page: 0, pages: definitions.len() as u32, observations: 0,
            message: "Die ausgewählten Länderstatistiken werden nacheinander vorbereitet. Kürzlich geladene Reihen werden übersprungen.".into(),
            started_at: Utc::now().to_rfc3339(), finished_at: None,
        };
        store::save_job(&db, &self.session, &job).await?;
        let cancel = Arc::new(AtomicBool::new(false));
        *self.statistics_batch.lock().await = Some((job.id.clone(), Arc::clone(&cancel)));
        let initial = job.clone();
        let service = Arc::clone(self);
        tauri::async_runtime::spawn(async move {
            let _permit = permit;
            if let Err(error) = run(
                &db,
                &service.session,
                &mut job,
                definitions,
                &cancel,
                |definition| async move {
                    if definition.source_id == "unsdg" {
                        sdg_source::download(&definition).await
                    } else {
                        worldbank::download_for_batch(&definition).await
                    }
                },
            )
            .await
            {
                job.status = "failed".into();
                job.message = format!(
                    "{} Bereits abgeschlossene Statistiken bleiben gespeichert. Die Auswahl kann erneut geladen werden.",
                    error.message
                );
            }
            job.finished_at = Some(Utc::now().to_rfc3339());
            if store::save_job(&db, &service.session, &job).await.is_err() {
                tracing::warn!(
                    "Der Abschlussstatus des Atlas-Statistikabrufs konnte nicht gespeichert werden"
                );
            }
            *service.statistics_batch.lock().await = None;
        });
        Ok(initial)
    }

    pub async fn cancel_statistics_batch(&self, job_id: &str) -> CommandResult<()> {
        let batch = self.statistics_batch.lock().await;
        if let Some((id, cancel)) = batch.as_ref()
            && id == job_id
        {
            cancel.store(true, Ordering::Relaxed);
            return Ok(());
        }
        Err(CommandError::validation(
            "Dieser Statistikabruf ist nicht mehr aktiv.",
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::world_atlas::{
        AtlasState,
        models::{Observation, Point, Provenance, SeriesInput},
    };

    fn ids() -> Vec<String> {
        ["SH.XPD.CHEX.GD.ZS", "SE.PRM.ENRR", "IT.NET.BBND.P2"]
            .into_iter()
            .map(|code| format!("worldbank:2:{code}"))
            .collect()
    }
    fn sample(value: f64) -> Download {
        Download {
            provenance: Provenance {
                retrieved_at: Utc::now().to_rfc3339(),
                provider_updated_at: "2026-07-13".into(),
                source_organization: "Test".into(),
                definition: "Test".into(),
                metadata_url: "https://api.worldbank.org/".into(),
                pages: vec![],
                provider_areas: vec!["DEU".into()],
            },
            observations: vec![
                Observation {
                    geography_id: "m49:276".into(),
                    point: Point {
                        year: 2020,
                        value: Some(value),
                        source_flag: "".into(),
                    },
                },
                Observation {
                    geography_id: "m49:276".into(),
                    point: Point {
                        year: 2021,
                        value: None,
                        source_flag: "".into(),
                    },
                },
            ],
        }
    }
    fn job(pages: u32) -> SyncJob {
        SyncJob {
            id: Uuid::new_v4().to_string(),
            series_id: DATASET_ID.into(),
            status: "running".into(),
            page: 0,
            pages,
            observations: 0,
            message: String::new(),
            started_at: Utc::now().to_rfc3339(),
            finished_at: None,
        }
    }
    async fn value(db: &SqlitePool, id: &str) -> Option<f64> {
        store::read_series(
            db,
            SeriesInput {
                series_id: id.into(),
                geography_id: "m49:276".into(),
            },
        )
        .await
        .unwrap()
        .points[0]
            .value
    }

    #[tokio::test]
    async fn world_atlas_statistics_batch_preserves_failures_cancellation_and_resumption() {
        let temp = tempfile::tempdir().unwrap();
        let db = store::open(temp.path()).await.unwrap();
        let ids = ids();
        let mut old = sample(12.0);
        old.provenance.retrieved_at = "2020-01-01T00:00:00Z".into();
        store::replace_dataset(&db, &ids[1], old).await.unwrap();
        let cancel = AtomicBool::new(false);
        let mut first = job(3);
        let failed_id = ids[1].clone();
        let error = run(
            &db,
            "test",
            &mut first,
            pending(&db, &ids, Utc::now()).await.unwrap(),
            &cancel,
            |series| {
                let fail = series.id == failed_id;
                async move {
                    if fail {
                        Err(CommandError::validation("Quellentestfehler"))
                    } else {
                        Ok(sample(20.0))
                    }
                }
            },
        )
        .await
        .unwrap_err();
        assert_eq!(error.message, "Quellentestfehler");
        assert_eq!(first.page, 1);
        assert_eq!(
            first.observations, 1,
            "Null fields are not usable observations"
        );
        assert_eq!(value(&db, &ids[0]).await, Some(20.0));
        assert_eq!(value(&db, &ids[1]).await, Some(12.0));
        let remaining = pending(&db, &ids, Utc::now()).await.unwrap();
        assert_eq!(remaining.len(), 2);
        let mut second = job(2);
        run(&db, "test", &mut second, remaining, &cancel, |series| {
            assert_eq!(series.id, ids[1]);
            cancel.store(true, Ordering::Relaxed);
            async { Ok(sample(30.0)) }
        })
        .await
        .unwrap();
        assert_eq!(second.status, "interrupted");
        assert_eq!(second.page, 1);
        assert_eq!(value(&db, &ids[1]).await, Some(30.0));
        let remaining = pending(&db, &ids, Utc::now()).await.unwrap();
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].id, ids[2]);
        cancel.store(false, Ordering::Relaxed);
        let mut third = job(1);
        run(&db, "test", &mut third, remaining, &cancel, |_| async {
            Ok(sample(0.0))
        })
        .await
        .unwrap();
        assert_eq!(third.status, "complete");
        assert_eq!(third.observations, 1, "A real zero is a usable observation");
        db.close().await;
        let reopened = store::open(temp.path()).await.unwrap();
        assert_eq!(value(&reopened, &ids[2]).await, Some(0.0));
        assert!(
            pending(&reopened, &ids, Utc::now())
                .await
                .unwrap()
                .is_empty()
        );
        reopened.close().await;
    }

    #[tokio::test]
    async fn world_atlas_statistics_batch_validates_selection_and_recent_datasets() {
        let temp = tempfile::tempdir().unwrap();
        let db = store::open(temp.path()).await.unwrap();
        let ids = ids();
        let now = DateTime::parse_from_rfc3339("2026-09-09T12:00:00Z")
            .unwrap()
            .with_timezone(&Utc);
        assert_eq!(pending(&db, &ids, now).await.unwrap().len(), 3);
        sqlx::query("INSERT INTO atlas_datasets (series_id, provenance_json, retrieved_at) VALUES (?, '{}', '2026-09-08T12:00:00Z'), (?, '{}', '2026-09-09T00:00:00Z')")
            .bind(&ids[0]).bind(&ids[1]).execute(&db).await.unwrap();
        let remaining = pending(&db, &ids, now).await.unwrap();
        assert_eq!(
            remaining.iter().map(|row| &row.id).collect::<Vec<_>>(),
            vec![&ids[0], &ids[2]]
        );
        assert!(pending(&db, &[], now).await.is_err());
        assert!(
            pending(&db, &[ids[0].clone(), ids[0].clone()], now)
                .await
                .is_err()
        );
        assert!(
            pending(&db, &["https://untrusted.invalid".into()], now)
                .await
                .is_err()
        );
        db.close().await;
    }

    #[tokio::test]
    async fn world_atlas_statistics_batch_shares_gate_and_scopes_cancellation() {
        let temp = tempfile::tempdir().unwrap();
        let state = AtlasState::new(temp.path().to_path_buf());
        let ids = vec![ids()[0].clone()];
        let permit = state.0.gate.lock().await;
        assert_eq!(
            state
                .0
                .start_statistics_batch(ids.clone())
                .await
                .unwrap_err()
                .message,
            "Ein Atlas-Abruf läuft bereits."
        );
        assert!(state.0.start(&ids[0]).await.is_err());
        drop(permit);
        store::replace_dataset(state.0.db().await.unwrap(), &ids[0], sample(10.0))
            .await
            .unwrap();
        assert!(
            state
                .0
                .start_statistics_batch(ids.clone())
                .await
                .unwrap_err()
                .message
                .contains("24 Stunden")
        );
        assert!(state.0.statistics_batch.lock().await.is_none());
        let cancel = Arc::new(AtomicBool::new(false));
        *state.0.statistics_batch.lock().await = Some(("test-job".into(), Arc::clone(&cancel)));
        assert!(state.0.cancel_statistics_batch("other-job").await.is_err());
        assert!(!cancel.load(Ordering::Relaxed));
        state.0.cancel_statistics_batch("test-job").await.unwrap();
        let mut job = job(1);
        run(
            state.0.db().await.unwrap(),
            "test",
            &mut job,
            vec![catalog::series(&ids[0]).unwrap()],
            &cancel,
            |_| async { panic!("Cancelled batch must not contact the provider") },
        )
        .await
        .unwrap();
        assert_eq!(job.status, "interrupted");
        assert_eq!(job.page, 0);
        assert!(state.0.gate.try_lock().is_ok());
        state.0.db().await.unwrap().close().await;
    }

    #[tokio::test]
    #[ignore = "Two real WDI worldwide downloads through the batch service; temporary cache only"]
    async fn world_atlas_live_statistics_batch_roundtrip() {
        let temp = tempfile::tempdir().unwrap();
        let state = AtlasState::new(temp.path().to_path_buf());
        let ids = ids()[..2].to_vec();
        let initial = state.0.start_statistics_batch(ids.clone()).await.unwrap();
        assert_eq!(initial.pages, 2);
        let finished = tokio::time::timeout(std::time::Duration::from_secs(240), async {
            let mut previous = 0;
            loop {
                let current = store::read_job(
                    state.0.db().await.unwrap(),
                    &state.0.session,
                    Some(&initial.id),
                )
                .await
                .unwrap()
                .unwrap();
                assert_eq!(current.series_id, DATASET_ID);
                assert_eq!(
                    current.pages, 2,
                    "Provider pages must not overwrite batch progress"
                );
                assert!(current.page >= previous && current.page <= 2);
                previous = current.page;
                if current.status != "running" {
                    break current;
                }
                tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            }
        })
        .await
        .unwrap();
        assert_eq!(finished.status, "complete", "{}", finished.message);
        assert_eq!(finished.page, 2);
        assert!(finished.finished_at.is_some());
        let mut responses = Vec::new();
        for id in &ids {
            for area in ["m49:276", "m49:356"] {
                let row = store::read_series(
                    state.0.db().await.unwrap(),
                    SeriesInput {
                        series_id: id.clone(),
                        geography_id: area.into(),
                    },
                )
                .await
                .unwrap();
                assert_eq!(row.status, "available");
                assert!(row.points.iter().filter(|p| p.value.is_some()).count() > 20);
                responses.push(serde_json::to_value(row).unwrap());
            }
        }
        let runs: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM atlas_ingest_runs")
            .fetch_one(state.0.db().await.unwrap())
            .await
            .unwrap();
        assert_eq!(
            runs, 1,
            "Child downloads must not create separate active jobs"
        );
        assert!(state.0.start_statistics_batch(ids).await.is_err());
        state.0.db().await.unwrap().close().await;
        let reopened = store::open(temp.path()).await.unwrap();
        for response in responses {
            let row = store::read_series(
                &reopened,
                SeriesInput {
                    series_id: response["series"]["id"].as_str().unwrap().into(),
                    geography_id: response["geography"]["id"].as_str().unwrap().into(),
                },
            )
            .await
            .unwrap();
            assert_eq!(serde_json::to_value(row).unwrap(), response);
        }
        reopened.close().await;
        println!(
            "Two worldwide WDI datasets verified via one batch job, four country responses preserved after offline reopen; recent repeat rejected."
        );
    }
}
