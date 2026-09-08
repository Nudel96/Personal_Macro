use std::{cmp::Ordering, collections::BTreeMap};

use chrono::{Datelike, NaiveDate, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use tauri::State;
use uuid::Uuid;

use crate::{
    commands::eodhd_prices,
    database::AppState,
    errors::{AppError, CommandError, CommandResult},
};

const MIN_COMPLETE_YEARS: usize = 10;
const EODHD_SOURCE_NAME: &str = "EODHD Historical Market Data";
const EODHD_SOURCE_URL: &str =
    "https://eodhd.com/financial-apis/api-for-historical-data-and-volumes";
const SCHEDULED_SYNC_BATCH_SIZE: usize = 3;
const INITIAL_SYNC_BATCH_SIZE: usize = 8;
const MANUAL_SYNC_BATCH_SIZE: usize = 8;

#[derive(Debug, Clone)]
struct MarketSymbol {
    symbol: String,
    description: Option<String>,
    category: String,
    base_currency: Option<String>,
    quote_currency: Option<String>,
}

#[derive(Debug, Clone)]
struct Candle {
    time: i64,
    close: f64,
}

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
    pub collection_completed: usize,
    pub collection_total: usize,
    pub last_synced_at: Option<String>,
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

#[derive(Debug, Clone, FromRow)]
struct ProfileRow {
    provider_symbol: String,
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
        "SELECT pi.provider_symbol,pi.display_symbol AS symbol,pi.category,pi.description,pi.base_currency,pi.quote_currency,pp.calculated_at,pp.complete_years,pp.quality_status,pp.profile_json,'EODHD Historical Market Data' AS data_source,'https://eodhd.com/financial-apis/api-for-historical-data-and-volumes' AS data_source_url,pi.native_timezone,pp.missing_days FROM seasonality_provider_profiles pp JOIN seasonality_provider_instruments pi ON pi.provider=pp.provider AND pi.provider_symbol=pp.provider_symbol WHERE pp.provider='eodhd' ORDER BY pi.category,pi.display_symbol",
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
    sqlx::query_as("SELECT pi.provider_symbol,pi.display_symbol AS symbol,pi.category,pi.description,pi.base_currency,pi.quote_currency,pp.calculated_at,pp.complete_years,pp.quality_status,pp.profile_json,'EODHD Historical Market Data' AS data_source,'https://eodhd.com/financial-apis/api-for-historical-data-and-volumes' AS data_source_url,pi.native_timezone,pp.missing_days FROM seasonality_provider_profiles pp JOIN seasonality_provider_instruments pi ON pi.provider=pp.provider AND pi.provider_symbol=pp.provider_symbol WHERE pp.provider='eodhd' AND (lower(pi.display_symbol)=lower(?) OR lower(pi.provider_symbol)=lower(?))")
        .bind(symbol).bind(symbol).fetch_optional(&state.db).await.map_err(AppError::from).map_err(CommandError::from)
}

async fn profile_candles(state: &AppState, row: &ProfileRow) -> CommandResult<Vec<(i64, f64)>> {
    sqlx::query_as("SELECT candle_time / 1000,mid_close FROM seasonality_provider_daily_candles WHERE provider='eodhd' AND provider_symbol=? ORDER BY candle_time")
        .bind(&row.provider_symbol)
        .fetch_all(&state.db)
        .await
        .map_err(AppError::from)
        .map_err(CommandError::from)
}

#[tauri::command]
pub async fn get_seasonality(state: State<'_, AppState>) -> CommandResult<SeasonalityDashboard> {
    let assets = provider_profile_rows(&state).await?;
    let latest_profile_at: Option<String> = sqlx::query_scalar(
        "SELECT MAX(calculated_at) FROM seasonality_provider_profiles WHERE provider='eodhd'",
    )
    .fetch_one(&state.db)
    .await
    .map_err(AppError::from)?;
    let collection_total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM seasonality_provider_instruments WHERE provider='eodhd'",
    )
    .fetch_one(&state.db)
    .await
    .map_err(AppError::from)?;
    let collection_completed: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM seasonality_provider_profiles WHERE provider='eodhd'",
    )
    .fetch_one(&state.db)
    .await
    .map_err(AppError::from)?;
    let last_synced_at: Option<String> = sqlx::query_scalar(
        "SELECT MAX(completed_at) FROM seasonality_provider_sync_runs WHERE provider='eodhd' AND status='complete'",
    )
    .fetch_one(&state.db)
    .await
    .map_err(AppError::from)?;
    let mut assets = assets;
    assets.sort_by(|left, right| {
        left.category
            .cmp(&right.category)
            .then(left.symbol.cmp(&right.symbol))
    });
    let collection: Option<(String, Option<String>)> = sqlx::query_as(
        "SELECT status,error_message FROM seasonality_provider_sync_runs WHERE provider='eodhd' ORDER BY started_at DESC LIMIT 1",
    )
    .fetch_optional(&state.db)
    .await
    .map_err(AppError::from)?;
    let assets = assets.into_iter().filter_map(profile_summary).collect();
    Ok(SeasonalityDashboard {
        snapshot_at: latest_profile_at.clone(),
        source_name: Some(EODHD_SOURCE_NAME.into()),
        source_url: Some(EODHD_SOURCE_URL.into()),
        items: Vec::new(),
        assets,
        collection_status: collection.as_ref().map(|value| value.0.clone()),
        collection_error: collection.and_then(|value| value.1),
        collection_completed: collection_completed.max(0) as usize,
        collection_total: collection_total.max(0) as usize,
        last_synced_at,
        data_version: format!(
            "{}:{}",
            latest_profile_at.unwrap_or_else(|| "empty".into()),
            collection_completed.max(0)
        ),
    })
}

