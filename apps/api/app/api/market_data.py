from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.services.demo_market_data import demo_heatmap, demo_pair, demo_seasonality

router = APIRouter(prefix="/api/v1", tags=["market-overview"])


@router.get("/heatmap/demo")
def get_demo_heatmap() -> dict[str, object]:
    return demo_heatmap()


@router.get("/heatmap/demo/pair/{base}/{quote}")
def get_demo_pair(base: str, quote: str) -> dict[str, object]:
    try:
        return demo_pair(base, quote)
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.get("/seasonality/demo")
def get_demo_seasonality() -> dict[str, object]:
    return demo_seasonality()
