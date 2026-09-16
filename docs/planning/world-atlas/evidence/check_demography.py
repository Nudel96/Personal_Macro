"""Independent check of native UN snapshots against the official compressed CSVs.

Reads only public files in the ignored Atlas validation directory. Run after the
explicit native test with ATLAS_WRITE_DEMOGRAPHY_REVIEW=1. No journal or secrets.
"""

import csv
from decimal import Decimal
import gzip
import hashlib
import io
import json
from pathlib import Path
import zipfile


ROOT = Path(__file__).resolve().parents[4]
LOCAL = ROOT / "apps/desktop/.tmp/atlas-validation"
snapshots = json.loads((LOCAL / "demography-review.json").read_text(encoding="utf-8"))
by_provider = {row["profile"]["providerId"]: row for row in snapshots}
expected = {}
counts = {}
for filename, opener in [
    ("wpp-age.csv.gz", lambda p: gzip.open(p, "rt", encoding="utf-8-sig")),
    ("wpp-update.zip", None),
]:
    path = LOCAL / filename
    if opener:
        handle = opener(path)
    else:
        archive = zipfile.ZipFile(path)
        handle = io.TextIOWrapper(
            archive.open("WPP2024_PopulationByAge5GroupSex_Medium_Update.csv"),
            encoding="utf-8-sig",
        )
    rows = 0
    with handle:
        for record in csv.DictReader(handle):
            rows += 1
            provider = record["LocID"]
            if provider not in by_provider:
                continue
            key = (provider, int(record["Time"]), int(record["AgeGrpStart"]))
            expected[key] = {
                field: Decimal(record[source]) * 1000 if record[source] else None
                for field, source in [
                    ("male", "PopMale"), ("female", "PopFemale"), ("total", "PopTotal")
                ]
            }
    if opener is None:
        archive.close()
    counts[filename] = rows

differences = []
for provider, response in by_provider.items():
    for year in response["profile"]["years"]:
        assert year["kind"] == ("estimate" if year["year"] <= 2023 else "projection")
        assert [a["ageStart"] for a in year["ages"]] == list(range(0, 101, 5))
        for age in year["ages"]:
            original = expected[(provider, year["year"], age["ageStart"])]
            for field in ("male", "female", "total"):
                if original[field] is None:
                    assert age[field] is None
                else:
                    differences.append(abs(Decimal(str(age[field])) - original[field]))

max_error = max(differences)
assert max_error < Decimal("0.00001"), max_error
hashes = {name: hashlib.sha256((LOCAL / name).read_bytes()).hexdigest()
          for name in ("wpp-age.csv.gz", "wpp-update.zip", "wpp-notes.csv")}
assert set(hashes.values()) == {p["sha256"] for p in snapshots[0]["provenance"]["pages"]}
report = {
    "source": "UN DESA Population Division, World Population Prospects 2024; Togo interim update 2026-01-19",
    "license": "CC BY 3.0 IGO",
    "retrievedAt": snapshots[0]["provenance"]["retrievedAt"],
    "checkedProfiles": len(snapshots),
    "checkedValues": len(differences),
    "maxAbsoluteDifferencePeople": str(max_error),
    "sourceRowCounts": counts,
    "sourceHashes": hashes,
    "status": "passed",
}
Path(__file__).with_name("demography-independent-check.json").write_text(
    json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
)
print(json.dumps(report, ensure_ascii=False))
