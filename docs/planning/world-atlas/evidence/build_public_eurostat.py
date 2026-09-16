"""Independently audit selected Eurostat originals; --apply installs reviewed contracts."""
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


# Eurostat's EL/UK/XK are explicit deviations from ISO; no prefix guessing.
ISO = dict(x.split(":") for x in (
    "BE:BEL BG:BGR CZ:CZE DK:DNK DE:DEU EE:EST IE:IRL EL:GRC ES:ESP FR:FRA "
    "HR:HRV IT:ITA CY:CYP LV:LVA LT:LTU LU:LUX HU:HUN MT:MLT NL:NLD AT:AUT "
    "PL:POL PT:PRT RO:ROU SI:SVN SK:SVK FI:FIN SE:SWE IS:ISL NO:NOR CH:CHE "
    "UK:GBR BA:BIH ME:MNE MK:MKD GE:GEO AL:ALB RS:SRB TR:TUR XK:XKX US:USA"
).split())
EXCLUDED = {"EU", "EA", "EA21", "EA20", "EA19", "EEA", "EU28", "EU27_2007", "EU25", "EU15"}
SPECS = {
    "isoc_eb_ai": ("eurostat-ai", "Eurostat · KI-Nutzung", [
        ("E_AI_TANY", "innovation:artificial_intelligence", "Unternehmen mit KI-Nutzung", "Wie verbreitet der Einsatz mindestens einer erfassten KI-Technologie in Unternehmen ist.", "Die Technologieliste wird mit der Erhebung weiterentwickelt. 2025 enthält sie auch die Erzeugung von Bildern, Videos und Audio; kein unveränderter Gesamtmarktindex."),
        ("E_AI_TTM", "innovation:artificial_intelligence", "KI · Textanalyse in Unternehmen", "Wie viele Unternehmen KI zur Analyse geschriebener Sprache einsetzen.", "Text Mining; keine Zahl entwickelter Modelle, Patente oder Investitionen."),
        ("E_AI_TML", "innovation:artificial_intelligence", "KI · maschinelles Lernen für Datenanalyse", "Wie viele Unternehmen maschinelles Lernen für die Datenanalyse einsetzen.", "Einschließlich Deep Learning; Nutzung im befragten Unternehmen, kein Forschungs- oder Marktwert.")]),
    "isoc_eb_p3d": ("eurostat-robotics", "Eurostat · Roboternutzung", [
        ("E_RBT", "innovation:robotics", "Unternehmen mit Industrie- oder Servicerobotern", "Wie verbreitet Roboternutzung in den befragten Unternehmen ist.", "Anteil der Unternehmen mit mindestens einer der beiden Roboterarten. Keine Zahl von Robotern, Installationen oder Roboterdichte."),
        ("E_RBTI", "innovation:robotics", "Unternehmen mit Industrierobotern", "Wie viele Unternehmen Industrieroboter einsetzen.", "Physische industrielle Roboter; keine reine Softwareautomatisierung. Unternehmen können zugleich Serviceroboter einsetzen."),
        ("E_RBTS", "innovation:robotics", "Unternehmen mit Servicerobotern", "Wie viele Unternehmen Serviceroboter einsetzen.", "Physische Serviceroboter mit einem Grad an Autonomie; keine reine Softwareautomatisierung. Beide Robotergruppen sind nicht addierbar.")]),
    "isoc_cisce_ra": ("eurostat-cybersecurity", "Eurostat · IT-Sicherheitsmaßnahmen", [
        ("E_SECMGE1", "digital:cybersecurity", "Unternehmen mit IT-Sicherheitsmaßnahmen", "Wie viele Unternehmen mindestens eine der erfassten IT-Sicherheitsmaßnahmen nutzen.", "Fragenkatalog ab 2022; nicht an ältere Summen mit anderer Maßnahmenliste angehängt. Maßnahmen sind kein Nachweis garantierter Sicherheit."),
        ("E_SECMGE5", "digital:cybersecurity", "Unternehmen mit mindestens fünf IT-Sicherheitsmaßnahmen", "Wie verbreitet ein breiteres Bündel erfasster IT-Sicherheitsmaßnahmen ist.", "Mindestens fünf Maßnahmen aus dem Fragenkatalog ab 2022. Keine Rangliste staatlicher Cybersicherheitsfähigkeiten."),
        ("E_SECMOSBU", "digital:cybersecurity", "IT-Sicherheit · getrennte Datensicherung", "Wie viele Unternehmen Sicherungskopien an einem getrennten Ort vorhalten.", "Einschließlich Cloud-Backups; kein gemessenes Wiederherstellungsergebnis."),
        ("E_SECMTST", "digital:cybersecurity", "IT-Sicherheit · Sicherheitstests", "Wie verbreitet IT-Sicherheitstests in Unternehmen sind.", "Gemeldete Nutzung der Maßnahme, keine Zahl erfolgreich verhinderter Angriffe.")]),
    "isoc_ec_esels": ("eurostat-ecommerce", "Eurostat · elektronischer Handel", [
        ("E_AESELL", "consumer_services:ecommerce", "Unternehmen mit elektronischen Verkäufen", "Wie viele Unternehmen elektronisch aufgegebene Bestellungen erhalten.", "Web/App/Marktplätze und EDI. B2B, B2G und B2C zusammen; keine reine Einzelhandelsquote. Ohne Ein-Prozent-Umsatzschwelle. Manuell geschriebene E-Mails sind ausgeschlossen."),
        ("E_AWSELL", "consumer_services:ecommerce", "Unternehmen mit Web-Verkäufen", "Wie viele Unternehmen Bestellungen über Websites, Apps oder Marktplätze erhalten.", "Web-Verkäufe ohne reine EDI-Bestellungen. Digitale Bestellung verlangt weder digitale Bezahlung noch digitale Lieferung; keine Umsatzquote."),
        ("E_AWS_CMP", "digital:digital_platforms", "Unternehmen mit Verkäufen über Online-Marktplätze", "Wie verbreitet die Nutzung von Online-Marktplätzen als Vertriebskanal ist.", "Vermittelnde Marktplätze, die mehrere Unternehmen nutzen. Keine selbst betriebene Shop-Software, keine Plattformumsätze, Warenwerte oder aktiven Nutzer. Zuordnung nach befragtem Unternehmen, nicht nach Sitz des Plattformbetreibers.")]),
    "isoc_cicce_use": ("eurostat-cloud", "Eurostat · Cloud-Nutzung", [
        ("E_CC", "digital:cloud", "Unternehmen mit bezahlten Cloud-Diensten", "Wie viele Unternehmen kostenpflichtige Cloud-Dienste über das Internet beziehen.", "Nutzung von Cloud-Diensten; keine Rechenzentrumsleistung oder Bauausgaben. Gratisdienste sind nicht der gleiche Indikator.")]),
    "prc_hicp_ainr": ("eurostat-rents", "Eurostat · tatsächliche Wohnungsmieten", [
        ("CP041", "housing:rents", "Wohnungsmieten · Preisentwicklung", "Wie sich tatsächlich gezahlte Wohnungsmieten gegenüber dem jeweiligen Landesniveau von 2025 entwickeln.", "Harmonisierter Verbraucherpreisindex, Jahresdurchschnitt 2025 = 100, ECOICOP 2. Tatsächliche Mieten einschließlich Haupt-/Zweitwohnungen und zugehöriger Garagen; keine unterstellten Eigentümermieten, Nebenkosten oder isolierten Neuvertragsmieten. Ein gleicher Indexwert bedeutet keine gleiche Monatsmiete. Die von Eurostat neu veröffentlichte Historie wird unverändert übernommen; keine Verknüpfung mit den archivierten Tabellen auf älterer Basis.")])}
