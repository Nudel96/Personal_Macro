pub mod models;
mod provider;
pub(crate) mod store;
#[cfg(test)]
mod tests;

use chrono::Utc;
use sqlx::SqlitePool;
use std::{
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
};
use tokio::sync::{Mutex, OnceCell};

use crate::{commands::eodhd_prices, errors::CommandResult};
use models::*;
use provider::error;

#[derive(Clone)]
pub struct GovernmentBondsState(Arc<Service>);

struct Service {
    root: PathBuf,
    db: OnceCell<SqlitePool>,
    gate: Arc<Mutex<()>>,
    cancelled: AtomicBool,
}

impl GovernmentBondsState {
    pub fn new(root: PathBuf) -> Self {
        Self(Arc::new(Service {
            root,
            db: OnceCell::new(),
            gate: Arc::new(Mutex::new(())),
            cancelled: AtomicBool::new(false),
        }))
    }

    async fn db(&self) -> CommandResult<&SqlitePool> {
        self.0
            .db
            .get_or_try_init(|| store::initialize(&self.0.root))
            .await
    }

    pub async fn job(&self) -> CommandResult<Option<SyncJob>> {
        let db = self.db().await?;
        let mut job = store::latest_job(db).await?;
        if let Some(job) = &mut job
            && job.status == "running"
            && self.0.gate.try_lock().is_ok()
        {
            job.status = "interrupted".into();
            job.finished_at = Some(Utc::now().to_rfc3339());
            job.message = "Der vorige Abruf wurde durch das Schließen der App unterbrochen. Bereits gespeicherte Reihen bleiben erhalten.".into();
            store::save_job(db, job).await?;
        }
        Ok(job)
    }

    pub async fn dashboard(&self) -> CommandResult<Dashboard> {
        let db = self.db().await?;
        let excluded = store::metadata(db, "excluded")
            .await?
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_else(|| catalog().excluded.clone());
        Ok(Dashboard {
            as_of: Utc::now().to_rfc3339(),
            configured: eodhd_prices::api_key().is_some(),
            desktop: true,
            catalog_reviewed_at: catalog().reviewed_at.clone(),
            catalog_checked_at: store::metadata(db, "catalogCheckedAt").await?,
            source_url: catalog().source_url.clone(),
            methodology_url: catalog().methodology_url.clone(),
            countries: catalog().countries.clone(),
            instruments: store::quotes(db, Utc::now().date_naive()).await?,
            excluded,
            job: self.job().await?,
        })
    }

    pub async fn detail(&self, input: &DetailInput) -> CommandResult<Detail> {
        store::detail(self.db().await?, input).await
    }

    pub async fn cancel(&self, job_id: &str) -> CommandResult<()> {
        let job = store::latest_job(self.db().await?).await?;
        if !job.is_some_and(|j| j.id == job_id && j.status == "running") {
            return Err(error(
                "VALIDATION_ERROR",
                "Dieser Anleiheabruf läuft nicht mehr.",
            ));
        }
        self.0.cancelled.store(true, Ordering::SeqCst);
        Ok(())
    }

