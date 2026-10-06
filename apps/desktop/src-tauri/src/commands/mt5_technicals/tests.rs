use super::*;

/// Manual integration check, isolated from the personal journal. Requires an
/// open, logged-in MT5 terminal and an explicit directory for test evidence.
#[tokio::test]
#[ignore = "requires a logged-in local MT5 terminal"]
async fn live_mt5_round_trip_in_isolated_workspace() {
    let evidence = std::path::PathBuf::from(
        std::env::var("MACRO_MT5_SMOKE_ROOT").expect("explicit evidence directory required"),
    );
    assert!(evidence.is_absolute() && evidence.is_dir());
    let directory = tempfile::tempdir_in(&evidence).unwrap();
    let state = crate::database::initialize_at(directory.path().join("workspace"))
        .await
        .unwrap();
    let terminal = std::env::var("MACRO_MT5_SMOKE_TERMINAL").ok();
    configure_terminal(&state, terminal).await.unwrap();
    let trades_before: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM trades")
        .fetch_one(&state.db)
        .await
        .unwrap();
    refresh(&state, true).await.unwrap();
    let (first, charts) = load(&state, Utc::now()).await.unwrap();
    assert_eq!(first.status, "complete");
    assert_eq!(charts.len(), 36);
    let available = charts
        .values()
        .filter(|chart| chart.four_hour.signal.is_some() && chart.daily.signal.is_some())
        .count();
    assert!(available > 0);
    refresh(&state, false).await.unwrap();
    let (second, _) = load(&state, Utc::now()).await.unwrap();
    assert_eq!(first.last_attempt_at, second.last_attempt_at);
    let trades_after: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM trades")
        .fetch_one(&state.db)
        .await
        .unwrap();
    assert_eq!(trades_before, trades_after);
    let mut pairs: Vec<_> = charts.into_iter().map(|((base, quote), chart)| {
        serde_json::json!({"base":base,"quote":quote,"chartTrend":chart})
    }).collect();
    pairs.sort_by_key(|pair| format!("{}{}", pair["base"], pair["quote"]));
    std::fs::write(
        evidence.join("live-trend-report.json"),
        serde_json::to_vec_pretty(
            &serde_json::json!({"refresh":first,"pairs":pairs,"pairsWithBothTimeframes":available,
            "journalUnchanged":true,"dailyDeduplicationVerified":true}),
        )
        .unwrap(),
    )
    .unwrap();
    println!(
        "MT5 live check: {available}/36 pairs with both trends; journal unchanged; daily refresh deduplicated"
    );
    state.db.close().await;
}

fn now() -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 10, 2, 7, 0, 0).unwrap()
}

fn bars(direction: f64, seconds: i64) -> Vec<MarketBar> {
    (0..120)
        .map(|i| {
            let center = 100.0 + direction * i as f64 * 0.35;
            MarketBar {
                time: now().timestamp() - (121 - i) * seconds,
                open: center - direction * 0.08,
                high: center + 0.3,
                low: center - 0.3,
                close: center + direction * 0.08,
            }
        })
        .collect()
}

fn snapshot() -> MarketSnapshot {
    let mut pairs = Vec::new();
    for (index, base) in FOREX_PRIORITY.iter().enumerate() {
        for quote in FOREX_PRIORITY.iter().skip(index + 1) {
            let available = *base == "EUR" && *quote == "USD";
            pairs.push(MarketPair {
                base: base.to_string(),
                quote: quote.to_string(),
                inverted: false,
                source_symbol: available.then(|| "EURUSD.a".into()),
                four_hour: if available { bars(1.0, 14_400) } else { vec![] },
                daily: if available { bars(1.0, 86_400) } else { vec![] },
                four_hour_reason: (!available).then(|| "mt5_symbol_unavailable".into()),
                daily_reason: (!available).then(|| "mt5_symbol_unavailable".into()),
            });
        }
    }
    MarketSnapshot {
        source_label: "Broker-Test".into(),
        observed_at: now().timestamp(),
        pairs,
    }
}

async fn state() -> (tempfile::TempDir, AppState) {
    let dir = tempfile::tempdir().unwrap();
    let state = crate::database::initialize_at(dir.path().join("workspace"))
        .await
        .unwrap();
    (dir, state)
}

