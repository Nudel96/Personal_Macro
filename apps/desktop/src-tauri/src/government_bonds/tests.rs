use super::{GovernmentBondsState, models::*, provider::*, store};
use chrono::NaiveDate;
use serde_json::json;

fn date(value: &str) -> NaiveDate {
    NaiveDate::parse_from_str(value, "%Y-%m-%d").unwrap()
}
fn observation(day: &str, value: Option<&str>) -> Observation {
    Observation {
        date: day.into(),
        yield_pct: value.map(str::to_owned),
    }
}
fn source_catalog() -> Vec<serde_json::Value> {
    catalog().instruments.iter().map(|i| json!({
        "Code": i.symbol.trim_end_matches(".GBOND"), "Name": i.name,
        "Country": i.provider_country.clone().unwrap_or_default(), "Currency": i.currency.clone().unwrap_or_default(),
        "Exchange": "GBOND", "Type": "BOND",
    })).collect()
}

#[test]
fn world_directory_and_provider_identities_are_explicit() {
    let c = catalog();
    assert_eq!(c.countries.len(), 250);
    assert_eq!(c.instruments.len(), 266);
    assert_eq!(
        c.instruments
            .iter()
            .map(|i| &i.country_id)
            .collect::<std::collections::HashSet<_>>()
            .len(),
        60
    );
    let find = |s: &str| c.instruments.iter().find(|i| i.symbol == s).unwrap();
    assert_eq!(find("CH10Y.GBOND").country_id, "CHL");
    assert_eq!(find("SW10Y.GBOND").country_id, "CHE");
    assert_eq!(find("UK10Y.GBOND").country_id, "GBR");
    assert_eq!(find("CN30Y.GBOND").currency, None);
    assert_eq!(find("HR10Y.GBOND").currency.as_deref(), Some("HRK"));
    assert!(!c.instruments.iter().any(|i| i.symbol == "USDSB3L1Y.GBOND"));
    for i in &c.instruments {
        assert!(c.countries.iter().any(|c| c.id == i.country_id));
    }
}

#[test]
fn catalog_rejects_swaps_and_changed_identity_without_guessing() {
    let mut rows = source_catalog();
    rows.push(json!({"Code":"USDSB3L1Y","Name":"USD 1 Year Interest Rate Swap","Country":"USA","Currency":"USD","Exchange":"GBOND","Type":"BOND"}));
    let (active, excluded) = parse_catalog(&serde_json::to_vec(&rows).unwrap()).unwrap();
    assert_eq!(active.len(), 266);
    assert_eq!(excluded.len(), 1);
    let chile = rows.iter_mut().find(|r| r["Code"] == "CH10Y").unwrap();
    chile["Country"] = json!("Switzerland");
    let (active, excluded) = parse_catalog(&serde_json::to_vec(&rows).unwrap()).unwrap();
    assert!(!active.contains("CH10Y.GBOND"));
    assert!(active.contains("SW10Y.GBOND"));
    assert_eq!(excluded.len(), 2);
    rows.push(rows[0].clone());
    assert!(parse_catalog(&serde_json::to_vec(&rows).unwrap()).is_err());
    assert!(parse_catalog(b"[]").is_err());
}

#[test]
fn rates_are_decimal_percent_with_negative_zero_and_missing_values() {
    let points = parse_history(
        br#"[
      {"date":"2020-01-03","close":null},
      {"date":"2020-01-01","close":-0.5123,"adjusted_close":999,"open":100},
      {"date":"2020-01-02","close":0},
      {"date":"2020-01-04","close":"1.2345"},
      {"date":"2020-01-05","close":50}
    ]"#,
        date("2020-01-01"),
        date("2020-01-04"),
    )
    .unwrap();
    assert_eq!(
        points,
        vec![
            observation("2020-01-01", Some("-0.5123")),
            observation("2020-01-02", Some("0")),
            observation("2020-01-03", None),
            observation("2020-01-04", Some("1.2345"))
        ]
    );
    assert_eq!(
        difference_bps(Some("4.845"), Some("4.679")).as_deref(),
        Some("16.6")
    );
    assert_eq!(
        difference_bps(Some("0"), Some("-0.5123")).as_deref(),
        Some("51.23")
    );
    assert_eq!(
        difference_bps(Some("-0.5"), Some("-0.5")).as_deref(),
        Some("0")
    );
    assert_eq!(difference_bps(None, Some("0")), None);
}

#[test]
fn broken_histories_are_rejected_as_a_whole() {
    for payload in [
        r#"[{"date":"2020-01-01","close":1},{"date":"2020-01-01","close":2}]"#,
        r#"[{"date":"2020-02-31","close":1}]"#,
        r#"[{"date":"2020-01-01","close":"NaN"}]"#,
        r#"[{"date":"2020-01-01","close":null}]"#,
        r#"{"error":"not authorized"}"#,
        "[]",
    ] {
        assert!(parse_history(payload.as_bytes(), date("2020-01-01"), date("2020-12-31")).is_err());
    }
}

