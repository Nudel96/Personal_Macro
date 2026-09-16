"""Independent original-workbook audit for realized US construction activity."""
import hashlib
import json
import re
from pathlib import Path
import openpyxl

ROOT = Path(__file__).resolve().parents[4]
DATA = ROOT / "apps/desktop/src/features/world-atlas/data"
RAW = ROOT / "apps/desktop/.tmp/atlas-remaining-40/census-private-nsa.xlsx"
HERE = Path(__file__).resolve().parent


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


book = openpyxl.load_workbook(RAW, read_only=True, data_only=True)
assert book.sheetnames == ["Private NSA"]
rows = list(book.active.values)
assert len(rows) == 421
assert rows[0][0] == "Value of Private Construction Put in Place - Not Seasonally Adjusted"
assert rows[1][0] == "(Millions of dollars. Details may not add to totals since all types of construction are not shown separately.)"
assert rows[409][0] == "p Preliminary r Revised"
assert "September 1, 2026" in rows[416][0]
headers = list(rows[3][:68])
assert headers[0] == "Date"
source_id = "census-construction"
unit = "Millionen laufende US-Dollar je Monat · nicht saisonbereinigt"
specs = [
    ("data_centers", 9, "Data center", "digital:cloud", "Rechenzentren · Bauausgaben", "2014-01",
     "Wie viel Bauleistung an privat gehaltenen Rechenzentren im jeweiligen Monat erbracht wird.",
     "Gebäude für Speicherung, Verarbeitung und Übertragung digitaler Informationen. Seit Januar 2014 separat in der Quelle. Kein Cloud-Umsatz, keine Serverleistung und keine gesamte Investition in Computerhardware."),
    ("warehouses", 27, "Warehouse", "housing:logistics_property", "Lagergebäude · Bauausgaben insgesamt", "1993-01",
     "Wie sich die Bauausgaben für privat gehaltene Lagergebäude entwickeln.",
     "Breite Census-Lagerkategorie einschließlich Selbstlagerzentren, Getreidesilos und Gewächshäusern. Lager direkt an Produktionsstandorten gehören zur Industrie und sind ausgeschlossen. Die engeren gewerblichen Lager- und Verteilgebäude sind separat auswählbar."),
    ("commercial_warehouses", 28, "General commercial", "housing:logistics_property", "Gewerbliche Lager und Verteilgebäude · Bauausgaben", "1993-01",
     "Wie viel in den Bau gewerblicher Lager- und Verteilgebäude fließt.",
     "Census-Untergruppe General commercial innerhalb Warehouse: gewerbliche Lagerhäuser, Speichergebäude und Verteilgebäude. Selbstlagerzentren sind eine getrennte Perspektive. Lager direkt an Produktionsstandorten sind ausgeschlossen."),
    ("self_storage", 29, "Mini-storage", "housing:logistics_property", "Selbstlagerzentren · Bauausgaben", "1993-01",
     "Wie sich die Bauaktivität bei privat gehaltenen Selbstlagerzentren verändert.",
     "Census-Untergruppe Mini-storage: Mini- und Self-storage-Zentren. Kein Ersatz für gewerbliche Logistikzentren."),
]
months = {m: i for i, m in enumerate("Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(), 1)}
periods = []
for row in rows[4:407]:
    match = re.fullmatch(r"([A-Z][a-z]{2})-(\d{2})([pr]?)", row[0])
    assert match and match[1] in months
    yy = int(match[2]); year = 1900 + yy if yy >= 93 else 2000 + yy
    periods.append((f"{year:04d}-{months[match[1]]:02d}", match[3]))
assert len(set(p for p, _ in periods)) == 403
assert min(p for p, _ in periods) == "1993-01" and max(p for p, _ in periods) == "2026-07"
metrics = []
coverage = []
contract_metrics = []
total_numeric = 0
titles = {}
for key, col, original, topic, label, first, explanation, scope in specs:
    assert headers[col] == original
    values = []
    for row, (period, flag) in zip(rows[4:407], periods):
        value = row[col]
        if period < first:
            assert value in (None, "")
            continue
        assert isinstance(value, int) and value >= 0
        values.append({"period": period, "value": str(value), "status": flag})
    assert min(r["period"] for r in values) == first
    metric_id = f"{source_id}:{key}"
    title = f"Value of Private Construction Put in Place - Not Seasonally Adjusted | {original}"
    if col == 28:
        title += " (Warehouse)"
    titles[original] = title
    metrics.append({"id": metric_id, "sourceId": source_id, "topicId": topic, "providerCode": original, "label": label, "unit": unit, "frequency": "monthly", "kind": "source_estimates", "comparison": "same_definition", "connectAdjacent": True, "explanation": explanation, "scopeNote": scope + " Vereinigte Staaten, privat während der Bauphase. Monatliche, nicht saisonbereinigte Bauausgaben in laufenden US-Dollar; Inflation und Jahreszeiten beeinflussen den Verlauf. Erbrachte Bauleistung einschließlich Neu- und Umbauten, keine Ankündigungen, Gebäudewerte, Leerstände oder Mieten. Vorläufige und revidierte Monate bleiben gekennzeichnet."})
    contract_metrics.append({"id": metric_id, "column": col, "header": original, "firstPeriod": first, "expectedValues": len(values)})
    total_numeric += len(values)
    coverage.append({"metricId": metric_id, "geographyId": "m49:840", "values": len(values), "firstPeriod": first, "lastPeriod": "2026-07", "firstValue": values[-1], "lastValue": values[0], "flags": {f: sum(r["status"] == f for r in values) for f in ("p", "r", "")}})
source = {"id": source_id, "label": "U.S. Census Bureau · private Bauausgaben", "adapter": "census_construction", "url": "https://www.census.gov/construction/c30/xlsx/privtime.xlsx", "documentationUrl": "https://www.census.gov/construction/c30/definitions.html", "licenseUrl": "https://www.census.gov/about/policies/quality/data_stewardship.html", "publishedAt": "2026-09-01", "reviewedAt": "2026-09-11", "recipe": "census-private-nsa-2026-09-v1", "observationKind": "source_estimates", "expectedSha256": hashlib.sha256(RAW.read_bytes()).hexdigest(), "expectedRows": 403, "expectedNumeric": total_numeric, "firstPeriod": "1993-01", "lastPeriod": "2026-07", "areas": [{"code": "US", "label": "United States", "geographyId": "m49:840", "seriesTitles": titles}]}
catalog = read(DATA / "public-series-catalog.json")
catalog["sources"] = [s for s in catalog["sources"] if s["id"] != source_id] + [source]
catalog["metrics"] = [m for m in catalog["metrics"] if m["sourceId"] != source_id] + metrics
catalog["version"] = "2026-09-11.4"
write(DATA / "public-series-catalog.json", catalog)
write(DATA / "public-census-contract.json", {"sheet": "Private NSA", "rowCount": 421, "headers": headers, "metrics": contract_metrics})
write(HERE / "public-census-audit.json", {"reviewedAt": "2026-09-11", "originalUrl": source["url"], "sha256": source["expectedSha256"], "sourceRows": 403, "numericValues": total_numeric, "series": coverage, "excludedBeforeDataCenterStart": 252, "scope": "Only United States; private construction ownership; realized nominal monthly value put in place, NSA; no hardware value or property price", "definitions": source["documentationUrl"], "introductionNotice": "https://www.census.gov/construction/c30/pdf/pr202405.pdf"})
ledger = read(HERE / "remaining-40-ledger.json")
for topic in ledger["topics"]:
    if topic["id"] in {m["topicId"] for m in metrics}:
        topic["research"] = [{"sourceId": source_id, "reviewedAt": "2026-09-11", "evidence": "public-census-audit.json", "finding": "Original US monthly construction spending, distinct data center/warehouse categories; published values rather than investment announcements."}]
        if topic["status"] == "research_pending":
            topic["status"] = "source_validated"
write(HERE / "remaining-40-ledger.json", ledger)
print(json.dumps({"source": source_id, "numericValues": total_numeric, "series": coverage}))
