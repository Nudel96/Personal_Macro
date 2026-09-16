use super::{catalog, energy_models::*};
use crate::errors::{CommandError, CommandResult};
use sqlx::SqlitePool;

fn metadata_error() -> CommandError {
    CommandError::validation("Das gespeicherte Energieprofil ist nicht lesbar.")
}

pub async fn read(db: &SqlitePool, geography_id: &str) -> CommandResult<EnergyResponse> {
    let geography = catalog::geography(geography_id)?;
    let mut tx = db.begin().await?;
    let metadata: Option<String> =
        sqlx::query_scalar("SELECT provenance_json FROM atlas_energy_dataset WHERE id = ?")
            .bind(DATASET_ID)
            .fetch_optional(&mut *tx)
            .await?;
    let json: Option<String> = sqlx::query_scalar(
        "SELECT profile_json FROM atlas_energy_areas WHERE dataset_id = ? AND geography_id = ?",
    )
    .bind(DATASET_ID)
    .bind(geography_id)
    .fetch_optional(&mut *tx)
    .await?;
    let provenance = metadata
        .map(|v| serde_json::from_str(&v))
        .transpose()
        .map_err(|_| metadata_error())?;
    let profile = json
        .map(|v| serde_json::from_str(&v))
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
    Ok(EnergyResponse {
        geography,
        status,
        provenance,
        profile,
    })
}

