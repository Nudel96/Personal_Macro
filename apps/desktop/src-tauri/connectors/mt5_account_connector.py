"""Read-only bridge between Personal Macro and a local MetaTrader 5 terminal.

The process accepts one JSON request on stdin and emits one JSON response. It
does not expose any order or account mutation operation and never logs secrets.
"""

import json
import sys
from datetime import datetime, timezone


def respond(**payload):
    print(json.dumps(payload, separators=(",", ":")), flush=True)


def fail(code, message):
    respond(ok=False, code=code, message=message)


def number(value):
    return float(value) if value is not None else None


def handle(request):
    try:
        import MetaTrader5 as mt5
    except ImportError:
        fail(
            "MT5_PACKAGE_MISSING",
            "Das Python-Paket MetaTrader5 fehlt. Installiere es einmalig mit 'pip install MetaTrader5'.",
        )
        return

    terminal_path = str(request.get("terminalPath") or "").strip()
    try:
        initialized = mt5.initialize(path=terminal_path) if terminal_path else mt5.initialize()
        if not initialized:
            code, detail = mt5.last_error()
            fail(
                "MT5_INITIALIZE_FAILED",
                f"MetaTrader 5 konnte nicht geöffnet werden ({code}: {detail}).",
            )
            return

        account = mt5.account_info()
        if account is None:
            fail(
                "MT5_NOT_LOGGED_IN",
                "Öffne MetaTrader 5 und melde dich zuerst beim gewünschten Trading-Konto an.",
            )
            return

        login = str(getattr(account, "login", "") or "").strip()
        server = str(getattr(account, "server", "") or "").strip()
        if not login or not server:
            fail(
                "MT5_IDENTITY_MISSING",
                "Das aktive MT5-Konto liefert keine eindeutige Login-/Server-Kennung.",
            )
            return

        respond(
            ok=True,
            data={
                "login": login,
                "server": server,
                "name": getattr(account, "name", None) or None,
                "company": getattr(account, "company", None) or None,
                "currency": str(getattr(account, "currency", "") or "").upper(),
                "balance": number(getattr(account, "balance", None)),
                "equity": number(getattr(account, "equity", None)),
                "leverage": getattr(account, "leverage", None),
                "tradeMode": getattr(account, "trade_mode", None),
                "observedAt": datetime.now(timezone.utc).isoformat(),
            },
        )
    except Exception:
        fail(
            "MT5_CONNECTOR_ERROR",
            "Die lokale MT5-Verbindung konnte nicht gelesen werden.",
        )
    finally:
        try:
            mt5.shutdown()
        except Exception:
            pass


if __name__ == "__main__":
    try:
        handle(json.loads(sys.stdin.read()))
    except json.JSONDecodeError:
        fail("INVALID_REQUEST", "Die MT5-Anfrage ist ungültig.")
