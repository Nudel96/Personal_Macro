use super::{AtlasState, findex_models::*, findex_source, findex_store, store};
use chrono::Utc;

fn sample() -> FindexDownload {
    let cfg = config().unwrap();
    FindexDownload {
        profiles: vec![FindexProfile {
            geography_id: "m49:276".into(),
            provider_code: "DEU".into(),
            provider_label: "Germany".into(),
            points: vec![],
        }],
        provenance: FindexProvenance {
            retrieved_at: Utc::now().to_rfc3339(),
            url: cfg.source_url,
            sha256: cfg.sha256,
            glossary_sha256: cfg.glossary_sha256,
            release: cfg.release,
            recipe: cfg.recipe,
            source_row_count: 1,
            selected_row_count: 1,
            numeric_cell_count: 0,
            area_count: 1,
        },
    }
}
#[tokio::test]
async fn world_atlas_findex_upgrade_rollback_offline_and_global_gate() {
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
    prior.migrations = prior.iter().take(20).cloned().collect::<Vec<_>>().into();
    prior.run(&old).await.unwrap();
    sqlx::query(
        "INSERT INTO atlas_labor_dataset VALUES ('ilo-sector-employment','{}','2026-09-09')",
    )
    .execute(&old)
    .await
    .unwrap();
    old.close().await;
    let state = AtlasState::new(dir.path().to_owned());
    let db = state.0.db().await.unwrap();
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM atlas_labor_dataset")
            .fetch_one(db)
            .await
            .unwrap(),
        1
    );
    assert_eq!(
        findex_store::read(db, "m49:276").await.unwrap().status,
        "not_downloaded"
    );
    findex_store::replace(db, sample()).await.unwrap();
    let mut bad = sample();
    bad.profiles.push(bad.profiles[0].clone());
    bad.provenance.recipe = "invalid".into();
    assert!(findex_store::replace(db, bad).await.is_err());
    let first = serde_json::to_value(findex_store::read(db, "m49:276").await.unwrap()).unwrap();
    assert_ne!(first["provenance"]["recipe"], "invalid");
    assert_eq!(
        findex_store::read(db, "m49:010").await.unwrap().status,
        "unsupported_area"
    );
    assert!(
        state
            .0
            .start_findex()
            .await
            .unwrap_err()
            .message
            .contains("24 Stunden")
    );
    let guard = state.0.gate.lock().await;
    assert!(
        state
            .0
            .start_findex()
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
        serde_json::to_value(findex_store::read(&reopened, "m49:276").await.unwrap()).unwrap()
    );
    reopened.close().await;
}
#[test]
fn world_atlas_findex_fraction_precision_and_missing_values() {
    assert_eq!(findex_source::number("NA").unwrap(), None);
    for raw in [
        "0",
        "1",
        "0.0900501207340641",
        "0.982983235670699",
        "2.789486415923e-4",
    ] {
        assert_eq!(findex_source::number(raw).unwrap(), Some(raw.to_string()));
    }
    for raw in [
        "", "-1", "1.00001", "NaN", "..", " 0.1", "1,000", "1.", ".2", "1e2", "+0.3",
    ] {
        assert!(findex_source::number(raw).is_err(), "{raw}");
    }
    assert!(findex_source::parse(&[], &config().unwrap()).is_err());
}
#[tokio::test]
#[ignore = "Uses the downloaded public Findex CSV and exports a temporary-cache readback for independent verification"]
async fn world_atlas_findex_original_file_roundtrip() {
    let root =
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../.tmp/atlas-validation/findex");
    let mut data = findex_source::parse(
        &std::fs::read(root.join("GlobalFindexDatabase2025.csv")).unwrap(),
        &config().unwrap(),
    )
    .unwrap();
    data.provenance.retrieved_at = Utc::now().to_rfc3339();
    assert_eq!(data.profiles.len(), 174);
    assert_eq!(data.provenance.numeric_cell_count, 59471);
    let dir = tempfile::tempdir().unwrap();
    let db = store::open(dir.path()).await.unwrap();
    findex_store::replace(&db, data).await.unwrap();
    let mut snapshots = vec![];
    for area in config().unwrap().areas {
        snapshots.push(
            serde_json::to_value(findex_store::read(&db, &area.geography_id).await.unwrap())
                .unwrap(),
        );
    }
    db.close().await;
    let db = store::open(dir.path()).await.unwrap();
    for row in &snapshots {
        assert_eq!(
            *row,
            serde_json::to_value(
                findex_store::read(&db, row["geography"]["id"].as_str().unwrap())
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
