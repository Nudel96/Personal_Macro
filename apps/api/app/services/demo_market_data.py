from __future__ import annotations

from typing import Final


# These values are intentionally synthetic.  They demonstrate the exact
# -2..+2 pair comparison model without claiming a live macro conclusion.
CURRENCY_FACTORS: Final[dict[str, dict[str, int | None]]] = {
    "USD": {"cot": -1, "growth": -1, "inflation": 1, "labour": 1, "rates": 0, "seasonality": -1},
    "EUR": {"cot": 0, "growth": 1, "inflation": 0, "labour": -1, "rates": 1, "seasonality": 1},
    "GBP": {"cot": 1, "growth": 0, "inflation": 1, "labour": 0, "rates": 0, "seasonality": -1},
    "JPY": {"cot": -1, "growth": 0, "inflation": -1, "labour": 1, "rates": 1, "seasonality": 0},
    "CHF": {"cot": -1, "growth": -1, "inflation": 0, "labour": 0, "rates": 1, "seasonality": -1},
    "AUD": {"cot": 1, "growth": 1, "inflation": 0, "labour": 1, "rates": 1, "seasonality": 0},
    "CAD": {"cot": 0, "growth": 1, "inflation": -1, "labour": 0, "rates": 0, "seasonality": 1},
    "NZD": {"cot": 1, "growth": 0, "inflation": 1, "labour": -1, "rates": 0, "seasonality": 1},
}

SEASONALITY: Final[list[dict[str, object]]] = [
    {"asset": "Gold", "symbol": "XAU/USD", "window": "Nächste 4 Wochen", "mean_return": 1.8, "hit_rate": 62, "samples": 15, "signal": 1},
    {"asset": "Silber", "symbol": "XAG/USD", "window": "Nächste 4 Wochen", "mean_return": -0.9, "hit_rate": 43, "samples": 15, "signal": -1},
    {"asset": "Bitcoin", "symbol": "BTC/USD", "window": "Nächste 4 Wochen", "mean_return": 2.4, "hit_rate": 57, "samples": 10, "signal": 1},
    {"asset": "Ethereum", "symbol": "ETH/USD", "window": "Nächste 4 Wochen", "mean_return": 1.1, "hit_rate": 55, "samples": 10, "signal": 1},
    {"asset": "AUD", "symbol": "AUD-Strength", "window": "Nächste 4 Wochen", "mean_return": -0.4, "hit_rate": 47, "samples": 15, "signal": -1},
]


def demo_heatmap() -> dict[str, object]:
    rows = []
    for currency, factors in CURRENCY_FACTORS.items():
        available = [value for value in factors.values() if value is not None]
        rows.append(
            {
                "currency": currency,
                "factors": factors,
                "raw_score": sum(available),
                "coverage": len(available),
            }
        )
    return {"is_demo": True, "factors": list(next(iter(CURRENCY_FACTORS.values())).keys()), "currencies": rows}


def demo_pair(base: str, quote: str) -> dict[str, object]:
    normalized_base = base.upper()
    normalized_quote = quote.upper()
    if normalized_base not in CURRENCY_FACTORS or normalized_quote not in CURRENCY_FACTORS:
        raise KeyError(f"Unsupported demo pair: {normalized_base}/{normalized_quote}")
    cells = {
        factor: CURRENCY_FACTORS[normalized_base][factor] - CURRENCY_FACTORS[normalized_quote][factor]
        for factor in CURRENCY_FACTORS[normalized_base]
    }
    return {
        "is_demo": True,
        "symbol": f"{normalized_base}/{normalized_quote}",
        "cells": cells,
        "raw_score": sum(cells.values()),
        "coverage": len(cells),
    }


def demo_seasonality() -> dict[str, object]:
    return {"is_demo": True, "items": SEASONALITY}
