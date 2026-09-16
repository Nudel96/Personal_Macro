use super::{catalog, history_models::*};
use crate::errors::{CommandError, CommandResult};
use sqlx::SqlitePool;

fn metadata_error() -> CommandError {
    CommandError::validation("Die gespeicherte Jahrhundertperspektive ist nicht lesbar.")
}

pub async fn read(db: &SqlitePool, geography_id: &str) -> CommandResult<HistoryResponse> {
    let geography = catalog::geography(geography_id)?;
    let mut tx = db.begin().await?;
    let metadata: Option<String> =
        sqlx::query_scalar("SELECT provenance_json FROM atlas_history_dataset WHERE id = ?")
            .bind(DATASET_ID)
            .fetch_optional(&mut *tx)
            .await?;
    let content: Option<String> = sqlx::query_scalar(
        "SELECT profile_json FROM atlas_history_areas WHERE dataset_id = ? AND geography_id = ?",
    )
    .bind(DATASET_ID)
    .bind(geography_id)
    .fetch_optional(&mut *tx)
    .await?;
    let provenance = metadata
        .map(|s| serde_json::from_str(&s))
        .transpose()
        .map_err(|_| metadata_error())?;
    let profile = content
        .map(|s| serde_json::from_str(&s))
        .transpose()
        .map_err(|_| metadata_error())?;
    let status = if provenance.is_none() {
        "not_downloaded"
    } else if profile.is_none() {
        "unsupported_area"
    } else {
        "available"
    }
    .into();
    tx.commit().await?;
    Ok(HistoryResponse {
        geography,
        status,
        provenance,
        profile,
    })
}

