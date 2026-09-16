"""Independent BIS CPP audit: inherit original metadata, never rebase national prices."""
from pathlib import Path
from decimal import Decimal
import collections
import csv
import hashlib
import io
import json
import re
import sys
import zipfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
DATA = ROOT / "apps/desktop/src/features/world-atlas/data"
RAW = ROOT / "apps/desktop/.tmp/atlas-remaining-40"
ID = "bis-commercial-property"
URL = "https://data.bis.org/static/bulk/WS_CPP_csv_flat.zip"
AREA_ISO = dict(AE="ARE", AR="ARG", BR="BRA", CH="CHE", CZ="CZE", DE="DEU", DK="DNK", ES="ESP", FR="FRA", GR="GRC", HK="HKG", ID="IDN", IS="ISL", JP="JPN", KR="KOR", MA="MAR", NL="NLD", PH="PHL", PL="POL", PT="PRT", SA="SAU", SG="SGP", SI="SVN", TR="TUR", US="USA", XM="EURO20")
EURO = dict(id="bis:cpp_euro_area20", label="Euroraum · BIS-Gewerbeimmobilien (20 Länder)", regionId="Europe", iso3="", kind="aggregate")
TYPES = {"A": "Gewerbeimmobilien gesamt", "D": "Büro und Einzelhandel", "B": "Büroimmobilien", "C": "Einzelhandelsimmobilien", "G": "Industrieimmobilien", "M": "Gewerbegrundstücke"}
FREQUENCIES = {"A": "annual", "H": "half_yearly", "Q": "quarterly", "M": "monthly"}
CITIES = {("DE", "4"): "7 Großstädte", ("DE", "9"): "127 Städte", ("JP", "2"): "Tokio", ("JP", "3"): "Metropolregion Tokio", ("JP", "9"): "Stadtgebiete", ("PL", "2"): "Warschau", ("GR", "2"): "Athen", ("BR", "4"): "10 Städte", ("AE", "2"): "Abu Dhabi", ("AE", "5"): "Dubai", ("AR", "2"): "Buenos Aires", ("FR", "4"): "Großstädte · Spitzenlagen", ("ES", "4"): "Großstädte · Spitzenlagen", ("ID", "3"): "Jakarta", ("ID", "4"): "11 Städte", ("IS", "3"): "Großraum Reykjavík", ("MA", "2"): "Rabat", ("PH", "2"): "Geschäftszentrum Makati", ("SA", "2"): "Riad", ("TR", "2"): "Istanbul"}
UNITS = {
    "651: Index, 2010 Q1 = 100": "Index (2010-Q1 = 100)",
    "628: Index, 2010 = 100": "Index (2010 = 100)",
    "801: Index, 2015  = 100": "Index (2015 = 100)",
    "AED: UAE dirham": "AED je m²",
    "965: Index, 2025 = 100": "Index (2025 = 100)",
    "764: Index, 2014 = 100": "Index (2014 = 100)",
    "338: Index, 1999 = 100": "Index (1999 = 100)",
    "840: Index, 2017 = 100": "Index (2017 = 100)",
    "923: Index, 2023 =100": "Index (2023 = 100)",
    "921: Index, 2022 = 100": "Index (2022 = 100)",
    "319: Index, 1995 = 100": "Index (1995 = 100)",
    "336: Index, 1998 Q4 = 100": "Index (1998-Q4 = 100)",
    "966: Index, 2026 Jan = 100": "Index (Januar 2026 = 100)",
    "853: Index, 2010 Mar = 100": "Index (März 2010 = 100)",
    "USD: US dollar": "USD je m²",
    "556: Index, 2006 = 100": "Index (2006 = 100)",
    "667: Index, 2006 Q1 = 100": "Index (2006-Q1 = 100)",
    "817: Index, 2016 Jan = 100": "Index (Januar 2016 = 100)",
    "PHP: Philippine peso": "PHP je m²",
    "905: Index, 2012 Q4 = 100": "Index (2012-Q4 = 100)",
    "655: Index, 2011 = 100": "Index (2011 = 100)",
}
BREAKS = {
    "Q.US.0.A.0.2.6.0": {"1996-Q1": "Quellenwechsel ab 1996-Q1: CoStar-Wiederverkaufsindex statt früherer gutachterbasierter NREI-Reihen."},
    "M.BR.4.D.0.2.1.0": {"2014-01": "Gebietserweiterung: Belo Horizonte ab Januar 2014.", "2016-01": "Gebietserweiterung: Porto Alegre ab Januar 2016."},
    "Q.PH.2.M.0.2.1.0": {"2019-Q1": "Quellenrevision ab 2019-Q1 um 28–43 %. Weitere Revision älterer Werte bleibt laut Quelle möglich."},
}
BASE_NOTE = "BIS-Gewerbeimmobilien, Veröffentlichung 27. August 2026. Originale nationale oder städtische Preisreihen; keine einheitliche Preisbasis oder uneingeschränkte internationale Vergleichbarkeit. Häufigkeit, Gebäudetyp, Gebietsabgrenzung und Berechnung unterscheiden sich. Ländervergleiche teilen den Kalender, behalten aber ihre eigenen Einheiten und Maßstäbe. Keine eigene Umbasierung, Inflationierung, Währungsumrechnung oder faire Bewertung."
STATUS = {"A: Normal value": "Veröffentlichter Quellenwert (A)", "P: Provisional value": "Vorläufiger Quellenwert (P)", "M: Missing value; data cannot exist": "Keine Beobachtung laut Quelle (M)"}


