use super::{AtlasState, innovation_models::*, innovation_source, innovation_store, store};
use chrono::Utc;

fn sample() -> InnovationDownload {
    let cfg = config().unwrap();
    InnovationDownload {
        profiles: vec![InnovationProfile {
            geography_id: "m49:276".into(),
            provider_code: "DE".into(),
            provider_label: "Germany".into(),
            points: vec![],
        }],
        provenance: InnovationProvenance {
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
async fn world_atlas_innovation_upgrade_atomic_rollback_offline_and_global_gate() {
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
    prior.migrations = prior.iter().take(17).cloned().collect::<Vec<_>>().into();
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
        innovation_store::read(db, "m49:276").await.unwrap().status,
        "not_downloaded"
    );
    innovation_store::replace(db, sample()).await.unwrap();
    let mut bad = sample();
    bad.profiles.push(bad.profiles[0].clone());
    bad.provenance.recipe = "bad".into();
    assert!(innovation_store::replace(db, bad).await.is_err());
    let first = serde_json::to_value(innovation_store::read(db, "m49:276").await.unwrap()).unwrap();
    assert_ne!(first["provenance"]["recipe"], "bad");
    assert_eq!(
        innovation_store::read(db, "world").await.unwrap().status,
        "unsupported_area"
    );
    assert!(
        state
            .0
            .start_innovation()
            .await
            .unwrap_err()
            .message
            .contains("24 Stunden")
    );
    let guard = state.0.gate.lock().await;
    assert!(
        state
            .0
            .start_innovation()
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
        serde_json::to_value(innovation_store::read(&reopened, "m49:276").await.unwrap()).unwrap()
    );
    reopened.close().await;
}
#[test]
fn world_atlas_innovation_missing_zero_extremes_and_unverified_files() {
    assert_eq!(innovation_source::number("").unwrap(), None);
    assert_eq!(innovation_source::number("0").unwrap(), Some(0));
    assert_eq!(
        innovation_source::number("9007199254740991").unwrap(),
        Some(9007199254740991)
    );
    for text in ["-1", "1.5", "NaN", "..", " 1", "1,000", "9007199254740992"] {
        assert!(innovation_source::number(text).is_err());
    }
    assert!(innovation_source::parse(&[], &config().unwrap()).is_err());
}
#[test]
fn world_atlas_innovation_csv_contract_and_historical_origins() {
    use sha2::{Digest, Sha256};
    let mut cfg = config().unwrap();
    cfg.areas.retain(|a| a.code == "DE" || a.code == "US");
    cfg.excluded_origins.retain(|a| a.code == "DD");
    cfg.requested_origins = ["DE", "US", "DD", "NU"].map(String::from).to_vec();
    cfg.absent_origins = vec!["NU".into()];
    cfg.metrics.retain(|m| m.field == "8");
    cfg.first_year = 2020;
    cfg.last_year = 2021;
    cfg.expected_rows = 3;
    cfg.expected_numeric_cells = 5;
    cfg.expected_current_numeric_cells = 3;
    let source = format!(
        "Intellectual property right :Patent\n\nIndicator :4a- Patent publications by technology\n\n{}\n\nOrigin,Origin (Code),Office,Field of technology,2020,2021\nGermany,DE,Total,8 - Semiconductors,0,,\nUnited States of America,US,Total,8 - Semiconductors,2,3,\nGerman Democratic Republic,DD,Total,8 - Semiconductors,7,8,\n",
        cfg.source_release
    );
    let parse = |text: &str, cfg: &mut InnovationConfig| {
        // Re-sign a synthetic fixture so validation reaches the CSV contract.
        cfg.bytes = text.len();
        cfg.sha256 = Sha256::digest(text.as_bytes())
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect();
        innovation_source::parse(text.as_bytes(), cfg)
    };
    let data = parse(&source, &mut cfg).unwrap();
    assert_eq!(data.profiles.len(), 2);
    let germany = data
        .profiles
        .iter()
        .find(|p| p.provider_code == "DE")
        .unwrap();
    assert_eq!(germany.points[0].values["8"], Some(0));
    assert_eq!(germany.points[1].values["8"], None);
    for changed in [
        source.replace("United States of America,US", "Germany,DE"),
        source.replace("Germany,DE", "Germany,XX"),
        source.replace("Germany,DE", "Wrong label,DE"),
        source.replace("8 - Semiconductors", "8 - Other technology"),
        source.replace("Origin (Code)", "Office (Code)"),
        source.replace(",0,,", ",0,NA,"),
        source.replace(",2,3,", ",2,3,unexpected"),
    ] {
        assert!(parse(&changed, &mut cfg).is_err());
    }
}
#[tokio::test]
#[ignore = "Reads the previously downloaded public WIPO export; run explicitly after the independent audit"]
async fn world_atlas_innovation_original_files_roundtrip() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../.tmp/atlas-validation/innovation");
    let bytes = std::fs::read(root.join("current-publications.csv")).unwrap();
    let mut data = innovation_source::parse(&bytes, &config().unwrap()).unwrap();
    data.provenance.retrieved_at = Utc::now().to_rfc3339();
    assert_eq!(data.profiles.len(), 199);
    assert_eq!(data.provenance.source_row_count, 5645);
    assert_eq!(data.provenance.numeric_cell_count, 108696);
    let dir = tempfile::tempdir().unwrap();
    let db = store::open(dir.path()).await.unwrap();
    innovation_store::replace(&db, data).await.unwrap();
    let mut snapshots = vec![];
    for area in config().unwrap().areas {
        snapshots.push(
            serde_json::to_value(
                innovation_store::read(&db, &area.geography_id)
                    .await
                    .unwrap(),
            )
            .unwrap(),
        );
    }
    db.close().await;
    let db = store::open(dir.path()).await.unwrap();
    for row in &snapshots {
        assert_eq!(
            *row,
            serde_json::to_value(
                innovation_store::read(&db, row["geography"]["id"].as_str().unwrap())
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
