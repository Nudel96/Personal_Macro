use super::{AtlasState, fiscal_models::*, fiscal_source, fiscal_store, store};
use chrono::Utc;

fn sample() -> FiscalDownload {
    let cfg = config().unwrap();
    FiscalDownload {
        profiles: vec![FiscalProfile {
            geography_id: "m49:276".into(),
            provider_code: "DEU".into(),
            provider_labels: vec!["Germany".into()],
            points: vec![],
        }],
        provenance: FiscalProvenance {
            retrieved_at: Utc::now().to_rfc3339(),
            file_modified_at: None,
            url: cfg.url,
            original_url: cfg.original_url,
            sha256: cfg.sha256,
            release: cfg.release,
            source_row_count: 1,
            numeric_cell_count: 0,
            area_count: 1,
            recipe: cfg.recipe,
        },
    }
}
#[tokio::test]
async fn world_atlas_fiscal_upgrade_atomic_rollback_offline_and_global_gate() {
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
    prior.migrations = prior.iter().take(13).cloned().collect::<Vec<_>>().into();
    prior.run(&old).await.unwrap();
    sqlx::query(
        "INSERT INTO atlas_macrohistory_dataset VALUES ('jst-macrohistory-r6','{}','2026-09-09')",
    )
    .execute(&old)
    .await
    .unwrap();
    old.close().await;
    let state = AtlasState::new(dir.path().to_owned());
    let db = state.0.db().await.unwrap();
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM atlas_macrohistory_dataset")
            .fetch_one(db)
            .await
            .unwrap(),
        1
    );
    assert_eq!(
        fiscal_store::read(db, "m49:276").await.unwrap().status,
        "not_downloaded"
    );
    fiscal_store::replace(db, sample()).await.unwrap();
    let mut bad = sample();
    bad.profiles.push(bad.profiles[0].clone());
    bad.provenance.recipe = "bad".into();
    assert!(fiscal_store::replace(db, bad).await.is_err());
    let first = serde_json::to_value(fiscal_store::read(db, "m49:276").await.unwrap()).unwrap();
    assert_ne!(first["provenance"]["recipe"], "bad");
    assert_eq!(
        fiscal_store::read(db, "world").await.unwrap().status,
        "unsupported_area"
    );
    assert!(
        state
            .0
            .start_fiscal()
            .await
            .unwrap_err()
            .message
            .contains("24 Stunden")
    );
    let guard = state.0.gate.lock().await;
    assert!(
        state
            .0
            .start_fiscal()
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
        serde_json::to_value(fiscal_store::read(&reopened, "m49:276").await.unwrap()).unwrap()
    );
    reopened.close().await;
}
#[tokio::test]
#[ignore = "Downloads the public IMF workbook from its verified OWID snapshot; run explicitly"]
async fn world_atlas_live_fiscal_roundtrip() {
    let data = fiscal_source::download().await.unwrap();
    assert_eq!(data.profiles.len(), 151);
    assert_eq!(data.provenance.source_row_count, 33846);
    assert_eq!(data.provenance.numeric_cell_count, 68406);
    let dir = tempfile::tempdir().unwrap();
    let db = store::open(dir.path()).await.unwrap();
    fiscal_store::replace(&db, data).await.unwrap();
    let mut snapshots = vec![];
    for area in config().unwrap().areas {
        snapshots.push(
            serde_json::to_value(fiscal_store::read(&db, &area.geography_id).await.unwrap())
                .unwrap(),
        );
    }
    db.close().await;
    let db = store::open(dir.path()).await.unwrap();
    for row in &snapshots {
        assert_eq!(
            *row,
            serde_json::to_value(
                fiscal_store::read(&db, row["geography"]["id"].as_str().unwrap())
                    .await
                    .unwrap()
            )
            .unwrap()
        );
    }
    db.close().await;
    if std::env::var("ATLAS_WRITE_FISCAL_REVIEW").as_deref() == Ok("1") {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../.tmp/atlas-validation/fiscal/native-review.json");
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, serde_json::to_vec(&snapshots).unwrap()).unwrap();
    }
    println!(
        "IMF: 151 profiles, 33846 rows, 68406 numeric cells and both coverage flags round-tripped offline"
    );
}