SURVEY_SCOPE = ("Stichprobenerhebung bei Unternehmen mit mindestens zehn Beschäftigten einschließlich Selbständiger. "
    "NACE Rev. 2: C–J, L–N und Reparatur von Computern/Kommunikationsgeräten (95.1); nicht die gesamte Volkswirtschaft. "
    "Ab 2021 umfasst der Erhebungsrahmen zusätzlich Tierarztpraxen (M75). "
    "Nur tatsächlich veröffentlichte Erhebungsjahre; Länderbrüche und geringe Zuverlässigkeit bleiben gekennzeichnet. "
    "Die Prozentbasis sind alle erfassten Unternehmen, nicht nur Internetnutzer oder Technologieanwender.")
REUSE = "Quelle: Eurostat. Auswahl und deutsche Erläuterung durch Personal Macro; Eurostat verantwortet diese Darstellung nicht. Persönliche, nichtkommerzielle Verwendung; ursprüngliche Nutzungsbedingungen gelten."
catalog = read(DATA / "catalog.json")
by_iso = {g["iso3"]: g["id"] for g in catalog["geographies"] if g["iso3"]}
assert all(code in by_iso for code in ISO.values())
areas = {code: by_iso[iso] for code, iso in ISO.items()}
areas["EU27_2020"] = "eurostat:eu27_2020"
eu = {"id": "eurostat:eu27_2020", "label": "Europäische Union · 27 Länder · Eurostat", "iso3": "", "regionId": "Europe", "kind": "aggregate"}
existing = next((g for g in catalog["geographies"] if g["id"] == eu["id"]), None)
if existing is None:
    catalog["geographies"].append(eu)
else:
    assert existing == eu
