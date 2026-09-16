"""Verify native WDI command responses before/after a real isolated process restart."""
import argparse
import base64
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import sqlite3

from audit_economic_contexts import CODES, PROFILE


def main(codes=CODES, profile=PROFILE, extra_limits=()):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--proof-dir", type=Path, required=True)
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    first, restart = [json.loads((args.proof_dir / f"{phase}.json").read_text(encoding="utf8"), parse_float=Decimal)
                      for phase in ["first", "restart"]]
    assert first["ok"] and restart["ok"] and first["identifier"] == restart["identifier"] == profile
    assert first["phase"] == "first" and restart["phase"] == "restart" and first["runAt"] < restart["runAt"]
    assert len(first["jobs"]) == 1 and not restart["jobs"]
    job = first["jobs"][0]
    assert job["status"] == "complete" and job["pages"] == job["page"] == len(codes)
    path = args.cache.resolve(strict=True)
    assert profile in path.parts and path.name == "cache.sqlite" and path.parent.name == "atlas"
    signature = lambda r: (r["series"]["providerCode"], r["geography"]["iso3"])
    original = {signature(r): r for r in first["snapshots"]}
    reloaded = {signature(r): r for r in restart["snapshots"]}
    expected = {(code, area) for code in codes for area in ["DEU", "USA", "IND", "CHN", "NGA", "ZAF", "BRA", "JPN", "WLD"]}
    assert original.keys() == reloaded.keys() == expected
    assert len(first["snapshots"]) == len(restart["snapshots"]) == len(expected)
    cells = 0
    with sqlite3.connect(path.as_uri() + "?mode=ro", uri=True) as conn:
        for key, row in original.items():
            again = reloaded[key]
            for field in ["series", "geography", "status", "provenance"]:
                assert row[field] == again[field], (key, field)
            sid, area = row["series"]["id"], row["geography"]["id"]
            cached = {year: (value, flag) for year, value, flag in conn.execute(
                "SELECT year, value, source_flag FROM atlas_observations WHERE series_id=? AND geography_id=?", (sid, area))}
            for snapshot in [row, again]:
                observed = {p["year"]: (p["value"], p["sourceFlag"]) for p in snapshot["points"]}
                assert len(observed) == len(snapshot["points"])
                assert observed.keys() == cached.keys(), key
                for year, (value, flag) in observed.items():
                    wanted, source_flag = cached[year]
                    assert flag == source_flag and (value is None) == (wanted is None)
                    if wanted is not None:
                        assert abs(Decimal(str(wanted)) - value) <= max(Decimal("1e-12"), abs(value) * Decimal("1e-14"))
                if row["series"].get("throughYear"):
                    assert all(y <= row["series"]["throughYear"] for y in observed)
                cells += len(observed)
    pngs = [base64.b64decode(r["picture"]) for r in [first, restart]]
    assert all(p.startswith(b"\x89PNG\r\n\x1a\n") for p in pngs)
    assert pngs[0] == pngs[1], "The captured view changed across the restart"
    result = {"status": "passed", "profile": profile, "firstRun": first["runAt"], "restartRun": restart["runAt"],
              "nativeStatistics": len(codes), "nativeRepliesPerRun": len(expected), "commandCellsCompared": cells,
              "downloadedNumericObservations": job["observations"], "noRestartDownload": True,
              "pngBytes": len(pngs[0]), "pngSha256": hashlib.sha256(pngs[0]).hexdigest(),
              "limits": ["An isolated Tauri harness exercised the real command facade and original React views.",
                         "Two processes were used; this script verifies their persisted results, not OS process history.",
                         "Browser CUA checking supplements this evidence; native-window interaction remains unverified.",
                         "Existing Technicals and central-bank background warnings occurred outside the Atlas.",
                         *extra_limits]}
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf8")
    print(json.dumps(result))


if __name__ == "__main__":
    main()
