use super::{AtlasState, labor_models::*, labor_source, labor_store, store};
use chrono::Utc;

fn sample() -> LaborDownload {
    let cfg = config().unwrap();
    LaborDownload {
        profiles: vec![LaborProfile {
            geography_id: "m49:276".into(),
            provider_code: "DEU".into(),
            provider_label: "Germany".into(),
            points: vec![],
        }],
        provenance: LaborProvenance {
            retrieved_at: Utc::now().to_rfc3339(),
            url: cfg.source_url,
            sha256: cfg.sha256,
            source_release: cfg.source_release,
            release: cfg.release,
            recipe: cfg.recipe,
            source_row_count: 1,
            numeric_cell_count: 0,
            source_numeric_cell_count: 0,
            area_count: 1,
        },
    }
}
#[tokio::test]
async fn world_atlas_labor_upgrade_atomic_rollback_offline_and_global_gate() {
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
    prior.migrations = prior.iter().take(18).cloned().collect::<Vec<_>>().into();
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
        labor_store::read(db, "m49:276").await.unwrap().status,
        "not_downloaded"
    );
    labor_store::replace(db, sample()).await.unwrap();
    let mut bad = sample();
    bad.profiles.push(bad.profiles[0].clone());
    bad.provenance.recipe = "bad".into();
    assert!(labor_store::replace(db, bad).await.is_err());
    let first = serde_json::to_value(labor_store::read(db, "m49:276").await.unwrap()).unwrap();
    assert_ne!(first["provenance"]["recipe"], "bad");
    assert_eq!(
        labor_store::read(db, "world").await.unwrap().status,
        "unsupported_area"
    );
    assert!(
        state
            .0
            .start_labor()
            .await
            .unwrap_err()
            .message
            .contains("24 Stunden")
    );
    let guard = state.0.gate.lock().await;
    assert!(
        state
            .0
            .start_labor()
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
        serde_json::to_value(labor_store::read(&reopened, "m49:276").await.unwrap()).unwrap()
    );
    reopened.close().await;
}
#[test]
fn world_atlas_labor_exact_decimal_people_and_missing_values() {
    assert_eq!(labor_source::number("").unwrap(), None);
    assert_eq!(labor_source::number("0").unwrap(), Some(0));
    assert_eq!(labor_source::number("737574.597").unwrap(), Some(737574597));
    assert_eq!(labor_source::number("1.25").unwrap(), Some(1250));
    for text in [
        "-1",
        "1.0001",
        "NaN",
        "..",
        " 1",
        "1,000",
        "1.",
        "1e3",
        "9007199254741",
    ] {
        assert!(labor_source::number(text).is_err(), "{text}");
    }
    assert!(labor_source::parse(&[], &config().unwrap()).is_err());
}
#[tokio::test]
#[ignore = "Reads the previously downloaded public ILO export; run explicitly after the independent audit"]
async fn world_atlas_labor_original_files_roundtrip() {
    let root =
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../.tmp/atlas-validation/labor");
    let bytes = std::fs::read(root.join("employment.csv")).unwrap();
    let mut data = labor_source::parse(&bytes, &config().unwrap()).unwrap();
    data.provenance.retrieved_at = Utc::now().to_rfc3339();
    assert_eq!(data.profiles.len(), 190);
    assert_eq!(data.provenance.source_row_count, 140625);
    assert_eq!(data.provenance.numeric_cell_count, 96765);
    let dir = tempfile::tempdir().unwrap();
    let db = store::open(dir.path()).await.unwrap();
    labor_store::replace(&db, data).await.unwrap();
    let mut snapshots = vec![];
    for area in config().unwrap().areas {
        snapshots.push(
            serde_json::to_value(labor_store::read(&db, &area.geography_id).await.unwrap())
                .unwrap(),
        );
    }
    db.close().await;
    let db = store::open(dir.path()).await.unwrap();
    for row in &snapshots {
        assert_eq!(
            *row,
            serde_json::to_value(
                labor_store::read(&db, row["geography"]["id"].as_str().unwrap())
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
