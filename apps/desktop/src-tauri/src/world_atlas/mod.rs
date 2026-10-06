mod agriculture_jobs;
pub mod agriculture_models;
mod agriculture_source;
pub mod agriculture_store;
mod capacity_jobs;
pub mod capacity_models;
mod capacity_source;
pub mod capacity_store;
pub mod catalog;
mod commodity_jobs;
pub mod commodity_models;
mod commodity_source;
pub mod commodity_store;
#[cfg(test)]
mod commodity_tests;
mod credit_jobs;
pub mod credit_models;
mod credit_source;
pub mod credit_store;
mod debt_jobs;
pub mod debt_models;
mod debt_source;
pub mod debt_store;
#[cfg(test)]
mod debt_tests;
pub mod demography_models;
mod demography_source;
pub mod demography_store;
mod education_jobs;
pub mod education_models;
mod education_source;
pub mod education_store;
pub mod energy_models;
mod energy_source;
pub mod energy_store;
mod findex_jobs;
pub mod findex_models;
mod findex_source;
pub mod findex_store;
#[cfg(test)]
mod findex_tests;
mod fiscal_jobs;
pub mod fiscal_models;
mod fiscal_source;
pub mod fiscal_store;
#[cfg(test)]
mod fiscal_tests;
mod health_jobs;
pub mod health_models;
mod health_source;
pub mod health_store;
#[cfg(test)]
mod health_tests;
pub mod history_models;
mod history_source;
pub mod history_store;
mod households_jobs;
pub mod households_models;
mod households_source;
pub mod households_store;
#[cfg(test)]
mod households_tests;
mod innovation_jobs;
pub mod innovation_models;
mod innovation_source;
pub mod innovation_store;
#[cfg(test)]
mod innovation_tests;
mod labor_jobs;
pub mod labor_models;
mod labor_source;
pub mod labor_store;
#[cfg(test)]
mod labor_tests;
mod library_jobs;
mod macrohistory_jobs;
pub mod macrohistory_models;
mod macrohistory_source;
pub mod macrohistory_store;
mod market_batch;
pub mod market_models;
mod market_source;
pub mod market_store;
mod market_wave;
pub mod models;
pub mod notebook;
mod property_jobs;
pub mod property_models;
mod property_source;
pub mod property_store;
mod public_battery;
mod public_bgs;
mod public_census;
mod public_cpp;
mod public_eia_storage;
mod public_energy;
mod public_epo;
mod public_eurostat;
mod public_gap;
#[cfg(test)]
mod public_gap_tests;
mod public_gfdd;
mod public_housing_stock;
mod public_iea;
mod public_imts;
mod public_jobs;
mod public_materials;
pub mod public_models;
mod public_ndgain;
mod public_oecd;
mod public_regimes;
mod public_sbs;
mod public_source;
pub mod public_store;
mod public_synfuels;
mod public_tiva;
mod public_trilemma;
mod public_wgi;
mod public_wits;
mod public_wto;
mod ratio_jobs;
pub mod ratio_models;
mod ratio_source;
pub mod ratio_store;
mod sdg_source;
mod statistics_batch;
pub mod store;
mod valuation_jobs;
mod valuation_metrics;
pub mod valuation_models;
mod valuation_source;
pub mod valuation_store;
mod worldbank;

use std::{
    path::PathBuf,
    sync::{Arc, atomic::AtomicBool},
};

use chrono::Utc;
use sqlx::SqlitePool;
use tokio::sync::{Mutex, OnceCell};
use uuid::Uuid;

use crate::errors::{CommandError, CommandResult};
use models::SyncJob;

#[derive(Clone)]
pub struct AtlasState(pub Arc<AtlasService>);

pub struct AtlasService {
    root: PathBuf,
    db: OnceCell<SqlitePool>,
    gate: Arc<Mutex<()>>,
    market_batch: Mutex<Option<(String, Arc<AtomicBool>)>>,
    statistics_batch: Mutex<Option<(String, Arc<AtomicBool>)>>,
    valuation_job: Mutex<Option<(String, Arc<AtomicBool>)>>,
    library_job: Mutex<Option<(String, Arc<AtomicBool>)>>,
    pub session: String,
}