#[tauri::command]
pub async fn get_seasonality_asset_detail(
    state: State<'_, AppState>,
    symbol: String,
) -> CommandResult<SeasonalityAssetDetail> {
    let row = profile_row_for_symbol(&state, symbol.trim()).await?;
    row.and_then(profile_detail).ok_or_else(|| {
        CommandError::validation("Für dieses Asset wurde noch keine Seasonality berechnet.")
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
            "Bitte wähle ein Seasonality-Asset aus.",
        ));
    }
    let row = profile_row_for_symbol(&state, &symbol).await?;
    let row = row.ok_or_else(|| {
        CommandError::validation(
            "Für dieses Asset wurde noch keine lokale D1-Historie gespeichert.",
        )
    })?;
    let candles = profile_candles(&state, &row).await?;
    analysis_from_candles(row, &candles, input)
}

#[tauri::command]
pub async fn get_seasonality_screener(
    state: State<'_, AppState>,
) -> CommandResult<Vec<SeasonalityScreenerRow>> {
    let profiles = provider_profile_rows(&state).await?;
    let mut output = Vec::with_capacity(profiles.len());
    for row in profiles {
        let candles = profile_candles(&state, &row).await?;
        if let Some((bullish_window, bearish_window)) = screener_windows(&candles) {
            output.push(SeasonalityScreenerRow {
                symbol: row.symbol.clone(),
                category: row.category.clone(),
                description: row.description.clone(),
                complete_years: row.complete_years.max(0) as usize,
                quality_status: row.quality_status.clone(),
                bullish_window,
                bearish_window,
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

fn screener_windows(
    candles: &[(i64, f64)],
) -> Option<(
    Option<SeasonalityWindowMetric>,
    Option<SeasonalityWindowMetric>,
)> {
    let mut prices = candles
        .iter()
        .filter_map(|(time, close)| {
            Utc.timestamp_opt(*time, 0)
                .single()
                .map(|value| (value.date_naive(), *close))
        })
        .filter(|(_, close)| close.is_finite() && *close > 0.0)
        .collect::<Vec<_>>();
    prices.sort_by_key(|(date, _)| *date);
    prices.dedup_by_key(|(date, _)| *date);
    if prices.is_empty() {
        return None;
    }
    let mut by_year: BTreeMap<i32, Vec<(NaiveDate, f64)>> = BTreeMap::new();
    for value in &prices {
        by_year.entry(value.0.year()).or_default().push(*value);
    }
    let years = by_year
        .iter()
        .filter(|(year, values)| is_complete_calendar_year(**year, values))
        .map(|(year, _)| *year)
        .collect::<Vec<_>>();
    if years.len() < MIN_RANKED_SAMPLES {
        return Some((None, None));
    }
    let start_indices = seasonal_start_indices(&prices);
    let mut bullish = Vec::new();
    let mut bearish = Vec::new();
    for day in (1..=365_u16).step_by(7) {
        let date = date_for_seasonal_day(day);
        for trading_days in [5, 10, 20, 30, 40, 60, 90] {
            let metric = window_metric(
                &prices,
                &start_indices,
                &years,
                date.month(),
                date.day(),
                trading_days,
            );
            if metric.samples < MIN_RANKED_SAMPLES {
                continue;
            }
            match metric.direction {
                Some(1) => bullish.push(metric),
                Some(-1) => bearish.push(metric),
                _ => {}
            }
        }
    }
    sort_windows(&mut bullish, 1);
    sort_windows(&mut bearish, -1);
    Some((bullish.into_iter().next(), bearish.into_iter().next()))
}

#[tauri::command]
pub async fn get_seasonality_forex_pairs(
    state: State<'_, AppState>,
) -> CommandResult<Vec<SeasonalityForexPair>> {
    let rows: Vec<ProfileRow> = sqlx::query_as("SELECT pi.provider_symbol,pi.display_symbol AS symbol,pi.category,pi.description,pi.base_currency,pi.quote_currency,pp.calculated_at,pp.complete_years,pp.quality_status,pp.profile_json,'EODHD Historical Market Data' AS data_source,'https://eodhd.com/financial-apis/api-for-historical-data-and-volumes' AS data_source_url,pi.native_timezone,pp.missing_days FROM seasonality_provider_profiles pp JOIN seasonality_provider_instruments pi ON pi.provider=pp.provider AND pi.provider_symbol=pp.provider_symbol WHERE pp.provider='eodhd' AND pi.category='Forex'")
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

pub async fn scheduled_seasonality_sync(state: &AppState) -> CommandResult<()> {
    let Some(api_key) = eodhd_prices::api_key() else {
        return Ok(());
    };
    release_stale_eodhd_runs(state).await?;
    let running: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM seasonality_provider_sync_runs WHERE provider='eodhd' AND status='running'",
    )
    .fetch_one(&state.db)
    .await
    .map_err(AppError::from)?;
    if running > 0 {
        return Ok(());
    }
    let client = eodhd_prices::http_client()?;
    let (catalogued, completed): (i64, i64) = sqlx::query_as(
        "SELECT (SELECT COUNT(*) FROM seasonality_provider_instruments WHERE provider='eodhd'),(SELECT COUNT(*) FROM seasonality_provider_profiles WHERE provider='eodhd')",
    )
    .fetch_one(&state.db)
    .await
    .map_err(AppError::from)?;
    let batch_size = if catalogued > completed {
        INITIAL_SYNC_BATCH_SIZE
    } else {
        SCHEDULED_SYNC_BATCH_SIZE
    };
    if let Err(error) = sync_eodhd_batch(state, &client, &api_key, batch_size, "scheduler").await {
        tracing::warn!(code = %error.code, "EODHD-Seasonality-Sync wird später erneut versucht");
    }
    Ok(())
}

#[tauri::command]
pub async fn refresh_seasonality_data(
    state: State<'_, AppState>,
) -> CommandResult<SeasonalityDashboard> {
    let api_key = eodhd_prices::api_key().ok_or_else(|| {
        CommandError::validation("EODHD_API_KEY ist im nativen Backend nicht konfiguriert.")
    })?;
    release_stale_eodhd_runs(&state).await?;
    let running: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM seasonality_provider_sync_runs WHERE provider='eodhd' AND status='running'",
    )
    .fetch_one(&state.db)
    .await
    .map_err(AppError::from)?;
    if running > 0 {
        return Err(CommandError {
            code: "CONFLICT".into(),
            message: "Eine EODHD-Seasonality-Aktualisierung läuft bereits.".into(),
            details: None,
        });
    }
    let client = eodhd_prices::http_client()?;
    sync_eodhd_batch(&state, &client, &api_key, MANUAL_SYNC_BATCH_SIZE, "manual").await?;
    get_seasonality(state).await
}

pub(crate) async fn refresh_eodhd_symbol(
    state: &AppState,
    symbol: &str,
    trigger: &str,
) -> CommandResult<()> {
    let api_key = eodhd_prices::api_key().ok_or_else(|| {
        CommandError::validation("EODHD_API_KEY ist im nativen Backend nicht konfiguriert.")
    })?;
    release_stale_eodhd_runs(state).await?;
    let running: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM seasonality_provider_sync_runs WHERE provider='eodhd' AND status='running'",
    )
    .fetch_one(&state.db)
    .await
    .map_err(AppError::from)?;
    if running > 0 {
        return Err(CommandError {
            code: "CONFLICT".into(),
            message: "Eine EODHD-Marktdatenaktualisierung läuft bereits.".into(),
            details: None,
        });
    }
    let client = eodhd_prices::http_client()?;
    ensure_eodhd_catalog(state, &client, &api_key, trigger).await?;
    let normalized = symbol.trim().replace('/', "").to_ascii_lowercase();
    let instrument: Option<ProviderInstrumentRow> = sqlx::query_as(
        "SELECT provider_symbol,display_symbol,category,description,base_currency,
                quote_currency,data_kind,COALESCE(source_code,provider_symbol) AS source_code,
                native_timezone
         FROM seasonality_provider_instruments
         WHERE provider='eodhd'
           AND (LOWER(REPLACE(display_symbol,'/',''))=?
                OR LOWER(provider_symbol)=?)
         ORDER BY sync_priority,provider_symbol LIMIT 1",
    )
    .bind(&normalized)
    .bind(format!("{normalized}.forex"))
    .fetch_optional(&state.db)
    .await
    .map_err(AppError::from)?;
    let instrument = instrument.ok_or_else(|| {
        CommandError::validation(format!(
            "EODHD stellt für {symbol} im aktuellen Instrumentenkatalog keine Historie bereit."
        ))
    })?;
    sync_eodhd_instrument(state, &client, &api_key, instrument, trigger).await
}

async fn release_stale_eodhd_runs(state: &AppState) -> CommandResult<()> {
    let completed_at = Utc::now().to_rfc3339();
    let cutoff = (Utc::now() - chrono::Duration::minutes(10)).to_rfc3339();
    sqlx::query("UPDATE seasonality_provider_sync_runs SET status='failed',completed_at=?,error_message='Unterbrochene EODHD-Seasonality-Aktualisierung wurde freigegeben.' WHERE provider='eodhd' AND status='running' AND started_at<?")
        .bind(completed_at)
        .bind(cutoff)
        .execute(&state.db)
        .await
        .map_err(AppError::from)?;
    Ok(())
}

#[derive(Debug, Clone, FromRow)]
struct ProviderInstrumentRow {
    provider_symbol: String,
    display_symbol: String,
    category: String,
    description: Option<String>,
    base_currency: Option<String>,
    quote_currency: Option<String>,
    data_kind: String,
    source_code: String,
    native_timezone: Option<String>,
}

#[derive(Debug, Clone, FromRow)]
struct LegacyProviderInstrumentRow {
    provider_symbol: String,
    category: String,
    description: Option<String>,
    base_currency: Option<String>,
}

async fn sync_eodhd_batch(
    state: &AppState,
    client: &reqwest::Client,
    api_key: &str,
    batch_size: usize,
    trigger: &str,
) -> CommandResult<()> {
    ensure_eodhd_catalog(state, client, api_key, trigger).await?;
    for _ in 0..batch_size {
        let Some(instrument) = next_eodhd_instrument(state).await? else {
            break;
        };
        if let Err(error) = sync_eodhd_instrument(state, client, api_key, instrument, trigger).await
        {
            tracing::warn!(code = %error.code, "Ein EODHD-Seasonality-Asset konnte nicht aktualisiert werden");
        }
    }
    Ok(())
}

async fn ensure_eodhd_catalog(
    state: &AppState,
    client: &reqwest::Client,
    api_key: &str,
    trigger: &str,
) -> CommandResult<()> {
    let catalogued: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM seasonality_provider_instruments WHERE provider='eodhd'",
    )
    .fetch_one(&state.db)
    .await
    .map_err(AppError::from)?;
    if catalogued > 0 {
        return Ok(());
    }
    let legacy: Vec<LegacyProviderInstrumentRow> = sqlx::query_as(
        "SELECT provider_symbol,category,description,base_currency FROM seasonality_provider_instruments WHERE provider='dukascopy' ORDER BY category,provider_symbol",
    )
    .fetch_all(&state.db)
    .await
    .map_err(AppError::from)?;
    let legacy = legacy
        .into_iter()
        .map(|item| eodhd_prices::LegacyInstrument {
            provider_symbol: item.provider_symbol,
            category: item.category,
            description: item.description,
            base_currency: item.base_currency,
        })
        .collect::<Vec<_>>();
    let run_id = Uuid::new_v4().to_string();
    let started_at = Utc::now().to_rfc3339();
    sqlx::query("INSERT INTO seasonality_provider_sync_runs(id,provider,trigger,provider_symbol,started_at,status) VALUES(?,'eodhd',?,NULL,?,'running')")
        .bind(&run_id).bind(trigger).bind(&started_at).execute(&state.db).await.map_err(AppError::from)?;
    let instruments = match eodhd_prices::catalog(client, api_key, &legacy).await {
        Ok(value) => value,
        Err(error) => {
            finish_eodhd_run(state, &run_id, "failed", 0, 0, Some(&error.message)).await?;
            return Err(error);
        }
    };
    let now = Utc::now().to_rfc3339();
    let mut tx = state.db.begin().await.map_err(AppError::from)?;
    for instrument in &instruments {
        sqlx::query("INSERT INTO seasonality_provider_instruments(provider,provider_symbol,display_symbol,category,description,base_currency,quote_currency,earliest_daily_at,native_timezone,last_catalogued_at,data_kind,source_code,sync_priority) VALUES('eodhd',?,?,?,?,?,?,NULL,?,?,?,?,?) ON CONFLICT(provider,provider_symbol) DO UPDATE SET display_symbol=excluded.display_symbol,category=excluded.category,description=excluded.description,base_currency=excluded.base_currency,quote_currency=excluded.quote_currency,native_timezone=excluded.native_timezone,last_catalogued_at=excluded.last_catalogued_at,data_kind=excluded.data_kind,source_code=excluded.source_code,sync_priority=excluded.sync_priority")
            .bind(&instrument.provider_symbol)
            .bind(&instrument.display_symbol)
            .bind(&instrument.category)
            .bind(&instrument.description)
            .bind(&instrument.base_currency)
            .bind(&instrument.quote_currency)
            .bind(&instrument.native_timezone)
            .bind(&now)
            .bind(&instrument.data_kind)
            .bind(&instrument.source_code)
            .bind(instrument.sync_priority)
            .execute(&mut *tx)
            .await
            .map_err(AppError::from)?;
    }
    tx.commit().await.map_err(AppError::from)?;
    finish_eodhd_run(state, &run_id, "complete", 0, instruments.len(), None).await
}

async fn next_eodhd_instrument(state: &AppState) -> CommandResult<Option<ProviderInstrumentRow>> {
    let cutoff = (Utc::now() - chrono::Duration::hours(24)).to_rfc3339();
    let now = Utc::now().to_rfc3339();
    sqlx::query_as("SELECT pi.provider_symbol,pi.display_symbol,pi.category,pi.description,pi.base_currency,pi.quote_currency,pi.data_kind,COALESCE(pi.source_code,pi.provider_symbol) AS source_code,pi.native_timezone FROM seasonality_provider_instruments pi LEFT JOIN seasonality_provider_profiles pp ON pp.provider=pi.provider AND pp.provider_symbol=pi.provider_symbol WHERE pi.provider='eodhd' AND (pp.calculated_at IS NULL OR pp.calculated_at < ?) AND NOT EXISTS (SELECT 1 FROM seasonality_provider_retry_state retry WHERE retry.provider=pi.provider AND retry.provider_symbol=pi.provider_symbol AND retry.next_retry_at>?) ORDER BY pp.calculated_at IS NOT NULL,pi.sync_priority,pp.calculated_at,pi.category,pi.provider_symbol LIMIT 1")
        .bind(cutoff).bind(now).fetch_optional(&state.db).await.map_err(AppError::from).map_err(CommandError::from)
}

async fn sync_eodhd_instrument(
    state: &AppState,
    client: &reqwest::Client,
    api_key: &str,
    instrument: ProviderInstrumentRow,
    trigger: &str,
) -> CommandResult<()> {
    let run_id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    sqlx::query("INSERT INTO seasonality_provider_sync_runs(id,provider,trigger,provider_symbol,started_at,status) VALUES(?,'eodhd',?,?,?,'running')")
        .bind(&run_id).bind(trigger).bind(&instrument.provider_symbol).bind(&now).execute(&state.db).await.map_err(AppError::from)?;
    let provider_instrument = eodhd_prices::EodhdInstrument {
        provider_symbol: instrument.provider_symbol.clone(),
        display_symbol: instrument.display_symbol.clone(),
        category: instrument.category.clone(),
        description: instrument.description.clone(),
        base_currency: instrument.base_currency.clone(),
        quote_currency: instrument.quote_currency.clone(),
        data_kind: instrument.data_kind.clone(),
        source_code: instrument.source_code.clone(),
        sync_priority: 0,
        native_timezone: instrument
            .native_timezone
            .clone()
            .unwrap_or_else(|| "EODHD provider-native trading date".into()),
    };
    let mut fetched = 0_usize;
    let mut requested_years = 0_usize;
    let result: CommandResult<()> = async {
        let mut bars = eodhd_prices::history(client, api_key, &provider_instrument).await?;
        bars.sort_by_key(|bar| bar.time);
        bars.dedup_by_key(|bar| bar.time);
        fetched = bars.len();
        requested_years = bars
            .iter()
            .filter_map(|bar| Utc.timestamp_millis_opt(bar.time).single().map(|value| value.year()))
            .collect::<std::collections::BTreeSet<_>>()
            .len();
        let prices = bars
            .iter()
            .map(|bar| (bar.time, bar.close))
            .collect::<Vec<_>>();
        let candles = bars
            .iter()
            .map(|bar| Candle {
                time: bar.time / 1000,
                close: bar.close,
            })
            .collect::<Vec<_>>();
        let market = MarketSymbol { symbol: instrument.display_symbol.clone(), description: instrument.description.clone(), category: instrument.category.clone(), base_currency: instrument.base_currency.clone(), quote_currency: instrument.quote_currency.clone() };
        let mut detail = calculate_profile(&market, &candles, &now);
        detail.data_source = EODHD_SOURCE_NAME.into();
        detail.data_source_url = Some(EODHD_SOURCE_URL.into());
        detail.native_timezone = instrument.native_timezone.clone();
        detail.missing_days = count_data_gaps(&prices);
        detail.quality_reason = if detail.complete_years >= MIN_COMPLETE_YEARS { "Mindestens zehn vollständige Jahre aus EODHD-D1-Historie. Adjusted Close wird verwendet, wenn EODHD ihn bereitstellt.".into() } else { "EODHD liefert für dieses Asset weniger als zehn vollständige D1-Jahre; die Analyse bleibt explorativ.".into() };
        let mut tx = state.db.begin().await.map_err(AppError::from)?;
        sqlx::query("DELETE FROM seasonality_provider_daily_candles WHERE provider='eodhd' AND provider_symbol=?")
            .bind(&instrument.provider_symbol).execute(&mut *tx).await.map_err(AppError::from)?;
        for bar in &bars {
            sqlx::query("INSERT INTO seasonality_provider_daily_candles(provider,provider_symbol,candle_time,bid_open,bid_high,bid_low,bid_close,ask_open,ask_high,ask_low,ask_close,mid_close,volume,fetched_at) VALUES('eodhd',?,?,?,?,?,?,?,?,?,?,?,?,?)")
                .bind(&instrument.provider_symbol).bind(bar.time).bind(bar.open).bind(bar.high).bind(bar.low).bind(bar.close).bind(bar.open).bind(bar.high).bind(bar.low).bind(bar.close).bind(bar.close).bind(bar.volume).bind(&now)
                .execute(&mut *tx).await.map_err(AppError::from)?;
        }
        sqlx::query("INSERT INTO seasonality_provider_profiles(provider,provider_symbol,calculated_at,history_start,history_end,complete_years,quality_status,missing_days,profile_json) VALUES('eodhd',?,?,?,?,?,?,?,?) ON CONFLICT(provider,provider_symbol) DO UPDATE SET calculated_at=excluded.calculated_at,history_start=excluded.history_start,history_end=excluded.history_end,complete_years=excluded.complete_years,quality_status=excluded.quality_status,missing_days=excluded.missing_days,profile_json=excluded.profile_json")
            .bind(&instrument.provider_symbol).bind(&detail.calculated_at).bind(&detail.history_start).bind(&detail.history_end).bind(detail.complete_years as i64).bind(&detail.quality_status).bind(detail.missing_days as i64).bind(serde_json::to_string(&detail).unwrap_or_else(|_| "{}".into()))
            .execute(&mut *tx).await.map_err(AppError::from)?;
        if let Some(first) = bars.first() {
            sqlx::query("UPDATE seasonality_provider_instruments SET earliest_daily_at=? WHERE provider='eodhd' AND provider_symbol=?")
                .bind(first.time).bind(&instrument.provider_symbol).execute(&mut *tx).await.map_err(AppError::from)?;
        }
        tx.commit().await.map_err(AppError::from)?;
        Ok(())
    }.await;
    let (status, error) = match result {
        Ok(()) => ("complete", None),
        Err(error) => ("failed", Some(error.message)),
    };
    finish_eodhd_run(
        state,
        &run_id,
        status,
        requested_years,
        fetched,
        error.as_deref(),
    )
    .await?;
    if status == "failed" {
        record_eodhd_retry(
            state,
            &instrument.provider_symbol,
            error
                .as_deref()
                .unwrap_or("EODHD-Seasonality-Synchronisierung fehlgeschlagen."),
        )
        .await
        .map_err(CommandError::from)?;
        return Err(CommandError::validation(error.unwrap_or_else(|| {
            "EODHD-Seasonality-Synchronisierung fehlgeschlagen.".into()
        })));
    }
    clear_eodhd_retry(state, &instrument.provider_symbol)
        .await
        .map_err(CommandError::from)?;
    Ok(())
}

async fn finish_eodhd_run(
    state: &AppState,
    run_id: &str,
    status: &str,
    requested_years: usize,
    fetched_candles: usize,
    error: Option<&str>,
) -> CommandResult<()> {
    sqlx::query("UPDATE seasonality_provider_sync_runs SET completed_at=?,status=?,requested_years=?,fetched_candles=?,error_message=? WHERE id=?")
        .bind(Utc::now().to_rfc3339())
        .bind(status)
        .bind(requested_years as i64)
        .bind(fetched_candles as i64)
        .bind(error.map(|value| value.chars().take(500).collect::<String>()))
        .bind(run_id)
        .execute(&state.db)
        .await
        .map_err(AppError::from)?;
    Ok(())
}

fn eodhd_retry_delay_minutes(consecutive_failures: i64) -> i64 {
    let exponent = consecutive_failures.saturating_sub(1).clamp(0, 6) as u32;
    (30_i64.saturating_mul(2_i64.pow(exponent))).min(1_440)
}

fn eodhd_error_code(message: &str) -> &'static str {
    let normalized = message.to_ascii_lowercase();
    if normalized.contains("timeout") || normalized.contains("timed out") {
        "network_timeout"
    } else if normalized.contains("429") || normalized.contains("rate limit") {
        "rate_limited"
    } else if normalized.contains("keine nutzbare") || normalized.contains("historie") {
        "history_unavailable"
    } else {
        "provider_error"
    }
}

async fn record_eodhd_retry(
    state: &AppState,
    provider_symbol: &str,
    message: &str,
) -> Result<(), AppError> {
    let previous: Option<i64> = sqlx::query_scalar(
        "SELECT consecutive_failures FROM seasonality_provider_retry_state WHERE provider='eodhd' AND provider_symbol=?",
    )
    .bind(provider_symbol)
    .fetch_optional(&state.db)
    .await?;
    let failures = previous.unwrap_or(0).saturating_add(1);
    let now = Utc::now();
    let next_retry = now + chrono::Duration::minutes(eodhd_retry_delay_minutes(failures));
    sqlx::query(
        "INSERT INTO seasonality_provider_retry_state(provider,provider_symbol,consecutive_failures,next_retry_at,last_error_code,last_error_message,updated_at) VALUES('eodhd',?,?,?,?,?,?) ON CONFLICT(provider,provider_symbol) DO UPDATE SET consecutive_failures=excluded.consecutive_failures,next_retry_at=excluded.next_retry_at,last_error_code=excluded.last_error_code,last_error_message=excluded.last_error_message,updated_at=excluded.updated_at",
    )
    .bind(provider_symbol)
    .bind(failures)
    .bind(next_retry.to_rfc3339())
    .bind(eodhd_error_code(message))
    .bind(message.chars().take(500).collect::<String>())
    .bind(now.to_rfc3339())
    .execute(&state.db)
    .await?;
    Ok(())
}

async fn clear_eodhd_retry(state: &AppState, provider_symbol: &str) -> Result<(), AppError> {
    sqlx::query(
        "DELETE FROM seasonality_provider_retry_state WHERE provider='eodhd' AND provider_symbol=?",
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
            "Für dieses Asset ist keine nutzbare lokale D1-Historie vorhanden.",
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
        .filter(|(year, values)| is_complete_calendar_year(*year, values))
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
            "{} vollständige Jahre erfüllen die aktiven Filter.",
            selected_years.len()
        )
    } else {
        format!(
            "Nur {} vollständige Jahre erfüllen die aktiven Filter; Rankings bleiben explorativ.",
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
            "Bitte wähle einen gültigen Kalendertag außer dem 29. Februar.",
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

fn is_complete_calendar_year(year: i32, values: &[(NaiveDate, f64)]) -> bool {
    if values.len() < 180 {
        return false;
    }
    let Some((first_date, _)) = values.first() else {
        return false;
    };
    let Some((last_date, _)) = values.last() else {
        return false;
    };
    first_date.year() == year
        && last_date.year() == year
        && first_date.ordinal() <= 15
        && last_date.ordinal() >= 350
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
        .filter(|(year, values)| is_complete_calendar_year(*year, values))
        .collect();
    let complete_years = complete.len();
    let quality_status = if rows.is_empty() {
        "unavailable"
    } else if complete_years < MIN_COMPLETE_YEARS {
        "insufficient_history"
    } else {
        "available"
    };
    let quality_reason = match quality_status { "available" => "Mindestens zehn vollständige Kalenderjahre aus lokal gespeicherter D1-Historie.", "insufficient_history" => "Für eine bewertbare Seasonality werden mindestens zehn vollständige Kalenderjahre benötigt.", _ => "Für dieses Asset ist keine nutzbare lokale D1-Historie vorhanden." }.into();
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
        data_source: EODHD_SOURCE_NAME.into(),
        data_source_url: Some(EODHD_SOURCE_URL.into()),
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
                    .rfind(|(date, _)| date.iso_week().week() as u8 == week)
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
    fn eodhd_retry_backoff_is_bounded_and_exponential() {
        assert_eq!(eodhd_retry_delay_minutes(1), 30);
        assert_eq!(eodhd_retry_delay_minutes(2), 60);
        assert_eq!(eodhd_retry_delay_minutes(6), 960);
        assert_eq!(eodhd_retry_delay_minutes(20), 1_440);
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
    fn year_filter_accepts_multiple_ending_digits() {
        let years = (2018..=2025)
            .map(|year| (year, Vec::new()))
            .collect::<BTreeMap<_, _>>();
        let filter = SeasonalityYearFilter {
            ending_digits: vec![0, 2],
            ..Default::default()
        };
        assert_eq!(filtered_years(&years, &filter), vec![2020, 2022]);
    }

    #[test]
    fn incomplete_calendar_years_are_excluded_even_with_many_rows() {
        let rows = (0..180)
            .map(|index| {
                let ordinal = 20 + index * 340 / 179;
                (
                    NaiveDate::from_yo_opt(2024, ordinal as u32).unwrap(),
                    100.0 + index as f64,
                )
            })
            .collect::<Vec<_>>();
        assert!(!is_complete_calendar_year(2024, &rows));

        let complete = (0..180)
            .map(|index| {
                let ordinal = 2 + index * 357 / 179;
                (
                    NaiveDate::from_yo_opt(2024, ordinal as u32).unwrap(),
                    100.0 + index as f64,
                )
            })
            .collect::<Vec<_>>();
        assert!(is_complete_calendar_year(2024, &complete));
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
    fn fewer_than_five_years_stay_exploratory() {
        let mut rows = Vec::new();
        for year in 2020..=2023 {
            for day in 1..=30 {
                rows.push((
                    NaiveDate::from_ymd_opt(year, 1, day).unwrap(),
                    100.0 + f64::from(year - 2020) + f64::from(day),
                ));
            }
        }
        let years = vec![2020, 2021, 2022, 2023];
        let metric = window_metric(&rows, &seasonal_start_indices(&rows), &years, 1, 2, 5);
        assert_eq!(metric.samples, 4);
        assert_eq!(metric.quality_status, "exploratory");
        assert_eq!(metric.wilson_lower_bound, None);
    }

    #[test]
    fn screener_uses_rankable_complete_years_on_the_coarse_grid() {
        let mut candles = Vec::new();
        for year in 2018..=2023 {
            for index in 0..180 {
                let ordinal = 2 + index * 357 / 179;
                let date = NaiveDate::from_yo_opt(year, ordinal as u32).unwrap();
                candles.push((
                    date.and_hms_opt(0, 0, 0).unwrap().and_utc().timestamp(),
                    100.0 + f64::from(year - 2018) * 400.0 + f64::from(ordinal),
                ));
            }
        }
        let (bullish, bearish) = screener_windows(&candles).unwrap();
        let bullish = bullish.expect("rising histories should rank bullish");
        assert_eq!(bullish.samples, 6);
        assert!([5, 10, 20, 30, 40, 60, 90].contains(&bullish.trading_days));
        assert!(bearish.is_none());
    }

    #[test]
    fn missing_window_evidence_is_not_reported_as_neutral() {
        let metric = window_metric(&[], &BTreeMap::new(), &[2024], 6, 1, 20);
        assert_eq!(metric.samples, 0);
        assert_eq!(metric.direction, None);
        assert_eq!(metric.average_return, None);
        assert_eq!(metric.positive_ratio, None);
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
