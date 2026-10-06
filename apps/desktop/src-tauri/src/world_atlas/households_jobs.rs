use super::{
    AtlasService, households_models::DATASET_ID, households_source, households_store,
    models::SyncJob, store,
};
use crate::errors::{CommandError, CommandResult};
use chrono::Utc;
use std::sync::Arc;
use uuid::Uuid;

impl AtlasService {
    pub async fn start_households(self: &Arc<Self>) -> CommandResult<SyncJob> {
        let permit = self
            .gate
            .clone()
            .try_lock_owned()
            .map_err(|_| CommandError::validation("Ein Atlas-Abruf läuft bereits."))?;
        let db = self.db().await?.clone();
        let current = households_store::read(&db, "world").await?;
        if current.provenance.as_ref().is_some_and(|p| {
            chrono::DateTime::parse_from_rfc3339(&p.retrieved_at)
                .is_ok_and(|time| Utc::now().signed_duration_since(time).num_hours() < 24)
        }) {
            return Err(CommandError::validation(
                "Die UN-Haushaltsdaten wurden innerhalb der letzten 24 Stunden bereits geladen.",
            ));
        }
        let mut job = SyncJob {
            id: Uuid::new_v4().to_string(),
            series_id: DATASET_ID.into(),
            status: "running".into(),
            page: 0,
            pages: 2,
            observations: 0,
            message: "Die historischen UN-Haushaltsdaten werden geladen und geprüft.".into(),
            started_at: Utc::now().to_rfc3339(),
            finished_at: None,
        };
        store::save_job(&db, &self.session, &job).await?;
        let initial = job.clone();
        let service = Arc::clone(self);
        crate::runtime::spawn(async move {
            let _permit = permit;
            let outcome = async {
                let data = households_source::download().await?;
                job.observations = data.provenance.numeric_cell_count;
                job.page = 1;
                job.message = "Die geprüften Haushaltsprofile werden gemeinsam gespeichert.".into();
                store::save_job(&db, &service.session, &job).await?;
                households_store::replace(&db, data).await
            }
            .await;
            job.finished_at = Some(Utc::now().to_rfc3339());
            match outcome {
                Ok(()) => {
                    job.status = "complete".into();
                    job.page = job.pages;
                    job.message = "Die UN-Haushaltsbilder sind lokal verfügbar.".into();
                }
                Err(error) => {
                    job.status = "failed".into();
                    job.message = error.message;
                }
            }
            if store::save_job(&db, &service.session, &job).await.is_err() {
                tracing::warn!(
                    "Der Abschlussstatus des UN-Haushaltsabrufs konnte nicht gespeichert werden"
                );
            }
        });
        Ok(initial)
    }
}
