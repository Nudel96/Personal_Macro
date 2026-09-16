"""Independently check public NYU XLS values against Rust and the named test app.

Run with the bundled Python from the repository root. Requires the read-only
xlrd source audit and the explicit Rust original-archive test to have completed.
Only the explicitly named isolated validation profile is read, never the
Personal Macro production database. No personal data goes to a data provider.
"""
import argparse
import base64
import hashlib
import json
import math
import os
from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[4]
DESKTOP = ROOT / "apps/desktop"
PUBLIC = DESKTOP / ".tmp/atlas-validation/valuation"
OUT = Path(__file__).with_name("valuation-earnings-readiness.json")
IDS = ["pe-us", "pe-europe", "pe-japan", "pe-emerging", "pe-global"]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--native", action="store_true")
options = parser.parse_args()
catalog = json.loads((DESKTOP / "src/features/world-atlas/data/valuation-catalog.json").read_text(encoding="utf-8"))
reference = {r["file"]: r for r in json.loads((PUBLIC / "extracted.json").read_text(encoding="utf-8"))}
snapshots = json.loads((PUBLIC / "native-valuation-snapshots.json").read_text(encoding="utf-8"))
metrics = {m["id"]: m for m in catalog["metrics"]}
definitions = {d["id"]: d for d in catalog["datasets"]}


def expected(dataset_id):
    observations = {}
    for file in definitions[dataset_id]["files"]:
        data = reference[file["fileName"]]
        headers = data["headers"]
        for row in data["rows"]:
            name = row[0].strip()
            if name in file["ambiguousSubjects"]:
                continue
            for field in file["fields"]:
                raw = row[headers.index(field["header"])]
                value = raw if isinstance(raw, (int, float)) else None
                metric = metrics[field["metricId"]]
                if row[1] == 0:
                    status = "no_firms"
                elif isinstance(raw, dict) and "error" in raw:
                    status = "source_error"
                elif value is None:
                    assert raw in ["", "NA", "N/A", "n/a", "NM"], raw
                    status = "source_missing"
                elif metric["positiveOnly"] and value <= 0:
                    status = "not_meaningful"
                else:
                    status = "available"
                key = (name, field["metricId"], file["publicationYear"])
                assert key not in observations
                observations[key] = (value, status, int(row[1]), file["fileName"])
    return observations


def audit(data):
    dataset_id = data["datasetId"]
    wanted = expected(dataset_id)
    actual = {}
    positions = {}
    for subject in data["subjects"]:
        for series in subject["series"]:
            for point in series["points"]:
                key = (subject["providerLabel"], series["metricId"], point["year"])
                assert key not in actual
                actual[key] = (point["value"], point["status"], point["firmCount"], point["sourceFile"])
                assert point["methodEpoch"] == ("classification_before_2014" if point["year"] < 2014 else "classification_from_2014")
            positions[series["historicalPosition"]["status"]] = positions.get(series["historicalPosition"]["status"], 0) + 1
            if metrics[series["metricId"]]["kind"] != "valuation":
                assert series["historicalPosition"]["status"] == "not_historical_valuation"
    assert wanted.keys() == actual.keys(), dataset_id
    max_difference = 0
    states = {}
    for key, (value, status, firms, filename) in wanted.items():
        got = actual[key]
        assert (status, firms, filename) == got[1:], (dataset_id, key)
        if value is None:
            assert got[0] is None, key
        else:
            assert math.isclose(value, got[0], rel_tol=2e-15, abs_tol=1e-13), (key, value, got[0])
            max_difference = max(max_difference, abs(value - got[0]))
        states[status] = states.get(status, 0) + 1
    for source in data["provenance"]["files"]:
        raw = (PUBLIC / source["fileName"]).read_bytes()
        assert hashlib.sha256(raw).hexdigest() == source["sha256"]
    return dict(datasetId=dataset_id, publications=len(data["provenance"]["files"]),
                firstYear=min(k[2] for k in actual), lastYear=max(k[2] for k in actual),
                cells=len(actual), states=states, maxAbsoluteDifference=max_difference,
                historicalPositions=positions, allKeysAndFlagsEqual=True)


result = dict(reviewedOn="2026-09-09", catalogVersion=catalog["version"],
              source="https://pages.stern.nyu.edu/~adamodar/New_Home_Page/dataarchived.html",
              datasets=[audit(d) for d in snapshots if d["datasetId"] in IDS],
              completeRustAuditCells=sum(len(s["points"]) for d in snapshots for row in d["subjects"] for s in row["series"]),
              limits=["Source regions are not individual constituent countries.",
                      "India and China retain their existing single PE snapshots.",
                      "The Japan 2025 archive hyperlink is wrong; the original Japan file is explicitly verified and included.",
                      "Older unqualified aggregate columns remain separate definitions.",
                      "No fair value or future cycle is inferred."])
if options.native:
    profile = Path(os.environ["APPDATA"]) / "com.personal-macro.atlas-pe-history-validation" / "PersonalMacro"
    with sqlite3.connect((profile / "database/journal.sqlite").as_uri() + "?mode=ro", uri=True) as db:
        raw = db.execute("SELECT value_json FROM app_settings WHERE key=?", ("atlas.pe-history.validation",)).fetchone()
        assert raw, "Native validation has not finished"
        native = json.loads(raw[0])
    assert native["ok"], native.get("error")
    with sqlite3.connect((profile / "atlas/cache.sqlite").as_uri() + "?mode=ro", uri=True) as db:
        rows = [json.loads(row[0]) for row in db.execute("SELECT data_json FROM atlas_valuation_datasets ORDER BY id")]
    assert {r["datasetId"] for r in rows} == set(IDS)
    result["native"] = dict(identifier=native["identifier"], runAt=native["runAt"],
                            jobs=native["jobs"], datasets=[audit(d) for d in rows],
                            provenance={d["datasetId"]:d["provenance"] for d in rows})
    (DESKTOP / ".tmp/atlas-validation/pe-history-native-snapshots.json").write_text(json.dumps(rows), encoding="utf-8")
    png = base64.b64decode(native["picture"], validate=True)
    assert png.startswith(b"\x89PNG\r\n\x1a\n")
    (DESKTOP / ".tmp/atlas-validation/pe-history-native-picture.png").write_bytes(png)
OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"datasets": len(result["datasets"]), "cells":sum(d["cells"] for d in result["datasets"]), "native": "native" in result}))
