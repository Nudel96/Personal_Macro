use std::collections::HashMap;

use crate::runtime::State;
use chrono::{Datelike, Utc, Weekday};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

use crate::{
    database::AppState,
    errors::{AppError, CommandError, CommandResult},
    metrics::technical_trend::{
        OhlcBar, TECHNICAL_TREND_VERSION, TrendAssessment, aggregate_hourly_to_four_hour,
        assess_trend, combine_timeframes,
    },
};

pub(super) const FOREX_PRIORITY: [&str; 9] = [
    "EUR", "GBP", "AUD", "NZD", "USD", "CAD", "CHF", "JPY", "CNY",
];
const SEASONALITY_MIN_YEARS: usize = 10;

/// Keep the existing 36 fiat orientations and append only the two USD metals.
pub(super) fn technical_pairs() -> Vec<(&'static str, &'static str)> {
    FOREX_PRIORITY
        .iter()
        .enumerate()
        .flat_map(|(index, base)| {
            FOREX_PRIORITY
                .iter()
                .skip(index + 1)
                .map(move |quote| (*base, *quote))
        })
        .chain([("XAU", "USD"), ("XAG", "USD")])
        .collect()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairTechnicalDashboard {
    pub as_of: String,
    pub method_version: String,
    pub pairs: Vec<PairTechnicalSignalView>,
    pub refresh: Option<super::mt5_technicals::Mt5RefreshView>,
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
    pub source: Option<ChartTrendSource>,
    pub four_hour: TimeframeTrendView,
    pub daily: TimeframeTrendView,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChartTrendSource {
    pub provider: String,
    pub label: Option<String>,
    pub symbol: Option<String>,
    pub inverted: bool,
    pub fetched_at: Option<String>,
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

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn get_pair_technical_signals(
    state: State<'_, AppState>,
) -> CommandResult<PairTechnicalDashboard> {
    load_pair_technical_signals(&state).await
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn refresh_pair_technical_signals(
    state: State<'_, AppState>,
) -> CommandResult<PairTechnicalDashboard> {
    crate::runtime::require_desktop()?;
    super::mt5_technicals::refresh(&state, true).await?;
    load_pair_technical_signals(&state).await
}

pub async fn scheduled_technical_signal_sync(state: &AppState) -> CommandResult<()> {
    crate::runtime::require_desktop()?;
    super::mt5_technicals::refresh(state, false).await
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
    let (refresh, mut mt5_charts) = if cfg!(feature = "desktop") {
        let (refresh, charts) = super::mt5_technicals::load(state, now).await?;
        (Some(refresh), charts)
    } else {
        (None, HashMap::new())
    };
    let mut pairs = Vec::with_capacity(38);
    for (base, quote) in technical_pairs() {
        let direct = by_pair.get(&(base, quote)).copied();
        let inverse = by_pair.get(&(quote, base)).copied();
        let (instrument, inverted) = direct
            .map(|value| (Some(value), false))
            .or_else(|| inverse.map(|value| (Some(value), true)))
            .unwrap_or((None, false));
        pairs.push(
            build_pair_view(
                state,
                base,
                quote,
                instrument,
                inverted,
                now.timestamp(),
                mt5_charts.remove(&(base.to_string(), quote.to_string())),
            )
            .await?,
        );
    }
    Ok(PairTechnicalDashboard {
        as_of: now.to_rfc3339(),
        method_version: TECHNICAL_TREND_VERSION.into(),
        pairs,
        refresh,
    })
}

async fn build_pair_view(
    state: &AppState,
    base: &str,
    quote: &str,
    instrument: Option<&InstrumentRow>,
    inverted: bool,
    now: i64,
    mt5_chart: Option<ChartTrendView>,
) -> CommandResult<PairTechnicalSignalView> {
    let Some(instrument) = instrument else {
        return Ok(PairTechnicalSignalView {
            base: base.into(),
            quote: quote.into(),
            source_symbol: None,
            inverted: false,
            chart_trend: mt5_chart
                .unwrap_or_else(|| unavailable_chart("exact_pair_history_unavailable")),
            seasonality_trend: unavailable_seasonality("exact_pair_history_unavailable"),
        });
    };

    let chart_trend = if let Some(chart) = mt5_chart {
        chart
    } else {
        // Existing cloud snapshots retain their original EODHD-only provenance.
        let daily = load_daily_bars(state, &instrument.provider_symbol).await?;
        let hourly = load_hourly_bars(state, &instrument.provider_symbol).await?;
        let current_hour = now.div_euclid(3_600) * 3_600;
        let four_hour = aggregate_hourly_to_four_hour(&hourly, current_hour);
        chart_view(
            timeframe_view(
                apply_freshness(assess_trend(&four_hour), now, true),
                inverted,
            ),
            timeframe_view(apply_freshness(assess_trend(&daily), now, false), inverted),
            Some(ChartTrendSource {
                provider: "eodhd".into(),
                label: Some("EODHD".into()),
                symbol: Some(instrument.display_symbol.clone()),
                inverted,
                fetched_at: None,
            }),
        )
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

pub(super) fn chart_view(
    four_hour: TimeframeTrendView,
    daily: TimeframeTrendView,
    source: Option<ChartTrendSource>,
) -> ChartTrendView {
    let signal = combine_timeframes(daily.signal, four_hour.signal);
    let reason = match signal {
        Some(1 | -1) => "timeframes_confirmed",
        Some(0) if daily.signal != four_hour.signal => "timeframes_mixed",
        Some(0) => "timeframes_neutral",
        _ => "timeframe_evidence_unavailable",
    };
    ChartTrendView {
        signal,
        status: signal_status(signal),
        reason_codes: vec![reason.into()],
        source,
        four_hour,
        daily,
    }
}

async fn load_instruments(state: &AppState) -> CommandResult<Vec<InstrumentRow>> {
    sqlx::query_as(
        "SELECT pi.provider_symbol,pi.display_symbol,pi.base_currency,pi.quote_currency,pp.profile_json
         FROM seasonality_provider_instruments pi
         LEFT JOIN seasonality_provider_profiles pp ON pp.provider=pi.provider AND pp.provider_symbol=pi.provider_symbol
         WHERE pi.provider='eodhd' AND pi.base_currency IS NOT NULL AND pi.quote_currency IS NOT NULL
           AND (pi.category='Forex' OR (pi.category='Commodities' AND pi.base_currency IN ('XAU','XAG') AND pi.quote_currency='USD'))
         ORDER BY pi.sync_priority,pi.display_symbol",
    )
    .fetch_all(&state.db)
    .await
    .map_err(AppError::from)
    .map_err(CommandError::from)
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

pub(super) fn timeframe_view(assessment: TrendAssessment, inverted: bool) -> TimeframeTrendView {
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
        source: None,
        four_hour: unavailable_timeframe(reason),
        daily: unavailable_timeframe(reason),
    }
}

pub(super) fn unavailable_timeframe(reason: &str) -> TimeframeTrendView {
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
    fn technical_universe_preserves_fiat_pairs_and_adds_only_usd_gold_and_silver() {
        let pairs = technical_pairs();
        assert_eq!(pairs.len(), 38);
        assert_eq!(
            pairs
                .iter()
                .copied()
                .collect::<std::collections::HashSet<_>>()
                .len(),
            38
        );
        assert_eq!(&pairs[36..], &[("XAU", "USD"), ("XAG", "USD")]);
        assert_eq!(pairs[0], ("EUR", "GBP"));
        assert_eq!(pairs[35], ("JPY", "CNY"));
    }

    #[tokio::test]
    async fn usd_metals_read_their_own_eodhd_seasonality_and_keep_missing_evidence_explicit() {
        let directory = tempfile::tempdir().unwrap();
        let state = crate::database::initialize_at(directory.path().join("workspace"))
            .await
            .unwrap();
        for (base, mean, median, hit) in [("XAU", 0.02, 0.01, 0.7), ("XAG", -0.02, -0.01, 0.3)] {
            let symbol = format!("{base}USD.FOREX");
            sqlx::query("INSERT INTO seasonality_provider_instruments(provider,provider_symbol,display_symbol,category,base_currency,quote_currency,last_catalogued_at) VALUES('eodhd',?,?,'Commodities',?,'USD','2026-10-07') ON CONFLICT(provider,provider_symbol) DO UPDATE SET category='Commodities',base_currency=excluded.base_currency,quote_currency='USD'")
                .bind(&symbol).bind(format!("{base}USD")).bind(base).execute(&state.db).await.unwrap();
            sqlx::query("INSERT INTO seasonality_provider_profiles(provider,provider_symbol,calculated_at,complete_years,quality_status,profile_json) VALUES('eodhd',?,'2026-10-07',10,'available',?)")
                .bind(&symbol).bind(profile(mean,median,hit,10)).execute(&state.db).await.unwrap();
        }
        let dashboard = load_pair_technical_signals(&state).await.unwrap();
        assert_eq!(dashboard.pairs.len(), 38);
        for (base, expected) in [("XAU", 1), ("XAG", -1)] {
            let metal = dashboard
                .pairs
                .iter()
                .find(|pair| pair.base == base && pair.quote == "USD")
                .unwrap();
            assert_eq!(metal.seasonality_trend.signal, Some(expected));
            assert_eq!(metal.seasonality_trend.complete_years, 10);
            assert!(!metal.inverted);
            assert_eq!(metal.chart_trend.signal, None);
        }
        sqlx::query("DELETE FROM seasonality_provider_instruments WHERE provider='eodhd' AND base_currency IN ('XAU','XAG')").execute(&state.db).await.unwrap();
        let missing = load_pair_technical_signals(&state).await.unwrap();
        assert!(
            missing
                .pairs
                .iter()
                .filter(|pair| pair.base == "XAU" || pair.base == "XAG")
                .all(|pair| pair.seasonality_trend.signal.is_none())
        );
        state.db.close().await;
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
