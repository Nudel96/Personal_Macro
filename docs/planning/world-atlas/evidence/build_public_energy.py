"""Audit complete Eurostat energy/SILC originals; --apply installs reviewed contracts.

All source numbers are enumerated independently with itertools.product; native
Rust decodes flat positions separately. No interpolation or computed aggregates.
"""
import collections
import hashlib
import itertools
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
DATA = ROOT / "apps/desktop/src/features/world-atlas/data"
RAW = ROOT / "apps/desktop/.tmp/atlas-remaining-40"
HERE = Path(__file__).resolve().parent


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


ISO = dict(x.split(":") for x in (
    "BE:BEL BG:BGR CZ:CZE DK:DNK DE:DEU EE:EST IE:IRL EL:GRC ES:ESP FR:FRA "
    "HR:HRV IT:ITA CY:CYP LV:LVA LT:LTU LU:LUX HU:HUN MT:MLT NL:NLD AT:AUT "
    "PL:POL PT:PRT RO:ROU SI:SVN SK:SVK FI:FIN SE:SWE IS:ISL LI:LIE NO:NOR "
    "UK:GBR BA:BIH ME:MNE MD:MDA MK:MKD GE:GEO AL:ALB RS:SRB TR:TUR UA:UKR "
    "XK:XKX CH:CHE"
).split())
STATUS = {"": "", "p": "Vorläufig laut Quelle (p)", "e": "Quellenschätzung (e)",
          "b": "Reihenbruch laut Quelle (b)", "n": "Nicht signifikant laut Quelle (n)"}
REUSE = "Quelle: Eurostat. Auswahl und deutsche Erläuterung durch Personal Macro; Eurostat verantwortet diese Darstellung nicht."
ZERO_NOTE = "Originalwert 0: Das jährliche Energie-Meldesystem trennt echte Null, sehr kleine Mengen, fehlende und vertrauliche Angaben nicht sicher. Ohne weitere Quellenkennzeichnung bleibt die Zahl im Bild offen."
ZERO_STATUS = "Quellen-Null · Bedeutung nicht eindeutig"
BIO_SCOPE = ("Inländische Primärerzeugung, nicht Verbrauch, Stromerzeugung oder Export. "
             "Terajoule sind ein Energieinhalt, keine Tonnage oder Marktpreise. "
             "Die beiden Brennstoffgruppen sind getrennte Ausschnitte der Bioenergie; flüssige Biokraftstoffe sind hier nicht enthalten. "
             "Schätzungen und vorläufiges Randjahr bleiben gekennzeichnet. "
             "Die Quelle kann echte Null, sehr kleine Mengen, fehlende und vertrauliche Angaben als Null melden; "
             "solche Nullen bleiben als Quellenhinweis erhalten und im Diagramm offen. "
             "Keine Aussage über Klimaneutralität, Nachhaltigkeit oder Anlagebewertung.")
HP_SCOPE = ("Veröffentlichte maximale thermische Leistung zum Jahresende (31. Dezember) in MW Wärmeleistung, "
            "über alle erfassten Nutzersektoren. Keine elektrische Anschlussleistung, erzeugte Wärmemenge, "
            "Zahl verkaufter Geräte oder Marktwert. Luft-, Erd- und Wasserwärme bleiben getrennt; "
            "keine zusätzliche Summe aus überlappenden Untertechnologien. "
            "Beginn bewusst 2004: Der Quellenbericht nennt Meldungen ab 2004/2017; die API enthält "
            "zusätzlich ungeklärte frühere Werte, die hier ausgeschlossen bleiben. "
            "Nationale Erhebungsmethoden und spätere Ergänzungen können Zeitvergleiche begrenzen; "
            "fehlende Kennzeichen beweisen keine direkte Messung. Das gemeinsame jährliche Energie-Meldesystem "
            "kann fehlende und sehr kleine Angaben ebenfalls als Null melden. Solche Nullen bleiben daher "
            "als Quellenhinweis erhalten und im Bild offen; sie beweisen keinen fehlenden Bestand.")