pub async fn replace(db: &SqlitePool, download: HistoryDownload) -> CommandResult<()> {
    let metadata = serde_json::to_string(&download.provenance).map_err(|_| metadata_error())?;
    let mut tx = db.begin().await?;
    sqlx::query("INSERT INTO atlas_history_dataset (id, provenance_json, retrieved_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET provenance_json=excluded.provenance_json, retrieved_at=excluded.retrieved_at")
        .bind(DATASET_ID).bind(metadata).bind(&download.provenance.retrieved_at).execute(&mut *tx).await?;
    sqlx::query("DELETE FROM atlas_history_areas WHERE dataset_id = ?")
        .bind(DATASET_ID)
        .execute(&mut *tx)
        .await?;
    for profile in download.profiles {
        let json = serde_json::to_string(&profile).map_err(|_| metadata_error())?;
        sqlx::query("INSERT INTO atlas_history_areas (dataset_id, geography_id, profile_json) VALUES (?, ?, ?)")
            .bind(DATASET_ID).bind(&profile.geography_id).bind(json).execute(&mut *tx).await?;
    }
    tx.commit().await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::world_atlas::{history_source, models::SyncJob, store};
    fn fixture() -> HistoryDownload {
        HistoryDownload {
            provenance: HistoryProvenance {
                revision: "Test".into(),
                retrieved_at: "2026-09-08T00:00:00Z".into(),
                pages: vec![],
                area_count: 1,
                source_row_count: 1,
                excluded_areas: vec![],
            },
            profiles: vec![HistoryProfile {
                geography_id: "m49:276".into(),
                provider_label: "Germany".into(),
                notes: vec![],
                points: vec![HistoryPoint {
                    year: 1820,
                    gdp_per_capita: Some(1000.0),
                    gdp: None,
                    world_gdp_share: None,
                }],
            }],
        }
    }
    #[tokio::test]
    async fn world_atlas_history_cache_upgrade_rollback_and_offline_restart() {
        let dir = tempfile::tempdir().unwrap();
        let old = sqlx::sqlite::SqlitePoolOptions::new()
            .connect_with(
                sqlx::sqlite::SqliteConnectOptions::new()
                    .filename(dir.path().join("cache.sqlite"))
                    .create_if_missing(true),
            )
            .await
            .unwrap();
        let mut v3 = sqlx::migrate!("./atlas-migrations");
        v3.migrations = v3.iter().take(3).cloned().collect::<Vec<_>>().into();
        v3.run(&old).await.unwrap();
        sqlx::query("INSERT INTO atlas_demography_dataset (id, provenance_json, retrieved_at) VALUES ('un-wpp-2024-age5', '{}', '2026-01-01')").execute(&old).await.unwrap();
        sqlx::query("INSERT INTO atlas_demography_areas (dataset_id, geography_id, profile_json) VALUES ('un-wpp-2024-age5', 'upgrade-sentinel', '{}')").execute(&old).await.unwrap();
        old.close().await;
        let db = store::open(dir.path()).await.unwrap();
        assert_eq!(sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM atlas_demography_areas WHERE geography_id = 'upgrade-sentinel'").fetch_one(&db).await.unwrap(), 1);
        assert_eq!(read(&db, "m49:276").await.unwrap().status, "not_downloaded");
        replace(&db, fixture()).await.unwrap();
        let mut bad = fixture();
        bad.provenance.revision = "Broken".into();
        bad.profiles.push(bad.profiles[0].clone());
        assert!(replace(&db, bad).await.is_err());
        assert_eq!(
            read(&db, "m49:276")
                .await
                .unwrap()
                .provenance
                .unwrap()
                .revision,
            "Test"
        );
        assert!(read(&db, "../../journal.sqlite").await.is_err());
        assert_eq!(
            read(&db, "m49:010").await.unwrap().status,
            "unsupported_area"
        );
        db.close().await;
        let db = store::open(dir.path()).await.unwrap();
        let row = read(&db, "m49:276").await.unwrap();
        assert_eq!(row.profile.unwrap().points[0].gdp, None);
        db.close().await;
    }

    #[tokio::test]
    #[ignore = "Explicit public OWID/Maddison download; isolated temporary database"]
    async fn world_atlas_live_history_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let db = store::open(dir.path()).await.unwrap();
        let mut job = SyncJob {
            id: uuid::Uuid::new_v4().to_string(),
            series_id: DATASET_ID.into(),
            status: "running".into(),
            page: 0,
            pages: 3,
            observations: 0,
            message: String::new(),
            started_at: chrono::Utc::now().to_rfc3339(),
            finished_at: None,
        };
        let data = history_source::download(&db, "history-test", &mut job)
            .await
            .unwrap();
        assert_eq!(data.provenance.area_count, 174);
        assert_eq!(data.provenance.excluded_areas.len(), 4);
        let evidence = serde_json::json!({ "provenance": data.provenance, "areas": data.profiles.iter().map(|p| serde_json::json!({ "id": p.geography_id, "firstYear": p.points[0].year, "lastYear": p.points.last().unwrap().year, "gdpPerCapitaYears": p.points.iter().filter(|p| p.gdp_per_capita.is_some()).count(), "gdpYears": p.points.iter().filter(|p| p.gdp.is_some()).count(), "worldShareYears": p.points.iter().filter(|p| p.world_gdp_share.is_some()).count() })).collect::<Vec<_>>() });
        replace(&db, data).await.unwrap();
        let mut snapshots = Vec::new();
        for id in [
            "m49:276",
            "m49:840",
            "m49:356",
            "m49:156",
            "m49:566",
            "m49:710",
            "m49:826",
            "m49:528",
            "world",
            "maddison:western_europe",
            "maddison:sub_saharan_africa",
            "maddison:east_asia",
        ] {
            let row = read(&db, id).await.unwrap();
            assert_eq!(row.status, "available", "{id}");
            println!(
                "{id}: {} source years",
                row.profile.as_ref().unwrap().points.len()
            );
            snapshots.push(serde_json::to_value(row).unwrap());
        }
        if std::env::var("ATLAS_WRITE_HISTORY_REVIEW").as_deref() == Ok("1") {
            let desktop = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .unwrap();
            let path = desktop.join(".tmp/atlas-validation");
            std::fs::create_dir_all(&path).unwrap();
            std::fs::write(
                path.join("history-review.json"),
                serde_json::to_vec(&snapshots).unwrap(),
            )
            .unwrap();
            std::fs::write(
                desktop.join("../../docs/planning/world-atlas/evidence/history-readiness.json"),
                serde_json::to_vec_pretty(&evidence).unwrap(),
            )
            .unwrap();
        }
        db.close().await;
        let db = store::open(dir.path()).await.unwrap();
        assert_eq!(read(&db, "m49:356").await.unwrap().status, "available");
        db.close().await;
    }
}
