use super::valuation_models::{HistoricalPosition, MetricDefinition, ValuationPoint};

/// Descriptive rank of the latest published multiple against prior snapshots.
/// Never combines definitions, crosses the 2014 classification boundary or uses
/// a current observation in its own reference distribution.
pub fn historical_position(
    points: &[ValuationPoint],
    metric: &MetricDefinition,
) -> HistoricalPosition {
    let mut result = HistoricalPosition {
        status: "insufficient_history".into(),
        percentile: None,
        previous_median: None,
        reference_first_year: None,
        reference_last_year: None,
        reference_count: 0,
        composition_changed: false,
    };
    let Some(latest) = points.last() else {
        return result;
    };
    if metric.kind != "valuation" {
        result.status = "not_historical_valuation".into();
        return result;
    }
    if latest.status != "available" || latest.value.is_none_or(|v| !v.is_finite() || v <= 0.0) {
        result.status = "latest_not_meaningful".into();
        return result;
    }
    if latest.firm_count < 20 {
        result.status = "small_sample".into();
        return result;
    }
    let history: Vec<_> = points
        .iter()
        .filter(|p| {
            p.year < latest.year
                && p.method_epoch == latest.method_epoch
                && p.status == "available"
                && p.firm_count >= 20
                && p.value.is_some_and(|v| v.is_finite() && v > 0.0)
        })
        .collect();
    result.reference_count = history.len();
    result.reference_first_year = history.first().map(|p| p.year);
    result.reference_last_year = history.last().map(|p| p.year);
    result.composition_changed = history.iter().any(|p| {
        p.firm_count as f64 / latest.firm_count as f64 > 2.0
            || latest.firm_count as f64 / p.firm_count as f64 > 2.0
    });
    if history.len() < 10 {
        return result;
    }
    let mut values: Vec<_> = history.iter().filter_map(|p| p.value).collect();
    values.sort_by(f64::total_cmp);
    let min = values[0];
    let max = values[values.len() - 1];
    if max - min <= max.abs().max(1.0) * 1e-12 {
        result.status = "no_reference_variation".into();
        return result;
    }
    let value = latest.value.unwrap();
    let lower = values.iter().filter(|v| **v < value).count();
    let equal = values.iter().filter(|v| **v == value).count();
    result.percentile = Some(100.0 * (lower as f64 + equal as f64 / 2.0) / values.len() as f64);
    let middle = values.len() / 2;
    result.previous_median = Some(if values.len().is_multiple_of(2) {
        (values[middle - 1] + values[middle]) / 2.0
    } else {
        values[middle]
    });
    result.status = "available".into();
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    fn metric() -> MetricDefinition {
        MetricDefinition {
            id: "industry_pbv".into(),
            label: String::new(),
            explanation: String::new(),
            positive_only: true,
            kind: "valuation".into(),
            unit: "multiple".into(),
        }
    }
    fn points() -> Vec<ValuationPoint> {
        (2014..=2026)
            .map(|year| ValuationPoint {
                year,
                value: Some((year - 2013) as f64),
                status: "available".into(),
                firm_count: 100,
                method_epoch: "2014+".into(),
                source_file: String::new(),
            })
            .collect()
    }
    #[test]
    fn world_atlas_valuation_rank_uses_only_prior_comparable_observations() {
        let mut rows = points();
        let result = historical_position(&rows, &metric());
        assert_eq!(result.reference_count, 12);
        assert_eq!(result.percentile, Some(100.0));
        assert_eq!(result.previous_median, Some(6.5));
        rows.last_mut().unwrap().value = Some(0.5);
        assert_eq!(historical_position(&rows, &metric()).percentile, Some(0.0));
        rows.last_mut().unwrap().value = Some(6.0);
        assert_eq!(
            historical_position(&rows, &metric()).percentile,
            Some(100.0 * 5.5 / 12.0)
        );
        for p in &mut rows[..5] {
            p.method_epoch = "legacy".into();
        }
        assert_eq!(
            historical_position(&rows, &metric()).status,
            "insufficient_history"
        );
    }
    #[test]
    fn world_atlas_valuation_missing_losses_small_samples_and_flat_histories_are_not_cheap() {
        let mut rows = points();
        rows.last_mut().unwrap().value = Some(-2.0);
        assert_eq!(
            historical_position(&rows, &metric()).status,
            "latest_not_meaningful"
        );
        rows.last_mut().unwrap().value = None;
        assert_eq!(historical_position(&rows, &metric()).percentile, None);
        rows = points();
        rows.last_mut().unwrap().firm_count = 3;
        assert_eq!(historical_position(&rows, &metric()).status, "small_sample");
        rows = points();
        for p in &mut rows {
            p.value = Some(2.0);
        }
        assert_eq!(
            historical_position(&rows, &metric()).status,
            "no_reference_variation"
        );
        let mut expectation = metric();
        expectation.kind = "forecast_valuation".into();
        assert_eq!(
            historical_position(&points(), &expectation).status,
            "not_historical_valuation"
        );
    }
}
