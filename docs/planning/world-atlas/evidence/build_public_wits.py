"""Audit the fixed, explicitly mirrored WITS HHPCI originals; no journal access."""
from pathlib import Path
from decimal import Decimal
import collections
import csv
import hashlib
import io
import json
import sys
import xml.etree.ElementTree as ET
import zipfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
DATA = ROOT / "apps/desktop/src/features/world-atlas/data"
RAW = ROOT / "apps/desktop/.tmp/atlas-remaining-40"
ID = "wits-export-concentration"
URL = "https://datacatalogfiles.worldbank.org/ddh-published/0064719/DR0092974/bulk_files_Herfindahl-Hirschman_Product_Concentration_Index_Mirrored_Export.xlsx"
GUIDE = "https://wits.worldbank.org/WITS/WITS/TradeIndicatorsHelp/TradeOutcomes_Help.htm"
TITLE = "Herfindahl-Hirschman Product Concentration Index Mirrored Export | H0 | Tier3 | World partner"
PERIOD_STARTS = {"SUD": 2012, "YEM": 1991}
HEADERS = ["Classification", "Year", "ReporterISO3", "PartnerISO3", "Product", "NumberOfProducts", "Indicator"]
END_NOTE = "2022: stark unvollständiger Rand des Quellenstands; deutlich weniger meldende Importmärkte. Redaktionell von der vorherigen Linie getrennt, keine zusätzliche Quellenschätzung."
EXCLUDED = {
    "ANT": "Ehemalige Niederländische Antillen, kein Nachfolgestaat",
    "BAT": "Eigenes britisches Antarktisgebiet ohne Atlaszuordnung",
    "BLX": "Belgien und Luxemburg gemeinsam, keine Einzelwerte",
    "BUN": "Bunkerlieferungen, kein Land", "CSK": "Ehemalige Tschechoslowakei",
    "DDR": "Ehemalige DDR", "ETF": "Ethiopien einschließlich Eritrea",
    "FRE": "Freizonen, kein Land", "NZE": "Historische neutrale Zone",
    "OAS": "Other Asia, nes; keine bestätigte Taiwan-Zuordnung",
    "PCE": "Historische Pazifikinseln-Gruppe", "SDN": "WITS-Code SDN = ehemaliger Sudan, Gebiet 736",
    "SPE": "Besondere Kategorien, kein Land",
    "SRB": "Archiv reicht bis 1992; aktuelle WITS-Gebietsmetadaten lösen diese historische Reihe nicht eindeutig auf",
    "SVU": "Ehemalige Sowjetunion", "UNS": "Nicht zugeordnet",
    "USP": "Historische US-Pazifikinseln-Gruppe", "YDR": "Ehemaliger Südjemen",
    "YUG": "Ehemaliges Jugoslawien",
}


def read(p):
    return json.loads(p.read_text(encoding="utf-8"))


