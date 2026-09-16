"""Audit eight sector WDI series against full public replies and an isolated native cache.

--probe downloads public metadata, country identities and all data pages into
an ignored directory. --cache compares every mapped value, missing year and flag
with the actual Tauri cache, opened read-only. Production profiles are rejected.
"""
import argparse
import concurrent.futures
import datetime
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import sqlite3
import time
import urllib.error
import urllib.request

CODES = ["SL.AGR.EMPL.ZS", "SL.IND.EMPL.ZS", "SL.SRV.EMPL.ZS",
         "NV.MNF.CHEM.ZS.UN", "NV.MNF.FBTO.ZS.UN", "NV.MNF.MTRN.ZS.UN",
         "NV.MNF.TXTL.ZS.UN", "NV.MNF.OTHR.ZS.UN"]
PROFILE = "com.personal-macro.atlas-sector-structure-20260909"
ROOT = Path(__file__).resolve().parents[4]


def read(path):
    return json.loads(path.read_text(encoding="utf8"), parse_float=Decimal)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw-dir", type=Path, required=True)
    parser.add_argument("--probe", action="store_true")
    parser.add_argument("--cache", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    catalog = read(ROOT / "apps/desktop/src/features/world-atlas/data/catalog.json")
    definitions = {s["providerCode"]: s for s in catalog["series"]}
    args.raw_dir.mkdir(parents=True, exist_ok=True)
    fingerprints = []

    def get(url, name):
        req = urllib.request.Request(url, headers={"User-Agent": "PersonalMacro-Atlas-SectorAudit/1.0"})
        for attempt in range(3):
            try:
                with urllib.request.urlopen(req, timeout=45) as response:
                    assert response.url == url, "Unexpected redirect"
                    body = response.read(12 * 1024 * 1024 + 1)
                    assert len(body) <= 12 * 1024 * 1024
                break
            except (TimeoutError, urllib.error.URLError) as error:
                if attempt == 2 or isinstance(error, urllib.error.HTTPError) and error.code not in {429, 500, 502, 503, 504}:
                    raise
                time.sleep(attempt + 1)
        (args.raw_dir / name).write_bytes(body)
        return json.loads(body), {"url": url, "file": name, "sha256": hashlib.sha256(body).hexdigest()}

    if args.probe:
        countries, fingerprint = get("https://api.worldbank.org/v2/country?format=json&per_page=500", "countries.json")
        assert countries[0]["pages"] == 1 and len(countries[1]) == countries[0]["total"]
        fingerprints.append(fingerprint)

        def probe(code):
            metadata, fingerprint = get(f"https://api.worldbank.org/v2/indicator/{code}?source=2&format=json", f"{code}.metadata.json")
            assert metadata[0]["total"] == 1
            assert metadata[1][0]["source"]["id"] == "2"
            assert metadata[1][0]["name"] == definitions[code]["providerLabel"]
            sources = [fingerprint]
            end = definitions[code].get("throughYear") or datetime.date.today().year
            expected = None
            rows = []
            for page in range(1, 21):
                data, fingerprint = get(f"https://api.worldbank.org/v2/country/all/indicator/{code}?source=2&format=json&date=1960:{end}&per_page=5000&page={page}", f"{code}.{page}.json")
                sources.append(fingerprint)
                identity = (data[0]["pages"], data[0]["total"], data[0]["lastupdated"])
                assert data[0]["page"] == page and (expected is None or expected == identity)
                expected = identity
                rows.extend(data[1])
                if page == data[0]["pages"]:
                    break
            assert len(rows) == expected[1]
            numeric = [r for r in rows if r["value"] is not None]
            assert all(r["indicator"]["id"] == code and 1960 <= int(r["date"]) <= end for r in rows)
            print(code, len(numeric), "numeric public rows", flush=True)
            return {"code": code, "pages": sources, "throughYear": end,
                    "sourceUpdatedAt": expected[2], "providerRows": len(rows)}

        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            results = list(pool.map(probe, CODES))
        manifest = {"checkedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    "countryFile": fingerprints[0], "series": results}
        (args.raw_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf8")

    manifest = read(args.raw_dir / "manifest.json")
    for source in [manifest["countryFile"], *[p for s in manifest["series"] for p in s["pages"]]]:
        assert hashlib.sha256((args.raw_dir / source["file"]).read_bytes()).hexdigest() == source["sha256"]
    country_rows = read(args.raw_dir / "countries.json")[1]
    supported = {r["id"] for r in country_rows if r["region"]["id"] not in {"", "NA"}} | {"WLD"}
    mapping = {g["iso3"]: g["id"] for g in catalog["geographies"] if g["iso3"] in supported}
    assert len(mapping) == len(set(mapping.values()))
    conn = None
    if args.cache:
        path = args.cache.resolve(strict=True)
        assert PROFILE in path.parts and path.name == "cache.sqlite" and path.parent.name == "atlas"
        conn = sqlite3.connect(path.as_uri() + "?mode=ro", uri=True)
    totals = {"numeric": 0, "missing": 0, "zero": 0, "flags": 0, "exactDecimal": 0}
    coverage = {}
    max_difference = Decimal(0)
    for entry in manifest["series"]:
        code = entry["code"]
        rows = [r for p in entry["pages"][1:] for r in read(args.raw_dir / p["file"])[1]]
        expected = {(mapping[r["countryiso3code"]], int(r["date"])): (r["value"], r.get("obs_status", ""))
                    for r in rows if r["countryiso3code"] in mapping}
        assert len(expected) == sum(r["countryiso3code"] in mapping for r in rows), "Duplicate mapped year"
        by_area = {}
        for (area, year), (value, _) in expected.items():
            if value is not None:
                by_area.setdefault(area, []).append(year)
        coverage[code] = {"areasWithValues": len(by_area),
                          "first": min(y for years in by_area.values() for y in years),
                          "last": max(y for years in by_area.values() for y in years),
                          "selected": {iso: {"n": len(years), "first": min(years) if years else None, "last": max(years) if years else None}
                                       for iso in ["DEU", "USA", "IND", "CHN", "NGA", "ZAF", "BRA", "JPN", "WLD"]
                                       for years in [by_area.get(mapping[iso], [])]}}
        if conn:
            sid = definitions[code]["id"]
            actual = {(area, year): (value, flag) for area, year, value, flag in conn.execute(
                "SELECT geography_id, year, value, source_flag FROM atlas_observations WHERE series_id=?", (sid,))}
            assert actual.keys() == expected.keys(), (code, "Missing or additional cached years")
            provenance = json.loads(conn.execute("SELECT provenance_json FROM atlas_datasets WHERE series_id=?", (sid,)).fetchone()[0])
            assert provenance["providerUpdatedAt"] == entry["sourceUpdatedAt"]
            assert {p["url"]: p["sha256"] for p in provenance["pages"]} == {
                p["url"]: p["sha256"] for p in [manifest["countryFile"], *entry["pages"]]}
        for key, (wanted, flag) in expected.items():
            totals["flags"] += 1
            totals["missing" if wanted is None else "numeric"] += 1
            totals["zero"] += int(wanted == 0)
            if not conn:
                continue
            got, cached_flag = actual[key]
            assert cached_flag == flag
            assert (got is None) == (wanted is None)
            if wanted is not None:
                difference = abs(Decimal(str(got)) - Decimal(wanted))
                assert difference <= max(Decimal("1e-12"), abs(wanted) * Decimal("1e-14")), (code, key, wanted, got)
                max_difference = max(max_difference, difference)
                totals["exactDecimal"] += int(difference == 0)
    if conn:
        conn.close()
    result = {"checkedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
              "status": "native_cache_passed" if args.cache else "source_probe_passed",
              "catalogVersion": catalog["version"], "seriesCount": len(CODES),
              "counts": totals, "maximumAbsoluteRepresentationDifference": str(max_difference),
              "coverage": coverage, "sources": manifest,
              "limits": ["Employment shares are ILO model estimates; the curated historical window ends in 2024.",
                         "UNIDO manufacturing shares have a narrower denominator than GDP and country-specific coverage.",
                         "Other manufacturing is a published residual including unallocated or unavailable categories.",
                         "Country mapping uses published WDI identities; unassigned CHI and non-world aggregates are excluded.",
                         "Values describe economic structure, not financial valuation or a measured natural cycle."]}
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    print(json.dumps({k: v for k, v in result.items() if k not in {"sources", "coverage"}}, ensure_ascii=True))


if __name__ == "__main__":
    main()
