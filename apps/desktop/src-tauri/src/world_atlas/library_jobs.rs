//! Fill the public Atlas library through the same validated source adapters.
//! Existing packages are retained. No journal database is opened by this job.
use super::*;
use chrono::Utc;
use sqlx::SqlitePool;
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
use uuid::Uuid;

pub const DATASET_ID: &str = "atlas-library";

#[derive(Clone, Debug)]
struct Package {
    id: String,
    label: String,
    table: &'static str,
    key: &'static str,
}

fn packages(include_markets: bool) -> CommandResult<Vec<Package>> {
    let mut out = Vec::new();
    macro_rules! family {
        ($module:ident, $label:literal, $table:literal) => {
            out.push(Package {
                id: $module::DATASET_ID.into(),
                label: $label.into(),
                table: $table,
                key: "id",
            });
        };
    }
    family!(
        demography_models,
        "UN · Bevölkerung und Altersstruktur",
        "atlas_demography_dataset"
    );
    family!(
        energy_models,
        "Ember · Stromwirtschaft",
        "atlas_energy_dataset"
    );
    family!(
        capacity_models,
        "IRENA · Erneuerbare Kapazitäten",
        "atlas_capacity_dataset"
    );
    family!(
        education_models,
        "UNESCO · Bildung",
        "atlas_education_dataset"
    );
    family!(
        health_models,
        "WHO · Gesundheitsfinanzen",
        "atlas_health_dataset"
    );
    family!(
        labor_models,
        "ILO · Beschäftigungssektoren",
        "atlas_labor_dataset"
    );
    family!(
        innovation_models,
        "WIPO · Technologiefelder",
        "atlas_innovation_dataset"
    );
    family!(
        agriculture_models,
        "FAO · Landwirtschaft",
        "atlas_agriculture_dataset"
    );
    family!(
        commodity_models,
        "Weltbank · Rohstoffpreise",
        "atlas_commodity_dataset"
    );
    family!(
        findex_models,
        "Findex · Finanzielle Teilhabe",
        "atlas_findex_dataset"
    );
    family!(
        households_models,
        "UN · Haushaltsstrukturen",
        "atlas_households_dataset"
    );
    family!(
        history_models,
        "Maddison · Lange Wirtschaftsgeschichte",
        "atlas_history_dataset"
    );
    family!(
        macrohistory_models,
        "JST · Finanzgeschichte",
        "atlas_macrohistory_dataset"
    );
    family!(
        fiscal_models,
        "IMF · Staatsfinanzen",
        "atlas_fiscal_dataset"
    );
    family!(
        credit_models,
        "BIS · Kreditentwicklung",
        "atlas_credit_dataset"
    );
    family!(
        debt_models,
        "BIS · Haushalts- und Unternehmensschulden",
        "atlas_debt_dataset"
    );
    family!(
        property_models,
        "BIS · Wohnimmobilien",
        "atlas_property_dataset"
    );
    family!(
        ratio_models,
        "OECD · Wohnen und Einkommen",
        "atlas_housing_ratio_dataset"
    );
    out.extend(
        valuation_models::catalog()?
            .datasets
            .into_iter()
            .map(|d| Package {
                label: format!("NYU · {}", d.id),
                id: d.id,
                table: "atlas_valuation_datasets",
                key: "id",
            }),
    );
    out.extend(
        public_models::config()?
            .sources
            .into_iter()
            .map(|s| Package {
                id: s.id,
                label: s.label,
                table: "atlas_public_datasets",
                key: "id",
            }),
    );
    out.extend(catalog::catalog()?.series.into_iter().map(|d| Package {
        id: d.id,
        label: d.label,
        table: "atlas_datasets",
        key: "series_id",
    }));
    if include_markets {
        out.extend(market_store::proxies()?.into_iter().map(|d| Package {
            id: d.id,
            label: d.label,
            table: "atlas_market_datasets",
            key: "proxy_id",
        }));
    }
    Ok(out)
}

async fn missing(db: &SqlitePool, include_markets: bool) -> CommandResult<Vec<Package>> {
    let mut out = Vec::new();
    for package in packages(include_markets)? {
        // Table and key come exclusively from the fixed registry above.
        let exists: bool = sqlx::query_scalar(&format!(
            "SELECT EXISTS(SELECT 1 FROM {} WHERE {}=?)",
            package.table, package.key
        ))
        .bind(&package.id)
        .fetch_one(db)
        .await?;
        if !exists {
            out.push(package);
        }
    }
    Ok(out)
}

