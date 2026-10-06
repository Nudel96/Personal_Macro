use super::*;

fn input() -> OpportunityInput {
    OpportunityInput {
        as_of: NaiveDate::from_ymd_opt(2026, 6, 15).unwrap(),
        month: Some(6),
        universe: OpportunityUniverse::Forex,
        limit: 10,
        min_days: 7,
        max_days: 14,
        min_years: 5,
        lookback_years: 20,
        upcoming_only: false,
    }
}

fn series(symbol: &str, slope: f64, first: i32, last: i32) -> OpportunitySeries {
    let mut prices = BTreeMap::new();
    for year in first..=last {
        for ordinal in 1..=366 {
            if let Some(date) = NaiveDate::from_yo_opt(year, ordinal)
                && date.weekday().number_from_monday() <= 5
            {
                prices.insert(
                    date,
                    (slope * ordinal as f64 * (1.0 + (year % 3) as f64 * 0.1)).exp(),
                );
            }
        }
    }
    OpportunitySeries {
        symbol: symbol.into(),
        label: symbol.into(),
        currency: Some(symbol.into()),
        source: "synthetic test data".into(),
        source_symbol: symbol.into(),
        inverted: false,
        prices,
    }
}

#[test]
fn month_scan_ranks_directions_limits_and_deduplicates() {
    let up = series("UP", 0.001, 2010, 2025);
    let down = series("DOWN", -0.001, 2010, 2025);
    let mut request = input();
    request.limit = 3;
    let output = scan_opportunities(&[up, down], &[], request);
    assert_eq!(output.windows.len(), 3);
    assert!(
        output
            .windows
            .iter()
            .all(|row| row.start_date.month() == 6 && row.samples == 16)
    );
    assert!(
        output
            .windows
            .iter()
            .all(|row| row.source == "synthetic test data")
    );
    assert!(
        output
            .windows
            .windows(2)
            .all(|pair| rank(&pair[0], &pair[1]) != Ordering::Greater)
    );
    assert!(
        output
            .windows
            .iter()
            .all(|row| (7..=14).contains(&row.calendar_days))
    );
    assert!(
        output
            .windows
            .iter()
            .all(|row| row.direction == if row.symbol == "UP" { 1 } else { -1 })
    );
    for (index, row) in output.windows.iter().enumerate() {
        for other in &output.windows[index + 1..] {
            if row.symbol == other.symbol {
                let overlap = (row.end_date.min(other.end_date)
                    - row.start_date.max(other.start_date))
                .num_days()
                .max(0);
                assert!(
                    (overlap as f64) < 0.75 * f64::from(row.calendar_days.min(other.calendar_days))
                );
            }
        }
    }
}

#[test]
fn divergence_requires_opposite_directions_and_identical_dates_and_years() {
    let mut strong = series("STRONG", 0.001, 2010, 2025);
    let weak = series("WEAK", -0.001, 2015, 2025);
    for year in 2015..=2025 {
        strong
            .prices
            .remove(&NaiveDate::from_ymd_opt(year, 6, 1).unwrap());
    }
    let output = scan_opportunities(&[], &[weak.clone(), strong.clone()], input());
    assert!(!output.divergences.is_empty());
    for row in output.divergences {
        assert_eq!(row.symbol, "STRONG");
        assert_eq!(row.comparison_symbol.as_deref(), Some("WEAK"));
        assert_eq!(row.years, (2015..=2025).collect::<Vec<_>>());
        assert_eq!(row.hit_rate, 1.0);
        assert!(row.mean_difference.unwrap() > 0.0);
        for observation in &row.observations {
            let actual = strong.prices[&observation.exit_date]
                / strong.prices[&observation.entry_date]
                - 1.0;
            let other =
                weak.prices[&observation.exit_date] / weak.prices[&observation.entry_date] - 1.0;
            assert!((actual - observation.return_value).abs() < 1e-12);
            assert!((other - observation.comparison_return.unwrap()).abs() < 1e-12);
        }
        assert!(
            (row.curve.last().unwrap().mean.unwrap() - row.mean_difference.unwrap()).abs() < 1e-12
        );
        assert_eq!(row.curve.first().unwrap().mean, Some(0.0));
    }
    let also_strong = series("STRONG2", 0.0005, 2010, 2025);
    assert!(
        scan_opportunities(&[], &[strong, also_strong], input())
            .divergences
            .is_empty()
    );
}

