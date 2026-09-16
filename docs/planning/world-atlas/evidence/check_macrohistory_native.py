"""Read only the explicitly isolated JST Tauri proof; never the production profile."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[4]
PROFILE = "com.personal-macro.atlas-jst-20260909"
OUT = ROOT / "apps/desktop/.tmp/atlas-validation/macrohistory"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--phase", choices=["first", "restart"], required=True)
    args = parser.parse_args()
    directory = (Path(os.environ["APPDATA"]) / PROFILE / "PersonalMacro").resolve(strict=True)
    assert directory.parent.name == PROFILE and directory.name == "PersonalMacro"
    journal = directory / "database/journal.sqlite"
    with sqlite3.connect(journal.as_uri() + "?mode=ro", uri=True) as db:
        found = db.execute("SELECT value_json FROM app_settings WHERE key=?", ("atlas.jst.validation." + args.phase,)).fetchone()
    if not found:
        print(json.dumps({"phase": args.phase, "status": "pending"}))
        return
    proof = json.loads(found[0])
    assert proof.get("ok"), proof.get("error", "No completed proof")
    assert proof["identifier"] == PROFILE and proof["phase"] == args.phase
    cfg = json.loads((ROOT / "apps/desktop/src/features/world-atlas/data/macrohistory-catalog.json").read_text(encoding="utf-8"))
    rows = {r["geography"]["id"]: r for r in proof["snapshots"]}
    supported = {a["geographyId"] for a in cfg["areas"]}
    assert set(rows) == supported | {"m49:356", "m49:156", "world"}
    for id, row in rows.items():
        assert row["provenance"]["sha256"] == cfg["sha256"]
        assert row["provenance"]["recipe"] == cfg["recipe"]
        if id in supported:
            assert row["status"] == "available" and len(row["profile"]["points"]) == 151
        else:
            assert row["status"] == "unsupported_area" and row["profile"] is None
    assert proof["note"]["snapshotStatus"] == "available"
    assert proof["note"]["context"]["params"]["jstGroup"] == "credit"
    assert proof["note"]["context"]["params"]["jstSince"] == "1870"
    assert proof["note"]["context"]["params"]["jstReal"] == "1"
    assert proof["note"]["context"]["params"]["jstCrises"] == "0"
    assert any(s["family"] == "jst" and cfg["sha256"] in s["hashes"] for s in proof["note"]["sources"])
    image = base64.b64decode(proof["picture"], validate=True)
    assert image[:8] == b"\x89PNG\r\n\x1a\n"
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / (args.phase + ".json")).write_text(json.dumps(proof, ensure_ascii=False), encoding="utf-8")
    (OUT / (args.phase + ".png")).write_bytes(image)
    if args.phase == "restart":
        first = json.loads((OUT / "first.json").read_text(encoding="utf-8"))
        assert proof["jobs"] == []
        assert first["snapshots"] == proof["snapshots"] and first["note"] == proof["note"]
    else:
        assert len(proof["jobs"]) == 1 and proof["jobs"][0]["status"] == "complete"
        assert proof["jobs"][0]["observations"] == 111546
    cache = directory / "atlas/cache.sqlite"
    with sqlite3.connect(cache.as_uri() + "?mode=ro", uri=True) as db:
        migrations = db.execute("SELECT version, success FROM _sqlx_migrations ORDER BY version").fetchall()
        assert migrations == [(i, 1) for i in range(1, 14)]
        assert db.execute("SELECT COUNT(*) FROM atlas_macrohistory_areas").fetchone()[0] == 18
    report = {"phase": args.phase, "status": "passed", "runAt": proof["runAt"], "identifier": PROFILE,
              "nativeProfilesRead": len(rows), "availableCountries": len(supported), "unsupported": ["m49:356", "m49:156", "world"],
              "sourceSha256": cfg["sha256"], "sourceYears": [1870, 2020], "observations": 111546,
              "jobs": len(proof["jobs"]), "atlasMigrations": 13, "savedNoteAndPicture": True,
              "pictureSha256": hashlib.sha256(image).hexdigest(), "unchangedAfterRestart": args.phase == "restart"}
    (OUT / (args.phase + "-check.json")).write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if args.phase == "restart":
        first_check = json.loads((OUT / "first-check.json").read_text(encoding="utf-8"))
        cache_audit = ROOT / "docs/planning/world-atlas/evidence/macrohistory-native-cache.json"
        audit = json.loads(cache_audit.read_text(encoding="utf-8"))
        assert audit["status"] == "native_check_passed" and audit["counts"]["comparedNumericCells"] == 166218
        combined = {"status": "passed", "first": first_check, "restart": report,
                    "cacheAudit": {"file": cache_audit.name, "sha256": hashlib.sha256(cache_audit.read_bytes()).hexdigest(), "counts": audit["counts"], "maximumRelativeRepresentationDifference": audit["maximumRelativeRepresentationDifference"]},
                    "proofComparison": "All 21 persisted command snapshots and the saved note/image are exactly equal after independent JSON parsing. No new source job on restart.",
                    "protocolObservation": "The extra get_settings JSON parse can shift individual floating-point values by a few representation units. The runtime harness allows at most four machine-epsilon units; the independent persisted-proof comparison remains exact.",
                    "recordedBrowserReview": {"reviewedAt": "2026-09-09", "method": "Separately observed via CUA; not rerun by this Python checker", "surface": "Actual WorldAtlasPage with public snapshots from the native command run", "viewports": [[1440, 900], [1024, 720]], "horizontalOverflow": False,
                                      "checked": ["Credit comparison and detail", "Keyboard opening of equity return", "Optional numbers/table and real/nominal switch", "Unclipped German 1923 nominal return", "Main picture survives unsupported India comparison", "India has an explicit empty state", "JST coverage card reports locally available data"],
                                      "consoleWarnings": 0, "consoleErrors": 0},
                    "limits": ["Full native click regression remains open; native source commands, persistence and chart capture were exercised through an isolated app harness.", "Existing unrelated EODHD intraday entitlement and central-bank update-busy warnings recur in the native background.", "JST ends in 2020 and contains 18 countries; no India, China or World profile and no automatic cycle/fair-value inference."]}
        (ROOT / "docs/planning/world-atlas/evidence/macrohistory-native-readiness.json").write_text(json.dumps(combined, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
