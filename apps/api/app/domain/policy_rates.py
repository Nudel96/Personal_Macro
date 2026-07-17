from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from enum import IntEnum
from typing import Iterable


BASIS_POINTS_PER_PERCENT = Decimal("100")
DEFAULT_MIN_FOREIGN_COVERAGE = 4


class Signal(IntEnum):
    BEARISH = -1
    NEUTRAL = 0
    BULLISH = 1


@dataclass(frozen=True)
class PolicyRateExpectation:
    currency_code: str
    current_target_rate: Decimal | None
    expected_target_rate: Decimal | None
    next_decision_at: datetime | None = None
    provider_snapshot_at: datetime | None = None
    actual_target_rate: Decimal | None = None
    quality_status: str = "fresh"
    weight: Decimal = Decimal("1")

    def expected_delta_bps(self) -> Decimal | None:
        if self.current_target_rate is None or self.expected_target_rate is None:
            return None
        return (self.expected_target_rate - self.current_target_rate) * BASIS_POINTS_PER_PERCENT

    def decision_surprise_bps(self) -> Decimal | None:
        if self.actual_target_rate is None or self.expected_target_rate is None:
            return None
        return (self.actual_target_rate - self.expected_target_rate) * BASIS_POINTS_PER_PERCENT

    def forecast_is_usable(self) -> bool:
        return (
            self.quality_status == "fresh"
            and self.current_target_rate is not None
            and self.expected_target_rate is not None
            and self.weight > 0
        )


@dataclass(frozen=True)
class PolicyRateEvaluation:
    currency_code: str
    current_target_rate: Decimal | None
    expected_target_rate: Decimal | None
    expected_delta_bps: Decimal | None
    expected_stance: Signal | None
    actual_target_rate: Decimal | None
    decision_surprise_bps: Decimal | None
    decision_surprise: Signal | None
    next_decision_at: datetime | None
    provider_snapshot_at: datetime | None
    availability_status: str
    quality_status: str


@dataclass(frozen=True)
class UsdRelativeEvaluation:
    foreign_pressure_bps: Decimal | None
    relative_stance_bps: Decimal | None
    relative_signal: Signal | None
    covered_central_banks: int
    required_central_banks: int
    hike_count: int
    hold_count: int
    cut_count: int
    availability_status: str


def signal_from_bps(value: Decimal | None) -> Signal | None:
    if value is None:
        return None
    if value > 0:
        return Signal.BULLISH
    if value < 0:
        return Signal.BEARISH
    return Signal.NEUTRAL


def evaluate_policy_rate(expectation: PolicyRateExpectation) -> PolicyRateEvaluation:
    expected_delta_bps = expectation.expected_delta_bps()
    decision_surprise_bps = expectation.decision_surprise_bps()

    if expectation.forecast_is_usable():
        availability_status = "available"
        expected_stance = signal_from_bps(expected_delta_bps)
    else:
        availability_status = "unavailable"
        expected_stance = None

    return PolicyRateEvaluation(
        currency_code=expectation.currency_code,
        current_target_rate=expectation.current_target_rate,
        expected_target_rate=expectation.expected_target_rate,
        expected_delta_bps=expected_delta_bps,
        expected_stance=expected_stance,
        actual_target_rate=expectation.actual_target_rate,
        decision_surprise_bps=decision_surprise_bps,
        decision_surprise=signal_from_bps(decision_surprise_bps),
        next_decision_at=expectation.next_decision_at,
        provider_snapshot_at=expectation.provider_snapshot_at,
        availability_status=availability_status,
        quality_status=expectation.quality_status,
    )


def evaluate_usd_relative_stance(
    expectations: Iterable[PolicyRateExpectation],
    min_foreign_coverage: int = DEFAULT_MIN_FOREIGN_COVERAGE,
) -> UsdRelativeEvaluation:
    expectation_list = list(expectations)
    usd = next(
        (item for item in expectation_list if item.currency_code.upper() == "USD"),
        None,
    )
    foreign = [
        item
        for item in expectation_list
        if item.currency_code.upper() != "USD" and item.forecast_is_usable()
    ]

    hike_count = 0
    hold_count = 0
    cut_count = 0
    for item in foreign:
        signal = signal_from_bps(item.expected_delta_bps())
        if signal == Signal.BULLISH:
            hike_count += 1
        elif signal == Signal.BEARISH:
            cut_count += 1
        else:
            hold_count += 1

    if usd is None or not usd.forecast_is_usable():
        return UsdRelativeEvaluation(
            foreign_pressure_bps=None,
            relative_stance_bps=None,
            relative_signal=None,
            covered_central_banks=len(foreign),
            required_central_banks=min_foreign_coverage,
            hike_count=hike_count,
            hold_count=hold_count,
            cut_count=cut_count,
            availability_status="unavailable",
        )

    if len(foreign) < min_foreign_coverage:
        return UsdRelativeEvaluation(
            foreign_pressure_bps=None,
            relative_stance_bps=None,
            relative_signal=None,
            covered_central_banks=len(foreign),
            required_central_banks=min_foreign_coverage,
            hike_count=hike_count,
            hold_count=hold_count,
            cut_count=cut_count,
            availability_status="insufficient_coverage",
        )

    total_weight = sum((item.weight for item in foreign), start=Decimal("0"))
    weighted_delta = sum(
        (item.expected_delta_bps() or Decimal("0")) * item.weight for item in foreign
    )
    foreign_pressure_bps = weighted_delta / total_weight
    relative_stance_bps = (usd.expected_delta_bps() or Decimal("0")) - foreign_pressure_bps

    return UsdRelativeEvaluation(
        foreign_pressure_bps=foreign_pressure_bps,
        relative_stance_bps=relative_stance_bps,
        relative_signal=signal_from_bps(relative_stance_bps),
        covered_central_banks=len(foreign),
        required_central_banks=min_foreign_coverage,
        hike_count=hike_count,
        hold_count=hold_count,
        cut_count=cut_count,
        availability_status="available",
    )
