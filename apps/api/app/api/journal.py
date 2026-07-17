from __future__ import annotations

from fastapi import APIRouter, HTTPException, Response, status

from app.api.schemas import JournalTradeCreate, JournalTradeResponse
from app.services.journal_store import JournalStore, JournalTrade

router = APIRouter(prefix="/api/v1/journal", tags=["journal"])


def _serialize_trade(trade: JournalTrade) -> JournalTradeResponse:
    return JournalTradeResponse(
        id=trade.id,
        instrument=trade.instrument,
        direction=trade.direction,
        status=trade.status,
        trade_date=trade.trade_date,
        entry_price=trade.entry_price,
        exit_price=trade.exit_price,
        result_r=trade.result_r,
        pnl_amount=trade.pnl_amount,
        strategy=trade.strategy,
        setup=trade.setup,
        thesis=trade.thesis,
        emotion=trade.emotion,
        macro_context=trade.macro_context,
        seasonality_context=trade.seasonality_context,
        notes=trade.notes,
        created_at=trade.created_at,
    )


@router.get("/trades", response_model=list[JournalTradeResponse])
def list_trades() -> list[JournalTradeResponse]:
    return [_serialize_trade(trade) for trade in JournalStore().list_trades()]


@router.post("/trades", response_model=JournalTradeResponse, status_code=status.HTTP_201_CREATED)
def create_trade(payload: JournalTradeCreate) -> JournalTradeResponse:
    trade = JournalStore().create_trade(**payload.model_dump())
    return _serialize_trade(trade)


@router.delete("/trades/{trade_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_trade(trade_id: int) -> Response:
    if not JournalStore().delete_trade(trade_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trade not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