pub async fn replace(db: &SqlitePool, data: EnergyDownload) -> CommandResult<()> {
    let json = serde_json::to_string(&data.provenance).map_err(|_| metadata_error())?;
    let mut tx = db.begin().await?;
    sqlx::query("INSERT INTO atlas_energy_dataset (id, provenance_json, retrieved_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET provenance_json=excluded.provenance_json, retrieved_at=excluded.retrieved_at").bind(DATASET_ID).bind(json).bind(&data.provenance.retrieved_at).execute(&mut *tx).await?;
    sqlx::query("DELETE FROM atlas_energy_areas WHERE dataset_id = ?")
        .bind(DATASET_ID)
        .execute(&mut *tx)
        .await?;
    for profile in data.profiles {
        catalog::geography(&profile.geography_id)?;
        let json = serde_json::to_string(&profile).map_err(|_| metadata_error())?;
        sqlx::query("INSERT INTO atlas_energy_areas (dataset_id, geography_id, profile_json) VALUES (?, ?, ?)").bind(DATASET_ID).bind(&profile.geography_id).bind(json).execute(&mut *tx).await?;
    }
    tx.commit().await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::super::{energy_source, models::SourcePage, store};
    use super::*;
    fn fixture() -> EnergyDownload {
        EnergyDownload {
            provenance: EnergyProvenance {
                retrieved_at: "2026-09-09T00:00:00Z".into(),
                source_updated_at: None,
                etag: None,
                source: SourcePage {
                    url: SOURCE_URL.into(),
                    sha256: "test".into(),
                },
                source_row_count: 2,
                area_count: 1,
                year_first: 2020,
                year_last: 2020,
            },
            profiles: vec![EnergyProfile {
                geography_id: "m49:276".into(),
                provider_label: "Germany".into(),
                aggregate: false,
                years: vec![EnergyYear {
                    year: 2020,
                    values: [
                        ("generation.solar".into(), Some(0.0)),
                        ("capacity.solar".into(), None),
                    ]
                    .into_iter()
                    .collect(),
                }],
            }],
        }
    }
    #[tokio::test]
    async fn world_atlas_energy_respects_shared_gate_and_recent_global_cache() {
        let temp = tempfile::tempdir().unwrap();
        let state = super::super::AtlasState::new(temp.path().to_path_buf());
        let permit = state.0.gate.clone().lock_owned().await;
        assert!(
            state
                .0
                .start_energy()
                .await
                .unwrap_err()
                .message
                .contains("läuft bereits")
        );
        drop(permit);
        let db = state.0.db().await.unwrap();
        let mut data = fixture();
        data.provenance.retrieved_at = chrono::Utc::now().to_rfc3339();
        replace(db, data).await.unwrap();
        assert!(
            state
                .0
                .start_energy()
                .await
                .unwrap_err()
                .message
                .contains("24 Stunden")
        );
        assert!(state.0.gate.try_lock().is_ok());
        db.close().await;
    }
    #[tokio::test]
    async fn world_atlas_energy_cache_upgrade_rollback_and_offline_read() {
        let temp = tempfile::tempdir().unwrap();
        let old = sqlx::sqlite::SqlitePoolOptions::new()
            .connect_with(
                sqlx::sqlite::SqliteConnectOptions::new()
                    .filename(temp.path().join("cache.sqlite"))
                    .create_if_missing(true),
            )
            .await
            .unwrap();
        let mut v4 = sqlx::migrate!("./atlas-migrations");
        v4.migrations = v4.iter().take(4).cloned().collect::<Vec<_>>().into();
        v4.run(&old).await.unwrap();
        sqlx::query(
            "INSERT INTO atlas_history_dataset VALUES ('maddison-2023-owid','{}','2026-09-08')",
        )
        .execute(&old)
        .await
        .unwrap();
        old.close().await;
        let db = store::open(temp.path()).await.unwrap();
        assert_eq!(
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM atlas_history_dataset")
                .fetch_one(&db)
                .await
                .unwrap(),
            1
        );
        assert_eq!(read(&db, "m49:276").await.unwrap().status, "not_downloaded");
        replace(&db, fixture()).await.unwrap();
        let mut bad = fixture();
        bad.provenance.etag = Some("bad".into());
        bad.profiles.push(bad.profiles[0].clone());
        assert!(replace(&db, bad).await.is_err());
        assert!(
            read(&db, "m49:276")
                .await
                .unwrap()
                .provenance
                .unwrap()
                .etag
                .is_none()
        );
        assert_eq!(
            read(&db, "provider:TWN").await.unwrap().status,
            "unsupported_area"
        );
        assert!(read(&db, "unknown").await.is_err());
        db.close().await;
        let reopened = store::open(temp.path()).await.unwrap();
        let row = read(&reopened, "m49:276").await.unwrap();
        assert_eq!(
            row.profile.unwrap().years[0].values.get("capacity.solar"),
            Some(&None)
        );
        reopened.close().await;
    }
    #[tokio::test]
    #[ignore = "Explicit public Ember download, around 49 MB; isolated temporary cache only"]
    async fn world_atlas_live_energy_roundtrip() {
        let temp = tempfile::tempdir().unwrap();
        let db = store::open(temp.path()).await.unwrap();
        let data = energy_source::download().await.unwrap();
        println!(
            "{} profiles, {} original rows, {}–{}",
            data.provenance.area_count,
            data.provenance.source_row_count,
            data.provenance.year_first,
            data.provenance.year_last
        );
        assert!(data.provenance.area_count >= 227);
        replace(&db, data).await.unwrap();
        let ids = [
            "world",
            "m49:276",
            "m49:840",
            "m49:356",
            "m49:156",
            "ember:africa",
            "ember:asia",
            "ember:europe",
            "ember:north_america",
            "ember:latin_america_caribbean",
            "ember:oceania",
            "m49:566",
            "m49:710",
            "provider:TWN",
            "provider:XKX",
        ];
        let mut review = Vec::new();
        for id in ids {
            let row = read(&db, id).await.unwrap();
            assert_eq!(row.status, "available");
            review.push(row);
        }
        db.close().await;
        let reopened = store::open(temp.path()).await.unwrap();
        assert_eq!(
            read(&reopened, "ember:africa").await.unwrap().status,
            "available"
        );
        reopened.close().await;
        if std::env::var("ATLAS_WRITE_ENERGY_REVIEW").as_deref() == Ok("1") {
            let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("../.tmp/atlas-validation/energy-review.json");
            std::fs::write(path, serde_json::to_vec(&review).unwrap()).unwrap();
        }
    }
}