def write(p, x):
    p.write_text(json.dumps(x, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sha(b):
    return hashlib.sha256(b).hexdigest()


def main():
    catalog = read(DATA / "catalog.json")
    geographies = {g["id"]: g for g in catalog["geographies"]}
    ns = {"w": "http://wits.worldbank.org"}
    metadata_bytes = (RAW / "wits-country-metadata.xml").read_bytes()
    tree = ET.fromstring(metadata_bytes)
    metadata = {}
    for row in tree.findall(".//w:country", ns):
        code = row.findtext("w:iso3Code", namespaces=ns)
        assert code not in metadata
        metadata[code] = {"code": row.get("countrycode"), "label": row.findtext("w:name", namespaces=ns)}
    assert metadata["SDN"]["code"] == "736" and metadata["SUD"]["code"] == "729"
    downloads = read(RAW / "wits-mirrored-downloads.json")
    assert [d["year"] for d in downloads] == list(range(1988, 2023))
    inventory = read(RAW / "wits-mirrored-inventory.json")[1:]
    assert all(row[:2] == ["Herfindahl-Hirschman Product Concentration Index Mirrored Export", "2023-03-11"] for row in inventory)
    assert [row[3] for row in inventory] == [d["url"] for d in downloads]
    profiles = {}
    all_reporters = set()
    all_partners = set()
    files = []
    package = bytearray()
    selected_rows = 0
    skipped = collections.Counter()
    unselected_anomalies = []
    excluded_years = []
    for d in downloads:
        raw = (RAW / d["file"]).read_bytes()
        assert len(raw) == d["bytes"] and sha(raw) == d["sha256"]
        package.extend(raw)
        archive = zipfile.ZipFile(io.BytesIO(raw))
        assert archive.namelist() == [d["member"]]
        content = archive.read(d["member"])
        reader = csv.DictReader(io.StringIO(content.decode("utf-8-sig")))
        assert reader.fieldnames == HEADERS
        rows = list(reader)
        assert len(rows) == d["rows"]
        seen = set()
        reporters = set()
        partners = set()
        year_selected = 0
        for row in rows:
            assert row["Classification"] == "H0" and row["Product"] == "Tier3" and row["Year"] == str(d["year"])
            country, partner = row["ReporterISO3"], row["PartnerISO3"]
            reporters.add(country); partners.add(partner)
            key = (country, partner)
            assert key not in seen
            seen.add(key)
            count = int(row["NumberOfProducts"])
            assert str(count) == row["NumberOfProducts"] and 1 <= count <= 6000
            raw_value = row["Indicator"]
            if raw_value:
                n = Decimal(raw_value)
                assert n.is_finite() and count > 1 and raw_value.strip() == raw_value
                if not 0 <= n <= 1:
                    assert partner != "WLD" and Decimal("-0.000000000000001") < n < 0
                    unselected_anomalies.append(row)
            else:
                assert count == 1
            if partner != "WLD":
                continue
            selected_rows += 1
            if country in EXCLUDED:
                skipped[country] += 1
                continue
            if d["year"] < PERIOD_STARTS.get(country, 1988):
                excluded_years.append(row)
                continue
            assert country in metadata, country
            area_id = "world" if country == "WLD" else "m49:" + metadata[country]["code"]
            assert area_id in geographies, (country, area_id)
            profile = profiles.setdefault(country, {
                "metricId": ID + ":HHPCI", "geographyId": area_id,
                "providerArea": country, "providerLabel": metadata[country]["label"],
                "providerTitle": TITLE, "unit": "Konzentrationsindex (0–1)", "points": [],
            })
            profile["points"].append({
                "period": row["Year"], "value": raw_value or None,
                "status": "WITS-Spiegeldatenindex" if raw_value else "Ein Produkt: Quelle veröffentlicht keinen Index",
                "breakBefore": d["year"] == 2022,
                "notes": [END_NOTE] if d["year"] == 2022 else [],
                "lowerBound": None, "upperBound": None,
            })
            year_selected += 1
        all_reporters |= reporters; all_partners |= partners
        files.append({**d, "reporters": sorted(reporters), "partners": sorted(partners), "mappedRows": year_selected, "uncompressedBytes": len(content)})
    assert set(skipped) == set(EXCLUDED)
    profiles = sorted(profiles.values(), key=lambda p: (p["metricId"], p["geographyId"]))
    assert len(set(p["geographyId"] for p in profiles)) == len(profiles)
    source_areas = [{"code": p["providerArea"], "label": p["providerLabel"], "geographyId": p["geographyId"], "seriesTitles": {"HHPCI": TITLE}} for p in sorted(profiles, key=lambda p: p["providerArea"])]
    metric = {
        "id": ID + ":HHPCI", "sourceId": ID, "topicId": "trade:export_concentration", "providerCode": "HHPCI",
        "label": "Exportkonzentration · Produkte (Spiegeldaten)", "unit": "Konzentrationsindex (0–1)",
        "frequency": "annual", "kind": "source_statistic", "comparison": "same_definition", "connectAdjacent": True,
        "explanation": "Wie stark sich der Warenexportwert auf wenige Produktpositionen konzentriert. Höher bedeutet stärker konzentriert.",
        "scopeNote": "Veröffentlichter WITS-Herfindahl-Hirschman-Produktindex auf Basis der Importmeldungen von Handelspartnern (Spiegelexporte). Waren nach HS 1988/92, sechsstellige Produktpositionen, keine Dienstleistungen oder Konzentration auf einzelne Absatzländer. Natürliche Skala von null bis eins; keine Bewertungsschwelle und kein Firmenmonopol-Index. Meldeabdeckung, Produktklassifikation, Preise, Transit und abweichende Ursprungsangaben beeinflussen das Bild. Der feste Archivstand vom 11.03.2023 reicht je Gebiet unterschiedlich weit und endet 2022 mit stark unvollständigen Meldungen; dieser letzte Punkt bleibt von der vorherigen Linie getrennt. Später aktualisierte Katalogmetadaten erweitern die Originaldaten nicht. Der veröffentlichte Weltindex wird unverändert übernommen, keine eigene Ländermittelung. Historische Sammelgebiete werden keinem Nachfolgestaat zugeschlagen. Sudan beginnt nach der Teilung 2012, Jemen nach der Vereinigung 1991; unklare frühere Archivzeilen bleiben ausgeschlossen. Quelle: World Bank WITS / UN Comtrade, ausdrücklich Mirrored Export, Datensatz 0064719. Keine eigene Glättung, Hochrechnung oder Anlagebewertung.",
    }
    numeric = sum(v["value"] is not None for p in profiles for v in p["points"])
    source = {
        "id": ID, "label": "Weltbank WITS · Exportkonzentration", "adapter": "wits_hhpci", "url": URL,
        "documentationUrl": GUIDE, "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
        "publishedAt": "2023-03-11", "reviewedAt": "2026-09-11", "recipe": "wits-hhpci-mirrored-1988-2022-original-zips-v1",
        "observationKind": "source_statistic", "expectedSha256": sha(package), "expectedRows": sum(d["rows"] for d in downloads),
        "expectedNumeric": numeric, "firstPeriod": "1988", "lastPeriod": "2022", "areas": source_areas,
    }
    contract = {
        "sourceId": ID, "url": URL, "files": files, "headers": HEADERS, "providerTitle": TITLE,
        "areas": source_areas, "excludedAreas": EXCLUDED, "periodStarts": PERIOD_STARTS, "metadata": metadata,
        "metadataUrl": "https://wits.worldbank.org/API/V1/wits/datasource/tradestats-trade/country/ALL",
        "metadataSha256": sha(metadata_bytes), "inventorySha256": sha((RAW / "wits-mirrored-links.xlsx").read_bytes()),
        "expectedProfiles": len(profiles), "expectedSelected": selected_rows,
        "packageFile": "wits-mirrored-originals.bin", "packageFormat": "Unmodified ZIP bytes concatenated in ascending source year; boundaries and every original hash fixed in files.",
    }
    audit = {"source": source, "metrics": [metric], "profiles": len(profiles), "missingCells": sum(v["value"] is None for p in profiles for v in p["points"]), "excludedRows": dict(skipped), "unselectedRoundingAnomalies": unselected_anomalies, "excludedYears": excluded_years, "contract": contract}
    write(HERE / "public-wits-audit.json", audit)
    write(RAW / "wits-expected-profiles.json", profiles)
    (RAW / contract["packageFile"]).write_bytes(package)
    if "--apply" in sys.argv:
        public = read(DATA / "public-series-catalog.json")
        public["sources"] = [s for s in public["sources"] if s["id"] != ID] + [source]
        public["metrics"] = [m for m in public["metrics"] if m["sourceId"] != ID] + [metric]
        public["version"] = "2026-09-11.13"
        write(DATA / "public-series-catalog.json", public)
        write(DATA / "public-wits-contract.json", contract)
        ledger = read(HERE / "remaining-40-ledger.json")
        topic = next(t for t in ledger["topics"] if t["id"] == metric["topicId"])
        if topic["status"] != "implemented_native_verified":
            topic["status"] = "source_validated"
            topic["research"] = [{"sourceId": ID, "reviewedAt": "2026-09-11", "evidence": "public-wits-audit.json"}]
        write(HERE / "remaining-40-ledger.json", ledger)
    print(json.dumps({"areas": len(profiles), "numeric": numeric, "missing": audit["missingCells"], "rawRows": source["expectedRows"], "selectedRows": selected_rows, "bytes": len(package)}))


if __name__ == "__main__":
    main()