#[tokio::test]
async fn cache_migrates_reopens_and_rolls_back_failed_replacement() {
    let dir = tempfile::tempdir().unwrap();
    let db = store::initialize(dir.path()).await.unwrap();
    let initial = vec![
        observation("2020-01-01", Some("-0.5")),
        observation("2020-01-02", Some("0")),
    ];
    store::save_history(
        &db,
        "DE10Y.GBOND",
        date("2020-01-01"),
        date("2020-01-02"),
        &initial,
    )
    .await
    .unwrap();
    let duplicates = vec![observation("2020-01-01", Some("7")); 2];
    assert!(
        store::save_history(
            &db,
            "DE10Y.GBOND",
            date("2020-01-01"),
            date("2020-01-02"),
            &duplicates
        )
        .await
        .is_err()
    );
    assert_eq!(store::history(&db, "DE10Y.GBOND").await.unwrap(), initial);
    db.close().await;
    let reopened = store::initialize(dir.path()).await.unwrap();
    assert_eq!(
        store::history(&reopened, "DE10Y.GBOND").await.unwrap(),
        initial
    );
    store::save_failure(&reopened, "DE10Y.GBOND", "Provider nicht erreichbar")
        .await
        .unwrap();
    let quotes = store::quotes(&reopened, date("2026-09-10")).await.unwrap();
    let quote = quotes
        .iter()
        .find(|q| q.instrument.symbol == "DE10Y.GBOND")
        .unwrap();
    assert_eq!(quote.yield_pct.as_deref(), Some("0"));
    assert_eq!(quote.change_bps.as_deref(), Some("50"));
    assert!(quote.stale);
    assert!(quote.last_error.is_some());
    reopened.close().await;
}

#[tokio::test]
async fn full_history_preserves_every_observation_and_latest_null() {
    let dir = tempfile::tempdir().unwrap();
    let db = store::initialize(dir.path()).await.unwrap();
    let start = date("2010-01-01");
    let end = start + chrono::Duration::days(1_249);
    let observations: Vec<_> = (0..1_250)
        .map(|i| Observation {
            date: (start + chrono::Duration::days(i)).to_string(),
            yield_pct: (i % 3 != 1).then(|| (i - 600).to_string()),
        })
        .collect();
    store::save_history(&db, "DE10Y.GBOND", start, end, &observations)
        .await
        .unwrap();
    assert_eq!(
        store::history(&db, "DE10Y.GBOND").await.unwrap(),
        observations
    );
    let quotes = store::quotes(&db, end + chrono::Duration::days(1))
        .await
        .unwrap();
    let quote = quotes
        .iter()
        .find(|q| q.instrument.symbol == "DE10Y.GBOND")
        .unwrap();
    assert_eq!(quote.date.as_deref(), Some(end.to_string().as_str()));
    assert_eq!(quote.yield_pct, None);
    assert_eq!(quote.change_bps, None);
    assert_eq!(
        quote.previous_date.as_deref(),
        Some((end - chrono::Duration::days(1)).to_string().as_str())
    );
    db.close().await;
}

#[tokio::test]
async fn curves_and_spreads_require_same_dates_and_same_tenors() {
    let dir = tempfile::tempdir().unwrap();
    let db = store::initialize(dir.path()).await.unwrap();
    for (symbol, points) in [
        (
            "US10Y.GBOND",
            vec![
                observation("2020-01-01", Some("2")),
                observation("2020-01-02", Some("3")),
            ],
        ),
        ("US2Y.GBOND", vec![observation("2020-01-01", Some("1"))]),
        (
            "DE10Y.GBOND",
            vec![
                observation("2020-01-01", Some("-0.5")),
                observation("2020-01-03", Some("-0.4")),
            ],
        ),
    ] {
        store::save_history(&db, symbol, date("2020-01-01"), date("2020-01-03"), &points)
            .await
            .unwrap();
    }
    let single = store::detail(
        &db,
        &DetailInput {
            country_id: "USA".into(),
            comparison_id: None,
            maturity_months: 120,
        },
    )
    .await
    .unwrap();
    assert_eq!(single.curve_date.as_deref(), Some("2020-01-02"));
    assert_eq!(single.primary.curve_spread_bps, None); // no stale 2Y value borrowed from Jan 1
    assert_eq!(
        single
            .primary
            .curve
            .iter()
            .find(|p| p.maturity_months == 24)
            .unwrap()
            .yield_pct,
        None
    );
    let pair = store::detail(
        &db,
        &DetailInput {
            country_id: "USA".into(),
            comparison_id: Some("DEU".into()),
            maturity_months: 120,
        },
    )
    .await
    .unwrap();
    assert_eq!(pair.curve_date.as_deref(), Some("2020-01-01"));
    assert_eq!(pair.primary.curve_spread_bps.as_deref(), Some("100"));
    assert_eq!(pair.spread_date.as_deref(), Some("2020-01-01"));
    assert_eq!(pair.spread_bps.as_deref(), Some("250"));
    assert_eq!(pair.primary.history.len(), 2); // own non-overlapping history is retained
    let inverse = store::detail(
        &db,
        &DetailInput {
            country_id: "DEU".into(),
            comparison_id: Some("USA".into()),
            maturity_months: 120,
        },
    )
    .await
    .unwrap();
    assert_eq!(inverse.spread_bps.as_deref(), Some("-250"));
    let absent = store::detail(
        &db,
        &DetailInput {
            country_id: "AFG".into(),
            comparison_id: None,
            maturity_months: 120,
        },
    )
    .await
    .unwrap();
    assert!(absent.primary.instrument.is_none());
    assert!(absent.primary.history.is_empty());
    db.close().await;
}