impl AtlasState {
    pub fn new(root: PathBuf) -> Self {
        Self(Arc::new(AtlasService {
            root,
            db: OnceCell::new(),
            gate: Arc::new(Mutex::new(())),
            market_batch: Mutex::new(None),
            statistics_batch: Mutex::new(None),
            valuation_job: Mutex::new(None),
            library_job: Mutex::new(None),
            session: Uuid::new_v4().to_string(),
        }))
    }
}

impl AtlasService {
    pub async fn start_energy(self: &Arc<Self>) -> CommandResult<SyncJob> {
        let permit = self
            .gate
            .clone()
            .try_lock_owned()
            .map_err(|_| CommandError::validation("Ein Atlas-Abruf läuft bereits."))?;
        let db = self.db().await?.clone();
        let current = energy_store::read(&db, "world").await?;
        if current.provenance.as_ref().is_some_and(|p| {
            chrono::DateTime::parse_from_rfc3339(&p.retrieved_at)
                .is_ok_and(|time| Utc::now().signed_duration_since(time).num_hours() < 24)
        }) {
            return Err(CommandError::validation(
                "Die weltweiten Stromdaten wurden innerhalb der letzten 24 Stunden bereits geladen.",
            ));
        }
        let mut job = SyncJob { id: Uuid::new_v4().to_string(), series_id: energy_models::DATASET_ID.into(), status: "running".into(), page: 0, pages: 2, observations: 0, message: "Die öffentlichen Stromdaten werden geladen und geprüft. Das kann einen Moment dauern.".into(), started_at: Utc::now().to_rfc3339(), finished_at: None };
        store::save_job(&db, &self.session, &job).await?;
        let initial = job.clone();
        let service = Arc::clone(self);
        crate::runtime::spawn(async move {
            let _permit = permit;
            let outcome = async {
                let data = energy_source::download().await?;
                job.page = 1;
                job.observations = data
                    .profiles
                    .iter()
                    .flat_map(|p| p.years.iter())
                    .map(|year| year.values.len())
                    .sum();
                job.message = "Die geprüften Energieprofile werden gemeinsam gespeichert.".into();
                store::save_job(&db, &service.session, &job).await?;
                energy_store::replace(&db, data).await
            }
            .await;
            job.finished_at = Some(Utc::now().to_rfc3339());
            match outcome {
                Ok(()) => {
                    job.status = "complete".into();
                    job.page = job.pages;
                    job.message = "Die weltweiten Stromdaten sind lokal verfügbar.".into();
                }
                Err(error) => {
                    job.status = "failed".into();
                    job.message = error.message;
                }
            }
            if store::save_job(&db, &service.session, &job).await.is_err() {
                tracing::warn!(
                    "Der Abschlussstatus des Atlas-Energieabrufs konnte nicht gespeichert werden"
                );
            }
        });
        Ok(initial)
    }
    pub async fn db(&self) -> CommandResult<&SqlitePool> {
        self.db.get_or_try_init(|| store::open(&self.root)).await
    }

