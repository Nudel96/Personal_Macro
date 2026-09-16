"""Check fourteen curated WDI contexts against complete public files and native SQLite.

Public replies go into an ignored --raw-dir. Existing research files are checked
against their recorded SHA-256 before reuse; changed date windows are fetched anew.
--cache accepts only the named isolated test profile and opens it read-only.
This numerical audit does not decide indicator interpretation or comparability.
"""
import argparse
import datetime
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import sqlite3

from probe_statistics import get

ROOT = Path(__file__).resolve().parents[4]
PROFILE = "com.personal-macro.atlas-economic-contexts-20260909"
CODES = ["EG.EGY.PRIM.PP.KD", "EG.IMP.CONS.ZS", "EG.ELC.LOSS.ZS",
         "NY.GDP.PETR.RT.ZS", "NY.GDP.NGAS.RT.ZS", "NY.GDP.COAL.RT.ZS",
         "NY.GDP.MINR.RT.ZS", "NY.GDP.FRST.RT.ZS", "NY.GDP.TOTL.RT.ZS",
         "IC.BUS.NDNS.ZS", "TT.PRI.MRCH.XD.WD", "LP.LPI.OVRL.XQ",
         "IS.SHP.GCNW.XQ", "SL.TLF.ADVN.ZS"]


def read(path):
    return json.loads(path.read_text(encoding="utf8"), parse_float=Decimal)


