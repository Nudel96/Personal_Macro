"""Independent audit of ND-GAIN 2026, retaining its modeled and projected nature."""
from pathlib import Path
from decimal import Decimal
import csv
import hashlib
import io
import json
import sys
import zipfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
DATA = ROOT / "apps/desktop/src/features/world-atlas/data"
RAW = ROOT / "apps/desktop/.tmp/atlas-remaining-40"
ID = "ndgain-climate"
URL = "https://gain.nd.edu/assets/647440/ndgain_countryindex_2026.zip"
GUIDE = "https://gain.nd.edu/assets/581554/nd_gain_countryindex_technicalreport_2024.pdf"
BASE_NOTE = "ND-GAIN-Ausgabe 2026, zusammengesetzte Modellindizes. Höhere Werte bedeuten eine größere Anfälligkeit oder einen größeren belastenden Beitrag. Der Anbieter skaliert und kombiniert Indikatoren; er interpoliert fehlende Zwischenjahre und kann Randwerte fortschreiben. Eine vollständige Linie ist keine jährlich gemessene Klimawirkung. Teilindikatoren und Sektoren können fehlen; die App übernimmt veröffentlichte Indizes ohne eigene Neugewichtung. Quellenrevisionen können die gesamte Geschichte ändern. Keine Schadenssumme, Eintrittswahrscheinlichkeit, Temperaturmessung oder Anlagebewertung. Quelle: Notre Dame Global Adaptation Initiative, University of Notre Dame."
EXPOSURE_NOTE = "Zeitlich konstantes Projektionsmodell für Klimaexposition. Die Teilmodelle verwenden unterschiedliche Szenarien, Basisperioden und Zukunftshorizonte, unter anderem 2030, die Jahrhundertmitte und das Jahrhundertende. Kein einheitliches Zukunftsjahr und keine beobachtete Entwicklung. Der Anbieter wiederholt denselben Modellwert in allen Archivjahren; hier wird nur ein einzelnes Vergleichsbild aus der letzten Archivspalte gezeigt."
SPECS = [
    ("vulnerability", "Klimatische Anfälligkeit · Gesamtmodell", "Wie sich die vom Anbieter modellierte Anfälligkeit gegenüber Klimafolgen entwickelt."),
    ("exposure", "Klimaexposition · Projektionen", "Wie stark ein Land im festen ND-GAIN-Modell künftigen Klimafolgen ausgesetzt ist."),
    ("sensitivity", "Empfindlichkeit gegenüber Klimafolgen", "Wie abhängig Bevölkerung und Versorgung von klimasensiblen Bedingungen sind."),
    ("capacity", "Anpassungskapazität · Belastungsbeitrag", "Wie stark begrenzte Anpassungsmöglichkeiten zur modellierten Anfälligkeit beitragen. Ein höherer Wert bedeutet hier geringere Kapazität."),
    ("food", "Klimatische Anfälligkeit · Ernährung", "Wie das Modell Klimaexposition, Empfindlichkeit und Anpassungsmöglichkeiten für die Ernährung zusammenfasst."),
    ("water", "Klimatische Anfälligkeit · Wasser", "Wie das Modell Klimaexposition, Empfindlichkeit und Anpassungsmöglichkeiten für die Wasserversorgung zusammenfasst."),
    ("health", "Klimatische Anfälligkeit · Gesundheit", "Wie das Modell Klimaexposition, Empfindlichkeit und Anpassungsmöglichkeiten im Gesundheitsbereich zusammenfasst."),
    ("ecosystems", "Klimatische Anfälligkeit · Ökosysteme", "Wie das Modell Klimaexposition, Empfindlichkeit und Anpassungsmöglichkeiten von Ökosystemleistungen zusammenfasst."),
    ("habitat", "Klimatische Anfälligkeit · Lebensraum", "Wie das Modell Klimaexposition, Empfindlichkeit und Anpassungsmöglichkeiten menschlicher Lebensräume zusammenfasst."),
    ("infrastructure", "Klimatische Anfälligkeit · Infrastruktur", "Wie das Modell Klimaexposition, Empfindlichkeit und Anpassungsmöglichkeiten der Infrastruktur zusammenfasst."),
]


def read(p):
    return json.loads(p.read_text(encoding="utf-8"))


def write(p, data):
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def digest(b):
    return hashlib.sha256(b).hexdigest()


