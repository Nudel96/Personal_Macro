use super::*;

impl AtlasService {
    /// Explicit local original import for reviewed public archives. This is used
    /// by the maintenance example, never an automatic network fallback.
    pub async fn import_reviewed_public_original(
        self: &Arc<Self>,
        source_id: &str,
        bytes: Vec<u8>,
    ) -> CommandResult<SyncJob> {
        let source = public_models::source(source_id)?;
        let _permit = self
            .gate
            .clone()
            .try_lock_owned()
            .map_err(|_| CommandError::validation("Ein Atlas-Abruf läuft bereits."))?;
        let db = self.db().await?.clone();
        let previous_json: Option<String> =
            sqlx::query_scalar("SELECT provenance_json FROM atlas_public_datasets WHERE id=?")
                .bind(&source.id)
                .fetch_optional(&db)
                .await?;
        let previous: Option<public_models::PublicProvenance> = previous_json
            .map(|json| serde_json::from_str(&json).map_err(|_| public_models::invalid()))
            .transpose()?;
        // An explicit local rebuild may apply a reviewed mapping correction to
        // the identical original. It performs no request and keeps the original
        // retrieval date; regular downloads always retain their 24-hour gate.
        let mapping_rebuild = previous.as_ref().is_some_and(|p| {
            p.source_id == source.id
                && p.url == source.url
                && p.recipe != source.recipe
                && p.sha256 == source.expected_sha256
                && p.source_rows == source.expected_rows
                && p.numeric_values == source.expected_numeric
                && p.area_count == source.areas.len()
        });
        if !mapping_rebuild
            && previous.as_ref().is_some_and(|p| {
                chrono::DateTime::parse_from_rfc3339(&p.retrieved_at)
                    .is_ok_and(|t| Utc::now().signed_duration_since(t).num_hours() < 24)
            })
        {
            return Err(CommandError::validation(
                "Diese öffentliche Datenquelle wurde innerhalb der letzten 24 Stunden bereits geladen.",
            ));
        }
        if bytes.len() > 32 * 1024 * 1024 {
            return Err(public_models::invalid());
        }
        let checked_source = source.clone();
        let started_at = Utc::now().to_rfc3339();
        let mut data = tokio::task::spawn_blocking(move || {
            public_source::parse_download(&checked_source, &bytes)
        })
        .await
        .map_err(|_| public_models::invalid())??;
        if mapping_rebuild && let Some(p) = &previous {
            data.provenance.retrieved_at = p.retrieved_at.clone();
        }
        let observations = data.provenance.numeric_values;
        public_store::replace(&db, data).await?;
        let job = SyncJob {
            id: Uuid::new_v4().to_string(),
            series_id: format!("public:{}", source.id),
            status: "complete".into(),
            page: 1,
            pages: 1,
            observations,
            message: format!(
                "{}: geprüfte öffentliche Originaldatei lokal gespeichert.",
                source.label
            ),
            started_at,
            finished_at: Some(Utc::now().to_rfc3339()),
        };
        store::save_job(&db, &self.session, &job).await?;
        Ok(job)
    }

    pub async fn start_public_source(self: &Arc<Self>, source_id: &str) -> CommandResult<SyncJob> {
        let source = public_models::source(source_id)?;
        let permit = self
            .gate
            .clone()
            .try_lock_owned()
            .map_err(|_| CommandError::validation("Ein Atlas-Abruf läuft bereits."))?;
        let db = self.db().await?.clone();
        let retrieved: Option<String> =
            sqlx::query_scalar("SELECT retrieved_at FROM atlas_public_datasets WHERE id=?")
                .bind(&source.id)
                .fetch_optional(&db)
                .await?;
        if retrieved.as_ref().is_some_and(|t| {
            chrono::DateTime::parse_from_rfc3339(t)
                .is_ok_and(|t| Utc::now().signed_duration_since(t).num_hours() < 24)
        }) {
            return Err(CommandError::validation(
                "Diese öffentliche Datenquelle wurde innerhalb der letzten 24 Stunden bereits geladen.",
            ));
        }
        let mut job = SyncJob {
            id: Uuid::new_v4().to_string(),
            series_id: format!("public:{}", source.id),
            status: "running".into(),
            page: 0,
            pages: 1,
            observations: 0,
            message: format!(
                "{} wird geladen und gegen den geprüften Quellenstand abgeglichen.",
                source.label
            ),
            started_at: Utc::now().to_rfc3339(),
            finished_at: None,
        };
        store::save_job(&db, &self.session, &job).await?;
        let initial = job.clone();
        let service = Arc::clone(self);
        tauri::async_runtime::spawn(async move {
            let _permit = permit;
            let outcome = async {
                let data = public_source::download(&source.id).await?;
                let count = data.provenance.numeric_values;
                public_store::replace(&db, data).await?;
                Ok::<usize, CommandError>(count)
            }
            .await;
            job.finished_at = Some(Utc::now().to_rfc3339());
            match outcome {
                Ok(count) => {
                    job.status = "complete".into();
                    job.page = 1;
                    job.observations = count;
                    job.message = format!("{} ist lokal gespeichert.", source.label);
                }
                Err(error) => {
                    job.status = "failed".into();
                    job.message = error.message;
                }
            }
            if store::save_job(&db, &service.session, &job).await.is_err() {
                tracing::warn!(
                    "Der Abschlussstatus des zusätzlichen Atlasabrufs konnte nicht gespeichert werden"
                );
            }
        });
        Ok(initial)
    }
}
