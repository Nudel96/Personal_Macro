use super::*;
use chrono::TimeZone;
use sqlx::sqlite::SqlitePoolOptions;

fn now() -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 10, 13, 12, 0, 0).unwrap()
}

async fn state() -> (tempfile::TempDir, AppState) {
    let dir = tempfile::tempdir_in(concat!(env!("CARGO_MANIFEST_DIR"), "/target")).unwrap();
    let state = crate::database::initialize_at(dir.path().join("workspace"))
        .await
        .unwrap();
    (dir, state)
}

async fn snapshot(state: &AppState, id: &str, built: DateTime<Utc>, eur: i32, usd: i32) {
    sqlx::query("INSERT INTO eodhd_fundamental_snapshots(id,built_at,input_fingerprint,status) VALUES(?,?,?,'partial')")
        .bind(id).bind(built.to_rfc3339()).bind(id).execute(&state.db).await.unwrap();
    for (currency, signal) in [("EUR", eur), ("USD", usd)] {
        sqlx::query("INSERT INTO eodhd_fundamental_evaluations(id,snapshot_id,currency,canonical_key,source_label,factor,direction,actual_text,forecast_text,score,evaluation_status,released_at) VALUES(?,?,?,'gdp','GDP','growth',1,?,'2',?,'scored',?)")
            .bind(format!("{id}-{currency}")).bind(id).bind(currency).bind((2+signal).to_string()).bind(signal).bind(built.to_rfc3339()).execute(&state.db).await.unwrap();
    }
}

#[test]
fn validates_ids_dates_future_and_bounded_ranges() {
    let valid = MacroScoreHistoryInput {
        instrument_id: "forex:EUR/USD".into(),
        from: "2026-10-01".into(),
        to: "2026-10-13".into(),
    };
    assert!(bounds(&valid, now()).is_ok());
    for (id, from, to) in [
        ("anything", "2026-10-01", "2026-10-13"),
        ("forex:EUR/USD", "2026-10-14", "2026-10-01"),
        ("forex:EUR/USD", "2026-10-01", "2026-10-14"),
        ("forex:EUR/USD", "2026-2-01", "2026-10-01"),
        ("forex:EUR/USD", "2000-01-01", "2026-10-01"),
    ] {
        assert!(
            bounds(
                &MacroScoreHistoryInput {
                    instrument_id: id.into(),
                    from: from.into(),
                    to: to.into()
                },
                now()
            )
            .is_err()
        );
    }
}

#[tokio::test]
async fn empty_history_never_manufactures_zero_or_prices() {
    let (_dir, state) = state().await;
    capture_macro_scores_at(&state, now()).await.unwrap();
    let response = load_macro_score_history_at(
        &state,
        MacroScoreHistoryInput {
            instrument_id: "forex:EUR/USD".into(),
            from: "2026-10-01".into(),
            to: "2026-10-13".into(),
        },
        now(),
    )
    .await
    .unwrap();
    assert!(response.points.is_empty());
    assert!(response.candles.is_empty());
    assert!(response.price_source.is_none());
}

