"""Audit EIA's published battery tables independently, including raw XML decimals.

The linked file says 2024, but the selected tables explicitly end in 2023.
No planned 2024/2025 additions, reconstruction or new aggregation is imported.
"""
import hashlib
import json
from decimal import Decimal
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET
import openpyxl

ROOT = Path(__file__).resolve().parents[4]
HERE = Path(__file__).resolve().parent
DATA = ROOT / "apps/desktop/src/features/world-atlas/data"
RAW = ROOT / "apps/desktop/.tmp/atlas-remaining-40"
FILE = "eia-battery-2024.xlsx"
ID = "eia-battery-storage"
URL = "https://www.eia.gov/analysis/studies/electricity/batterystorage/xls/2024%20Battery%20Storage%20Figures.xlsx"
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def read(p):
    return json.loads(p.read_text(encoding="utf-8"))


def write(p, v):
    p.write_text(json.dumps(v, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


raw = (RAW / FILE).read_bytes()
book = openpyxl.load_workbook(RAW / FILE, data_only=True, read_only=True)
zipfile = ZipFile(RAW / FILE)
plan_labels = [e.text for e in ET.fromstring(zipfile.read("xl/drawings/drawing12.xml")).iter()
               if e.tag.endswith("}t") and e.text]
assert any("planned" in t for t in plan_labels)
scope = (
    "EIA-Großspeicher in den Vereinigten Staaten: netzsynchronisierte stationäre Batteriesysteme "
    "an Standorten ab 1 MW Nennleistung. Der verlinkte Dateiname nennt 2024; die hier verwendeten "
    "Originaltabellen sind ausdrücklich als endgültige Daten 2023 gekennzeichnet. "
    "Keine Fahrzeugbatterien, Pumpspeicher oder vollständige Erfassung kleiner Heimspeicher. "
    "MW messen Leistung, MWh die speicherbare Energiemenge. Quellendezimalen bleiben unverändert; "
    "lange Nachkommastellen in der Datei sind keine höhere Messgenauigkeit. "
    "Quelle: U.S. Energy Information Administration, Veröffentlichung 17.03.2026; "
    "deutsche Erläuterung durch Personal Macro."
)
specs = [
    ("power_stock", "Figure 1b", 3, "B", 34, 54, 2003,
     "U.S. total net cumulative power capacity (MW)", "Großspeicher · kumulierte Leistung", "Leistung (MW)",
     "Wie sich die von EIA veröffentlichte kumulierte Nettoleistung stationärer Großbatterien entwickelt.",
     "Veröffentlichte kumulierte Nettoreihe, keine jährliche Stromerzeugung und keine aktuelle Betriebszusage für jede historische Anlage."),
    ("energy_stock", "Figure 1b", 3, "C", 34, 54, 2003,
     "U.S. total net cumulative energy capacity (MWh)", "Großspeicher · speicherbare Energie", "Speicherkapazität (MWh)",
     "Wie viel Energie die von EIA erfassten Großbatterien nach der veröffentlichten kumulierten Nettoreihe speichern können.",
     "Speicherbare Energiemenge des veröffentlichten Bestands; kein jährlicher Stromverbrauch, Durchsatz oder tatsächlich jederzeit abrufbarer Ladestand."),
    ("power_additions", "Figure 3", 5, "C", 31, 39, 2015,
     "power capacity additions (MW)", "Neue Großspeicher · zusätzliche Leistung", "Leistungszubau (MW)",
     "Welche Nennleistung die im jeweiligen Jahr neu installierten Großbatterien besitzen.",
     "Jährliche Installationskohorte aus Figure 3. Zubau ist kein Gesamtbestand und kein Nettozuwachs nach Stilllegungen."),
    ("energy_additions", "Figure 3", 5, "D", 31, 39, 2015,
     "energy capacity additions (MWh)", "Neue Großspeicher · zusätzliche Speichermenge", "Speicherkapazitätszubau (MWh)",
     "Welche zusätzliche Energiespeicherkapazität die im jeweiligen Jahr installierten Großbatterien besitzen.",
     "Jährliche Installationskohorte aus Figure 3. Kapazitätszubau ist keine jährlich abgegebene Strommenge."),
    ("cohort_duration", "Figure 3", 5, "B", 31, 39, 2015,
     "average duration (hours)", "Neue Großspeicher · mittlere Entladedauer", "Entladedauer (Stunden)",
     "Wie lange die im jeweiligen Jahr neu installierten Großbatterien laut EIA im Mittel ihre Nennleistung abgeben können.",
     "Durchschnitt der neuen Installationskohorte, nicht die mittlere Dauer aller vorhandenen Batterien. Veröffentlichter EIA-Wert, keine eigene Quotientenbildung."),
]
metrics, profiles, columns = [], [], []
sheets = {}
for code, sheet_name, sheet_no, col, first_row, last_row, first_year, header, label, unit, explanation, boundary in specs:
    sheet = book[sheet_name]
    xml_name = f"xl/worksheets/sheet{sheet_no}.xml"
    cells = {c.attrib["r"]: c for c in ET.fromstring(zipfile.read(xml_name)).findall(".//m:sheetData/m:row/m:c", NS)}
    header_row = first_row - 1
    assert sheet[f"{col}{header_row}"].value == header
    assert sheet["A2"].value == "Battery Energy Storage Report Figure Data"
    assert sheet["A3"].value == "2023 Final Data"
    if sheet_name not in sheets:
        coords = ["A1", "A2", "A3", "A28", "A30", "A31", "A32"] if sheet_name == "Figure 1b" else ["A1", "A2", "A3", "A27"]
        sheets[sheet_name] = {"name": sheet_name, "xml": xml_name,
                              "headers": [{"coordinate": c, "text": sheet[c].value} for c in coords]}
    metric_id = ID + ":" + code
    metric = {"id": metric_id, "sourceId": ID, "topicId": "energy_systems:battery_storage", "providerCode": code,
              "label": label, "unit": unit, "frequency": "annual", "kind": "source_estimates", "comparison": "within_country",
              "connectAdjacent": True, "explanation": explanation, "scopeNote": boundary + " " + scope}
    metrics.append(metric)
    title = sheet["A1"].value.strip() + " | " + header
    points = []
    for row in range(first_row, last_row + 1):
        year = first_year + row - first_row
        assert sheet[f"A{row}"].value == year and year <= 2023
        c = cells[f"{col}{row}"]
        assert "t" not in c.attrib and c.find("m:f", NS) is None
        value = c.find("m:v", NS).text
        assert Decimal(value).is_finite() and 0 <= Decimal(value) < 100_000
        assert abs(Decimal(str(sheet[f"{col}{row}"].value)) - Decimal(value)) < Decimal("0.0000000001")
        points.append({"period": str(year), "value": value, "status": "Endgültiger Quellenstand 2023",
                       "breakBefore": False, "notes": [boundary], "lowerBound": None, "upperBound": None})
    profiles.append({"metricId": metric_id, "geographyId": "m49:840", "providerArea": "US", "providerLabel": "United States",
                     "providerTitle": title, "unit": unit, "points": points})
    columns.append({"code": code, "sheet": sheet_name, "column": col, "firstRow": first_row, "lastRow": last_row,
                    "firstYear": first_year, "header": header, "note": boundary})
profiles.sort(key=lambda p: p["metricId"])
source = {"id": ID, "label": "EIA · stationäre US-Großspeicher", "adapter": "eia_battery", "url": URL,
          "documentationUrl": "https://www.eia.gov/analysis/studies/electricity/batterystorage/",
          "licenseUrl": "https://www.eia.gov/about/copyrights_reuse.php", "publishedAt": "2026-03-17", "reviewedAt": "2026-09-11",
          "recipe": "eia-battery-original-2023-final-20260317-v1", "observationKind": "source_estimates",
          "expectedSha256": hashlib.sha256(raw).hexdigest(), "expectedRows": 30, "expectedNumeric": 69,
          "firstPeriod": "2003", "lastPeriod": "2023",
          "areas": [{"code": "US", "label": "United States", "geographyId": "m49:840",
                     "seriesTitles": {p["metricId"].split(":", 1)[1]: p["providerTitle"] for p in profiles}}]}
assert sum(len(p["points"]) for p in profiles) == 69
contract = {"sourceId": ID, "file": FILE, "sheetNames": book.sheetnames, "sheets": list(sheets.values()), "columns": columns}
catalog = read(DATA / "public-series-catalog.json")
catalog["sources"] = [s for s in catalog["sources"] if s["id"] != ID] + [source]
catalog["metrics"] = [m for m in catalog["metrics"] if m["sourceId"] != ID] + metrics
catalog["version"] = "2026-09-11.16"
write(DATA / "public-series-catalog.json", catalog)
write(DATA / "public-eia-storage-contract.json", contract)
write(RAW / "eia-storage-expected-profiles.json", profiles)
write(HERE / "public-eia-storage-audit.json", {"reviewedAt": "2026-09-11", "source": source,
      "workbookBytes": len(raw), "zipEntries": len(zipfile.infolist()), "uncompressedBytes": sum(f.file_size for f in zipfile.infolist()),
      "selectedSheets": list(sheets.values()), "columns": columns, "profileCount": 5,
      "originalDecimalStringsPreserved": True, "selectedNumericValues": 69,
      "excludedFigure6ChartLabels": plan_labels,
      "excluded": "Figure 6 contains prospective 2024/2025 additions and is not used. Small-scale energy storage, prices and regional subdivisions are not substituted for country-level grid battery histories.",
      "otherCandidates": [{"url": "https://ses.jrc.ec.europa.eu/storage-inventory", "finding": "Current European project map, partially estimated MWh. Published deployment tracking begins in 2026; linked export returned 404 during review. No unsupported historical country totals constructed."},
                          {"url": "https://www.iea.org/data-and-statistics/charts/global-battery-storage-capacity-additions-2020-2025", "finding": "Chart explicitly has no data download; not used as a numeric source."}]})
ledger = read(HERE / "remaining-40-ledger.json")
topic = next(t for t in ledger["topics"] if t["id"] == "energy_systems:battery_storage")
topic["research"] = [{"sourceId": ID, "reviewedAt": "2026-09-11", "evidence": "public-eia-storage-audit.json"}]
if topic["status"] == "research_pending":
    topic["status"] = "source_validated"
write(HERE / "remaining-40-ledger.json", ledger)
print(json.dumps({"source": ID, "perspectives": 5, "numericValues": 69, "lastOriginalYear": 2023}))
