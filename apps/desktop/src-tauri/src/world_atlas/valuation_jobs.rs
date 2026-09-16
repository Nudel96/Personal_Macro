use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};

use chrono::Utc;
use uuid::Uuid;

use super::{
    AtlasService, models::SyncJob, store, valuation_models, valuation_source, valuation_store,
};
use crate::errors::{CommandError, CommandResult};

impl AtlasService {
    pub async fn start_valuation(self: &Arc<Self>, dataset_id: &str) -> CommandResult<SyncJob> {
        let definition = valuation_models::dataset(dataset_id)?;
        let permit = self
            .gate
            .clone()
            .try_lock_owned()
            .map_err(|_| CommandError::validation("Ein Atlas-Abruf läuft bereits."))?;
        let db = self.db().await?.clone();
        let current = valuation_store::read(&db, dataset_id).await?;
        if current.status == "available"
            && current.data.as_ref().is_some_and(|d| {
                chrono::DateTime::parse_from_rfc3339(&d.provenance.retrieved_at)
                    .is_ok_and(|time| Utc::now().signed_duration_since(time).num_hours() < 24)
            })
        {
            return Err(CommandError::validation(
                "Diese Bewertungsgrundlage wurde innerhalb der letzten 24 Stunden bereits geladen.",
            ));
        }
        let mut job = SyncJob {
            id: Uuid::new_v4().to_string(),
            series_id: format!("{}{dataset_id}", valuation_models::JOB_PREFIX),
            status: "running".into(),
            page: 0,
            pages: definition.files.len() as u32,
            observations: 0,
            message: "Die öffentlichen jährlichen Bewertungstabellen werden geladen und geprüft."
                .into(),
            started_at: Utc::now().to_rfc3339(),
            finished_at: None,
        };
        store::save_job(&db, &self.session, &job).await?;
        let cancel = Arc::new(AtomicBool::new(false));
        *self.valuation_job.lock().await = Some((job.id.clone(), Arc::clone(&cancel)));
        let initial = job.clone();
        let service = Arc::clone(self);
        tauri::async_runtime::spawn(async move {
            let _permit = permit;
            let outcome = async {
                match valuation_source::download(
                    &definition,
                    &db,
                    &service.session,
                    &mut job,
                    Arc::clone(&cancel),
                )
                .await?
                {
                    Some(data) if !cancel.load(Ordering::Relaxed) => {
                        valuation_store::replace(&db, data).await?;
                        Ok(true)
                    }
                    _ => Ok(false),
                }
            }
            .await;
            job.finished_at = Some(Utc::now().to_rfc3339());
            match outcome {
                Ok(true) => {
                    job.status = "complete".into();
                    job.message = "Die geprüften Bewertungsbilder sind lokal verfügbar.".into();
                }
                Ok(false) => {
                    job.status = "interrupted".into();
                    job.message = "Der Abruf wurde beendet. Der unvollständige neue Stand wurde verworfen; frühere lokale Werte bleiben erhalten.".into();
                }
                Err(error) => {
                    let error: CommandError = error;
                    job.status = "failed".into();
                    job.message = error.message;
                }
            }
            if store::save_job(&db, &service.session, &job).await.is_err() {
                tracing::warn!(
                    "Der Abschlussstatus des Atlas-Bewertungsabrufs konnte nicht gespeichert werden"
                );
            }
            *service.valuation_job.lock().await = None;
        });
        Ok(initial)
    }

    pub async fn cancel_valuation(&self, job_id: &str) -> CommandResult<()> {
        let live = self.valuation_job.lock().await;
        match live.as_ref() {
            Some((id, cancel)) if id == job_id => {
                cancel.store(true, Ordering::Relaxed);
                Ok(())
            }
            _ => Err(CommandError::validation(
                "Dieser Bewertungsabruf läuft nicht mehr.",
            )),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::world_atlas::AtlasState;

    #[tokio::test]
    async fn world_atlas_valuation_shares_gate_and_cancels_only_its_live_job() {
        let root = tempfile::tempdir().unwrap();
        let service = AtlasState::new(root.path().to_owned()).0;
        let guard = service.gate.clone().lock_owned().await;
        assert!(service.start_valuation("pbv-india").await.is_err());
        assert!(service.start_valuation("untrusted").await.is_err());
        drop(guard);
        let cancel = Arc::new(AtomicBool::new(false));
        *service.valuation_job.lock().await = Some(("live-job".into(), Arc::clone(&cancel)));
        assert!(service.cancel_valuation("another-job").await.is_err());
        assert!(!cancel.load(Ordering::Relaxed));
        service.cancel_valuation("live-job").await.unwrap();
        assert!(cancel.load(Ordering::Relaxed));
        *service.valuation_job.lock().await = None;
        assert!(service.cancel_valuation("live-job").await.is_err());
    }
}
