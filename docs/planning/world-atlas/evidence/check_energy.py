"""Reconcile native Ember snapshots with the independently downloaded public CSV.

Uses Python Decimal and the original column labels, without importing application
mapping or arithmetic. Reads ignored public fixtures; no journal or network access.
"""
import csv
import hashlib
import json
from collections import Counter
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
INPUT = ROOT / "apps/desktop/.tmp/atlas-validation"
raw = INPUT / "energy/ember-full.csv"
snapshots = json.loads((INPUT / "energy-review.json").read_text(encoding="utf-8"))
provenance = snapshots[0]["provenance"]
digest = hashlib.sha256(raw.read_bytes()).hexdigest()
assert digest == provenance["source"]["sha256"], "Different source releases"
fuel_ids = {
    "Coal": "coal", "Gas": "gas", "Other Fossil": "other_fossil",
    "Nuclear": "nuclear", "Hydro": "hydro", "Bioenergy": "bioenergy",
    "Other Renewables": "other_renewables", "Wind": "wind", "Solar": "solar",
}
metrics = {}
for fuel, fuel_id in fuel_ids.items():
    for category, unit, prefix in [
        ("Electricity generation", "TWh", "generation"),
        ("Electricity generation", "%", "share"),
        ("Capacity", "GW", "capacity"),
    ]:
        metrics[(category, "Fuel", fuel, unit)] = f"{prefix}.{fuel_id}"
metrics.update({
    ("Electricity generation", "Total", "Total Generation", "TWh"): "generation.total",
    ("Electricity demand", "Demand", "Demand", "TWh"): "demand",
    ("Electricity demand", "Demand per capita", "Demand per capita", "MWh"): "demand_per_capita",
    ("Electricity imports", "Electricity imports", "Net Imports", "TWh"): "net_imports",
})
expected_identities = {
    "world": ("World", ""), "m49:276": ("Germany", "DEU"),
    "m49:840": ("United States of America", "USA"), "m49:356": ("India", "IND"),
    "m49:156": ("China", "CHN"), "ember:africa": ("Africa", ""),
    "ember:asia": ("Asia", ""), "ember:europe": ("Europe", ""),
    "ember:north_america": ("North America", ""),
    "ember:latin_america_caribbean": ("Latin America and Caribbean", ""),
    "ember:oceania": ("Oceania", ""), "m49:566": ("Nigeria", "NGA"),
    "m49:710": ("South Africa", "ZAF"), "provider:TWN": ("Taiwan", "TWN"),
    "provider:XKX": ("Kosovo", "XKX"),
}
selected = {name for name, _iso in expected_identities.values()}
values = {}
all_areas = set()
row_count = 0
with raw.open(encoding="utf-8-sig", newline="") as handle:
    for record in csv.DictReader(handle):
        row_count += 1
        all_areas.add((record["Area"], record["Area type"]))
        key = metrics.get(tuple(record[k] for k in ["Category", "Subcategory", "Variable", "Unit"]))
        if key is None or record["Area"] not in selected:
            continue
        identity = (record["Area"], record["ISO 3 code"], int(record["Year"]), key)
        value = Decimal(record["Value"]) if record["Value"] else None
        if identity in values:
            assert values[identity] == value, "Conflicting source rows"
        values[identity] = value
assert row_count == provenance["sourceRowCount"]
assert len(all_areas) == provenance["areaCount"]
counts = Counter()
by_area = []
for snapshot in snapshots:
    assert snapshot["provenance"] == provenance
    assert snapshot["status"] == "available"
    profile = snapshot["profile"]
    geography = snapshot["geography"]
    name, iso = expected_identities[geography["id"]]
    assert profile["geographyId"] == geography["id"]
    assert profile["providerLabel"] == name
    assert profile["aggregate"] == (iso == "")
    if iso:
        assert geography["iso3"] == iso
    source_years = {year for area, code, year, key in values if area == name and code == iso}
    assert source_years == {point["year"] for point in profile["years"]}
    for point in profile["years"]:
        source_keys = {key for area, code, year, key in values if (area, code, year) == (name, iso, point["year"])}
        assert set(point["values"]) == source_keys, (name, point["year"], "Altered key availability")
        counts["absentKeys"] += len(metrics) - len(source_keys)
        for key, native in point["values"].items():
            original = values[(name, iso, point["year"], key)]
            if original is None:
                assert native is None
                counts["nullCells"] += 1
            else:
                assert native is not None
                assert Decimal(str(native)) == original, (name, point["year"], key)
                counts["exactValues"] += 1
                if original == 0:
                    counts["zeroValues"] += 1
                if original < 0:
                    assert key == "net_imports"
                    counts["negativeNetImports"] += 1
    by_area.append({"geographyId": geography["id"], "providerLabel": name, "first": min(source_years), "last": max(source_years)})
assert len(snapshots) == len(expected_identities)
result = {
    "status": "passed", "scope": "Independent original CSV/Decimal comparison with 15 native Rust profiles",
    "retrievedAt": provenance["retrievedAt"], "source": provenance["source"],
    "sourceUpdatedAt": provenance["sourceUpdatedAt"], "sourceBytes": raw.stat().st_size,
    "sourceRows": row_count, "sourceAreas": len(all_areas),
    "sourceAreaTypes": dict(Counter(kind for _area, kind in all_areas)),
    "counts": dict(counts), "reviewedAreas": by_area,
}
Path(__file__).with_name("energy-independent-check.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"status": result["status"], "areas": len(snapshots), "counts": dict(counts)}, ensure_ascii=True))
