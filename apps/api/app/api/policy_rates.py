from __future__ import annotations

from decimal import Decimal
from typing import Any

from fastapi import APIRouter

from app.api.schemas import PolicyRatePreviewRequest
from app.domain.policy_rates import (
    PolicyRateEvaluation,
    Signal,
    UsdRelativeEvaluation,
    evaluate_policy_rate,
    evaluate_usd_relative_stance,
)
from app.services.demo_policy_rates import demo_expectations

router = APIRouter(prefix="/api/v1/policy-rates", tags=["policy-rates"])


def _decimal(value: Decimal | None) -> float | None:
    return float(value) if value is not None else None


def _signal(value: Signal | None) -> int | None:
    return int(value) if value is not None else None


def _serialize_rate(value: PolicyRateEvaluation) -> dict[str, Any]:
    return {
        "currency_code": value.currency_code,
        "current_target_rate": _decimal(value.current_target_rate),
        "expected_target_rate": _decimal(value.expected_target_rate),
        "expected_delta_bps": _decimal(value.expected_delta_bps),
        "expected_stance": _signal(value.expected_stance),
        "actual_target_rate": _decimal(value.actual_target_rate),
        "decision_surprise_bps": _decimal(value.decision_surprise_bps),
        "decision_surprise": _signal(value.decision_surprise),
        "next_decision_at": value.next_decision_at,
        "provider_snapshot_at": value.provider_snapshot_at,
        "availability_status": value.availability_status,
        "quality_status": value.quality_status,
    }


def _serialize_usd(value: UsdRelativeEvaluation) -> dict[str, Any]:
    return {
        "foreign_pressure_bps": _decimal(value.foreign_pressure_bps),
        "relative_stance_bps": _decimal(value.relative_stance_bps),
        "relative_signal": _signal(value.relative_signal),
        "covered_central_banks": value.covered_central_banks,
        "required_central_banks": value.required_central_banks,
        "hike_count": value.hike_count,
        "hold_count": value.hold_count,
        "cut_count": value.cut_count,
        "availability_status": value.availability_status,
    }


def _build_payload(expectations: list, min_foreign_coverage: int, is_demo: bool) -> dict[str, Any]:
    return {
        "is_demo": is_demo,
        "rates": [_serialize_rate(evaluate_policy_rate(item)) for item in expectations],
        "usd_relative": _serialize_usd(
            evaluate_usd_relative_stance(expectations, min_foreign_coverage)
        ),
    }


@router.get("/demo")
def get_demo_policy_rates() -> dict[str, Any]:
    return _build_payload(demo_expectations(), min_foreign_coverage=4, is_demo=True)


@router.post("/preview")
def preview_policy_rates(request: PolicyRatePreviewRequest) -> dict[str, Any]:
    return _build_payload(
        [item.to_domain() for item in request.expectations],
        min_foreign_coverage=request.min_foreign_coverage,
        is_demo=False,
    )
