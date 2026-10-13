//! Explicitly requested, synthetic native-DTO fixture for browser review.
use super::*;
use chrono::{Datelike, TimeZone, Weekday};

#[tokio::test]
#[ignore = "Creates explicitly labelled synthetic UI review data on D:; run manually"]
async fn create_native_review_fixture() {
    let output = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../output/playwright");
    if cfg!(windows) {
        assert!(
            output
                .to_string_lossy()
                .to_ascii_lowercase()
                .starts_with("d:")
        );
    }
    std::fs::create_dir_all(&output).unwrap();
    let dir = tempfile::tempdir_in(concat!(env!("CARGO_MANIFEST_DIR"), "/target")).unwrap();
    let state = crate::database::initialize_at(dir.path().join("review-workspace"))
        .await
        .unwrap();
    let today = Utc.with_ymd_and_hms(2026, 10, 13, 12, 0, 0).unwrap();
    let from = today - Duration::days(60);
    for (symbol, kind) in [
        ("EURUSD.FOREX", "Forex"),
        ("XAUUSD.FOREX", "Commodities"),
        ("WTI.COMMODITY", "Commodities"),
    ] {
        sqlx::query("INSERT INTO seasonality_provider_instruments(provider,provider_symbol,display_symbol,category,last_catalogued_at) VALUES('eodhd',?,?,?,?)")
            .bind(symbol).bind(symbol).bind(kind).bind(today.to_rfc3339()).execute(&state.db).await.unwrap();
    }
    sqlx::query("INSERT INTO mt5_technical_pairs(base,quote,source_symbol,inverted) VALUES('EUR','USD','EURUSD.synthetic',0)").execute(&state.db).await.unwrap();
    for day in 0..=60 {
        let stamp = from + Duration::days(day);
        let phase = if (day / 10) % 2 == 0 { 1 } else { -1 };
        if day % 10 == 0 {
            let current = format!("synthetic-{day}");
            sqlx::query("INSERT INTO eodhd_fundamental_snapshots(id,built_at,input_fingerprint,status) VALUES(?,?,?,'partial')")
                .bind(&current).bind(stamp.to_rfc3339()).bind(&current).execute(&state.db).await.unwrap();
            for (currency, sign) in [("EUR", phase), ("USD", -phase)] {
                for key in ["gdp", "manufacturing_pmi", "industrial_production"] {
                    sqlx::query("INSERT INTO eodhd_fundamental_evaluations(id,snapshot_id,currency,canonical_key,source_label,factor,direction,actual_text,forecast_text,score,evaluation_status,released_at,source_url) VALUES(?,?,?,?,?,'growth',1,?,'2',?,'scored',?,'https://eodhd.com/api/economic-events')")
                        .bind(format!("{current}-{currency}-{key}")).bind(&current).bind(currency).bind(key).bind(format!("Synthetische QA-Daten · {key}"))
                        .bind((2+sign).to_string()).bind(sign).bind(stamp.to_rfc3339()).execute(&state.db).await.unwrap();
                }
            }
        }
        capture_macro_scores_at(&state, stamp).await.unwrap();
        if day == 60 || matches!(stamp.weekday(), Weekday::Sat | Weekday::Sun) {
            continue;
        }
        for (symbol, level, amplitude) in [
            ("EURUSD.FOREX", 1.1, 0.015),
            ("XAUUSD.FOREX", 2500.0, 50.0),
            ("WTI.COMMODITY", 70.0, 4.0),
        ] {
            let open = level + amplitude * (day as f64 * 0.23).sin();
            let close = open + amplitude * 0.08 * phase as f64;
            let high = open.max(close) + amplitude * 0.1;
            let low = open.min(close) - amplitude * 0.1;
            let (open, high, low) = if symbol.ends_with("COMMODITY") {
                (close, close, close)
            } else {
                (open, high, low)
            };
            if symbol == "EURUSD.FOREX" {
                sqlx::query("INSERT INTO mt5_technical_candles(base,quote,timeframe,candle_time,open,high,low,close) VALUES('EUR','USD','D1',?,?,?,?,?)")
                    .bind(stamp.date_naive().and_hms_opt(0,0,0).unwrap().and_utc().timestamp()).bind(open).bind(high).bind(low).bind(close).execute(&state.db).await.unwrap();
            }
            sqlx::query("INSERT INTO seasonality_provider_daily_candles(provider,provider_symbol,candle_time,bid_open,bid_high,bid_low,bid_close,ask_open,ask_high,ask_low,ask_close,mid_close,fetched_at) VALUES('eodhd',?,?,?,?,?,?,?,?,?,?,?,?)")
                .bind(symbol).bind(stamp.date_naive().and_hms_opt(0,0,0).unwrap().and_utc().timestamp_millis())
                .bind(open).bind(high).bind(low).bind(close).bind(open).bind(high).bind(low).bind(close).bind(close).bind(today.to_rfc3339()).execute(&state.db).await.unwrap();
        }
    }
    let mut histories = serde_json::Map::new();
    for instrument in macro_scores::instruments() {
        let response = load_macro_score_history_at(
            &state,
            MacroScoreHistoryInput {
                instrument_id: instrument.id.clone(),
                from: from.date_naive().to_string(),
                to: today.date_naive().to_string(),
            },
            today,
        )
        .await
        .unwrap();
        assert!(
            response
                .points
                .iter()
                .all(|p| p.observed_at <= today.timestamp())
        );
        histories.insert(instrument.id, serde_json::to_value(response).unwrap());
    }
    let dashboard =
        eodhd_fundamentals::load_fundamental_dashboard_snapshot(&state, Some(today), None)
            .await
            .unwrap();
    let commodity = macro_scores::CommodityScoreDashboard {
        as_of: today.to_rfc3339(),
        model_version: macro_scores::MODEL_VERSION.into(),
        assets: macro_scores::commodity_assets(&state, &dashboard, today, false)
            .await
            .unwrap(),
    };
    let fixture = serde_json::json!({"synthetic":true,"catalog":macro_scores::instruments(),"histories":histories,"commodity":commodity,"fundamentals":dashboard});
    std::fs::write(
        output.join("score-history-fixture.json"),
        serde_json::to_vec(&fixture).unwrap(),
    )
    .unwrap();
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM trades")
            .fetch_one(&state.db)
            .await
            .unwrap(),
        0
    );
    println!(
        "Synthetic native review fixture: 89 instruments, 61 daily captures, no personal journal rows; output on D:"
    );
    state.db.close().await;
}
