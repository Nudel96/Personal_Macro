"""Audit BGS original CSVs independently; --apply installs reviewed contracts."""
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


def write(path, obj):
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


SPECS = {
    "cement": ("bgs-cement", "BGS · Zementproduktion", "industry:cement", [
        ("2004", "Fertigzement · Produktion", "Tonnen Fertigzement", "Wie sich die veröffentlichte Fertigzementproduktion entwickelt."),
        ("2003", "Zementklinker · Produktion", "Tonnen Zementklinker", "Wie sich die veröffentlichte Produktion der Vorstufe Zementklinker entwickelt.")]),
    "lithium-all": ("bgs-lithium", "BGS · Lithiumprodukte", "materials:lithium", [
        ("896", "Spodumen · Mineralmenge", "Tonnen Spodumen", "Wie sich die Produktion des Lithiumminerals Spodumen entwickelt."),
        ("707", "Lithiumcarbonat · Produktmenge", "Tonnen Lithiumcarbonat", "Wie sich die veröffentlichte Lithiumcarbonatproduktion entwickelt."),
        ("20278", "Lithiumhydroxid · Produktmenge", "Tonnen Lithiumhydroxid", "Wie sich die veröffentlichte Lithiumhydroxidproduktion entwickelt."),
        ("1998", "Lithiumchlorid · Produktmenge", "Tonnen Lithiumchlorid", "Wie sich die veröffentlichte Lithiumchloridproduktion entwickelt."),
        ("894", "Lepidolith · Mineralmenge", "Tonnen Lepidolith", "Wie sich die Produktion des Lithiumminerals Lepidolith entwickelt."),
        ("895", "Petalit · Mineralmenge", "Tonnen Petalit", "Wie sich die Produktion des Lithiumminerals Petalit entwickelt."),
        ("20311", "Spodumen · Lithiumgehalt", "Tonnen enthaltenes Lithium in Spodumen", "Wie sich der veröffentlichte Lithiumgehalt der Spodumenproduktion entwickelt."),
        ("20309", "Lithiumcarbonat · Lithiumgehalt", "Tonnen enthaltenes Lithium in Carbonat", "Wie sich der veröffentlichte Lithiumgehalt der Carbonatproduktion entwickelt."),
        ("20310", "Lithiumchlorid · Lithiumgehalt", "Tonnen enthaltenes Lithium in Chlorid", "Wie sich der veröffentlichte Lithiumgehalt der Chloridproduktion entwickelt."),
        ("20312", "Lepidolith · Lithiumgehalt", "Tonnen enthaltenes Lithium in Lepidolith", "Wie sich der veröffentlichte Lithiumgehalt der Lepidolithproduktion entwickelt.")]),
    "rareearth-all": ("bgs-rare-earths", "BGS · Seltene Erden", "materials:rare_earths", [
        ("20238", "Seltene Erden · Oxidäquivalent", "Tonnen Seltenerdoxid-Äquivalent", "Wie sich die veröffentlichte Produktion von Seltenen Erden in Oxidäquivalenten entwickelt.")])}

COMMON = ("Zusammenstellung des British Geological Survey aus amtlichen und weiteren Quellen, einschließlich Schätzungen. "
          "Fehlende Angaben bleiben leer; ein Quellenstrich bedeutet keine Produktion, ein gerundetes Nullzeichen weniger als eine halbe Einheit. "
          "Quellenbrüche und besondere Gebiets- oder Berichtsjahre bleiben erläutert. Keine Reserven, Marktpreise oder Bewertung. "
          "World Mineral Statistics contributed by permission of the British Geological Survey. "
          "Nutzung für persönliche, nichtkommerzielle Recherche nach den Quellenbedingungen.")
SCOPES = {
    "cement": "Die Quelle umfasst europäische Länder. Fertigzement und Klinker sind verschiedene Verarbeitungsstufen und werden nicht addiert. Länderangaben können Verkäufe statt der gesamten Produktion, nur Portlandzement, Großbritannien statt des ganzen Vereinigten Königreichs oder die Schweiz einschließlich Liechtensteins umfassen; solche Quellennoten bleiben bei der Beobachtung erhalten.",
    "lithium-all": "Mineral- und Produktmasse bleiben vom enthaltenen Lithium getrennt. Der Quellengehalt wird unverändert übernommen und nicht aus pauschalen Umrechnungsfaktoren berechnet. Teilprodukte können dieselbe Verarbeitungskette betreffen; keine Addition zu Länder- oder Weltproduktion. Der unspezifische historische Mineralcode und die nach Land unterschiedlich abgegrenzte allgemeine Lithiumgehaltsreihe werden nicht als einheitliche Gesamtproduktion verwendet.",
    "rareearth-all": "Originalwerte in Seltenerdoxiden oder von BGS berechnetem Oxidäquivalent. Die ältere Tabelle über Mineralmengen wird nicht angehängt. Soweit möglich Zuordnung zum Abbauland; Verarbeitung aus Lagerbeständen kann in den Quellennoten getrennt erwähnt sein. Indien verwendet teils das am folgenden 31. März endende Berichtsjahr, Australien teils das am 30. Juni endende Jahr. Keine erfundene Welt- oder Afrika-Summe."}

