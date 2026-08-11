use chrono::{DateTime, Duration, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

const BASIS_POINTS_PER_PERCENT: Decimal = Decimal::ONE_HUNDRED;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PolicyRateInput {
    pub currency: String,
    pub central_bank: String,
    pub current_rate: Option<String>,
    pub expected_rate: Option<String>,
    pub actual_rate: Option<String>,
    pub rate_definition: Option<String>,
    pub current_rate_low: Option<String>,
    pub current_rate_high: Option<String>,
    pub official_source_url: Option<String>,
    pub official_published_at: Option<String>,
    pub expected_source_url: Option<String>,
    pub expected_observed_at: Option<String>,
    pub expected_for_decision_at: Option<String>,
    pub next_decision_at: Option<String>,
    pub provider_snapshot_at: Option<String>,
    #[serde(default = "unverified")]
    pub quality_status: String,
    #[serde(default = "one")]
    pub weight: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PolicyRateEvaluation {
    pub currency: String,
    pub central_bank: String,
    pub current_rate: Option<String>,
    pub expected_rate: Option<String>,
    pub expected_delta_bps: Option<String>,
    pub expected_stance: Option<i8>,
    pub actual_rate: Option<String>,
    pub rate_definition: Option<String>,
    pub current_rate_low: Option<String>,
    pub current_rate_high: Option<String>,
    pub official_source_url: Option<String>,
    pub official_published_at: Option<String>,
    pub expected_source_url: Option<String>,
    pub expected_observed_at: Option<String>,
    pub expected_for_decision_at: Option<String>,
    pub decision_surprise_bps: Option<String>,
    pub decision_surprise: Option<i8>,
    pub next_decision_at: Option<String>,
    pub provider_snapshot_at: Option<String>,
    pub availability_status: String,
    pub quality_status: String,
    pub weight: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsdRelativeEvaluation {
    pub foreign_pressure_bps: Option<String>,
    pub relative_stance_bps: Option<String>,
    pub relative_signal: Option<i8>,
    pub covered_central_banks: usize,
    pub required_central_banks: usize,
    pub hike_count: usize,
    pub hold_count: usize,
    pub cut_count: usize,
    pub availability_status: String,
}

fn unverified() -> String {
    "unverified".into()
}

fn one() -> String {
    "1".into()
}

fn decimal(value: &Option<String>) -> Option<Decimal> {
    value.as_ref()?.parse().ok()
}

fn signal(value: Option<Decimal>) -> Option<i8> {
    value.map(|value| {
        if value > Decimal::ZERO {
            1
        } else if value < Decimal::ZERO {
            -1
        } else {
            0
        }
    })
}

fn normalized(value: Decimal) -> String {
    value.round_dp(4).normalize().to_string()
}

fn is_https_url(value: Option<&String>) -> bool {
    value.is_some_and(|url| url.starts_with("https://"))
}

fn parse_timestamp(value: Option<&String>) -> Option<DateTime<Utc>> {
    value
        .and_then(|value| DateTime::parse_from_rfc3339(value).ok())
        .map(|value| value.with_timezone(&Utc))
}

fn verified_current(input: &PolicyRateInput) -> bool {
    matches!(
        input.quality_status.as_str(),
        "official_confirmed" | "provider_confirmed"
    ) && decimal(&input.current_rate).is_some()
        && is_https_url(input.official_source_url.as_ref())
        && parse_timestamp(input.official_published_at.as_ref()).is_some()
}

fn usable_expectation(input: &PolicyRateInput, now: DateTime<Utc>) -> bool {
    let observed_at = parse_timestamp(input.expected_observed_at.as_ref());
    let next_decision_at = parse_timestamp(input.next_decision_at.as_ref());
    verified_current(input)
        && decimal(&input.expected_rate).is_some()
        && is_https_url(input.expected_source_url.as_ref())
        && observed_at.is_some_and(|observed_at| {
            observed_at <= now && now - observed_at <= Duration::hours(36)
        })
        && next_decision_at.is_some_and(|decision| decision > now)
        && input.expected_for_decision_at.as_ref() == input.next_decision_at.as_ref()
}

pub fn evaluate(input: &PolicyRateInput) -> PolicyRateEvaluation {
    evaluate_at(input, Utc::now())
}

fn evaluate_at(input: &PolicyRateInput, now: DateTime<Utc>) -> PolicyRateEvaluation {
    let current = decimal(&input.current_rate);
    let expected = decimal(&input.expected_rate);
    let actual = decimal(&input.actual_rate);
    let weight = input.weight.parse::<Decimal>().unwrap_or(Decimal::ONE);
    let usable = usable_expectation(input, now) && weight > Decimal::ZERO;
    let expected_delta = current
        .zip(expected)
        .map(|(current, expected)| (expected - current) * BASIS_POINTS_PER_PERCENT);
    let decision_surprise = actual
        .zip(expected)
        .map(|(actual, expected)| (actual - expected) * BASIS_POINTS_PER_PERCENT);
    PolicyRateEvaluation {
        currency: input.currency.trim().to_uppercase(),
        central_bank: input.central_bank.trim().into(),
        current_rate: current.map(normalized),
        expected_rate: expected.map(normalized),
        expected_delta_bps: expected_delta.map(normalized),
        expected_stance: usable.then(|| signal(expected_delta).unwrap_or(0)),
        actual_rate: actual.map(normalized),
        rate_definition: input.rate_definition.clone(),
        current_rate_low: decimal(&input.current_rate_low).map(normalized),
        current_rate_high: decimal(&input.current_rate_high).map(normalized),
        official_source_url: input.official_source_url.clone(),
        official_published_at: input.official_published_at.clone(),
        expected_source_url: input.expected_source_url.clone(),
        expected_observed_at: input.expected_observed_at.clone(),
        expected_for_decision_at: input.expected_for_decision_at.clone(),
        decision_surprise_bps: decision_surprise.map(normalized),
        decision_surprise: signal(decision_surprise),
        next_decision_at: input.next_decision_at.clone(),
        provider_snapshot_at: input.provider_snapshot_at.clone(),
        availability_status: if usable { "available" } else { "unavailable" }.into(),
        quality_status: input.quality_status.clone(),
        weight: normalized(weight),
    }
}

pub fn evaluate_usd_relative(
    inputs: &[PolicyRateInput],
    minimum_foreign_coverage: usize,
) -> UsdRelativeEvaluation {
    evaluate_usd_relative_at(inputs, minimum_foreign_coverage, Utc::now())
}

fn evaluate_usd_relative_at(
    inputs: &[PolicyRateInput],
    minimum_foreign_coverage: usize,
    now: DateTime<Utc>,
) -> UsdRelativeEvaluation {
    let evaluations: Vec<(PolicyRateEvaluation, Decimal)> = inputs
        .iter()
        .map(|input| {
            (
                evaluate_at(input, now),
                input.weight.parse::<Decimal>().unwrap_or(Decimal::ONE),
            )
        })
        .collect();
    let usd = evaluations
        .iter()
        .find(|(evaluation, _)| evaluation.currency == "USD");
    let foreign: Vec<&(PolicyRateEvaluation, Decimal)> = evaluations
        .iter()
        .filter(|(evaluation, weight)| {
            evaluation.currency != "USD"
                && evaluation.availability_status == "available"
                && *weight > Decimal::ZERO
        })
        .collect();
    let deltas: Vec<Decimal> = foreign
        .iter()
        .filter_map(|(evaluation, _)| {
            evaluation
                .expected_delta_bps
                .as_ref()
                .and_then(|value| value.parse().ok())
        })
        .collect();
    let hike_count = deltas
        .iter()
        .filter(|value| **value > Decimal::ZERO)
        .count();
    let cut_count = deltas
        .iter()
        .filter(|value| **value < Decimal::ZERO)
        .count();
    let hold_count = deltas.len().saturating_sub(hike_count + cut_count);
    let unavailable = |status: &str| UsdRelativeEvaluation {
        foreign_pressure_bps: None,
        relative_stance_bps: None,
        relative_signal: None,
        covered_central_banks: foreign.len(),
        required_central_banks: minimum_foreign_coverage,
        hike_count,
        hold_count,
        cut_count,
        availability_status: status.into(),
    };
    let Some((usd, _)) = usd else {
        return unavailable("unavailable");
    };
    if usd.availability_status != "available" {
        return unavailable("unavailable");
    }
    if foreign.len() < minimum_foreign_coverage {
        return unavailable("insufficient_coverage");
    }
    let total_weight: Decimal = foreign.iter().map(|(_, weight)| *weight).sum();
    if total_weight <= Decimal::ZERO {
        return unavailable("insufficient_coverage");
    }
    let weighted_delta: Decimal = foreign
        .iter()
        .filter_map(|(evaluation, weight)| {
            evaluation
                .expected_delta_bps
                .as_ref()
                .and_then(|value| value.parse::<Decimal>().ok())
                .map(|delta| delta * *weight)
        })
        .sum();
    let foreign_pressure = weighted_delta / total_weight;
    let usd_delta = usd
        .expected_delta_bps
        .as_ref()
        .and_then(|value| value.parse::<Decimal>().ok())
        .unwrap_or(Decimal::ZERO);
    let relative = usd_delta - foreign_pressure;
    UsdRelativeEvaluation {
        foreign_pressure_bps: Some(normalized(foreign_pressure)),
        relative_stance_bps: Some(normalized(relative)),
        relative_signal: signal(Some(relative)),
        covered_central_banks: foreign.len(),
        required_central_banks: minimum_foreign_coverage,
        hike_count,
        hold_count,
        cut_count,
        availability_status: "available".into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rate(currency: &str, current: &str, expected: &str) -> PolicyRateInput {
        PolicyRateInput {
            currency: currency.into(),
            central_bank: currency.into(),
            current_rate: Some(current.into()),
            expected_rate: Some(expected.into()),
            actual_rate: None,
            rate_definition: Some("Test policy rate".into()),
            current_rate_low: None,
            current_rate_high: None,
            official_source_url: Some("https://central-bank.example/rate".into()),
            official_published_at: Some("2026-07-25T12:00:00Z".into()),
            expected_source_url: Some("https://market.example/implied-rate".into()),
            expected_observed_at: Some("2026-07-25T12:00:00Z".into()),
            expected_for_decision_at: Some("2026-08-01T12:00:00Z".into()),
            next_decision_at: Some("2026-08-01T12:00:00Z".into()),
            provider_snapshot_at: Some("2026-07-25T12:00:00Z".into()),
            quality_status: "official_confirmed".into(),
            weight: "1".into(),
        }
    }

    #[test]
    fn hike_is_bullish() {
        let result = evaluate_at(
            &rate("USD", "5.00", "5.25"),
            "2026-07-26T12:00:00Z".parse().unwrap(),
        );
        assert_eq!(result.expected_delta_bps.as_deref(), Some("25"));
        assert_eq!(result.expected_stance, Some(1));
    }

    #[test]
    fn missing_forecast_is_unavailable_not_neutral() {
        let mut input = rate("GBP", "4", "4.25");
        input.expected_rate = None;
        let result = evaluate_at(&input, "2026-07-26T12:00:00Z".parse().unwrap());
        assert_eq!(result.expected_stance, None);
        assert_eq!(result.availability_status, "unavailable");
    }

    #[test]
    fn equal_global_hikes_neutralize_usd_relative_effect() {
        let rates = vec![
            rate("USD", "5", "5.25"),
            rate("EUR", "3", "3.25"),
            rate("GBP", "4", "4.25"),
            rate("JPY", ".5", ".75"),
            rate("CHF", ".75", "1"),
        ];
        let result = evaluate_usd_relative_at(&rates, 4, "2026-07-26T12:00:00Z".parse().unwrap());
        assert_eq!(result.relative_stance_bps.as_deref(), Some("0"));
        assert_eq!(result.relative_signal, Some(0));
    }

    #[test]
    fn current_rate_without_market_provenance_cannot_create_a_stance() {
        let mut input = rate("USD", "3.625", "3.625");
        input.expected_source_url = None;
        let result = evaluate_at(&input, "2026-07-26T12:00:00Z".parse().unwrap());
        assert_eq!(result.expected_stance, None);
        assert_eq!(result.availability_status, "unavailable");
    }

    #[test]
    fn stale_market_expectation_is_unavailable() {
        let mut input = rate("USD", "3.625", "3.875");
        input.expected_observed_at = Some("2026-07-20T12:00:00Z".into());
        let result = evaluate_at(&input, "2026-07-26T12:00:00Z".parse().unwrap());
        assert_eq!(result.expected_stance, None);
    }
}