    pub async fn start_history(self: &Arc<Self>) -> CommandResult<SyncJob> {
        let permit = self
            .gate
            .clone()
            .try_lock_owned()
            .map_err(|_| CommandError::validation("Ein Atlas-Abruf läuft bereits."))?;
        let db = self.db().await?.clone();
        let current = history_store::read(&db, "world").await?;
        if current.provenance.as_ref().is_some_and(|p| {
            chrono::DateTime::parse_from_rfc3339(&p.retrieved_at)
                .is_ok_and(|time| Utc::now().signed_duration_since(time).num_hours() < 24)
        }) {
            return Err(CommandError::validation(
                "Die historische Grundlage wurde innerhalb der letzten 24 Stunden bereits geladen.",
            ));
        }
        let mut job = SyncJob {
            id: Uuid::new_v4().to_string(),
            series_id: history_models::DATASET_ID.into(),
            status: "running".into(),
            page: 0,
            pages: 3,
            observations: 0,
            message: "Die Jahrhundertperspektive wird vorbereitet.".into(),
            started_at: Utc::now().to_rfc3339(),
            finished_at: None,
        };
        store::save_job(&db, &self.session, &job).await?;
        let initial = job.clone();
        let service = Arc::clone(self);
        crate::runtime::spawn(async move {
            let _permit = permit;
            let outcome = async {
                let data = history_source::download(&db, &service.session, &mut job).await?;
                job.observations = data.profiles.iter().map(|p| p.points.len()).sum();
                history_store::replace(&db, data).await
            }
            .await;
            job.finished_at = Some(Utc::now().to_rfc3339());
            match outcome {
                Ok(()) => {
                    job.status = "complete".into();
                    job.page = job.pages;
                    job.message =
                        "Die historischen Länderperspektiven sind lokal verfügbar.".into();
                }
                Err(error) => {
                    job.status = "failed".into();
                    job.message = error.message;
                }
            }
            if store::save_job(&db, &service.session, &job).await.is_err() {
                tracing::warn!(
                    "Der Abschlussstatus des historischen Atlas-Abrufs konnte nicht gespeichert werden"
                );
            }
        });
        Ok(initial)
    }

    pub async fn start_demography(self: &Arc<Self>) -> CommandResult<SyncJob> {
        let permit = self
            .gate
            .clone()
            .try_lock_owned()
            .map_err(|_| CommandError::validation("Ein Atlas-Abruf läuft bereits."))?;
        let db = self.db().await?.clone();
        let current = demography_store::read(&db, "world").await?;
        if current.provenance.as_ref().is_some_and(|p| {
            chrono::DateTime::parse_from_rfc3339(&p.retrieved_at)
                .is_ok_and(|time| Utc::now().signed_duration_since(time).num_hours() < 24)
        }) {
            return Err(CommandError::validation(
                "Die UN-Demografie wurde innerhalb der letzten 24 Stunden bereits geladen.",
            ));
        }
        let mut job = SyncJob {
            id: Uuid::new_v4().to_string(),
            series_id: demography_models::DATASET_ID.into(),
            status: "running".into(),
            page: 0,
            pages: 5,
            observations: 0,
            message: "Der weltweite UN-Demografieabruf wird vorbereitet.".into(),
            started_at: Utc::now().to_rfc3339(),
            finished_at: None,
        };
        store::save_job(&db, &self.session, &job).await?;
        let initial = job.clone();
        let service = Arc::clone(self);
        crate::runtime::spawn(async move {
            let _permit = permit;
            let outcome = async {
                let data = demography_source::download(&db, &service.session, &mut job).await?;
                job.observations = data
                    .profiles
                    .iter()
                    .map(|p| p.years.iter().map(|y| y.ages.len()).sum::<usize>())
                    .sum();
                demography_store::replace(&db, data).await
            }
            .await;
            job.finished_at = Some(Utc::now().to_rfc3339());
            match outcome {
                Ok(()) => {
                    job.status = "complete".into();
                    job.page = job.pages;
                    job.message = "Die weltweiten UN-Altersprofile sind lokal verfügbar.".into();
                }
                Err(error) => {
                    job.status = "failed".into();
                    job.message = error.message;
                }
            }
            if store::save_job(&db, &service.session, &job).await.is_err() {
                tracing::warn!(
                    "Der Abschlussstatus des Atlas-Demografieabrufs konnte nicht gespeichert werden"
                );
            }
        });
        Ok(initial)
    }