async fn load(
    db: &SqlitePool,
    session: &str,
    package: &Package,
    parent: &SyncJob,
) -> CommandResult<()> {
    let mut progress = parent.clone();
    match package.table {
        "atlas_public_datasets" => {
            public_store::replace(db, public_source::download(&package.id).await?).await
        }
        "atlas_demography_dataset" => {
            demography_store::replace(
                db,
                demography_source::download(db, session, &mut progress).await?,
            )
            .await
        }
        "atlas_history_dataset" => {
            history_store::replace(
                db,
                history_source::download(db, session, &mut progress).await?,
            )
            .await
        }
        "atlas_energy_dataset" => energy_store::replace(db, energy_source::download().await?).await,
        "atlas_capacity_dataset" => {
            capacity_store::replace(db, capacity_source::download().await?).await
        }
        "atlas_education_dataset" => {
            education_store::replace(db, education_source::download().await?).await
        }
        "atlas_health_dataset" => health_store::replace(db, health_source::download().await?).await,
        "atlas_labor_dataset" => labor_store::replace(db, labor_source::download().await?).await,
        "atlas_innovation_dataset" => {
            innovation_store::replace(db, innovation_source::download().await?).await
        }
        "atlas_agriculture_dataset" => {
            agriculture_store::replace(db, agriculture_source::download().await?).await
        }
        "atlas_commodity_dataset" => {
            commodity_store::replace(db, commodity_source::download().await?).await
        }
        "atlas_findex_dataset" => findex_store::replace(db, findex_source::download().await?).await,
        "atlas_households_dataset" => {
            households_store::replace(db, households_source::download().await?).await
        }
        "atlas_macrohistory_dataset" => {
            macrohistory_store::replace(db, macrohistory_source::download().await?).await
        }
        "atlas_fiscal_dataset" => fiscal_store::replace(db, fiscal_source::download().await?).await,
        "atlas_credit_dataset" => credit_store::replace(db, credit_source::download().await?).await,
        "atlas_debt_dataset" => debt_store::replace(db, debt_source::download().await?).await,
        "atlas_property_dataset" => {
            property_store::replace(db, property_source::download().await?).await
        }
        "atlas_housing_ratio_dataset" => {
            ratio_store::replace(db, ratio_source::download().await?).await
        }
        "atlas_valuation_datasets" => {
            // A stop finishes the current package atomically, then stops before the next.
            let result = valuation_source::download(
                &valuation_models::dataset(&package.id)?,
                db,
                session,
                &mut progress,
                Arc::new(AtomicBool::new(false)),
            )
            .await?;
            valuation_store::replace(
                db,
                result.ok_or_else(|| {
                    CommandError::validation(
                        "Die Bewertungsgrundlage wurde nicht vollständig geladen.",
                    )
                })?,
            )
            .await
        }
        "atlas_market_datasets" => {
            market_store::replace(
                db,
                &package.id,
                market_source::download(&market_store::proxy(&package.id)?).await?,
            )
            .await
        }
        "atlas_datasets" => {
            let definition = catalog::series(&package.id)?;
            let data = if definition.source_id == "unsdg" {
                sdg_source::download(&definition).await?
            } else {
                worldbank::download_for_batch(&definition).await?
            };
            store::replace_dataset(db, &package.id, data).await
        }
        _ => Err(CommandError::validation("Unbekanntes Atlas-Datenpaket.")),
    }
}

async fn run<F, Fut>(
    db: &SqlitePool,
    session: &str,
    job: &mut SyncJob,
    packages: Vec<Package>,
    cancel: &AtomicBool,
    mut loader: F,
) -> CommandResult<()>
where
    F: FnMut(Package, SyncJob) -> Fut,
    Fut: std::future::Future<Output = CommandResult<()>>,
{
    let mut failures = Vec::new();
    for package in packages {
        if cancel.load(Ordering::Relaxed) {
            break;
        }
        job.message = format!(
            "{} wird geladen. {} Datenpakete sind neu gespeichert.",
            package.label, job.observations
        );
        store::save_job(db, session, job).await?;
        match loader(package.clone(), job.clone()).await {
            Ok(()) => job.observations += 1,
            Err(error) => failures.push(format!(
                "{}: {}",
                package.label,
                error.message.chars().take(700).collect::<String>()
            )),
        }
        job.page += 1;
        // Continue after a provider failure so independent sectors still become available.
        store::save_job(db, session, job).await?;
    }
    job.status = if job.page < job.pages {
        "interrupted"
    } else if failures.is_empty() {
        "complete"
    } else {
        "failed"
    }
    .into();
    job.message = format!(
        "{} Datenpakete neu lokal gespeichert. {} Pakete geprüft.{}{}",
        job.observations,
        job.page,
        if job.page < job.pages {
            " Der Abruf wurde unterbrochen; er kann mit den fehlenden Paketen fortgesetzt werden."
        } else {
            " Bereits vorhandene Pakete wurden beibehalten."
        },
        if failures.is_empty() {
            String::new()
        } else {
            format!(
                "\nNoch offen ({}):\n{}",
                failures.len(),
                failures.join("\n")
            )
        }
    );
    Ok(())
}

