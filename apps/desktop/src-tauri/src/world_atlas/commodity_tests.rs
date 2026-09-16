use super::{AtlasState, commodity_models::*, commodity_source, commodity_store, store};
use calamine::Data;
use chrono::Utc;

fn sample() -> CommodityDownload {
    let cfg = config().unwrap();
    CommodityDownload {
        points: vec![CommodityPoint {
            year: 2010,
            values: [
                ("copper:real".into(), Some(75350)),
                ("shrimp:real".into(), None),
            ]
            .into(),
        }],
        provenance: CommodityProvenance {
            retrieved_at: Utc::now().to_rfc3339(),
            file_modified_at: None,
            url: cfg.source_url,
            file_url: cfg.url,
            sha256: cfg.sha256,
            release: cfg.release,
            source_release: cfg.source_release,
            recipe: cfg.recipe,
            numeric_cell_count: 1,
            missing_cell_count: 1,
            metric_count: 2,
        },
    }
}
#[tokio::test]
async fn world_atlas_commodities_upgrade_atomic_rollback_offline_and_gate() {
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
    prior.migrations = prior.iter().take(19).cloned().collect::<Vec<_>>().into();
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
        commodity_store::read(db).await.unwrap().status,
        "not_downloaded"
    );
    commodity_store::replace(db, sample()).await.unwrap();
    let before = serde_json::to_value(commodity_store::read(db).await.unwrap()).unwrap();
    let mut bad = sample();
    bad.points.push(bad.points[0].clone());
    bad.provenance.recipe = "bad".into();
    assert!(commodity_store::replace(db, bad).await.is_err());
    assert_eq!(
        before,
        serde_json::to_value(commodity_store::read(db).await.unwrap()).unwrap()
    );
    assert!(
        state
            .0
            .start_commodities()
            .await
            .unwrap_err()
            .message
            .contains("24 Stunden")
    );
    let guard = state.0.gate.lock().await;
    assert!(
        state
            .0
            .start_commodities()
            .await
            .unwrap_err()
            .message
            .contains("bereits")
    );
    drop(guard);
    db.close().await;
    let reopened = store::open(dir.path()).await.unwrap();
    assert_eq!(
        before,
        serde_json::to_value(commodity_store::read(&reopened).await.unwrap()).unwrap()
    );
    reopened.close().await;
}
#[test]
fn world_atlas_commodities_decimal_missing_and_invalid_source() {
    for cell in [
        Data::Empty,
        Data::String("…".into()),
        Data::String("..".into()),
    ] {
        assert_eq!(commodity_source::hundredths(&cell).unwrap(), None);
    }
    assert_eq!(
        commodity_source::hundredths(&Data::Int(0)).unwrap(),
        Some(0)
    );
    assert_eq!(
        commodity_source::hundredths(&Data::Float(98.3)).unwrap(),
        Some(9830)
    );
    assert_eq!(
        commodity_source::hundredths(&Data::Float(0.04)).unwrap(),
        Some(4)
    );
    for cell in [
        Data::Float(-1.),
        Data::Float(f64::NAN),
        Data::Float(f64::INFINITY),
        Data::Float(0.001),
        Data::String("0".into()),
    ] {
        assert!(commodity_source::hundredths(&cell).is_err());
    }
    assert!(commodity_source::parse(&[], &config().unwrap()).is_err());
}
#[tokio::test]
#[ignore = "Reads the public Pink Sheet file after independent source verification"]
async fn world_atlas_commodities_original_file_roundtrip() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../.tmp/atlas-validation/commodities");
    let bytes = std::fs::read(root.join("annual.xlsx")).unwrap();
    let data = commodity_source::parse(&bytes, &config().unwrap()).unwrap();
    assert_eq!(data.points.len(), 66);
    assert_eq!(data.provenance.numeric_cell_count, 10310);
    assert_eq!(data.provenance.missing_cell_count, 910);
    assert_eq!(
        data.points.iter().find(|p| p.year == 2014).unwrap().values["index_oils:real"],
        Some(9830)
    );
    let dir = tempfile::tempdir().unwrap();
    let db = store::open(dir.path()).await.unwrap();
    commodity_store::replace(&db, data).await.unwrap();
    let first = serde_json::to_value(commodity_store::read(&db).await.unwrap()).unwrap();
    db.close().await;
    let db = store::open(dir.path()).await.unwrap();
    assert_eq!(
        first,
        serde_json::to_value(commodity_store::read(&db).await.unwrap()).unwrap()
    );
    db.close().await;
    std::fs::write(
        root.join("native-review.json"),
        serde_json::to_vec(&first).unwrap(),
    )
    .unwrap();
}
