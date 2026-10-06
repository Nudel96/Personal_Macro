use super::{
    AtlasService, commodity_models::DATASET_ID, commodity_source, commodity_store, models::SyncJob,
    store,
};
use crate::errors::{CommandError, CommandResult};
use chrono::Utc;
use std::sync::Arc;
use uuid::Uuid;

impl AtlasService {
    pub async fn start_commodities(self: &Arc<Self>) -> CommandResult<SyncJob> {
        let permit = self
            .gate
            .clone()
            .try_lock_owned()
            .map_err(|_| CommandError::validation("Ein Atlas-Abruf läuft bereits."))?;
        let db = self.db().await?.clone();
        let current = commodity_store::read(&db).await?;
        if current.provenance.as_ref().is_some_and(|p| {
            chrono::DateTime::parse_from_rfc3339(&p.retrieved_at)
                .is_ok_and(|t| Utc::now().signed_duration_since(t).num_hours() < 24)
        }) {
            return Err(CommandError::validation(
                "Die Rohstoffpreise wurden innerhalb der letzten 24 Stunden bereits geladen.",
            ));
        }
        let mut job = SyncJob {
            id: Uuid::new_v4().to_string(),
            series_id: DATASET_ID.into(),
            status: "running".into(),
            page: 0,
            pages: 2,
            observations: 0,
            message: "Die historischen Rohstoffpreise werden geladen und geprüft.".into(),
            started_at: Utc::now().to_rfc3339(),
            finished_at: None,
        };
        store::save_job(&db, &self.session, &job).await?;
        let initial = job.clone();
        let service = Arc::clone(self);
        crate::runtime::spawn(async move {
            let _permit = permit;
            let outcome = async {
                let data = commodity_source::download().await?;
                job.observations = data.provenance.numeric_cell_count;
                job.page = 1;
                job.message = "Die geprüften Rohstoffpreise werden gemeinsam gespeichert.".into();
                store::save_job(&db, &service.session, &job).await?;
                commodity_store::replace(&db, data).await
            }
            .await;
            job.finished_at = Some(Utc::now().to_rfc3339());
            match outcome {
                Ok(()) => {
                    job.status = "complete".into();
                    job.page = job.pages;
                    job.message = "Die Rohstoffbilder sind lokal verfügbar.".into();
                }
                Err(e) => {
                    job.status = "failed".into();
                    job.message = e.message;
                }
            }
            if store::save_job(&db, &service.session, &job).await.is_err() {
                tracing::warn!(
                    "Der Abschlussstatus des Rohstoffabrufs konnte nicht gespeichert werden"
                );
            }
        });
        Ok(initial)
    }
}