public = read(DATA / "public-series-catalog.json")
contracts, audits, all_expected = [], [], {}
for request in read(RAW / "eurostat-requests.json"):
    ds = request["dataset"]
    sid, label, specs = SPECS[ds]
    raw = (RAW / f"eurostat-{ds}.json").read_bytes()
    obj = json.loads(raw)
    rent = ds == "prc_hicp_ainr"
    ids = ["freq", "unit", "coicop18", "geo", "time"] if rent else ["freq", "size_emp", "nace_r2", "indic_is", "unit", "geo", "time"]
    assert obj["id"] == ids and obj["class"] == "dataset" and obj["version"] == "2.0"
    assert obj["extension"]["agencyId"] == "ESTAT" and obj["extension"]["id"] == ds.upper()
    dim = obj["dimension"]
    codes = [sorted(dim[k]["category"]["index"], key=dim[k]["category"]["index"].get) for k in ids]
    assert list(map(len, codes)) == obj["size"]
    for k, expected in {"freq": ["A"], "unit": ["INX_A_AVG" if rent else "PC_ENT"], **({} if rent else {"size_emp": ["GE10"], "nace_r2": ["C10-S951_X_K"]})}.items():
        assert list(dim[k]["category"]["index"]) == expected
    metric_dimension = "coicop18" if rent else "indic_is"
    assert set(dim[metric_dimension]["category"]["index"]) == {s[0] for s in specs}
    if rent:
        assert "2025=100" in obj["extension"]["description"]
    flags = obj["extension"].get("status", {}).get("label", {})
    assert all(k in {"b", "u", "|C"} for k in flags)
    total = math.prod(obj["size"])
    values = obj["value"]
    statuses = obj.get("status", {})
    assert isinstance(values, dict) and all(str(int(k)) == k and 0 <= int(k) < total for k in values)
    assert all(str(int(k)) == k and 0 <= int(k) < total for k in statuses)
    metrics = []
    for code, topic, title, meaning, scope in specs:
        notes = scope + (" " + SURVEY_SCOPE if not rent else "")
        if ds == "isoc_ec_esels":
            notes += " Die Zeitachse zeigt das Verkaufsjahr: Quellen-Erhebungsjahr minus eins (z. B. Erhebung 2025 = Verkäufe 2024)."
        elif not rent:
            notes += " Die Zeitachse zeigt das Erhebungsjahr."
        metrics.append({"id": f"{sid}:{code}", "sourceId": sid, "topicId": topic, "providerCode": code, "label": title, "unit": "Mietpreisindex · Jahresdurchschnitt 2025 = 100" if rent else "Anteil der erfassten Unternehmen (%)", "frequency": "annual", "kind": "observed" if rent else "survey_estimate", "comparison": "same_definition", "connectAdjacent": rent, "explanation": meaning, "scopeNote": notes + " " + REUSE})
    metric_map = {m["providerCode"]: m for m in metrics}
    profiles = {}
    excluded_counts = collections.Counter()
    for pos, tup in enumerate(itertools.product(*codes)):
        row = dict(zip(ids, tup))
        code, area, year = row[metric_dimension], row["geo"], int(row["time"])
        assert 1996 <= year <= 2025
        value, flag = values.get(str(pos)), statuses.get(str(pos), "")
        assert flag in flags or not flag
        assert value is None or (isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and 0 <= value <= (1000000 if rent else 100))
        if flag == "|C":
            assert value is None
        if area in EXCLUDED:
            excluded_counts[area] += value is not None
            continue
        assert area in areas, area
        metric = metric_map[code]
        key = (code, area)
        title = f"{obj['label']} | {dim[metric_dimension]['category']['label'][code]} | {dim['unit']['category']['label'][row['unit']]}"
        p = profiles.setdefault(key, {"metricId": metric["id"], "geographyId": areas[area], "providerArea": area, "providerLabel": dim["geo"]["category"]["label"][area], "providerTitle": title, "unit": metric["unit"], "points": []})
        notes = []
        period = str(year)
        if ds == "isoc_ec_esels":
            period = str(year - 1)
            notes.append(f"Verkaufsjahr {period}; veröffentlicht unter Erhebungsjahr {year}.")
        elif not rent:
            notes.append(f"Erhebungsjahr {year}.")
        if not rent and year >= 2021:
            notes.append("Erhebungsrahmen seit 2021 einschließlich Tierarztpraxen (M75).")
        if code == "E_AI_TANY" and year == 2025:
            notes.append("Technologieliste 2025 einschließlich Erzeugung von Bildern, Videos und Audio.")
        status = {"b": "Reihenbruch laut Quelle (b)", "u": "Geringe Zuverlässigkeit laut Quelle (u)", "|C": "Vertraulicher Quellenwert (C)"}.get(flag, "")
        p["points"].append({"period": period, "value": None if value is None else str(value), "status": status, "breakBefore": flag == "b", "notes": notes, "lowerBound": None, "upperBound": None})
    profiles = [p for p in profiles.values() if any(v["value"] is not None for v in p["points"])]
    source_areas = []
    for area in sorted({p["providerArea"] for p in profiles}):
        group = [p for p in profiles if p["providerArea"] == area]
        source_areas.append({"code": area, "label": group[0]["providerLabel"], "geographyId": areas[area], "seriesTitles": {p["metricId"].split(":", 1)[1]: p["providerTitle"] for p in group}})
    numbers = [v for p in profiles for v in p["points"] if v["value"] is not None]
    periods = [v["period"] for p in profiles for v in p["points"]]
    if rent:
        assert all(abs(float(v["value"]) - 100) < .001 for v in numbers if v["period"] == "2025")
    source = {"id": sid, "label": label, "adapter": "eurostat_jsonstat", "url": request["url"], "documentationUrl": "https://ec.europa.eu/eurostat/web/hicp/information-data" if rent else "https://ec.europa.eu/eurostat/cache/metadata/en/isoc_e_esms.htm", "licenseUrl": "https://ec.europa.eu/eurostat/help/copyright-notice", "publishedAt": obj["updated"][:10], "reviewedAt": "2026-09-11", "recipe": f"{sid}-original-jsonstat-20260911-v1", "observationKind": "observed" if rent else "survey_estimate", "expectedSha256": hashlib.sha256(raw).hexdigest(), "expectedRows": len(values), "expectedNumeric": len(numbers), "firstPeriod": min(periods), "lastPeriod": max(periods), "areas": source_areas}
    contract = {"sourceId": sid, "dataset": ds, "url": request["url"], "label": obj["label"], "updated": obj["updated"], "dimensions": dim, "ids": ids, "sizes": obj["size"], "flagLabels": flags, "excludedAreas": sorted(EXCLUDED & set(codes[ids.index('geo')])), "referenceYearOffset": -1 if ds == "isoc_ec_esels" else 0, "rentalIndex": rent, "expectedProfiles": len(profiles)}
    audit = {"source": source, "profileCount": len(profiles), "originalNumericCount": len(values), "omittedAggregateNumericCount": dict(excluded_counts), "missingCells": sum(v["value"] is None for p in profiles for v in p["points"]), "statusCounts": dict(collections.Counter(v["status"] for p in profiles for v in p["points"] if v["status"])), "metrics": [{"id": m["id"], "profiles": sum(p["metricId"] == m["id"] for p in profiles)} for m in metrics]}
    contract["areas"] = source_areas
    contract["metricIds"] = [m["id"] for m in metrics]
    contracts.append(contract); audits.append(audit); all_expected[sid] = sorted(profiles, key=lambda p: (p['metricId'], p['geographyId']))
    public["sources"] = [s for s in public["sources"] if s["id"] != sid] + [source]
    public["metrics"] = [m for m in public["metrics"] if m["sourceId"] != sid] + metrics
