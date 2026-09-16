"""Audit Eurostat SBS originals independently; --apply installs the reviewed release.

Cartesian enumeration here is checked against the native flat-index decoder.
The 2021 EBS transition is never spliced to the archived SBS collection.
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


def write(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


ISO = dict(x.split(":") for x in (
    "BE:BEL BG:BGR CZ:CZE DK:DNK DE:DEU EE:EST IE:IRL EL:GRC ES:ESP FR:FRA "
    "HR:HRV IT:ITA CY:CYP LV:LVA LT:LTU LU:LUX HU:HUN MT:MLT NL:NLD AT:AUT "
    "PL:POL PT:PRT RO:ROU SI:SVN SK:SVK FI:FIN SE:SWE IS:ISL NO:NOR "
    "UK:GBR BA:BIH ME:MNE MK:MKD AL:ALB RS:SRB TR:TUR CH:CHE"
).split())
FLAGS = {
    "": "", "p": "Vorläufig laut Quelle (p)", "e": "Quellenschätzung (e)",
    "b": "Reihenbruch laut Quelle (b)", "d": "Abweichende Definition laut Quelle (d)",
    "u": "Geringe Verlässlichkeit laut Quelle (u)", "|C": "Vertraulich laut Quelle (|C)",
    "bd": "Reihenbruch und abweichende Definition laut Quelle (bd)",
    "de": "Abweichende Definition und Quellenschätzung (de)",
    "be": "Reihenbruch und Quellenschätzung (be)",
}
COMMON = (
    "Marktproduzierende Unternehmen aller Größenklassen, zugeordnet nach ihrer Haupttätigkeit. "
    "Keine Berufsstatistik aller Menschen mit entsprechender Ausbildung und kein Gesamtbild aller Dienstleistungen. "
    "Statistische Unternehmen können mehrere rechtliche Einheiten umfassen; die Umstellung von rechtlichen "
    "Einheiten auf Unternehmen kann insbesondere um 2018 Reihenbrüche erzeugen. "
    "Register, administrative Angaben, Erhebungen und Quellenschätzungen; nationale Methoden können abweichen. "
    "EU-Werte sind veröffentlichte Aggregate, keine selbst berechnete Summe. "
    "Zahlen beschreiben Umfang, keine Qualität, Produktivität oder Anlagebewertung. "
    "Quelle: Eurostat. Auswahl und deutsche Erläuterung durch Personal Macro; Eurostat verantwortet diese Darstellung nicht."
)
TOPICS = {
    "M": ("consumer_services:professional_services", "Unternehmensdienstleistungen",
          "NACE Rev. 2 M umfasst freiberufliche, wissenschaftliche und technische Dienstleistungen: "
          "unter anderem Recht, Buchführung, Beratung, Architektur, Ingenieurwesen, Forschung, Werbung und Veterinärwesen. "),
    "S96": ("consumer_services:personal_services", "Persönliche Dienstleistungen",
            "NACE Rev. 2 S96 umfasst sonstige persönliche Dienstleistungen, etwa Wäscherei, Friseur-, "
            "Kosmetik- und Bestattungsdienste. Gesundheitsversorgung, Bildung und private Haushalte als Arbeitgeber "
            "gehören nicht zu dieser Branche. "),
}
BREAK_NOTE = "Redaktionelle Trennung 2008: Die Eurostat-Metadaten warnen vor dem Klassifikationswechsel; frühere Punkte bleiben sichtbar, ohne Verbindung über diese Grenze."
SPECS = [
    dict(id="eurostat-business-services", file="eurostat-business-services.json", dataset="sbs_ovw_act",
         label="Eurostat · Dienstleistungsunternehmen ab 2021", indicatorDimension="indic_sbs",
         indicators={"ENT_NR": "enterprises", "EMP_NR": "employment"}, activities=["M", "S96"],
         firstYear=2021, lastYear=2024, documentationUrl="https://ec.europa.eu/eurostat/cache/metadata/en/sbs_esms.htm",
         scope="Aktuelle EBS-Reihe ab 2021, getrennt von der älteren SBS-Sammlung; Änderungen von Umfang und Definitionen werden nicht verkettet. "),
    dict(id="eurostat-professional-history", file="eurostat-professional-history.json", dataset="sbs_na_1a_se_r2",
         label="Eurostat · Unternehmensdienste 2005–2020", indicatorDimension="indic_sb",
         indicators={"V11110": "enterprises", "V16110": "employment"}, activities=["M"],
         firstYear=2005, lastYear=2020, documentationUrl="https://ec.europa.eu/eurostat/cache/metadata/en/sbs_h_esms.htm",
         scope="Archivierte SBS-Sammlung 2005–2020; keine Verlängerung mit den EBS-Werten ab 2021. "
               "Die vor 2008 vorhandenen Punkte bleiben an der Klassifikationsgrenze getrennt. "
               "Das Archiv enthält die Branche S96 der persönlichen Dienstleistungen nicht. "),
]

catalog = read(DATA / "catalog.json")
by_iso = {g["iso3"]: g["id"] for g in catalog["geographies"] if g["iso3"]}
areas = {code: by_iso[iso] for code, iso in ISO.items()}
areas["EU27_2020"] = "eurostat:eu27_2020"
urls = {r["file"]: r["url"] for r in read(RAW / "sbs-reviewed-downloads.json")}
public = read(DATA / "public-series-catalog.json")
contracts, audits, expected = [], [], {}
for spec in SPECS:
    raw = (RAW / spec["file"]).read_bytes()
    obj = json.loads(raw); dim = obj["dimension"]; ids = obj["id"]
    assert obj["class"] == "dataset" and obj["version"] == "2.0"
    assert obj["extension"]["agencyId"] == "ESTAT" and obj["extension"]["id"] == spec["dataset"].upper()
    codes = [sorted(dim[k]["category"]["index"], key=dim[k]["category"]["index"].get) for k in ids]
    assert ids == ["freq", "nace_r2", spec["indicatorDimension"], "geo", "time"]
    assert list(map(len, codes)) == obj["size"] and codes[0] == ["A"]
    assert codes[1] == spec["activities"] and set(codes[2]) == set(spec["indicators"])
    assert codes[4] == [str(y) for y in range(spec["firstYear"], spec["lastYear"] + 1)]
    flags = obj["extension"].get("status", {}).get("label", {})
    assert set(flags) <= set(FLAGS)
    total = math.prod(obj["size"]); values = obj["value"]; statuses = obj.get("status", {})
    assert all(str(int(k)) == k and 0 <= int(k) < total for k in values.keys() | statuses.keys())
    metrics = []
    for activity, indicator in itertools.product(spec["activities"], spec["indicators"]):
        topic, title, scope = TOPICS[activity]
        employees = spec["indicators"][indicator] == "employment"
        noun = "Erwerbstätige" if employees else "Unternehmen"
        qualifier = "Erwerbstätige einschließlich tätiger Inhaber und mithelfender Familienangehöriger; Kopfzahl, keine Vollzeitäquivalente. " if employees else "Statistische Unternehmen; keine Zählung sämtlicher Betriebsstätten oder rechtlicher Einheiten. "
        metrics.append({"id": spec["id"]+":"+activity+"_"+indicator, "sourceId": spec["id"], "topicId": topic,
                        "providerCode": activity+"/"+indicator, "label": title+" · "+noun+f" ({spec['firstYear']}–{spec['lastYear']})",
                        "unit": noun+" (Anzahl)", "frequency": "annual", "kind": "source_estimates",
                        "comparison": "same_definition", "connectAdjacent": True,
                        "explanation": f"Wie sich die Zahl der {'Erwerbstätigen' if employees else noun} in dieser Dienstleistungsbranche entwickelt.",
                        "scopeNote": scope + qualifier + spec["scope"] + COMMON})
    profiles = {}; excluded = collections.Counter()
    for pos, tup in enumerate(itertools.product(*codes)):
        row = dict(zip(ids, tup)); area = row["geo"]; year = row["time"]
        value, flag = values.get(str(pos)), statuses.get(str(pos), "")
        assert not flag or flag in flags
        assert value is None or (type(value) in {int, float} and math.isfinite(value) and int(value) == value and 0 <= value < 1e10)
        assert flag != "|C" or value is None
        if area in {"EU28", "EU27_2007"}:
            excluded[area] += value is not None
            continue
        assert area in areas, area
        code = row["nace_r2"] + "/" + row[spec["indicatorDimension"]]
        metric = next(m for m in metrics if m["providerCode"] == code)
        title = " | ".join([obj["label"], dim["nace_r2"]["category"]["label"][row["nace_r2"]], dim[spec["indicatorDimension"]]["category"]["label"][row[spec["indicatorDimension"]]]])
        p = profiles.setdefault((code, area), {"metricId": metric["id"], "geographyId": areas[area], "providerArea": area,
             "providerLabel": dim["geo"]["category"]["label"][area], "providerTitle": title, "unit": metric["unit"], "points": []})
        notes = []
        if area == "EU27_2020" and "d" in flag:
            notes.append("EU-Aggregat: Laut historischer SBS-Methodik bezeichnet d gerundete Schätzungen auf Basis nicht vertraulicher Werte; Rundung kann Abweichungen zu Teilaggregaten verursachen.")
        boundary = spec["id"] == "eurostat-professional-history" and year == "2008"
        if boundary: notes.append(BREAK_NOTE)
        p["points"].append({"period": year, "value": None if value is None else str(int(value)),
                            "status": FLAGS[flag], "breakBefore": "b" in flag or boundary, "notes": notes,
                            "lowerBound": None, "upperBound": None})
    profiles = sorted([p for p in profiles.values() if any(v["value"] is not None or v["status"] for v in p["points"])], key=lambda p:(p["metricId"], p["geographyId"]))
    source_areas = []
    for area in sorted({p["providerArea"] for p in profiles}):
        ps = [p for p in profiles if p["providerArea"] == area]
        source_areas.append({"code": area, "label": ps[0]["providerLabel"], "geographyId": areas[area],
                             "seriesTitles": {next(m["providerCode"] for m in metrics if m["id"] == p["metricId"]): p["providerTitle"] for p in ps}})
    numbers = [v for p in profiles for v in p["points"] if v["value"] is not None]
    source = {"id": spec["id"], "label": spec["label"], "adapter": "eurostat_sbs", "url": urls[spec["file"]],
              "documentationUrl": spec["documentationUrl"], "licenseUrl": "https://ec.europa.eu/eurostat/help/copyright-notice",
              "publishedAt": obj["updated"][:10], "reviewedAt": "2026-09-11", "recipe": spec["id"]+"-original-jsonstat-20260911-v1",
              "observationKind": "source_estimates", "expectedSha256": hashlib.sha256(raw).hexdigest(), "expectedRows": len(values),
              "expectedNumeric": len(numbers), "firstPeriod": min(v["period"] for v in numbers), "lastPeriod": max(v["period"] for v in numbers), "areas": source_areas}
    contracts.append({"sourceId": spec["id"], "file": spec["file"], "dataset": spec["dataset"], "url": source["url"],
                      "label": obj["label"], "updated": obj["updated"], "dimensions": dim, "ids": ids, "sizes": obj["size"],
                      "flagLabels": flags, "excludedAreas": sorted(set(codes[3]) & {"EU28", "EU27_2007"}),
                      "indicatorDimension": spec["indicatorDimension"], "firstYear": spec["firstYear"], "lastYear": spec["lastYear"],
                      "areas": source_areas, "metricIds": [m["id"] for m in metrics], "expectedProfiles": len(profiles)})
    expected[spec["id"]] = profiles
    audits.append({"source": source, "profileCount": len(profiles), "excludedAggregateValues": dict(excluded),
                   "missingCells": sum(v["value"] is None for p in profiles for v in p["points"]),
                   "statusCounts": dict(collections.Counter(v["status"] for p in profiles for v in p["points"] if v["status"])), "metrics": metrics})
    public["sources"] = [s for s in public["sources"] if s["id"] != source["id"]] + [source]
    public["metrics"] = [m for m in public["metrics"] if m["sourceId"] != source["id"]] + metrics
write(RAW / "sbs-expected-profiles.json", expected)
write(RAW / "sbs-contract-draft.json", contracts)
write(HERE / "public-sbs-audit.json", audits)
if "--apply" in sys.argv:
    public["version"] = "2026-09-11.11"
    write(DATA / "public-series-catalog.json", public)
    write(DATA / "public-sbs-contract.json", contracts)
    ledger = read(HERE / "remaining-40-ledger.json")
    for topic in ledger["topics"]:
        matches = [m for a in audits for m in a["metrics"] if m["topicId"] == topic["id"]]
        if matches and topic["status"] != "implemented_native_verified":
            topic["status"] = "source_validated"
            topic["research"] = [{"sourceId": m["sourceId"], "reviewedAt": "2026-09-11", "evidence": "public-sbs-audit.json", "boundary": m["scopeNote"]} for m in matches]
    write(HERE / "remaining-40-ledger.json", ledger)
print(json.dumps([{"id": a["source"]["id"], "areas": len(a["source"]["areas"]), "profiles": a["profileCount"], "values": a["source"]["expectedNumeric"], "missing": a["missingCells"]} for a in audits]))
