"""Independently compare native Atlas history snapshots with the public OWID CSVs.

Inputs are ignored local review files, never a personal journal database.
Run from any directory after the explicit native live test. This script does no
network access and does not interpolate years or replace missing values.
"""
import csv
import hashlib
import json
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
INPUT = ROOT / "apps/desktop/.tmp/atlas-validation"
OUTPUT = Path(__file__).with_name("history-independent-check.json")
snapshots = json.loads((INPUT / "history-review.json").read_text(encoding="utf-8"))
provenance = snapshots[0]["provenance"]
sources = {}
hashes = {}
for filename, key, column in [
    ("maddison.csv", "gdpPerCapita", "GDP per capita"),
    ("maddison-gdp.csv", "gdp", "GDP"),
]:
    path = INPUT / filename
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    assert digest in {page["sha256"] for page in provenance["pages"]}
    hashes[filename] = digest
    with path.open(encoding="utf-8", newline="") as handle:
        sources[key] = {
            (row["Entity"], int(row["Year"])): Decimal(row[column]) if row[column] else None
            for row in csv.DictReader(handle)
        }

counts = {"originalValues": 0, "worldShares": 0, "missingValues": 0}
maximum_error = Decimal(0)
for snapshot in snapshots:
    assert snapshot["provenance"] == provenance
    profile = snapshot["profile"]
    name = profile["providerLabel"]
    native_years = {point["year"] for point in profile["points"]}
    original_years = {
        year for source in sources.values() for entity, year in source if entity == name
    }
    assert native_years == original_years, (name, "changed years")
    for point in profile["points"]:
        for key, source in sources.items():
            original = source.get((name, point["year"]))
            native = point[key]
            if original is None:
                assert native is None
                counts["missingValues"] += 1
            else:
                delta = abs(Decimal(str(native)) - original)
                assert delta <= max(Decimal("1e-8"), abs(original) * Decimal("1e-14"))
                maximum_error = max(maximum_error, delta)
                counts["originalValues"] += 1
        numerator = sources["gdp"].get((name, point["year"]))
        denominator = sources["gdp"].get(("World", point["year"]))
        if numerator is None or denominator is None or denominator <= 0:
            assert point["worldGdpShare"] is None
            counts["missingValues"] += 1
        else:
            expected = numerator / denominator * 100
            assert abs(Decimal(str(point["worldGdpShare"])) - expected) < Decimal("1e-10")
            counts["worldShares"] += 1

result = {
    "status": "passed",
    "scope": "Independent CSV/Decimal comparison with native Rust output; OWID publication layer, not the inaccessible original MPD workbook",
    "retrievedAt": provenance["retrievedAt"],
    "areas": len(snapshots),
    "counts": counts,
    "maximumOriginalValueError": str(maximum_error),
    "hashes": hashes,
}
OUTPUT.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
print(json.dumps(result, indent=2))
