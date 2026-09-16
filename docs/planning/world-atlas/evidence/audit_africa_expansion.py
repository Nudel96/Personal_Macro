"""Review African WDI source coverage and verify the public cache read-only.

Requires the independently downloaded fixed 1960:2024 source responses in
apps/desktop/.tmp/atlas-africa. No journal, credentials or personal files are read.
Use --baseline before the authorized native import; --verify afterwards.
"""
import argparse
import hashlib
import json
import math
import sqlite3
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
DATA = ROOT / "apps/desktop/src/features/world-atlas/data"
RAW = ROOT / "apps/desktop/.tmp/atlas-africa"
EVIDENCE = Path(__file__).resolve().parent


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def fetch_json(url, path):
    """Bounded public WDI reads; reuse a reviewed local response when present."""
    if path.exists():
        return read(path)
    assert url.startswith("https://api.worldbank.org/v2/")
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=45) as response:
                assert response.url.startswith("https://api.worldbank.org/v2/")
                raw = response.read(12_000_001)
            assert len(raw) <= 12_000_000
            data = json.loads(raw)
            assert len(data) == 2 and data[0]["pages"] == 1
            assert len(data[1]) == data[0]["total"]
            path.write_bytes(raw)
            return data
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2)


def fetch_sources():
    """Reproduce the independent source review without opening any database."""
    RAW.mkdir(parents=True, exist_ok=True)
    catalog = read(DATA / "catalog.json")
    expansion = read(DATA / "africa-development-catalog.json")
    metadata = fetch_json("https://api.worldbank.org/v2/indicator?source=2&format=json&per_page=2000", RAW / "indicators.json")
    directory = fetch_json("https://api.worldbank.org/v2/country?format=json&per_page=500", RAW / "countries.json")
    source_countries = {x["id"] for x in directory[1] if x["region"]["id"] not in ("", "NA")}
    countries = {g["iso3"] for g in catalog["geographies"] if g["regionId"] == "Africa" and g["kind"] != "aggregate" and g["iso3"] in source_countries}
    regions = {r["code"] for r in expansion["regions"]}
    info = {x["id"]: x for x in metadata[1]}
    previous = {x["code"]: x for x in read(RAW / "probe-results.json")} if (RAW / "probe-results.json").exists() else {}
    probes = []
    for series in expansion["series"]:
        code = series["providerCode"]
        assert info[code]["name"] == series["providerLabel"] and info[code]["source"]["id"] == "2"
        # Preserve the exact original URL and body hash if an earlier probe exists.
        url = previous.get(code, {}).get("url", f'https://api.worldbank.org/v2/country/{";".join(sorted(countries | regions))}/indicator/{code}?source=2&format=json&date=1960:2024&per_page=5000')
        path = RAW / (code + ".json")
        data = fetch_json(url, path)
        if code in previous:
            assert digest(path) == previous[code]["sha256"]
        counts = {}
        for row in data[1]:
            assert row["indicator"]["id"] == code
            if row["value"] is not None:
                counts.setdefault(row["countryiso3code"], []).append(int(row["date"]))
        probes.append({"code": code, "label": series["providerLabel"], "url": url, "sha256": digest(path), "updatedAt": data[0]["lastupdated"],
                       "africanAreas": len(set(counts) & countries), "numericValues": sum(len(years) for area, years in counts.items() if area in countries),
                       "regions": {area: [min(years), max(years), len(years)] for area, years in counts.items() if area in regions},
                       "firstYear": min((min(years) for years in counts.values()), default=None), "lastYear": max((max(years) for years in counts.values()), default=None)})
    write(RAW / "probe-results.json", probes)
    # 24 indicators x 3 regions x 67 years fits one bounded 5,000-row page.
    # This checks all old and new WDI regions through each series' own end year.
    definitions = [s for s in catalog["series"] if s["sourceId"] == "worldbank_wdi"]
    batches = []
    for start in range(0, len(definitions), 24):
        codes = [s["providerCode"] for s in definitions[start:start + 24]]
        url = f'https://api.worldbank.org/v2/country/{";".join(sorted(regions))}/indicator/{";".join(codes)}?source=2&format=json&date=1960:2026&per_page=5000'
        path = RAW / f"regions-{start // 24 + 1}.json"
        data = fetch_json(url, path)
        assert all(row["indicator"]["id"] in codes and row["countryiso3code"] in regions for row in data[1])
        batches.append({"file": path.name, "codes": codes, "url": url, "sha256": digest(path), "updatedAt": data[0]["lastupdated"], "rows": len(data[1])})
        print(f"Reviewed region batch {len(batches)}: {len(codes)} series", flush=True)
    write(RAW / "region-probes.json", batches)


