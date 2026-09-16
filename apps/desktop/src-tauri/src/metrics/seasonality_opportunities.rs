//! Calendar-window research on raw daily prices. No Macro scores or price writes.
//! Pair windows use identical observation dates and the same complete-year cohort.

use std::{cmp::Ordering, collections::BTreeMap};

use chrono::{Datelike, Duration, NaiveDate};
use serde::{Deserialize, Serialize};

#[cfg(test)]
#[path = "seasonality_opportunities_tests.rs"]
mod tests;

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum OpportunityUniverse {
    FxFutures,
    Forex,
    All,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpportunityInput {
    pub as_of: NaiveDate,
    pub month: Option<u32>,
    pub universe: OpportunityUniverse,
    pub limit: usize,
    pub min_days: u32,
    pub max_days: u32,
    pub min_years: usize,
    pub lookback_years: i32,
    pub upcoming_only: bool,
}

impl OpportunityInput {
    pub fn validate(&self) -> Result<(), &'static str> {
        if !(1900..=2200).contains(&self.as_of.year())
            || self.month.is_some_and(|month| !(1..=12).contains(&month))
        {
            return Err("Bitte wähle einen gültigen Monat und Stichtag.");
        }
        if !(1..=10).contains(&self.limit) {
            return Err("Wähle zwischen 1 und 10 Fenstern.");
        }
        if self.min_days < 5 || self.max_days > 90 || self.min_days > self.max_days {
            return Err("Die Fensterlänge muss zwischen 5 und 90 Kalendertagen liegen.");
        }
        if !(5..=50).contains(&self.min_years)
            || !(5..=50).contains(&self.lookback_years)
            || self.min_years > self.lookback_years as usize
        {
            return Err(
                "Wähle mindestens 5 Untersuchungsjahre und eine passende Mindeststichprobe.",
            );
        }
        Ok(())
    }
}

