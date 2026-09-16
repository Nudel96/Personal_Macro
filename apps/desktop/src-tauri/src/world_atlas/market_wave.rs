//! Descriptive, causal deviation from a rolling log-price trend. No forecast or valuation.
use chrono::{Datelike, NaiveDate};

use super::market_models::{MarketAnalysis, MarketMonth, WavePoint};

pub const RECIPE: &str = "log-ols60-trailing12-rank120-min60-v1";
const TREND: usize = 60;
const SMOOTH: usize = 12;

pub fn month_index(month: &str) -> Option<i32> {
    let date = NaiveDate::parse_from_str(&format!("{month}-01"), "%Y-%m-%d").ok()?;
    Some(date.year() * 12 + date.month0() as i32)
}

pub fn month_label(index: i32) -> String {
    format!(
        "{:04}-{:02}",
        index.div_euclid(12),
        index.rem_euclid(12) + 1
    )
}

pub fn analyze(months: &[MarketMonth], breaks: &[String], today: NaiveDate) -> MarketAnalysis {
    let mut result = analyze_windows(months, breaks, today, TREND, SMOOTH);
    if !result.stale
        && let Some(latest) = result.points.last().and_then(|p| p.wave)
    {
        let direction = |value: f64| {
            if value.abs() < 1e-8 {
                0
            } else if value > 0.0 {
                1
            } else {
                -1
            }
        };
        let alternatives: Option<Vec<_>> = [(48, 12), (84, 12), (60, 6), (60, 18)]
            .into_iter()
            .map(|(trend, smooth)| {
                analyze_windows(months, breaks, today, trend, smooth)
                    .points
                    .last()
                    .and_then(|p| p.wave)
            })
            .collect();
        result.parameter_sensitive = alternatives.map(|values| {
            values
                .into_iter()
                .any(|value| direction(value) != direction(latest))
        });
    }
    result
}