    pub async fn start_market(self: &Arc<Self>, proxy_id: &str) -> CommandResult<SyncJob> {
        let proxy = market_store::proxy(proxy_id)?;
        let permit = self
            .gate
            .clone()
            .try_lock_owned()
            .map_err(|_| CommandError::validation("Ein Atlas-Abruf läuft bereits."))?;
        let db = self.db().await?.clone();
        let current = market_store::read(&db, proxy_id).await?;
        if current.provenance.as_ref().is_some_and(|p| {
            chrono::DateTime::parse_from_rfc3339(&p.retrieved_at)
                .is_ok_and(|time| Utc::now().signed_duration_since(time).num_hours() < 24)
        }) {
            return Err(CommandError::validation(
                "Diese Marktgeschichte wurde innerhalb der letzten 24 Stunden geladen. Der lokale Datenstand steht bereits zur Verfügung.",
            ));
        }
        let mut job = SyncJob {
            id: Uuid::new_v4().to_string(),
            series_id: proxy_id.into(),
            status: "running".into(),
            page: 0,
            pages: 1,
            observations: 0,
            message: "Die bereinigte Marktgeschichte wird über EODHD geladen.".into(),
            started_at: Utc::now().to_rfc3339(),
            finished_at: None,
        };
        store::save_job(&db, &self.session, &job).await?;
        let initial = job.clone();
        let service = Arc::clone(self);
        crate::runtime::spawn(async move {
            let _permit = permit;
            let outcome = async {
                let data = market_source::download(&proxy).await?;
                job.observations = data
                    .months
                    .iter()
                    .filter(|m| m.adjusted_close.is_some())
                    .count();
                market_store::replace(&db, &proxy.id, data).await
            }
            .await;
            job.finished_at = Some(Utc::now().to_rfc3339());
            match outcome {
                Ok(()) => {
                    job.status = "complete".into();
                    job.page = 1;
                    job.message = "Die Marktgeschichte ist lokal verfügbar.".into();
                }
                Err(error) => {
                    job.status = "failed".into();
                    job.message = error.message;
                }
            }
            if store::save_job(&db, &service.session, &job).await.is_err() {
                tracing::warn!(
                    "Der Abschlussstatus des Atlas-Marktabrufs konnte nicht gespeichert werden"
                );
            }
        });
        Ok(initial)
    }

    pub async fn start(self: &Arc<Self>, series_id: &str) -> CommandResult<SyncJob> {
        let definition = catalog::series(series_id)?;
        let permit = self
            .gate
            .clone()
            .try_lock_owned()
            .map_err(|_| CommandError::validation("Ein Atlas-Abruf läuft bereits."))?;
        let db = self.db().await?.clone();
        if definition.source_id == "unsdg" {
            let retrieved: Option<String> =
                sqlx::query_scalar("SELECT retrieved_at FROM atlas_datasets WHERE series_id=?")
                    .bind(series_id)
                    .fetch_optional(&db)
                    .await?;
            if retrieved
                .as_deref()
                .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                .is_some_and(|time| Utc::now().signed_duration_since(time).num_hours() < 24)
            {
                return Err(CommandError::validation(
                    "Diese UN-SDG-Reihe wurde innerhalb der letzten 24 Stunden bereits geladen.",
                ));
            }
        }
        let mut job = SyncJob {
            id: Uuid::new_v4().to_string(),
            series_id: series_id.into(),
            status: "running".into(),
            page: 0,
            pages: 0,
            observations: 0,
            message: "Quellenbeschreibung und weltweite Gebietszuordnung werden geprüft.".into(),
            started_at: Utc::now().to_rfc3339(),
            finished_at: None,
        };
        store::save_job(&db, &self.session, &job).await?;
        let result = job.clone();
        let service = Arc::clone(self);
        crate::runtime::spawn(async move {
            let _permit = permit;
            let outcome = async {
                let download = if definition.source_id == "unsdg" {
                    sdg_source::download(&definition).await?
                } else {
                    worldbank::download(&db, &service.session, &mut job, &definition).await?
                };
                job.observations = download.observations.len();
                store::replace_dataset(&db, &definition.id, download).await
            }
            .await;
            job.finished_at = Some(Utc::now().to_rfc3339());
            match outcome {
                Ok(()) => {
                    job.status = "complete".into();
                    job.message = "Die Länderzeitreihen sind lokal verfügbar.".into();
                }
                Err(error) => {
                    job.status = "failed".into();
                    job.message = error.message;
                }
            }
            if store::save_job(&db, &service.session, &job).await.is_err() {
                tracing::warn!(
                    "Der Abschlussstatus des Atlas-Abrufs konnte nicht gespeichert werden"
                );
            }
        });
        Ok(result)
    }
}
