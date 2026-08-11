"""Read-only MetaTrader 5 connector for the local Personal Macro desktop app.

The process accepts one JSON request on stdin and writes one JSON response to
stdout. It deliberately contains no trading or account mutation operations.
"""

import json
import os
import sys
from datetime import datetime, timezone


TIMEFRAMES = {
    "M1": "TIMEFRAME_M1",
    "M5": "TIMEFRAME_M5",
    "M15": "TIMEFRAME_M15",
    "M30": "TIMEFRAME_M30",
    "H1": "TIMEFRAME_H1",
    "H4": "TIMEFRAME_H4",
    "D1": "TIMEFRAME_D1",
    "W1": "TIMEFRAME_W1",
}


def response(**payload):
    print(json.dumps(payload, separators=(",", ":")), flush=True)


def error(code, message):
    response(ok=False, code=code, message=message)


def category(path):
    value = (path or "").lower()
    if any(word in value for word in ("forex", "fx", "currency")):
        return "Forex"
    if any(word in value for word in ("metal", "commodity", "energy", "oil", "gas")):
        return "Commodities"
    if any(word in value for word in ("index", "indices")):
        return "Indizes"
    if any(word in value for word in ("crypto", "digital")):
        return "Kryptowährungen"
    if any(word in value for word in ("stock", "share", "equity")):
        return "Aktien"
    if "future" in value:
        return "Futures-CFDs"
    return "Sonstige CFDs"


def initialize(mt5):
    terminal_path = os.environ.get("BLACKBULL_MT5_TERMINAL_PATH", "").strip()
    initialized = mt5.initialize(path=terminal_path) if terminal_path else mt5.initialize()
    if not initialized:
        code, detail = mt5.last_error()
        raise RuntimeError(f"MT5_INITIALIZE_FAILED|{code}|{detail}")
    account = mt5.account_info()
    if account is None:
        raise RuntimeError("MT5_NOT_LOGGED_IN|Bitte starte MetaTrader 5 und melde dich bei BlackBull an.")
    return account


def account_identity(account):
    return {
        "login": str(getattr(account, "login", "")),
        "server": str(getattr(account, "server", "") or ""),
        "name": getattr(account, "name", None) or None,
        "company": getattr(account, "company", None) or None,
        "currency": getattr(account, "currency", None) or None,
        "tradeMode": getattr(account, "trade_mode", None),
        "marginMode": getattr(account, "margin_mode", None),
        "leverage": getattr(account, "leverage", None),
    }


def assert_expected_account(account, request):
    expected_login = str(request.get("expectedLogin", "")).strip()
    expected_server = str(request.get("expectedServer", "")).strip().casefold()
    actual_login = str(getattr(account, "login", "")).strip()
    actual_server = str(getattr(account, "server", "") or "").strip().casefold()
    if expected_login and expected_login != actual_login:
        raise RuntimeError(
            "MT5_ACCOUNT_CHANGED|Der aktive MT5-Login hat sich während der Synchronisierung geändert."
        )
    if expected_server and expected_server != actual_server:
        raise RuntimeError(
            "MT5_ACCOUNT_CHANGED|Der aktive MT5-Server hat sich während der Synchronisierung geändert."
        )


def account_snapshot(account):
    return {
        "observedAt": datetime.now(timezone.utc).isoformat(),
        "currency": getattr(account, "currency", None) or "",
        "balance": getattr(account, "balance", None),
        "equity": getattr(account, "equity", None),
        "margin": getattr(account, "margin", None),
        "freeMargin": getattr(account, "margin_free", None),
        "profit": getattr(account, "profit", None),
        "leverage": getattr(account, "leverage", None),
    }


def serialize_deal(item):
    time_msc = int(getattr(item, "time_msc", 0) or int(item.time) * 1000)
    return {
        "ticket": str(item.ticket),
        "orderTicket": str(getattr(item, "order", "") or "") or None,
        "positionId": str(getattr(item, "position_id", "") or "") or None,
        "timeMsc": time_msc,
        "occurredAt": datetime.fromtimestamp(time_msc / 1000, timezone.utc).isoformat(),
        "type": int(item.type),
        "entry": int(item.entry),
        "symbol": getattr(item, "symbol", None) or None,
        "volume": str(item.volume),
        "price": str(item.price),
        "profit": float(getattr(item, "profit", 0.0) or 0.0),
        "commission": float(getattr(item, "commission", 0.0) or 0.0),
        "swap": float(getattr(item, "swap", 0.0) or 0.0),
        "fee": float(getattr(item, "fee", 0.0) or 0.0),
        "magic": str(getattr(item, "magic", "") or "") or None,
        "reason": getattr(item, "reason", None),
        "comment": getattr(item, "comment", None) or None,
        "externalId": getattr(item, "external_id", None) or None,
    }


def serialize_position(item):
    opened_at = datetime.fromtimestamp(int(item.time), timezone.utc).isoformat()
    return {
        "positionId": str(item.ticket),
        "symbol": item.symbol,
        "type": int(item.type),
        "openedAt": opened_at,
        "volume": str(item.volume),
        "priceOpen": str(item.price_open),
        "priceCurrent": str(item.price_current) if item.price_current else None,
        "profit": float(getattr(item, "profit", 0.0) or 0.0),
        "swap": float(getattr(item, "swap", 0.0) or 0.0),
    }