DH_SCOPE = ("Anteil der Personen in Privathaushalten, deren Wohnung über ein Fernwärmenetz beheizt wird. "
            "Alle Haushaltszusammensetzungen und alle Siedlungsarten, EU-SILC 2023. "
            "Personengewichtet, keine Quote aller Gebäude, kein Anteil an der erzeugten Wärme, "
            "keine Netzlänge oder Zahl der Anschlüsse. Ein einzelnes Erhebungsjahr ohne Verlaufslinie. "
            "Gemeinschaftsunterkünfte und Einrichtungen sind grundsätzlich ausgenommen. "
            "Frankreich ohne Mayotte, einschließlich vier weiterer Überseedepartements; "
            "Zypern nur regierungskontrolliertes Gebiet, Niederlande ohne Überseegebiete und Norwegen ohne Spitzbergen. "
            "Nationale Erhebungsunterschiede und Stichprobenunsicherheit bleiben Grenzen des Vergleichs.")
SPECS = [
    dict(id="eurostat-bioenergy", file="eurostat-bioenergy-solid-gas.json", dataset="nrg_cb_rw",
         label="Eurostat · Bioenergie-Erzeugung", metricDimension="siec", firstYear=1990, lastYear=2025,
         maximumValue=1e9, scope=BIO_SCOPE, kind="source_estimates", unit="Energieinhalt (TJ)", connect=True, ambiguousZero=True,
         documentationUrl="https://ec.europa.eu/eurostat/cache/metadata/en/nrg_cb_esms.htm",
         fixed={"freq": ["A"], "nrg_bal": ["IPRD"], "unit": ["TJ"]},
         metrics=[("R5110-5150_W6000RI", "fuels:bioenergy", "Feste Biobrennstoffe · Primärerzeugung", "Wie viel Energie die im Land erzeugten primären festen Biobrennstoffe enthalten."),
                  ("R5300", "fuels:bioenergy", "Biogas · Primärerzeugung", "Wie viel Energie das im Land erzeugte Biogas enthält.")]),
    dict(id="eurostat-heat-pumps", file="eurostat-heatpump-capacity.json", dataset="nrg_inf_hptc",
         label="Eurostat · Wärmepumpenleistung", metricDimension="hp_tech", firstYear=2004, lastYear=2024,
         maximumValue=1e9, scope=HP_SCOPE, kind="source_estimates", unit="Thermische Leistung (MW)", connect=True, ambiguousZero=True,
         documentationUrl="https://ec.europa.eu/eurostat/cache/metadata/en/nrg_inf_hptc_esms.htm",
         fixed={"freq": ["A"], "plant_tec": ["CAP_HEAT"], "unit": ["MW"]},
         metrics=[("ATH", "energy_systems:heat_pumps", "Wärmepumpen · Luftwärme", "Wie sich die installierte thermische Leistung von Wärmepumpen mit Luft als Wärmequelle entwickelt."),
                  ("GTH", "energy_systems:heat_pumps", "Wärmepumpen · Erdwärme", "Wie sich die installierte thermische Leistung von Wärmepumpen mit Erdwärme als Wärmequelle entwickelt."),
                  ("HTH", "energy_systems:heat_pumps", "Wärmepumpen · Wasserwärme", "Wie sich die installierte thermische Leistung von Wärmepumpen mit Wasser als Wärmequelle entwickelt.")]),
    dict(id="eurostat-district-heating", file="eurostat-district-heating-households.json", dataset="ilc_lvhe02",
         label="Eurostat · Fernwärme in Privathaushalten", metricDimension="amenity", firstYear=2023, lastYear=2023,
         maximumValue=100, scope=DH_SCOPE, kind="household_survey", unit="Personen in Privathaushalten (%)", connect=False, ambiguousZero=False,
         documentationUrl="https://ec.europa.eu/eurostat/cache/metadata/en/ilc_sieusilc.htm",
         fixed={"freq": ["A"], "deg_urb": ["TOTAL"], "hhcomp": ["TOTAL"], "unit": ["PC"]},
         metrics=[("DHEAT", "energy_systems:district_heating", "Fernwärme · Bevölkerung mit Netzheizung", "Wie verbreitet Fernwärme in den Wohnungen der Bevölkerung ist.")]),
]

