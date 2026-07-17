from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal

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


class JournalTradeCreate(BaseModel):
    instrument: str = Field(min_length=1, max_length=40)
    direction: Literal["long", "short"]
    status: Literal["open", "closed"] = "closed"
    trade_date: date
    entry_price: float | None = Field(default=None, ge=0)
    exit_price: float | None = Field(default=None, ge=0)
    result_r: float | None = None
    pnl_amount: float | None = None
    strategy: str | None = Field(default=None, max_length=80)
    setup: str | None = Field(default=None, max_length=120)
    thesis: str | None = Field(default=None, max_length=2_000)
    emotion: str | None = Field(default=None, max_length=80)
    macro_context: str | None = Field(default=None, max_length=500)
    seasonality_context: str | None = Field(default=None, max_length=500)
    notes: str | None = Field(default=None, max_length=4_000)


class JournalTradeResponse(JournalTradeCreate):
    id: int
    created_at: datetime