    pub async fn start(&self, country_id: Option<String>) -> CommandResult<SyncJob> {
        if country_id
            .as_ref()
            .is_some_and(|id| !catalog().instruments.iter().any(|i| &i.country_id == id))
        {
            return Err(error(
                "BOND_NO_COVERAGE",
                "Für dieses Land ist keine geprüfte Staatsanleihereihe angebunden.",
            ));
        }
        let key = eodhd_prices::api_key().ok_or_else(|| error("BOND_NOT_CONFIGURED", "Für Staatsanleihen wird der vorhandene EODHD-Zugang benötigt. Bitte den API-Schlüssel lokal einrichten."))?;
        let guard = self
            .0
            .gate
            .clone()
            .try_lock_owned()
            .map_err(|_| error("BOND_SYNC_BUSY", "Ein Staatsanleiheabruf läuft bereits."))?;
        let db = self.db().await?.clone();
        self.0.cancelled.store(false, Ordering::SeqCst);
        let job = SyncJob {
            id: uuid::Uuid::new_v4().to_string(),
            status: "running".into(),
            country_id,
            started_at: Utc::now().to_rfc3339(),
            finished_at: None,
            total: 0,
            completed: 0,
            skipped: 0,
            failed: 0,
            current_symbol: None,
            message: "Der Quellenkatalog wird geprüft …".into(),
        };
        store::save_job(&db, &job).await?;
        let initial = job.clone();
        let state = self.clone();
        crate::runtime::spawn(async move {
            let _guard = guard;
            let mut job = job;
            let result = state.run_sync(&db, &key, &mut job).await;
            if let Err(e) = result {
                job.status = if job.completed > 0 || job.skipped > 0 {
                    "partial"
                } else {
                    "failed"
                }
                .into();
                job.message = e.message;
            } else if state.0.cancelled.load(Ordering::SeqCst) {
                job.status = "cancelled".into();
                job.message =
                    "Abruf beendet. Bereits gespeicherte Renditereihen bleiben erhalten.".into();
            } else {
                job.status = if job.failed > 0 {
                    "partial"
                } else {
                    "completed"
                }
                .into();
                job.message = format!(
                    "{} Reihen gespeichert · {} bereits aktuell · {} nicht abrufbar.",
                    job.completed, job.skipped, job.failed
                );
            }
            job.current_symbol = None;
            job.finished_at = Some(Utc::now().to_rfc3339());
            if store::save_job(&db, &job).await.is_err() {
                tracing::warn!(
                    "Der finale Staatsanleihe-Abrufstatus konnte nicht gespeichert werden"
                );
            }
        });
        Ok(initial)
    }

    async fn run_sync(&self, db: &SqlitePool, key: &str, job: &mut SyncJob) -> CommandResult<()> {
        let client = provider::client()?;
        if !store::recently_fetched(store::metadata(db, "catalogCheckedAt").await?.as_deref()) {
            let bytes =
                provider::download(&client, "exchange-symbol-list/GBOND", key, None).await?;
            let (active, excluded) = provider::parse_catalog(&bytes)?;
            store::save_catalog(db, &active, &excluded).await?;
        }
        let items: Vec<_> = store::quotes(db, Utc::now().date_naive())
            .await?
            .into_iter()
            .filter(|q| {
                q.active
                    && job
                        .country_id
                        .as_ref()
                        .is_none_or(|id| &q.instrument.country_id == id)
            })
            .collect();
        job.total = items.len();
        if items.is_empty() {
            return Err(error(
                "BOND_NO_COVERAGE",
                "Der aktuelle Quellenkatalog bestätigt keine abrufbare Staatsanleihereihe für diese Auswahl.",
            ));
        }
        store::save_job(db, job).await?;
        for item in items {
            if self.0.cancelled.load(Ordering::SeqCst) {
                break;
            }
            if store::recently_fetched(item.fetched_at.as_deref()) {
                job.skipped += 1;
                store::save_job(db, job).await?;
                continue;
            }
            let symbol = &item.instrument.symbol;
            job.current_symbol = Some(symbol.clone());
            job.message = format!("{} wird geladen …", item.instrument.name);
            store::save_job(db, job).await?;
            let (from, through) = store::fetch_window(db, symbol).await?;
            let result = async {
                let bytes = provider::download(
                    &client,
                    &format!("eod/{symbol}"),
                    key,
                    Some((&from.to_string(), &through.to_string())),
                )
                .await?;
                let points = provider::parse_history(&bytes, from, through)?;
                store::save_history(db, symbol, from, through, &points).await
            }
            .await;
            match result {
                Ok(()) => {
                    job.completed += 1;
                }
                Err(e) => {
                    job.failed += 1;
                    store::save_failure(db, symbol, &e.message).await?;
                    if matches!(
                        e.code.as_str(),
                        "BOND_ACCESS_DENIED" | "BOND_RATE_LIMIT" | "DATABASE_ERROR"
                    ) {
                        return Err(e);
                    }
                }
            }
            store::save_job(db, job).await?;
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        }
        Ok(())
    }
}