def verify_regions(db, catalog, expansion):
    definitions = {s["providerCode"]: s for s in catalog["series"] if s["sourceId"] == "worldbank_wdi"}
    area_map = {r["code"]: r["geographyId"] for r in expansion["regions"]}
    local = {(s, a, y): (v, flag) for s, a, y, v, flag in db.execute("SELECT series_id,geography_id,year,value,source_flag FROM atlas_observations WHERE geography_id IN (?,?,?)", tuple(area_map.values()))}
    provenance = {s: json.loads(p) for s, p in db.execute("SELECT series_id,provenance_json FROM atlas_datasets")}
    seen, compared, missing = set(), 0, 0
    batches = read(RAW / "region-probes.json")
    assert {code for batch in batches for code in batch["codes"]} == set(definitions)
    for batch in batches:
        path = RAW / batch["file"]
        assert digest(path) == batch["sha256"]
        data = read(path)
        for row in data[1]:
            s = definitions[row["indicator"]["id"]]
            year = int(row["date"])
            if year > s.get("throughYear", 2026):
                continue
            assert 1960 <= year <= 2026
            key = (s["id"], area_map[row["countryiso3code"]], year)
            assert key not in seen and key in local, (key, "regional calendar row missing or duplicated")
            seen.add(key)
            assert provenance[s["id"]]["providerUpdatedAt"] == data[0]["lastupdated"]
            assert set(area_map) <= set(provenance[s["id"]]["providerAreas"])
            actual, flag = local[key]
            assert flag == row.get("obs_status", "")
            if row["value"] is None:
                assert actual is None, key
                missing += 1
            else:
                assert actual is not None and math.isclose(actual, row["value"], rel_tol=1e-14, abs_tol=1e-12), key
                compared += 1
    assert set(local) == seen, "Unexpected regional rows or unreviewed years"
    return {"series": len(definitions), "numericCompared": compared, "missingCompared": missing, "sourceBatches": batches}