public["version"] = catalog["version"] = "2026-09-11.6"
write(RAW / "eurostat-expected-profiles.json", all_expected)
write(RAW / "eurostat-contract-draft.json", contracts)
write(HERE / "public-eurostat-audit.json", audits)
if "--apply" in sys.argv:
    write(DATA / "catalog.json", catalog)
    write(DATA / "public-series-catalog.json", public)
    write(DATA / "public-eurostat-contract.json", contracts)
    ledger = read(HERE / "remaining-40-ledger.json")
    for topic in ledger["topics"]:
        matches = [m for m in public["metrics"] if m["topicId"] == topic["id"] and m["sourceId"].startswith('eurostat-')]
        if not matches or topic["status"] == "implemented_native_verified":
            continue
        topic["status"] = "source_validated"
        topic["research"] = [{"sourceId": m["sourceId"], "reviewedAt": "2026-09-11", "evidence": "public-eurostat-audit.json", "boundary": m["scopeNote"]} for m in matches]
        topic["implementation"] = {"sourceIds": sorted({m['sourceId'] for m in matches}), "catalog": "apps/desktop/src/features/world-atlas/data/public-series-catalog.json", "native": "apps/desktop/src-tauri/src/world_atlas/public_eurostat.rs", "view": "apps/desktop/src/features/world-atlas/atlas-public-panel.tsx", "migration": "0022_public_series.sql"}
    write(HERE / "remaining-40-ledger.json", ledger)
print(json.dumps([{ "source": a["source"]["id"], "areas": len(a["source"]["areas"]), "profiles": a["profileCount"], "numbers": a["source"]["expectedNumeric"], "missing": a["missingCells"]} for a in audits]))
