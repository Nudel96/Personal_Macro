"""Fetch a bounded independent nine-country WDI sample for the curated expansion.

Usage: python probe_statistics.py --output-dir <ignored directory>
Reads the production catalog and public HTTPS only; no local user data.
The product mappings are reviewed separately, never approved by this probe.
"""
import argparse
import concurrent.futures
import datetime
import hashlib
import json
import re
import time
import urllib.error
import urllib.request
from pathlib import Path

COUNTRIES = ["DEU", "USA", "IND", "CHN", "BRA", "NGA", "ZAF", "JPN", "WLD"]


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def get(url):
    for attempt in range(3):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "PersonalMacro-Atlas-StatisticsReview/1.0"})
            with urllib.request.build_opener(NoRedirect()).open(request, timeout=30) as response:
                body = response.read(12 * 1024 * 1024 + 1)
                if len(body) > 12 * 1024 * 1024:
                    raise ValueError("Oversized source response")
                return body
        except (urllib.error.URLError, TimeoutError):
            if attempt == 2:
                raise
            time.sleep(1 + attempt)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--end-year", type=int, default=datetime.date.today().year)
    args = parser.parse_args()
    assert 1960 <= args.end_year <= datetime.date.today().year
    root = Path(__file__).resolve().parents[4]
    catalog = json.loads((root / "apps/desktop/src/features/world-atlas/data/statistics-catalog.json").read_text(encoding="utf-8"))
    args.output_dir.mkdir(parents=True, exist_ok=True)

    def probe(series):
        code = series["providerCode"]
        assert re.fullmatch(r"[A-Z0-9.]+", code)
        result = {"code": code, "topicId": series["topicId"], "label": series["label"]}
        try:
            metadata_url = f"https://api.worldbank.org/v2/indicator/{code}?source=2&format=json"
            metadata_raw = get(metadata_url)
            metadata = json.loads(metadata_raw)
            entries = [row for row in metadata[1] if row.get("id") == code and row.get("source", {}).get("id") == "2"]
            assert len(entries) == 1 and entries[0]["name"] == series["providerLabel"]
            end_year = min(args.end_year, series.get("throughYear") or args.end_year)
            url = f"https://api.worldbank.org/v2/country/{';'.join(COUNTRIES)}/indicator/{code}?source=2&format=json&date=1960:{end_year}&per_page=2000"
            raw = get(url)
            data = json.loads(raw)
            assert len(data) == 2 and data[0]["pages"] == 1 and data[0]["total"] == len(data[1])
            assert all(row["indicator"]["id"] == code for row in data[1])
            (args.output_dir / f"{code}.metadata.json").write_bytes(metadata_raw)
            (args.output_dir / f"{code}.data.json").write_bytes(raw)
            result.update(metadata=entries[0], metadataUrl=metadata_url, metadataSha256=hashlib.sha256(metadata_raw).hexdigest(),
                          numericUrl=url, numericSha256=hashlib.sha256(raw).hexdigest(), sourceUpdatedAt=data[0].get("lastupdated"), status="probe_passed")
        except Exception as error:
            result.update(status="probe_failed", errorType=type(error).__name__)
        return result

    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        for result in pool.map(probe, catalog["series"]):
            results.append(result)
            print(result["code"], result["status"], flush=True)
    (args.output_dir / "probe.json").write_text(json.dumps({"checkedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "status": "independent_sample_not_global_approval", "results": results}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    assert all(row["status"] == "probe_passed" for row in results), "Some probes failed; inspect probe.json"


if __name__ == "__main__":
    main()
