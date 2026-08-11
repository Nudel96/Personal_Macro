#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SourceOrientation {
    Direct,
    Inverse,
}

fn daily_ratio(
    call_notional_usd: i64,
    put_notional_usd: i64,
    orientation: SourceOrientation,
) -> Option<f64> {
    if call_notional_usd <= 0 || put_notional_usd <= 0 {
        return None;
    }

    let (effective_call, effective_put) = match orientation {
        SourceOrientation::Direct => (call_notional_usd, put_notional_usd),
        SourceOrientation::Inverse => (put_notional_usd, call_notional_usd),
    };
    Some(effective_put as f64 / effective_call as f64)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Sentiment {
    Bullish,
    Neutral,
    Bearish,
    Unavailable,
}

fn ma5(values: &[f64]) -> Vec<f64> {
    values
        .windows(5)
        .map(|window| window.iter().sum::<f64>() / 5.0)
        .collect()
}

fn linear_percentile(sorted_values: &[f64], percentile: f64) -> f64 {
    let rank = percentile * (sorted_values.len() - 1) as f64;
    let lower_index = rank.floor() as usize;
    let upper_index = rank.ceil() as usize;
    let fraction = rank - lower_index as f64;
    sorted_values[lower_index]
        + (sorted_values[upper_index] - sorted_values[lower_index]) * fraction
}

fn thresholds(values: &[f64]) -> Option<(f64, f64)> {
    if values.len() < 252 {
        return None;
    }
    let mut sample = values[values.len() - 252..].to_vec();
    sample.sort_by(f64::total_cmp);
    Some((
        linear_percentile(&sample, 0.2),
        linear_percentile(&sample, 0.8),
    ))
}

fn classify(value: Option<f64>, calibrated: Option<(f64, f64)>) -> Sentiment {
    let (Some(value), Some((bullish, bearish))) = (value, calibrated) else {
        return Sentiment::Unavailable;
    };
    if value >= bearish {
        Sentiment::Bearish
    } else if value <= bullish {
        Sentiment::Bullish
    } else {
        Sentiment::Neutral
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn direct_ratio_divides_put_by_call() {
        assert_eq!(daily_ratio(100, 250, SourceOrientation::Direct), Some(2.5));
    }

    #[test]
    fn inverse_ratio_swaps_provider_put_and_call() {
        assert_eq!(daily_ratio(100, 250, SourceOrientation::Inverse), Some(0.4));
    }

    #[test]
    fn zero_notional_is_unavailable() {
        assert_eq!(daily_ratio(0, 250, SourceOrientation::Direct), None);
        assert_eq!(daily_ratio(100, 0, SourceOrientation::Direct), None);
    }

    #[test]
    fn ma5_requires_five_values_and_uses_a_rolling_window() {
        assert_eq!(ma5(&[1.0, 2.0, 3.0, 4.0]), Vec::<f64>::new());
        assert_eq!(ma5(&[1.0, 2.0, 3.0, 4.0, 5.0]), vec![3.0]);
        assert_eq!(ma5(&[1.0, 2.0, 3.0, 4.0, 5.0, 10.0]), vec![3.0, 4.8]);
    }

    #[test]
    fn thresholds_require_252_values_and_interpolate_p20_p80() {
        assert!(thresholds(&vec![1.0; 251]).is_none());
        let observations = (1..=252).map(f64::from).collect::<Vec<_>>();
        assert_eq!(thresholds(&observations), Some((51.2, 201.8)));
    }

    #[test]
    fn thresholds_use_only_the_latest_252_values() {
        let mut observations = vec![10_000.0];
        observations.extend((1..=252).map(f64::from));
        assert_eq!(thresholds(&observations), Some((51.2, 201.8)));
    }

    #[test]
    fn sentiment_includes_exact_thresholds_and_preserves_unavailable() {
        let calibrated = Some((51.2, 201.8));
        assert_eq!(classify(Some(201.8), calibrated), Sentiment::Bearish);
        assert_eq!(classify(Some(51.2), calibrated), Sentiment::Bullish);
        assert_eq!(classify(Some(100.0), calibrated), Sentiment::Neutral);
        assert_eq!(classify(Some(100.0), None), Sentiment::Unavailable);
        assert_eq!(classify(None, calibrated), Sentiment::Unavailable);
    }
}
