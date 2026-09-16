use sqlx::SqlitePool;

use super::{catalog, demography_models::*};
use crate::errors::{CommandError, CommandResult};

fn metadata_error() -> CommandError {
    CommandError::validation("Die gespeicherten Demografiedaten sind nicht lesbar.")
}

pub async fn read(db: &SqlitePool, geography_id: &str) -> CommandResult<DemographyResponse> {
    let geography = catalog::geography(geography_id)?;
    let mut tx = db.begin().await?;
    let metadata: Option<String> =
        sqlx::query_scalar("SELECT provenance_json FROM atlas_demography_dataset WHERE id = ?")
            .bind(DATASET_ID)
            .fetch_optional(&mut *tx)
            .await?;
    let content: Option<String> = sqlx::query_scalar(
        "SELECT profile_json FROM atlas_demography_areas WHERE dataset_id = ? AND geography_id = ?",
    )
    .bind(DATASET_ID)
    .bind(geography_id)
    .fetch_optional(&mut *tx)
    .await?;
    let provenance = metadata
        .map(|value| serde_json::from_str(&value))
        .transpose()
        .map_err(|_| metadata_error())?;
    let profile = content
        .map(|value| serde_json::from_str(&value))
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
    Ok(DemographyResponse {
        geography,
        status,
        profile,
        provenance,
    })
}