#[derive(Debug, Clone)]
pub struct OpportunitySeries {
    pub symbol: String,
    pub label: String,
    pub currency: Option<String>,
    pub source: String,
    pub source_symbol: String,
    pub inverted: bool,
    pub prices: BTreeMap<NaiveDate, f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpportunityObservation {
    pub year: i32,
    pub entry_date: NaiveDate,
    pub exit_date: NaiveDate,
    pub return_value: f64,
    pub comparison_return: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpportunityCurvePoint {
    pub day: u32,
    pub mean: Option<f64>,
    pub samples: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeasonalOpportunity {
    pub id: String,
    pub symbol: String,
    pub label: String,
    pub comparison_symbol: Option<String>,
    pub comparison_label: Option<String>,
    pub start_date: NaiveDate,
    pub end_date: NaiveDate,
    pub calendar_days: u32,
    pub direction: i8,
    pub mean_return: f64,
    pub median_return: f64,
    pub comparison_mean_return: Option<f64>,
    pub comparison_median_return: Option<f64>,
    pub mean_difference: Option<f64>,
    pub median_difference: Option<f64>,
    pub hit_rate: f64,
    pub wilson_lower_bound: f64,
    pub volatility: f64,
    pub samples: usize,
    pub years: Vec<i32>,
    pub observations: Vec<OpportunityObservation>,
    pub curve: Vec<OpportunityCurvePoint>,
    pub source: String,
    pub source_symbol: String,
    pub comparison_source_symbol: Option<String>,
    pub inverted: bool,
    pub comparison_inverted: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpportunityResponse {
    pub input: OpportunityInput,
    pub windows: Vec<SeasonalOpportunity>,
    pub divergences: Vec<SeasonalOpportunity>,
    pub instrument_count: usize,
    pub currency_count: usize,
    pub evaluated_windows: usize,
    pub evaluated_divergences: usize,
    pub unavailable_reason: Option<String>,
    pub excluded_symbols: Vec<String>,
}

pub fn complete_years(prices: &BTreeMap<NaiveDate, f64>, input: &OpportunityInput) -> Vec<i32> {
    (input.as_of.year() - input.lookback_years..input.as_of.year())
        .filter(|year| {
            let start = NaiveDate::from_ymd_opt(*year, 1, 1).unwrap();
            let end = NaiveDate::from_ymd_opt(*year, 12, 31).unwrap();
            let values = prices.range(start..=end).collect::<Vec<_>>();
            values.len() >= 180
                && values.first().is_some_and(|(date, _)| date.ordinal() <= 15)
                && values.last().is_some_and(|(date, _)| date.ordinal() >= 350)
        })
        .collect()
}

fn mean(values: &[f64]) -> f64 {
    values.iter().sum::<f64>() / values.len() as f64
}

fn median(values: &[f64]) -> f64 {
    let mut sorted = values.to_vec();
    sorted.sort_by(f64::total_cmp);
    let middle = sorted.len() / 2;
    if sorted.len().is_multiple_of(2) {
        (sorted[middle - 1] + sorted[middle]) / 2.0
    } else {
        sorted[middle]
    }
}

fn wilson(hits: usize, samples: usize) -> f64 {
    let z = 1.959_963_984_540_054_f64;
    let n = samples as f64;
    let p = hits as f64 / n;
    (p + z * z / (2.0 * n) - z * ((p * (1.0 - p) + z * z / (4.0 * n)) / n).sqrt())
        / (1.0 + z * z / n)
}

fn mapped_date(prices: &BTreeMap<NaiveDate, f64>, date: NaiveDate) -> Option<NaiveDate> {
    prices
        .range(date..=date + Duration::days(4))
        .next()
        .map(|(date, _)| *date)
}

fn sample(
    series: &OpportunitySeries,
    comparison: Option<&OpportunitySeries>,
    complete: &[i32],
    start: NaiveDate,
    end: NaiveDate,
    year: i32,
) -> Option<OpportunityObservation> {
    let entry = NaiveDate::from_ymd_opt(year, start.month(), start.day())?;
    let exit_year = year + end.year() - start.year();
    if !complete.contains(&exit_year) {
        return None;
    }
    let exit = NaiveDate::from_ymd_opt(exit_year, end.month(), end.day())?;
    // For a pair, the caller supplied the intersection calendar for both sides.
    let entry_date = mapped_date(&series.prices, entry)?;
    let exit_date = mapped_date(&series.prices, exit)?;
    if entry_date.year() != year || exit_date.year() != exit_year || exit_date <= entry_date {
        return None;
    }
    let mut previous = entry_date;
    for (date, _) in series.prices.range(entry_date..=exit_date) {
        if (*date - previous).num_days() > 7 {
            return None;
        }
        previous = *date;
    }
    let return_value = series.prices[&exit_date] / series.prices[&entry_date] - 1.0;
    let comparison_return = if let Some(other) = comparison {
        Some(other.prices.get(&exit_date)? / other.prices.get(&entry_date)? - 1.0)
    } else {
        None
    };
    if !return_value.is_finite() || comparison_return.is_some_and(|value| !value.is_finite()) {
        return None;
    }
    Some(OpportunityObservation {
        year,
        entry_date,
        exit_date,
        return_value,
        comparison_return,
    })
}

fn window(
    series: &OpportunitySeries,
    comparison: Option<&OpportunitySeries>,
    years: &[i32],
    start: NaiveDate,
    end: NaiveDate,
    minimum: usize,
) -> Option<SeasonalOpportunity> {
    let observations = years
        .iter()
        .filter_map(|year| sample(series, comparison, years, start, end, *year))
        .collect::<Vec<_>>();
    if observations.len() < minimum {
        return None;
    }
    let returns = observations
        .iter()
        .map(|row| row.return_value)
        .collect::<Vec<_>>();
    let median_return = median(&returns);
    let mean_return = mean(&returns);
    // An outlier-driven mean against the median is not a directional window.
    if mean_return == 0.0 || mean_return.signum() != median_return.signum() || median_return == 0.0
    {
        return None;
    }
    let direction = if median_return > 0.0 { 1 } else { -1 };
    let other_returns = observations
        .iter()
        .filter_map(|row| row.comparison_return)
        .collect::<Vec<_>>();
    let (comparison_mean_return, comparison_median_return, values) = if comparison.is_some() {
        let other_mean = mean(&other_returns);
        let other_median = median(&other_returns);
        // Emit each pair once: the first side must rise while the second falls.
        if direction != 1 || other_mean >= 0.0 || other_median >= 0.0 {
            return None;
        }
        (
            Some(other_mean),
            Some(other_median),
            returns
                .iter()
                .zip(&other_returns)
                .map(|(a, b)| a - b)
                .collect::<Vec<_>>(),
        )
    } else {
        (None, None, returns.clone())
    };
    let hits = observations
        .iter()
        .filter(|row| {
            if let Some(other) = row.comparison_return {
                row.return_value > 0.0 && other < 0.0
            } else {
                row.return_value * f64::from(direction) > 0.0
            }
        })
        .count();
    if hits * 2 <= observations.len() {
        return None;
    }
    let average = mean(&values);
    let volatility = (values
        .iter()
        .map(|value| (value - average).powi(2))
        .sum::<f64>()
        / (values.len() - 1) as f64)
        .sqrt();
    Some(SeasonalOpportunity {
        id: format!(
            "{}:{}:{start}:{end}",
            series.symbol,
            comparison.map_or("", |other| &other.symbol)
        ),
        symbol: series.symbol.clone(),
        label: series.label.clone(),
        comparison_symbol: comparison.map(|other| other.symbol.clone()),
        comparison_label: comparison.map(|other| other.label.clone()),
        start_date: start,
        end_date: end,
        calendar_days: (end - start).num_days() as u32,
        direction,
        mean_return,
        median_return,
        comparison_mean_return,
        comparison_median_return,
        mean_difference: comparison.map(|_| average),
        median_difference: comparison.map(|_| median(&values)),
        hit_rate: hits as f64 / observations.len() as f64,
        wilson_lower_bound: wilson(hits, observations.len()),
        volatility,
        samples: observations.len(),
        years: observations.iter().map(|row| row.year).collect(),
        observations,
        curve: Vec::new(),
        source: series.source.clone(),
        source_symbol: series.source_symbol.clone(),
        comparison_source_symbol: comparison.map(|other| other.source_symbol.clone()),
        inverted: series.inverted,
        comparison_inverted: comparison.is_some_and(|other| other.inverted),
    })
}

fn rank(left: &SeasonalOpportunity, right: &SeasonalOpportunity) -> Ordering {
    let strength = |row: &SeasonalOpportunity| {
        row.median_difference.unwrap_or(row.median_return).abs() / row.volatility.max(0.000_001)
    };
    right
        .wilson_lower_bound
        .total_cmp(&left.wilson_lower_bound)
        .then_with(|| strength(right).total_cmp(&strength(left)))
        .then_with(|| right.samples.cmp(&left.samples))
        .then_with(|| left.id.cmp(&right.id))
}

fn distinct_top(mut rows: Vec<SeasonalOpportunity>, limit: usize) -> Vec<SeasonalOpportunity> {
    rows.sort_by(rank);
    let mut selected: Vec<SeasonalOpportunity> = Vec::new();
    for row in rows {
        let duplicate = selected.iter().any(|prior| {
            if prior.symbol != row.symbol
                || prior.comparison_symbol != row.comparison_symbol
                || prior.direction != row.direction
            {
                return false;
            }
            let overlap = (prior.end_date.min(row.end_date) - prior.start_date.max(row.start_date))
                .num_days()
                .max(0);
            overlap as f64 / f64::from(prior.calendar_days.min(row.calendar_days)) >= 0.75
        });
        if !duplicate {
            selected.push(row);
        }
        if selected.len() == limit {
            break;
        }
    }
    selected
}

fn add_curve(
    row: &mut SeasonalOpportunity,
    series: &OpportunitySeries,
    other: Option<&OpportunitySeries>,
) {
    row.curve = (0..=row.calendar_days)
        .map(|day| {
            let values = row
                .observations
                .iter()
                .filter_map(|sample| {
                    if day == 0 {
                        return Some(0.0);
                    }
                    let template_date = row.start_date + Duration::days(i64::from(day));
                    let date = NaiveDate::from_ymd_opt(
                        sample.year + template_date.year() - row.start_date.year(),
                        template_date.month(),
                        template_date.day(),
                    )?;
                    let date = mapped_date(&series.prices, date)?;
                    if date > sample.exit_date || date < sample.entry_date {
                        return None;
                    }
                    let value = series.prices[&date] / series.prices[&sample.entry_date] - 1.0;
                    if let Some(other) = other {
                        Some(
                            value
                                - (other.prices.get(&date)?
                                    / other.prices.get(&sample.entry_date)?
                                    - 1.0),
                        )
                    } else {
                        Some(value)
                    }
                })
                .collect::<Vec<_>>();
            OpportunityCurvePoint {
                day,
                mean: (!values.is_empty()).then(|| mean(&values)),
                samples: values.len(),
            }
        })
        .collect();
}

pub fn scan_opportunities(
    instruments: &[OpportunitySeries],
    currencies: &[OpportunitySeries],
    input: OpportunityInput,
) -> OpportunityResponse {
    let mut windows = Vec::new();
    let mut divergences = Vec::new();
    let starts = (0..366)
        .filter_map(|offset| {
            let date =
                NaiveDate::from_ymd_opt(input.as_of.year(), 1, 1).unwrap() + Duration::days(offset);
            (date.year() == input.as_of.year()
                && !(date.month() == 2 && date.day() == 29)
                && input.month.is_none_or(|month| date.month() == month))
            .then_some(date)
        })
        .collect::<Vec<_>>();
    let mut evaluated_windows = 0;
    let mut evaluated_divergences = 0;
    for series in instruments {
        let years = complete_years(&series.prices, &input);
        let initial_length = windows.len();
        for &start in &starts {
            for days in input.min_days..=input.max_days {
                let end = start + Duration::days(i64::from(days));
                if end.month() == 2 && end.day() == 29 {
                    continue;
                }
                if input.upcoming_only && end < input.as_of {
                    continue;
                }
                evaluated_windows += 1;
                if let Some(row) = window(series, None, &years, start, end, input.min_years) {
                    windows.push(row);
                }
            }
        }
        let asset_rows = windows.split_off(initial_length);
        windows.extend(distinct_top(asset_rows, input.limit));
    }
    for (index, left) in currencies.iter().enumerate() {
        for right in &currencies[index + 1..] {
            if left.currency == right.currency || left.source != right.source {
                continue;
            }
            let mut joint_left = left.clone();
            joint_left
                .prices
                .retain(|date, _| right.prices.contains_key(date));
            let mut joint_right = right.clone();
            joint_right
                .prices
                .retain(|date, _| left.prices.contains_key(date));
            let years = complete_years(&joint_left.prices, &input);
            let initial_length = divergences.len();
            for &start in &starts {
                for days in input.min_days..=input.max_days {
                    let end = start + Duration::days(i64::from(days));
                    if end.month() == 2 && end.day() == 29 {
                        continue;
                    }
                    if input.upcoming_only && end < input.as_of {
                        continue;
                    }
                    evaluated_divergences += 1;
                    if let Some(row) = window(
                        &joint_left,
                        Some(&joint_right),
                        &years,
                        start,
                        end,
                        input.min_years,
                    )
                    .or_else(|| {
                        window(
                            &joint_right,
                            Some(&joint_left),
                            &years,
                            start,
                            end,
                            input.min_years,
                        )
                    }) {
                        divergences.push(row);
                    }
                }
            }
            // Retaining each pair's top ten bounds response memory without losing a global top ten.
            let pair_rows = divergences.split_off(initial_length);
            let mut pair_rows = distinct_top(pair_rows, input.limit);
            for row in &mut pair_rows {
                if row.symbol == joint_left.symbol {
                    add_curve(row, &joint_left, Some(&joint_right));
                } else {
                    add_curve(row, &joint_right, Some(&joint_left));
                }
            }
            divergences.extend(pair_rows);
        }
    }
    let mut windows = distinct_top(windows, input.limit);
    for row in &mut windows {
        if let Some(series) = instruments
            .iter()
            .find(|series| series.symbol == row.symbol)
        {
            add_curve(row, series, None);
        }
    }
    let divergences = distinct_top(divergences, input.limit);
    OpportunityResponse {
        input,
        windows,
        divergences,
        instrument_count: instruments.len(),
        currency_count: currencies.len(),
        evaluated_windows,
        evaluated_divergences,
        unavailable_reason: None,
        excluded_symbols: Vec::new(),
    }
}
