"""Validate original IEA 2026 historical EV rows, explicit areas and disjoint perspectives."""
import csv
import hashlib
import json
from collections import Counter, defaultdict
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
DATA = ROOT / "apps/desktop/src/features/world-atlas/data"
RAW = ROOT / "apps/desktop/.tmp/atlas-remaining-40"
HERE = Path(__file__).resolve().parent


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


iso = {
    "Australia": "AUS", "Austria": "AUT", "Belgium": "BEL", "Brazil": "BRA", "Bulgaria": "BGR",
    "Cambodia": "KHM", "Canada": "CAN", "Chile": "CHL", "China": "CHN", "Colombia": "COL",
    "Costa Rica": "CRI", "Croatia": "HRV", "Cyprus": "CYP", "Czech Republic": "CZE", "Denmark": "DNK",
    "Estonia": "EST", "Finland": "FIN", "France": "FRA", "Germany": "DEU", "Greece": "GRC",
    "Hungary": "HUN", "Iceland": "ISL", "India": "IND", "Indonesia": "IDN", "Ireland": "IRL",
    "Israel": "ISR", "Italy": "ITA", "Japan": "JPN", "Jordan": "JOR", "Korea": "KOR", "Lao PDR": "LAO",
    "Latvia": "LVA", "Lithuania": "LTU", "Luxembourg": "LUX", "Malaysia": "MYS", "Mexico": "MEX",
    "Nepal": "NPL", "Netherlands": "NLD", "New Zealand": "NZL", "Norway": "NOR", "Philippines": "PHL",
    "Poland": "POL", "Portugal": "PRT", "Romania": "ROU", "Russia": "RUS", "Seychelles": "SYC",
    "Singapore": "SGP", "Slovakia": "SVK", "Slovenia": "SVN", "South Africa": "ZAF", "Spain": "ESP",
    "Sweden": "SWE", "Switzerland": "CHE", "Thailand": "THA", "Turkiye": "TUR", "USA": "USA",
    "United Arab Emirates": "ARE", "United Kingdom": "GBR", "Uruguay": "URY", "Uzbekistan": "UZB", "Viet Nam": "VNM",
}
aggregates = {
    "Advanced Economies": ("advanced_economies", "Fortgeschrittene Volkswirtschaften · IEA", "world"),
    "Africa": ("africa", "Afrika · IEA", "africa"),
    "Asia Pacific": ("asia_pacific", "Asien und Pazifik · IEA", "asia"),
    "Developing Economies excl. China": ("developing_ex_china", "Entwicklungsvolkswirtschaften ohne China · IEA", "world"),
    "Europe": ("europe", "Europa · IEA", "europe"),
    "European Union": ("european_union", "Europäische Union · IEA", "europe"),
    "Latin America": ("latin_america", "Lateinamerika · IEA", "americas"),
    "Middle East and Caspian": ("middle_east_caspian", "Naher Osten und Kaspischer Raum · IEA", "asia"),
    "Southeast Asia": ("southeast_asia", "Südostasien · IEA", "asia"),
}
catalog = read(DATA / "catalog.json")
by_iso = {g["iso3"]: g for g in catalog["geographies"] if g["iso3"]}
areas = {name: by_iso[code]["id"] for name, code in iso.items()}
areas["World"] = "world"
for name, (key, label, region) in aggregates.items():
    region = next(r["id"] for r in catalog["regions"] if r["id"].lower() == region)
    identifier = f"iea:{key}"
    areas[name] = identifier
    geography = {"id": identifier, "label": label, "iso3": "", "regionId": region, "kind": "aggregate"}
    existing = next((g for g in catalog["geographies"] if g["id"] == identifier), None)
    if existing is None:
        catalog["geographies"].append(geography)
    else:
        assert existing == geography
assert all(g["regionId"] in {r["id"] for r in catalog["regions"]} for g in catalog["geographies"])

