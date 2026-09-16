"""Independent UIS CSV/API/cache audit, restricted to the disposable Atlas profile.

Run from the repository root after the native validation harness completed.
This only reads public source files and the named education validation profile.
"""
import base64
import collections
import csv
import hashlib
import io
import json
import os
import sqlite3
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
EVIDENCE = Path(__file__).resolve().parent
REVIEW = ROOT / "apps/desktop/.tmp/atlas-validation"
SOURCE = REVIEW / "uis"
PROFILE = Path(os.environ["APPDATA"]) / "com.personal-macro.atlas-education-validation" / "PersonalMacro"
assert PROFILE.parent.name == "com.personal-macro.atlas-education-validation"

def load(path):
    return json.loads(path.read_text(encoding="utf-8"))

def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

config = load(ROOT / "apps/desktop/src/features/world-atlas/data/education-catalog.json")
catalog = load(ROOT / "apps/desktop/src/features/world-atlas/data/catalog.json")
metrics = {m["code"]: m for m in config["metrics"]}
areas = {a["code"]: a for a in config["areas"]}
archive = zipfile.ZipFile(SOURCE / "SDG.zip")
def rows(name):
    return csv.DictReader(io.TextIOWrapper(archive.open(name), encoding="utf-8-sig"))

expected = {}
for name, keys in [("SDG_DATA_NATIONAL.csv", ["INDICATOR_ID", "COUNTRY_ID", "YEAR", "VALUE", "MAGNITUDE", "QUALIFIER"]), ("SDG_DATA_REGIONAL.csv", ["indicator_id", "region_id", "year", "value", "magnitude", "qualifier"])]:
    for row in rows(name):
        code, area, year, raw, magnitude, qualifier = (row[k] for k in keys)
        if code not in metrics or (name.endswith("REGIONAL.csv") and not area.startswith("SDG:")):
            continue
        assert area in areas
        key = (code, area, int(year))
        assert key not in expected
        value = float(raw) if raw else None
        if magnitude in ["NA", "SUPP", "INCLUDED"]:
            value = None
        expected[key] = dict(value=value, magnitude=magnitude, qualifier=qualifier, notes=set())
metadata_rows = 0
for row in rows("SDG_METADATA.csv"):
    if row["INDICATOR_ID"] not in metrics:
        continue
    key = (row["INDICATOR_ID"], row["COUNTRY_ID"], int(row["YEAR"]))
    if key in expected:
        expected[key]["notes"].add((row["TYPE"], row["METADATA"]))
        metadata_rows += 1

cache = sqlite3.connect((PROFILE / "atlas/cache.sqlite").as_uri() + "?mode=ro", uri=True)
provenance = json.loads(cache.execute("SELECT provenance_json FROM atlas_education_dataset WHERE id='uis-education'").fetchone()[0])
assert provenance["sha256"] == hashlib.sha256((SOURCE / "SDG.zip").read_bytes()).hexdigest()
profiles = [json.loads(r[0]) for r in cache.execute("SELECT profile_json FROM atlas_education_areas WHERE dataset_id='uis-education'")]
actual = {}
for profile in profiles:
    assert profile["geographyId"] == areas[profile["providerCode"]]["geographyId"]
    for code, series in profile["series"].items():
        assert [p["year"] for p in series] == sorted({p["year"] for p in series})
        for point in series:
            key = (code, profile["providerCode"], point["year"])
            assert key not in actual
            actual[key] = point
assert actual.keys() == expected.keys()
max_difference = 0
for key, reference in expected.items():
    value = actual[key]
    assert value["magnitude"] == reference["magnitude"] and value["qualifier"] == reference["qualifier"], key
    assert {(n["kind"], n["text"]) for n in value["notes"]} == reference["notes"], key
    if reference["value"] is None:
        assert value["value"] is None
    else:
        max_difference = max(max_difference, abs(value["value"] - reference["value"]))
assert max_difference == 0
api = load(SOURCE / "india-40-api.json")
assert not api["hints"]
india = {k: v for k, v in expected.items() if k[1] == "IND"}
assert len(india) == len(api["records"])
for r in api["records"]:
    key = (r["indicatorId"], r["geoUnit"], r["year"])
    assert india[key]["value"] == r["value"]
    assert india[key]["magnitude"] == (r["magnitude"] or "")
    assert india[key]["qualifier"] == (r["qualifier"] or "")

journal = sqlite3.connect((PROFILE / "database/journal.sqlite").as_uri() + "?mode=ro", uri=True)
native = json.loads(journal.execute("SELECT value_json FROM app_settings WHERE key='atlas.education.validation'").fetchone()[0])
assert native["ok"] and native["identifier"] == PROFILE.parent.name
picture = base64.b64decode(native.pop("picture"), validate=True)
assert picture.startswith(b"\x89PNG\r\n\x1a\n")
(REVIEW / "education-native-picture.png").write_bytes(picture)
native["picture"] = "apps/desktop/.tmp/atlas-validation/education-native-picture.png"
if not native["restart"]:
    write(SOURCE / "first-native.json", native)
first = load(SOURCE / "first-native.json")
if native["restart"]:
    assert native["source"] == first["source"]
result = {
    "verifiedAt": datetime.now(timezone.utc).isoformat(),
    "catalogVersion": catalog["version"], "source": provenance,
    "native": native, "initialNative": first,
    "independentCheck": {
        "numericCells": len(expected), "metadataRows": metadata_rows,
        "uniqueNotes": sum(len(v["notes"]) for v in expected.values()),
        "profiles": len(profiles), "maximumAbsoluteDifference": max_difference,
        "apiIndiaObservations": len(india), "apiVersion": "20260507-91260335",
        "apiMetadataNote": "The API check covers values and flags; native footnotes are compared against the complete bulk metadata file.",
    },
    "metrics": [{"code": code, "topicId": m["topicId"], "kind": m["kind"],
                 "areas": len({k[1] for k in expected if k[0] == code}),
                 "first": min(k[2] for k in expected if k[0] == code),
                 "last": max(k[2] for k in expected if k[0] == code)} for code, m in metrics.items()],
    "limits": ["Country and metric coverage varies.", "Published modelled completion series remain separate from surveys.", "Learning assessments are not overlaid across countries without assessment equivalence.", "No market valuation or sine cycle is inferred.", "Native command and restart checks do not replace the remaining full Atlas UI acceptance."],
}
write(EVIDENCE / "education-native-readiness.json", result)
mapped = {a["geographyId"] for a in areas.values()}
available = {p["geographyId"] for p in profiles}
write(EVIDENCE / "education-geography-audit.json", {
    "catalogVersion": catalog["version"], "sourceSha256": provenance["sha256"],
    "mappedAreas": len(mapped), "areasWithValues": len(available),
    "countryProfilesWithValues": sum(not p["providerCode"].startswith("SDG:") for p in profiles),
    "regionProfilesWithValues": sum(p["providerCode"].startswith("SDG:") for p in profiles),
    "excludedHistoricalOrCombinedAreas": config["excludedCountries"],
    "geographies": [{"id": g["id"], "mapped": g["id"] in mapped, "hasValues": g["id"] in available} for g in catalog["geographies"]],
})
write(REVIEW / "education-native-review.json", [dict(geography=next(g for g in catalog["geographies"] if g["id"]==p["geographyId"]), status="available", profile=p, provenance=provenance) for p in profiles])
print(json.dumps(dict(result["independentCheck"], restart=native["restart"], statuses=dict(collections.Counter(r["status"] for r in native["areas"])))) )
