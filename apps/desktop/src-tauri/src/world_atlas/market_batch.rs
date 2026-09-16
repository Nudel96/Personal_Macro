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
    AtlasService,
    market_models::{MarketDownload, MarketProxy},
    market_source, market_store,
    models::SyncJob,
    store,
};
use crate::errors::{CommandError, CommandResult};

pub const DATASET_ID: &str = "market-overview";

/// A batch may request only catalogued funds. Successful recent downloads are
/// retained, including young funds whose history is not yet long enough.
async fn pending(
    db: &SqlitePool,
    ids: &[String],
    now: DateTime<Utc>,
) -> CommandResult<Vec<MarketProxy>> {
    let catalog = market_store::proxies()?;
    if ids.is_empty()
        || ids.len() > catalog.len()
        || ids.iter().collect::<HashSet<_>>().len() != ids.len()
    {
        return Err(CommandError::validation(
            "Bitte eine eindeutige Auswahl bekannter Atlas-Märkte laden.",
        ));
    }
    let requested = ids
        .iter()
        .map(|id| market_store::proxy(id))
        .collect::<CommandResult<Vec<_>>>()?;
    let mut result = Vec::new();
    for proxy in requested {
        let retrieved: Option<String> =
            sqlx::query_scalar("SELECT retrieved_at FROM atlas_market_datasets WHERE proxy_id = ?")
                .bind(&proxy.id)
                .fetch_optional(db)
                .await?;
        let recent = retrieved
            .as_deref()
            .and_then(|time| DateTime::parse_from_rfc3339(time).ok())
            .is_some_and(|time| now.signed_duration_since(time).num_hours() < 24);
        if !recent {
            result.push(proxy);
        }
    }
    Ok(result)
}

async fn run<F, Fut>(
    db: &SqlitePool,
    session: &str,
    job: &mut SyncJob,
    proxies: Vec<MarketProxy>,
    cancel: &AtomicBool,
    mut download: F,
) -> CommandResult<()>
where
    F: FnMut(MarketProxy) -> Fut,
    Fut: Future<Output = CommandResult<MarketDownload>>,
{
    for proxy in proxies {
        if cancel.load(Ordering::Relaxed) {
            break;
        }
        job.message = format!(
            "{} wird geladen. Bereits gespeicherte Bilder bleiben verfügbar.",
            proxy.label
        );
        store::save_job(db, session, job).await?;
        let data = download(proxy.clone()).await?;
        let observations = data
            .months
            .iter()
            .filter(|m| m.adjusted_close.is_some())
            .count();
        market_store::replace(db, &proxy.id, data).await?;
        job.page += 1;
        job.observations += observations;
        job.message = format!("{} ist lokal gespeichert.", proxy.label);
        store::save_job(db, session, job).await?;
    }
    if job.page < job.pages {
        job.status = "interrupted".into();
        job.message = "Der Abruf wurde auf deinen Wunsch gestoppt. Bereits geladene Märkte bleiben gespeichert; die Auswahl kann später weitergeladen werden.".into();
    } else {
        job.status = "complete".into();
        job.message = "Die ausgewählten Marktgeschichten sind lokal gespeichert.".into();
    }
    Ok(())
}

impl AtlasService {
    pub async fn start_market_batch(self: &Arc<Self>, ids: Vec<String>) -> CommandResult<SyncJob> {
        let permit = self
            .gate
            .clone()
            .try_lock_owned()
            .map_err(|_| CommandError::validation("Ein Atlas-Abruf läuft bereits."))?;
        let db = self.db().await?.clone();
        let proxies = pending(&db, &ids, Utc::now()).await?;
        if proxies.is_empty() {
            return Err(CommandError::validation(
                "Alle ausgewählten Marktgeschichten wurden innerhalb der letzten 24 Stunden bereits geladen.",
            ));
        }
        let mut job = SyncJob {
            id: Uuid::new_v4().to_string(),
            series_id: DATASET_ID.into(),
            status: "running".into(),
            page: 0,
            pages: proxies.len() as u32,
            observations: 0,
            message: "Die ausgewählten Marktbilder werden nacheinander vorbereitet.".into(),
            started_at: Utc::now().to_rfc3339(),
            finished_at: None,
        };
        store::save_job(&db, &self.session, &job).await?;
        let cancel = Arc::new(AtomicBool::new(false));
        *self.market_batch.lock().await = Some((job.id.clone(), Arc::clone(&cancel)));
        let initial = job.clone();
        let service = Arc::clone(self);
        tauri::async_runtime::spawn(async move {
            let _permit = permit;
            if let Err(error) = run(
                &db,
                &service.session,
                &mut job,
                proxies,
                &cancel,
                |proxy| async move { market_source::download(&proxy).await },
            )
            .await
            {
                job.status = "failed".into();
                job.message = format!(
                    "{} Bereits abgeschlossene Marktgeschichten bleiben gespeichert. Die Auswahl kann erneut geladen werden.",
                    error.message
                );
            }
            job.finished_at = Some(Utc::now().to_rfc3339());
            if store::save_job(&db, &service.session, &job).await.is_err() {
                tracing::warn!(
                    "Der Abschlussstatus der Atlas-Marktübersicht konnte nicht gespeichert werden"
                );
            }
            *service.market_batch.lock().await = None;
        });
        Ok(initial)
    }

