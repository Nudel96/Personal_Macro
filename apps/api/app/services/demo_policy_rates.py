from datetime import datetime, timezone
from decimal import Decimal

from app.domain.policy_rates import PolicyRateExpectation


def demo_expectations() -> list[PolicyRateExpectation]:
    snapshot_at = datetime(2026, 7, 17, 12, 0, tzinfo=timezone.utc)
    next_decision_at = datetime(2026, 7, 30, 18, 0, tzinfo=timezone.utc)

    # Synthetic values are intentionally used until an approved provider or
    # manual import is configured. They must never be presented as live rates.
    return [
        PolicyRateExpectation("USD", Decimal("5.00"), Decimal("5.25"), next_decision_at, snapshot_at),
        PolicyRateExpectation("EUR", Decimal("3.00"), Decimal("3.25"), next_decision_at, snapshot_at),
        PolicyRateExpectation("GBP", Decimal("4.00"), Decimal("4.25"), next_decision_at, snapshot_at),
        PolicyRateExpectation("JPY", Decimal("0.50"), Decimal("0.75"), next_decision_at, snapshot_at),
        PolicyRateExpectation("CHF", Decimal("0.75"), Decimal("1.00"), next_decision_at, snapshot_at),
        PolicyRateExpectation("CAD", Decimal("2.75"), Decimal("3.00"), next_decision_at, snapshot_at),
        PolicyRateExpectation("AUD", Decimal("3.50"), Decimal("3.75"), next_decision_at, snapshot_at),
        PolicyRateExpectation("NZD", Decimal("2.00"), Decimal("2.25"), next_decision_at, snapshot_at),
    ]