fn analyze_windows(
    months: &[MarketMonth],
    breaks: &[String],
    today: NaiveDate,
    trend: usize,
    smooth: usize,
) -> MarketAnalysis {
    let completed = today.year() * 12 + today.month0() as i32 - 1;
    let mut points = Vec::new();
    let mut logs: Vec<f64> = Vec::new();
    let mut residuals: Vec<f64> = Vec::new();
    let mut waves: Vec<f64> = Vec::new();
    let mut previous = None;
    let mut last_observation = None;
    let mut history_months = 0;
    let mut missing_months = 0;
    for item in months {
        let Some(index) = month_index(&item.month).filter(|i| *i <= completed) else {
            continue;
        };
        if previous.is_some_and(|p| index != p + 1) || breaks.contains(&item.month) {
            logs.clear();
            residuals.clear();
            waves.clear();
        }
        previous = Some(index);
        let mut point = WavePoint {
            month: item.month.clone(),
            adjusted_close: item.adjusted_close,
            wave: None,
            percentile: None,
        };
        if let Some(value) = item.adjusted_close.filter(|v| v.is_finite() && *v > 0.0) {
            history_months += 1;
            last_observation = Some(item.month.clone());
            logs.push(value.ln());
            if logs.len() >= trend {
                let window = &logs[logs.len() - trend..];
                let x_mean = (trend - 1) as f64 / 2.0;
                let mean = window.iter().sum::<f64>() / trend as f64;
                let numerator: f64 = window
                    .iter()
                    .enumerate()
                    .map(|(i, y)| (i as f64 - x_mean) * (y - mean))
                    .sum();
                let denominator: f64 = (0..trend).map(|i| (i as f64 - x_mean).powi(2)).sum();
                residuals.push(window[trend - 1] - (mean + numerator / denominator * x_mean));
                if residuals.len() >= smooth {
                    let mean =
                        residuals[residuals.len() - smooth..].iter().sum::<f64>() / smooth as f64;
                    let wave = if mean.abs() < 1e-12 {
                        0.0
                    } else {
                        100.0 * mean.exp_m1()
                    };
                    point.wave = Some(wave);
                    // Past values only; a new observation never rewrites an earlier rank.
                    let reference = &waves[waves.len().saturating_sub(120)..];
                    if reference.len() >= 60 {
                        let min = reference.iter().copied().reduce(f64::min).unwrap();
                        let max = reference.iter().copied().reduce(f64::max).unwrap();
                        if max - min > 1e-8 {
                            let below = reference.iter().filter(|v| **v < wave).count();
                            let ties = reference.iter().filter(|v| **v == wave).count();
                            point.percentile =
                                Some((below as f64 + ties as f64 * 0.5) / reference.len() as f64);
                        }
                    }
                    waves.push(wave);
                }
            }
        } else {
            point.adjusted_close = None;
            missing_months += 1;
            logs.clear();
            residuals.clear();
            waves.clear();
        }
        points.push(point);
    }
    let stale = last_observation
        .as_deref()
        .and_then(month_index)
        .is_some_and(|last| last < completed);
    let latest = points.last().and_then(|point| point.wave);
    let state = if stale {
        "stale"
    } else {
        match latest {
            None => "insufficient_history",
            Some(wave) if wave > 1e-8 => "above_trend",
            Some(wave) if wave < -1e-8 => "below_trend",
            _ => "at_trend",
        }
    }
    .into();
    let wave_months = points.iter().filter(|p| p.wave.is_some()).count();
    MarketAnalysis {
        recipe: RECIPE.into(),
        points,
        state,
        history_months,
        wave_months,
        missing_months,
        stale,
        last_observation,
        parameter_sensitive: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture(n: usize, cycle: bool) -> Vec<MarketMonth> {
        (0..n)
            .map(|i| MarketMonth {
                month: month_label(2000 * 12 + i as i32),
                adjusted_close: Some(
                    (4.0 + i as f64 * 0.003
                        + if cycle {
                            0.4 * (i as f64 / 16.0).sin()
                        } else {
                            0.0
                        })
                    .exp(),
                ),
            })
            .collect()
    }
    fn today() -> NaiveDate {
        NaiveDate::from_ymd_opt(2030, 1, 1).unwrap()
    }

    #[test]
    fn world_atlas_wave_is_causal_scale_invariant_and_not_a_forced_cycle() {
        let linear = analyze(&fixture(240, false), &[], today());
        assert!(
            linear
                .points
                .iter()
                .filter_map(|p| p.wave)
                .all(|v| v == 0.0)
        );
        assert!(linear.points.iter().all(|p| p.percentile.is_none()));
        let rows = fixture(240, true);
        let full = analyze(&rows, &[], today());
        let prefix = analyze(&rows[..180], &[], today());
        for (a, b) in full.points.iter().zip(&prefix.points) {
            assert_eq!(a.wave, b.wave);
            assert_eq!(a.percentile, b.percentile);
        }
        assert!(full.points.iter().filter_map(|p| p.wave).any(|v| v < 0.0));
        assert!(full.points.iter().filter_map(|p| p.wave).any(|v| v > 0.0));
        let scaled: Vec<_> = rows
            .iter()
            .map(|p| MarketMonth {
                month: p.month.clone(),
                adjusted_close: p.adjusted_close.map(|v| v * 10.0),
            })
            .collect();
        for (a, b) in full
            .points
            .iter()
            .zip(analyze(&scaled, &[], today()).points)
        {
            if let (Some(x), Some(y)) = (a.wave, b.wave) {
                assert!((x - y).abs() < 1e-9);
            }
        }
    }

    #[test]
    fn world_atlas_wave_respects_gaps_breaks_warmup_and_closed_months() {
        let mut rows = fixture(240, true);
        rows[160].adjusted_close = None;
        let analysis = analyze(&rows, &["2007-01".into()], today());
        assert!(analysis.points[..70].iter().all(|p| p.wave.is_none()));
        assert!(analysis.points[84..154].iter().all(|p| p.wave.is_none()));
        assert!(analysis.points[160..231].iter().all(|p| p.wave.is_none()));
        assert!(analysis.points[231].wave.is_some());
        assert_eq!(analysis.missing_months, 1);
        let before_current = analyze(
            &fixture(72, true),
            &[],
            NaiveDate::from_ymd_opt(2005, 12, 31).unwrap(),
        );
        assert_eq!(before_current.points.len(), 71);
        assert!(before_current.points.last().unwrap().wave.is_some());
    }

    #[test]
    fn world_atlas_wave_reports_timeframe_sensitivity_without_guessing_short_histories() {
        let rows = fixture(240, true);
        assert_eq!(
            analyze(
                &rows[..72],
                &[],
                NaiveDate::from_ymd_opt(2006, 1, 1).unwrap()
            )
            .parameter_sensitive,
            None
        );
        let states: Vec<_> = (150..240)
            .map(|len| {
                let next = month_label(2000 * 12 + len as i32);
                analyze(
                    &rows[..len],
                    &[],
                    NaiveDate::parse_from_str(&format!("{next}-01"), "%Y-%m-%d").unwrap(),
                )
                .parameter_sensitive
            })
            .collect();
        assert!(states.contains(&Some(true)));
        assert!(states.contains(&Some(false)));
        assert_eq!(analyze(&rows, &[], today()).parameter_sensitive, None);
    }
}
