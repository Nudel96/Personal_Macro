"""Independent Decimal comparison of WDI source JSON against native SQLite responses.

Run after world_atlas_live_statistics_expansion_roundtrip with
ATLAS_WRITE_STATISTICS_REVIEW=1. Supply the raw nine-country candidate probe
directory and the ignored statistics-review.json. No personal database is read.
"""
import argparse
import datetime
import hashlib
import json
from decimal import Decimal
from pathlib import Path


def read(path):
    return json.loads(path.read_text(encoding="utf-8"), parse_float=Decimal)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw-dir", required=True, type=Path)
    parser.add_argument("--native", required=True, type=Path)
    parser.add_argument("--coverage", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    probe = {row["code"]: row for row in read(args.raw_dir / "probe.json")["results"]}
    native = read(args.native)
    coverage = read(args.coverage)
    by_code = {row["code"]: row for row in coverage}
    countries = ["DEU", "USA", "IND", "CHN", "BRA", "NGA", "ZAF", "JPN", "WLD"]
    fingerprints = {}
    expected = {}
    values = nulls = zeros = negative = exact = flags = profiles = 0
    max_relative = Decimal(0)
    country_coverage = {}
    for row in native:
        code = row["series"]["providerCode"]
        if not row["series"].get("explanation"):
            continue  # The original ten have their separate baseline review.
        if code not in expected:
            candidate = probe[code]
            assert candidate["status"] == "probe_passed", code
            raw_path = args.raw_dir / f"{code}.data.json"
            metadata_path = args.raw_dir / f"{code}.metadata.json"
            digest = hashlib.sha256(raw_path.read_bytes()).hexdigest()
            metadata_digest = hashlib.sha256(metadata_path.read_bytes()).hexdigest()
            assert digest == candidate["numericSha256"]
            assert metadata_digest == candidate["metadataSha256"]
            raw = read(raw_path)
            assert raw[0]["pages"] == 1 and raw[0]["total"] == len(raw[1])
            assert raw[0]["lastupdated"] == by_code[code]["sourceUpdatedAt"]
            expected[code] = {(item["countryiso3code"], int(item["date"])): item for item in raw[1]}
            assert len(expected[code]) == len(raw[1]), "Duplicate source observations"
            fingerprints[code] = {"numericUrl": candidate["numericUrl"], "numericSha256": digest,
                                  "metadataUrl": candidate["metadataUrl"], "metadataSha256": metadata_digest}
            country_coverage[code] = {}
        iso = row["geography"]["iso3"]
        assert iso in countries
        source = expected[code]
        original_years = {year for country, year in source if country == iso}
        assert {point["year"] for point in row["points"]} == original_years
        assert row["provenance"]["providerUpdatedAt"] == by_code[code]["sourceUpdatedAt"]
        years = []
        for point in row["points"]:
            original = source[iso, point["year"]]
            assert point["sourceFlag"] == original.get("obs_status", "")
            flags += 1
            if original["value"] is None:
                assert point["value"] is None
                nulls += 1
                continue
            assert point["value"] is not None
            wanted, actual = Decimal(original["value"]), Decimal(point["value"])
            delta = abs(actual - wanted)
            # Representation tolerance only, not a material analytical tolerance.
            assert delta <= max(Decimal("0.000000000001"), abs(wanted) * Decimal("0.00000000000001")), (code, iso, point["year"], wanted, actual)
            max_relative = max(max_relative, delta / max(Decimal(1), abs(wanted)))
            exact += int(delta == 0)
            values += 1
            zeros += int(wanted == 0)
            negative += int(wanted < 0)
            years.append(point["year"])
        assert row["status"] == ("available" if years else "empty")
        assert iso not in country_coverage[code]
        country_coverage[code][iso] = {"n": len(years), "first": min(years) if years else None,
                                     "last": max(years) if years else None}
        profiles += 1
    assert len(expected) == len(probe) and profiles == len(probe) * len(countries)
    summary = {
        "checkedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "status": "passed",
        "method": "Independent Python Decimal comparison of nine-country raw WDI responses with the native global download and SQLite readback. Annual gaps and source flags compared; no personal database used.",
        "statisticsCompared": len(expected), "nativeStatisticsDownloaded": len(coverage), "profilesCompared": profiles,
        "valuesCompared": values, "exactDecimalMatches": exact, "nullsCompared": nulls,
        "zeroValues": zeros, "negativeValues": negative, "sourceFlagsCompared": flags,
        "maximumRelativeRepresentationDifference": str(max_relative),
        "coverage": country_coverage, "independentSources": fingerprints,
        "limits": ["Nine-country independent numerical sample; it does not certify every worldwide value.",
                   "Global coverage summaries count non-null values, not complete comparable time series.",
                   "An available historical value is not proof of current data or a sector valuation."],
    }
    args.output.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: value for key, value in summary.items() if key not in {"coverage", "independentSources"}}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
