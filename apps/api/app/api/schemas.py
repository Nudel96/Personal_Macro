from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator

from app.domain.policy_rates import PolicyRateExpectation


class PolicyRateExpectationInput(BaseModel):
    currency_code: str = Field(pattern=r"^[A-Za-z]{3}$")
    current_target_rate: Decimal | None = None
    expected_target_rate: Decimal | None = None
    next_decision_at: datetime | None = None
    provider_snapshot_at: datetime | None = None
    actual_target_rate: Decimal | None = None
    quality_status: str = "fresh"
    weight: Decimal = Field(default=Decimal("1"), gt=0)

    @field_validator("currency_code")
    @classmethod
    def normalize_currency_code(cls, value: str) -> str:
        return value.upper()

    def to_domain(self) -> PolicyRateExpectation:
        return PolicyRateExpectation(
            currency_code=self.currency_code,
            current_target_rate=self.current_target_rate,
            expected_target_rate=self.expected_target_rate,
            next_decision_at=self.next_decision_at,
            provider_snapshot_at=self.provider_snapshot_at,
            actual_target_rate=self.actual_target_rate,
            quality_status=self.quality_status,
            weight=self.weight,
        )


class PolicyRatePreviewRequest(BaseModel):
    expectations: list[PolicyRateExpectationInput]
    min_foreign_coverage: int = Field(default=4, ge=1, le=20)