#[tokio::test]
async fn archive_and_capture_are_immutable_idempotent_antisymmetric_and_persistent() {
    let (dir, state) = state().await;
    let past = now() - Duration::days(2);
    snapshot(&state, "old", past, 1, -1).await;
    let archived = capture_macro_scores_at(&state, now()).await.unwrap();
    assert!(archived.inserted > 0);
    let recorded: Vec<(String, Option<i32>)> = sqlx::query_as(
        "SELECT instrument_id,score FROM macro_score_history WHERE observation_key='archive:old'",
    )
    .fetch_all(&state.db)
    .await
    .unwrap();
    let score = |id: &str| recorded.iter().find(|v| v.0 == id).unwrap().1;
    assert_eq!(score("forex:EUR/USD"), Some(2));
    assert_eq!(score("forex:USD/EUR"), Some(-2));
    assert_eq!(score("currency:JPY"), None);
    assert_eq!(score("commodity:XAU/USD"), Some(1));
    assert_eq!(
        capture_macro_scores_at(&state, now() + Duration::minutes(1))
            .await
            .unwrap()
            .inserted,
        0
    );
    let stored:Option<i32>=sqlx::query_scalar("SELECT score FROM macro_score_history WHERE instrument_id='forex:EUR/USD' AND observation_key='archive:old'").fetch_one(&state.db).await.unwrap();
    sqlx::query(
        "UPDATE eodhd_fundamental_evaluations SET score=-1,actual_text='1' WHERE currency='EUR'",
    )
    .execute(&state.db)
    .await
    .unwrap();
    capture_macro_scores_at(&state, now() + Duration::minutes(2))
        .await
        .unwrap();
    assert_eq!(stored, Some(2));
    assert!(
        sqlx::query("UPDATE macro_score_history SET score=99")
            .execute(&state.db)
            .await
            .is_err()
    );
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM macro_score_history")
        .fetch_one(&state.db)
        .await
        .unwrap();
    state.db.close().await;
    let reopened = crate::database::initialize_at(dir.path().join("workspace"))
        .await
        .unwrap();
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM macro_score_history")
            .fetch_one(&reopened.db)
            .await
            .unwrap(),
        count
    );
    assert_eq!(sqlx::query_scalar::<_,Option<i32>>("SELECT score FROM macro_score_history WHERE instrument_id='forex:EUR/USD' AND observation_key='archive:old'").fetch_one(&reopened.db).await.unwrap(),Some(2));
}

#[tokio::test]
async fn fresh_daily_observations_and_new_snapshot_are_both_retained() {
    let (_dir, state) = state().await;
    snapshot(&state, "a", now() - Duration::hours(1), 1, 1).await;
    capture_macro_scores_at(&state, now()).await.unwrap();
    let next = now() + Duration::days(1);
    capture_macro_scores_at(&state, next).await.unwrap();
    snapshot(&state, "b", next + Duration::hours(1), -1, 1).await;
    capture_macro_scores_at(&state, next + Duration::hours(2))
        .await
        .unwrap();
    let rows:Vec<(i64,Option<i32>)>=sqlx::query_as("SELECT observed_at,score FROM macro_score_history WHERE instrument_id='forex:EUR/USD' AND origin='captured' ORDER BY observed_at").fetch_all(&state.db).await.unwrap();
    assert_eq!(rows.len(), 3);
    assert_eq!(rows[0].1, Some(0));
    assert_eq!(rows[2].1, Some(-2));
}

#[tokio::test]
async fn eodhd_millisecond_dates_are_read_and_inverse_ohlc_swaps_extremes() {
    let (_dir, state) = state().await;
    sqlx::query("INSERT INTO seasonality_provider_instruments(provider,provider_symbol,display_symbol,category,last_catalogued_at) VALUES('eodhd','USDEUR.FOREX','USDEUR','Forex','2026-10-13')").execute(&state.db).await.unwrap();
    let time = (now() - Duration::days(2))
        .date_naive()
        .and_hms_opt(0, 0, 0)
        .unwrap()
        .and_utc()
        .timestamp();
    for stamp in [
        time,
        now()
            .date_naive()
            .and_hms_opt(0, 0, 0)
            .unwrap()
            .and_utc()
            .timestamp(),
    ] {
        sqlx::query("INSERT INTO seasonality_provider_daily_candles(provider,provider_symbol,candle_time,bid_open,bid_high,bid_low,bid_close,ask_open,ask_high,ask_low,ask_close,mid_close,fetched_at) VALUES('eodhd','USDEUR.FOREX',?,2,4,1,3,2,4,1,3,3,'2026-10-13')").bind(stamp*1000).execute(&state.db).await.unwrap();
    }
    let instrument = macro_scores::instruments()
        .into_iter()
        .find(|v| v.id == "forex:EUR/USD")
        .unwrap();
    let (candles, source) = daily_prices(
        &state,
        &instrument,
        time,
        time + 86400 * 3,
        now().timestamp(),
    )
    .await
    .unwrap();
    assert_eq!(candles.len(), 1);
    assert_eq!(candles[0].time, time);
    assert_eq!(candles[0].open, 0.5);
    assert_eq!(candles[0].high, 1.0);
    assert_eq!(candles[0].low, 0.25);
    assert!(source.unwrap().inverted);
}