#[tokio::test]
async fn refresh_replaces_only_its_range_and_preserves_explicit_gaps() {
    let dir = tempfile::tempdir().unwrap();
    let db = store::initialize(dir.path()).await.unwrap();
    store::save_history(
        &db,
        "US10Y.GBOND",
        date("2020-01-01"),
        date("2020-01-03"),
        &[
            observation("2020-01-01", Some("1")),
            observation("2020-01-02", Some("2")),
            observation("2020-01-03", Some("3")),
        ],
    )
    .await
    .unwrap();
    store::save_history(
        &db,
        "US10Y.GBOND",
        date("2020-01-02"),
        date("2020-01-04"),
        &[
            observation("2020-01-02", None),
            observation("2020-01-04", Some("4")),
        ],
    )
    .await
    .unwrap();
    assert_eq!(
        store::history(&db, "US10Y.GBOND").await.unwrap(),
        vec![
            observation("2020-01-01", Some("1")),
            observation("2020-01-02", None),
            observation("2020-01-04", Some("4")),
        ]
    );
    let q = store::quotes(&db, date("2020-01-05")).await.unwrap();
    assert_eq!(
        q.iter()
            .find(|q| q.instrument.symbol == "US10Y.GBOND")
            .unwrap()
            .change_bps,
        None
    );
    db.close().await;
}

#[tokio::test]
async fn interrupted_jobs_are_recoverable_and_cancellation_checks_identity() {
    let dir = tempfile::tempdir().unwrap();
    let state = GovernmentBondsState::new(dir.path().to_owned());
    let job = SyncJob {
        id: "old".into(),
        status: "running".into(),
        country_id: None,
        started_at: "2020-01-01T00:00:00Z".into(),
        finished_at: None,
        total: 266,
        completed: 3,
        skipped: 0,
        failed: 0,
        current_symbol: Some("US10Y.GBOND".into()),
        message: "Läuft".into(),
    };
    store::save_job(state.db().await.unwrap(), &job)
        .await
        .unwrap();
    let recovered = state.job().await.unwrap().unwrap();
    assert_eq!(recovered.status, "interrupted");
    assert_eq!(recovered.completed, 3);
    assert!(state.cancel("different-id").await.is_err());
    let guard = state.0.gate.clone().try_lock_owned().unwrap();
    store::save_job(state.db().await.unwrap(), &job)
        .await
        .unwrap();
    assert_eq!(state.job().await.unwrap().unwrap().status, "running");
    state.cancel("old").await.unwrap();
    assert!(state.0.cancelled.load(std::sync::atomic::Ordering::SeqCst));
    drop(guard);
    state.db().await.unwrap().close().await;
}

#[tokio::test]
#[ignore = "Explicit live EODHD integration check; needs the configured local key"]
async fn live_eodhd_catalog_and_yields_use_the_native_cache() {
    let key = crate::commands::eodhd_prices::api_key().expect("configured EODHD key");
    let client = client().unwrap();
    let bytes = download(&client, "exchange-symbol-list/GBOND", &key, None)
        .await
        .unwrap();
    let (active, excluded) = parse_catalog(&bytes).unwrap();
    assert!(active.contains("US10Y.GBOND"));
    assert!(excluded.iter().any(|i| i.symbol == "USDSB3L1Y.GBOND"));
    let dir = tempfile::tempdir().unwrap();
    let db = store::initialize(dir.path()).await.unwrap();
    store::save_catalog(&db, &active, &excluded).await.unwrap();
    let through = chrono::Utc::now().date_naive() - chrono::Duration::days(1);
    let from = through - chrono::Duration::days(45);
    for symbol in [
        "US10Y.GBOND",
        "US2Y.GBOND",
        "DE10Y.GBOND",
        "SW10Y.GBOND",
        "CH10Y.GBOND",
    ] {
        let bytes = download(
            &client,
            &format!("eod/{symbol}"),
            &key,
            Some((&from.to_string(), &through.to_string())),
        )
        .await
        .unwrap();
        let points = parse_history(&bytes, from, through).unwrap();
        assert!(points.len() >= 10);
        store::save_history(&db, symbol, from, through, &points)
            .await
            .unwrap();
        assert_eq!(store::history(&db, symbol).await.unwrap(), points);
    }
    let detail = store::detail(
        &db,
        &DetailInput {
            country_id: "USA".into(),
            comparison_id: Some("DEU".into()),
            maturity_months: 120,
        },
    )
    .await
    .unwrap();
    assert!(detail.curve_date.is_some());
    assert!(detail.spread_bps.is_some());
    db.close().await;
}