raw = (RAW / "iea-ev-historical.csv").read_bytes()
reader = csv.DictReader(raw.decode("utf-8").splitlines())
headers = ["region", "category", "parameter", "mode", "powertrain", "year", "unit", "value"]
assert reader.fieldnames == headers
rows = list(reader)
source_id = "iea-ev"
metrics = []
selections = []
for key, parameter, powertrain, label, meaning in [
    ("car_sales_share", "EV sales share", "EV", "Elektro-Pkw · Anteil an Neuwagenverkäufen", "Wie groß der Elektroanteil unter den im Jahr verkauften Pkw ist."),
    ("car_stock_share", "EV stock share", "EV", "Elektro-Pkw · Anteil am Fahrzeugbestand", "Wie groß der Elektroanteil unter den vorhandenen Pkw ist."),
    ("car_sales", "EV sales", "EV", "Elektro-Pkw · jährliche Verkäufe", "Wie viele Elektro-Pkw im Jahr verkauft werden."),
    ("car_stock", "EV stock", "EV", "Elektro-Pkw · Fahrzeugbestand", "Wie viele Elektro-Pkw laut Quelle im Fahrzeugbestand vorhanden sind."),
    ("bev_sales", "EV sales", "BEV", "Batterie-Pkw · jährliche Verkäufe", "Wie viele rein batterieelektrische Pkw im Jahr verkauft werden."),
    ("bev_stock", "EV stock", "BEV", "Batterie-Pkw · Fahrzeugbestand", "Wie sich der Bestand rein batterieelektrischer Pkw entwickelt."),
    ("phev_sales", "EV sales", "PHEV", "Plug-in-Hybrid-Pkw · jährliche Verkäufe", "Wie viele von außen aufladbare Hybrid-Pkw im Jahr verkauft werden."),
    ("phev_stock", "EV stock", "PHEV", "Plug-in-Hybrid-Pkw · Fahrzeugbestand", "Wie sich der Bestand von außen aufladbarer Hybrid-Pkw entwickelt."),
    ("fcev_sales", "EV sales", "FCEV", "Brennstoffzellen-Pkw · jährliche Verkäufe", "Wie viele Brennstoffzellen-Pkw im Jahr verkauft werden."),
    ("fcev_stock", "EV stock", "FCEV", "Brennstoffzellen-Pkw · Fahrzeugbestand", "Wie sich der Bestand an Brennstoffzellen-Pkw entwickelt."),
]:
    original_unit = "percent" if "share" in parameter else "Vehicles"
    unit = "Anteil an Pkw-Neuwagenverkäufen (%)" if parameter == "EV sales share" else "Anteil am Pkw-Bestand (%)" if parameter == "EV stock share" else "Pkw pro Jahr" if parameter == "EV sales" else "Pkw im Bestand"
    selection = {"id": f"{source_id}:{key}", "parameter": parameter, "mode": "Cars", "powertrain": powertrain, "unit": original_unit}
    selections.append(selection)
    metrics.append({"id": selection["id"], "sourceId": source_id, "topicId": "transport:electric_vehicles", "providerCode": f"{parameter}|Cars|{powertrain}", "label": label, "unit": unit, "frequency": "annual", "kind": "source_estimates", "comparison": "same_definition", "connectAdjacent": True, "explanation": meaning, "scopeNote": "Pkw-Perspektive; Busse, Transporter, Lkw und Zwei-/Dreiräder sind hier nicht enthalten. Die IEA-Gesamtkategorie EV umfasst batterieelektrische und Plug-in-Hybrid-Pkw; Brennstoffzellen bleiben eine getrennte Perspektive. Bestand und jährliche Verkäufe haben unterschiedliche Nenner. Historische Quellenschätzungen aus Global EV Outlook 2026 bis 2025; keine Projektionen. Die gerundeten Gesamtreihen werden unverändert übernommen und nicht aus Teilreihen neu addiert. Quellenregionen sind eigene IEA-Gruppen. Kein Unternehmensumsatz oder Anlagewert."})
for key, powertrain, label, definition in [
    ("charging_slow", "Publicly available slow", "Öffentliche Ladepunkte · langsam", "IEA-Kategorie slow: bis einschließlich 22 kW."),
    ("charging_fast", "Publicly available fast", "Öffentliche Ladepunkte · schnell", "IEA-Kategorie fast: über 22 kW bis zur 150-kW-Grenze."),
    ("charging_ultra", "Publicly available ultra-fast", "Öffentliche Ladepunkte · ultraschnell", "IEA-Kategorie ultra-fast: ab 150 kW."),
]:
    selection = {"id": f"{source_id}:{key}", "parameter": "EV charging points", "mode": "EVSE", "powertrain": powertrain, "unit": "charging points"}
    selections.append(selection)
    metrics.append({"id": selection["id"], "sourceId": source_id, "topicId": "transport:charging", "providerCode": f"EV charging points|EVSE|{powertrain}", "label": label, "unit": "Öffentlich zugängliche Ladepunkte im Bestand", "frequency": "annual", "kind": "source_estimates", "comparison": "same_definition", "connectAdjacent": True, "explanation": "Wie sich der Bestand öffentlich zugänglicher Ladepunkte dieser Leistungsklasse entwickelt.", "scopeNote": definition + " Originalgruppen des IEA-Standes 2026; die Quelle beschreibt die Grenze bei 150 kW in beiden angrenzenden Klassen. Die App übernimmt die Zuordnung ohne eigene Umklassifizierung oder Summenbildung. Ladepunkte sind keine Standorte, private Wallboxen, jährlichen Neuinstallationen oder abgegebenen Strommengen. Fehlende Gruppen bleiben leer. Historische Schätzungen bis 2025, keine Projektionen; ältere Ausgaben mit anderer Gruppierung werden nicht angehängt."})
