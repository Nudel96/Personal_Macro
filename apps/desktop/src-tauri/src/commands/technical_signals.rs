use std::collections::HashMap;

use chrono::{Datelike, Duration, Utc, Weekday};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use tauri::State;

use crate::{
    commands::eodhd_prices,
    database::AppState,
    errors::{AppError, CommandError, CommandResult},
    metrics::technical_trend::{
        OhlcBar, TECHNICAL_TREND_VERSION, TrendAssessment, aggregate_hourly_to_four_hour,
        assess_trend, combine_timeframes,
    },
};

const FOREX_PRIORITY: [&str; 9] = [
    "EUR", "GBP", "AUD", "NZD", "USD", "CAD", "CHF", "JPY", "CNY",
];
const INTRADAY_INITIAL_DAYS: i64 = 120;
const INTRADAY_OVERLAP_DAYS: i64 = 7;
const INTRADAY_RETENTION_DAYS: i64 = 180;
const TECHNICAL_REFRESH_HOURS: i64 = 4;
const FAILED_RETRY_HOURS: i64 = 6;
const SEASONALITY_MIN_YEARS: usize = 10;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairTechnicalDashboard {
    pub as_of: String,
    pub method_version: String,
    pub pairs: Vec<PairTechnicalSignalView>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairTechnicalSignalView {
    pub base: String,
    pub quote: String,
    pub source_symbol: Option<String>,
    pub inverted: bool,
    pub chart_trend: ChartTrendView,
    pub seasonality_trend: SeasonalityTrendView,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChartTrendView {
    pub signal: Option<i8>,
    pub status: String,
    pub reason_codes: Vec<String>,
    pub four_hour: TimeframeTrendView,
    pub daily: TimeframeTrendView,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeframeTrendView {
    pub signal: Option<i8>,
    pub status: String,
    pub reason_codes: Vec<String>,
    pub bars: usize,
    pub latest_candle_at: Option<String>,
    pub ohlc4: Option<f64>,
    pub ema20: Option<f64>,
    pub ema50: Option<f64>,
    pub normalized_slope: Option<f64>,
    pub adx14: Option<f64>,
    pub plus_di14: Option<f64>,
    pub minus_di14: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeasonalityTrendView {
    pub signal: Option<i8>,
    pub status: String,
    pub reason_codes: Vec<String>,
    pub trading_days: usize,
    pub average_return: Option<f64>,
    pub median_return: Option<f64>,
    pub positive_ratio: Option<f64>,
    pub samples: usize,
    pub complete_years: usize,
    pub calculated_at: Option<String>,
}

#[derive(Debug, Clone, FromRow)]
struct InstrumentRow {
    provider_symbol: String,
    source_code: String,
    display_symbol: String,
    base_currency: String,
    quote_currency: String,
    profile_json: Option<String>,
}

#[derive(Debug, Clone, Copy, FromRow)]
struct StoredCandle {
    time: i64,
    open: f64,
    high: f64,
    low: f64,
    close: f64,
}

// Deliberately deserialize only the persisted raw metrics used by the Macro
// signal. Display-only annual curves and smoothers cannot enter this contract.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredSeasonalityScoringProfile {
    calculated_at: String,
    complete_years: usize,
    quality_status: String,
    forward_returns: Vec<StoredForwardMetric>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredForwardMetric {
    trading_days: usize,
    average_return: Option<f64>,
    median_return: Option<f64>,
    positive_ratio: Option<f64>,
    samples: usize,
}

#[tauri::command]
pub async fn get_pair_technical_signals(
    state: State<'_, AppState>,
) -> CommandResult<PairTechnicalDashboard> {
    load_pair_technical_signals(&state).await
}

#[tauri::command]
pub async fn refresh_pair_technical_signals(
    state: State<'_, AppState>,
) -> CommandResult<PairTechnicalDashboard> {
    let api_key = eodhd_prices::api_key().ok_or_else(|| CommandError {
        code: "EODHD_API_KEY_MISSING".into(),
        message: "Für den 4H-Chart-Trend fehlt der EODHD_API_KEY in .env.local.".into(),
        details: None,
    })?;
    let client = eodhd_prices::http_client()?;
    let instruments = load_instruments(&state).await?;
    let mut succeeded = 0_usize;
    let mut attempted = 0_usize;
    for instrument in unique_visible_instruments(&instruments) {
        attempted += 1;
        if sync_instrument(&state, &client, &api_key, instrument)
            .await
            .is_ok()
        {
            succeeded += 1;
        }
    }
    if attempted == 0 {
        return Err(CommandError {
            code: "EODHD_FOREX_CATALOG_EMPTY".into(),
            message: "Für die Technicals ist noch kein validierter EODHD-Forexkatalog vorhanden. Bitte zuerst die Seasonality-Daten initialisieren.".into(),
            details: None,
        });
    }
    if attempted > 0 && succeeded == 0 {
        return Err(CommandError {
            code: "EODHD_INTRADAY_UNAVAILABLE".into(),
            message: "EODHD konnte für die sichtbaren Forexpaare keine 1H-Daten aktualisieren. Bitte Intraday-Zugriff und API-Limit prüfen.".into(),
            details: None,
        });
    }
    load_pair_technical_signals(&state).await
}

pub async fn scheduled_technical_signal_sync(state: &AppState) -> CommandResult<()> {
    let Some(api_key) = eodhd_prices::api_key() else {
        return Ok(());
    };
    let instruments = load_instruments(state).await?;
    let now = Utc::now().to_rfc3339();
    let mut due = None;
    for instrument in unique_visible_instruments(&instruments) {
        let state_row: Option<(String, Option<String>)> = sqlx::query_as(
            "SELECT status,next_refresh_at FROM eodhd_technical_sync_state WHERE provider_symbol=?",
        )
        .bind(&instrument.provider_symbol)
        .fetch_optional(&state.db)
        .await
        .map_err(AppError::from)?;
        let is_due = match state_row {
            None => true,
            Some((status, next)) => {
                status != "running" && next.as_deref().is_none_or(|value| value <= now.as_str())
            }
        };
        if is_due {
            due = Some(instrument);
            break;
        }
    }
    if let Some(instrument) = due {
        let client = eodhd_prices::http_client()?;
        sync_instrument(state, &client, &api_key, instrument).await?;
    }
    Ok(())
}

async fn load_pair_technical_signals(state: &AppState) -> CommandResult<PairTechnicalDashboard> {
    let instruments = load_instruments(state).await?;
    let by_pair = instruments
        .iter()
        .map(|instrument| {
            (
                (
                    instrument.base_currency.as_str(),
                    instrument.quote_currency.as_str(),
                ),
                instrument,
            )
        })
        .collect::<HashMap<_, _>>();
    let now = Utc::now();
    let mut pairs = Vec::with_capacity(36);
    for (base_index, base) in FOREX_PRIORITY.iter().enumerate() {
        for quote in FOREX_PRIORITY.iter().skip(base_index + 1) {
            let direct = by_pair.get(&(*base, *quote)).copied();
            let inverse = by_pair.get(&(*quote, *base)).copied();
            let (instrument, inverted) = direct
                .map(|value| (Some(value), false))
                .or_else(|| inverse.map(|value| (Some(value), true)))
                .unwrap_or((None, false));
            pairs.push(
                build_pair_view(state, base, quote, instrument, inverted, now.timestamp()).await?,
            );
        }
    }
    Ok(PairTechnicalDashboard {
        as_of: now.to_rfc3339(),
        method_version: TECHNICAL_TREND_VERSION.into(),
        pairs,
    })
}

async fn build_pair_view(
    state: &AppState,
    base: &str,
    quote: &str,
    instrument: Option<&InstrumentRow>,
    inverted: bool,
    now: i64,
) -> CommandResult<PairTechnicalSignalView> {
    let Some(instrument) = instrument else {
        return Ok(PairTechnicalSignalView {
            base: base.into(),
            quote: quote.into(),
            source_symbol: None,
            inverted: false,
            chart_trend: unavailable_chart("exact_pair_history_unavailable"),
            seasonality_trend: unavailable_seasonality("exact_pair_history_unavailable"),
        });
    };

    let daily = load_daily_bars(state, &instrument.provider_symbol).await?;
    let hourly = load_hourly_bars(state, &instrument.provider_symbol).await?;
    let current_hour = now.div_euclid(3_600) * 3_600;
    let four_hour = aggregate_hourly_to_four_hour(&hourly, current_hour);
    let daily_assessment = apply_freshness(assess_trend(&daily), now, false);
    let four_hour_assessment = apply_freshness(assess_trend(&four_hour), now, true);
    let daily_view = timeframe_view(daily_assessment, inverted);
    let four_hour_view = timeframe_view(four_hour_assessment, inverted);
    let signal = combine_timeframes(daily_view.signal, four_hour_view.signal);
    let chart_trend = ChartTrendView {
        signal,
        status: signal_status(signal),
        reason_codes: vec![match signal {
            Some(1 | -1) => "timeframes_confirmed".into(),
            Some(0) => "timeframes_mixed_or_neutral".into(),
            None => "timeframe_evidence_unavailable".into(),
            _ => "timeframes_mixed_or_neutral".into(),
        }],
        four_hour: four_hour_view,
        daily: daily_view,
    };
    let seasonality_trend = seasonality_view(
        instrument.profile_json.as_deref().unwrap_or_default(),
        inverted,
    );
    Ok(PairTechnicalSignalView {
        base: base.into(),
        quote: quote.into(),
        source_symbol: Some(instrument.display_symbol.clone()),
        inverted,
        chart_trend,
        seasonality_trend,
    })
}

async fn load_instruments(state: &AppState) -> CommandResult<Vec<InstrumentRow>> {
    sqlx::query_as(
        "SELECT pi.provider_symbol,COALESCE(pi.source_code,pi.provider_symbol) AS source_code,pi.display_symbol,pi.base_currency,pi.quote_currency,pp.profile_json
         FROM seasonality_provider_instruments pi
         LEFT JOIN seasonality_provider_profiles pp ON pp.provider=pi.provider AND pp.provider_symbol=pi.provider_symbol
         WHERE pi.provider='eodhd' AND pi.category='Forex' AND pi.base_currency IS NOT NULL AND pi.quote_currency IS NOT NULL
         ORDER BY pi.sync_priority,pi.display_symbol",
    )
    .fetch_all(&state.db)
    .await
    .map_err(AppError::from)
    .map_err(CommandError::from)
}

fn unique_visible_instruments(instruments: &[InstrumentRow]) -> Vec<&InstrumentRow> {
    let mut seen = std::collections::BTreeSet::new();
    instruments
        .iter()
        .filter(|instrument| {
            FOREX_PRIORITY.contains(&instrument.base_currency.as_str())
                && FOREX_PRIORITY.contains(&instrument.quote_currency.as_str())
        })
        .filter(|instrument| seen.insert(instrument.provider_symbol.as_str()))
        .collect()
}

async fn load_daily_bars(state: &AppState, symbol: &str) -> CommandResult<Vec<OhlcBar>> {
    let rows: Vec<StoredCandle> = sqlx::query_as(
        "SELECT candle_time / 1000 AS time,bid_open AS open,bid_high AS high,bid_low AS low,bid_close AS close
         FROM seasonality_provider_daily_candles
         WHERE provider='eodhd' AND provider_symbol=? ORDER BY candle_time",
    )
    .bind(symbol)
    .fetch_all(&state.db)
    .await
    .map_err(AppError::from)?;
    Ok(rows.into_iter().map(Into::into).collect())
}

async fn load_hourly_bars(state: &AppState, symbol: &str) -> CommandResult<Vec<OhlcBar>> {
    let rows: Vec<StoredCandle> = sqlx::query_as(
        "SELECT candle_time / 1000 AS time,open,high,low,close FROM eodhd_intraday_candles
         WHERE provider_symbol=? AND interval_seconds=3600 ORDER BY candle_time",
    )
    .bind(symbol)
    .fetch_all(&state.db)
    .await
    .map_err(AppError::from)?;
    Ok(rows.into_iter().map(Into::into).collect())
}

impl From<StoredCandle> for OhlcBar {
    fn from(value: StoredCandle) -> Self {
        Self {
            time: value.time,
            open: value.open,
            high: value.high,
            low: value.low,
            close: value.close,
        }
    }
}

fn apply_freshness(mut assessment: TrendAssessment, now: i64, four_hour: bool) -> TrendAssessment {
    let Some(latest) = assessment.latest_candle_at else {
        return assessment;
    };
    let weekday = chrono::DateTime::from_timestamp(now, 0)
        .map(|value| value.weekday())
        .unwrap_or(Weekday::Mon);
    let max_age = if four_hour {
        if matches!(weekday, Weekday::Sat | Weekday::Sun | Weekday::Mon) {
            72 * 3_600
        } else {
            12 * 3_600
        }
    } else {
        4 * 86_400
    };
    let candle_end = latest + if four_hour { 14_400 } else { 86_400 };
    if now.saturating_sub(candle_end) > max_age {
        assessment.signal = None;
        assessment.reason_code = "stale_completed_candles";
    }
    assessment
}

fn timeframe_view(assessment: TrendAssessment, inverted: bool) -> TimeframeTrendView {
    let signal = orient_signal(assessment.signal, inverted);
    TimeframeTrendView {
        signal,
        status: signal_status(signal),
        reason_codes: vec![assessment.reason_code.into()],
        bars: assessment.bars,
        latest_candle_at: assessment
            .latest_candle_at
            .and_then(|value| chrono::DateTime::from_timestamp(value, 0))
            .map(|value| value.to_rfc3339()),
        ohlc4: assessment.ohlc4,
        ema20: assessment.ema20,
        ema50: assessment.ema50,
        normalized_slope: assessment.normalized_slope.map(
            |value| {
                if inverted { -value } else { value }
            },
        ),
        adx14: assessment.adx14,
        plus_di14: if inverted {
            assessment.minus_di14
        } else {
            assessment.plus_di14
        },
        minus_di14: if inverted {
            assessment.plus_di14
        } else {
            assessment.minus_di14
        },
    }
}

fn seasonality_view(profile_json: &str, inverted: bool) -> SeasonalityTrendView {
    let Ok(profile) = serde_json::from_str::<StoredSeasonalityScoringProfile>(profile_json) else {
        return unavailable_seasonality("seasonality_profile_invalid");
    };
    let Some(metric) = profile
        .forward_returns
        .iter()
        .find(|metric| metric.trading_days == 20)
    else {
        return unavailable_seasonality("seasonality_20d_window_unavailable");
    };
    if profile.quality_status != "available"
        || profile.complete_years < SEASONALITY_MIN_YEARS
        || metric.samples < SEASONALITY_MIN_YEARS
    {
        let mut output = unavailable_seasonality("seasonality_history_insufficient");
        output.trading_days = 20;
        output.samples = metric.samples;
        output.complete_years = profile.complete_years;
        output.calculated_at = Some(profile.calculated_at);
        return output;
    }
    let raw_signal = match (
        metric.average_return,
        metric.median_return,
        metric.positive_ratio,
    ) {
        (Some(mean), Some(median), Some(hit)) if mean > 0.0 && median > 0.0 && hit >= 0.60 => 1,
        (Some(mean), Some(median), Some(hit)) if mean < 0.0 && median < 0.0 && hit <= 0.40 => -1,
        _ => 0,
    };
    let signal = orient_signal(Some(raw_signal), inverted);
    SeasonalityTrendView {
        signal,
        status: signal_status(signal),
        reason_codes: vec![if raw_signal == 0 {
            "seasonality_evidence_mixed".into()
        } else {
            "seasonality_20d_confirmed".into()
        }],
        trading_days: 20,
        average_return: metric
            .average_return
            .map(|value| if inverted { -value } else { value }),
        median_return: metric
            .median_return
            .map(|value| if inverted { -value } else { value }),
        positive_ratio: metric
            .positive_ratio
            .map(|value| if inverted { 1.0 - value } else { value }),
        samples: metric.samples,
        complete_years: profile.complete_years,
        calculated_at: Some(profile.calculated_at),
    }
}

fn unavailable_chart(reason: &str) -> ChartTrendView {
    ChartTrendView {
        signal: None,
        status: "unavailable".into(),
        reason_codes: vec![reason.into()],
        four_hour: unavailable_timeframe(reason),
        daily: unavailable_timeframe(reason),
    }
}

fn unavailable_timeframe(reason: &str) -> TimeframeTrendView {
    TimeframeTrendView {
        signal: None,
        status: "unavailable".into(),
        reason_codes: vec![reason.into()],
        bars: 0,
        latest_candle_at: None,
        ohlc4: None,
        ema20: None,
        ema50: None,
        normalized_slope: None,
        adx14: None,
        plus_di14: None,
        minus_di14: None,
    }
}

fn unavailable_seasonality(reason: &str) -> SeasonalityTrendView {
    SeasonalityTrendView {
        signal: None,
        status: "unavailable".into(),
        reason_codes: vec![reason.into()],
        trading_days: 20,
        average_return: None,
        median_return: None,
        positive_ratio: None,
        samples: 0,
        complete_years: 0,
        calculated_at: None,
    }
}

fn orient_signal(signal: Option<i8>, inverted: bool) -> Option<i8> {
    signal.map(|value| if inverted { -value } else { value })
}

fn signal_status(signal: Option<i8>) -> String {
    match signal {
        Some(1) => "bullish",
        Some(-1) => "bearish",
        Some(0) => "neutral",
        _ => "unavailable",
    }
    .into()
}

async fn sync_instrument(
    state: &AppState,
    client: &reqwest::Client,
    api_key: &str,
    instrument: &InstrumentRow,
) -> CommandResult<()> {
    let now = Utc::now();
    sqlx::query(
        "INSERT INTO eodhd_technical_sync_state(provider_symbol,status,last_attempt_at,next_refresh_at,error_message)
         VALUES(?,'running',?,NULL,NULL)
         ON CONFLICT(provider_symbol) DO UPDATE SET status='running',last_attempt_at=excluded.last_attempt_at,next_refresh_at=NULL,error_message=NULL",
    )
    .bind(&instrument.provider_symbol)
    .bind(now.to_rfc3339())
    .execute(&state.db)
    .await
    .map_err(AppError::from)?;

    let last_candle: Option<i64> = sqlx::query_scalar(
        "SELECT MAX(candle_time) FROM eodhd_intraday_candles WHERE provider_symbol=? AND interval_seconds=3600",
    )
    .bind(&instrument.provider_symbol)
    .fetch_one(&state.db)
    .await
    .map_err(AppError::from)?;
    let earliest = now - Duration::days(INTRADAY_INITIAL_DAYS);
    let from = last_candle
        .map(|value| value / 1_000 - INTRADAY_OVERLAP_DAYS * 86_400)
        .unwrap_or_else(|| earliest.timestamp())
        .max(earliest.timestamp());
    let result = eodhd_prices::intraday_hourly_history(
        client,
        api_key,
        &instrument.source_code,
        from,
        now.timestamp(),
    )
    .await;
    match result {
        Ok(bars) => {
            let latest = bars.last().map(|bar| bar.time);
            let fetched_at = now.to_rfc3339();
            let mut tx = state.db.begin().await.map_err(AppError::from)?;
            for bar in bars {
                sqlx::query(
                    "INSERT INTO eodhd_intraday_candles(provider_symbol,interval_seconds,candle_time,open,high,low,close,volume,fetched_at)
                     VALUES(?,3600,?,?,?,?,?,?,?)
                     ON CONFLICT(provider_symbol,interval_seconds,candle_time) DO UPDATE SET open=excluded.open,high=excluded.high,low=excluded.low,close=excluded.close,volume=excluded.volume,fetched_at=excluded.fetched_at",
                )
                .bind(&instrument.provider_symbol)
                .bind(bar.time)
                .bind(bar.open)
                .bind(bar.high)
                .bind(bar.low)
                .bind(bar.close)
                .bind(bar.volume)
                .bind(&fetched_at)
                .execute(&mut *tx)
                .await
                .map_err(AppError::from)?;
            }
            sqlx::query(
                "DELETE FROM eodhd_intraday_candles WHERE provider_symbol=? AND interval_seconds=3600 AND candle_time<?",
            )
            .bind(&instrument.provider_symbol)
            .bind((now - Duration::days(INTRADAY_RETENTION_DAYS)).timestamp_millis())
            .execute(&mut *tx)
            .await
            .map_err(AppError::from)?;
            sqlx::query(
                "UPDATE eodhd_technical_sync_state SET status='complete',last_success_at=?,last_candle_at=?,next_refresh_at=?,error_message=NULL WHERE provider_symbol=?",
            )
            .bind(&fetched_at)
            .bind(latest)
            .bind((now + Duration::hours(TECHNICAL_REFRESH_HOURS)).to_rfc3339())
            .bind(&instrument.provider_symbol)
            .execute(&mut *tx)
            .await
            .map_err(AppError::from)?;
            tx.commit().await.map_err(AppError::from)?;
            Ok(())
        }
        Err(error) => {
            let message = if error.code == "EODHD_SEASONALITY_PROVIDER_ERROR" {
                "EODHD-Intraday-Daten konnten nicht geladen werden."
            } else {
                "Technische Marktdaten konnten nicht aktualisiert werden."
            };
            sqlx::query(
                "UPDATE eodhd_technical_sync_state SET status='failed',next_refresh_at=?,error_message=? WHERE provider_symbol=?",
            )
            .bind((now + Duration::hours(FAILED_RETRY_HOURS)).to_rfc3339())
            .bind(message)
            .bind(&instrument.provider_symbol)
            .execute(&state.db)
            .await
            .map_err(AppError::from)?;
            Err(error)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn profile(mean: f64, median: f64, hit: f64, years: usize) -> String {
        serde_json::json!({
            "calculatedAt": "2026-08-26T10:00:00Z",
            "completeYears": years,
            "qualityStatus": if years >= 10 { "available" } else { "insufficient_history" },
            "forwardReturns": [{
                "tradingDays": 20,
                "averageReturn": mean,
                "medianReturn": median,
                "positiveRatio": hit,
                "samples": years
            }]
        })
        .to_string()
    }

    #[test]
    fn seasonality_distinguishes_neutral_from_unavailable() {
        assert_eq!(
            seasonality_view(&profile(0.02, 0.01, 0.7, 10), false).signal,
            Some(1)
        );
        assert_eq!(
            seasonality_view(&profile(-0.02, -0.01, 0.3, 10), false).signal,
            Some(-1)
        );
        let neutral = seasonality_view(&profile(0.02, -0.01, 0.5, 10), false);
        assert_eq!(neutral.signal, Some(0));
        assert_eq!(neutral.status, "neutral");
        let unavailable = seasonality_view(&profile(0.02, 0.01, 0.7, 4), false);
        assert_eq!(unavailable.signal, None);
        assert_eq!(unavailable.status, "unavailable");
    }

    #[test]
    fn direct_and_inverse_signals_are_antisymmetric() {
        for signal in [-1, 0, 1] {
            assert_eq!(orient_signal(Some(signal), true), Some(-signal));
        }
        assert_eq!(orient_signal(None, true), None);
        let inverse = seasonality_view(&profile(0.02, 0.01, 0.7, 10), true);
        assert_eq!(inverse.signal, Some(-1));
        assert!((inverse.positive_ratio.unwrap() - 0.3).abs() < 0.000_001);
    }
}
