"""Audit original OECD TiVA 2025 / January 2026 CSVs; no source rows invented.

The full reported matrix is checked before selecting the 80 documented countries.
Partner self-diagonals and overlapping regional groups are not country trade.
"""
import collections
import csv
import hashlib
import io
import json
import sys
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
DATA = ROOT / "apps/desktop/src/features/world-atlas/data"
RAW = ROOT / "apps/desktop/.tmp/atlas-remaining-40"
HERE = Path(__file__).resolve().parent


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


FLOW = "OECD.STI.PIE:DSD_TIVA_MAINSH@DF_MAINSH(1.1)"
HEADERS = ["DATAFLOW", "MEASURE", "REF_AREA", "ACTIVITY", "COUNTERPART_AREA", "UNIT_MEASURE", "FREQ", "TIME_PERIOD", "OBS_VALUE", "UNIT_MULT"]
GUIDE = "https://stats.oecd.org/wbos/fileview2.aspx?IDFile=2143f34e-6feb-41a9-abaf-cb52132608c4"
COMMON = (
    "OECD TiVA, Ausgabe 2025 mit Revision Januar 2026; modellierte Jahresgeschichte 1995–2022. "
    "Gesamtwirtschaft, Waren und Dienstleistungen, alle Wirtschaftszweige. "
    "Die OECD harmonisiert und ergänzt nationale Input-Output- und Handelsstatistiken und gleicht sie "
    "mit der Volkswirtschaftlichen Gesamtrechnung ab. Jüngste Jahre können auf fortgeschriebenen "
    "Produktionsstrukturen beruhen; eine vollständige Linie bedeutet keine jährliche direkte Messung. "
    "Keine eigene Glättung, Länderaggregation, Prognose oder Anlagebewertung. "
    "Taiwan und Hongkong sind getrennte Quellenwirtschaften; Zypern umfasst das regierungskontrollierte Gebiet. "
    "Quelle: OECD, Guide to Trade in Value Added Indicators, 2025 edition."
)
labels = read(RAW / "tiva-area-labels.json")
catalog = read(DATA / "catalog.json")
by_iso = {g["iso3"]: g for g in catalog["geographies"] if g["iso3"]}
countries = set(labels) & set(by_iso)
assert len(countries) == 80
excluded = {a: label for a, label in labels.items() if a not in countries}
assert len(excluded) == 18 and excluded["WXD"] == "Rest of the world"
partners = sorted(countries, key=lambda a: by_iso[a]["label"]) + ["WXD"]
downloads = read(RAW / "tiva-query-research.json") + [read(RAW / "tiva-partner-download.json")]
SPECS = [
    {"id": "oecd-tiva-supply", "file": "tiva-supply-chains.csv", "label": "OECD TiVA · Wertschöpfung in Exporten", "measures": ["EXGR_FVA", "EXGR_DVA"]},
    {"id": "oecd-tiva-partners", "file": "tiva-trade-partners.csv", "label": "OECD TiVA · Handelspartner", "measures": ["EXGR_PSH"]},
]
contracts, audits, expected = [], [], {}
public = read(DATA / "public-series-catalog.json")
for spec in SPECS:
    raw = (RAW / spec["file"]).read_bytes()
    reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig")))
    assert reader.fieldnames == HEADERS
    rows = list(reader); trade = spec["id"] == "oecd-tiva-partners"
    metrics = []
    for code in (partners if trade else spec["measures"]):
        name = "Übrige Welt · OECD-Restgruppe" if code == "WXD" else by_iso[code]["label"] if trade else ""
        label = f"Exportpartner · {name}" if trade else "Ausländische Wertschöpfung in Exporten" if code == "EXGR_FVA" else "Inländische Wertschöpfung in Exporten"
        explanation = (f"Welcher Anteil der Bruttoexporte in {name} abgesetzt wird." if trade
                       else "Wie groß der ausländische Wertschöpfungsanteil in den Exporten eines Landes ist." if code == "EXGR_FVA"
                       else "Wie groß der im Inland entstandene Wertschöpfungsanteil in den Exporten eines Landes ist.")
        scope = ("Anteil des Ziellandes an sämtlichen Bruttoexporten. Modellierte Absatzverflechtung, "
                 "kein unveränderter Zollbericht, keine Endverbraucherherkunft und keine bilaterale Wertschöpfungsquote. "
                 "Transit, Re-Exporte, statistische Lücken und nationale Asymmetrien werden im OECD-Modell behandelt. "
                 "Das eigene Land ist kein Auslandspartner. Die Restgruppe umfasst die rund 120 nicht einzeln "
                 "modellierten Volkswirtschaften und bleibt ausdrücklich getrennt. " if trade else
                 "Anteil an den gesamten Bruttoexporten des Landes, nicht Anteil am BIP oder an den Exporten der Welt. "
                 "Ausländische Wertschöpfung umfasst vorgelagerte Beiträge importierter Waren und Dienstleistungen; "
                 "inländische Wertschöpfung kann aus allen heimischen Branchen stammen. "
                 "Kein Maß aktueller Lieferausfälle oder der Abhängigkeit von einem einzelnen Zulieferer. ")
        metrics.append({"id": spec["id"]+":"+code, "sourceId": spec["id"],
                        "topicId": "trade:trade_partners" if trade else "trade:supply_chains", "providerCode": code,
                        "label": label, "unit": "Anteil an Bruttoexporten (%)", "frequency": "annual",
                        "kind": "modeled_estimate", "comparison": "same_definition", "connectAdjacent": True,
                        "explanation": explanation, "scopeNote": scope+COMMON})
    profiles = {}; seen = set(); sums = collections.defaultdict(lambda: Decimal(0)); self_count = 0
    for row in rows:
        assert row["DATAFLOW"] == FLOW and row["MEASURE"] in spec["measures"]
        assert row["ACTIVITY"] == "_T" and row["UNIT_MEASURE"] == "PT_EXGR" and row["FREQ"] == "A" and row["UNIT_MULT"] == "0"
        area, partner, year = row["REF_AREA"], row["COUNTERPART_AREA"], row["TIME_PERIOD"]
        assert area in labels and partner in (set(labels)|{"W"} if trade else {"W"})
        assert year in {str(y) for y in range(1995, 2023)}
        key = (row["MEASURE"], area, partner, year); assert key not in seen; seen.add(key)
        value = Decimal(row["OBS_VALUE"])
        assert value.is_finite() and 0 <= value <= 100 and value.as_tuple().exponent >= -3
        if area not in countries: continue
        if trade:
            if partner == "W": assert value == 100
            if partner not in partners: continue
            sums[area, year] += value
            if area == partner:
                assert value == 0
                self_count += 1
                continue
        else: sums[area, year] += value
        code = partner if trade else row["MEASURE"]
        metric = next(m for m in metrics if m["providerCode"] == code)
        title = ("EXGR_PSH | Total economy | Destination: "+labels[partner]+" | Percentage of gross exports" if trade
                 else row["MEASURE"]+" | Total economy | World | Percentage of gross exports")
        p = profiles.setdefault((code, area), {"metricId": metric["id"], "geographyId": by_iso[area]["id"],
             "providerArea": area, "providerLabel": labels[area], "providerTitle": title, "unit": metric["unit"], "points": []})
        notes = []
        if area == "ISR": notes.append("Israel: Quellenangaben stammen von israelischen Behörden oder Dritten; die OECD leitet daraus keine Aussage zum Status strittiger Gebiete ab.")
        if area == "CYP": notes.append("Zypern: Daten für das Gebiet unter effektiver Kontrolle der Regierung der Republik Zypern.")
        p["points"].append({"period": year, "value": row["OBS_VALUE"], "status": "OECD-Modellschätzung", "breakBefore": False,
                            "notes": notes, "lowerBound": None, "upperBound": None})
    assert len(seen) == len(rows)
    assert len(sums) == 80 * 28
    assert all(abs(total - 100) <= (Decimal("0.041") if trade else Decimal("0.001")) for total in sums.values())
    profiles = sorted(profiles.values(), key=lambda p:(p["metricId"], p["geographyId"]))
    for p in profiles:
        p["points"].sort(key=lambda v:v["period"])
        assert [v["period"] for v in p["points"]] == [str(y) for y in range(1995,2023)]
    source_areas = []
    for area in sorted(countries):
        ps = [p for p in profiles if p["providerArea"] == area]
        source_areas.append({"code": area, "label": labels[area], "geographyId": by_iso[area]["id"],
                             "seriesTitles": {p["metricId"].split(":",1)[1]:p["providerTitle"] for p in ps}})
    numeric = sum(len(p["points"]) for p in profiles)
    download = next(d for d in downloads if d.get("file") == spec["file"])
    assert hashlib.sha256(raw).hexdigest() == download["sha256"]
    source = {"id": spec["id"], "label": spec["label"], "adapter": "oecd_tiva", "url": download["url"],
              "documentationUrl": GUIDE, "licenseUrl": "https://www.oecd.org/en/about/terms-conditions.html",
              "publishedAt": "2026-01", "reviewedAt": "2026-09-11", "recipe": spec["id"]+"-2025-january2026-v1",
              "observationKind": "modeled_estimate", "expectedSha256": download["sha256"], "expectedRows": len(rows),
              "expectedNumeric": numeric, "firstPeriod": "1995", "lastPeriod": "2022", "areas": source_areas}
    contracts.append({"sourceId": spec["id"], "file": spec["file"], "url": source["url"], "flow": FLOW,
                      "headers": HEADERS, "areaLabels": labels, "excludedAreas": excluded,
                      "measures": spec["measures"], "partners": partners if trade else ["W"],
                      "tradePartners": trade, "areas": source_areas, "metricIds": [m["id"] for m in metrics],
                      "expectedRows": len(rows), "expectedProfiles": len(profiles), "expectedSelfRows": self_count,
                      "structureSha256": hashlib.sha256((RAW/'tiva-structure-direct.xml').read_bytes()).hexdigest()})
    expected[spec["id"]] = profiles
    audits.append({"source": source, "profiles":len(profiles), "selfRowsExcluded": self_count,
                   "unmappedSourceGroups": excluded, "sourceSumRange": [str(min(sums.values())),str(max(sums.values()))],
                   "sourceRoundingTolerance": "0.041" if trade else "0.001", "metrics": metrics})
    public["sources"] = [s for s in public["sources"] if s["id"] != source["id"]] + [source]
    public["metrics"] = [m for m in public["metrics"] if m["sourceId"] != source["id"]] + metrics
write(RAW / "tiva-expected-profiles.json", expected)
write(RAW / "tiva-contract-draft.json", contracts)
write(HERE / "public-tiva-audit.json", audits)
if "--apply" in sys.argv:
    public["version"] = "2026-09-11.12"
    write(DATA / "public-series-catalog.json", public)
    write(DATA / "public-tiva-contract.json", contracts)
    ledger = read(HERE / "remaining-40-ledger.json")
    for topic in ledger["topics"]:
        matches = [a for a in audits if any(m["topicId"] == topic["id"] for m in a["metrics"])]
        if matches and topic["status"] != "implemented_native_verified":
            topic["status"] = "source_validated"
            topic["research"] = [{"sourceId": a["source"]["id"], "reviewedAt": "2026-09-11", "evidence": "public-tiva-audit.json"} for a in matches]
    write(HERE / "remaining-40-ledger.json", ledger)
print(json.dumps([{"id": a["source"]["id"], "areas":len(a["source"]["areas"]), "profiles":a["profiles"], "numbers":a["source"]["expectedNumeric"]} for a in audits]))