#[test]
fn fewer_than_five_complete_years_and_flat_data_never_rank() {
    let short = series("SHORT", 0.001, 2022, 2025);
    let flat = series("FLAT", 0.0, 2010, 2025);
    let mut partial = series("PARTIAL", 0.001, 2010, 2025);
    partial
        .prices
        .retain(|date, _| (2..=11).contains(&date.month()));
    let output = scan_opportunities(&[short, flat, partial], &[], input());
    assert!(output.windows.is_empty());
    assert!(output.divergences.is_empty());
}

#[test]
fn gaps_are_not_bridged_and_holidays_map_to_next_shared_observation() {
    let mut prices = series("A", 0.001, 2010, 2025);
    prices
        .prices
        .retain(|date, _| !(date.month() == 6 && date.day() <= 15));
    let years = complete_years(&prices.prices, &input());
    let start = NaiveDate::from_ymd_opt(2026, 5, 28).unwrap();
    assert!(window(&prices, None, &years, start, start + Duration::days(30), 5).is_none());
    let ordinary = series("A", 0.001, 2010, 2025);
    let saturday = NaiveDate::from_ymd_opt(2024, 6, 1).unwrap();
    assert_eq!(
        mapped_date(&ordinary.prices, saturday),
        Some(NaiveDate::from_ymd_opt(2024, 6, 3).unwrap())
    );
}

#[test]
fn year_crossing_requires_a_complete_following_year_and_excludes_live_year() {
    let prices = series("A", 0.001, 2010, 2026);
    let years = complete_years(&prices.prices, &input());
    assert!(!years.contains(&2026));
    let start = NaiveDate::from_ymd_opt(2026, 12, 20).unwrap();
    let end = NaiveDate::from_ymd_opt(2027, 1, 20).unwrap();
    assert!(sample(&prices, None, &years, start, end, 2025).is_none());
    let result = sample(&prices, None, &years, start, end, 2024).unwrap();
    assert_eq!(result.exit_date.year(), 2025);
}

#[test]
fn leap_day_is_not_a_window_boundary_and_upcoming_filter_preserves_active_windows() {
    let prices = series("A", 0.001, 2010, 2025);
    let mut request = input();
    request.as_of = NaiveDate::from_ymd_opt(2024, 2, 20).unwrap();
    request.month = Some(2);
    request.upcoming_only = true;
    let output = scan_opportunities(&[prices], &[], request);
    assert!(!output.windows.is_empty());
    assert!(
        output
            .windows
            .iter()
            .all(|row| row.end_date >= output.input.as_of)
    );
    assert!(
        output
            .windows
            .iter()
            .all(|row| !(row.start_date.month() == 2 && row.start_date.day() == 29))
    );
    assert!(
        output
            .windows
            .iter()
            .all(|row| !(row.end_date.month() == 2 && row.end_date.day() == 29))
    );
}

#[test]
fn cohort_count_and_confidence_reflect_only_joint_observations() {
    let up = series("UP", 0.001, 2010, 2025);
    let down = series("DOWN", -0.001, 2021, 2025);
    let output = scan_opportunities(&[], &[up, down], input());
    let row = &output.divergences[0];
    assert_eq!(row.samples, 5);
    assert!((row.wilson_lower_bound - 0.565_517_535).abs() < 1e-8);
    assert_eq!(row.observations.len(), 5);
}

#[test]
fn validates_limits_and_window_ranges() {
    let mut request = input();
    assert!(request.validate().is_ok());
    request.limit = 11;
    assert!(request.validate().is_err());
    request.limit = 1;
    request.min_days = 91;
    assert!(request.validate().is_err());
    request.min_days = 7;
    request.month = Some(13);
    assert!(request.validate().is_err());
}

#[test]
fn market_scan_ranks_inside_the_horizon_and_uses_daily_start_dates() {
    let mut prices = series("DAILY", 0.0, 2010, 2025);
    for (date, price) in &mut prices.prices {
        *price = match (date.month(), date.day()) {
            (7, 4) => 50.0,
            (7, 10) => 200.0,
            _ => 100.0,
        };
    }
    // Include the same daily calendar in every year to isolate the start grid.
    for year in 2010..=2025 {
        prices
            .prices
            .insert(NaiveDate::from_ymd_opt(year, 7, 4).unwrap(), 50.0);
        prices
            .prices
            .insert(NaiveDate::from_ymd_opt(year, 7, 10).unwrap(), 200.0);
    }
    let request = MarketWindowInput {
        as_of: NaiveDate::from_ymd_opt(2026, 6, 15).unwrap(),
    };
    let result = scan_market_windows(&prices, &request);
    assert!(!result.is_empty());
    let best = &result[0];
    assert_eq!(
        best.start_date,
        NaiveDate::from_ymd_opt(2026, 7, 4).unwrap()
    );
    assert_eq!(best.end_date, NaiveDate::from_ymd_opt(2026, 7, 10).unwrap());
    assert_eq!(best.median_return, 3.0);
    assert_eq!(best.samples, 16);
    assert!(result.iter().any(|row| row.direction == -1));
    for row in &result {
        assert!(row.start_date >= request.as_of);
        assert!(row.end_date <= request.horizon_end());
        assert!((5..=90).contains(&row.calendar_days));
        assert_eq!(row.curve.first().unwrap().mean, Some(0.0));
        assert!((row.curve.last().unwrap().mean.unwrap() - row.mean_return).abs() < 1e-12);
    }
}