def main(codes=CODES, profile=PROFILE, limits=None, reuse_candidates=True):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw-dir", required=True, type=Path)
    parser.add_argument("--prepare", action="store_true")
    parser.add_argument("--cache", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    catalog = read(ROOT / "apps/desktop/src/features/world-atlas/data/catalog.json")
    definitions = {s["providerCode"]: s for s in catalog["series"]}

    def fetch(url, filename):
        raw = get(url)
        (args.raw_dir / filename).write_bytes(raw)
        return {"url": url, "file": filename, "sha256": hashlib.sha256(raw).hexdigest()}

    def checked(source):
        path = args.raw_dir / source["file"]
        assert path.parent.resolve() == args.raw_dir.resolve()
        assert hashlib.sha256(path.read_bytes()).hexdigest() == source["sha256"]
        return read(path)

    if args.prepare:
        metadata = {r["code"]: r for r in read(args.raw_dir / "candidate-metadata.json")} if reuse_candidates else {}
        values = {r["code"]: r for r in read(args.raw_dir / "candidate-values.json")} if reuse_candidates else {}
        country = fetch("https://api.worldbank.org/v2/country?format=json&per_page=500", "countries.json")
        manifest = {"checkedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    "countryFile": country, "series": []}
        for code in codes:
            end = min(datetime.date.today().year, definitions[code].get("throughYear") or datetime.date.today().year)
            if code in metadata:
                meta = metadata[code]
                pages = [{"url": meta["url"], "file": f"{code}.metadata.json", "sha256": meta["sha256"]}]
            else:
                pages = [fetch(f"https://api.worldbank.org/v2/indicator/{code}?source=2&format=json", f"{code}.metadata.json")]
            candidates = values.get(code, {}).get("pages", [])
            if candidates and all(f"date=1960:{end}&" in p["url"] for p in candidates):
                pages.extend(candidates)
            else:
                for page in range(1, 21):
                    source = fetch(f"https://api.worldbank.org/v2/country/all/indicator/{code}?source=2&format=json&date=1960:{end}&per_page=5000&page={page}", f"{code}.through{end}.page{page}.json")
                    pages.append(source)
                    if checked(source)[0]["pages"] == page:
                        break
            manifest["series"].append({"code": code, "throughYear": end, "pages": pages})
            print(code, "public files prepared", flush=True)
        (args.raw_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf8")

    manifest = read(args.raw_dir / "manifest.json")
    assert [r["code"] for r in manifest["series"]] == codes
    country_rows = checked(manifest["countryFile"])
    assert country_rows[0]["pages"] == 1 and len(country_rows[1]) == country_rows[0]["total"]
    supported = {r["id"] for r in country_rows[1] if r["region"]["id"] not in {"", "NA"}} | {"WLD"}
    mapping = {g["iso3"]: g["id"] for g in catalog["geographies"] if g["iso3"] in supported}
    assert "CHI" not in mapping and len(mapping) == len(set(mapping.values()))
    conn = None
    if args.cache:
        path = args.cache.resolve(strict=True)
        assert profile in path.parts and path.name == "cache.sqlite" and path.parent.name == "atlas"
        conn = sqlite3.connect(path.as_uri() + "?mode=ro", uri=True)
    counts = {"numeric": 0, "missing": 0, "zero": 0, "negative": 0, "over100": 0,
              "flags": 0, "exactDecimal": 0}
    max_difference = Decimal(0)
    coverage = {}
    for entry in manifest["series"]:
        code = entry["code"]
        definition = definitions[code]
        metadata = checked(entry["pages"][0])
        assert metadata[0]["total"] == 1
        assert metadata[1][0]["id"] == code and metadata[1][0]["source"]["id"] == "2"
        assert metadata[1][0]["name"] == definition["providerLabel"]
        rows = []
        identity = None
        for page, source in enumerate(entry["pages"][1:], 1):
            data = checked(source)
            assert f"date=1960:{entry['throughYear']}&" in source["url"]
            assert data[0]["page"] == page
            current = (data[0]["pages"], data[0]["total"], data[0]["lastupdated"])
            assert identity is None or identity == current
            identity = current
            rows.extend(data[1])
        assert len(entry["pages"]) - 1 == identity[0] and len(rows) == identity[1]
        assert all(r["indicator"]["id"] == code and 1960 <= int(r["date"]) <= entry["throughYear"] for r in rows)
        expected = {(mapping[r["countryiso3code"]], int(r["date"])): (r["value"], r.get("obs_status", ""))
                    for r in rows if r["countryiso3code"] in mapping}
        assert len(expected) == sum(r["countryiso3code"] in mapping for r in rows), "Duplicate mapped year"
        by_area = {}
        for (area, year), (value, _) in expected.items():
            if value is not None:
                by_area.setdefault(area, []).append(year)
        coverage[code] = {"areasWithValues": len(by_area), "sourceUpdatedAt": identity[2],
                         "first": min(y for years in by_area.values() for y in years),
                         "last": max(y for years in by_area.values() for y in years),
                         "selected": {iso: {"n": len(years), "years": sorted(years)}
                                      for iso in ["DEU", "USA", "IND", "CHN", "NGA", "ZAF", "BRA", "JPN", "WLD"]
                                      for years in [by_area.get(mapping[iso], [])]}}
        if conn:
            actual = {(area, year): (value, flag) for area, year, value, flag in conn.execute(
                "SELECT geography_id, year, value, source_flag FROM atlas_observations WHERE series_id=?", (definition["id"],))}
            assert actual.keys() == expected.keys(), (code, "Cached year set differs")
            provenance = json.loads(conn.execute("SELECT provenance_json FROM atlas_datasets WHERE series_id=?", (definition["id"],)).fetchone()[0])
            assert provenance["providerUpdatedAt"] == identity[2]
            assert {p["url"]: p["sha256"] for p in provenance["pages"]} == {
                p["url"]: p["sha256"] for p in [manifest["countryFile"], *entry["pages"]]}
        for key, (wanted, flag) in expected.items():
            counts["flags"] += 1
            counts["missing" if wanted is None else "numeric"] += 1
            counts["zero"] += int(wanted == 0)
            counts["negative"] += int(wanted is not None and wanted < 0)
            counts["over100"] += int(wanted is not None and wanted > 100)
            if conn:
                got, cached_flag = actual[key]
                assert cached_flag == flag and (got is None) == (wanted is None)
                if wanted is not None:
                    difference = abs(Decimal(str(got)) - Decimal(wanted))
                    assert difference <= max(Decimal("1e-12"), abs(wanted) * Decimal("1e-14")), (code, key)
                    max_difference = max(max_difference, difference)
                    counts["exactDecimal"] += int(difference == 0)
    if conn:
        conn.close()
    result = {"checkedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
              "status": "native_cache_passed" if args.cache else "source_probe_passed",
              "catalogVersion": catalog["version"], "seriesCount": len(codes),
              "counts": counts, "maximumAbsoluteRepresentationDifference": str(max_difference),
              "coverage": coverage, "sources": manifest,
              "limits": limits if limits is not None else ["Values describe economic context, not fair valuation or a natural cycle.",
                         "Resource rents are source estimates relative to GDP, not company earnings.",
                         "LPI is the historical survey index through WDI source year 2022, not LPI 2.0.",
                         "Source years, real zeros, negative net imports and sparse observations are retained.",
                         "Income, poverty and tax-structure candidates require further comparability metadata and are not added.",
                         "This checks public data and an isolated cache, not native window interaction."]}
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    print(json.dumps({k: v for k, v in result.items() if k not in {"sources", "coverage"}}, ensure_ascii=True))


if __name__ == "__main__":
    main()
