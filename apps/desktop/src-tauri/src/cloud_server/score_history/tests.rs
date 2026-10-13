use super::*;
use crate::cloud_postgres::test_support::TestDatabase;

#[tokio::test]
async fn public_close_schema_needs_no_ohlc_columns_and_excludes_unfinished_days() {
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    sqlx::query("CREATE TABLE seasonality_provider_daily_candles(provider TEXT,provider_symbol TEXT,candle_time INTEGER,mid_close REAL)").execute(&pool).await.unwrap();
    let start = 1800000000;
    for day in 0..=2 {
        sqlx::query(
            "INSERT INTO seasonality_provider_daily_candles VALUES('eodhd','XAUUSD.FOREX',?,?)",
        )
        .bind((start + day * 86400) * 1000)
        .bind(2000.0 + day as f64)
        .execute(&pool)
        .await
        .unwrap();
    }
    sqlx::query("PRAGMA query_only=ON")
        .execute(&pool)
        .await
        .unwrap();
    let rows = public_daily_closes(
        &pool,
        "XAUUSD.FOREX",
        start,
        start + 3 * 86400,
        start + 2 * 86400,
    )
    .await
    .unwrap();
    assert_eq!(rows.len(), 2);
    assert_eq!(rows[0].time, start);
    assert!(
        rows.iter()
            .all(|c| c.open == c.close && c.high == c.close && c.low == c.close)
    );
    assert!(
        public_daily_closes(
            &pool,
            "OTHER.FOREX",
            start,
            start + 3 * 86400,
            start + 2 * 86400
        )
        .await
        .unwrap()
        .is_empty()
    );
    pool.close().await;
}

#[test]
fn rejects_unbounded_or_unknown_score_arguments() {
    assert!(
        keys(
            &json!({"generation":"known","input":{}}),
            &["generation", "input"]
        )
        .is_ok()
    );
    for input in [
        json!(null),
        json!({"databasePath":"private"}),
        json!({"input":{},"extra":true}),
    ] {
        assert!(keys(&input, &["generation", "input"]).is_err());
    }
    assert!(
        native::bounds(
            &commands::MacroScoreHistoryInput {
                instrument_id: "forex:EUR/USD".into(),
                from: "2020-01-01".into(),
                to: "2026-01-01".into()
            },
            Utc::now()
        )
        .is_err()
    );
}

#[tokio::test]
#[ignore = "requires explicit isolated Neon configuration"]
async fn cloud_history_is_immutable_and_independent_of_journal_revision() {
    let database = TestDatabase::open().await;
    let mut tx = database.pool.begin().await.unwrap();
    let before: i64 = sqlx::query_scalar("SELECT revision FROM cloud_workspace WHERE id=1")
        .fetch_one(&mut *tx)
        .await
        .unwrap();
    sqlx::query("INSERT INTO cloud_score_batches(observation_key,observed_at,snapshot_id,model_version,origin,evidence_json) VALUES('test',1800000000,'snapshot','macro-fundamentals-observed-v1','cloud_captured','{}')").execute(&mut *tx).await.unwrap();
    sqlx::query("INSERT INTO cloud_score_points(instrument_id,observation_key,observed_at,valid_until,score,available_components,total_components) VALUES('forex:EUR/USD','test',1800000000,1800000100,5,2,17)").execute(&mut *tx).await.unwrap();
    let after: i64 = sqlx::query_scalar("SELECT revision FROM cloud_workspace WHERE id=1")
        .fetch_one(&mut *tx)
        .await
        .unwrap();
    assert_eq!(before, after);
    tx.commit().await.unwrap();
    for statement in [
        "UPDATE cloud_score_points SET score=9",
        "DELETE FROM cloud_score_batches",
    ] {
        let mut tx = database.pool.begin().await.unwrap();
        assert!(sqlx::query(statement).execute(&mut *tx).await.is_err());
        tx.rollback().await.unwrap();
    }
    database.close().await;
}

#[tokio::test]
#[ignore = "requires explicit isolated Neon configuration"]
async fn concurrent_cloud_captures_fence_late_tasks_and_keep_round_trips() {
    let database = TestDatabase::open().await;
    let server = CloudServer::from_pool(
        database.pool.clone(),
        database.schema.clone(),
        database.workspace_id.clone(),
        [7; 32],
    )
    .await
    .unwrap();
    let generation = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO cloud_public_generations(generation,manifest_json,published_at) VALUES($1,'{}','2026-10-13T00:00:00Z')").bind(&generation).execute(&database.pool).await.unwrap();
    sqlx::query("UPDATE cloud_public_active SET generation=$1 WHERE id=1")
        .bind(&generation)
        .execute(&database.pool)
        .await
        .unwrap();
    let make = |observed_at, score| native::PreparedScoreCapture {
        snapshot_id: "source".into(),
        observed_at,
        started_at_ms: observed_at * 1000,
        day: "2026-10-13".into(),
        fingerprint: format!("{score}"),
        observations: vec![(
            commands::AssetScore {
                instrument: macro_scores::instruments()
                    .into_iter()
                    .find(|i| i.id == "forex:EUR/USD")
                    .unwrap(),
                score: Some(score),
                available_components: 0,
                total_components: 0,
                contributions: vec![],
                scope: "test".into(),
            },
            observed_at + 129600,
        )],
    };
    let (a, b) = tokio::join!(
        server.store_cloud_scores(&generation, make(1800000000, 5)),
        server.store_cloud_scores(&generation, make(1800000000, 5))
    );
    assert_eq!(
        a.unwrap()["inserted"].as_u64().unwrap() + b.unwrap()["inserted"].as_u64().unwrap(),
        1
    );
    assert_eq!(
        server
            .store_cloud_scores(&generation, make(1800000100, -5))
            .await
            .unwrap()["inserted"],
        1
    );
    assert_eq!(
        server
            .store_cloud_scores(&generation, make(1800000001, 6))
            .await
            .unwrap()["inserted"],
        0
    );
    assert_eq!(
        server
            .store_cloud_scores(&generation, make(1800000200, 5))
            .await
            .unwrap()["inserted"],
        1
    );
    let mut newer = make(1800000201, -6);
    newer.started_at_ms = 1800000200950;
    assert_eq!(
        server.store_cloud_scores(&generation, newer).await.unwrap()["inserted"],
        1
    );
    let mut late = make(1800000201, 8);
    late.started_at_ms = 1800000200900;
    assert_eq!(
        server.store_cloud_scores(&generation, late).await.unwrap()["inserted"],
        0
    );
    assert!(
        server
            .store_cloud_scores(&Uuid::new_v4().to_string(), make(1800000300, 9))
            .await
            .is_err()
    );
    let scores: Vec<Option<i32>> =
        sqlx::query_scalar("SELECT score FROM cloud_score_points ORDER BY observed_at")
            .fetch_all(&database.pool)
            .await
            .unwrap();
    assert_eq!(scores, vec![Some(5), Some(-5), Some(5), Some(-6)]);
    let revision: i64 = sqlx::query_scalar("SELECT revision FROM cloud_workspace WHERE id=1")
        .fetch_one(&database.pool)
        .await
        .unwrap();
    assert_eq!(revision, 0);
    drop(server);
    database.close().await;
}