#[test]
fn rejects_future_duplicate_invalid_and_incomplete_snapshots() {
    let validate = |s: &MarketSnapshot| validate_snapshot(s, now().timestamp(), now().timestamp());
    assert!(validate(&snapshot()).is_ok());
    let mut missing = snapshot();
    missing.pairs.pop();
    assert!(validate(&missing).is_err());
    let mut future = snapshot();
    future
        .pairs
        .iter_mut()
        .find(|p| p.source_symbol.is_some())
        .unwrap()
        .four_hour
        .last_mut()
        .unwrap()
        .time = now().timestamp();
    assert!(validate(&future).is_err());
    let mut duplicate = snapshot();
    let bars = &mut duplicate
        .pairs
        .iter_mut()
        .find(|p| p.source_symbol.is_some())
        .unwrap()
        .daily;
    bars[1].time = bars[0].time;
    assert!(validate(&duplicate).is_err());
    let mut invalid = snapshot();
    invalid
        .pairs
        .iter_mut()
        .find(|p| p.source_symbol.is_some())
        .unwrap()
        .daily[0]
        .high = f64::NAN;
    assert!(validate(&invalid).is_err());
    let mut unknown = snapshot();
    unknown.pairs[0].four_hour_reason = Some("untrusted provider message".into());
    assert!(validate(&unknown).is_err());
}

#[test]
fn daily_schedule_uses_berlin_calendar_including_dst() {
    assert_eq!(
        next_day(now()),
        Utc.with_ymd_and_hms(2026, 10, 2, 22, 0, 0)
            .unwrap()
            .timestamp()
    );
    let spring = Utc.with_ymd_and_hms(2026, 3, 28, 23, 0, 0).unwrap();
    assert_eq!(next_day(spring) - spring.timestamp(), 23 * 3600);
    let autumn = Utc.with_ymd_and_hms(2026, 10, 24, 22, 0, 0).unwrap();
    assert_eq!(next_day(autumn) - autumn.timestamp(), 25 * 3600);
}

#[tokio::test]
async fn persists_broker_candles_and_keeps_missing_pairs_unavailable() {
    let (_dir, state) = state().await;
    let token = claim(&state, now().timestamp(), false)
        .await
        .unwrap()
        .unwrap();
    store_snapshot(&state, &token, &snapshot(), now(), now())
        .await
        .unwrap();
    let (refresh, mut charts) = load(&state, now()).await.unwrap();
    assert_eq!(refresh.status, "complete");
    assert_eq!(charts.len(), 36);
    let chart = charts.remove(&("EUR".into(), "USD".into())).unwrap();
    assert_eq!(chart.signal, Some(1));
    assert_eq!(chart.daily.bars, 120);
    let source = chart.source.unwrap();
    assert_eq!(source.provider, "mt5");
    assert_eq!(source.symbol.as_deref(), Some("EURUSD.a"));
    assert_eq!(charts[&("EUR".into(), "CNY".into())].signal, None);
    assert_eq!(
        charts[&("EUR".into(), "CNY".into())].daily.reason_codes,
        vec!["mt5_symbol_unavailable"]
    );
    let eodhd: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM eodhd_intraday_candles")
        .fetch_one(&state.db)
        .await
        .unwrap();
    assert_eq!(eodhd, 0);
    assert!(
        claim(&state, now().timestamp() + 3600, false)
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        claim(&state, next_day(now()), false)
            .await
            .unwrap()
            .is_some()
    );
    state.db.close().await;
}

#[tokio::test]
async fn leases_serialize_workers_and_recover_an_interrupted_start() {
    let (_dir, state) = state().await;
    let first = claim(&state, now().timestamp(), false)
        .await
        .unwrap()
        .unwrap();
    assert!(
        claim(&state, now().timestamp() + 1, true)
            .await
            .unwrap()
            .is_none()
    );
    let later = now() + Duration::seconds(LEASE_SECONDS + 1);
    let (status, _) = load(&state, later).await.unwrap();
    assert_eq!(status.status, "failed");
    let second = claim(&state, later.timestamp(), false)
        .await
        .unwrap()
        .unwrap();
    assert_ne!(first, second);
    assert!(
        store_snapshot(&state, &first, &snapshot(), now(), later)
            .await
            .is_err()
    );
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM mt5_technical_pairs")
        .fetch_one(&state.db)
        .await
        .unwrap();
    assert_eq!(count, 0);
    state.db.close().await;
}