catalog = read(DATA / "catalog.json")
iso = {g["iso3"]: g["id"] for g in catalog["geographies"] if g["iso3"]}
public = read(DATA / "public-series-catalog.json")
contracts, audits, expected = [], [], {}
requests = {r["key"]: r["url"] for r in read(RAW / "bgs-csv-requests.json")}
for key, (sid, label, topic, specs) in SPECS.items():
    raw = (RAW / f"bgs-{key}.csv").read_bytes()
    reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig")))
    rows = list(reader)
    reference = read(RAW / f"bgs-{key}.json")
    assert reference["numberMatched"] == reference["numberReturned"] == len(rows) < 10000
    assert len({r["synthetic_id"] for r in rows}) == len(rows)
    json_rows = {f["properties"]["synthetic_id"]: f["properties"] for f in reference["features"]}
    for row in rows:
        j = json_rows[row["synthetic_id"]]
        assert row["country_iso3_code"] == (j["country_iso3_code"] or "")
        assert row["country_trans"] == j["country_trans"]
        assert (None if not row["quantity"] else Decimal(row["quantity"])) == (None if j["quantity"] is None else Decimal(str(j["quantity"])))
        assert row["units"] == "tonnes (metric)" and row["bgs_statistic_type_trans"] == "Production"
    metrics = [{"id": f"{sid}:{code}", "sourceId": sid, "topicId": topic, "providerCode": code, "label": name, "unit": unit, "frequency": "annual", "kind": "source_estimates", "comparison": "same_definition", "connectAdjacent": True, "explanation": meaning, "scopeNote": SCOPES[key] + " " + COMMON} for code, name, unit, meaning in specs]
    metric_map = {m["providerCode"]: m for m in metrics}
    profiles, selected_keys = {}, set()
    for row in rows:
        code = row["bgs_commodity_code"]
        if code not in metric_map:
            continue
        area, year = row["country_iso3_code"], row["year"][:4]
        assert area in iso and row["year"] == year + "-01-01 00:00:00" and 1970 <= int(year) <= 2024
        key_tuple = code, area, year
        assert key_tuple not in selected_keys
        selected_keys.add(key_tuple)
        precision, value, book = row["data_precision_description"], row["quantity"], row["quantity_in_book_style"]
        status = []
        if precision == "Figures not available":
            assert not value and book == "..." and row["sdmx_code"] == "O"
            value = None
            status.append("Kein Zahlenwert veröffentlicht (…)")
        elif precision == "Nil (nothing produced)":
            assert value == "0" and book == "-----" and row["sdmx_code"] == "A"
            status.append("Keine Produktion laut Quelle (—)")
        else:
            assert not precision and row["sdmx_code"] == "A" and book == value and Decimal(value) > 0
        notes = []
        figure_notes = row["concat_figure_notes_text"].split("|") if row["concat_figure_notes_text"] else []
        for n in figure_notes:
            if n == "Estimates.":
                status.append("Quellenschätzung (*)")
            elif n == "Break in series.":
                status.append("Reihenbruch laut Quelle")
            else:
                notes.append("BGS-Quellenhinweis: " + n)
        if row["concat_table_notes_text"]:
            notes.append("BGS-Tabellenhinweise: " + row["concat_table_notes_text"].replace("|", " "))
        metric = metric_map[code]
        title = f"World Mineral Statistics | {row['country_trans']} | {row['bgs_commodity_trans']} | {row['bgs_sub_commodity_trans']} | tonnes (metric)"
        profile = profiles.setdefault((code, area), {"metricId": metric["id"], "geographyId": iso[area], "providerArea": area, "providerLabel": row["country_trans"], "providerTitle": title, "unit": metric["unit"], "points": []})
        assert profile["providerTitle"] == title
        profile["points"].append({"period": year, "value": value, "status": " · ".join(status), "breakBefore": "Break in series." in figure_notes, "notes": notes, "lowerBound": None, "upperBound": None})
    profiles = [p for p in profiles.values() if any(v["value"] is not None for v in p["points"])]
    for p in profiles:
        p["points"].sort(key=lambda v: v["period"])
    areas = []
    for area in sorted({p["providerArea"] for p in profiles}):
        ps = [p for p in profiles if p["providerArea"] == area]
        areas.append({"code": area, "label": ps[0]["providerLabel"], "geographyId": iso[area], "seriesTitles": {p["metricId"].split(":")[1]: p["providerTitle"] for p in ps}})
    points = [v for p in profiles for v in p["points"]]
    source = {"id": sid, "label": label, "adapter": "bgs_csv", "url": requests[key], "documentationUrl": "https://www.bgs.ac.uk/mineralsuk/statistics/world-mineral-statistics/", "licenseUrl": "https://www.bgs.ac.uk/mineralsuk/statistics/world-mineral-statistics/bgs-mineral-statistics-terms-and-conditions-ipr/", "publishedAt": "2026-05-20", "reviewedAt": "2026-09-11", "recipe": f"{sid}-original-csv-20260911-v1", "observationKind": "source_estimates", "expectedSha256": hashlib.sha256(raw).hexdigest(), "expectedRows": len(rows), "expectedNumeric": sum(v["value"] is not None for v in points), "firstPeriod": min(v["period"] for v in points), "lastPeriod": max(v["period"] for v in points), "areas": areas}
    metadata_fields = ["bgs_commodity_code", "bgs_commodity_trans", "bgs_sub_commodity_trans", "yearbook_table_id", "yearbook_table_trans"]
    contract = {"sourceId": sid, "url": requests[key], "rawFile": f"bgs-{key}.csv", "headers": reader.fieldnames, "selections": list(metric_map), "rowMetadata": sorted({tuple(r[f] for f in metadata_fields) for r in rows}), "rawAreas": sorted({(r["country_iso3_code"], r["country_trans"], r["country_iso2_code"]) for r in rows}), "areas": areas, "expectedProfiles": len(profiles)}
    contracts.append(contract)
    audits.append({"source": source, "profileCount": len(profiles), "missingCells": sum(v["value"] is None for v in points), "numericZeroCount": sum(v["value"] == "0" for v in points), "estimatedValues": sum("Quellenschätzung" in v["status"] for v in points), "breaks": sum(v["breakBefore"] for v in points), "excludedRows": len(rows) - len(points), "csvMatchesOriginalJson": True, "repeatedCsvIdentical": raw == (RAW / f"bgs-{key}-repeat.csv").read_bytes(), "metrics": [{"id": m["id"], "profiles": sum(p["metricId"] == m["id"] for p in profiles)} for m in metrics]})
    expected[sid] = sorted(profiles, key=lambda p: (p["metricId"], p["geographyId"]))
    public["sources"] = [s for s in public["sources"] if s["id"] != sid] + [source]
    public["metrics"] = [m for m in public["metrics"] if m["sourceId"] != sid] + metrics
