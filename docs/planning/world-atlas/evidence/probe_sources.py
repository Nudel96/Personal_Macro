"""Read-only source checks for the world-atlas plan; never accesses app/user data.

Run from any directory: python probe_sources.py
Writes only public geography metadata and a compact quality report beside this file.
"""

from __future__ import annotations

import hashlib
import json
import re
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

HERE = Path(__file__).resolve().parent
CATALOGS = HERE.parent / "catalogs"
COUNTRIES = "DEU;USA;IND;CHN;BRA;NGA;ZAF;SAU;AUS;JPN;MEX;IDN"
ALLOWED_HOSTS = {"api.worldbank.org", "unstats.un.org"}
INDICATORS = {
    "SP.POP.TOTL": "Bevölkerung",
    "SP.POP.65UP.TO.ZS": "Anteil ab 65 Jahren",
    "SP.DYN.TFRT.IN": "Fertilität",
    "SP.URB.TOTL.IN.ZS": "Urbanisierung",
    "NY.GDP.PCAP.KD": "Reales BIP je Einwohner",
    "SL.UEM.TOTL.ZS": "Arbeitslosigkeit, ILO-Modellschätzung",
    "SE.SEC.ENRR": "Bruttoeinschulungsquote Sekundarstufe",
    "EG.ELC.ACCS.ZS": "Zugang zu Elektrizität",
    "NV.IND.MANF.ZS": "Anteil verarbeitendes Gewerbe",
    "IT.NET.USER.ZS": "Internetnutzung",
}


def read_public(url: str) -> tuple[bytes, dict]:
    if urlparse(url).hostname not in ALLOWED_HOSTS:
        raise ValueError("Source host is outside the explicit research allowlist")
    started = time.monotonic()
    for attempt in range(2):
        try:
            req = Request(url, headers={"User-Agent": "PersonalMacro-WorldAtlas-Planning/1"})
            with urlopen(req, timeout=25) as response:
                if urlparse(response.url).hostname not in ALLOWED_HOSTS:
                    raise ValueError("Unexpected source redirect")
                body = response.read(12_000_001)
                if len(body) > 12_000_000:
                    raise ValueError("Source response exceeded planning probe limit")
                return body, {
                    "url": url,
                    "retrievedAt": datetime.now(timezone.utc).isoformat(),
                    "httpStatus": response.status,
                    "bytes": len(body),
                    "sha256": hashlib.sha256(body).hexdigest(),
                    "elapsedSeconds": round(time.monotonic() - started, 2),
                }
        except (HTTPError, URLError, TimeoutError) as exc:
            if attempt or (isinstance(exc, HTTPError) and exc.code < 500 and exc.code != 429):
                raise
            time.sleep(1)
    raise RuntimeError("Unexpected retry exit")


def worldbank(path: str, **params: str) -> tuple[list, dict]:
    url = "https://api.worldbank.org/v2/" + path + "?" + urlencode(
        {"format": "json", "per_page": "2000", **params}
    )
    payload, provenance = read_public(url)
    parsed = json.loads(payload)
    if not isinstance(parsed, list) or len(parsed) != 2 or not isinstance(parsed[0], dict):
        raise ValueError("Unexpected World Bank response shape")
    if int(parsed[0].get("pages", 1)) != 1:
        raise ValueError("Probe would be incomplete: additional pages are present")
    provenance["providerMetadata"] = parsed[0]
    return parsed[1] or [], provenance


class Tables(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tables = []
        self.table = None
        self.row = None
        self.cell = None

    def handle_starttag(self, tag, attrs):
        if tag == "table":
            self.table = []
        elif tag == "tr" and self.table is not None:
            self.row = []
        elif tag in {"td", "th"} and self.row is not None:
            self.cell = []

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)

    def handle_endtag(self, tag):
        if tag in {"td", "th"} and self.cell is not None:
            self.row.append(" ".join("".join(self.cell).split()))
            self.cell = None
        elif tag == "tr" and self.row is not None:
            self.table.append(self.row)
            self.row = None
        elif tag == "table" and self.table is not None:
            self.tables.append(self.table)
            self.table = None