#[tokio::test]
async fn invalid_publication_preserves_last_good_snapshot() {
    let (_dir, state) = state().await;
    let token = claim(&state, now().timestamp(), true)
        .await
        .unwrap()
        .unwrap();
    store_snapshot(&state, &token, &snapshot(), now(), now())
        .await
        .unwrap();
    let token = claim(&state, now().timestamp(), true)
        .await
        .unwrap()
        .unwrap();
    let mut invalid = snapshot();
    invalid.pairs.clear();
    assert!(
        store_snapshot(&state, &token, &invalid, now(), now())
            .await
            .is_err()
    );
    let (_, charts) = load(&state, now()).await.unwrap();
    assert_eq!(charts[&("EUR".into(), "USD".into())].signal, Some(1));
    state.db.close().await;
}

#[tokio::test]
async fn inversion_partial_frames_and_daily_freshness_are_explicit() {
    let (_dir, state) = state().await;
    let mut data = snapshot();
    let pair = data
        .pairs
        .iter_mut()
        .find(|p| p.source_symbol.is_some())
        .unwrap();
    pair.inverted = true;
    pair.source_symbol = Some("USDEUR".into());
    let token = claim(&state, now().timestamp(), true)
        .await
        .unwrap()
        .unwrap();
    store_snapshot(&state, &token, &data, now(), now())
        .await
        .unwrap();
    let key = ("EUR".into(), "USD".into());
    let (_, charts) = load(&state, now() + Duration::hours(20)).await.unwrap();
    assert_eq!(charts[&key].signal, Some(-1));
    let (_, stale) = load(&state, now() + Duration::days(7)).await.unwrap();
    assert_eq!(stale[&key].signal, None);
    assert_eq!(
        stale[&key].four_hour.reason_codes,
        vec!["stale_completed_candles"]
    );
    let pair = data
        .pairs
        .iter_mut()
        .find(|p| p.source_symbol.is_some())
        .unwrap();
    pair.four_hour.clear();
    pair.four_hour_reason = Some("mt5_history_unavailable".into());
    let token = claim(&state, now().timestamp(), true)
        .await
        .unwrap()
        .unwrap();
    store_snapshot(&state, &token, &data, now(), now())
        .await
        .unwrap();
    let (_, charts) = load(&state, now()).await.unwrap();
    assert_eq!(charts[&key].signal, None);
    assert_eq!(charts[&key].daily.signal, Some(-1));
    state.db.close().await;
}

#[tokio::test]
async fn upgrades_previous_schema_without_rewriting_existing_data() {
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    let mut previous = sqlx::migrate!("./migrations");
    previous.migrations = std::borrow::Cow::Owned(
        previous
            .iter()
            .filter(|m| m.version < 52)
            .cloned()
            .collect(),
    );
    previous.run(&pool).await.unwrap();
    sqlx::query("INSERT INTO app_settings(key,value_json,updated_at) VALUES('mt5-upgrade-test','{\"keep\":true}','2026-10-01T00:00:00Z')").execute(&pool).await.unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();
    let value: String =
        sqlx::query_scalar("SELECT value_json FROM app_settings WHERE key='mt5-upgrade-test'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(value, "{\"keep\":true}");
    let status: String = sqlx::query_scalar("SELECT status FROM mt5_technical_refresh")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(status, "pending");
    pool.close().await;
}

#[tokio::test]
async fn terminal_configuration_validates_paths_and_cannot_race_a_worker() {
    let (dir, state) = state().await;
    assert_eq!(
        configure_terminal(&state, Some("relative/terminal64.exe".into()))
            .await
            .unwrap_err()
            .code,
        "MT5_TERMINAL_PATH_INVALID"
    );
    let path = dir.path().join("terminal64.exe");
    std::fs::write(&path, []).unwrap();
    configure_terminal(&state, Some(path.to_string_lossy().into()))
        .await
        .unwrap();
    let current = Utc::now();
    let (status, _) = load(&state, current).await.unwrap();
    assert_eq!(status.terminal_path.as_deref(), path.to_str());
    claim(&state, current.timestamp(), false)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(
        configure_terminal(&state, None).await.unwrap_err().code,
        "MT5_TECHNICAL_BUSY"
    );
    state.db.close().await;
}

#[tokio::test]
async fn interrupted_manual_refresh_recovers_even_before_next_daily_deadline() {
    let (_dir, state) = state().await;
    let first = claim(&state, now().timestamp(), false)
        .await
        .unwrap()
        .unwrap();
    store_snapshot(&state, &first, &snapshot(), now(), now())
        .await
        .unwrap();
    claim(&state, now().timestamp() + 1, true)
        .await
        .unwrap()
        .unwrap();
    assert!(
        claim(&state, now().timestamp() + LEASE_SECONDS + 2, false)
            .await
            .unwrap()
            .is_some()
    );
    state.db.close().await;
}