write(RAW / "bgs-expected-profiles.json", expected)
write(RAW / "bgs-contract-draft.json", contracts)
write(HERE / "public-bgs-audit.json", audits)
if "--apply" in sys.argv:
    public["version"] = "2026-09-11.7"
    write(DATA / "public-series-catalog.json", public)
    write(DATA / "public-bgs-contract.json", contracts)
    ledger = read(HERE / "remaining-40-ledger.json")
    for topic in ledger["topics"]:
        matches = [m for m in public["metrics"] if m["topicId"] == topic["id"] and m["sourceId"].startswith("bgs-")]
        if matches and topic["status"] != "implemented_native_verified":
            topic["status"] = "source_validated"
            topic["research"] = [{"sourceId": m["sourceId"], "reviewedAt": "2026-09-11", "evidence": "public-bgs-audit.json", "boundary": m["scopeNote"]} for m in matches]
            topic["implementation"] = {"sourceIds": sorted({m["sourceId"] for m in matches}), "catalog": "apps/desktop/src/features/world-atlas/data/public-series-catalog.json", "native": "apps/desktop/src-tauri/src/world_atlas/public_bgs.rs", "view": "apps/desktop/src/features/world-atlas/atlas-public-panel.tsx", "migration": "0022_public_series.sql"}
    write(HERE / "remaining-40-ledger.json", ledger)
print(json.dumps([{ "source": a["source"]["id"], "areas": len(a["source"]["areas"]), "profiles": a["profileCount"], "numbers": a["source"]["expectedNumeric"], "missing": a["missingCells"]} for a in audits]))