def snapshot(db, areas):
    result = []
    for g in areas:
        values, series = db.execute(
            "SELECT count(*),count(DISTINCT series_id) FROM atlas_observations WHERE geography_id=? AND value IS NOT NULL",
            (g["id"],),
        ).fetchone()
        result.append({"id": g["id"], "label": g["label"], "iso3": g["iso3"], "numericObservations": values, "seriesWithValues": series})
    return {"numericObservations": sum(g["numericObservations"] for g in result), "geographies": result}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, help="Absolute public atlas/cache.sqlite; required for baseline/verify")
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--baseline", action="store_true")
    action.add_argument("--verify", action="store_true")
    action.add_argument("--fetch-sources", action="store_true", help="Download/reuse public source responses; never opens SQLite")
    args = parser.parse_args()
    if args.fetch_sources:
        fetch_sources()
        return
    assert args.cache, "Pass the public Atlas cache explicitly"
    cache = args.cache.resolve(strict=True)
    assert cache.name == "cache.sqlite" and cache.parent.name == "atlas", "Only the public Atlas cache is allowed"
    db = sqlite3.connect(cache.as_uri() + "?mode=ro", uri=True)
    db.execute("PRAGMA query_only=ON")
    catalog = read(DATA / "catalog.json")
    expansion = read(DATA / "africa-development-catalog.json")
    countries = [g for g in catalog["geographies"] if g["regionId"] == "Africa" and g["kind"] != "aggregate"]
    regions = [g for g in catalog["geographies"] if any(g["id"] == r["geographyId"] for r in expansion["regions"])]
    result = {"checkedAt": datetime.now(timezone.utc).isoformat(), "publicCacheOnly": True,
              "catalogVersion": catalog["version"], "countries": snapshot(db, countries), "regions": snapshot(db, regions)}
    baseline_path = EVIDENCE / "africa-baseline-2026-09-15.json"
    if args.baseline:
        assert not baseline_path.exists(), "Do not overwrite the pre-import baseline"
        write(baseline_path, result)
        print(json.dumps({"countries": result["countries"]["numericObservations"], "regions": result["regions"]["numericObservations"]}))
        return
    baseline = read(baseline_path)
    metadata = {x["id"]: x for x in read(RAW / "indicators.json")[1]}
    source_countries = {x["id"]: x for x in read(RAW / "countries.json")[1]}
    area_map = {g["iso3"]: g["id"] for g in countries if g["iso3"] in source_countries and source_countries[g["iso3"]]["region"]["id"] != "NA"}
    area_map.update({r["code"]: r["geographyId"] for r in expansion["regions"]})
    for region in expansion["regions"]:
        assert source_countries[region["code"]]["name"].strip() == region["providerLabel"]
        assert source_countries[region["code"]]["region"]["id"] == "NA"
    probes = {x["code"]: x for x in read(RAW / "probe-results.json")}
    checks = []
    near_equal = 0
    for s in expansion["series"]:
        code = s["providerCode"]
        assert metadata[code]["name"] == s["providerLabel"] and metadata[code]["source"]["id"] == "2"
        path = RAW / (code + ".json")
        data = read(path)
        assert digest(path) == probes[code]["sha256"]
        assert data[0]["pages"] == 1 and len(data[1]) == data[0]["total"]
        local = {(a, y): v for a, y, v in db.execute("SELECT geography_id,year,value FROM atlas_observations WHERE series_id=?", (s["id"],))}
        provenance = json.loads(db.execute("SELECT provenance_json FROM atlas_datasets WHERE series_id=?", (s["id"],)).fetchone()[0])
        assert provenance["providerUpdatedAt"] == data[0]["lastupdated"], "Independent review must use the same provider release"
        numeric, missing, zeros, negative = 0, 0, 0, 0
        seen = set()
        for row in data[1]:
            assert row["indicator"]["id"] == code
            if row["countryiso3code"] not in area_map:
                continue
            key = (area_map[row["countryiso3code"]], int(row["date"]))
            assert key not in seen and 1960 <= key[1] <= 2024
            seen.add(key)
            assert key in local, (code, key, "missing calendar row")
            source = row["value"]
            actual = local[key]
            if source is None:
                assert actual is None, (code, key, "missing must stay missing")
                missing += 1
            else:
                assert actual is not None and math.isfinite(actual)
                if actual != source:
                    assert math.isclose(actual, source, rel_tol=1e-14, abs_tol=1e-12), (code, key, source, actual)
                    near_equal += 1
                numeric += 1
                zeros += source == 0
                negative += source < 0
        assert not any(y > 2024 for (_, y) in local)
        assert seen == {key for key in local if key[0] in area_map.values()}, "Unexpected African calendar rows"
        checks.append({**probes[code], "id": s["id"], "topicId": s["topicId"], "unit": s["unit"], "sourceOrganization": metadata[code]["sourceOrganization"],
                       "comparedNumeric": numeric, "comparedMissing": missing, "preservedZero": zeros, "preservedNegative": negative,
                       "nativeProvenance": provenance})
    before = {g["id"]: g for g in baseline["countries"]["geographies"]}
    for area in result["countries"]["geographies"]:
        area["addedNumericObservations"] = area["numericObservations"] - before[area["id"]]["numericObservations"]
        area["addedSeriesWithValues"] = area["seriesWithValues"] - before[area["id"]]["seriesWithValues"]
    result.update({"newSeries": len(checks), "newAfricanCountrySeries": sum(c["africanAreas"] for c in checks),
                   "newAfricanCountryValues": sum(c["numericValues"] for c in checks), "countriesBenefiting": sum(g["addedNumericObservations"] > 0 for g in result["countries"]["geographies"]),
                   "comparedNumeric": sum(c["comparedNumeric"] for c in checks), "comparedMissing": sum(c["comparedMissing"] for c in checks),
                   "binaryRoundingDifferencesWithinTolerance": near_equal, "relativeTolerance": 1e-14, "absoluteTolerance": 1e-12,
                   "metadataSha256": digest(RAW / "indicators.json"), "countryDirectorySha256": digest(RAW / "countries.json"), "checks": checks})
    result["allWdiRegions"] = verify_regions(db, catalog, expansion)
    write(EVIDENCE / "africa-expansion-2026-09-15.json", result)
    print(json.dumps({k:v for k,v in result.items() if k not in ("countries","regions","checks")}, ensure_ascii=False))
    db.close()


if __name__ == "__main__":
    main()