#[tokio::test]
async fn migration_upgrades_an_existing_database_without_altering_prior_rows() {
    let dir = tempfile::tempdir_in(concat!(env!("CARGO_MANIFEST_DIR"), "/target")).unwrap();
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect(&format!(
            "sqlite:{}?mode=rwc",
            dir.path()
                .join("upgrade.sqlite")
                .to_string_lossy()
                .replace('\\', "/")
        ))
        .await
        .unwrap();
    sqlx::query(
        "CREATE TABLE user_evidence(value TEXT); INSERT INTO user_evidence VALUES('preserved');",
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::raw_sql(include_str!(
        "../../migrations/0053_macro_score_history.sql"
    ))
    .execute(&pool)
    .await
    .unwrap();
    assert_eq!(
        sqlx::query_scalar::<_, String>("SELECT value FROM user_evidence")
            .fetch_one(&pool)
            .await
            .unwrap(),
        "preserved"
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM macro_score_history")
            .fetch_one(&pool)
            .await
            .unwrap(),
        0
    );
}

#[tokio::test]
async fn mt5_source_orientation_is_combined_with_requested_pair_orientation() {
    let (_dir, state) = state().await;
    sqlx::query("INSERT INTO mt5_technical_pairs(base,quote,source_symbol,inverted) VALUES('EUR','USD','USDEUR.test',1)").execute(&state.db).await.unwrap();
    let time = now().timestamp() - 2 * 86400;
    sqlx::query("INSERT INTO mt5_technical_candles(base,quote,timeframe,candle_time,open,high,low,close) VALUES('EUR','USD','D1',?,2,4,1,3)").bind(time).execute(&state.db).await.unwrap();
    for (id, expected_open, expected_inverted) in
        [("forex:EUR/USD", 0.5, true), ("forex:USD/EUR", 2.0, false)]
    {
        let instrument = macro_scores::instruments()
            .into_iter()
            .find(|v| v.id == id)
            .unwrap();
        let (candles, source) =
            daily_prices(&state, &instrument, time, time + 86400, now().timestamp())
                .await
                .unwrap();
        assert_eq!(candles.len(), 1);
        assert_eq!(candles[0].open, expected_open);
        assert_eq!(source.unwrap().inverted, expected_inverted);
    }
}

#[tokio::test]
async fn score_roundtrips_are_retained_concurrent_captures_deduplicate_and_old_tasks_cannot_append()
{
    let (_dir, state) = state().await;
    snapshot(&state, "a", now() - Duration::hours(1), 1, -1).await;
    capture_macro_scores_at(&state, now()).await.unwrap();
    sqlx::query(
        "UPDATE eodhd_fundamental_evaluations SET score=-1,actual_text='1' WHERE currency='EUR'",
    )
    .execute(&state.db)
    .await
    .unwrap();
    let later = now() + Duration::minutes(1);
    let (first, second) = tokio::join!(
        capture_macro_scores_at(&state, later),
        capture_macro_scores_at(&state, later + Duration::milliseconds(1))
    );
    assert!(first.is_ok() && second.is_ok());
    sqlx::query(
        "UPDATE eodhd_fundamental_evaluations SET score=1,actual_text='3' WHERE currency='EUR'",
    )
    .execute(&state.db)
    .await
    .unwrap();
    capture_macro_scores_at(&state, now() + Duration::minutes(2))
        .await
        .unwrap();
    let rows:Vec<Option<i32>>=sqlx::query_scalar("SELECT score FROM macro_score_history WHERE instrument_id='forex:EUR/USD' AND origin='captured' ORDER BY observed_at,observation_key").fetch_all(&state.db).await.unwrap();
    assert_eq!(rows, vec![Some(2), Some(0), Some(2)]);
    sqlx::query(
        "UPDATE eodhd_fundamental_evaluations SET score=-1,actual_text='1' WHERE currency='EUR'",
    )
    .execute(&state.db)
    .await
    .unwrap();
    assert_eq!(
        capture_macro_scores_at(&state, now() + Duration::seconds(30))
            .await
            .unwrap()
            .inserted,
        0
    );
}
