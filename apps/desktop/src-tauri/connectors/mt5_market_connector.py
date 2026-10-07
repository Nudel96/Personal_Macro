"""Read broker-native, completed H4/D1 candles. No orders or journal data.

One bounded JSON request/response; credentials remain in the local MT5 terminal.
Symbol currencies and calculation modes are authoritative. Ambiguous
broker suffixes are never guessed. The selected Market Watch symbol wins only
when it uniquely identifies the requested currency pair.
"""

import json
import math
import re
import sys
from datetime import datetime, timezone

CURRENCIES = ("EUR", "GBP", "AUD", "NZD", "USD", "CAD", "CHF", "JPY", "CNY")
METALS = {"XAU": ("XAU", "GOLD"), "XAG": ("XAG", "SILVER")}
BAR_COUNT = 300


def pairs():
    return ([(base, quote) for i, base in enumerate(CURRENCIES) for quote in CURRENCIES[i + 1:]]
            + [("XAU", "USD"), ("XAG", "USD")])


def metal_identity(item, base):
    # Some CFD brokers report the denomination (USD) as currency_base too.
    # Such rows require a bounded canonical symbol AND an explicit Metals path.
    # Expiry/futures/perpetual descriptors disqualify either metadata route.
    path = getattr(item, "path", "")
    description = getattr(item, "description", "")
    identity = " ".join((item.name, path, description)).lower()
    if (getattr(item, "expiration_time", 0) != 0 or
            re.search(r"future|forward|option|perpetual|(?:^|[\\/_ .-])perp(?:$|[\\/_ .-])", identity)):
        return False
    if item.currency_base in METALS[base]:
        return True
    return (item.currency_base == "USD"
            and re.fullmatch(base + r"USD(?:[._-][A-Za-z0-9]{1,12})?", item.name) is not None
            and re.search(r"(?:^|[\\/])metals(?:\([^)]*\))?(?:[\\/]|$)", path, re.IGNORECASE) is not None)


def choose_symbol(symbols, base, quote, forex_modes, metal_modes=()):
    metal = base in METALS and quote == "USD"
    orientations = ((base, quote, False),) if metal else ((base, quote, False), (quote, base, True))
    modes = forex_modes + metal_modes if metal else forex_modes
    for source_base, source_quote, inverted in orientations:
        base_names = METALS[base] if metal else (source_base,)
        candidates = [
            item for item in symbols
            if (metal_identity(item, base) if metal else item.currency_base in base_names)
            and item.currency_profit == source_quote
            and item.trade_calc_mode in modes
        ]
        visible = [item for item in candidates if item.visible]
        if len(visible) == 1:
            return visible[0], inverted, None
        exact_names = {source_base + source_quote}
        if metal:
            exact_names.update(METALS[base])
        exact = [item for item in candidates if item.name in exact_names]
        if len(exact) == 1:
            return exact[0], inverted, None
        if len(candidates) == 1:
            return candidates[0], inverted, None
        if candidates:
            return None, False, "mt5_symbol_ambiguous"
    return None, False, "mt5_symbol_unavailable"


def completed_bars(mt5, symbol, timeframe, seconds, now):
    # Position zero is the current bar according to the MT5 API contract.
    rates = mt5.copy_rates_from_pos(symbol, timeframe, 1, BAR_COUNT)
    if rates is None or len(rates) == 0:
        return [], "mt5_history_unavailable"
    bars = []
    seen = set()
    for row in rates:
        timestamp = int(row["time"])
        values = [float(row[key]) for key in ("open", "high", "low", "close")]
        opening, high, low, close = values
        if (timestamp in seen or timestamp <= 0 or timestamp + seconds > now
                or not all(math.isfinite(value) and value > 0 for value in values)
                or high < max(opening, low, close) or low > min(opening, high, close)):
            return [], "mt5_invalid_candles"
        seen.add(timestamp)
        bars.append(dict(time=timestamp, open=opening, high=high, low=low, close=close))
    bars.sort(key=lambda bar: bar["time"])
    return bars, None


def read_snapshot(mt5, terminal_path=None):
    options = dict(timeout=10_000)
    if terminal_path:
        options["path"] = terminal_path
    if not mt5.initialize(**options):
        return dict(ok=False, code="MT5_INITIALIZE_FAILED")
    try:
        terminal = mt5.terminal_info()
        account = mt5.account_info()
        if terminal is None or not terminal.connected or account is None:
            return dict(ok=False, code="MT5_NOT_CONNECTED")
        identity = (account.login, account.server)
        if not account.login or not account.server:
            return dict(ok=False, code="MT5_NOT_CONNECTED")
        symbols = mt5.symbols_get()
        if symbols is None:
            return dict(ok=False, code="MT5_SYMBOLS_UNAVAILABLE")
        now = int(datetime.now(timezone.utc).timestamp())
        result = []
        modes = (mt5.SYMBOL_CALC_MODE_FOREX, mt5.SYMBOL_CALC_MODE_FOREX_NO_LEVERAGE)
        metal_modes = (mt5.SYMBOL_CALC_MODE_CFD, mt5.SYMBOL_CALC_MODE_CFDLEVERAGE)
        for base, quote in pairs():
            symbol, inverted, reason = choose_symbol(symbols, base, quote, modes, metal_modes)
            row = dict(base=base, quote=quote, sourceSymbol=symbol.name if symbol else None,
                       inverted=inverted, fourHour=[], daily=[],
                       fourHourReason=reason, dailyReason=reason)
            if symbol:
                if not mt5.symbol_select(symbol.name, True):
                    row["fourHourReason"] = row["dailyReason"] = "mt5_history_unavailable"
                else:
                    row["fourHour"], row["fourHourReason"] = completed_bars(
                        mt5, symbol.name, mt5.TIMEFRAME_H4, 14_400, now)
                    row["daily"], row["dailyReason"] = completed_bars(
                        mt5, symbol.name, mt5.TIMEFRAME_D1, 86_400, now)
            result.append(row)
        current = mt5.account_info()
        if current is None or (current.login, current.server) != identity:
            return dict(ok=False, code="MT5_ACCOUNT_CHANGED")
        return dict(ok=True, data=dict(
            sourceLabel=str(account.server)[:120], observedAt=now, pairs=result))
    finally:
        mt5.shutdown()


def main():
    try:
        request = json.loads(sys.stdin.read(4096))
        if (not isinstance(request, dict) or request.get("operation") != "technical-trends"
                or set(request) - {"operation", "terminalPath"}
                or (request.get("terminalPath") is not None and
                    (not isinstance(request["terminalPath"], str) or len(request["terminalPath"]) > 1024))):
            return dict(ok=False, code="MT5_INVALID_REQUEST")
        import MetaTrader5 as mt5
        return read_snapshot(mt5, request.get("terminalPath"))
    except ImportError:
        return dict(ok=False, code="MT5_PACKAGE_MISSING")
    except Exception:
        # Neither native error details nor account identifiers cross the bridge.
        return dict(ok=False, code="MT5_CONNECTOR_ERROR")


if __name__ == "__main__":
    print(json.dumps(main(), separators=(",", ":"), allow_nan=False), flush=True)
