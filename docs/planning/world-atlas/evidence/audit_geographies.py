"""Audit the implemented source crosswalks using public source evidence only.

Reads the previously validated UN/Maddison/Ember files from the ignored review
directory. --refresh-worldbank refreshes only the public country directory.
No journal, account, API key or private database is read.
"""
import argparse
import csv
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import HTTPRedirectHandler, build_opener

ROOT = Path(__file__).resolve().parents[4]
EVIDENCE = Path(__file__).resolve().parent
DATA = ROOT / "apps/desktop/src/features/world-atlas/data"
REVIEW = ROOT / "apps/desktop/.tmp/atlas-validation"
COUNTRY_URL = "https://api.worldbank.org/v2/country?format=json&per_page=500"


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise RuntimeError("Unexpected redirect from the fixed World Bank host")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh-worldbank", action="store_true")
    args = parser.parse_args()
    country_file = REVIEW / "worldbank-countries.json"
    if args.refresh_worldbank:
        with build_opener(NoRedirect).open(COUNTRY_URL, timeout=30) as response:
            raw = response.read(2_000_001)
        assert len(raw) <= 2_000_000, "Country directory exceeds expected size"
        json.loads(raw)
        country_file.write_bytes(raw)
    countries = read(country_file)
    assert countries[0]["pages"] == 1 and countries[0]["total"] == len(countries[1])
    country_codes = [row["id"] for row in countries[1] if row["region"]["id"] not in ("", "NA")]
    assert len(set(country_codes)) == len(country_codes)
    catalog = read(DATA / "catalog.json")
    geographies = {g["id"]: g for g in catalog["geographies"]}
    public = read(DATA / 'public-series-catalog.json')
    public_files = {
        'bis-dsr': ('WS_DSR.zip', 'public-dsr-audit.json'),
        'oecd-wages': ('oecd-wages.csv', 'public-oecd-wages-audit.json'),
        'oecd-hours': ('oecd-hours.csv', 'public-oecd-hours-audit.json'),
        'worldbank-wgi': ('WGI2025.xlsx', 'public-wgi-audit.json'),
        'census-construction': ('census-private-nsa.xlsx', 'public-census-audit.json'),
        'iea-ev': ('iea-ev-historical.csv', 'public-iea-audit.json'),
        'oecd-housing-stock': ('oecd-housing-stock.xlsx', 'public-housing-stock-audit.json'),
        'eia-battery-storage': ('eia-battery-2024.xlsx', 'public-eia-storage-audit.json'),
        'epo-quantum-sensing': ('epo-quantum-sensing.pptx', 'public-epo-audit.json'),
        'epo-cosmonautics': ('epo-cosmonautics.pptx', 'public-epo-audit.json'),
        'worldbank-gfdd-concentration': ('worldbank-gfdd-2022.xlsx', 'public-gfdd-audit.json'),
        'aci-trilemma': ('aci-trilemma-2020.xlsx', 'public-trilemma-audit.json'),
        'jst-exchange-regimes': ('jst-regimes-r6.xlsx', 'public-regimes-audit.json'),
        'eu-advanced-materials': ('eu-materials-2026.pdf', 'public-materials-audit.json'),
        'sasol-synthetic-fuels': ('sasol-synthetic-fuels-originals.bin', 'public-synfuels-audit.json'),
    }
    public_evidence = {}
    eurostat_contracts = read(DATA / 'public-eurostat-contract.json')
    for contract in eurostat_contracts:
        public_files[contract['sourceId']] = (f"eurostat-{contract['dataset']}.json", 'public-eurostat-audit.json')
    for contract in read(DATA / 'public-bgs-contract.json'):
        public_files[contract['sourceId']] = (contract['rawFile'], 'public-bgs-audit.json')
    for contract in read(DATA / 'public-energy-contract.json'):
        public_files[contract['sourceId']] = (contract['file'], 'public-energy-audit.json')
    for contract in read(DATA / 'public-sbs-contract.json'):
        public_files[contract['sourceId']] = (contract['file'], 'public-sbs-audit.json')
    for contract in read(DATA / 'public-tiva-contract.json'):
        public_files[contract['sourceId']] = (contract['file'], 'public-tiva-audit.json')
    wits = read(DATA / "public-wits-contract.json")
    public_files[wits["sourceId"]] = (wits["packageFile"], "public-wits-audit.json")
    ndgain = read(DATA / "public-ndgain-contract.json")
    public_files[ndgain["sourceId"]] = (ndgain["file"], "public-ndgain-audit.json")
    cpp = read(DATA / "public-cpp-contract.json")
    public_files[cpp["sourceId"]] = (cpp["file"], "public-cpp-audit.json")
    gap_dir = ROOT / 'apps/desktop/.tmp/atlas-gaps'
    gap_audits = {a['sourceId']: (a, 'gap-source-audit-2026-09-15.json') for a in read(EVIDENCE / 'gap-source-audit-2026-09-15.json')}
    gap_audits.update({a['sourceId']: (a, 'battery-expansion-sources-2026-09-15.json') for a in read(EVIDENCE / 'battery-expansion-sources-2026-09-15.json')})
    gap_audits.update({a['sourceId']: (a, 'imts-source-audit-2026-09-15.json') for a in read(EVIDENCE / 'imts-source-audit-2026-09-15.json')})
    for source in public['sources']:
        if source['id'] in gap_audits:
            audit, audit_name = gap_audits[source['id']]
            original = gap_dir / audit['sourceFile']
            if source['adapter'] == 'wto_merchandise':
                import zipfile, io
                from build_gap_sources import wto_fingerprint
                with zipfile.ZipFile(original) as z:
                    records=list(csv.DictReader(io.StringIO(z.read(z.namelist()[0]).decode('cp1252'), newline='')))
                assert wto_fingerprint(records) == audit['sha256'] == source['expectedSha256']
            elif source['adapter'] == 'iea_battery_chart':
                from bs4 import BeautifulSoup
                contract = read(DATA / 'public-battery-contracts.json')[source['id']]
                nodes = BeautifulSoup(original.read_text('utf-8'), 'html.parser').select(f'[data-chart-identifier="{contract["slug"]}"][data-chart-csv]')
                assert len(nodes) == 1
                payload = '\0'.join(nodes[0]['data-chart-' + a].replace('\r\n', '\n') for a in contract['attributes']).encode('utf-8')
                assert hashlib.sha256(payload).hexdigest() == audit['canonicalSha256'] == source['expectedSha256']
            else:
                assert digest(original) == audit['sha256'] == source['expectedSha256']
            expected = read(gap_dir / 'expected' / (source['id'] + '.json'))
            mapping = {a['geographyId']: a for a in source['areas']}
            assert len(mapping) == len(source['areas'])
            assert set(mapping) == {r['geographyId'] for r in expected}
            metrics = {m['id']: m for m in public['metrics'] if m['sourceId'] == source['id']}
            for row in expected:
                a = mapping[row['geographyId']]
                assert a['code'] == row['providerArea'] and a['label'] == row['providerLabel']
                assert a['seriesTitles'][metrics[row['metricId']]['providerCode']] == row['providerTitle']
                assert row['geographyId'] in geographies
            assert sum(p['value'] is not None for r in expected for p in r['points']) == source['expectedNumeric'] == audit['numeric']
            public_evidence['public:' + source['id']] = {'url': source['url'], 'sha256': source['expectedSha256'], 'auditSha256': digest(EVIDENCE / audit_name), 'meaning': 'Original source area identities and exact independently extracted profiles. Historical states, benchmark aggregates and chart vintages stay separate.'}
            continue
        original, audit_name = public_files[source['id']]
        audit = read(EVIDENCE / audit_name)
        if isinstance(audit, list):
            audit = next(a for a in audit if a['source']['id'] == source['id'])
        assert digest(ROOT / 'apps/desktop/.tmp/atlas-remaining-40' / original) == source['expectedSha256']
        if source['id'] in ('bis-dsr', 'census-construction'):
            assert audit['sha256'] == source['expectedSha256']
            assert {a['geographyId'] for a in source['areas']} == {row['geographyId'] for row in audit['series']}
        else:
            assert audit['source']['areas'] == source['areas']
            assert audit['source']['expectedSha256'] == source['expectedSha256']
        assert len({a['geographyId'] for a in source['areas']}) == len(source['areas'])
        assert all(a['geographyId'] in geographies for a in source['areas'])
        public_evidence['public:' + source['id']] = {'url': source['url'], 'sha256': source['expectedSha256'], 'auditSha256': digest(EVIDENCE / audit_name), 'meaning': 'Explicit source identities and metric-specific coverage. No inferred world or successor-state aggregates.'}
    findex = read(DATA / 'findex-catalog.json')
    findex_review = read(EVIDENCE / 'findex-source-audit.json')
    assert digest(REVIEW / 'findex/GlobalFindexDatabase2025.csv') == findex['sha256'] == findex_review['sourceSha256']
    assert findex['areas'] == findex_review['mapping'] and len(findex['areas']) == 174
    assert all(geographies[a['geographyId']]['iso3'] == a['iso3'] for a in findex['areas'])
    labor = read(DATA / 'labor-catalog.json')
    labor_review = read(EVIDENCE / 'labor-source-audit.json')
    assert digest(REVIEW / 'labor/employment.csv') == labor['sha256'] == labor_review['sourceSha256']
    assert len(labor['areas']) == labor_review['mappedProfiles'] == 190
    assert all(geographies[a['geographyId']]['iso3'] == a['iso3'] for a in labor['areas'])
    innovation = read(DATA / 'innovation-catalog.json')
    innovation_review = read(EVIDENCE / 'innovation-source-audit.json')
    assert innovation['areas'] == innovation_review['mapping']
    assert len(innovation['areas']) == 199
    assert digest(REVIEW / 'innovation/current-publications.csv') == innovation['sha256'] == innovation_review['sha256']
    assert all(geographies[a['geographyId']]['iso3'] == a['iso3'] for a in innovation['areas'])
    health = read(DATA / 'health-finance-catalog.json')
    health_review = read(EVIDENCE / 'health-source-audit.json')
    assert health['areas'] == health_review['areaCrosswalk']
    assert len(health['areas']) == 195
    for f in health['files']:
        assert digest(REVIEW / 'ghed' / f['localFile']) == f['sha256']
    assert all(geographies[a['geographyId']]['iso3'] == a['code'] for a in health['areas'])
    debt = read(DATA / 'debt-catalog.json')
    debt_review = read(EVIDENCE / 'debt-source-audit.json')
    assert digest(REVIEW / 'debt/source.zip') == debt_review['sha256'] == debt['reviewedSha256']
    assert {(a['code'], a['label'], a['seriesLabel'], a['geographyId'], a['decimals']) for a in debt['areas']} == {(a['code'], a['label'], a['seriesLabel'], a['geographyId'], a['decimals']) for a in debt_review['coverage']}
    assert all(geographies[a['geographyId']]['kind'] == 'aggregate' and not geographies[a['geographyId']]['iso3'] for a in debt['regions'])
    iso = {g["iso3"]: g["id"] for g in geographies.values() if g["iso3"]}
    assert len(iso) == sum(bool(g["iso3"]) for g in geographies.values())
    country_codes.append("WLD")
    wdi_regions = read(DATA / 'africa-development-catalog.json')['regions']
    for region in wdi_regions:
        matches = [row for row in countries[1] if row['id'] == region['code']]
        assert len(matches) == 1 and matches[0]['name'].strip() == region['providerLabel']
        assert matches[0]['region']['id'] == 'NA'
        assert geographies[region['geographyId']]['kind'] == 'aggregate'
        assert not geographies[region['geographyId']]['iso3']
    unresolved_wdi = sorted(set(country_codes) - set(iso))
    assert unresolved_wdi == ["CHI"], "Review new or changed World Bank geography identities"
    statistics = read(EVIDENCE / "statistics-coverage.json")
    assert statistics["summary"]["unmappedProviderAreas"] == unresolved_wdi
    demographics = read(EVIDENCE / "demography-readiness.json")
    history = read(EVIDENCE / "history-readiness.json")
    energy = read(DATA / "energy-catalog.json")
    energy_review = read(REVIEW / "energy-review.json")
    agriculture = read(DATA / "agriculture-catalog.json")
    agriculture_review = read(EVIDENCE / "agriculture-source-audit.json")
    macrohistory = read(DATA / "macrohistory-catalog.json")
    macrohistory_review = read(EVIDENCE / "macrohistory-source-audit.json")
    fiscal = read(DATA / "fiscal-catalog.json")
    fiscal_review = read(EVIDENCE / "fiscal-source-audit.json")
    assert digest(ROOT / ".tmp/atlas-validation/fiscal/snapshot.xlsx") == fiscal_review["sha256"] == fiscal["sha256"]
    assert {(a["code"], a["ifs"], a["geographyId"], tuple(a["providerLabels"])) for a in fiscal["areas"]} == {(code, a["ifs"], a["geographyId"], tuple(a["providerLabels"])) for code, a in fiscal_review["coverage"].items()}
    assert all(geographies[a["geographyId"]]["iso3"] == a["code"] for a in fiscal["areas"])
    assert digest(REVIEW / "macrohistory/raw/JSTdatasetR6.xlsx") == macrohistory_review["sha256"] == macrohistory["sha256"]
    assert {(a["code"], a["ifs"], a["geographyId"], a["providerLabel"]) for a in macrohistory["areas"]} == {(code, a["ifs"], a["geographyId"], a["providerLabel"]) for code, a in macrohistory_review["coverage"].items()}
    assert all(geographies[a["geographyId"]]["iso3"] == a["code"] for a in macrohistory["areas"])
    assert digest(REVIEW / "agriculture/source.zip") == agriculture_review["sha256"]
    assert {(a["code"], a["m49"], a["geographyId"]) for a in agriculture["areas"]} == {(a["code"], a["m49"], a["geographyId"]) for a in agriculture_review["areas"]}
    energy_file = REVIEW / "energy/ember-full.csv"
    assert digest(energy_file) == energy_review[0]["provenance"]["source"]["sha256"]
    energy_regions = {row["name"]: row["id"] for row in energy["regions"]}
    energy_regions["World"] = "world"
    energy_ids = set()
    energy_unmapped = set()
    with energy_file.open(encoding="utf-8-sig", newline="") as stream:
        for row in csv.DictReader(stream):
            if row["Area type"] == "Region":
                area = energy_regions.get(row["Area"])
            else:
                area = iso.get(row["ISO 3 code"])
            if area:
                energy_ids.add(area)
            else:
                energy_unmapped.add((row["Area type"], row["Area"], row["ISO 3 code"]))
    assert not energy_unmapped, f"Unreviewed Ember areas: {energy_unmapped}"
    assert len(energy_ids) == energy_review[0]["provenance"]["areaCount"]
    families = {
        **{'public:' + source['id']: sorted(a['geographyId'] for a in source['areas']) for source in public['sources']},
        "findex": sorted(a["geographyId"] for a in findex["areas"]),
        "labor": sorted(a["geographyId"] for a in labor["areas"]),
        "innovation": sorted(a["geographyId"] for a in innovation["areas"]),
        "health": sorted(a["geographyId"] for a in health["areas"]),
        "debt": sorted(a['geographyId'] for a in debt['areas']),
        "fiscal": sorted(a["geographyId"] for a in fiscal["areas"]),
        "macrohistory": sorted(a["geographyId"] for a in macrohistory["areas"]),
        "agriculture": sorted(a["geographyId"] for a in agriculture["areas"]),
        "statistics": sorted([iso[code] for code in country_codes if code in iso] + [region['geographyId'] for region in wdi_regions]),
        "demography": sorted(row["geographyId"] for row in demographics["areas"]),
        "history": sorted(row["id"] for row in history["areas"]),
        "energy": sorted(energy_ids),
        "markets": sorted({proxy["geographyId"] for proxy in read(DATA / "market-proxies.json")}),
    }
    for family, ids in families.items():
        assert len(ids) == len(set(ids)), f"Duplicate {family} identities"
        assert set(ids) <= set(geographies), f"Unknown {family} catalog identity"
    for geography in ["m49:276", "m49:840", "m49:356", "m49:156"]:
        assert all(geography in ids for name, ids in families.items() if name != "macrohistory" and not name.startswith('public:')), geography
    assert {"m49:276", "m49:840"} <= set(families["macrohistory"])
    assert not {"m49:356", "m49:156", "world"} & set(families["macrohistory"])
    # Provider-specific regions must never silently turn into another family's region.
    assert "un-wpp:903" not in families["energy"] and "ember:africa" not in families["demography"]
    assert "m49:832" not in families["statistics"] and "m49:831" not in families["statistics"]
    verified = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
    issues = [{
        "family": "statistics", "providerId": "CHI", "label": "Kanalinseln gemeinsam",
        "geographyIds": ["m49:832", "m49:831"],
        "reason": "Die Weltbank führt die Kanalinseln gemeinsam. Dieses Sammelgebiet ist noch nicht angebunden; seine Werte werden Jersey und Guernsey nicht einzeln zugeschlagen.",
    }]
    artifact = {"verifiedAt": verified, "catalogVersion": catalog["version"], "families": families, "issues": issues}
    write(DATA / "coverage-catalog.json", artifact)
    audit = {
        "verifiedAt": verified, "catalogVersion": catalog["version"],
        "meaning": "Source geography mapping, not completeness of statistics or evidence of locally downloaded values.",
        "sources": {
            **public_evidence,
            "labor": {"url": labor["sourceUrl"], "sha256": labor["sha256"], "auditSha256": digest(EVIDENCE / "labor-source-audit.json"), "meaning": "188 original country/territory codes and explicit World/Africa model aggregates. 85 other ILO groups and Channel Islands excluded without reassignment."},
            "innovation": {"url": innovation["sourceUrl"], "sha256": innovation["sha256"], "auditSha256": digest(EVIDENCE / "innovation-source-audit.json"), "meaning": "199 current ISO2/ISO3 origin identities checked. Six historical origins excluded without successor-state splicing; two requested origins absent. No invented world or continent totals."},
            "health": {"url": health["sourceUrl"], "files": health["files"], "auditSha256": digest(EVIDENCE / "health-source-audit.json"), "meaning": "All 195 original ISO3 identities, source labels and country notes verified. No constructed world or continent averages."},
            "debt": {"url": debt['url'], "sha256": debt_review['sha256'], "auditSha256": digest(EVIDENCE / 'debt-source-audit.json'), "meaning": "43 countries/economic areas, euro area and four separately named BIS debt aggregates; all original codes, labels and precisions verified. Not a complete world aggregate."},
            "fiscal": {"url": fiscal["url"], "originalUrl": fiscal["originalUrl"], "sha256": fiscal["sha256"], "auditSha256": digest(EVIDENCE / "fiscal-source-audit.json"), "meaning": "All 151 ISO/IFS country mappings checked against the original workbook and an independent parser, including both published label aliases for Bahamas and Congo. No world or continent aggregate."},
            "macrohistory": {"url": macrohistory["url"], "sha256": macrohistory["sha256"], "auditSha256": digest(EVIDENCE / "macrohistory-source-audit.json"), "meaning": "All 18 original ISO/IFS/label identities verified against the workbook; no global aggregate or India/China profile."},
            "agriculture": {"url": agriculture["url"], "sha256": agriculture_review["sha256"], "auditSha256": digest(EVIDENCE / "agriculture-source-audit.json"), "meaning": "Original FAO indices: mainland China, provider China aggregate and all source regions remain distinct."},
            "statistics": {"url": COUNTRY_URL, "sha256": digest(country_file), "unmapped": unresolved_wdi, "regions": wdi_regions},
            "demography": {"evidenceSha256": digest(EVIDENCE / "demography-readiness.json"), "provenance": demographics["provenance"]},
            "history": {"evidenceSha256": digest(EVIDENCE / "history-readiness.json"), "provenance": history["provenance"]},
            "energy": {"url": energy["sourceUrl"], "sha256": digest(energy_file), "unmapped": []},
            "markets": {"catalogSha256": digest(DATA / "market-proxies.json"), "meaning": "Explicit fund proxies, including global themes and US sectors only at their stated geography."},
        },
        "families": {family: {"mapped": len(ids), "notMapped": len(geographies) - len(ids)} for family, ids in families.items()},
        "issues": issues,
        "geographies": [{"id": id, "label": g["label"], "kind": g["kind"], "families": {family: id in ids for family, ids in families.items()}} for id, g in geographies.items()],
    }
    write(EVIDENCE / "geography-crosswalk.json", audit)
    print(json.dumps({"geographies": len(geographies), "families": audit["families"], "unmappedWorldBank": unresolved_wdi}, ensure_ascii=False))


if __name__ == "__main__":
    main()