catalog = read(DATA / "catalog.json")
by_iso = {g["iso3"]: g["id"] for g in catalog["geographies"] if g["iso3"]}
areas = {code: by_iso[iso] for code, iso in ISO.items()}
areas["EU27_2020"] = "eurostat:eu27_2020"
public = read(DATA / "public-series-catalog.json")
urls = {r["file"]: r["url"] for r in read(RAW / "eurostat-energy-reviewed-downloads.json")}
urls["eurostat-heatpump-capacity.json"] = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/nrg_inf_hptc?lang=en&plant_tec=CAP_HEAT&unit=MW&hp_tech=ATH&hp_tech=GTH&hp_tech=HTH"
contracts, audits, expected = [], [], {}
for spec in SPECS:
    raw = (RAW / spec["file"]).read_bytes()
    obj = json.loads(raw); dim = obj["dimension"]; ids = obj["id"]
    assert obj["class"] == "dataset" and obj["version"] == "2.0"
    assert obj["extension"]["agencyId"] == "ESTAT" and obj["extension"]["id"] == spec["dataset"].upper()
    codes = [sorted(dim[k]["category"]["index"], key=dim[k]["category"]["index"].get) for k in ids]
    assert list(map(len, codes)) == obj["size"]
    assert set(ids) == set(spec["fixed"]) | {spec["metricDimension"], "geo", "time"}
    for key, wanted in spec["fixed"].items():
        assert codes[ids.index(key)] == wanted
    assert set(codes[ids.index(spec["metricDimension"])]) == {m[0] for m in spec["metrics"]}
    flags = obj["extension"].get("status", {}).get("label", {})
    assert set(flags) <= set(STATUS)
    total = math.prod(obj["size"]); values = obj["value"]; statuses = obj.get("status", {})
    assert all(str(int(k)) == k and 0 <= int(k) < total for k in values.keys() | statuses.keys())
    metrics = [{"id": spec["id"]+":"+code, "sourceId": spec["id"], "topicId": topic, "providerCode": code,
                "label": label, "unit": spec["unit"], "frequency": "annual", "kind": spec["kind"],
                "comparison": "same_definition", "connectAdjacent": spec["connect"], "explanation": meaning,
                "scopeNote": spec["scope"] + " " + REUSE} for code, topic, label, meaning in spec["metrics"]]
    profiles = {}; excluded = collections.Counter(); omitted_early = collections.Counter()
    for pos, tup in enumerate(itertools.product(*codes)):
        row = dict(zip(ids, tup)); area = row["geo"]; year = int(row["time"]); code = row[spec["metricDimension"]]
        value, flag = values.get(str(pos)), statuses.get(str(pos), "")
        assert 1990 <= year <= 2025 and (not flag or flag in flags)
        assert value is None or (type(value) in {int, float} and math.isfinite(value) and 0 <= value <= spec["maximumValue"])
        if area in {"EA20", "EA21"}:
            excluded[area] += value is not None
            continue
        assert area in areas, area
        if not spec["firstYear"] <= year <= spec["lastYear"]:
            omitted_early["numeric" if value is not None else "missing"] += 1
            if value: omitted_early["nonzero"] += 1
            continue
        metric = next(m for m in metrics if m["providerCode"] == code)
        title = " | ".join([obj["label"], dim[spec["metricDimension"]]["category"]["label"][code], dim["unit"]["category"]["label"][row["unit"]]])
        p = profiles.setdefault((code, area), {"metricId": metric["id"], "geographyId": areas[area], "providerArea": area,
             "providerLabel": dim["geo"]["category"]["label"][area], "providerTitle": title, "unit": metric["unit"], "points": []})
        notes = ["Erhebungsjahr 2023 · Personen in Privathaushalten."] if spec["id"] == "eurostat-district-heating" else []
        status = STATUS[flag]
        if spec["ambiguousZero"] and value == 0:
            notes.append(ZERO_NOTE)
            status = " · ".join(s for s in [status, ZERO_STATUS] if s)
            value = None
        p["points"].append({"period": str(year), "value": None if value is None else str(value), "status": status, "breakBefore": flag == "b", "notes": notes, "lowerBound": None, "upperBound": None})
    profiles = sorted([p for p in profiles.values() if any(v["value"] is not None or v["status"] for v in p["points"])], key=lambda p:(p["metricId"], p["geographyId"]))
    source_areas = []
    for area in sorted({p["providerArea"] for p in profiles}):
        ps = [p for p in profiles if p["providerArea"] == area]
        source_areas.append({"code": area, "label": ps[0]["providerLabel"], "geographyId": areas[area], "seriesTitles": {p["metricId"].split(":", 1)[1]: p["providerTitle"] for p in ps}})
    numbers = [v for p in profiles for v in p["points"] if v["value"] is not None]
    source = {"id": spec["id"], "label": spec["label"], "adapter": "eurostat_energy", "url": urls[spec["file"]],
              "documentationUrl": spec["documentationUrl"], "licenseUrl": "https://ec.europa.eu/eurostat/help/copyright-notice",
              "publishedAt": obj["updated"][:10], "reviewedAt": "2026-09-11", "recipe": spec["id"]+"-original-jsonstat-20260911-v1",
              "observationKind": spec["kind"], "expectedSha256": hashlib.sha256(raw).hexdigest(), "expectedRows": len(values),
              "expectedNumeric": len(numbers), "firstPeriod": min(v["period"] for v in numbers), "lastPeriod": max(v["period"] for v in numbers), "areas": source_areas}
    contract = {"sourceId": spec["id"], "file": spec["file"], "dataset": spec["dataset"], "url": source["url"],
                "label": obj["label"], "updated": obj["updated"], "dimensions": dim, "ids": ids, "sizes": obj["size"],
                "flagLabels": flags, "excludedAreas": sorted(set(codes[ids.index('geo')]) & {"EA20", "EA21"}),
                "metricDimension": spec["metricDimension"], "firstYear": spec["firstYear"], "lastYear": spec["lastYear"],
                "maximumValue": spec["maximumValue"], "ambiguousZero": spec["ambiguousZero"], "areas": source_areas, "metricIds": [m["id"] for m in metrics], "expectedProfiles": len(profiles)}
    contracts.append(contract); expected[spec["id"]] = profiles
    audits.append({"source": source, "profileCount": len(profiles), "excludedEuroAreaValues": dict(excluded), "excludedEarlyCells": dict(omitted_early),
                   "missingCells": sum(v["value"] is None for p in profiles for v in p["points"]),
                   "statusCounts": dict(collections.Counter(v["status"] for p in profiles for v in p["points"] if v["status"])),
                   "scope": spec["scope"], "metrics": metrics})
    public["sources"] = [s for s in public["sources"] if s["id"] != source["id"]] + [source]
    public["metrics"] = [m for m in public["metrics"] if m["sourceId"] != source["id"]] + metrics
write(RAW / "energy-expected-profiles.json", expected)
write(RAW / "energy-contract-draft.json", contracts)
write(HERE / "public-energy-audit.json", audits)
if "--apply" in sys.argv:
    public["version"] = "2026-09-11.10"
    write(DATA / "public-series-catalog.json", public)
    write(DATA / "public-energy-contract.json", contracts)
    ledger = read(HERE / "remaining-40-ledger.json")
    for topic in ledger["topics"]:
        matches = [m for a in audits for m in a["metrics"] if m["topicId"] == topic["id"]]
        if matches and topic["status"] != "implemented_native_verified":
            topic["status"] = "source_validated"
            topic["research"] = [{"sourceId": m["sourceId"], "reviewedAt": "2026-09-11", "evidence": "public-energy-audit.json", "boundary": m["scopeNote"]} for m in matches]
    write(HERE / "remaining-40-ledger.json", ledger)
print(json.dumps([{ "id": a["source"]["id"], "areas": len(a["source"]["areas"]), "profiles": a["profileCount"], "values": a["source"]["expectedNumeric"], "missing": a["missingCells"], "earlyExcluded": a["excludedEarlyCells"]} for a in audits]))
