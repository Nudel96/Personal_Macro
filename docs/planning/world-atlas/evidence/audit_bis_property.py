"""Independent raw BIS CSV/Decimal versus isolated native SQLite audit.

Only the explicitly named atlas-property-validation profile is read.
No production journal, backups, credentials, or personal media are used.
"""
from pathlib import Path
import base64
import csv
from datetime import datetime, timezone
from decimal import Decimal
import hashlib
import io
import json
import os
import sqlite3
import zipfile

ROOT = Path(__file__).resolve().parents[4]
EVIDENCE = Path(__file__).resolve().parent
TEMP = ROOT / "apps/desktop/.tmp/atlas-validation"
PROFILE = Path(os.environ["APPDATA"]) / "com.personal-macro.atlas-property-validation/PersonalMacro"


def main():
    raw = (TEMP / "WS_SPP_csv_flat.zip").read_bytes()
    sha = hashlib.sha256(raw).hexdigest()
    archive = zipfile.ZipFile(io.BytesIO(raw))
    assert archive.namelist() == ["WS_SPP_csv_flat.csv"]
    records = list(csv.DictReader(io.StringIO(archive.read(archive.namelist()[0]).decode("utf-8-sig"))))
    geography = json.loads((EVIDENCE.parent / "catalogs/geographies.json").read_text(encoding="utf8"))
    crosswalk = {g["iso2"]: g["id"] for g in geography["areas"] if g.get("iso2")}
    crosswalk.update({"4T": "bis:emerging_economies", "5R": "bis:advanced_economies", "XW": "bis:property_world", "XM": "bis:euro_area"})
    expected = {}
    coverage = {}
    for r in records:
        assert r["STRUCTURE_ID"] == "BIS:WS_SPP(1.0): Selected residential property prices"
        assert r["FREQ:Frequency"] == "Q: Quarterly"
        assert r["UNIT_MULT:Unit Multiplier"] == "0: Units"
        assert r["OBS_STATUS:Observation Status"] == "A: Normal value"
        assert r["OBS_CONF:Observation confidentiality"] == "F: Free"
        assert all(r[k] == "" for k in ["BREAKS:Breaks", "COVERAGE:Coverage", "TITLE_TS:Title (tseries level)", "OBS_PRE_BREAK:Pre-Break Observation"])
        code, label = r["REF_AREA:Reference area"].split(": ", 1)
        id = crosswalk[code]
        metric = {("N: Nominal", "628: Index, 2010 = 100"): "nominal", ("R: Real", "628: Index, 2010 = 100"): "real", ("N: Nominal", "771: Year-on-year changes, in per cent"): "nominalChange", ("R: Real", "771: Year-on-year changes, in per cent"): "realChange"}[(r["VALUE:Value"], r["UNIT_MEASURE:Unit of measure"])]
        period = r["TIME_PERIOD:Time period or range"]
        key = (id, period, metric)
        assert key not in expected
        expected[key] = Decimal(r["OBS_VALUE:Observation Value"]) if r["OBS_VALUE:Observation Value"] else None
        item = coverage.setdefault(id, {"providerCode": code, "providerLabel": label, "metrics": {}})
        item["metrics"].setdefault(metric, []).append(period)
    db = sqlite3.connect(f"{(PROFILE / 'atlas/cache.sqlite').as_uri()}?mode=ro", uri=True)
    assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    cache_version = db.execute("SELECT MAX(version) FROM _sqlx_migrations").fetchone()[0]
    provenance = json.loads(db.execute("SELECT provenance_json FROM atlas_property_dataset WHERE id='bis-residential-property'").fetchone()[0])
    assert provenance["sha256"] == sha
    assert provenance["sourceRowCount"] == len(records)
    actual = {}
    quarter_points = 0
    for id, data in db.execute("SELECT geography_id, profile_json FROM atlas_property_areas WHERE dataset_id='bis-residential-property'"):
        p = json.loads(data, parse_float=Decimal)
        assert p["geographyId"] == id
        assert coverage[id]["providerCode"] == p["providerCode"]
        assert coverage[id]["providerLabel"] == p["providerLabel"]
        for point in p["points"]:
            quarter_points += 1
            for metric in ["real", "nominal", "realChange", "nominalChange"]:
                key = (id, point["period"], metric)
                assert key not in actual
                actual[key] = point[metric]
    numeric, missing, maximum = 0, 0, Decimal(0)
    assert set(expected).issubset(actual)
    for key, value in actual.items():
        source = expected.get(key)
        if source is None:
            assert value is None, (key, value)
            missing += 1
        else:
            assert value is not None, key
            difference = abs(source - value)
            maximum = max(maximum, difference)
            assert difference < Decimal("0.0000000001"), (key, value, source)
            numeric += 1
    assert provenance["numericCellCount"] == numeric
    assert provenance["areaCount"] == len(coverage) == 61
    db.close()
    journal = sqlite3.connect(f"{(PROFILE / 'database/journal.sqlite').as_uri()}?mode=ro", uri=True)
    native = json.loads(journal.execute("SELECT value_json FROM app_settings WHERE key='atlas.property.validation'").fetchone()[0])
    journal.close()
    assert native["identifier"] == "com.personal-macro.atlas-property-validation" and native["ok"] is True
    picture = base64.b64decode(native.pop("picture"), validate=True)
    assert picture.startswith(b"\x89PNG\r\n\x1a\n")
    (TEMP / "property-native-picture.png").write_bytes(picture)
    output = EVIDENCE / "property-native-readiness.json"
    previous = json.loads(output.read_text(encoding="utf8")) if output.exists() else {}
    for item in coverage.values():
        item["metrics"] = {metric: {"quarters": len(periods), "first": min(periods), "last": max(periods)} for metric, periods in item["metrics"].items()}
    result = {
        "checkedAt": datetime.now(timezone.utc).isoformat(), "source": provenance,
        "zipBytes": len(raw), "csvBytes": archive.getinfo(archive.namelist()[0]).file_size,
        "cacheVersion": cache_version, "verifiedNumericCells": numeric,
        "verifiedMissingCells": missing, "profileQuarterPoints": quarter_points,
        "maximumNumericDifference": str(maximum), "geographyCount": len(coverage),
        "coverage": coverage, "native": native,
        "initialNative": previous.get("initialNative") or (previous.get("native") if previous.get("native", {}).get("restart") is False else None),
        "validation": previous.get("validation", {}),
    }
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    print(json.dumps({k: result[k] for k in ["cacheVersion", "verifiedNumericCells", "verifiedMissingCells", "profileQuarterPoints", "geographyCount", "maximumNumericDifference"]}))
    print(json.dumps(native, ensure_ascii=True))


if __name__ == "__main__":
    main()