def handle(request):
    try:
        import MetaTrader5 as mt5
    except ImportError:
        error("MT5_PACKAGE_MISSING", "Das Python-Paket MetaTrader5 fehlt. Führe 'pip install MetaTrader5' aus.")
        return

    try:
        account = initialize(mt5)
        assert_expected_account(account, request)
        action = request.get("action")
        if action == "status":
            identity = account_identity(account)
            snapshot = account_snapshot(account)
            response(ok=True, data={
                "connected": True,
                "provider": "BlackBull MT5",
                "accountLogin": identity["login"],
                "accountServer": identity["server"],
                "accountName": identity["name"],
                "accountCompany": identity["company"],
                "accountCurrency": identity["currency"],
                "balance": snapshot["balance"],
                "equity": snapshot["equity"],
                "lastUpdate": datetime.now(timezone.utc).isoformat(),
            })
        elif action == "symbols":
            symbols = mt5.symbols_get()
            if symbols is None:
                error("MT5_SYMBOLS_UNAVAILABLE", "MetaTrader 5 liefert keine verfügbaren Symbole.")
                return
            response(ok=True, data=[{
                "symbol": item.name,
                "description": item.description or None,
                "path": item.path or None,
                "category": category(item.path),
                "visible": bool(item.visible),
                "digits": item.digits,
                "baseCurrency": item.currency_base or None,
                "quoteCurrency": item.currency_profit or None,
            } for item in symbols])
        elif action == "candles":
            symbol = str(request.get("symbol", "")).strip()
            timeframe = str(request.get("timeframe", "")).upper()
            limit = max(1, min(int(request.get("limit", 1500)), 5000))
            start_pos = max(0, min(int(request.get("startPos", 0)), 50000))
            if timeframe not in TIMEFRAMES:
                error("INVALID_TIMEFRAME", "Der angeforderte Zeitrahmen wird nicht unterstützt.")
                return
            if not symbol or not mt5.symbol_select(symbol, True):
                error("SYMBOL_UNAVAILABLE", "Das Symbol ist bei BlackBull nicht verfügbar oder nicht aktivierbar.")
                return
            rates = mt5.copy_rates_from_pos(symbol, getattr(mt5, TIMEFRAMES[timeframe]), start_pos, limit)
            if rates is None or len(rates) == 0:
                error("NO_HISTORY", "Für dieses Symbol und diesen Zeitrahmen sind keine historischen Kerzen verfügbar.")
                return
            response(ok=True, data=[{
                "time": int(item["time"]),
                "open": float(item["open"]),
                "high": float(item["high"]),
                "low": float(item["low"]),
                "close": float(item["close"]),
                "volume": int(item["real_volume"] or item["tick_volume"]),
                "volumeKind": "real" if item["real_volume"] else "tick",
            } for item in rates])
        elif action == "quote":
            symbol = str(request.get("symbol", "")).strip()
            if not symbol or not mt5.symbol_select(symbol, True):
                error("SYMBOL_UNAVAILABLE", "Das Symbol ist bei BlackBull nicht verfügbar oder nicht aktivierbar.")
                return
            tick = mt5.symbol_info_tick(symbol)
            if tick is None:
                error("QUOTE_UNAVAILABLE", "Der Markt ist geschlossen oder MetaTrader 5 liefert keinen aktuellen Kurs.")
                return
            response(ok=True, data={
                "symbol": symbol,
                "bid": float(tick.bid) if tick.bid else None,
                "ask": float(tick.ask) if tick.ask else None,
                "time": datetime.fromtimestamp(tick.time, timezone.utc).isoformat(),
            })
        elif action == "accountSync":
            from_time_msc = max(
                946684800000,
                int(request.get("fromTimeMsc", 946684800000)),
            )
            from_time = datetime.fromtimestamp(from_time_msc / 1000, timezone.utc)
            to_time = datetime.now(timezone.utc)
            deals = mt5.history_deals_get(from_time, to_time)
            if deals is None:
                code, detail = mt5.last_error()
                raise RuntimeError(f"MT5_HISTORY_UNAVAILABLE|{code}: {detail}")
            positions = mt5.positions_get()
            if positions is None:
                code, detail = mt5.last_error()
                raise RuntimeError(f"MT5_POSITIONS_UNAVAILABLE|{code}: {detail}")
            account_after = mt5.account_info()
            if account_after is None:
                raise RuntimeError("MT5_NOT_LOGGED_IN|Der MT5-Login wurde während der Synchronisierung getrennt.")
            assert_expected_account(account_after, request)
            response(ok=True, data={
                "account": account_identity(account_after),
                "snapshot": account_snapshot(account_after),
                "deals": [serialize_deal(item) for item in deals],
                "positions": [serialize_position(item) for item in positions],
            })
        else:
            error("INVALID_REQUEST", "Die Marktanfrage wird nicht unterstützt.")
    except RuntimeError as exc:
        parts = str(exc).split("|", 2)
        code = parts[0]
        message = parts[-1] if len(parts) > 1 else "Keine Verbindung zum BlackBull-MT5-Terminal."
        error(code, message)
    except Exception:
        error("MT5_CONNECTOR_ERROR", "Die BlackBull-MT5-Verbindung konnte nicht hergestellt werden.")
    finally:
        try:
            mt5.shutdown()
        except Exception:
            pass


if __name__ == "__main__":
    try:
        handle(json.loads(sys.stdin.read()))
    except json.JSONDecodeError:
        error("INVALID_REQUEST", "Die Marktanfrage ist ungültig.")