    pub async fn cancel_market_batch(&self, job_id: &str) -> CommandResult<()> {
        let batch = self.market_batch.lock().await;
        if let Some((id, cancel)) = batch.as_ref()
            && id == job_id
        {
            cancel.store(true, Ordering::Relaxed);
            return Ok(());
        }
        Err(CommandError::validation(
            "Dieser Sammelabruf ist nicht mehr aktiv.",
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::world_atlas::{
        AtlasState,
        market_models::{MarketMonth, MarketProvenance},
    };

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
    fn sample(value: f64) -> MarketDownload {
        MarketDownload {
            provenance: MarketProvenance {
                retrieved_at: Utc::now().to_rfc3339(),
                source_url: "https://example.invalid/test-only".into(),
                sha256: "test".into(),
                source_first_date: "2026-08-31".into(),
                source_last_date: "2026-08-31".into(),
                adjustment: "test".into(),
            },
            months: vec![MarketMonth {
                month: "2026-08".into(),
                adjusted_close: Some(value),
            }],
        }
    }

    #[tokio::test]
    async fn world_atlas_market_batch_preserves_data_on_failure_and_finishes_current_fund_before_stop()
     {
        let temp = tempfile::tempdir().unwrap();
        let db = store::open(temp.path()).await.unwrap();
        let ids: Vec<String> = vec![
            "eodhd:SPY.US".into(),
            "eodhd:TAN.US".into(),
            "eodhd:HYDR.US".into(),
        ];
        let mut previous = sample(50.0);
        previous.provenance.retrieved_at = "2020-01-01T00:00:00Z".into();
        market_store::replace(&db, &ids[1], previous).await.unwrap();
        let mut first = job(3);
        let token = AtomicBool::new(false);
        let error = run(
            &db,
            "test-session",
            &mut first,
            pending(&db, &ids, Utc::now()).await.unwrap(),
            &token,
            |proxy| async move {
                if proxy.symbol == "TAN.US" {
                    Err(CommandError::validation("Provider-Testfehler"))
                } else {
                    Ok(sample(100.0))
                }
            },
        )
        .await
        .unwrap_err();
        assert_eq!(error.message, "Provider-Testfehler");
        assert_eq!(first.page, 1);
        assert_eq!(
            market_store::read(&db, &ids[0])
                .await
                .unwrap()
                .analysis
                .points[0]
                .adjusted_close,
            Some(100.0)
        );
        assert_eq!(
            market_store::read(&db, &ids[1])
                .await
                .unwrap()
                .analysis
                .points[0]
                .adjusted_close,
            Some(50.0)
        );
        let remaining = pending(&db, &ids, Utc::now()).await.unwrap();
        assert_eq!(remaining.len(), 2);
        let mut second = job(2);
        run(
            &db,
            "test-session",
            &mut second,
            remaining,
            &token,
            |proxy| {
                // A stop request while the current download is in flight must still
                // commit that complete result, then stop before the next fund.
                assert_eq!(proxy.symbol, "TAN.US");
                token.store(true, Ordering::Relaxed);
                async { Ok(sample(75.0)) }
            },
        )
        .await
        .unwrap();
        assert_eq!(second.status, "interrupted");
        assert_eq!(second.page, 1);
        assert_eq!(
            market_store::read(&db, &ids[1])
                .await
                .unwrap()
                .analysis
                .points[0]
                .adjusted_close,
            Some(75.0)
        );
        assert_eq!(
            market_store::read(&db, &ids[2]).await.unwrap().status,
            "not_downloaded"
        );
        let remaining = pending(&db, &ids, Utc::now()).await.unwrap();
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].id, ids[2]);
        token.store(false, Ordering::Relaxed);
        let mut third = job(1);
        run(
            &db,
            "test-session",
            &mut third,
            remaining,
            &token,
            |_| async { Ok(sample(90.0)) },
        )
        .await
        .unwrap();
        assert_eq!(third.status, "complete");
        assert_eq!(third.page, third.pages);
        db.close().await;
        let reopened = store::open(temp.path()).await.unwrap();
        for id in ids {
            assert_eq!(
                market_store::read(&reopened, &id).await.unwrap().status,
                "available"
            );
        }
        reopened.close().await;
    }

    #[tokio::test]
    async fn world_atlas_market_batch_respects_the_shared_gate_and_rejects_recent_only_selection() {
        let temp = tempfile::tempdir().unwrap();
        let state = AtlasState::new(temp.path().to_path_buf());
        let ids = vec!["eodhd:SPY.US".into()];
        let permit = state.0.gate.lock().await;
        assert_eq!(
            state
                .0
                .start_market_batch(ids.clone())
                .await
                .unwrap_err()
                .message,
            "Ein Atlas-Abruf läuft bereits."
        );
        drop(permit);
        market_store::replace(state.0.db().await.unwrap(), &ids[0], sample(100.0))
            .await
            .unwrap();
        assert!(
            state
                .0
                .start_market_batch(ids)
                .await
                .unwrap_err()
                .message
                .contains("24 Stunden")
        );
        assert!(state.0.market_batch.lock().await.is_none());
        assert!(state.0.gate.try_lock().is_ok());
        state.0.db().await.unwrap().close().await;
    }

    #[tokio::test]
    #[ignore = "Two requests with the existing EODHD configuration; isolated temporary cache only"]
    async fn world_atlas_live_market_batch_roundtrip() {
        let temp = tempfile::tempdir().unwrap();
        let state = AtlasState::new(temp.path().to_path_buf());
        let ids = vec!["eodhd:SPY.US".into(), "eodhd:TAN.US".into()];
        let initial = state.0.start_market_batch(ids.clone()).await.unwrap();
        assert_eq!(initial.pages, 2);
        let finished = tokio::time::timeout(std::time::Duration::from_secs(110), async {
            loop {
                let current = store::read_job(
                    state.0.db().await.unwrap(),
                    &state.0.session,
                    Some(&initial.id),
                )
                .await
                .unwrap()
                .unwrap();
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
        for id in &ids {
            let row = market_store::read(state.0.db().await.unwrap(), id)
                .await
                .unwrap();
            assert_eq!(row.status, "available");
            assert!(row.analysis.wave_months > 0);
        }
        assert!(state.0.start_market_batch(ids).await.is_err());
        println!(
            "Two market histories completed through the shared batch service; subsequent refresh rejected within 24 hours."
        );
        state.0.db().await.unwrap().close().await;
    }

    #[tokio::test]
    async fn world_atlas_market_batch_validates_selection_and_skips_recent_successes() {
        let temp = tempfile::tempdir().unwrap();
        let db = store::open(temp.path()).await.unwrap();
        let now = DateTime::parse_from_rfc3339("2026-09-08T12:00:00Z")
            .unwrap()
            .with_timezone(&Utc);
        let ids = vec![
            "eodhd:SPY.US".into(),
            "eodhd:HYDR.US".into(),
            "eodhd:TAN.US".into(),
        ];
        assert_eq!(pending(&db, &ids, now).await.unwrap().len(), 3);
        sqlx::query("INSERT INTO atlas_market_datasets (proxy_id, provenance_json, retrieved_at) VALUES ('eodhd:HYDR.US', '{}', '2026-09-08T00:00:00Z'), ('eodhd:SPY.US', '{}', '2026-09-07T12:00:00Z')").execute(&db).await.unwrap();
        let remaining = pending(&db, &ids, now).await.unwrap();
        assert_eq!(
            remaining.iter().map(|p| p.id.as_str()).collect::<Vec<_>>(),
            vec!["eodhd:SPY.US", "eodhd:TAN.US"]
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
    async fn world_atlas_market_batch_cancellation_is_scoped_and_keeps_progress() {
        let temp = tempfile::tempdir().unwrap();
        let state = AtlasState::new(temp.path().to_path_buf());
        let token = Arc::new(AtomicBool::new(false));
        *state.0.market_batch.lock().await = Some(("test-job".into(), Arc::clone(&token)));
        assert!(state.0.cancel_market_batch("another-job").await.is_err());
        assert!(!token.load(Ordering::Relaxed));
        state.0.cancel_market_batch("test-job").await.unwrap();
        let mut job = SyncJob {
            id: "test-job".into(),
            series_id: DATASET_ID.into(),
            status: "running".into(),
            page: 1,
            pages: 2,
            observations: 71,
            message: String::new(),
            started_at: Utc::now().to_rfc3339(),
            finished_at: None,
        };
        run(
            state.0.db().await.unwrap(),
            &state.0.session,
            &mut job,
            vec![market_store::proxy("eodhd:TAN.US").unwrap()],
            &token,
            |_| async { panic!("A cancelled batch must not contact the provider") },
        )
        .await
        .unwrap();
        assert_eq!(job.status, "interrupted");
        assert_eq!(job.page, 1);
        assert_eq!(job.observations, 71);
        state.0.db().await.unwrap().close().await;
    }
}