def read(p):
    return json.loads(p.read_text(encoding="utf-8"))


def write(p, obj):
    p.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main():
    raw = (RAW / "WS_CPP.zip").read_bytes()
    archive = zipfile.ZipFile(io.BytesIO(raw))
    assert archive.namelist() == ["WS_CPP_csv_flat.csv"]
    csv_raw = archive.read("WS_CPP_csv_flat.csv")
    reader = csv.DictReader(io.StringIO(csv_raw.decode("utf-8-sig")))
    h = reader.fieldnames
    assert len(h) == 33 and h[11] == "TIME_PERIOD:Time period or range" and h[28] == "UNIT_MEASURE:Unit of measure"
    rows = list(reader)
    assert len(rows) == 6599
    metadata = {}
    series = collections.defaultdict(list)
    for r in rows:
        assert r[h[0]] == "dataflow" and r[h[1]] == "BIS:WS_CPP(1.0): Commercial property prices" and r[h[2]] == "I"
        dimensions = tuple(r[k] for k in h[4:11])
        if not r[h[11]]:
            assert not r[h[3]] and not r[h[12]] and dimensions not in metadata
            metadata[dimensions] = r
        else:
            assert r[h[30]] == "F: Free" and r[h[31]] == "" and r[h[32]] in STATUS
            assert all(not r[k] for k in h[15:30])
            series[(r[h[3]], *dimensions)].append(r)
    assert len(metadata) == len(series) == 68
    catalog = read(DATA / "catalog.json")
    by_iso = {g["iso3"]: g for g in catalog["geographies"] if g["iso3"]}
    mapped = {code: EURO if iso == "EURO20" else by_iso[iso] for code, iso in AREA_ISO.items()}
    profiles, metrics, specs, excluded = [], [], [], []
    areas = {}
    all_meta = []
    for dimensions, observations in sorted(series.items()):
        m = metadata[dimensions[1:]]
        parts = [d.split(":", 1)[0] for d in dimensions]
        key = ".".join(parts)
        freq, country, covered, typ, vintage, compiler, price_unit, adjust = parts
        assert freq in FREQUENCIES and country in mapped and adjust == "0"
        assert h[20] == "DECIMALS:Decimals" and m[h[29]] == "0: Units"
        assert m[h[20]] == ("1: One" if key in ("Q.DE.0.B.0.2.6.0", "Q.DE.0.C.0.2.6.0") else "4: Four")
        all_meta.append({"dimensions": list(dimensions[1:]), "row": [m[k] for k in h]})
        if typ not in TYPES:
            assert typ in ("O", "I")
            excluded.append({"key": key, "rows": len(observations), "reason": "Residential investment properties" if typ == "O" else "Agricultural properties"})
            continue
        title = m[h[25]]
        assert title and m[h[28]] in UNITS
        unit = UNITS[m[h[28]]]
        geography = mapped[country]
        area_label = m[h[4]].split(": ", 1)[1]
        if covered == "0":
            place = "20 Länder (Stand 2023)" if country == "XM" else "Gesamtgebiet"
        elif country == "JP" and covered == "4":
            place = "6 Großstadtgebiete" if typ == "M" else "3 Metropolregionen"
        else:
            place = CITIES[(country, covered)]
        label = TYPES[typ] + " · " + place
        real = price_unit == "8"
        if country == "IS": label += " · real" if real else " · nominal"
        notes = [BASE_NOTE, "Originaltitel: " + title + "."]
        for index, prefix in [(18,"Quellenabdeckung"),(19,"Quellenberechnung"),(16,"Quellenbrüche"),(17,"Periodenhinweis"),(22,"Einheitshinweis"),(26,"Titelzusatz"),(24,"Ursprünglicher Datengeber")]:
            if m[h[index]]: notes.append(prefix + ": " + m[h[index]])
        if country == "JP" and typ == "M":
            notes.append("Originale Halbjahreserhebungen stehen als Q1 und Q3 in einem Quartalskalender; die offenen Zwischenquartale werden nicht ergänzt.")
        if country == "IS":
            notes.append("Reykjavík: reale Quelle mit Kreditkonditionenindex als Deflator, ab Mitte 2008 an den Verbraucherpreisindex gekoppelt; nominale Reihe separat von BIS berechnet.")
        if country == "XM":
            notes.append("Eigenes Quellengebiet: feste Zusammensetzung von 20 Euro-Ländern zum 1. Januar 2023; kein heutiger, automatisch erweiterter Euroraum.")
        metric = {"id": ID + ":" + key, "sourceId": ID, "topicId": "housing:commercial_property", "providerCode": key,
            "label": label, "unit": unit, "frequency": FREQUENCIES[freq], "kind": "commercial_price",
            "comparison": "within_country", "connectAdjacent": True,
            "explanation": f"{TYPES[typ]} in {place}: {'reale' if real else 'nominale'} Preisentwicklung in der ursprünglichen Quellenabgrenzung.",
            "scopeNote": " ".join(notes)}
        metrics.append(metric)
        areas.setdefault(country, {"code": country, "label": area_label, "geographyId": geography["id"], "seriesTitles": {}})["seriesTitles"][key] = title
        points = []
        seen = set()
        for r in observations:
            period, value, status = r[h[11]], r[h[12]], r[h[32]]
            pattern = {"A": r"\d{4}", "H": r"\d{4}-S[12]", "Q": r"\d{4}-Q[1234]", "M": r"\d{4}-(0[1-9]|1[0-2])"}[freq]
            assert re.fullmatch(pattern, period) and 1945 <= int(period[:4]) <= 2026 and period not in seen
            seen.add(period)
            if status.startswith("M:"):
                assert value == "NaN"
                value = None
            else:
                assert value.strip() == value and Decimal(value).is_finite() and Decimal(value) >= 0
            note = BREAKS.get(key, {}).get(period)
            points.append({"period": period, "value": value, "status": STATUS[status], "breakBefore": note is not None,
                "notes": [note] if note else [], "lowerBound": None, "upperBound": None})
        points.sort(key=lambda p:p["period"])
        profile = {"metricId": metric["id"], "geographyId": geography["id"], "providerArea": country,
            "providerLabel": area_label, "providerTitle": title, "unit": unit, "points": points}
        profiles.append(profile)
        specs.append({"key": key, "dimensions": list(dimensions), "geographyId": geography["id"], "unit": unit,
            "metric": metric, "rows": len(points), "numeric": sum(p["value"] is not None for p in points),
            "first": points[0]["period"], "last": points[-1]["period"], "breaks": BREAKS.get(key,{})})
    assert len(profiles) == 65 and len(areas) == 25 and len(excluded) == 3
    profiles.sort(key=lambda p:(p["metricId"],p["geographyId"]))
    type_order = {k:i for i,k in enumerate(TYPES)}
    metrics.sort(key=lambda m:(m["providerCode"].split('.')[1],type_order[m["providerCode"].split('.')[3]],m["providerCode"].split('.')[2] != '0',m["providerCode"]))
    source = {"id":ID,"label":"BIS · Gewerbeimmobilienpreise","adapter":"bis_cpp","url":URL,"documentationUrl":"https://data.bis.org/topics/CPP","licenseUrl":"https://data.bis.org/help/legal",
        "publishedAt":"2026-08-27","reviewedAt":"2026-09-11","recipe":"bis-cpp-original-national-city-prices-20260827-v1","observationKind":"source_estimates",
        "expectedSha256":hashlib.sha256(raw).hexdigest(),"expectedRows":len(rows),"expectedNumeric":sum(s["numeric"] for s in specs),"firstPeriod":"1945-Q4","lastPeriod":"2026-06","areas":[areas[k] for k in sorted(areas)]}
    assert source["expectedNumeric"] == 5586
    contract = {"sourceId":ID,"file":"WS_CPP.zip","member":"WS_CPP_csv_flat.csv","uncompressedBytes":len(csv_raw),"headers":h,"metadata":all_meta,"series":specs,"excluded":excluded,"areas":source["areas"],"sourceRegions":[EURO]}
    audit = {"source":source,"metrics":metrics,"profiles":len(profiles),"selectedObservationRows":sum(s["rows"] for s in specs),"missing":sum(p["value"] is None for r in profiles for p in r["points"]),"metadataRows":len(metadata),"originalObservationRows":6531,"excluded":excluded,"contract":contract}
    write(HERE/"public-cpp-audit.json",audit)
    write(RAW/"cpp-expected-profiles.json",profiles)
    write(RAW/"cpp-contract-draft.json",contract)
    if "--apply" in sys.argv:
        public = read(DATA/"public-series-catalog.json")
        public["sources"] = [s for s in public["sources"] if s["id"] != ID]+[source]
        public["metrics"] = [m for m in public["metrics"] if m["sourceId"] != ID]+metrics
        public["version"] = "2026-09-11.15"
        write(DATA/"public-series-catalog.json",public)
        write(DATA/"public-cpp-contract.json",contract)
        catalog["geographies"] = [g for g in catalog["geographies"] if g["id"] != EURO["id"]]+[EURO]
        catalog["version"] = "2026-09-11.15"
        write(DATA/"catalog.json",catalog)
        ledger = read(HERE/"remaining-40-ledger.json")
        topic = next(t for t in ledger["topics"] if t["id"] == "housing:commercial_property")
        if topic["status"] != "implemented_native_verified":
            topic["status"] = "source_validated"
            topic["research"] = [{"sourceId":ID,"reviewedAt":"2026-09-11","evidence":"public-cpp-audit.json"}]
        write(HERE/"remaining-40-ledger.json",ledger)
    print(json.dumps({"profiles":len(profiles),"areas":len(areas),"numeric":source["expectedNumeric"],"missing":audit["missing"],"excluded":excluded}))


if __name__ == "__main__":
    main()
