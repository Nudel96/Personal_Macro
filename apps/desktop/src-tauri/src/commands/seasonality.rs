use std::{
    cmp::Ordering,
    collections::{BTreeMap, HashSet},
};

use chrono::{Datelike, NaiveDate, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use tauri::State;
use uuid::Uuid;

use crate::{
    commands::{
        dukascopy,
        market::{Candle, MarketSymbol, market_history, market_symbols},
    },
    database::AppState,
    errors::{AppError, CommandError, CommandResult},
};

const CORE_CATEGORIES: [&str; 4] = ["Forex", "Commodities", "Indizes", "KryptowÃ¤hrungen"];
const MIN_COMPLETE_YEARS: usize = 10;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeasonalityItem {
    pub asset: String,
    pub symbol: String,
    pub horizon: String,
    pub sample_start: Option<String>,
    pub sample_end: Option<String>,
    pub average_return: Option<String>,
    pub positive_ratio: Option<String>,
    pub samples: Option<i64>,
    pub signal: Option<i8>,
    pub curve: Vec<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeasonalityImport {
    pub source_name: String,
    pub source_url: Option<String>,
    pub snapshot_at: Option<String>,
    pub items: Vec<SeasonalityItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeasonalityCurvePoint {
    pub week: u8,
    pub mean: Option<f64>,
    pub p25: Option<f64>,
    pub p75: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeasonalityPeriodMetric {
    pub period: String,
    pub average_return: Option<f64>,
    pub median_return: Option<f64>,
    pub positive_ratio: Option<f64>,
    pub samples: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeasonalityForwardMetric {
    pub label: String,
    pub trading_days: usize,
    pub average_return: Option<f64>,
    pub median_return: Option<f64>,
    pub positive_ratio: Option<f64>,
    pub volatility: Option<f64>,
    pub samples: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeasonalitySimilarYear {
    pub year: i32,
    pub correlation: Option<f64>,
    pub final_return: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeasonalityAssetDetail {
    pub symbol: String,
    pub category: String,
    pub description: Option<String>,
    pub base_currency: Option<String>,
    pub quote_currency: Option<String>,
    pub calculated_at: String,
    pub history_start: Option<String>,
    pub history_end: Option<String>,
    pub complete_years: usize,
    pub quality_status: String,
    pub quality_reason: String,
    pub annual_curve: Vec<SeasonalityCurvePoint>,
    pub months: Vec<SeasonalityPeriodMetric>,
    pub quarters: Vec<SeasonalityPeriodMetric>,
    pub forward_returns: Vec<SeasonalityForwardMetric>,
    pub similar_years: Vec<SeasonalitySimilarYear>,
    pub heatmap_signal: Option<i8>,
    #[serde(default)]
    pub data_source: String,
    #[serde(default)]
    pub data_source_url: Option<String>,
    #[serde(default)]
    pub native_timezone: Option<String>,
    #[serde(default)]
    pub missing_days: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeasonalityAssetSummary {
    pub symbol: String,
    pub category: String,
    pub description: Option<String>,
    pub complete_years: usize,
    pub quality_status: String,
    pub expected_four_week_return: Option<f64>,
    pub four_week_hit_rate: Option<f64>,
    pub heatmap_signal: Option<i8>,
    pub calculated_at: String,
    pub data_source: String,
    pub data_source_url: Option<String>,
    pub native_timezone: Option<String>,
    pub missing_days: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeasonalityDashboard {
    pub snapshot_at: Option<String>,
    pub source_name: Option<String>,
    pub source_url: Option<String>,
    pub items: Vec<SeasonalityItem>,
    pub assets: Vec<SeasonalityAssetSummary>,
    pub collection_status: Option<String>,
    pub collection_error: Option<String>,
    pub data_version: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeasonalityForexPair {
    pub base: String,
    pub quote: String,
    pub symbol: String,
    pub signal: i8,
    pub quality: f64,
}

const WINDOW_MIN_DAYS: usize = 5;
const WINDOW_MAX_DAYS: usize = 90;
const MIN_RANKED_SAMPLES: usize = 5;

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeasonalityYearFilter {
    pub start_year: Option<i32>,
    pub end_year: Option<i32>,
    pub cycle_years: Option<u8>,
    pub cycle_anchor_year: Option<i32>,
    #[serde(default)]
    pub ending_digits: Vec<u8>,
    #[serde(default)]
    pub include_years: Vec<i32>,
    #[serde(default)]
    pub exclude_years: Vec<i32>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeasonalityAnalysisInput {
    pub symbol: String,
    pub reference_date: Option<String>,
    #[serde(default)]
    pub year_filter: SeasonalityYearFilter,
    pub window_start: Option<String>,
    pub window_trading_days: Option<usize>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeasonalityDailyCurvePoint {
    pub day: u16,
    pub mean: Option<f64>,
    pub smoothed_mean: Option<f64>,
    pub samples: usize,
    pub median: Option<f64>,
    pub p25: Option<f64>,
    pub p75: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeasonalityTrendSegment {
    pub start_day: u16,
    pub end_day: u16,
    pub phase: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeasonalityWindowMetric {
    pub start_date: String,
    pub trading_days: usize,
    pub average_return: Option<f64>,
    pub median_return: Option<f64>,
    pub positive_ratio: Option<f64>,
    pub negative_ratio: Option<f64>,
    pub volatility: Option<f64>,
    pub p10: Option<f64>,
    pub p90: Option<f64>,
    pub samples: usize,
    pub years: Vec<i32>,
    pub year_returns: Vec<SeasonalityYearReturn>,
    pub direction: Option<i8>,
    pub wilson_lower_bound: Option<f64>,
    pub quality_status: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeasonalityYearReturn {
    pub year: i32,
    pub return_value: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeasonalityAnalysis {
    pub symbol: String,
    pub category: String,
    pub description: Option<String>,
    pub calculated_at: String,
    pub history_start: Option<String>,
    pub history_end: Option<String>,
    pub selected_years: Vec<i32>,
    pub quality_status: String,
    pub quality_reason: String,
    pub reference_date: String,
    pub annual_curve: Vec<SeasonalityDailyCurvePoint>,
    pub trend_segments: Vec<SeasonalityTrendSegment>,
    pub months: Vec<SeasonalityPeriodMetric>,
    pub quarters: Vec<SeasonalityPeriodMetric>,
    pub forward_returns: Vec<SeasonalityForwardMetric>,
    pub selected_window: SeasonalityWindowMetric,
    pub bullish_windows: Vec<SeasonalityWindowMetric>,
    pub bearish_windows: Vec<SeasonalityWindowMetric>,
    pub heatmap: Vec<SeasonalityHeatmapCell>,
    pub data_source: String,
    pub data_source_url: Option<String>,
    pub native_timezone: Option<String>,
    pub missing_days: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeasonalityHeatmapCell {
    pub start_date: String,
    pub trading_days: usize,
    pub score: Option<f64>,
    pub median_return: Option<f64>,
    pub wilson_lower_bound: Option<f64>,
    pub samples: usize,
    pub direction: Option<i8>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeasonalityScreenerRow {
    pub symbol: String,
    pub category: String,
    pub description: Option<String>,
    pub complete_years: usize,
    pub quality_status: String,
    pub bullish_window: Option<SeasonalityWindowMetric>,
    pub bearish_window: Option<SeasonalityWindowMetric>,
    pub calculated_at: String,
    pub data_source: String,
    pub missing_days: usize,
}

#[derive(Debug, FromRow)]
struct SeasonalityRow {
    asset: String,
    symbol: String,
    horizon: String,
    sample_start: Option<String>,
    sample_end: Option<String>,
    average_return: Option<String>,
    positive_ratio: Option<String>,
    samples: Option<i64>,
    signal: Option<i64>,
    curve_json: String,
}
#[derive(Debug, Clone, FromRow)]
struct ProfileRow {
    symbol: String,
    category: String,
    description: Option<String>,
    base_currency: Option<String>,
    quote_currency: Option<String>,
    calculated_at: String,
    complete_years: i64,
    quality_status: String,
    profile_json: String,
    data_source: String,
    data_source_url: Option<String>,
    native_timezone: Option<String>,
    missing_days: i64,
}

async fn provider_profile_rows(state: &AppState) -> CommandResult<Vec<ProfileRow>> {
    sqlx::query_as(
        "SELECT pi.provider_symbol AS symbol,pi.category,pi.description,pi.base_currency,pi.quote_currency,pp.calculated_at,pp.complete_years,pp.quality_status,pp.profile_json,'Dukascopy Historical Data' AS data_source,'https://www.dukascopy.com/swiss/english/marketwatch/historical/' AS data_source_url,pi.native_timezone,pp.missing_days FROM seasonality_provider_profiles pp JOIN seasonality_provider_instruments pi ON pi.provider=pp.provider AND pi.provider_symbol=pp.provider_symbol WHERE pp.provider='dukascopy' ORDER BY pi.category,pi.display_symbol",
    )
    .fetch_all(&state.db)
    .await
    .map_err(AppError::from)
    .map_err(CommandError::from)
}

async fn profile_row_for_symbol(
    state: &AppState,
    symbol: &str,
) -> CommandResult<Option<ProfileRow>> {
    let provider: Option<ProfileRow> = sqlx::query_as("SELECT pi.provider_symbol AS symbol,pi.category,pi.description,pi.base_currency,pi.quote_currency,pp.calculated_at,pp.complete_years,pp.quality_status,pp.profile_json,'Dukascopy Historical Data' AS data_source,'https://www.dukascopy.com/swiss/english/marketwatch/historical/' AS data_source_url,pi.native_timezone,pp.missing_days FROM seasonality_provider_profiles pp JOIN seasonality_provider_instruments pi ON pi.provider=pp.provider AND pi.provider_symbol=pp.provider_symbol WHERE pp.provider='dukascopy' AND lower(pi.provider_symbol)=lower(?)")
        .bind(symbol).fetch_optional(&state.db).await.map_err(AppError::from)?;
    if provider.is_some() {
        return Ok(provider);
    }
    sqlx::query_as("SELECT sp.symbol,mi.category,mi.description,mi.base_currency,mi.quote_currency,sp.calculated_at,sp.complete_years,sp.quality_status,sp.profile_json,'BlackBull MT5' AS data_source,'https://www.blackbull.com' AS data_source_url,NULL AS native_timezone,0 AS missing_days FROM seasonality_profiles sp JOIN market_instruments mi ON mi.symbol=sp.symbol WHERE lower(sp.symbol)=lower(?)")
        .bind(symbol).fetch_optional(&state.db).await.map_err(AppError::from).map_err(CommandError::from)
}

async fn profile_candles(state: &AppState, row: &ProfileRow) -> CommandResult<Vec<(i64, f64)>> {
    let query = if row.data_source == "Dukascopy Historical Data" {
        "SELECT candle_time / 1000,mid_close FROM seasonality_provider_daily_candles WHERE provider='dukascopy' AND provider_symbol=? ORDER BY candle_time"
    } else {
        "SELECT candle_time,close FROM market_daily_candles WHERE symbol=? ORDER BY candle_time"
    };
    sqlx::query_as(query)
        .bind(&row.symbol)
        .fetch_all(&state.db)
        .await
        .map_err(AppError::from)
        .map_err(CommandError::from)
}

fn normalised_symbol(value: &str) -> String {
    value
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .collect::<String>()
        .to_ascii_uppercase()
}

#[tauri::command]
pub async fn get_seasonality(state: State<'_, AppState>) -> CommandResult<SeasonalityDashboard> {
    let snapshot: Option<(String, String, String, Option<String>)> = sqlx::query_as(
        "SELECT ms.id, ms.snapshot_at, ms.source_name, ms.source_url FROM macro_snapshots ms WHERE EXISTS (SELECT 1 FROM seasonality_snapshots ss WHERE ss.macro_snapshot_id = ms.id) ORDER BY ms.snapshot_at DESC, ms.imported_at DESC LIMIT 1",
    ).fetch_optional(&state.db).await.map_err(AppError::from)?;
    let mut items = Vec::new();
    let (snapshot_at, source_name, source_url) = if let Some((id, at, name, url)) = snapshot {
        items = sqlx::query_as::<_, SeasonalityRow>("SELECT asset, symbol, horizon, sample_start, sample_end, average_return, positive_ratio, samples, signal, curve_json FROM seasonality_snapshots WHERE macro_snapshot_id=? ORDER BY asset, symbol")
            .bind(id).fetch_all(&state.db).await.map_err(AppError::from)?.into_iter().map(legacy_item).collect();
        (Some(at), Some(name), url)
    } else {
        (None, None, None)
    };
    let mut assets = provider_profile_rows(&state).await?;
    let primary_symbols: HashSet<String> = assets
        .iter()
        .filter(|row| row.quality_status == "available")
        .map(|row| normalised_symbol(&row.symbol))
        .collect();
    let fallback: Vec<ProfileRow> = sqlx::query_as("SELECT sp.symbol,mi.category,mi.description,mi.base_currency,mi.quote_currency,sp.calculated_at,sp.complete_years,sp.quality_status,sp.profile_json,'BlackBull MT5' AS data_source,'https://www.blackbull.com' AS data_source_url,NULL AS native_timezone,0 AS missing_days FROM seasonality_profiles sp JOIN market_instruments mi ON mi.symbol=sp.symbol ORDER BY mi.category,sp.symbol")
        .fetch_all(&state.db).await.map_err(AppError::from)?;
    assets.extend(
        fallback
            .into_iter()
            .filter(|row| !primary_symbols.contains(&normalised_symbol(&row.symbol))),
    );
    assets.sort_by(|left, right| {
        left.category
            .cmp(&right.category)
            .then(left.symbol.cmp(&right.symbol))
    });
    let collection: Option<(String, Option<String>)> = sqlx::query_as(
        "SELECT status,error_message FROM (SELECT status,error_message,started_at FROM seasonality_provider_sync_runs UNION ALL SELECT status,error_message,started_at FROM seasonality_sync_runs) ORDER BY started_at DESC LIMIT 1",
    )
    .fetch_optional(&state.db)
    .await
    .map_err(AppError::from)?;
    let assets = assets.into_iter().filter_map(profile_summary).collect();
    Ok(SeasonalityDashboard {
        snapshot_at,
        source_name,
        source_url,
        items,
        assets,
        collection_status: collection.as_ref().map(|value| value.0.clone()),
        collection_error: collection.and_then(|value| value.1),
        data_version: Utc::now().format("%Y%m%d").to_string(),
    })
}

#[tauri::command]
pub async fn get_seasonality_asset_detail(
    state: State<'_, AppState>,
    symbol: String,
) -> CommandResult<SeasonalityAssetDetail> {
    let row = profile_row_for_symbol(&state, symbol.trim()).await?;
    row.and_then(profile_detail).ok_or_else(|| {
        CommandError::validation(
            "FÃ¼r dieses Asset wurde noch keine BlackBull-Seasonality berechnet.",
        )
    })
}

#[tauri::command]
pub async fn analyze_seasonality(
    state: State<'_, AppState>,
    input: SeasonalityAnalysisInput,
) -> CommandResult<SeasonalityAnalysis> {
    let symbol = input.symbol.trim().to_string();
    if symbol.is_empty() {
        return Err(CommandError::validation(
            "Bitte wÃ¤hle ein BlackBull-Asset aus.",
        ));
    }
    let row = profile_row_for_symbol(&state, &symbol).await?;
    let row = row.ok_or_else(|| {
        CommandError::validation(
            "FÃ¼r dieses Asset wurde noch keine lokale D1-Historie gespeichert.",
        )
    })?;
    let candles = profile_candles(&state, &row).await?;
    analysis_from_candles(row, &candles, input)
}

#[tauri::command]
pub async fn get_seasonality_screener(
    state: State<'_, AppState>,
) -> CommandResult<Vec<SeasonalityScreenerRow>> {
    let mut profiles = provider_profile_rows(&state).await?;
    let primary_symbols: HashSet<String> = profiles
        .iter()
        .filter(|row| row.quality_status == "available")
        .map(|row| normalised_symbol(&row.symbol))
        .collect();
    let fallback: Vec<ProfileRow> = sqlx::query_as("SELECT sp.symbol,mi.category,mi.description,mi.base_currency,mi.quote_currency,sp.calculated_at,sp.complete_years,sp.quality_status,sp.profile_json,'BlackBull MT5' AS data_source,'https://www.blackbull.com' AS data_source_url,NULL AS native_timezone,0 AS missing_days FROM seasonality_profiles sp JOIN market_instruments mi ON mi.symbol=sp.symbol ORDER BY mi.category,mi.symbol")
        .fetch_all(&state.db).await.map_err(AppError::from)?;
    profiles.extend(
        fallback
            .into_iter()
            .filter(|row| !primary_symbols.contains(&normalised_symbol(&row.symbol))),
    );
    let mut output = Vec::with_capacity(profiles.len());
    for row in profiles {
        let candles = profile_candles(&state, &row).await?;
        let input = SeasonalityAnalysisInput {
            symbol: row.symbol.clone(),
            reference_date: None,
            year_filter: SeasonalityYearFilter::default(),
            window_start: None,
            window_trading_days: Some(20),
        };
        if let Ok(analysis) = analysis_from_candles(row.clone(), &candles, input) {
            output.push(SeasonalityScreenerRow {
                symbol: analysis.symbol,
                category: analysis.category,
                description: analysis.description,
                complete_years: row.complete_years.max(0) as usize,
                quality_status: analysis.quality_status,
                bullish_window: analysis.bullish_windows.into_iter().next(),
                bearish_window: analysis.bearish_windows.into_iter().next(),
                calculated_at: row.calculated_at,
                data_source: row.data_source,
                missing_days: row.missing_days.max(0) as usize,
            });
        }
    }
    output.sort_by(|left, right| {
        ranking_value(right.bullish_window.as_ref(), 1)
            .partial_cmp(&ranking_value(left.bullish_window.as_ref(), 1))
            .unwrap_or(Ordering::Equal)
    });
    Ok(output)
}

#[tauri::command]
pub async fn get_seasonality_forex_pairs(
    state: State<'_, AppState>,
) -> CommandResult<Vec<SeasonalityForexPair>> {
    let rows: Vec<ProfileRow> = sqlx::query_as("SELECT sp.symbol,mi.category,mi.description,mi.base_currency,mi.quote_currency,sp.calculated_at,sp.complete_years,sp.quality_status,sp.profile_json,'BlackBull MT5' AS data_source,'https://www.blackbull.com' AS data_source_url,NULL AS native_timezone,0 AS missing_days FROM seasonality_profiles sp JOIN market_instruments mi ON mi.symbol=sp.symbol WHERE mi.category='Forex'")
        .fetch_all(&state.db).await.map_err(AppError::from)?;
    Ok(rows
        .into_iter()
        .filter_map(|row| {
            let detail = profile_detail(row)?;
            Some(SeasonalityForexPair {
                base: detail.base_currency?,
                quote: detail.quote_currency?,
                symbol: detail.symbol,
                signal: detail.heatmap_signal?,
                quality: (detail.complete_years as f64 / 10.0).min(1.0),
            })
        })
        .collect())
}

async fn refresh_instrument(
    state: &AppState,
    instrument: &MarketSymbol,
    trigger: &str,
) -> CommandResult<SeasonalityAssetDetail> {
    let run_id = Uuid::new_v4().to_string();
    let started_at = Utc::now().to_rfc3339();
    sqlx::query("INSERT INTO seasonality_sync_runs(id,started_at,trigger,provider,symbol,requested_symbols,status) VALUES(?,?,?,?,?,1,'running')")
        .bind(&run_id).bind(&started_at).bind(trigger).bind("BlackBull MT5").bind(&instrument.symbol)
        .execute(&state.db).await.map_err(AppError::from)?;
    let candles = match market_history(state, &instrument.symbol, "D1") {
        Ok(candles) => candles,
        Err(error) => {
            finish_sync_run(state, &run_id, "failed", 0, 0, Some(&error.message)).await?;
            return Err(error);
        }
    };
    let now = Utc::now().to_rfc3339();
    let mut tx = state.db.begin().await.map_err(AppError::from)?;
    sqlx::query("INSERT INTO market_instruments(symbol,category,description,path,base_currency,quote_currency,last_seen_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(symbol) DO UPDATE SET category=excluded.category,description=excluded.description,path=excluded.path,base_currency=excluded.base_currency,quote_currency=excluded.quote_currency,last_seen_at=excluded.last_seen_at")
        .bind(&instrument.symbol).bind(&instrument.category).bind(&instrument.description).bind(&instrument.path).bind(&instrument.base_currency).bind(&instrument.quote_currency).bind(&now).execute(&mut *tx).await.map_err(AppError::from)?;
    for candle in &candles {
        sqlx::query("INSERT INTO market_daily_candles(symbol,candle_time,open,high,low,close,volume,volume_kind,fetched_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(symbol,candle_time) DO UPDATE SET open=excluded.open,high=excluded.high,low=excluded.low,close=excluded.close,volume=excluded.volume,volume_kind=excluded.volume_kind,fetched_at=excluded.fetched_at")
            .bind(&instrument.symbol).bind(candle.time).bind(candle.open).bind(candle.high).bind(candle.low).bind(candle.close).bind(candle.volume).bind(&candle.volume_kind).bind(&now).execute(&mut *tx).await.map_err(AppError::from)?;
    }
    let detail = calculate_profile(instrument, &candles, &now);
    sqlx::query("INSERT INTO seasonality_profiles(symbol,calculated_at,history_start,history_end,complete_years,quality_status,profile_json) VALUES(?,?,?,?,?,?,?) ON CONFLICT(symbol) DO UPDATE SET calculated_at=excluded.calculated_at,history_start=excluded.history_start,history_end=excluded.history_end,complete_years=excluded.complete_years,quality_status=excluded.quality_status,profile_json=excluded.profile_json")
        .bind(&detail.symbol).bind(&detail.calculated_at).bind(&detail.history_start).bind(&detail.history_end).bind(detail.complete_years as i64).bind(&detail.quality_status).bind(serde_json::to_string(&detail).unwrap_or_else(|_| "{}".into())).execute(&mut *tx).await.map_err(AppError::from)?;
    tx.commit().await.map_err(AppError::from)?;
    finish_sync_run(state, &run_id, "complete", 1, candles.len(), None).await?;
    Ok(detail)
}

async fn finish_sync_run(
    state: &AppState,
    run_id: &str,
    status: &str,
    refreshed_symbols: usize,
    fetched_candles: usize,
    error: Option<&str>,
) -> CommandResult<()> {
    let message = error.map(|value| value.chars().take(500).collect::<String>());
    sqlx::query("UPDATE seasonality_sync_runs SET completed_at=?,status=?,refreshed_symbols=?,fetched_candles=?,error_message=? WHERE id=?")
        .bind(Utc::now().to_rfc3339()).bind(status).bind(refreshed_symbols as i64).bind(fetched_candles as i64).bind(message).bind(run_id)
        .execute(&state.db).await.map_err(AppError::from)?;
    Ok(())
}

pub async fn scheduled_seasonality_sync(state: &AppState) -> CommandResult<()> {
    if let Err(error) = scheduled_dukascopy_sync(state).await {
        tracing::warn!(code = %error.code, "Dukascopy-Seasonality-Sync wird später erneut versucht");
    }
    if let Err(error) = scheduled_blackbull_sync(state).await {
        tracing::debug!(code = %error.code, "BlackBull-Fallback ist momentan nicht verfügbar");
    }
    Ok(())
}

async fn scheduled_blackbull_sync(state: &AppState) -> CommandResult<()> {
    let cutoff = (Utc::now() - chrono::Duration::hours(24)).to_rfc3339();
    let symbols = market_symbols(state)?;
    let existing: HashSet<String> = sqlx::query_scalar("SELECT symbol FROM seasonality_profiles")
        .fetch_all(&state.db)
        .await
        .map_err(AppError::from)?
        .into_iter()
        .collect();
    let attempted_today: HashSet<String> = sqlx::query_scalar("SELECT DISTINCT symbol FROM seasonality_sync_runs WHERE started_at >= ? AND symbol IS NOT NULL")
        .bind(&cutoff).fetch_all(&state.db).await.map_err(AppError::from)?.into_iter().collect();
    let missing: Vec<_> = symbols
        .iter()
        .filter(|item| item.visible && CORE_CATEGORIES.contains(&item.category.as_str()))
        .filter(|item| !existing.contains(&item.symbol) && !attempted_today.contains(&item.symbol))
        .cloned()
        .collect();
    if let Some(instrument) = missing.into_iter().next() {
        let _ = refresh_instrument(state, &instrument, "fallback_collection").await;
        return Ok(());
    }
    let symbol: Option<String> = sqlx::query_scalar(
        "SELECT sp.symbol FROM seasonality_profiles sp WHERE sp.calculated_at < ? AND NOT EXISTS (SELECT 1 FROM seasonality_sync_runs sr WHERE sr.symbol=sp.symbol AND sr.started_at >= ?) ORDER BY sp.calculated_at ASC LIMIT 1",
    ).bind(&cutoff).bind(&cutoff).fetch_optional(&state.db).await.map_err(AppError::from)?;
    let Some(symbol) = symbol else {
        return Ok(());
    };
    let instrument = symbols.into_iter().find(|value| value.symbol == symbol)
        .ok_or_else(|| CommandError::validation("Das gespeicherte Seasonality-Asset ist im aktuellen BlackBull-Katalog nicht mehr verfÃ¼gbar."))?;
    refresh_instrument(state, &instrument, "scheduler")
        .await
        .map(|_| ())
}

#[derive(Debug, Clone, FromRow)]
struct ProviderInstrumentRow {
    provider_symbol: String,
    category: String,
    description: Option<String>,
    base_currency: Option<String>,
    quote_currency: Option<String>,
    earliest_daily_at: Option<i64>,
    native_timezone: Option<String>,
}

async fn scheduled_dukascopy_sync(state: &AppState) -> CommandResult<()> {
    let client = dukascopy::http_client()?;
    let catalogued: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM seasonality_provider_instruments WHERE provider='dukascopy'",
    )
    .fetch_one(&state.db)
    .await
    .map_err(AppError::from)?;
    if catalogued == 0 {
        let instruments = dukascopy::catalog(&client).await?;
        let now = Utc::now().to_rfc3339();
        let mut tx = state.db.begin().await.map_err(AppError::from)?;
        for instrument in instruments {
            sqlx::query("INSERT INTO seasonality_provider_instruments(provider,provider_symbol,display_symbol,category,description,base_currency,quote_currency,earliest_daily_at,native_timezone,last_catalogued_at) VALUES('dukascopy',?,?,?,?,?,?,?,?,?) ON CONFLICT(provider,provider_symbol) DO UPDATE SET display_symbol=excluded.display_symbol,category=excluded.category,description=excluded.description,base_currency=excluded.base_currency,quote_currency=excluded.quote_currency,earliest_daily_at=excluded.earliest_daily_at,native_timezone=excluded.native_timezone,last_catalogued_at=excluded.last_catalogued_at")
                .bind(&instrument.symbol).bind(&instrument.display_symbol).bind(&instrument.category).bind(&instrument.description).bind(&instrument.base_currency).bind(&instrument.quote_currency).bind(instrument.earliest_daily_at).bind(&instrument.native_timezone).bind(&now)
                .execute(&mut *tx).await.map_err(AppError::from)?;
        }
        tx.commit().await.map_err(AppError::from)?;
    }
    let cutoff = (Utc::now() - chrono::Duration::hours(24)).to_rfc3339();
    let now = Utc::now().to_rfc3339();
    let next: Option<ProviderInstrumentRow> = sqlx::query_as("SELECT pi.provider_symbol,pi.category,pi.description,pi.base_currency,pi.quote_currency,pi.earliest_daily_at,pi.native_timezone FROM seasonality_provider_instruments pi LEFT JOIN seasonality_provider_profiles pp ON pp.provider=pi.provider AND pp.provider_symbol=pi.provider_symbol WHERE pi.provider='dukascopy' AND (pp.calculated_at IS NULL OR pp.calculated_at < ?) AND NOT EXISTS (SELECT 1 FROM seasonality_provider_retry_state retry WHERE retry.provider=pi.provider AND retry.provider_symbol=pi.provider_symbol AND retry.next_retry_at>?) ORDER BY CASE WHEN pi.category='Forex' AND pi.base_currency IN ('USD','EUR','GBP','JPY','CHF','AUD','CAD','NZD','CNY') AND pi.quote_currency IN ('USD','EUR','GBP','JPY','CHF','AUD','CAD','NZD','CNY') THEN 0 WHEN pi.category='Forex' THEN 1 ELSE 2 END,CASE WHEN COALESCE(pp.complete_years,0)<15 THEN 0 ELSE 1 END,pp.calculated_at IS NOT NULL,pp.calculated_at,pi.provider_symbol LIMIT 1")
        .bind(cutoff).bind(now).fetch_optional(&state.db).await.map_err(AppError::from)?;
    if let Some(instrument) = next {
        sync_dukascopy_instrument(state, &client, instrument).await?;
    }
    Ok(())
}

async fn sync_dukascopy_instrument(
    state: &AppState,
    client: &reqwest::Client,
    instrument: ProviderInstrumentRow,
) -> CommandResult<()> {
    let run_id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    sqlx::query("INSERT INTO seasonality_provider_sync_runs(id,provider,trigger,provider_symbol,started_at,status) VALUES(?,'dukascopy','scheduler',?,?,'running')")
        .bind(&run_id).bind(&instrument.provider_symbol).bind(&now).execute(&state.db).await.map_err(AppError::from)?;
    let current_year = Utc::now().year();
    let earliest_year = instrument
        .earliest_daily_at
        .and_then(|value| Utc.timestamp_millis_opt(value).single())
        .map(|value| value.year());
    let year_bounds = completed_year_bounds(current_year, earliest_year);
    let mut fetched = 0_usize;
    let mut requested = 0_usize;
    let result: CommandResult<()> = async {
        if let Some((first_year, last_year)) = year_bounds {
            for year in first_year..=last_year {
                let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM seasonality_provider_daily_candles WHERE provider='dukascopy' AND provider_symbol=? AND strftime('%Y', candle_time / 1000, 'unixepoch')=?")
                    .bind(&instrument.provider_symbol).bind(year.to_string()).fetch_one(&state.db).await.map_err(AppError::from)?;
                if count >= 100 { continue; }
                requested += 1;
                let bid = dukascopy::daily_bars(client, &instrument.provider_symbol, "BID", year).await?;
                let ask = dukascopy::daily_bars(client, &instrument.provider_symbol, "ASK", year).await?;
                let ask_by_time: BTreeMap<_, _> = ask.into_iter().map(|bar| (bar.time, bar)).collect();
                let merged: Vec<_> = bid.into_iter().filter_map(|bar| ask_by_time.get(&bar.time).map(|ask| (bar, ask.clone()))).collect();
                let start = Utc.with_ymd_and_hms(year, 1, 1, 0, 0, 0).single().expect("valid year").timestamp_millis();
                let end = Utc.with_ymd_and_hms(year + 1, 1, 1, 0, 0, 0).single().expect("valid year").timestamp_millis();
                let mut tx = state.db.begin().await.map_err(AppError::from)?;
                sqlx::query("DELETE FROM seasonality_provider_daily_candles WHERE provider='dukascopy' AND provider_symbol=? AND candle_time>=? AND candle_time<?")
                    .bind(&instrument.provider_symbol).bind(start).bind(end).execute(&mut *tx).await.map_err(AppError::from)?;
                for (bid, ask) in &merged {
                    sqlx::query("INSERT INTO seasonality_provider_daily_candles(provider,provider_symbol,candle_time,bid_open,bid_high,bid_low,bid_close,ask_open,ask_high,ask_low,ask_close,mid_close,volume,fetched_at) VALUES('dukascopy',?,?,?,?,?,?,?,?,?,?,?,?,?)")
                        .bind(&instrument.provider_symbol).bind(bid.time).bind(bid.open).bind(bid.high).bind(bid.low).bind(bid.close).bind(ask.open).bind(ask.high).bind(ask.low).bind(ask.close).bind((bid.close + ask.close) / 2.0).bind(bid.volume.or(ask.volume)).bind(&now)
                        .execute(&mut *tx).await.map_err(AppError::from)?;
                }
                tx.commit().await.map_err(AppError::from)?;
                fetched += merged.len();
                tokio::time::sleep(std::time::Duration::from_millis(120)).await;
            }
        }
        let prices: Vec<(i64, f64)> = sqlx::query_as("SELECT candle_time,mid_close FROM seasonality_provider_daily_candles WHERE provider='dukascopy' AND provider_symbol=? ORDER BY candle_time")
            .bind(&instrument.provider_symbol).fetch_all(&state.db).await.map_err(AppError::from)?;
        let candles: Vec<Candle> = prices.iter().map(|(time, close)| Candle { time: *time / 1000, open: *close, high: *close, low: *close, close: *close, volume: None, volume_kind: "dukascopy-mid".into() }).collect();
        let market = MarketSymbol { symbol: instrument.provider_symbol.clone(), description: instrument.description.clone(), path: None, category: instrument.category.clone(), visible: true, digits: None, base_currency: instrument.base_currency.clone(), quote_currency: instrument.quote_currency.clone() };
        let mut detail = calculate_profile(&market, &candles, &now);
        detail.data_source = "Dukascopy Historical Data".into();
        detail.data_source_url = Some("https://www.dukascopy.com/swiss/english/marketwatch/historical/".into());
        detail.native_timezone = instrument.native_timezone.clone();
        detail.missing_days = count_data_gaps(&prices);
        detail.quality_reason = if detail.complete_years >= MIN_COMPLETE_YEARS { "Mindestens zehn vollständige Jahre aus nativer Dukascopy-D1-Historie (Bid/Ask-Mittelpreis).".into() } else { "Dukascopy liefert für dieses Asset weniger als zehn vollständige D1-Jahre; die Analyse bleibt explorativ bzw. nutzt transparent BlackBull als Fallback.".into() };
        sqlx::query("INSERT INTO seasonality_provider_profiles(provider,provider_symbol,calculated_at,history_start,history_end,complete_years,quality_status,missing_days,profile_json) VALUES('dukascopy',?,?,?,?,?,?,?,?) ON CONFLICT(provider,provider_symbol) DO UPDATE SET calculated_at=excluded.calculated_at,history_start=excluded.history_start,history_end=excluded.history_end,complete_years=excluded.complete_years,quality_status=excluded.quality_status,missing_days=excluded.missing_days,profile_json=excluded.profile_json")
            .bind(&instrument.provider_symbol).bind(&detail.calculated_at).bind(&detail.history_start).bind(&detail.history_end).bind(detail.complete_years as i64).bind(&detail.quality_status).bind(detail.missing_days as i64).bind(serde_json::to_string(&detail).unwrap_or_else(|_| "{}".into()))
            .execute(&state.db).await.map_err(AppError::from)?;
        Ok(())
    }.await;
    let (status, error) = match result {
        Ok(()) => ("complete", None),
        Err(error) => ("failed", Some(error.message)),
    };
    sqlx::query("UPDATE seasonality_provider_sync_runs SET completed_at=?,status=?,requested_years=?,fetched_candles=?,error_message=? WHERE id=?")
        .bind(Utc::now().to_rfc3339()).bind(status).bind(requested as i64).bind(fetched as i64).bind(error.as_deref().map(|value| value.chars().take(500).collect::<String>())).bind(&run_id)
        .execute(&state.db).await.map_err(AppError::from)?;
    if status == "failed" {
        record_dukascopy_retry(
            state,
            &instrument.provider_symbol,
            error
                .as_deref()
                .unwrap_or("Dukascopy-Synchronisierung fehlgeschlagen."),
        )
        .await
        .map_err(CommandError::from)?;
        return Err(CommandError::validation(error.unwrap_or_else(|| {
            "Dukascopy-Synchronisierung fehlgeschlagen.".into()
        })));
    }
    clear_dukascopy_retry(state, &instrument.provider_symbol)
        .await
        .map_err(CommandError::from)?;
    Ok(())
}

fn completed_year_bounds(current_year: i32, earliest_year: Option<i32>) -> Option<(i32, i32)> {
    let last_year = current_year.checked_sub(1)?;
    let first_year = earliest_year.unwrap_or(last_year).max(last_year - 14);
    (first_year <= last_year).then_some((first_year, last_year))
}

fn dukascopy_retry_delay_minutes(consecutive_failures: i64) -> i64 {
    let exponent = consecutive_failures.saturating_sub(1).clamp(0, 6) as u32;
    (30_i64.saturating_mul(2_i64.pow(exponent))).min(1_440)
}

fn dukascopy_error_code(message: &str) -> &'static str {
    let normalized = message.to_ascii_lowercase();
    if normalized.contains("timeout") || normalized.contains("timed out") {
        "network_timeout"
    } else if normalized.contains("429") || normalized.contains("rate limit") {
        "rate_limited"
    } else if normalized.contains("historie nicht liefern")
        || normalized.contains("requested history")
    {
        "history_unavailable"
    } else {
        "provider_error"
    }
}

async fn record_dukascopy_retry(
    state: &AppState,
    provider_symbol: &str,
    message: &str,
) -> Result<(), AppError> {
    let previous: Option<i64> = sqlx::query_scalar(
        "SELECT consecutive_failures FROM seasonality_provider_retry_state WHERE provider='dukascopy' AND provider_symbol=?",
    )
    .bind(provider_symbol)
    .fetch_optional(&state.db)
    .await?;
    let failures = previous.unwrap_or(0).saturating_add(1);
    let now = Utc::now();
    let next_retry = now + chrono::Duration::minutes(dukascopy_retry_delay_minutes(failures));
    sqlx::query(
        "INSERT INTO seasonality_provider_retry_state(provider,provider_symbol,consecutive_failures,next_retry_at,last_error_code,last_error_message,updated_at) VALUES('dukascopy',?,?,?,?,?,?) ON CONFLICT(provider,provider_symbol) DO UPDATE SET consecutive_failures=excluded.consecutive_failures,next_retry_at=excluded.next_retry_at,last_error_code=excluded.last_error_code,last_error_message=excluded.last_error_message,updated_at=excluded.updated_at",
    )
    .bind(provider_symbol)
    .bind(failures)
    .bind(next_retry.to_rfc3339())
    .bind(dukascopy_error_code(message))
    .bind(message.chars().take(500).collect::<String>())
    .bind(now.to_rfc3339())
    .execute(&state.db)
    .await?;
    Ok(())
}

async fn clear_dukascopy_retry(state: &AppState, provider_symbol: &str) -> Result<(), AppError> {
    sqlx::query(
        "DELETE FROM seasonality_provider_retry_state WHERE provider='dukascopy' AND provider_symbol=?",
    )
    .bind(provider_symbol)
    .execute(&state.db)
    .await?;
    Ok(())
}

fn count_data_gaps(prices: &[(i64, f64)]) -> usize {
    prices
        .windows(2)
        .map(|window| (window[1].0 - window[0].0) / 86_400_000)
        .filter(|days| *days > 5)
        .map(|days| (days - 5) as usize)
        .sum()
}

fn analysis_from_candles(
    row: ProfileRow,
    candles: &[(i64, f64)],
    input: SeasonalityAnalysisInput,
) -> CommandResult<SeasonalityAnalysis> {
    let mut prices: Vec<(NaiveDate, f64)> = candles
        .iter()
        .filter_map(|(time, close)| {
            Utc.timestamp_opt(*time, 0)
                .single()
                .map(|value| (value.date_naive(), *close))
        })
        .filter(|(_, close)| close.is_finite() && *close > 0.0)
        .collect();
    prices.sort_by_key(|(date, _)| *date);
    prices.dedup_by_key(|(date, _)| *date);
    if prices.is_empty() {
        return Err(CommandError::validation(
            "FÃ¼r dieses Asset ist keine nutzbare lokale D1-Historie vorhanden.",
        ));
    }
    let history_start = prices.first().map(|(date, _)| date.to_string());
    let history_end = prices.last().map(|(date, _)| date.to_string());
    let start_indices = seasonal_start_indices(&prices);
    let mut all_years: BTreeMap<i32, Vec<(NaiveDate, f64)>> = BTreeMap::new();
    for value in &prices {
        all_years.entry(value.0.year()).or_default().push(*value);
    }
    let complete: BTreeMap<_, _> = all_years
        .into_iter()
        .filter(|(_, values)| values.len() >= 180)
        .collect();
    let selected_years = filtered_years(&complete, &input.year_filter);
    let selected: BTreeMap<_, _> = selected_years
        .iter()
        .filter_map(|year| complete.get(year).map(|rows| (*year, rows.clone())))
        .collect();
    let reference_date = input.reference_date.unwrap_or_else(current_reference_date);
    let (reference_month, reference_day) = parse_reference_date(&reference_date)?;
    let window_date = input.window_start.unwrap_or_else(|| reference_date.clone());
    let (window_month, window_day) = parse_reference_date(&window_date)?;
    let window_days = input
        .window_trading_days
        .unwrap_or(20)
        .clamp(WINDOW_MIN_DAYS, WINDOW_MAX_DAYS);
    let quality_status = if selected_years.len() >= MIN_RANKED_SAMPLES {
        "available"
    } else {
        "exploratory"
    };
    let quality_reason = if selected_years.len() >= MIN_RANKED_SAMPLES {
        format!(
            "{} vollstÃ¤ndige Jahre erfÃ¼llen die aktiven Filter.",
            selected_years.len()
        )
    } else {
        format!(
            "Nur {} vollstÃ¤ndige Jahre erfÃ¼llen die aktiven Filter; Rankings bleiben explorativ.",
            selected_years.len()
        )
    };
    let selected_window = window_metric(
        &prices,
        &start_indices,
        &selected_years,
        window_month,
        window_day,
        window_days,
    );
    let mut bullish_windows = Vec::new();
    let mut bearish_windows = Vec::new();
    let mut heatmap = Vec::new();
    for day in 1..=365_u16 {
        let date = date_for_seasonal_day(day);
        for days in WINDOW_MIN_DAYS..=WINDOW_MAX_DAYS {
            let metric = window_metric(
                &prices,
                &start_indices,
                &selected_years,
                date.month(),
                date.day(),
                days,
            );
            if metric.samples < MIN_RANKED_SAMPLES {
                continue;
            }
            if day == 1 || day % 7 == 1 {
                let score =
                    metric
                        .median_return
                        .zip(metric.volatility)
                        .map(|(median, volatility)| {
                            let confidence = metric.wilson_lower_bound.unwrap_or(0.0);
                            median / volatility.max(0.000_001) * confidence
                        });
                heatmap.push(SeasonalityHeatmapCell {
                    start_date: metric.start_date.clone(),
                    trading_days: metric.trading_days,
                    score,
                    median_return: metric.median_return,
                    wilson_lower_bound: metric.wilson_lower_bound,
                    samples: metric.samples,
                    direction: metric.direction,
                });
            }
            if metric.median_return.is_some_and(|value| value > 0.0) {
                bullish_windows.push(metric.clone());
            }
            if metric.median_return.is_some_and(|value| value < 0.0) {
                bearish_windows.push(metric);
            }
        }
    }
    sort_windows(&mut bullish_windows, 1);
    sort_windows(&mut bearish_windows, -1);
    bullish_windows.truncate(8);
    bearish_windows.truncate(8);
    let forward_returns = [5, 20, 60]
        .into_iter()
        .map(|days| {
            let value = window_metric(
                &prices,
                &start_indices,
                &selected_years,
                reference_month,
                reference_day,
                days,
            );
            SeasonalityForwardMetric {
                label: match days {
                    5 => "1 Woche",
                    20 => "4 Wochen",
                    _ => "13 Wochen",
                }
                .into(),
                trading_days: days,
                average_return: value.average_return,
                median_return: value.median_return,
                positive_ratio: value.positive_ratio,
                volatility: value.volatility,
                samples: value.samples,
            }
        })
        .collect();
    let annual_curve = annual_daily_curve(&selected);
    let trend_segments = trend_segments(&annual_curve);
    Ok(SeasonalityAnalysis {
        symbol: row.symbol,
        category: row.category,
        description: row.description,
        calculated_at: row.calculated_at,
        history_start,
        history_end,
        selected_years,
        quality_status: quality_status.into(),
        quality_reason,
        reference_date,
        annual_curve,
        trend_segments,
        months: period_metrics(&selected, false),
        quarters: period_metrics(&selected, true),
        forward_returns,
        selected_window,
        bullish_windows,
        bearish_windows,
        heatmap,
        data_source: row.data_source,
        data_source_url: row.data_source_url,
        native_timezone: row.native_timezone,
        missing_days: row.missing_days.max(0) as usize,
    })
}

fn filtered_years(
    years: &BTreeMap<i32, Vec<(NaiveDate, f64)>>,
    filter: &SeasonalityYearFilter,
) -> Vec<i32> {
    years
        .keys()
        .copied()
        .filter(|year| {
            let range = filter.start_year.is_none_or(|value| *year >= value)
                && filter.end_year.is_none_or(|value| *year <= value);
            let cycle = match (filter.cycle_years, filter.cycle_anchor_year) {
                (Some(interval), Some(anchor)) if interval >= 2 => {
                    (*year - anchor).rem_euclid(i32::from(interval)) == 0
                }
                _ => true,
            };
            let digit = filter.ending_digits.is_empty()
                || filter.ending_digits.contains(&(year.rem_euclid(10) as u8));
            let included = filter.include_years.is_empty() || filter.include_years.contains(year);
            range && cycle && digit && included && !filter.exclude_years.contains(year)
        })
        .collect()
}

fn current_reference_date() -> String {
    let today = Utc::now().date_naive();
    format!("{:02}-{:02}", today.month(), today.day())
}

fn parse_reference_date(value: &str) -> CommandResult<(u32, u32)> {
    let Some((month, day)) = value.trim().split_once('-') else {
        return Err(CommandError::validation(
            "Das Referenzdatum muss das Format MM-TT verwenden.",
        ));
    };
    let month = month.parse::<u32>().ok();
    let day = day.parse::<u32>().ok();
    match (month, day) {
        (Some(month), Some(day))
            if NaiveDate::from_ymd_opt(2000, month, day).is_some()
                && !(month == 2 && day == 29) =>
        {
            Ok((month, day))
        }
        _ => Err(CommandError::validation(
            "Bitte wÃ¤hle einen gÃ¼ltigen Kalendertag auÃŸer dem 29. Februar.",
        )),
    }
}

fn date_for_seasonal_day(day: u16) -> NaiveDate {
    NaiveDate::from_yo_opt(2001, u32::from(day)).expect("seasonal day is within a non-leap year")
}

fn annual_daily_curve(
    years: &BTreeMap<i32, Vec<(NaiveDate, f64)>>,
) -> Vec<SeasonalityDailyCurvePoint> {
    let mut curve: Vec<_> = (1..=365)
        .map(|day| {
            let mut values = Vec::new();
            for rows in years.values() {
                let base = rows.first().map(|(_, value)| *value);
                let value = rows
                    .iter()
                    .find(|(date, _)| seasonal_day(*date) >= day)
                    .map(|(_, value)| *value);
                if let (Some(base), Some(value)) = (base, value) {
                    values.push(value / base * 100.0);
                }
            }
            SeasonalityDailyCurvePoint {
                day,
                mean: mean(&values),
                smoothed_mean: None,
                samples: values.len(),
                median: percentile(&values, 0.5),
                p25: percentile(&values, 0.25),
                p75: percentile(&values, 0.75),
            }
        })
        .collect();
    for index in 0..curve.len() {
        let start = index.saturating_sub(7);
        let end = (index + 7).min(curve.len() - 1);
        curve[index].smoothed_mean = mean(
            &curve[start..=end]
                .iter()
                .filter_map(|point| point.mean)
                .collect::<Vec<_>>(),
        );
    }
    curve
}

fn trend_segments(curve: &[SeasonalityDailyCurvePoint]) -> Vec<SeasonalityTrendSegment> {
    let values: Vec<f64> = curve
        .iter()
        .filter_map(|point| point.smoothed_mean)
        .collect();
    if values.is_empty() {
        return Vec::new();
    }
    let (minimum, maximum) = values
        .iter()
        .fold((f64::INFINITY, f64::NEG_INFINITY), |(min, max), value| {
            (min.min(*value), max.max(*value))
        });
    let threshold = ((maximum - minimum) * 0.03).max(0.1);
    let phases: Vec<&str> = curve
        .iter()
        .enumerate()
        .map(|(index, point)| {
            let previous = index.checked_sub(14).and_then(|i| curve[i].smoothed_mean);
            match point
                .smoothed_mean
                .zip(previous)
                .map(|(now, before)| now - before)
            {
                Some(delta) if delta > threshold => "rising",
                Some(delta) if delta < -threshold => "falling",
                _ => "neutral",
            }
        })
        .collect();
    let mut output = Vec::new();
    let mut start = 0;
    for index in 1..=phases.len() {
        if index == phases.len() || phases[index] != phases[start] {
            output.push(SeasonalityTrendSegment {
                start_day: curve[start].day,
                end_day: curve[index - 1].day,
                phase: phases[start].into(),
            });
            start = index;
        }
    }
    output
}

fn seasonal_day(date: NaiveDate) -> u16 {
    let mut day = date.ordinal() as u16;
    if is_leap_year(date.year()) && date.month() > 2 {
        day -= 1;
    }
    if date.month() == 2 && date.day() == 29 {
        day = 59;
    }
    day
}

fn is_leap_year(year: i32) -> bool {
    year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)
}

fn seasonal_start_indices(prices: &[(NaiveDate, f64)]) -> BTreeMap<(i32, u16), usize> {
    let mut output = BTreeMap::new();
    let mut range_start = 0;
    while range_start < prices.len() {
        let year = prices[range_start].0.year();
        let mut range_end = range_start;
        while range_end < prices.len() && prices[range_end].0.year() == year {
            range_end += 1;
        }
        let mut index = range_start;
        for day in 1..=365_u16 {
            while index < range_end && seasonal_day(prices[index].0) < day {
                index += 1;
            }
            if index < range_end {
                output.insert((year, day), index);
            }
        }
        range_start = range_end;
    }
    output
}

fn window_metric(
    prices: &[(NaiveDate, f64)],
    start_indices: &BTreeMap<(i32, u16), usize>,
    years: &[i32],
    month: u32,
    day: u32,
    trading_days: usize,
) -> SeasonalityWindowMetric {
    let mut values = Vec::new();
    let mut sample_years = Vec::new();
    let mut year_returns = Vec::new();
    let calendar_day = NaiveDate::from_ymd_opt(2001, month, day)
        .expect("validated calendar date")
        .ordinal() as u16;
    for year in years {
        let Some(start) = start_indices.get(&(*year, calendar_day)).copied() else {
            continue;
        };
        let Some((_, end)) = prices.get(start + trading_days) else {
            continue;
        };
        let start_price = prices[start].1;
        let return_value = end / start_price - 1.0;
        values.push(return_value);
        sample_years.push(*year);
        year_returns.push(SeasonalityYearReturn {
            year: *year,
            return_value,
        });
    }
    let base = metric("window".into(), values.clone());
    let positive = values.iter().filter(|value| **value > 0.0).count();
    let negative = values.iter().filter(|value| **value < 0.0).count();
    let direction = base.median_return.and_then(|value| {
        if value > 0.0 {
            Some(1)
        } else if value < 0.0 {
            Some(-1)
        } else {
            None
        }
    });
    let directional_hits = if direction == Some(1) {
        positive
    } else {
        negative
    };
    SeasonalityWindowMetric {
        start_date: format!("{:02}-{:02}", month, day),
        trading_days,
        average_return: base.average_return,
        median_return: base.median_return,
        positive_ratio: (!values.is_empty()).then(|| positive as f64 / values.len() as f64),
        negative_ratio: (!values.is_empty()).then(|| negative as f64 / values.len() as f64),
        volatility: stddev(&values),
        p10: percentile(&values, 0.10),
        p90: percentile(&values, 0.90),
        samples: values.len(),
        years: sample_years,
        year_returns,
        direction,
        wilson_lower_bound: (values.len() >= MIN_RANKED_SAMPLES)
            .then(|| wilson_lower_bound(directional_hits, values.len())),
        quality_status: if values.len() >= MIN_RANKED_SAMPLES {
            "available"
        } else {
            "exploratory"
        }
        .into(),
    }
}

fn wilson_lower_bound(successes: usize, samples: usize) -> f64 {
    if samples == 0 {
        return 0.0;
    }
    let z = 1.959_963_984_540_054_f64;
    let n = samples as f64;
    let p = successes as f64 / n;
    (p + z * z / (2.0 * n) - z * ((p * (1.0 - p) + z * z / (4.0 * n)) / n).sqrt())
        / (1.0 + z * z / n)
}

fn sort_windows(values: &mut [SeasonalityWindowMetric], direction: i8) {
    values.sort_by(|left, right| compare_windows(left, right, direction));
}

fn compare_windows(
    left: &SeasonalityWindowMetric,
    right: &SeasonalityWindowMetric,
    direction: i8,
) -> Ordering {
    let left_wilson = directional_wilson(left, direction);
    let right_wilson = directional_wilson(right, direction);
    right_wilson
        .partial_cmp(&left_wilson)
        .unwrap_or(Ordering::Equal)
        .then_with(|| {
            directional_return(right, direction)
                .partial_cmp(&directional_return(left, direction))
                .unwrap_or(Ordering::Equal)
        })
        .then_with(|| right.samples.cmp(&left.samples))
}

fn directional_wilson(value: &SeasonalityWindowMetric, direction: i8) -> f64 {
    let ratio = if direction > 0 {
        value.positive_ratio
    } else {
        value.negative_ratio
    }
    .unwrap_or_default();
    wilson_lower_bound(
        (ratio * value.samples as f64).round() as usize,
        value.samples,
    )
}

fn directional_return(value: &SeasonalityWindowMetric, direction: i8) -> f64 {
    let median = value.median_return.unwrap_or_default() * f64::from(direction);
    median / value.volatility.unwrap_or(0.000_001).max(0.000_001)
}

fn ranking_value(value: Option<&SeasonalityWindowMetric>, direction: i8) -> f64 {
    value
        .filter(|metric| metric.samples >= MIN_RANKED_SAMPLES)
        .map(|metric| directional_wilson(metric, direction))
        .unwrap_or(-1.0)
}

fn calculate_profile(
    instrument: &MarketSymbol,
    candles: &[Candle],
    now: &str,
) -> SeasonalityAssetDetail {
    let mut rows: Vec<_> = candles
        .iter()
        .filter_map(|c| {
            Utc.timestamp_opt(c.time, 0)
                .single()
                .map(|date| (date.date_naive(), c.close))
        })
        .filter(|(_, close)| close.is_finite() && *close > 0.0)
        .collect();
    rows.sort_by_key(|(date, _)| *date);
    rows.dedup_by_key(|(date, _)| *date);
    let history_start = rows.first().map(|(date, _)| date.to_string());
    let history_end = rows.last().map(|(date, _)| date.to_string());
    let mut by_year: BTreeMap<i32, Vec<(chrono::NaiveDate, f64)>> = BTreeMap::new();
    for (date, close) in &rows {
        by_year
            .entry(date.year())
            .or_default()
            .push((*date, *close));
    }
    let complete: BTreeMap<_, _> = by_year
        .into_iter()
        .filter(|(_, values)| values.len() >= 180)
        .collect();
    let complete_years = complete.len();
    let quality_status = if rows.is_empty() {
        "unavailable"
    } else if complete_years < MIN_COMPLETE_YEARS {
        "insufficient_history"
    } else {
        "available"
    };
    let quality_reason = match quality_status { "available" => "Mindestens zehn vollständige Kalenderjahre aus BlackBull-MT5-D1-Historie.", "insufficient_history" => "Für eine bewertbare Seasonality werden mindestens zehn vollständige Kalenderjahre benötigt.", _ => "BlackBull liefert für dieses Asset keine nutzbare D1-Historie." }.into();
    let annual_curve = annual_curve(&complete);
    let months = period_metrics(&complete, false);
    let quarters = period_metrics(&complete, true);
    let forward_returns = [5, 20, 60]
        .into_iter()
        .map(|days| forward_metric(&complete, days))
        .collect::<Vec<_>>();
    let similar_years = similar_years(&complete);
    let four_week = forward_returns.iter().find(|item| item.trading_days == 20);
    let heatmap_signal = four_week.and_then(|item| {
        if complete_years >= MIN_COMPLETE_YEARS
            && item.samples >= MIN_COMPLETE_YEARS
            && item
                .average_return
                .zip(item.median_return)
                .is_some_and(|(mean, median)| mean.signum() == median.signum() && mean != 0.0)
        {
            match item.positive_ratio {
                Some(hit) if hit >= 0.60 => Some(1),
                Some(hit) if hit <= 0.40 => Some(-1),
                _ => None,
            }
        } else {
            None
        }
    });
    SeasonalityAssetDetail {
        symbol: instrument.symbol.clone(),
        category: instrument.category.clone(),
        description: instrument.description.clone(),
        base_currency: instrument.base_currency.clone(),
        quote_currency: instrument.quote_currency.clone(),
        calculated_at: now.into(),
        history_start,
        history_end,
        complete_years,
        quality_status: quality_status.into(),
        quality_reason,
        annual_curve,
        months,
        quarters,
        forward_returns,
        similar_years,
        heatmap_signal,
        data_source: "BlackBull MT5".into(),
        data_source_url: Some("https://www.blackbull.com".into()),
        native_timezone: None,
        missing_days: 0,
    }
}

fn annual_curve(
    years: &BTreeMap<i32, Vec<(chrono::NaiveDate, f64)>>,
) -> Vec<SeasonalityCurvePoint> {
    (1..=52)
        .map(|week| {
            let mut values = Vec::new();
            for rows in years.values() {
                let base = rows.first().map(|(_, v)| *v);
                let value = rows
                    .iter()
                    .filter(|(date, _)| date.iso_week().week() as u8 == week)
                    .next_back()
                    .map(|(_, v)| *v);
                if let (Some(base), Some(value)) = (base, value) {
                    values.push(value / base * 100.0);
                }
            }
            SeasonalityCurvePoint {
                week,
                mean: mean(&values),
                p25: percentile(&values, 0.25),
                p75: percentile(&values, 0.75),
            }
        })
        .collect()
}
fn period_metrics(
    years: &BTreeMap<i32, Vec<(chrono::NaiveDate, f64)>>,
    quarter: bool,
) -> Vec<SeasonalityPeriodMetric> {
    let count = if quarter { 4 } else { 12 };
    (1..=count)
        .map(|period| {
            let mut values = Vec::new();
            for rows in years.values() {
                let selected: Vec<_> = rows
                    .iter()
                    .filter(|(d, _)| {
                        if quarter {
                            ((d.month0() / 3) + 1) as usize == period
                        } else {
                            d.month() as usize == period
                        }
                    })
                    .collect();
                if let (Some(first), Some(last)) = (selected.first(), selected.last()) {
                    values.push(last.1 / first.1 - 1.0);
                }
            }
            metric(
                if quarter {
                    format!("Q{period}")
                } else {
                    format!("M{period:02}")
                },
                values,
            )
        })
        .collect()
}
fn forward_metric(
    years: &BTreeMap<i32, Vec<(chrono::NaiveDate, f64)>>,
    days: usize,
) -> SeasonalityForwardMetric {
    let today = Utc::now().date_naive();
    let mut values = Vec::new();
    for rows in years.values() {
        let start = rows
            .iter()
            .position(|(date, _)| date.month() == today.month() && date.day() >= today.day())
            .or_else(|| {
                rows.iter()
                    .position(|(date, _)| date.month() > today.month())
            });
        if let Some(index) = start
            && let Some((_, end)) = rows.get(index + days)
        {
            values.push(end / rows[index].1 - 1.0);
        }
    }
    let base = metric(
        if days == 5 {
            "1 Woche".into()
        } else if days == 20 {
            "4 Wochen".into()
        } else {
            "13 Wochen".into()
        },
        values.clone(),
    );
    SeasonalityForwardMetric {
        label: base.period,
        trading_days: days,
        average_return: base.average_return,
        median_return: base.median_return,
        positive_ratio: base.positive_ratio,
        volatility: stddev(&values),
        samples: base.samples,
    }
}
fn similar_years(
    years: &BTreeMap<i32, Vec<(chrono::NaiveDate, f64)>>,
) -> Vec<SeasonalitySimilarYear> {
    let current = Utc::now().year();
    let Some(current_rows) = years.get(&current) else {
        return Vec::new();
    };
    let current_values: Vec<_> = current_rows
        .iter()
        .map(|(_, v)| *v / current_rows[0].1)
        .collect();
    let mut result = years
        .iter()
        .filter(|(year, _)| **year != current)
        .filter_map(|(year, rows)| {
            let n = current_values.len().min(rows.len());
            if n < 8 {
                return None;
            };
            let values: Vec<_> = rows.iter().take(n).map(|(_, v)| *v / rows[0].1).collect();
            Some(SeasonalitySimilarYear {
                year: *year,
                correlation: correlation(&current_values[..n], &values),
                final_return: rows.last().map(|(_, v)| v / rows[0].1 - 1.0),
            })
        })
        .collect::<Vec<_>>();
    result.sort_by(|a, b| {
        b.correlation
            .partial_cmp(&a.correlation)
            .unwrap_or(Ordering::Equal)
    });
    result.truncate(3);
    result
}
fn metric(period: String, mut values: Vec<f64>) -> SeasonalityPeriodMetric {
    values.sort_by(|a, b| a.partial_cmp(b).unwrap_or(Ordering::Equal));
    let samples = values.len();
    SeasonalityPeriodMetric {
        period,
        average_return: mean(&values),
        median_return: percentile(&values, 0.5),
        positive_ratio: if samples > 0 {
            Some(values.iter().filter(|v| **v > 0.0).count() as f64 / samples as f64)
        } else {
            None
        },
        samples,
    }
}
fn mean(values: &[f64]) -> Option<f64> {
    (!values.is_empty()).then(|| values.iter().sum::<f64>() / values.len() as f64)
}
fn percentile(values: &[f64], p: f64) -> Option<f64> {
    if values.is_empty() {
        return None;
    }
    let mut sorted = values.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(Ordering::Equal));
    Some(sorted[((sorted.len() - 1) as f64 * p.clamp(0.0, 1.0)).round() as usize])
}
fn stddev(values: &[f64]) -> Option<f64> {
    let avg = mean(values)?;
    let n = values.len();
    (n > 1).then(|| (values.iter().map(|v| (v - avg).powi(2)).sum::<f64>() / (n - 1) as f64).sqrt())
}
fn correlation(left: &[f64], right: &[f64]) -> Option<f64> {
    if left.len() != right.len() || left.len() < 2 {
        return None;
    }
    let a = mean(left)?;
    let b = mean(right)?;
    let num: f64 = left.iter().zip(right).map(|(x, y)| (x - a) * (y - b)).sum();
    let den = (left.iter().map(|x| (x - a).powi(2)).sum::<f64>()
        * right.iter().map(|y| (y - b).powi(2)).sum::<f64>())
    .sqrt();
    (den > 0.0).then_some(num / den)
}
fn legacy_item(row: SeasonalityRow) -> SeasonalityItem {
    SeasonalityItem {
        asset: row.asset,
        symbol: row.symbol,
        horizon: row.horizon,
        sample_start: row.sample_start,
        sample_end: row.sample_end,
        average_return: row.average_return,
        positive_ratio: row.positive_ratio,
        samples: row.samples,
        signal: row.signal.map(|v| v.clamp(-1, 1) as i8),
        curve: serde_json::from_str(&row.curve_json).unwrap_or_default(),
    }
}
fn profile_detail(row: ProfileRow) -> Option<SeasonalityAssetDetail> {
    let mut detail: SeasonalityAssetDetail = serde_json::from_str(&row.profile_json).ok()?;
    detail.symbol = row.symbol;
    detail.category = row.category;
    detail.description = row.description;
    detail.base_currency = row.base_currency;
    detail.quote_currency = row.quote_currency;
    detail.calculated_at = row.calculated_at;
    detail.complete_years = row.complete_years.max(0) as usize;
    detail.quality_status = row.quality_status;
    detail.data_source = row.data_source;
    detail.data_source_url = row.data_source_url;
    detail.native_timezone = row.native_timezone;
    detail.missing_days = row.missing_days.max(0) as usize;
    Some(detail)
}
fn profile_summary(row: ProfileRow) -> Option<SeasonalityAssetSummary> {
    let detail = profile_detail(row)?;
    let four = detail
        .forward_returns
        .iter()
        .find(|item| item.trading_days == 20);
    Some(SeasonalityAssetSummary {
        symbol: detail.symbol,
        category: detail.category,
        description: detail.description,
        complete_years: detail.complete_years,
        quality_status: detail.quality_status,
        expected_four_week_return: four.and_then(|item| item.average_return),
        four_week_hit_rate: four.and_then(|item| item.positive_ratio),
        heatmap_signal: detail.heatmap_signal,
        calculated_at: detail.calculated_at,
        data_source: detail.data_source,
        data_source_url: detail.data_source_url,
        native_timezone: detail.native_timezone,
        missing_days: detail.missing_days,
    })
}

#[tauri::command]
pub async fn import_seasonality(
    state: State<'_, AppState>,
    input: SeasonalityImport,
) -> CommandResult<SeasonalityDashboard> {
    if input.source_name.trim().is_empty() {
        return Err(CommandError::validation("Datenquelle fehlt."));
    }
    if input.items.is_empty() {
        return Err(CommandError::validation(
            "Keine Seasonality-Daten vorhanden.",
        ));
    }
    let snapshot_id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let snapshot_at = input.snapshot_at.clone().unwrap_or_else(|| now.clone());
    let mut tx = state.db.begin().await.map_err(AppError::from)?;
    sqlx::query("INSERT INTO macro_snapshots (id,snapshot_at,imported_at,source_name,source_url,calculation_version,status) VALUES (?,?,?,?,?,'seasonality-v1','complete')").bind(&snapshot_id).bind(&snapshot_at).bind(&now).bind(input.source_name.trim()).bind(&input.source_url).execute(&mut *tx).await.map_err(AppError::from)?;
    for item in &input.items {
        if item.symbol.trim().is_empty() {
            continue;
        }
        sqlx::query("INSERT INTO seasonality_snapshots (id,macro_snapshot_id,asset,symbol,horizon,sample_start,sample_end,average_return,positive_ratio,samples,signal,curve_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(Uuid::new_v4().to_string()).bind(&snapshot_id).bind(item.asset.trim()).bind(item.symbol.trim().to_uppercase()).bind(&item.horizon).bind(&item.sample_start).bind(&item.sample_end).bind(&item.average_return).bind(&item.positive_ratio).bind(item.samples).bind(item.signal.map(i64::from)).bind(serde_json::to_string(&item.curve).unwrap_or_else(|_|"[]".into())).execute(&mut *tx).await.map_err(AppError::from)?;
    }
    tx.commit().await.map_err(AppError::from)?;
    get_seasonality(state).await
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn seasonal_signal_requires_quality_and_agreement() {
        let values = vec![0.01, 0.02, 0.03, 0.01, 0.02];
        let result = metric("x".into(), values);
        assert_eq!(result.positive_ratio, Some(1.0));
    }
    #[test]
    fn correlation_matches_identical_paths() {
        assert_eq!(correlation(&[1.0, 2.0, 3.0], &[2.0, 4.0, 6.0]), Some(1.0));
    }

    #[test]
    fn dukascopy_backfill_uses_fifteen_completed_years_only() {
        assert_eq!(completed_year_bounds(2026, Some(2000)), Some((2011, 2025)));
        assert_eq!(completed_year_bounds(2026, Some(2020)), Some((2020, 2025)));
        assert_eq!(completed_year_bounds(2026, Some(2026)), None);
    }

    #[test]
    fn dukascopy_retry_backoff_is_bounded_and_exponential() {
        assert_eq!(dukascopy_retry_delay_minutes(1), 30);
        assert_eq!(dukascopy_retry_delay_minutes(2), 60);
        assert_eq!(dukascopy_retry_delay_minutes(6), 960);
        assert_eq!(dukascopy_retry_delay_minutes(20), 1_440);
    }

    #[test]
    fn year_filter_intersects_cycle_digits_and_explicit_choices() {
        let mut years = BTreeMap::new();
        for year in [2016, 2020, 2024, 2028] {
            years.insert(year, Vec::new());
        }
        let filter = SeasonalityYearFilter {
            cycle_years: Some(4),
            cycle_anchor_year: Some(2024),
            ending_digits: vec![0, 4],
            include_years: vec![2020, 2024],
            exclude_years: vec![2020],
            ..Default::default()
        };
        assert_eq!(filtered_years(&years, &filter), vec![2024]);
    }

    #[test]
    fn window_uses_next_trading_days_across_year_boundary() {
        let rows = vec![
            (NaiveDate::from_ymd_opt(2020, 12, 30).unwrap(), 100.0),
            (NaiveDate::from_ymd_opt(2020, 12, 31).unwrap(), 101.0),
            (NaiveDate::from_ymd_opt(2021, 1, 4).unwrap(), 102.0),
            (NaiveDate::from_ymd_opt(2021, 1, 5).unwrap(), 103.0),
        ];
        let metric = window_metric(&rows, &seasonal_start_indices(&rows), &[2020], 12, 31, 2);
        assert_eq!(metric.samples, 1);
        assert_eq!(metric.years, vec![2020]);
        assert_eq!(metric.average_return, Some(103.0 / 101.0 - 1.0));
    }

    #[test]
    fn wilson_penalizes_small_perfect_samples() {
        assert!(wilson_lower_bound(5, 5) > 0.5);
        assert!(wilson_lower_bound(5, 5) < wilson_lower_bound(20, 20));
    }

    #[test]
    fn annual_curve_carries_weekends_to_the_next_available_close() {
        let mut years = BTreeMap::new();
        years.insert(
            2024,
            vec![
                (NaiveDate::from_ymd_opt(2024, 1, 2).unwrap(), 100.0),
                (NaiveDate::from_ymd_opt(2024, 1, 5).unwrap(), 105.0),
                (NaiveDate::from_ymd_opt(2024, 1, 8).unwrap(), 110.0),
            ],
        );
        let curve = annual_daily_curve(&years);
        assert_eq!(curve[0].mean, Some(100.0));
        assert!((curve[5].mean.unwrap() - 110.0).abs() < 0.000_001);
        assert_eq!(curve[5].samples, 1);
    }

    #[test]
    fn trend_segments_identify_a_sustained_building_phase() {
        let curve = (1..=40)
            .map(|day| SeasonalityDailyCurvePoint {
                day,
                mean: Some(100.0 + f64::from(day)),
                smoothed_mean: Some(100.0 + f64::from(day)),
                samples: 6,
                median: None,
                p25: None,
                p75: None,
            })
            .collect::<Vec<_>>();
        assert!(
            trend_segments(&curve)
                .iter()
                .any(|segment| segment.phase == "rising")
        );
    }
}
