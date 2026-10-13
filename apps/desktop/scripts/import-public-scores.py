"""Explicit, hash-verified import of the native public-only score export.

Does not migrate schemas or import personal data. Credentials are read from an
explicit ignored configuration file; errors never reveal connection strings.
"""
import argparse
import hashlib
import json
import math
import re
import time
from pathlib import Path

MODEL = "macro-fundamentals-observed-v1"
CURRENCIES = {"EUR", "GBP", "AUD", "NZD", "USD", "CAD", "CHF", "JPY", "CNY"}
COMMODITIES = {"XAU", "XAG", "XPT", "XPD", "COPPER", "WTI", "BRENT", "NATURAL_GAS"}


def require(value, code):
    if not value:
        raise ValueError(code)


def instrument(value):
    if value.startswith("currency:"):
        return value[9:] in CURRENCIES
    if value.startswith("forex:"):
        pair = value[6:].split("/")
        return len(pair) == 2 and set(pair) <= CURRENCIES and pair[0] != pair[1]
    return value in {f"commodity:{c}/USD" for c in COMMODITIES}


def integer(value):
    return type(value) is int


def validate(data):
    require(set(data) == {"format", "exportedAt", "modelVersion", "observations", "prices"}, "TRANSFER_FIELDS")
    require(data["format"] == "public-score-transfer-v1" and data["modelVersion"] == MODEL, "TRANSFER_MODEL")
    require(integer(data["exportedAt"]) and 0 < data["exportedAt"] <= int(time.time()), "TRANSFER_TIME")
    require(isinstance(data["observations"], list) and len(data["observations"]) <= 100000, "TRANSFER_SIZE")
    batches, seen = {}, set()
    fields = {"instrumentId", "observationKey", "observedAt", "validUntil", "snapshotId", "modelVersion", "origin", "score", "availableComponents", "totalComponents", "contributions"}
    contribution_fields = {"key", "label", "channel", "score", "sourceCurrency", "actual", "forecast", "previous", "releasedAt", "sourceUrl", "reason"}
    for p in data["observations"]:
        require(set(p) == fields and instrument(p["instrumentId"]), "OBSERVATION_FIELDS")
        require(isinstance(p["observationKey"], str) and 0 < len(p["observationKey"]) <= 390 and len(p["snapshotId"]) <= 200, "OBSERVATION_KEY")
        require(p["modelVersion"] == MODEL and p["origin"] in {"captured", "archived_snapshot"}, "OBSERVATION_MODEL")
        require(integer(p["observedAt"]) and integer(p["validUntil"]) and 0 < p["observedAt"] <= data["exportedAt"] and p["observedAt"] <= p["validUntil"] <= p["observedAt"] + 129600, "OBSERVATION_TIME")
        require(integer(p["availableComponents"]) and integer(p["totalComponents"]) and 0 <= p["availableComponents"] <= p["totalComponents"] <= 100, "OBSERVATION_COVERAGE")
        require(p["score"] is None or integer(p["score"]) and -100 <= p["score"] <= 100, "OBSERVATION_SCORE")
        require(isinstance(p["contributions"], list) and len(p["contributions"]) == p["totalComponents"], "OBSERVATION_EVIDENCE")
        for c in p["contributions"]:
            require(set(c) == contribution_fields and len(c["key"]) <= 160 and len(c["label"]) <= 300, "CONTRIBUTION_FIELDS")
            require(c["score"] is None or integer(c["score"]) and -2 <= c["score"] <= 2, "CONTRIBUTION_SCORE")
        scored = [c["score"] for c in p["contributions"] if c["score"] is not None]
        require(len(scored) == p["availableComponents"] and p["score"] == (sum(scored) if scored else None), "OBSERVATION_SUM")
        unique = (p["instrumentId"], p["observationKey"])
        require(unique not in seen, "OBSERVATION_DUPLICATE")
        seen.add(unique)
        key = "desktop:" + p["observationKey"]
        metadata = (p["observedAt"], p["snapshotId"], "desktop_" + p["origin"])
        batch = batches.setdefault(key, {"metadata": metadata, "evidence": {}, "points": []})
        require(batch["metadata"] == metadata, "BATCH_CONFLICT")
        batch["evidence"][p["instrumentId"]] = p["contributions"]
        batch["points"].append(p)
    require(isinstance(data["prices"], list) and len(data["prices"]) <= 80, "PRICE_SIZE")
    price_seen = set()
    for price in data["prices"]:
        require(set(price) == {"instrumentId", "source", "candles"} and instrument(price["instrumentId"]) and price["instrumentId"] not in price_seen, "PRICE_FIELDS")
        price_seen.add(price["instrumentId"])
        source = price["source"]
        require(set(source) == {"provider", "symbol", "label", "inverted", "dataKind", "unit"} and source["provider"] == "mt5" and source["dataKind"] == "ohlc", "PRICE_SOURCE")
        require(type(source["inverted"]) is bool and all(isinstance(source[k], str) and len(source[k]) <= 300 for k in ("symbol", "label", "unit")), "PRICE_SOURCE_FIELDS")
        require(isinstance(price["candles"], list) and len(price["candles"]) <= 2000, "PRICE_CANDLES")
        last = 0
        for c in price["candles"]:
            require(set(c) == {"time", "open", "high", "low", "close"} and integer(c["time"]) and last < c["time"] and c["time"] + 86400 <= data["exportedAt"], "CANDLE_TIME")
            require(all(type(c[k]) in (int, float) and math.isfinite(c[k]) and c[k] > 0 for k in ("open", "high", "low", "close")), "CANDLE_VALUES")
            require(c["low"] <= min(c["open"], c["close"]) <= max(c["open"], c["close"]) <= c["high"], "CANDLE_OHLC")
            last = c["time"]
    return batches


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--sha256", required=True)
    parser.add_argument("--env-file")
    parser.add_argument("--runtime-file")
    parser.add_argument("--validate-only", action="store_true")
    args = parser.parse_args()
    path = Path(args.input)
    require(path.is_absolute() and path.stat().st_size <= 64 * 1024 * 1024, "TRANSFER_PATH")
    raw = path.read_bytes()
    require(re.fullmatch(r"[a-f0-9]{64}", args.sha256) and hashlib.sha256(raw).hexdigest() == args.sha256, "TRANSFER_HASH")
    data = json.loads(raw)
    batches = validate(data)
    report = {"ok": True, "sha256": args.sha256, "observations": len(data["observations"]), "batches": len(batches), "priceSeries": len(data["prices"]), "candles": sum(len(p["candles"]) for p in data["prices"]), "personalTablesImported": False}
    if args.validate_only:
        print(json.dumps(report))
        return
    from dotenv import dotenv_values
    import certifi
    import psycopg2
    from psycopg2.extras import execute_values
    require(args.env_file and args.runtime_file and Path(args.env_file).is_absolute() and Path(args.runtime_file).is_absolute(), "EXPLICIT_CONFIG_REQUIRED")
    config, runtime = dotenv_values(args.env_file), dotenv_values(args.runtime_file)
    schema, identity = runtime["MACRO_PG_SCHEMA"], runtime["MACRO_WORKSPACE_ID"]
    require(re.fullmatch(r"macro_(?:private|stage_[a-f0-9]{32}|test_[a-f0-9]{32})", schema), "SCHEMA_MISMATCH")
    conn = psycopg2.connect(config["DATABASE_URL_UNPOOLED"], sslmode="verify-full", sslrootcert=certifi.where(), connect_timeout=20)
    with conn:
        with conn.cursor() as cur:
            cur.execute("SELECT set_config('search_path',%s,true)", (schema,))
            cur.execute("SELECT identity,revision FROM cloud_workspace WHERE id=1 FOR SHARE")
            before = cur.fetchone()
            require(before and before[0] == identity, "WORKSPACE_MISMATCH")
            cur.execute("SELECT id FROM cloud_score_state WHERE id=1 FOR UPDATE")
            require(cur.fetchone(), "MIGRATION_REQUIRED")
            inserted = 0
            for key, batch in batches.items():
                observed, snapshot, origin = batch["metadata"]
                evidence = json.dumps(batch["evidence"], ensure_ascii=False, separators=(",", ":"), sort_keys=True)
                require(len(evidence.encode()) <= 2097152, "BATCH_EVIDENCE_SIZE")
                cur.execute("INSERT INTO cloud_score_batches(observation_key,observed_at,snapshot_id,model_version,origin,evidence_json) VALUES(%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING", (key, observed, snapshot, MODEL, origin, evidence))
                cur.execute("SELECT observed_at,snapshot_id,model_version,origin,evidence_json FROM cloud_score_batches WHERE observation_key=%s", (key,))
                saved = cur.fetchone()
                require(saved[:4] == (observed, snapshot, MODEL, origin) and json.loads(saved[4]) == batch["evidence"], "IMMUTABLE_BATCH_CONFLICT")
                rows = [(p["instrumentId"], key, p["observedAt"], p["validUntil"], p["score"], p["availableComponents"], p["totalComponents"]) for p in batch["points"]]
                execute_values(cur, "INSERT INTO cloud_score_points(instrument_id,observation_key,observed_at,valid_until,score,available_components,total_components) VALUES %s ON CONFLICT DO NOTHING", rows)
                inserted += cur.rowcount
                cur.execute("SELECT instrument_id,observation_key,observed_at,valid_until,score,available_components,total_components FROM cloud_score_points WHERE observation_key=%s ORDER BY instrument_id", (key,))
                require(cur.fetchall() == sorted(rows), "IMMUTABLE_POINTS_CONFLICT")
            for price in data["prices"]:
                encoded = json.dumps(price, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
                digest = hashlib.sha256(encoded.encode()).hexdigest()
                cur.execute("INSERT INTO cloud_score_price_snapshots(id,instrument_id,imported_at,source_json) VALUES(%s,%s,%s,%s) ON CONFLICT DO NOTHING", (digest, price["instrumentId"], data["exportedAt"], json.dumps(price["source"])))
                execute_values(cur, "INSERT INTO cloud_score_daily_prices(snapshot_id,time,open,high,low,close) VALUES %s ON CONFLICT DO NOTHING", [(digest, c["time"], c["open"], c["high"], c["low"], c["close"]) for c in price["candles"]])
                cur.execute("SELECT time,open,high,low,close FROM cloud_score_daily_prices WHERE snapshot_id=%s ORDER BY time", (digest,))
                require(cur.fetchall() == [(c["time"], c["open"], c["high"], c["low"], c["close"]) for c in price["candles"]], "IMMUTABLE_PRICES_CONFLICT")
            cur.execute("SELECT identity,revision FROM cloud_workspace WHERE id=1")
            require(cur.fetchone() == before, "JOURNAL_CHANGED")
            report.update({"inserted": inserted, "journalRevisionUnchanged": True})
    conn.close()
    print(json.dumps(report))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error) if type(error) is ValueError and re.fullmatch(r"[A-Z_]+", str(error)) else "PUBLIC_SCORE_IMPORT_FAILED"}))
        raise SystemExit(1)