impl AtlasService {
    pub async fn start_library(self: &Arc<Self>, include_markets: bool) -> CommandResult<SyncJob> {
        let permit = self
            .gate
            .clone()
            .try_lock_owned()
            .map_err(|_| CommandError::validation("Ein Atlas-Abruf läuft bereits."))?;
        let db = self.db().await?.clone();
        let packages = missing(&db, include_markets).await?;
        if packages.is_empty() {
            return Err(CommandError::validation(
                "Alle angebundenen Datenpakete sind bereits lokal gespeichert.",
            ));
        }
        let mut job = SyncJob {
            id: Uuid::new_v4().to_string(), series_id: DATASET_ID.into(), status: "running".into(),
            page: 0, pages: packages.len() as u32, observations: 0,
            message: "Fehlende öffentliche Datenpakete werden vorbereitet. Bereits gespeicherte Quellen bleiben erhalten.".into(),
            started_at: Utc::now().to_rfc3339(), finished_at: None,
        };
        store::save_job(&db, &self.session, &job).await?;
        let cancel = Arc::new(AtomicBool::new(false));
        *self.library_job.lock().await = Some((job.id.clone(), Arc::clone(&cancel)));
        let initial = job.clone();
        let service = Arc::clone(self);
        crate::runtime::spawn(async move {
            let _permit = permit;
            if let Err(error) = run(
                &db,
                &service.session,
                &mut job,
                packages,
                &cancel,
                |package, progress| {
                    let db = db.clone();
                    let session = service.session.clone();
                    async move { load(&db, &session, &package, &progress).await }
                },
            )
            .await
            {
                job.status = "failed".into();
                job.message = format!(
                    "Der Fortschritt konnte nicht gespeichert werden: {} Bereits geladene Pakete bleiben erhalten.",
                    error.message
                );
            }
            job.finished_at = Some(Utc::now().to_rfc3339());
            if store::save_job(&db, &service.session, &job).await.is_err() {
                tracing::warn!(
                    "Atlas-Datenbestand: Abschlussstatus konnte nicht gespeichert werden"
                );
            }
            *service.library_job.lock().await = None;
        });
        Ok(initial)
    }

    pub async fn cancel_library(&self, job_id: &str) -> CommandResult<()> {
        let live = self.library_job.lock().await;
        if let Some((id, cancel)) = live.as_ref()
            && id == job_id
        {
            cancel.store(true, Ordering::Relaxed);
            return Ok(());
        }
        Err(CommandError::validation(
            "Dieser Atlas-Gesamtabruf läuft nicht mehr.",
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn library_continues_after_provider_failure_and_stops_between_packages() {
        let dir = tempfile::tempdir().unwrap();
        let db = store::open(dir.path()).await.unwrap();
        let mut job = SyncJob {
            id: "library-test".into(),
            series_id: DATASET_ID.into(),
            status: "running".into(),
            page: 0,
            pages: 3,
            observations: 0,
            message: String::new(),
            started_at: Utc::now().to_rfc3339(),
            finished_at: None,
        };
        let items = packages(false)
            .unwrap()
            .into_iter()
            .take(3)
            .collect::<Vec<_>>();
        let failed = items[0].id.clone();
        let cancel = AtomicBool::new(false);
        run(&db, "test", &mut job, items.clone(), &cancel, |item, _| {
            let fail = item.id == failed;
            async move {
                if fail {
                    Err(CommandError::validation("Provider nicht erreichbar"))
                } else {
                    Ok(())
                }
            }
        })
        .await
        .unwrap();
        assert_eq!(
            (job.page, job.observations, job.status.as_str()),
            (3, 2, "failed")
        );
        assert!(job.message.contains("Provider nicht erreichbar"));
        job.page = 0;
        job.observations = 0;
        job.status = "running".into();
        run(&db, "test", &mut job, items, &cancel, |_, _| {
            cancel.store(true, Ordering::Relaxed);
            async { Ok(()) }
        })
        .await
        .unwrap();
        assert_eq!(
            (job.page, job.observations, job.status.as_str()),
            (1, 1, "interrupted")
        );
        store::save_job(&db, "test", &job).await.unwrap();
        db.close().await;
        let db = store::open(dir.path()).await.unwrap();
        let restored = store::read_job(&db, "new-session", Some(&job.id))
            .await
            .unwrap()
            .unwrap();
        assert_eq!(restored.status, "interrupted");
        assert_eq!(restored.observations, 1);
        db.close().await;
    }
    #[tokio::test]
    async fn library_only_lists_missing_public_packages_and_respects_shared_gate() {
        let dir = tempfile::tempdir().unwrap();
        let state = AtlasState::new(dir.path().join("atlas"));
        let db = state.0.db().await.unwrap();
        let all = missing(db, false).await.unwrap();
        assert!(all.len() > 100);
        assert!(!all.iter().any(|p| p.table == "atlas_market_datasets"));
        let definition = catalog::catalog().unwrap().series[0].clone();
        sqlx::query("INSERT INTO atlas_datasets VALUES(?, '{}', '2020-01-01')")
            .bind(&definition.id)
            .execute(db)
            .await
            .unwrap();
        let pending = missing(db, false).await.unwrap();
        assert_eq!(pending.len(), all.len() - 1);
        assert!(!pending.iter().any(|p| p.id == definition.id));
        let _guard = state.0.gate.lock().await;
        assert!(state.0.start_library(false).await.is_err());
        assert!(state.0.cancel_library("unknown").await.is_err());
        assert!(missing(db, true).await.unwrap().len() > pending.len());
    }
}