#[test]
fn market_scan_covers_next_year_without_using_incomplete_current_years() {
    let prices = series("CROSS", 0.001, 2010, 2026);
    let request = MarketWindowInput {
        as_of: NaiveDate::from_ymd_opt(2026, 12, 15).unwrap(),
    };
    assert_eq!(
        request.horizon_end(),
        NaiveDate::from_ymd_opt(2027, 3, 15).unwrap()
    );
    let result = scan_market_windows(&prices, &request);
    assert!(result.iter().any(|row| row.start_date.year() == 2027));
    assert!(
        result
            .iter()
            .any(|row| row.start_date.year() != row.end_date.year())
    );
    for row in &result {
        assert!(row.start_date >= request.as_of && row.end_date <= request.horizon_end());
        assert!(
            row.observations
                .iter()
                .all(|sample| sample.exit_date.year() < 2026)
        );
        if row.start_date.year() != row.end_date.year() {
            assert!(!row.years.contains(&2025));
        }
    }
}

#[test]
fn market_scan_skips_leap_boundaries_and_keeps_the_90_calendar_day_limit() {
    let prices = series("LEAP", 0.001, 2010, 2025);
    let request = MarketWindowInput {
        as_of: NaiveDate::from_ymd_opt(2024, 2, 29).unwrap(),
    };
    assert_eq!(
        request.horizon_end(),
        NaiveDate::from_ymd_opt(2024, 5, 29).unwrap()
    );
    let result = scan_market_windows(&prices, &request);
    assert!(!result.is_empty());
    assert!(result.iter().all(|row| {
        row.start_date >= request.as_of
            && row.end_date <= request.horizon_end()
            && !(row.start_date.month() == 2 && row.start_date.day() == 29)
            && !(row.end_date.month() == 2 && row.end_date.day() == 29)
            && row.years.iter().all(|year| *year < 2024)
    }));
}

#[test]
fn market_scan_preserves_missing_evidence_and_does_not_bridge_price_gaps() {
    let request = MarketWindowInput {
        as_of: NaiveDate::from_ymd_opt(2026, 6, 1).unwrap(),
    };
    assert!(scan_market_windows(&series("SHORT", 0.001, 2022, 2025), &request).is_empty());
    assert!(scan_market_windows(&series("FLAT", 0.0, 2010, 2025), &request).is_empty());
    let mut prices = series("GAPS", 0.001, 2010, 2025);
    prices
        .prices
        .retain(|date, _| !(date.month() == 7 && date.day() <= 20));
    let result = scan_market_windows(&prices, &request);
    assert!(!result.is_empty());
    for row in result {
        for sample in row.observations {
            let dates: Vec<_> = prices
                .prices
                .range(sample.entry_date..=sample.exit_date)
                .map(|(date, _)| *date)
                .collect();
            assert!(
                dates
                    .windows(2)
                    .all(|pair| (pair[1] - pair[0]).num_days() <= 7)
            );
        }
    }
}

#[test]
fn market_scan_validates_its_date_and_retains_only_nonoverlapping_top_ten_per_direction() {
    assert!(
        MarketWindowInput {
            as_of: NaiveDate::from_ymd_opt(1800, 1, 1).unwrap()
        }
        .validate()
        .is_err()
    );
    let request = MarketWindowInput {
        as_of: NaiveDate::from_ymd_opt(2026, 6, 15).unwrap(),
    };
    let result = scan_market_windows(&series("A", 0.001, 2010, 2025), &request);
    for direction in [-1, 1] {
        let rows: Vec<_> = result
            .iter()
            .filter(|row| row.direction == direction)
            .collect();
        assert!(rows.len() <= 10);
        for (index, row) in rows.iter().enumerate() {
            for other in &rows[index + 1..] {
                let overlap = (row.end_date.min(other.end_date)
                    - row.start_date.max(other.start_date))
                .num_days()
                .max(0);
                assert!(
                    (overlap as f64) < 0.75 * f64::from(row.calendar_days.min(other.calendar_days))
                );
            }
        }
    }
}
