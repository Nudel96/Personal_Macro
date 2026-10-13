use super::*;
use chrono::TimeZone;

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
async fn event(
    state: &AppState,
    id: &str,
    label: &str,
    actual: Option<&str>,
    forecast: Option<&str>,
    released: DateTime<Utc>,
) {
    sqlx::query("INSERT INTO eodhd_events(id,event_identity,country,currency,provider_type,released_at,actual_value,forecast_value,frequency,source_url,first_seen_at,updated_at) VALUES(?,?,'US','USD',?,?,?,?, 'Weekly','https://eodhd.com/api/economic-events',?,?)")
        .bind(id).bind(id).bind(label).bind(released.to_rfc3339()).bind(actual).bind(forecast).bind(now().to_rfc3339()).bind(now().to_rfc3339()).execute(&state.db).await.unwrap();
}

#[tokio::test]
async fn inventory_requires_forecast_and_excludes_stale_future_unrelated_or_ambiguous_values() {
    let (_dir, state) = state().await;
    event(
        &state,
        "unrelated",
        "API Crude Oil Stock Change",
        Some("-9"),
        Some("0"),
        now(),
    )
    .await;
    event(
        &state,
        "future",
        "Crude Oil Inventories",
        Some("-9"),
        Some("0"),
        now() + Duration::hours(1),
    )
    .await;
    event(
        &state,
        "old",
        "Crude Oil Inventories",
        Some("-9"),
        Some("0"),
        now() - Duration::days(9),
    )
    .await;
    event(
        &state,
        "missing",
        "Crude Oil Inventories",
        Some("-9"),
        None,
        now() - Duration::days(1),
    )
    .await;
    assert_eq!(inventory(&state, false, now()).await.unwrap().score, None);
    event(
        &state,
        "complete",
        "EIA Crude Oil Stocks Change",
        Some("2"),
        Some("3"),
        now() - Duration::hours(1),
    )
    .await;
    let good = inventory(&state, false, now()).await.unwrap();
    assert_eq!(good.score, Some(1));
    assert_eq!(good.actual.as_deref(), Some("2"));
    event(
        &state,
        "conflict",
        "EIA Crude Oil Inventories",
        Some("4"),
        Some("3"),
        now() - Duration::hours(1),
    )
    .await;
    assert_eq!(inventory(&state, false, now()).await.unwrap().score, None);
    assert_eq!(inventory(&state, true, now()).await.unwrap().score, None);
}

#[tokio::test]
async fn commodity_models_split_growth_from_usd_and_do_not_reuse_today_inventory_in_archives() {
    let (_dir, state) = state().await;
    sqlx::query("INSERT INTO eodhd_fundamental_snapshots(id,built_at,input_fingerprint,status) VALUES('s',?,'s','partial')").bind(now().to_rfc3339()).execute(&state.db).await.unwrap();
    for (currency, key, factor, score) in [
        ("USD", "gdp", "growth", 1),
        ("USD", "cpi_yoy", "inflation", 1),
        ("CNY", "gdp", "growth", -1),
    ] {
        sqlx::query("INSERT INTO eodhd_fundamental_evaluations(id,snapshot_id,currency,canonical_key,factor,direction,actual_text,forecast_text,score,evaluation_status,released_at) VALUES(?,'s',?,?,?,1,?,'2',?,'scored',?)")
            .bind(format!("{currency}:{key}")).bind(currency).bind(key).bind(factor).bind((2+score).to_string()).bind(score).bind(now().to_rfc3339()).execute(&state.db).await.unwrap();
    }
    event(
        &state,
        "oil",
        "EIA Crude Oil Stocks Change",
        Some("2"),
        Some("3"),
        now() - Duration::hours(1),
    )
    .await;
    let dashboard = super::super::eodhd_fundamentals::load_fundamental_dashboard_snapshot(
        &state,
        Some(now()),
        None,
    )
    .await
    .unwrap();
    let assets = commodity_assets(&state, &dashboard, now(), false)
        .await
        .unwrap();
    let gold = assets.iter().find(|a| a.instrument.base == "XAU").unwrap();
    assert_eq!(gold.score, Some(-2));
    let oil = assets.iter().find(|a| a.instrument.base == "WTI").unwrap();
    assert_eq!(oil.score, Some(0));
    assert!(!oil.contributions.iter().any(|c| c.key == "usd:USD:gdp"));
    assert_eq!(
        oil.contributions
            .iter()
            .find(|c| c.key == "demand:USD:gdp")
            .unwrap()
            .score,
        Some(1)
    );
    let gas = assets
        .iter()
        .find(|a| a.instrument.base == "NATURAL_GAS")
        .unwrap();
    assert!(
        !gas.contributions
            .iter()
            .any(|c| c.source_currency.as_deref() == Some("CNY"))
    );
    assert!(
        gold.contributions
            .iter()
            .any(|c| c.key == "real_yields" && c.score.is_none())
    );
    let archived = commodity_assets(&state, &dashboard, now(), true)
        .await
        .unwrap();
    assert_eq!(
        archived
            .iter()
            .find(|a| a.instrument.base == "WTI")
            .unwrap()
            .contributions
            .iter()
            .find(|c| c.channel == "inventory")
            .unwrap()
            .score,
        None
    );
}

#[tokio::test]
async fn all_eight_commodities_keep_missing_scores_unavailable() {
    let (_dir, state) = state().await;
    let dashboard = super::super::eodhd_fundamentals::load_fundamental_dashboard_snapshot(
        &state,
        Some(now()),
        None,
    )
    .await
    .unwrap();
    let assets = commodity_assets(&state, &dashboard, now(), false)
        .await
        .unwrap();
    assert_eq!(assets.len(), 8);
    assert!(
        assets
            .iter()
            .all(|a| a.score.is_none() && a.available_components == 0 && a.total_components > 0)
    );
    assert!(
        instruments()
            .iter()
            .find(|i| i.base == "COPPER")
            .unwrap()
            .price_symbol
            .is_none()
    );
}
