from datetime import datetime, timezone
from decimal import Decimal

from app.domain.policy_rates import (
    PolicyRateExpectation,
    Signal,
    evaluate_policy_rate,
    evaluate_usd_relative_stance,
)


def expectation(code: str, current: str | None, expected: str | None) -> PolicyRateExpectation:
    return PolicyRateExpectation(
        currency_code=code,
        current_target_rate=Decimal(current) if current is not None else None,
        expected_target_rate=Decimal(expected) if expected is not None else None,
        provider_snapshot_at=datetime(2026, 7, 17, tzinfo=timezone.utc),
    )


def test_rate_hike_is_bullish_before_decision() -> None:
    result = evaluate_policy_rate(expectation("USD", "5.00", "5.25"))

    assert result.expected_delta_bps == Decimal("25.00")
    assert result.expected_stance == Signal.BULLISH
    assert result.availability_status == "available"


def test_rate_hold_is_neutral_only_with_valid_forecast() -> None:
    result = evaluate_policy_rate(expectation("EUR", "3.00", "3.00"))

    assert result.expected_delta_bps == Decimal("0.00")
    assert result.expected_stance == Signal.NEUTRAL
    assert result.availability_status == "available"


def test_missing_forecast_is_unavailable_not_neutral() -> None:
    result = evaluate_policy_rate(expectation("GBP", "4.00", None))

    assert result.expected_stance is None
    assert result.availability_status == "unavailable"


def test_higher_rate_than_expected_is_a_bullish_decision_surprise() -> None:
    rate = PolicyRateExpectation(
        currency_code="USD",
        current_target_rate=Decimal("5.00"),
        expected_target_rate=Decimal("5.25"),
        actual_target_rate=Decimal("5.50"),
    )

    result = evaluate_policy_rate(rate)

    assert result.decision_surprise_bps == Decimal("25.00")
    assert result.decision_surprise == Signal.BULLISH


def test_fed_hike_is_neutral_relative_to_equally_tightening_foreign_banks() -> None:
    expectations = [
        expectation("USD", "5.00", "5.25"),
        expectation("EUR", "3.00", "3.25"),
        expectation("GBP", "4.00", "4.25"),
        expectation("JPY", "0.50", "0.75"),
        expectation("CHF", "0.75", "1.00"),
    ]

    result = evaluate_usd_relative_stance(expectations, min_foreign_coverage=4)

    assert result.foreign_pressure_bps == Decimal("25.00")
    assert result.relative_stance_bps == Decimal("0.00")
    assert result.relative_signal == Signal.NEUTRAL


def test_fed_hold_is_bearish_relative_to_foreign_hikes() -> None:
    expectations = [
        expectation("USD", "5.00", "5.00"),
        expectation("EUR", "3.00", "3.25"),
        expectation("GBP", "4.00", "4.25"),
        expectation("JPY", "0.50", "0.75"),
        expectation("CHF", "0.75", "1.00"),
    ]

    result = evaluate_usd_relative_stance(expectations, min_foreign_coverage=4)

    assert result.relative_stance_bps == Decimal("-25.00")
    assert result.relative_signal == Signal.BEARISH


def test_usd_relative_requires_minimum_foreign_coverage() -> None:
    expectations = [
        expectation("USD", "5.00", "5.25"),
        expectation("EUR", "3.00", "3.25"),
        expectation("GBP", "4.00", "4.25"),
    ]

    result = evaluate_usd_relative_stance(expectations, min_foreign_coverage=4)

    assert result.relative_signal is None
    assert result.availability_status == "insufficient_coverage"
