use std::collections::BTreeMap;

use chrono::{DateTime, Datelike, NaiveDate, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use tauri::State;

use crate::{
    commands::{eodhd_fundamentals, seasonality},
    database::AppState,
    errors::{AppError, CommandError, CommandResult},
};

const MODEL_VERSION: &str = "aud-china-cpi-v1";
const MARKET_SYMBOL: &str = "AUD/USD";
const CPI_HISTORY_MONTHS: u32 = 240;
const MOMENTUM_THRESHOLD_PP: f64 = 0.10;
const SLOPE_THRESHOLD_PP: f64 = 0.02;
const MIN_DIRECTIONAL_SAMPLES: usize = 5;
const MIN_DIRECTIONAL_MEDIAN_PCT: f64 = 0.25;
const HORIZONS: [(u16, usize); 4] = [(1, 5), (4, 20), (8, 40), (12, 60)];

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudChinaCpiRegimeInput {
    pub timeframe: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudChinaCpiRegimeResponse {
    pub as_of: String,
    pub model_version: String,
    pub timeframe: String,
    pub target_currency: String,
    pub market_symbol: String,
    pub market_proxy_label: String,
    pub market_source_name: String,
    pub market_source_url: String,
    pub macro_source_name: String,
    pub macro_source_url: String,
    pub point_in_time_vintages: bool,
    pub methodology: RegimeMethodology,
    pub current: CurrentRegime,
    pub quality: RegimeDataQuality,
    pub candles: Vec<RegimeCandle>,
    pub macro_points: Vec<RegimeMacroPoint>,
    pub intervals: Vec<RegimeInterval>,
    pub episodes: Vec<RegimeEpisode>,
    pub state_statistics: Vec<RegimeStateStatistics>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegimeMethodology {
    pub regime_basis: String,
    pub effective_timing: String,
    pub validation_basis: String,
    pub momentum_threshold_pp: f64,
    pub slope_threshold_pp: f64,
    pub minimum_directional_samples: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegimeCandle {
    pub time: i64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegimeMacroPoint {
    pub id: String,
    pub provider_type: String,
    pub period: Option<String>,
    pub released_at: String,
    pub effective_at: Option<i64>,
    pub actual: f64,
    pub forecast: Option<f64>,
    pub previous: Option<f64>,
    pub forecast_surprise: Option<f64>,
    pub change_1m: Option<f64>,
    pub momentum_3m: Option<f64>,
    pub slope_6m: Option<f64>,
    pub acceleration: Option<f64>,
    pub state: String,
    pub revision_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegimeInterval {
    pub state: String,
    pub start_at: i64,
    pub end_at: i64,
    pub start_release_at: String,
    pub latest_release_at: String,
    pub start_cpi: f64,
    pub latest_cpi: f64,
    pub observations: usize,
    pub completed: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegimeEpisode {
    pub state: String,
    pub start_release_at: String,
    pub effective_start_at: i64,
    pub effective_end_at: i64,
    pub completed: bool,
    pub observations: usize,
    pub start_cpi: f64,
    pub end_cpi: f64,
    pub cpi_change_pp: f64,
    pub start_price: f64,
    pub end_price: f64,
    pub return_pct: f64,
    pub max_favorable_excursion_pct: f64,
    pub max_adverse_excursion_pct: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegimeForwardMetric {
    pub horizon_weeks: u16,
    pub trading_days: usize,
    pub samples: usize,
    pub average_return_pct: Option<f64>,
    pub median_return_pct: Option<f64>,
    pub positive_ratio: Option<f64>,
    pub p25_return_pct: Option<f64>,
    pub p75_return_pct: Option<f64>,
    pub average_mfe_pct: Option<f64>,
    pub average_mae_pct: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegimeStateStatistics {
    pub state: String,
    pub label: String,
    pub episodes: usize,
    pub aud_bias: String,
    pub confidence: String,
    pub horizons: Vec<RegimeForwardMetric>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CurrentRegime {
    pub state: String,
    pub label: String,
    pub description: String,
    pub last_release_at: Option<String>,
    pub effective_at: Option<i64>,
    pub actual: Option<f64>,
    pub change_1m: Option<f64>,
    pub momentum_3m: Option<f64>,
    pub slope_6m: Option<f64>,
    pub duration_releases: usize,
    pub aud_bias: String,
    pub confidence: String,
    pub reference_horizon_weeks: u16,
    pub historical_samples: usize,
    pub median_forward_return_pct: Option<f64>,
    pub positive_ratio: Option<f64>,
    pub average_mfe_pct: Option<f64>,
    pub average_mae_pct: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegimeDataQuality {
    pub status: String,
    pub reason: String,
    pub cpi_observations: usize,
    pub price_candles: usize,
    pub directional_episodes: usize,
    pub history_start: Option<String>,
    pub history_end: Option<String>,
    pub overlap_start: Option<String>,
    pub overlap_end: Option<String>,
    pub latest_cpi_release_at: Option<String>,
    pub latest_price_at: Option<String>,
    pub revised_releases: usize,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, FromRow)]
struct CpiRow {
    id: String,
    provider_type: String,
    period: Option<String>,
    released_at: String,
    actual_text: String,
    forecast_text: Option<String>,
    previous_text: Option<String>,
    revision_count: i64,
}

#[derive(Debug, Clone, FromRow)]
struct PriceRow {
    time: i64,
    open: f64,
    high: f64,
    low: f64,
    close: f64,
    volume: Option<i64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RegimeState {
    Rising,
    Falling,
    Transition,
    Unavailable,
}

impl RegimeState {
    fn key(self) -> &'static str {
        match self {
            Self::Rising => "rising",
            Self::Falling => "falling",
            Self::Transition => "transition",
            Self::Unavailable => "unavailable",
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::Rising => "Steigende Inflation",
            Self::Falling => "Fallende Inflation",
            Self::Transition => "Übergang / uneinheitlich",
            Self::Unavailable => "Nicht belastbar",
        }
    }

    fn description(self) -> &'static str {
        match self {
            Self::Rising => {
                "Das Drei-Monats-Momentum und die geglättete CPI-Steigung zeigen gemeinsam nach oben."
            }
            Self::Falling => {
                "Das Drei-Monats-Momentum und die geglättete CPI-Steigung zeigen gemeinsam nach unten."
            }
            Self::Transition => {
                "Kurzfristige Veränderung und Mehrmonats-Trend liefern noch kein gleichgerichtetes Signal."
            }
            Self::Unavailable => {
                "Für eine belastbare Zustandsbestimmung werden mindestens vier China-CPI-Releases benötigt."
            }
        }
    }
}

#[tauri::command]
pub async fn get_aud_china_cpi_regime(
    state: State<'_, AppState>,
    input: AudChinaCpiRegimeInput,
) -> CommandResult<AudChinaCpiRegimeResponse> {
    load_aud_china_cpi_regime(&state, &input).await
}

#[tauri::command]
pub async fn refresh_aud_china_cpi_regime(
    state: State<'_, AppState>,
    input: AudChinaCpiRegimeInput,
) -> CommandResult<AudChinaCpiRegimeResponse> {
    validate_timeframe(&input.timeframe)?;
    eodhd_fundamentals::sync_indicator_history(
        &state,
        eodhd_fundamentals::EodhdIndicatorHistoryInput {
            currency: "CNY".into(),
            canonical_key: "cpi_yoy".into(),
            months: CPI_HISTORY_MONTHS,
        },
    )
    .await
    .map_err(CommandError::from)?;
    seasonality::refresh_eodhd_symbol(&state, MARKET_SYMBOL, "regime_insights").await?;
    load_aud_china_cpi_regime(&state, &input).await
}

async fn load_aud_china_cpi_regime(
    state: &AppState,
    input: &AudChinaCpiRegimeInput,
) -> CommandResult<AudChinaCpiRegimeResponse> {
    let timeframe = validate_timeframe(&input.timeframe)?;
    let now = Utc::now();
    let cpi_rows = load_cpi_rows(state, now).await?;
    let daily_candles = load_daily_candles(state).await?;
    let macro_points = build_macro_points(&cpi_rows, &daily_candles);
    let intervals = build_intervals(&macro_points, &daily_candles);
    let episodes = build_episodes(&intervals, &daily_candles);
    let state_statistics = build_state_statistics(&intervals, &daily_candles);
    let current = build_current_regime(&macro_points, &intervals, &state_statistics);
    let quality = build_quality(&cpi_rows, &daily_candles, &macro_points, &episodes);
    let candles = if timeframe == "W1" {
        aggregate_weekly(&daily_candles)
    } else {
        daily_candles.clone()
    };

    Ok(AudChinaCpiRegimeResponse {
        as_of: now.to_rfc3339(),
        model_version: MODEL_VERSION.into(),
        timeframe: timeframe.into(),
        target_currency: "AUD".into(),
        market_symbol: MARKET_SYMBOL.into(),
        market_proxy_label: "AUDUSD Spot-Proxy (kein kontinuierlicher 6A-Future)".into(),
        market_source_name: "EODHD Historical Market Data".into(),
        market_source_url:
            "https://eodhd.com/financial-apis/api-for-historical-data-and-volumes".into(),
        macro_source_name: "EODHD Economic Events".into(),
        macro_source_url: "https://eodhd.com/api/economic-events".into(),
        point_in_time_vintages: false,
        methodology: RegimeMethodology {
            regime_basis: "China CPI YoY: 3-Release-Momentum, lineare Steigung der letzten bis zu 6 Releases und Richtung von mindestens 2 der letzten 3 Veränderungen.".into(),
            effective_timing: "Ein CPI-Zustand gilt konservativ erst ab dem nächsten AUDUSD-Handelstag nach der Veröffentlichung.".into(),
            validation_basis: "Forward Returns starten am Open des nächsten Handelstags; MFE/MAE verwenden die danach beobachteten Highs und Lows. Eine Stichprobe entspricht einem Regimebeginn, nicht jedem überlappenden Monatsrelease.".into(),
            momentum_threshold_pp: MOMENTUM_THRESHOLD_PP,
            slope_threshold_pp: SLOPE_THRESHOLD_PP,
            minimum_directional_samples: MIN_DIRECTIONAL_SAMPLES,
        },
        current,
        quality,
        candles,
        macro_points,
        intervals,
        episodes,
        state_statistics,
    })
}

fn validate_timeframe(value: &str) -> CommandResult<&'static str> {
    match value.trim().to_ascii_uppercase().as_str() {
        "D1" => Ok("D1"),
        "W1" => Ok("W1"),
        _ => Err(CommandError::validation(
            "Der Regime-Chart unterstützt nur D1 oder W1.",
        )),
    }
}

async fn load_cpi_rows(state: &AppState, now: DateTime<Utc>) -> CommandResult<Vec<CpiRow>> {
    sqlx::query_as(
        "WITH ranked AS (
           SELECT e.id,e.provider_type,e.period,e.released_at,
                  e.actual_value AS actual_text,e.forecast_value AS forecast_text,
                  e.previous_value AS previous_text,
                  (SELECT COUNT(*) FROM eodhd_event_revisions r WHERE r.event_id=e.id)
                    AS revision_count,
                  ROW_NUMBER() OVER (
                    PARTITION BY e.released_at,COALESCE(e.period,'')
                    ORDER BY CASE WHEN e.forecast_value IS NOT NULL THEN 0 ELSE 1 END,
                             s.priority,e.updated_at DESC
                  ) AS series_rank
           FROM eodhd_events e
           JOIN eodhd_indicator_series s
             ON s.currency=e.currency
            AND s.provider_type=e.provider_type
            AND LOWER(COALESCE(s.comparison,''))=LOWER(COALESCE(e.comparison,''))
            AND s.enabled=1
           WHERE e.currency='CNY' AND s.canonical_key='cpi_yoy'
             AND e.actual_value IS NOT NULL AND e.released_at<=?
         )
         SELECT id,provider_type,period,released_at,actual_text,forecast_text,
                previous_text,revision_count
         FROM ranked WHERE series_rank=1 ORDER BY released_at ASC",
    )
    .bind(now.to_rfc3339())
    .fetch_all(&state.db)
    .await
    .map_err(AppError::from)
    .map_err(CommandError::from)
}

async fn load_daily_candles(state: &AppState) -> CommandResult<Vec<RegimeCandle>> {
    let provider_symbol: Option<String> = sqlx::query_scalar(
        "SELECT provider_symbol
         FROM seasonality_provider_instruments
         WHERE provider='eodhd'
           AND (LOWER(REPLACE(display_symbol,'/',''))='audusd'
                OR LOWER(provider_symbol)='audusd.forex')
         ORDER BY CASE WHEN LOWER(provider_symbol)='audusd.forex' THEN 0 ELSE 1 END
         LIMIT 1",
    )
    .fetch_optional(&state.db)
    .await
    .map_err(AppError::from)?;
    let Some(provider_symbol) = provider_symbol else {
        return Ok(Vec::new());
    };
    let rows: Vec<PriceRow> = sqlx::query_as(
        "SELECT candle_time AS time,bid_open AS open,bid_high AS high,
                bid_low AS low,bid_close AS close,volume
         FROM seasonality_provider_daily_candles
         WHERE provider='eodhd' AND provider_symbol=?
         ORDER BY candle_time",
    )
    .bind(provider_symbol)
    .fetch_all(&state.db)
    .await
    .map_err(AppError::from)?;
    Ok(rows
        .into_iter()
        .filter(|row| {
            row.open.is_finite()
                && row.high.is_finite()
                && row.low.is_finite()
                && row.close.is_finite()
                && row.open > 0.0
                && row.high > 0.0
                && row.low > 0.0
                && row.close > 0.0
        })
        .map(|row| RegimeCandle {
            time: row.time,
            open: row.open,
            high: row.high,
            low: row.low,
            close: row.close,
            volume: row.volume,
        })
        .collect())
}

fn build_macro_points(rows: &[CpiRow], candles: &[RegimeCandle]) -> Vec<RegimeMacroPoint> {
    let observations = rows
        .iter()
        .filter_map(|row| {
            let actual = parse_number(&row.actual_text)?;
            let released = parse_release(&row.released_at)?;
            Some((row, actual, released))
        })
        .collect::<Vec<_>>();
    let actuals = observations
        .iter()
        .map(|(_, actual, _)| *actual)
        .collect::<Vec<_>>();

    observations
        .iter()
        .enumerate()
        .map(|(index, (row, actual, released))| {
            let change_1m = index
                .checked_sub(1)
                .map(|previous| actual - actuals[previous]);
            let momentum_3m = index
                .checked_sub(3)
                .map(|previous| actual - actuals[previous]);
            let window_start = index.saturating_sub(5);
            let slope_6m = (index >= 3).then(|| linear_slope(&actuals[window_start..=index]));
            let acceleration = if index >= 2 {
                Some(
                    (actuals[index] - actuals[index - 1])
                        - (actuals[index - 1] - actuals[index - 2]),
                )
            } else {
                None
            };
            let state = classify_state(&actuals, index, momentum_3m, slope_6m);
            let forecast = row.forecast_text.as_deref().and_then(parse_number);
            RegimeMacroPoint {
                id: row.id.clone(),
                provider_type: row.provider_type.clone(),
                period: row.period.clone(),
                released_at: row.released_at.clone(),
                effective_at: first_candle_after(*released, candles).map(|(_, candle)| candle.time),
                actual: *actual,
                forecast,
                previous: row.previous_text.as_deref().and_then(parse_number),
                forecast_surprise: forecast.map(|value| actual - value),
                change_1m,
                momentum_3m,
                slope_6m,
                acceleration,
                state: state.key().into(),
                revision_count: row.revision_count.max(0),
            }
        })
        .collect()
}

fn classify_state(
    actuals: &[f64],
    index: usize,
    momentum_3m: Option<f64>,
    slope_6m: Option<f64>,
) -> RegimeState {
    if index < 3 {
        return RegimeState::Unavailable;
    }
    let changes = (index - 2..=index)
        .map(|current| actuals[current] - actuals[current - 1])
        .collect::<Vec<_>>();
    let falling_changes = changes.iter().filter(|value| **value <= 0.0).count();
    let rising_changes = changes.iter().filter(|value| **value >= 0.0).count();
    match (momentum_3m, slope_6m) {
        (Some(momentum), Some(slope))
            if momentum <= -MOMENTUM_THRESHOLD_PP
                && slope <= -SLOPE_THRESHOLD_PP
                && falling_changes >= 2 =>
        {
            RegimeState::Falling
        }
        (Some(momentum), Some(slope))
            if momentum >= MOMENTUM_THRESHOLD_PP
                && slope >= SLOPE_THRESHOLD_PP
                && rising_changes >= 2 =>
        {
            RegimeState::Rising
        }
        _ => RegimeState::Transition,
    }
}

fn build_intervals(points: &[RegimeMacroPoint], candles: &[RegimeCandle]) -> Vec<RegimeInterval> {
    let usable = points
        .iter()
        .filter(|point| point.effective_at.is_some())
        .collect::<Vec<_>>();
    let Some(last_candle) = candles.last() else {
        return Vec::new();
    };
    let mut intervals: Vec<RegimeInterval> = Vec::new();
    for point in usable {
        let effective_at = point.effective_at.unwrap_or(last_candle.time);
        if let Some(current) = intervals.last_mut()
            && current.state == point.state
        {
            current.latest_release_at = point.released_at.clone();
            current.latest_cpi = point.actual;
            current.observations += 1;
            continue;
        }
        if let Some(previous) = intervals.last_mut() {
            previous.end_at = effective_at;
            previous.completed = true;
        }
        intervals.push(RegimeInterval {
            state: point.state.clone(),
            start_at: effective_at,
            end_at: last_candle.time,
            start_release_at: point.released_at.clone(),
            latest_release_at: point.released_at.clone(),
            start_cpi: point.actual,
            latest_cpi: point.actual,
            observations: 1,
            completed: false,
        });
    }
    intervals
}

fn build_episodes(intervals: &[RegimeInterval], candles: &[RegimeCandle]) -> Vec<RegimeEpisode> {
    intervals
        .iter()
        .filter_map(|interval| {
            let start_index = candles
                .iter()
                .position(|candle| candle.time >= interval.start_at)?;
            let end_index = if interval.completed {
                candles
                    .iter()
                    .rposition(|candle| candle.time < interval.end_at)
            } else {
                candles.len().checked_sub(1)
            }?;
            if end_index < start_index {
                return None;
            }
            let start = &candles[start_index];
            let end = &candles[end_index];
            let window = &candles[start_index..=end_index];
            let (mfe, mae) = excursions(start.open, window);
            Some(RegimeEpisode {
                state: interval.state.clone(),
                start_release_at: interval.start_release_at.clone(),
                effective_start_at: start.time,
                effective_end_at: end.time,
                completed: interval.completed,
                observations: interval.observations,
                start_cpi: interval.start_cpi,
                end_cpi: interval.latest_cpi,
                cpi_change_pp: interval.latest_cpi - interval.start_cpi,
                start_price: start.open,
                end_price: end.close,
                return_pct: percent_change(start.open, end.close),
                max_favorable_excursion_pct: mfe,
                max_adverse_excursion_pct: mae,
            })
        })
        .collect()
}

fn build_state_statistics(
    intervals: &[RegimeInterval],
    candles: &[RegimeCandle],
) -> Vec<RegimeStateStatistics> {
    [
        RegimeState::Falling,
        RegimeState::Rising,
        RegimeState::Transition,
    ]
    .into_iter()
    .map(|state| {
        let state_intervals = intervals
            .iter()
            .filter(|interval| interval.state == state.key())
            .collect::<Vec<_>>();
        let horizons = HORIZONS
            .into_iter()
            .map(|(weeks, days)| forward_metric(weeks, days, &state_intervals, candles))
            .collect::<Vec<_>>();
        let reference = horizons.iter().find(|metric| metric.horizon_weeks == 12);
        let (aud_bias, confidence) = reference
            .map(bias_and_confidence)
            .unwrap_or_else(|| ("unavailable".into(), "unavailable".into()));
        RegimeStateStatistics {
            state: state.key().into(),
            label: state.label().into(),
            episodes: state_intervals.len(),
            aud_bias,
            confidence,
            horizons,
        }
    })
    .collect()
}

fn forward_metric(
    horizon_weeks: u16,
    trading_days: usize,
    intervals: &[&RegimeInterval],
    candles: &[RegimeCandle],
) -> RegimeForwardMetric {
    let outcomes = intervals
        .iter()
        .filter_map(|interval| {
            let start_index = candles
                .iter()
                .position(|candle| candle.time >= interval.start_at)?;
            let end_index = start_index.checked_add(trading_days.saturating_sub(1))?;
            let end = candles.get(end_index)?;
            let start = candles.get(start_index)?;
            let window = &candles[start_index..=end_index];
            let (mfe, mae) = excursions(start.open, window);
            Some((percent_change(start.open, end.close), mfe, mae))
        })
        .collect::<Vec<_>>();
    let returns = outcomes.iter().map(|value| value.0).collect::<Vec<_>>();
    let mfes = outcomes.iter().map(|value| value.1).collect::<Vec<_>>();
    let maes = outcomes.iter().map(|value| value.2).collect::<Vec<_>>();
    RegimeForwardMetric {
        horizon_weeks,
        trading_days,
        samples: returns.len(),
        average_return_pct: mean(&returns),
        median_return_pct: percentile(&returns, 0.5),
        positive_ratio: (!returns.is_empty()).then(|| {
            returns.iter().filter(|value| **value > 0.0).count() as f64 / returns.len() as f64
        }),
        p25_return_pct: percentile(&returns, 0.25),
        p75_return_pct: percentile(&returns, 0.75),
        average_mfe_pct: mean(&mfes),
        average_mae_pct: mean(&maes),
    }
}

fn bias_and_confidence(metric: &RegimeForwardMetric) -> (String, String) {
    if metric.samples < MIN_DIRECTIONAL_SAMPLES {
        return ("unavailable".into(), "unavailable".into());
    }
    let median = metric.median_return_pct.unwrap_or(0.0);
    let positive_ratio = metric.positive_ratio.unwrap_or(0.5);
    let bias = if median >= MIN_DIRECTIONAL_MEDIAN_PCT && positive_ratio >= 0.55 {
        "bullish"
    } else if median <= -MIN_DIRECTIONAL_MEDIAN_PCT && positive_ratio <= 0.45 {
        "bearish"
    } else {
        "mixed"
    };
    let confidence = if metric.samples >= 12 {
        "high"
    } else if metric.samples >= 7 {
        "medium"
    } else {
        "low"
    };
    (bias.into(), confidence.into())
}

fn build_current_regime(
    points: &[RegimeMacroPoint],
    intervals: &[RegimeInterval],
    statistics: &[RegimeStateStatistics],
) -> CurrentRegime {
    let Some(latest) = points.last() else {
        return unavailable_current();
    };
    let state = state_from_key(&latest.state);
    let duration_releases = intervals
        .last()
        .filter(|interval| interval.state == latest.state)
        .map_or(1, |interval| interval.observations);
    let reference = statistics
        .iter()
        .find(|item| item.state == latest.state)
        .and_then(|item| {
            item.horizons
                .iter()
                .find(|metric| metric.horizon_weeks == 12)
        });
    let (aud_bias, confidence) = reference
        .map(bias_and_confidence)
        .unwrap_or_else(|| ("unavailable".into(), "unavailable".into()));
    CurrentRegime {
        state: latest.state.clone(),
        label: state.label().into(),
        description: state.description().into(),
        last_release_at: Some(latest.released_at.clone()),
        effective_at: latest.effective_at,
        actual: Some(latest.actual),
        change_1m: latest.change_1m,
        momentum_3m: latest.momentum_3m,
        slope_6m: latest.slope_6m,
        duration_releases,
        aud_bias,
        confidence,
        reference_horizon_weeks: 12,
        historical_samples: reference.map_or(0, |metric| metric.samples),
        median_forward_return_pct: reference.and_then(|metric| metric.median_return_pct),
        positive_ratio: reference.and_then(|metric| metric.positive_ratio),
        average_mfe_pct: reference.and_then(|metric| metric.average_mfe_pct),
        average_mae_pct: reference.and_then(|metric| metric.average_mae_pct),
    }
}

fn unavailable_current() -> CurrentRegime {
    CurrentRegime {
        state: RegimeState::Unavailable.key().into(),
        label: RegimeState::Unavailable.label().into(),
        description: RegimeState::Unavailable.description().into(),
        last_release_at: None,
        effective_at: None,
        actual: None,
        change_1m: None,
        momentum_3m: None,
        slope_6m: None,
        duration_releases: 0,
        aud_bias: "unavailable".into(),
        confidence: "unavailable".into(),
        reference_horizon_weeks: 12,
        historical_samples: 0,
        median_forward_return_pct: None,
        positive_ratio: None,
        average_mfe_pct: None,
        average_mae_pct: None,
    }
}

fn build_quality(
    rows: &[CpiRow],
    candles: &[RegimeCandle],
    points: &[RegimeMacroPoint],
    episodes: &[RegimeEpisode],
) -> RegimeDataQuality {
    let directional_episodes = episodes
        .iter()
        .filter(|episode| matches!(episode.state.as_str(), "falling" | "rising"))
        .count();
    let revised_releases = rows.iter().filter(|row| row.revision_count > 0).count();
    let history_start = points.first().map(|point| point.released_at.clone());
    let history_end = points.last().map(|point| point.released_at.clone());
    let latest_price_at = candles.last().and_then(|candle| millis_date(candle.time));
    let price_start = candles.first().map(|candle| candle.time);
    let cpi_start = points.iter().find_map(|point| point.effective_at);
    let overlap_start = price_start
        .zip(cpi_start)
        .and_then(|(price, cpi)| millis_date(price.max(cpi)));
    let overlap_end = candles.last().and_then(|candle| millis_date(candle.time));
    let mut warnings = Vec::new();
    if points.len() < 4 {
        warnings.push(
            "Für die Regimeklassifikation werden mindestens vier China-CPI-Releases benötigt."
                .into(),
        );
    }
    if candles.is_empty() {
        warnings.push(
            "Die lokale AUDUSD-D1-Historie fehlt. Aktualisiere die Regime-Daten über EODHD.".into(),
        );
    }
    if directional_episodes < MIN_DIRECTIONAL_SAMPLES {
        warnings.push(format!(
            "Nur {directional_episodes} gerichtete Regimeepisoden sind verfügbar; eine AUD-Wirkungsrichtung benötigt mindestens {MIN_DIRECTIONAL_SAMPLES}."
        ));
    }
    warnings.push(
        "EODHD liefert hier keine vollständigen historischen Daten-Vintages; frühere CPI-Werte können den heute bekannten Revisionsstand enthalten."
            .into(),
    );
    warnings.push(
        "AUDUSD ist ein Spot-Proxy und enthält neben AUD- auch USD-Einflüsse; er ist kein rollbereinigter CME-6A-Future."
            .into(),
    );
    let overlap_years = price_start
        .zip(cpi_start)
        .zip(candles.last().map(|candle| candle.time))
        .map_or(0.0, |((price, cpi), end)| {
            (end - price.max(cpi)).max(0) as f64 / (365.25 * 86_400_000.0)
        });
    let (status, reason) = if points.len() < 4 || candles.is_empty() {
        (
            "unavailable",
            "Makro- oder Preishistorie reicht noch nicht für die Analyse aus.",
        )
    } else if overlap_years >= 10.0 && directional_episodes >= 8 {
        (
            "available",
            "Mindestens zehn gemeinsame Jahre und acht gerichtete Regimeepisoden sind vorhanden.",
        )
    } else {
        (
            "exploratory",
            "Die Berechnung ist verfügbar, die gemeinsame Historie oder Episodenzahl bleibt aber begrenzt.",
        )
    };
    RegimeDataQuality {
        status: status.into(),
        reason: reason.into(),
        cpi_observations: points.len(),
        price_candles: candles.len(),
        directional_episodes,
        history_start,
        history_end,
        overlap_start,
        overlap_end,
        latest_cpi_release_at: points.last().map(|point| point.released_at.clone()),
        latest_price_at,
        revised_releases,
        warnings,
    }
}

fn aggregate_weekly(candles: &[RegimeCandle]) -> Vec<RegimeCandle> {
    let mut weeks: BTreeMap<(i32, u32), RegimeCandle> = BTreeMap::new();
    for candle in candles {
        let Some(date) = millis_naive_date(candle.time) else {
            continue;
        };
        let iso = date.iso_week();
        let key = (iso.year(), iso.week());
        weeks
            .entry(key)
            .and_modify(|week| {
                week.high = week.high.max(candle.high);
                week.low = week.low.min(candle.low);
                week.close = candle.close;
                week.volume = match (week.volume, candle.volume) {
                    (Some(left), Some(right)) => Some(left.saturating_add(right)),
                    _ => None,
                };
            })
            .or_insert_with(|| candle.clone());
    }
    weeks.into_values().collect()
}

fn first_candle_after(
    release: DateTime<Utc>,
    candles: &[RegimeCandle],
) -> Option<(usize, &RegimeCandle)> {
    let release_date = release.date_naive();
    candles
        .iter()
        .enumerate()
        .find(|(_, candle)| millis_naive_date(candle.time).is_some_and(|date| date > release_date))
}

fn parse_release(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|value| value.with_timezone(&Utc))
        .or_else(|| {
            NaiveDate::parse_from_str(value.get(..10)?, "%Y-%m-%d")
                .ok()?
                .and_hms_opt(0, 0, 0)
                .map(|value| value.and_utc())
        })
}

fn parse_number(value: &str) -> Option<f64> {
    let parsed = value.trim().parse::<f64>().ok()?;
    parsed.is_finite().then_some(parsed)
}

fn linear_slope(values: &[f64]) -> f64 {
    let count = values.len() as f64;
    if values.len() < 2 {
        return 0.0;
    }
    let x_mean = (count - 1.0) / 2.0;
    let y_mean = values.iter().sum::<f64>() / count;
    let numerator = values
        .iter()
        .enumerate()
        .map(|(index, value)| (index as f64 - x_mean) * (value - y_mean))
        .sum::<f64>();
    let denominator = (0..values.len())
        .map(|index| (index as f64 - x_mean).powi(2))
        .sum::<f64>();
    if denominator == 0.0 {
        0.0
    } else {
        numerator / denominator
    }
}

fn excursions(start: f64, candles: &[RegimeCandle]) -> (f64, f64) {
    let high = candles
        .iter()
        .map(|candle| candle.high)
        .fold(start, f64::max);
    let low = candles
        .iter()
        .map(|candle| candle.low)
        .fold(start, f64::min);
    (percent_change(start, high), percent_change(start, low))
}

fn percent_change(start: f64, end: f64) -> f64 {
    if start <= 0.0 {
        0.0
    } else {
        (end / start - 1.0) * 100.0
    }
}

fn mean(values: &[f64]) -> Option<f64> {
    (!values.is_empty()).then(|| values.iter().sum::<f64>() / values.len() as f64)
}

fn percentile(values: &[f64], percentile: f64) -> Option<f64> {
    if values.is_empty() {
        return None;
    }
    let mut ordered = values.to_vec();
    ordered.sort_by(f64::total_cmp);
    let position = percentile.clamp(0.0, 1.0) * (ordered.len() - 1) as f64;
    let lower = position.floor() as usize;
    let upper = position.ceil() as usize;
    if lower == upper {
        Some(ordered[lower])
    } else {
        let weight = position - lower as f64;
        Some(ordered[lower] * (1.0 - weight) + ordered[upper] * weight)
    }
}

fn state_from_key(value: &str) -> RegimeState {
    match value {
        "rising" => RegimeState::Rising,
        "falling" => RegimeState::Falling,
        "transition" => RegimeState::Transition,
        _ => RegimeState::Unavailable,
    }
}

fn millis_naive_date(value: i64) -> Option<NaiveDate> {
    Utc.timestamp_millis_opt(value)
        .single()
        .map(|value| value.date_naive())
}

fn millis_date(value: i64) -> Option<String> {
    millis_naive_date(value).map(|date| date.format("%Y-%m-%d").to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Duration;

    fn candle(date: &str, open: f64, high: f64, low: f64, close: f64) -> RegimeCandle {
        let date = NaiveDate::parse_from_str(date, "%Y-%m-%d").unwrap();
        RegimeCandle {
            time: date
                .and_hms_opt(0, 0, 0)
                .unwrap()
                .and_utc()
                .timestamp_millis(),
            open,
            high,
            low,
            close,
            volume: Some(1),
        }
    }

    fn cpi_row(index: usize, value: f64) -> CpiRow {
        let date =
            NaiveDate::from_ymd_opt(2024, 1, 10).unwrap() + Duration::days((index * 30) as i64);
        CpiRow {
            id: format!("cpi-{index}"),
            provider_type: "Inflation Rate".into(),
            period: Some(format!("2024-{index:02}")),
            released_at: date.and_hms_opt(2, 30, 0).unwrap().and_utc().to_rfc3339(),
            actual_text: value.to_string(),
            forecast_text: None,
            previous_text: None,
            revision_count: 0,
        }
    }

    #[test]
    fn classifies_sustained_disinflation_and_reflation() {
        let falling = [3.2, 3.0, 2.8, 2.6, 2.4];
        let rising = [0.2, 0.4, 0.6, 0.8, 1.0];
        assert_eq!(
            classify_state(&falling, 4, Some(-0.6), Some(-0.2)),
            RegimeState::Falling
        );
        assert_eq!(
            classify_state(&rising, 4, Some(0.6), Some(0.2)),
            RegimeState::Rising
        );
    }

    #[test]
    fn keeps_mixed_momentum_in_transition() {
        let values = [2.0, 1.8, 2.1, 1.9];
        assert_eq!(
            classify_state(&values, 3, Some(-0.1), Some(0.0)),
            RegimeState::Transition
        );
    }

    #[test]
    fn activates_release_only_on_next_trading_day() {
        let candles = vec![
            candle("2024-01-10", 1.0, 1.1, 0.9, 1.0),
            candle("2024-01-11", 1.0, 1.1, 0.9, 1.0),
        ];
        let release = DateTime::parse_from_rfc3339("2024-01-10T02:30:00Z")
            .unwrap()
            .with_timezone(&Utc);
        let (_, effective) = first_candle_after(release, &candles).unwrap();
        assert_eq!(millis_date(effective.time).as_deref(), Some("2024-01-11"));
    }

    #[test]
    fn aggregates_weekly_ohlc_without_losing_extremes() {
        let daily = vec![
            candle("2024-01-08", 0.66, 0.68, 0.65, 0.67),
            candle("2024-01-09", 0.67, 0.70, 0.64, 0.69),
            candle("2024-01-15", 0.69, 0.71, 0.68, 0.70),
        ];
        let weekly = aggregate_weekly(&daily);
        assert_eq!(weekly.len(), 2);
        assert_eq!(weekly[0].open, 0.66);
        assert_eq!(weekly[0].high, 0.70);
        assert_eq!(weekly[0].low, 0.64);
        assert_eq!(weekly[0].close, 0.69);
        assert_eq!(weekly[0].volume, Some(2));
    }

    #[test]
    fn forward_metric_uses_open_high_low_and_future_close() {
        let start = NaiveDate::from_ymd_opt(2024, 1, 1).unwrap();
        let candles = (0..5)
            .map(|index| {
                let date = start + Duration::days(index);
                candle(
                    &date.format("%Y-%m-%d").to_string(),
                    1.0,
                    if index == 2 { 1.2 } else { 1.1 },
                    if index == 3 { 0.8 } else { 0.9 },
                    if index == 4 { 1.1 } else { 1.0 },
                )
            })
            .collect::<Vec<_>>();
        let interval = RegimeInterval {
            state: "falling".into(),
            start_at: candles[0].time,
            end_at: candles[4].time,
            start_release_at: "2023-12-31T00:00:00Z".into(),
            latest_release_at: "2023-12-31T00:00:00Z".into(),
            start_cpi: 2.0,
            latest_cpi: 2.0,
            observations: 1,
            completed: true,
        };
        let metric = forward_metric(1, 5, &[&interval], &candles);
        assert_eq!(metric.samples, 1);
        assert!((metric.median_return_pct.unwrap() - 10.0).abs() < 1e-9);
        assert!((metric.average_mfe_pct.unwrap() - 20.0).abs() < 1e-9);
        assert!((metric.average_mae_pct.unwrap() + 20.0).abs() < 1e-9);
    }

    #[test]
    fn macro_points_expose_state_without_using_same_day_price() {
        let rows = [3.2, 3.0, 2.8, 2.6, 2.4]
            .into_iter()
            .enumerate()
            .map(|(index, value)| cpi_row(index, value))
            .collect::<Vec<_>>();
        let start = NaiveDate::from_ymd_opt(2024, 1, 1).unwrap();
        let candles = (0..180)
            .map(|index| {
                let date = start + Duration::days(index);
                candle(&date.format("%Y-%m-%d").to_string(), 0.65, 0.66, 0.64, 0.65)
            })
            .collect::<Vec<_>>();
        let points = build_macro_points(&rows, &candles);
        assert_eq!(
            points.last().map(|point| point.state.as_str()),
            Some("falling")
        );
        assert!(points.last().and_then(|point| point.effective_at).is_some());
    }

    #[tokio::test]
    #[ignore = "vollständige temporäre Migration; separat ausführen, um parallele SQLite-Pools nicht auszuschöpfen"]
    async fn current_migrations_supply_the_native_regime_query() {
        let state = crate::database::initialize_headless().await.unwrap();
        sqlx::query(
            "INSERT INTO seasonality_provider_instruments(
               provider,provider_symbol,display_symbol,category,description,
               base_currency,quote_currency,earliest_daily_at,native_timezone,
               last_catalogued_at,data_kind,source_code,sync_priority
             ) VALUES('eodhd','AUDUSD.FOREX','AUD/USD','Forex','Australian Dollar / US Dollar',
                      'AUD','USD',NULL,'provider-native date',?,'eod','AUDUSD.FOREX',10)",
        )
        .bind(Utc::now().to_rfc3339())
        .execute(&state.db)
        .await
        .unwrap();

        let price_start = NaiveDate::from_ymd_opt(2024, 1, 1).unwrap();
        for index in 0..180_i64 {
            let time = (price_start + Duration::days(index))
                .and_hms_opt(0, 0, 0)
                .unwrap()
                .and_utc()
                .timestamp_millis();
            let close = 0.66 - index as f64 * 0.0001;
            sqlx::query(
                "INSERT INTO seasonality_provider_daily_candles(
                   provider,provider_symbol,candle_time,bid_open,bid_high,bid_low,bid_close,
                   ask_open,ask_high,ask_low,ask_close,mid_close,volume,fetched_at
                 ) VALUES('eodhd','AUDUSD.FOREX',?,?,?,?,?,?,?,?,?,?,100,?)",
            )
            .bind(time)
            .bind(close + 0.0002)
            .bind(close + 0.001)
            .bind(close - 0.001)
            .bind(close)
            .bind(close + 0.0002)
            .bind(close + 0.001)
            .bind(close - 0.001)
            .bind(close)
            .bind(close)
            .bind(Utc::now().to_rfc3339())
            .execute(&state.db)
            .await
            .unwrap();
        }

        for (index, actual) in [3.2, 3.0, 2.8, 2.6, 2.4].into_iter().enumerate() {
            let release = (NaiveDate::from_ymd_opt(2024, 1, 10).unwrap()
                + Duration::days((index * 30) as i64))
            .and_hms_opt(2, 30, 0)
            .unwrap()
            .and_utc()
            .to_rfc3339();
            sqlx::query(
                "INSERT INTO eodhd_events(
                   id,event_identity,country,currency,provider_type,comparison,period,
                   released_at,actual_value,forecast_value,previous_value,frequency,
                   canonical_key,mapping_status,mapping_confidence,source_url,
                   first_seen_at,updated_at
                 ) VALUES(?,?,'China','CNY','Inflation Rate','yoy',?,?,?,?,?,'Monthly',
                          'cpi_yoy','automatic',100,'https://eodhd.com/api/economic-events',?,?)",
            )
            .bind(format!("regime-cpi-{index}"))
            .bind(format!("regime-cpi-identity-{index}"))
            .bind(format!("2024-{index:02}"))
            .bind(&release)
            .bind(actual.to_string())
            .bind((actual + 0.1).to_string())
            .bind((actual + 0.2).to_string())
            .bind(&release)
            .bind(&release)
            .execute(&state.db)
            .await
            .unwrap();
        }

        let response = load_aud_china_cpi_regime(
            &state,
            &AudChinaCpiRegimeInput {
                timeframe: "W1".into(),
            },
        )
        .await
        .unwrap();

        assert_eq!(response.current.state, "falling");
        assert_eq!(response.macro_points.len(), 5);
        assert!(!response.candles.is_empty());
        assert!(response.candles.len() < response.quality.price_candles);
        assert_eq!(response.market_symbol, "AUD/USD");
        state.db.close().await;
    }
}