def geography_check() -> dict:
    body, provenance = read_public("https://unstats.un.org/unsd/methodology/m49/overview/")
    parser = Tables()
    parser.feed(body.decode("utf-8"))
    target = next(table for table in parser.tables if table and "Global Code" in table[0])
    headers = target[0]
    rows = [dict(zip(headers, row)) for row in target[1:] if len(row) == len(headers)]
    areas = []
    for row in rows:
        iso3 = row.get("ISO-alpha3 Code", "")
        if not re.fullmatch(r"[A-Z]{3}", iso3):
            continue
        areas.append({
            "id": "m49:" + row["M49 Code"],
            "nameEn": row["Country or Area"],
            "iso2": row["ISO-alpha2 Code"],
            "iso3": iso3,
            "m49": row["M49 Code"],
            "regionId": "m49:" + row["Region Code"] if row["Region Code"] else None,
            "regionNameEn": row["Region Name"] or None,
            "subregionId": "m49:" + row["Sub-region Code"] if row["Sub-region Code"] else None,
            "subregionNameEn": row["Sub-region Name"] or None,
            "intermediateRegionId": "m49:" + row["Intermediate Region Code"] if row["Intermediate Region Code"] else None,
            "intermediateRegionNameEn": row["Intermediate Region Name"] or None,
            "coverageStatus": "catalogued_not_data_verified",
        })
    if not areas:
        raise ValueError("No M49 areas parsed")
    duplicate_iso3 = [key for key, count in Counter(a["iso3"] for a in areas).items() if count > 1]
    duplicate_ids = [key for key, count in Counter(a["id"] for a in areas).items() if count > 1]
    if duplicate_ids or duplicate_iso3:
        raise ValueError("Duplicate M49 identities")
    CATALOGS.mkdir(parents=True, exist_ok=True)
    (CATALOGS / "geographies.json").write_text(json.dumps({
        "schemaVersion": 1,
        "status": "planning_catalog_not_application_data",
        "source": provenance,
        "note": "UN statistical areas; source geography is not a claim about sovereignty. Missing provider geographies require explicit supplemental mappings. All names retained from the source; German display names are a later UI concern.",
        "areas": areas,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {
        "check": "un_m49_geography_catalog", "status": "passed", "provenance": provenance,
        "areas": len(areas), "duplicateIds": duplicate_ids, "duplicateIso3": duplicate_iso3,
        "regions": dict(Counter(a["regionNameEn"] or "Unassigned" for a in areas)),
        "requestedCountriesPresent": {code: any(a["iso3"] == code for a in areas) for code in ["DEU", "USA", "IND", "CHN"]},
    }


def indicator_check(code: str, label: str) -> dict:
    metadata, meta_provenance = worldbank("indicator/" + code, source="2")
    rows, provenance = worldbank("country/" + COUNTRIES + "/indicator/" + code,
                                date="1960:2025", source="2")
    countries = []
    for country in COUNTRIES.split(";"):
        selected = [row for row in rows if row.get("countryiso3code") == country]
        valid = [row for row in selected if isinstance(row.get("value"), (int, float))]
        years = sorted(int(row["date"]) for row in valid)
        missing = [year for year in range(years[0], years[-1] + 1) if year not in years] if years else []
        countries.append({
            "iso3": country, "returnedRows": len(selected), "nonNullRows": len(valid),
            "firstYear": years[0] if years else None, "lastYear": years[-1] if years else None,
            "internalMissingYears": missing,
            "duplicateYearCount": len(years) - len(set(years)),
            "negativeValueCount": sum(row["value"] < 0 for row in valid),
            "status": "sample_observed" if valid else "no_values_returned",
        })
    item = metadata[0] if metadata else {}
    return {
        "check": "worldbank_indicator_sample", "status": "passed", "indicator": code,
        "labelDe": label, "providerName": item.get("name"), "providerUnit": item.get("unit"),
        "sourceNote": item.get("sourceNote"), "sourceOrganization": item.get("sourceOrganization"),
        "provenance": provenance, "metadataProvenance": meta_provenance, "countries": countries,
        "interpretation": "Published numeric values were inspected for coverage only; publication does not establish observed rather than modeled status. Gross enrollment may exceed 100%; no upper-bound error is inferred.",
    }


def global_population_check() -> dict:
    countries, country_provenance = worldbank("country")
    national = {row["id"]: row for row in countries if row.get("region", {}).get("value") != "Aggregates"}
    values, provenance = worldbank("country/all/indicator/SP.POP.TOTL", source="2", date="2023")
    present = [row for row in values if row.get("countryiso3code") in national and row.get("value") is not None]
    missing = [code for code in national if not any(row.get("countryiso3code") == code for row in present)]
    return {
        "check": "worldbank_global_population_2023", "status": "passed", "year": 2023,
        "provenance": provenance, "countryProvenance": country_provenance,
        "providerNonAggregateAreas": len(national), "areasWithValues": len(present),
        "areasWithoutValue": missing,
        "regionsWithValues": dict(Counter(national[row["countryiso3code"]]["region"]["value"] for row in present)),
        "note": "World Bank regions differ from UN M49. These counts prove coverage for one indicator and year only, never all themes or all historical periods.",
    }


def main():
    jobs = [("un_m49", geography_check), ("worldbank_global", global_population_check)]
    jobs += [(code, lambda c=code, n=label: indicator_check(c, n)) for code, label in INDICATORS.items()]
    checks = []
    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = {executor.submit(fn): name for name, fn in jobs}
        for future in as_completed(futures):
            name = futures[future]
            try:
                result = future.result()
            except Exception as exc:
                result = {"check": name, "status": "failed", "errorType": type(exc).__name__, "message": str(exc)[:250]}
            checks.append(result)
            print(json.dumps({"check": name, "status": result["status"]}), flush=True)
    report = {
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "purpose": "Planning evidence; no production adapter or complete global coverage is claimed.",
        "checks": sorted(checks, key=lambda item: item.get("indicator", item["check"])),
    }
    (HERE / "source-readiness.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"report": str(HERE / "source-readiness.json"), "passed": sum(c["status"] == "passed" for c in checks), "failed": sum(c["status"] == "failed" for c in checks)}), flush=True)


if __name__ == "__main__":
    main()
