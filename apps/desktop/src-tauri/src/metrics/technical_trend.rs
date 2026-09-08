use std::collections::BTreeMap;

pub const TECHNICAL_TREND_VERSION: &str = "ohlc4-ema-dmi-v1";
const MIN_BARS: usize = 100;
const DMI_PERIOD: usize = 14;
const SLOPE_LOOKBACK: usize = 3;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct OhlcBar {
    pub time: i64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct TrendAssessment {
    pub signal: Option<i8>,
    pub reason_code: &'static str,
    pub bars: usize,
    pub latest_candle_at: Option<i64>,
    pub ohlc4: Option<f64>,
    pub ema20: Option<f64>,
    pub ema50: Option<f64>,
    pub normalized_slope: Option<f64>,
    pub adx14: Option<f64>,
    pub plus_di14: Option<f64>,
    pub minus_di14: Option<f64>,
}

impl TrendAssessment {
    fn unavailable(bars: usize, latest_candle_at: Option<i64>, reason_code: &'static str) -> Self {
        Self {
            signal: None,
            reason_code,
            bars,
            latest_candle_at,
            ohlc4: None,
            ema20: None,
            ema50: None,
            normalized_slope: None,
            adx14: None,
            plus_di14: None,
            minus_di14: None,
        }
    }
}

#[derive(Debug, Clone, Copy)]
struct DmiValue {
    atr: f64,
    adx: f64,
    plus_di: f64,
    minus_di: f64,
}

pub fn aggregate_hourly_to_four_hour(hourly: &[OhlcBar], completed_before: i64) -> Vec<OhlcBar> {
    let mut buckets = BTreeMap::<i64, Vec<OhlcBar>>::new();
    for bar in hourly.iter().copied().filter(valid_bar) {
        let bucket = bar.time.div_euclid(14_400) * 14_400;
        if bucket + 14_400 <= completed_before {
            buckets.entry(bucket).or_default().push(bar);
        }
    }

    buckets
        .into_iter()
        .filter_map(|(bucket, mut bars)| {
            bars.sort_by_key(|bar| bar.time);
            bars.dedup_by_key(|bar| bar.time);
            let expected = [bucket, bucket + 3_600, bucket + 7_200, bucket + 10_800];
            if bars.len() != expected.len()
                || !bars
                    .iter()
                    .zip(expected)
                    .all(|(bar, expected_time)| bar.time == expected_time)
            {
                return None;
            }
            Some(OhlcBar {
                time: bucket,
                open: bars[0].open,
                high: bars
                    .iter()
                    .map(|bar| bar.high)
                    .fold(f64::NEG_INFINITY, f64::max),
                low: bars.iter().map(|bar| bar.low).fold(f64::INFINITY, f64::min),
                close: bars[3].close,
            })
        })
        .collect()
}

pub fn assess_trend(bars: &[OhlcBar]) -> TrendAssessment {
    let mut bars = bars.iter().copied().filter(valid_bar).collect::<Vec<_>>();
    bars.sort_by_key(|bar| bar.time);
    bars.dedup_by_key(|bar| bar.time);
    let latest = bars.last().map(|bar| bar.time);
    if bars.len() < MIN_BARS {
        return TrendAssessment::unavailable(bars.len(), latest, "insufficient_completed_bars");
    }

    let prices = bars
        .iter()
        .map(|bar| (bar.open + bar.high + bar.low + bar.close) / 4.0)
        .collect::<Vec<_>>();
    let ema20 = ema_series(&prices, 20);
    let ema50 = ema_series(&prices, 50);
    let Some(dmi) = dmi_adx(&bars, DMI_PERIOD) else {
        return TrendAssessment::unavailable(bars.len(), latest, "indicator_warmup_unavailable");
    };
    let index = prices.len() - 1;
    let slope = (ema20[index] - ema20[index - SLOPE_LOOKBACK]) / dmi.atr.max(f64::EPSILON);
    let bullish = prices[index] > ema20[index]
        && ema20[index] > ema50[index]
        && slope >= 0.10
        && dmi.plus_di > dmi.minus_di
        && dmi.adx >= 20.0;
    let bearish = prices[index] < ema20[index]
        && ema20[index] < ema50[index]
        && slope <= -0.10
        && dmi.minus_di > dmi.plus_di
        && dmi.adx >= 20.0;
    let signal = if bullish {
        1
    } else if bearish {
        -1
    } else {
        0
    };

    TrendAssessment {
        signal: Some(signal),
        reason_code: if signal == 0 {
            "mixed_or_weak_trend"
        } else {
            "trend_confirmed"
        },
        bars: bars.len(),
        latest_candle_at: latest,
        ohlc4: Some(prices[index]),
        ema20: Some(ema20[index]),
        ema50: Some(ema50[index]),
        normalized_slope: Some(slope),
        adx14: Some(dmi.adx),
        plus_di14: Some(dmi.plus_di),
        minus_di14: Some(dmi.minus_di),
    }
}

pub fn combine_timeframes(daily: Option<i8>, four_hour: Option<i8>) -> Option<i8> {
    match (daily, four_hour) {
        (Some(1), Some(1)) => Some(1),
        (Some(-1), Some(-1)) => Some(-1),
        (Some(_), Some(_)) => Some(0),
        _ => None,
    }
}

fn valid_bar(bar: &OhlcBar) -> bool {
    [bar.open, bar.high, bar.low, bar.close]
        .into_iter()
        .all(|value| value.is_finite() && value > 0.0)
        && bar.high >= bar.open.max(bar.close).max(bar.low)
        && bar.low <= bar.open.min(bar.close).min(bar.high)
}

fn ema_series(values: &[f64], period: usize) -> Vec<f64> {
    let multiplier = 2.0 / (period as f64 + 1.0);
    let mut output = Vec::with_capacity(values.len());
    for (index, value) in values.iter().copied().enumerate() {
        let next = if index == 0 {
            value
        } else {
            (value - output[index - 1]) * multiplier + output[index - 1]
        };
        output.push(next);
    }
    output
}

fn dmi_adx(bars: &[OhlcBar], period: usize) -> Option<DmiValue> {
    if bars.len() < period * 2 + 1 {
        return None;
    }
    let mut true_ranges = Vec::with_capacity(bars.len() - 1);
    let mut plus_dm = Vec::with_capacity(bars.len() - 1);
    let mut minus_dm = Vec::with_capacity(bars.len() - 1);
    for pair in bars.windows(2) {
        let previous = pair[0];
        let current = pair[1];
        let up = current.high - previous.high;
        let down = previous.low - current.low;
        plus_dm.push(if up > down && up > 0.0 { up } else { 0.0 });
        minus_dm.push(if down > up && down > 0.0 { down } else { 0.0 });
        true_ranges.push(
            (current.high - current.low)
                .max((current.high - previous.close).abs())
                .max((current.low - previous.close).abs()),
        );
    }

    let mut smooth_tr: f64 = true_ranges[..period].iter().sum();
    let mut smooth_plus: f64 = plus_dm[..period].iter().sum();
    let mut smooth_minus: f64 = minus_dm[..period].iter().sum();
    let mut dx_values = Vec::new();
    dx_values.push(dx(smooth_tr, smooth_plus, smooth_minus));
    for index in period..true_ranges.len() {
        smooth_tr = smooth_tr - smooth_tr / period as f64 + true_ranges[index];
        smooth_plus = smooth_plus - smooth_plus / period as f64 + plus_dm[index];
        smooth_minus = smooth_minus - smooth_minus / period as f64 + minus_dm[index];
        dx_values.push(dx(smooth_tr, smooth_plus, smooth_minus));
    }
    if dx_values.len() < period {
        return None;
    }
    let mut adx = dx_values[..period].iter().sum::<f64>() / period as f64;
    for value in &dx_values[period..] {
        adx = (adx * (period as f64 - 1.0) + value) / period as f64;
    }
    let plus_di = if smooth_tr > 0.0 {
        100.0 * smooth_plus / smooth_tr
    } else {
        0.0
    };
    let minus_di = if smooth_tr > 0.0 {
        100.0 * smooth_minus / smooth_tr
    } else {
        0.0
    };
    Some(DmiValue {
        atr: smooth_tr / period as f64,
        adx,
        plus_di,
        minus_di,
    })
}

fn dx(true_range: f64, plus_dm: f64, minus_dm: f64) -> f64 {
    if true_range <= 0.0 {
        return 0.0;
    }
    let plus_di = 100.0 * plus_dm / true_range;
    let minus_di = 100.0 * minus_dm / true_range;
    let denominator = plus_di + minus_di;
    if denominator <= 0.0 {
        0.0
    } else {
        100.0 * (plus_di - minus_di).abs() / denominator
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn trend_bars(direction: f64, count: usize, step_seconds: i64) -> Vec<OhlcBar> {
        (0..count)
            .map(|index| {
                let center = 100.0 + direction * index as f64 * 0.35;
                OhlcBar {
                    time: index as i64 * step_seconds,
                    open: center - direction * 0.08,
                    high: center + 0.30,
                    low: center - 0.30,
                    close: center + direction * 0.08,
                }
            })
            .collect()
    }

    #[test]
    fn aggregates_only_complete_utc_four_hour_buckets() {
        let mut hourly = trend_bars(1.0, 8, 3_600);
        hourly.pop();
        let aggregated = aggregate_hourly_to_four_hour(&hourly, 8 * 3_600);
        assert_eq!(aggregated.len(), 1);
        assert_eq!(aggregated[0].open, hourly[0].open);
        assert_eq!(aggregated[0].close, hourly[3].close);
        assert_eq!(
            aggregated[0].high,
            hourly[..4]
                .iter()
                .map(|bar| bar.high)
                .fold(f64::NEG_INFINITY, f64::max)
        );
    }

    #[test]
    fn identifies_confirmed_bullish_and_bearish_vectors() {
        assert_eq!(assess_trend(&trend_bars(1.0, 120, 14_400)).signal, Some(1));
        assert_eq!(
            assess_trend(&trend_bars(-1.0, 120, 14_400)).signal,
            Some(-1)
        );
    }

    #[test]
    fn keeps_insufficient_evidence_unavailable() {
        let result = assess_trend(&trend_bars(1.0, 40, 86_400));
        assert_eq!(result.signal, None);
        assert_eq!(result.reason_code, "insufficient_completed_bars");
    }

    #[test]
    fn requires_timeframe_agreement() {
        assert_eq!(combine_timeframes(Some(1), Some(1)), Some(1));
        assert_eq!(combine_timeframes(Some(-1), Some(-1)), Some(-1));
        assert_eq!(combine_timeframes(Some(1), Some(-1)), Some(0));
        assert_eq!(combine_timeframes(Some(1), Some(0)), Some(0));
        assert_eq!(combine_timeframes(Some(1), None), None);
    }
}
