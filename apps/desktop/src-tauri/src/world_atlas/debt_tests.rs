use super::{AtlasState, debt_models::*, debt_source, debt_store, store};
use chrono::Utc;
fn sample() -> DebtDownload {
    DebtDownload {
        profiles: vec![DebtProfile {
            geography_id: "m49:276".into(),
            provider_code: "DE".into(),
            provider_label: "Germany".into(),
            decimals: 1,
            points: vec![DebtPoint {
                period: "2025-Q4".into(),
                households: Some(48.9),
                corporations: None,
                ..Default::default()
            }],
        }],
        provenance: DebtProvenance {
            retrieved_at: Utc::now().to_rfc3339(),
            file_modified_at: None,
            url: SOURCE_URL.into(),
            sha256: "test".into(),
            source_row_count: 1,
            numeric_cell_count: 1,
            area_count: 1,
            recipe: config().unwrap().recipe,
        },
    }
}
#[tokio::test]
async fn world_atlas_debt_upgrade_rollback_offline_and_global_gate() {
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
    prior.migrations = prior.iter().take(15).cloned().collect::<Vec<_>>().into();
    prior.run(&old).await.unwrap();
    sqlx::query(
        "INSERT INTO atlas_households_dataset VALUES ('un-households-2026','{}','2026-09-09')",
    )
    .execute(&old)
    .await
    .unwrap();
    old.close().await;
    let state = AtlasState::new(dir.path().to_owned());
    let db = state.0.db().await.unwrap();
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM atlas_households_dataset")
            .fetch_one(db)
            .await
            .unwrap(),
        1
    );
    assert_eq!(
        debt_store::read(db, "m49:276").await.unwrap().status,
        "not_downloaded"
    );
    debt_store::replace(db, sample()).await.unwrap();
    let mut bad = sample();
    bad.profiles.push(bad.profiles[0].clone());
    bad.provenance.recipe = "bad".into();
    assert!(debt_store::replace(db, bad).await.is_err());
    let first = serde_json::to_value(debt_store::read(db, "m49:276").await.unwrap()).unwrap();
    assert_ne!(first["provenance"]["recipe"], "bad");
    assert_eq!(
        debt_store::read(db, "world").await.unwrap().status,
        "unsupported_area"
    );
    assert!(
        state
            .0
            .start_debt()
            .await
            .unwrap_err()
            .message
            .contains("24 Stunden")
    );
    let guard = state.0.gate.lock().await;
    assert!(
        state
            .0
            .start_debt()
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
        serde_json::to_value(debt_store::read(&reopened, "m49:276").await.unwrap()).unwrap()
    );
    reopened.close().await;
}
#[tokio::test]
#[ignore = "Downloads public BIS total-credit file; run explicitly"]
async fn world_atlas_live_debt_roundtrip() {
    let data = debt_source::download().await.unwrap();
    assert_eq!(data.profiles.len(), 48);
    assert!(data.provenance.numeric_cell_count >= 14_118);
    let dir = tempfile::tempdir().unwrap();
    let db = store::open(dir.path()).await.unwrap();
    debt_store::replace(&db, data).await.unwrap();
    let mut snapshots = vec![];
    for area in config().unwrap().areas {
        snapshots.push(
            serde_json::to_value(debt_store::read(&db, &area.geography_id).await.unwrap()).unwrap(),
        );
    }
    db.close().await;
    let db = store::open(dir.path()).await.unwrap();
    for row in &snapshots {
        assert_eq!(
            *row,
            serde_json::to_value(
                debt_store::read(&db, row["geography"]["id"].as_str().unwrap())
                    .await
                    .unwrap()
            )
            .unwrap()
        );
    }
    db.close().await;
    if std::env::var("ATLAS_WRITE_DEBT_REVIEW").as_deref() == Ok("1") {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../.tmp/atlas-validation/debt/native-review.json");
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, serde_json::to_vec(&snapshots).unwrap()).unwrap();
    }
    println!("BIS borrower debt: 48 profiles preserved and reopened offline");
}