def main():
    by_iso = {g["iso3"]: g for g in read(DATA / "catalog.json")["geographies"] if g.get("iso3")}
    raw = (RAW / "ndgain-2026.zip").read_bytes()
    archive = zipfile.ZipFile(io.BytesIO(raw))
    assert len(archive.namelist()) == len(set(archive.namelist())) == 550
    profiles = []
    labels = {}
    files = []
    metrics = []
    headers = ["ISO3", "Name"] + [str(y) for y in range(1995, 2025)]
    for code, label, explanation in SPECS:
        member = "resources 2/vulnerability/" + code + ".csv"
        content = archive.read(member)
        reader = csv.DictReader(io.StringIO(content.decode("utf-8-sig")))
        assert reader.fieldnames == headers
        rows = list(reader)
        assert len(rows) == 192
        names = {r["ISO3"]: r["Name"] for r in rows}
        assert len(names) == 192
        if labels:
            assert names == labels
        labels = names
        snapshot = code == "exposure"
        metric = {"id": ID + ":" + code, "sourceId": ID, "topicId": "environment:climate_exposure",
            "providerCode": code, "label": label, "unit": "Modellindex (0–1)", "frequency": "annual",
            "kind": "projection_snapshot" if snapshot else "modeled_estimate", "comparison": "same_definition",
            "connectAdjacent": not snapshot, "explanation": explanation,
            "scopeNote": (EXPOSURE_NOTE + " " if snapshot else "") + BASE_NOTE}
        metrics.append(metric)
        numeric = missing = selected = 0
        for row in rows:
            iso = row["ISO3"]
            assert iso in by_iso, iso
            values = [row[y] for y in headers[2:]]
            for v in values:
                if v:
                    n = Decimal(v)
                    assert v.strip() == v and n.is_finite() and 0 <= n <= 1
            if snapshot:
                assert len(set(values)) == 1 and values[0]
            points = []
            for year in (["2024"] if snapshot else headers[2:]):
                value = row[year] or None
                points.append({"period": year, "value": value,
                    "status": "Zeitlich konstantes Projektionsmodell" if snapshot else "ND-GAIN-Modellwert · Quelleninterpolation möglich",
                    "breakBefore": False, "notes": [EXPOSURE_NOTE] if snapshot else [],
                    "lowerBound": None, "upperBound": None})
            if not any(p["value"] is not None for p in points):
                missing += len(points)
                continue
            numeric += sum(p["value"] is not None for p in points)
            missing += sum(p["value"] is None for p in points)
            selected += 1
            profiles.append({"metricId": metric["id"], "geographyId": by_iso[iso]["id"], "providerArea": iso,
                "providerLabel": row["Name"], "providerTitle": "ND-GAIN 2026 | vulnerability/" + code + ".csv",
                "unit": metric["unit"], "points": points})
        files.append({"code": code, "member": member, "sha256": digest(content), "bytes": len(content),
            "rows": len(rows), "profiles": selected, "numeric": numeric, "missingCells": missing, "snapshot": snapshot})
    profiles.sort(key=lambda p: (p["metricId"], p["geographyId"]))
    areas = []
    for iso, label in sorted(labels.items()):
        areas.append({"code": iso, "label": label, "geographyId": by_iso[iso]["id"],
            "seriesTitles": {p["metricId"].split(":", 1)[1]: p["providerTitle"] for p in profiles if p["providerArea"] == iso}})
    source = {"id": ID, "label": "ND-GAIN · Klimatische Anfälligkeit", "adapter": "ndgain", "url": URL,
        "documentationUrl": GUIDE, "licenseUrl": "https://gain.nd.edu/our-work/country-index/download-data/",
        "publishedAt": "2026", "reviewedAt": "2026-09-11", "recipe": "ndgain-2026-original-indices-and-static-exposure-v1",
        "observationKind": "modeled_estimate", "expectedSha256": digest(raw), "expectedRows": sum(f["rows"] for f in files),
        "expectedNumeric": sum(f["numeric"] for f in files), "firstPeriod": "1995", "lastPeriod": "2024", "areas": areas}
    contract = {"sourceId": ID, "file": "ndgain-2026.zip", "url": URL, "headers": headers,
        "archiveEntries": len(archive.namelist()), "files": files, "labels": labels, "areas": areas,
        "expectedProfiles": len(profiles), "documentationSha256": digest((RAW / "ndgain-technical-2026.pdf").read_bytes())}
    audit = {"source": source, "metrics": metrics, "profiles": len(profiles), "contract": contract,
        "staticExposureRows": 192, "omittedRepeatedExposureCells": 192 * 29,
        "meaning": "Published modeled indices; only one exposure snapshot, never a fabricated climate history. All empty original rows remain without a numeric profile."}
    write(HERE / "public-ndgain-audit.json", audit)
    write(RAW / "ndgain-expected-profiles.json", profiles)
    write(RAW / "ndgain-contract-draft.json", contract)
    if "--apply" in sys.argv:
        public = read(DATA / "public-series-catalog.json")
        public["sources"] = [s for s in public["sources"] if s["id"] != ID] + [source]
        public["metrics"] = [m for m in public["metrics"] if m["sourceId"] != ID] + metrics
        public["version"] = "2026-09-11.14"
        write(DATA / "public-series-catalog.json", public)
        write(DATA / "public-ndgain-contract.json", contract)
        ledger = read(HERE / "remaining-40-ledger.json")
        topic = next(t for t in ledger["topics"] if t["id"] == "environment:climate_exposure")
        if topic["status"] != "implemented_native_verified":
            topic["status"] = "source_validated"
            topic["research"] = [{"sourceId": ID, "reviewedAt": "2026-09-11", "evidence": "public-ndgain-audit.json"}]
        write(HERE / "remaining-40-ledger.json", ledger)
    print(json.dumps({"areas": len(areas), "profiles": len(profiles), "numeric": source["expectedNumeric"], "files": [{k:v for k,v in f.items() if k in ("code","numeric","profiles","missingCells")} for f in files]}))


if __name__ == "__main__":
    main()