pub async fn replace(db: &SqlitePool, download: DemographyDownload) -> CommandResult<()> {
    let metadata = serde_json::to_string(&download.provenance).map_err(|_| metadata_error())?;
    let mut tx = db.begin().await?;
    sqlx::query("INSERT INTO atlas_demography_dataset (id, provenance_json, retrieved_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET provenance_json=excluded.provenance_json, retrieved_at=excluded.retrieved_at")
        .bind(DATASET_ID).bind(metadata).bind(&download.provenance.retrieved_at).execute(&mut *tx).await?;
    sqlx::query("DELETE FROM atlas_demography_areas WHERE dataset_id = ?")
        .bind(DATASET_ID)
        .execute(&mut *tx)
        .await?;
    for profile in download.profiles {
        let content = serde_json::to_string(&profile).map_err(|_| metadata_error())?;
        sqlx::query("INSERT INTO atlas_demography_areas (dataset_id, geography_id, profile_json) VALUES (?, ?, ?)")
            .bind(DATASET_ID).bind(&profile.geography_id).bind(content).execute(&mut *tx).await?;
    }
    tx.commit().await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::world_atlas::{demography_source, models::SyncJob, store};

    fn fixture() -> DemographyDownload {
        DemographyDownload {
            provenance: DemographyProvenance {
                revision: "Test".into(),
                retrieved_at: "2026-09-08T00:00:00Z".into(),
                estimate_end: 2023,
                projection_start: 2024,
                pages: vec![],
                area_count: 1,
                source_row_count: 1,
            },
            profiles: vec![DemographyProfile {
                geography_id: "m49:276".into(),
                provider_id: "276".into(),
                provider_label: "Germany".into(),
                notes: vec![],
                years: vec![DemographyYear {
                    year: 2023,
                    kind: "estimate".into(),
                    ages: vec![AgePopulation {
                        age_start: 0,
                        male: Some(1.0),
                        female: None,
                        total: Some(2.0),
                    }],
                }],
            }],
        }
    }

    #[tokio::test]
    async fn world_atlas_demography_cache_is_atomic_and_survives_restart() {
        let dir = tempfile::tempdir().unwrap();
        let db = store::open(dir.path()).await.unwrap();
        assert_eq!(read(&db, "m49:276").await.unwrap().status, "not_downloaded");
        replace(&db, fixture()).await.unwrap();
        let mut bad = fixture();
        bad.provenance.revision = "Incomplete".into();
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
        db.close().await;
        let db = store::open(dir.path()).await.unwrap();
        assert_eq!(
            read(&db, "m49:276").await.unwrap().profile.unwrap().years[0].ages[0].female,
            None
        );
        assert_eq!(
            read(&db, "m49:010").await.unwrap().status,
            "unsupported_area"
        );
        assert!(read(&db, "../../journal.sqlite").await.is_err());
        db.close().await;
    }

    #[tokio::test]
    #[ignore = "Explicit official UN download, about 31 MB; isolated temporary database only"]
    async fn world_atlas_live_demography_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let db = store::open(dir.path()).await.unwrap();
        let mut job = SyncJob {
            id: uuid::Uuid::new_v4().to_string(),
            series_id: DATASET_ID.into(),
            status: "running".into(),
            page: 0,
            pages: 0,
            observations: 0,
            message: String::new(),
            started_at: chrono::Utc::now().to_rfc3339(),
            finished_at: None,
        };
        let started = std::time::Instant::now();
        let data = demography_source::download(&db, "un-live-test", &mut job)
            .await
            .unwrap();
        assert_eq!(data.provenance.area_count, 243);
        assert_eq!(data.provenance.source_row_count, 1_759_905);
        assert_eq!(data.provenance.pages.len(), 3);
        assert!(
            data.provenance
                .pages
                .iter()
                .all(|page| page.sha256.len() == 64
                    && page.url.starts_with("https://population.un.org/"))
        );
        let mut report = serde_json::json!({ "source": "UN DESA Population Division, WPP 2024 with Togo interim update", "license": "CC BY 3.0 IGO", "provenance": data.provenance, "areas": [] });
        report["areas"] = serde_json::Value::Array(data.profiles.iter().map(|profile| serde_json::json!({
            "geographyId": profile.geography_id, "providerId": profile.provider_id, "years": profile.years.len(),
            "missingCells": profile.years.iter().flat_map(|y| &y.ages).filter(|a| a.total.is_none() || a.male.is_none() || a.female.is_none()).count(),
            "firstYear": profile.years.first().unwrap().year, "lastYear": profile.years.last().unwrap().year,
        })).collect());
        replace(&db, data).await.unwrap();
        let mut snapshots = Vec::new();
        for id in [
            "m49:276",
            "m49:840",
            "m49:356",
            "m49:156",
            "m49:566",
            "m49:768",
            "provider:TWN",
            "provider:XKX",
            "world",
            "un-wpp:903",
            "un-wpp:908",
            "un-wpp:935",
            "un-wpp:5505",
            "un-wpp:909",
        ] {
            let row = read(&db, id).await.unwrap();
            assert_eq!(row.status, "available", "{id}");
            let profile = row.profile.as_ref().unwrap();
            assert_eq!(profile.years.len(), 151);
            assert!(profile.years.iter().all(|year| year.ages.len() == 21));
            assert_eq!(profile.years[73].kind, "estimate");
            assert_eq!(profile.years[74].kind, "projection");
            if id == "m49:768" {
                assert!((profile.years[0].ages[0].male.unwrap() - 122_314.0).abs() < 0.01);
            }
            println!("{id}: 151 years, 21 age groups, native UN profile verified");
            snapshots.push(serde_json::to_value(row).unwrap());
        }
        assert_eq!(
            read(&db, "m49:010").await.unwrap().status,
            "unsupported_area"
        );
        if std::env::var("ATLAS_WRITE_DEMOGRAPHY_REVIEW").as_deref() == Ok("1") {
            let desktop = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .unwrap();
            let review = desktop.join(".tmp/atlas-validation");
            std::fs::create_dir_all(&review).unwrap();
            std::fs::write(
                review.join("demography-review.json"),
                serde_json::to_vec(&snapshots).unwrap(),
            )
            .unwrap();
            let report_path =
                desktop.join("../../docs/planning/world-atlas/evidence/demography-readiness.json");
            std::fs::write(report_path, serde_json::to_vec_pretty(&report).unwrap()).unwrap();
        }
        db.close().await;
        let reopened = store::open(dir.path()).await.unwrap();
        assert_eq!(
            read(&reopened, "m49:356").await.unwrap().status,
            "available"
        );
        reopened.close().await;
        println!(
            "Complete UN download, validation, storage and offline reopen: {:?}",
            started.elapsed()
        );
    }
}