selected = {(s["parameter"], s["mode"], s["powertrain"]): s for s in selections}
by_metric = {m["id"]: m for m in metrics}
profiles = defaultdict(list)
seen = set()
for row in rows:
    assert row["region"] in areas and row["category"] == "Historical"
    assert row["mode"] in ("Cars", "Buses", "Trucks", "Vans", "2 and 3 wheelers", "EVSE")
    assert row["parameter"] in ("EV stock", "EV stock share", "EV sales", "EV sales share", "EV charging points")
    assert 2010 <= int(row["year"]) <= 2025
    value = Decimal(row["value"])
    assert value.is_finite() and value >= 0
    assert row["unit"] == ("percent" if "share" in row["parameter"] else "charging points" if row["parameter"] == "EV charging points" else "Vehicles")
    if row["unit"] == "percent" and row["mode"] == "Cars":
        assert value <= 100
    key = row["parameter"], row["mode"], row["powertrain"]
    unique = row["region"], *key, row["year"]
    assert unique not in seen
    seen.add(unique)
    if key in selected:
        spec = selected[key]
        assert row["unit"] == spec["unit"]
        profiles[row["region"], spec["id"]].append({"period": row["year"], "value": row["value"]})
    else:
        assert row["mode"] not in ("Cars", "EVSE")
source_areas = []
for name in sorted({name for name, _ in profiles}):
    titles = {by_metric[mid]["providerCode"]: f"Global EV Outlook 2026 | {name} | {by_metric[mid]['providerCode']} | Historical" for (region, mid) in profiles if region == name}
    source_areas.append({"code": name, "label": name, "geographyId": areas[name], "seriesTitles": titles})
request = read(RAW / "iea-ev-request.json")
assert request["sha256"] == hashlib.sha256(raw).hexdigest()
source = {"id": source_id, "label": "IEA · Global EV Outlook 2026", "adapter": "iea_ev", "url": request["url"], "documentationUrl": "https://www.iea.org/data-and-statistics/data-tools/global-ev-data-explorer", "licenseUrl": "https://creativecommons.org/licenses/by/4.0/", "publishedAt": "2026-05-20", "reviewedAt": "2026-09-11", "recipe": "iea-geo2026-historical-cars-charging-v1", "observationKind": "source_estimates", "expectedSha256": request["sha256"], "expectedRows": len(rows), "expectedNumeric": sum(map(len, profiles.values())), "firstPeriod": "2010", "lastPeriod": "2025", "areas": source_areas}
public = read(DATA / "public-series-catalog.json")
public["sources"] = [s for s in public["sources"] if s["id"] != source_id] + [source]
public["metrics"] = [m for m in public["metrics"] if m["sourceId"] != source_id] + metrics
public["version"] = "2026-09-11.5"
catalog["version"] = "2026-09-11.5"
write(DATA / "catalog.json", catalog)
write(DATA / "public-series-catalog.json", public)
write(DATA / "public-iea-contract.json", {"url": request["url"], "headers": headers, "selections": selections, "areaMappings": areas, "allowedCombinations": [list(k) for k in sorted({(r['parameter'], r['mode'], r['powertrain'], r['unit']) for r in rows})]})
audit = {"reviewedAt": "2026-09-11", "source": source, "originalRows": len(rows), "selectedNumericValues": source["expectedNumeric"], "selectedProfiles": len(profiles), "originalAreaCount": len(set(r['region'] for r in rows)), "excludedOtherModes": len(rows)-source["expectedNumeric"], "excludedUnrepresentedAreas": sorted(set(areas)-{a['code'] for a in source_areas}), "countsByMetric": dict(Counter({mid: sum(len(points) for (_, metric), points in profiles.items() if metric == mid) for mid in by_metric})), "coverage": [{"area": name, "metricId": mid, "count": len(points), "first": min(p['period'] for p in points), "last": max(p['period'] for p in points)} for (name, mid), points in sorted(profiles.items())], "methodology": ["https://www.iea.org/reports/global-ev-outlook-2026/trends-in-electric-cars", "https://www.iea.org/reports/global-ev-outlook-2026/electric-vehicle-charging-chap-6-and-10"], "invariants": ["Only Historical, 2010–2025; no 2035 scenarios", "Pkw and public charging only; other road modes explicitly excluded", "Original rounded totals retained; never sum BEV and PHEV", "No missing area/year/charging class becomes zero", "IEA regions retain separate geographic identities", "CSV decimal strings retained"]}
audit["excludedSourceAnomalies"] = [r for r in rows if r["unit"] == "percent" and Decimal(r["value"]) > 100]
assert all(r["mode"] == "Vans" for r in audit["excludedSourceAnomalies"])
write(HERE / "public-iea-audit.json", audit)
ledger = read(HERE / "remaining-40-ledger.json")
for topic in ledger["topics"]:
    if topic["id"] in ("transport:electric_vehicles", "transport:charging"):
        topic["research"] = [{"sourceId": source_id, "reviewedAt": "2026-09-11", "evidence": "public-iea-audit.json", "finding": "IEA 2026 original public historical CSV with distinct stock/sales/share and slow/fast/ultra-fast public charging; scenarios excluded."}]
        if topic["status"] == "research_pending":
            topic["status"] = "source_validated"
write(HERE / "remaining-40-ledger.json", ledger)
print(json.dumps({"values": source["expectedNumeric"], "profiles": len(profiles), "areas": len(source_areas), "metrics": len(metrics), "excludedAreas": audit["excludedUnrepresentedAreas"]}))
