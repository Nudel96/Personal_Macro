use super::{AtlasState, health_models::*, health_source, health_store, store};
use chrono::Utc;

fn sample() -> HealthDownload {
    let cfg = config().unwrap();
    HealthDownload {
        profiles: vec![HealthProfile {
            geography_id: "m49:276".into(),
            provider_code: "DEU".into(),
            provider_label: "Germany".into(),
            points: vec![],
            metadata: vec![],
            notes: HealthNotes::default(),
        }],
        provenance: HealthProvenance {
            retrieved_at: Utc::now().to_rfc3339(),
            url: cfg.source_url,
            sha256: cfg.files[0].sha256.clone(),
            notes_sha256: cfg.files[1].sha256.clone(),
            release: cfg.release,
            recipe: cfg.recipe,
            source_row_count: 1,
            numeric_cell_count: 0,
            metadata_row_count: 0,
            area_count: 1,
        },
    }
}
#[tokio::test]
async fn world_atlas_health_upgrade_atomic_rollback_offline_and_global_gate() {
    let dir = tempfile::tempdir().unwrap();
    let old = sqlx::sqlite::SqlitePoolOptions::new()
        .connect_with(
            sqlx::sqlite::SqliteConnectOptions::new()
                .filename(dir.path().join("cache.sqlite"))
                .create_if_missing(true),
        )
        .await
        .unwrap();
    let mut prior = sqlx::migrate!("./atlas-migrations");
    prior.migrations = prior.iter().take(16).cloned().collect::<Vec<_>>().into();
    prior.run(&old).await.unwrap();
    sqlx::query("INSERT INTO atlas_debt_dataset VALUES ('bis-borrower-debt','{}','2026-09-09')")
        .execute(&old)
        .await
        .unwrap();
    old.close().await;
    let state = AtlasState::new(dir.path().to_owned());
    let db = state.0.db().await.unwrap();
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM atlas_debt_dataset")
            .fetch_one(db)
            .await
            .unwrap(),
        1
    );
    assert_eq!(
        health_store::read(db, "m49:276").await.unwrap().status,
        "not_downloaded"
    );
    health_store::replace(db, sample()).await.unwrap();
    let mut bad = sample();
    bad.profiles.push(bad.profiles[0].clone());
    bad.provenance.recipe = "bad".into();
    assert!(health_store::replace(db, bad).await.is_err());
    let first = serde_json::to_value(health_store::read(db, "m49:276").await.unwrap()).unwrap();
    assert_ne!(first["provenance"]["recipe"], "bad");
    assert_eq!(
        health_store::read(db, "world").await.unwrap().status,
        "unsupported_area"
    );
    assert!(
        state
            .0
            .start_health()
            .await
            .unwrap_err()
            .message
            .contains("24 Stunden")
    );
    let guard = state.0.gate.lock().await;
    assert!(
        state
            .0
            .start_health()
            .await
            .unwrap_err()
            .message
            .contains("bereits")
    );
    drop(guard);
    db.close().await;
    let reopened = store::open(dir.path()).await.unwrap();
    assert_eq!(
        first,
        serde_json::to_value(health_store::read(&reopened, "m49:276").await.unwrap()).unwrap()
    );
    reopened.close().await;
}
#[test]
fn world_atlas_health_missing_zero_extremes_and_unverified_files() {
    use calamine::Data;
    assert_eq!(health_source::number(&Data::Empty).unwrap(), None);
    assert_eq!(health_source::number(&Data::Float(0.)).unwrap(), Some(0.));
    assert_eq!(
        health_source::number(&Data::Float(100.26454926)).unwrap(),
        Some(100.26454926)
    );
    assert!(health_source::number(&Data::Float(f64::NAN)).is_err());
    assert!(health_source::number(&Data::String("..".into())).is_err());
    assert!(health_source::parse(&[vec![], vec![]], &config().unwrap()).is_err());
}
#[tokio::test]
#[ignore = "Reads previously downloaded public WHO workbooks; run explicitly after the independent audit"]
async fn world_atlas_health_original_files_roundtrip() {
    let root =
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../.tmp/atlas-validation/ghed");
    let files = vec![
        std::fs::read(root.join("data.xlsx")).unwrap(),
        std::fs::read(root.join("country-notes.xlsx")).unwrap(),
    ];
    let mut data = health_source::parse(&files, &config().unwrap()).unwrap();
    data.provenance.retrieved_at = Utc::now().to_rfc3339();
    assert_eq!(data.profiles.len(), 195);
    assert_eq!(data.provenance.source_row_count, 4612);
    assert_eq!(data.provenance.numeric_cell_count, 81762);
    let dir = tempfile::tempdir().unwrap();
    let db = store::open(dir.path()).await.unwrap();
    health_store::replace(&db, data).await.unwrap();
    let mut snapshots = vec![];
    for area in config().unwrap().areas {
        snapshots.push(
            serde_json::to_value(health_store::read(&db, &area.geography_id).await.unwrap())
                .unwrap(),
        );
    }
    db.close().await;
    let db = store::open(dir.path()).await.unwrap();
    for row in &snapshots {
        assert_eq!(
            *row,
            serde_json::to_value(
                health_store::read(&db, row["geography"]["id"].as_str().unwrap())
                    .await
                    .unwrap()
            )
            .unwrap()
        );
    }
    db.close().await;
    std::fs::write(
        root.join("native-review.json"),
        serde_json::to_vec(&snapshots).unwrap(),
    )
    .unwrap();
}
