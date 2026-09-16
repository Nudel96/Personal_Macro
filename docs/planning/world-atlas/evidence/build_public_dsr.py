"""Validate the complete BIS DSR release and build its explicit source contract."""
from collections import defaultdict
from decimal import Decimal
from pathlib import Path
import csv
import hashlib
import io
import json
import re
import zipfile

ROOT = Path(__file__).resolve().parents[4]
DATA = ROOT / "apps/desktop/src/features/world-atlas/data"
CACHE = ROOT / "apps/desktop/.tmp/atlas-remaining-40"
EVIDENCE = Path(__file__).resolve().parent


def build():
    original = (CACHE / "WS_DSR.zip").read_bytes()
    with zipfile.ZipFile(io.BytesIO(original)) as z:
        assert z.namelist() == ["WS_DSR_csv_flat.csv"]
        reader = csv.DictReader(io.StringIO(z.read(z.namelist()[0]).decode("utf-8-sig")))
        rows = list(reader)
    areas = {a["code"]: a for a in json.loads((DATA / "debt-catalog.json").read_text(encoding="utf-8"))["areas"]}
    groups = defaultdict(dict)
    titles = {}
    identities = {}
    fixed = {
        "STRUCTURE": "dataflow", "STRUCTURE_ID": "BIS:WS_DSR(1.0): Debt service ratios",
        "ACTION": "I", "FREQ:Frequency": "Q: Quarterly", "COLLECTION:Collection Indicator": "",
        "UNIT_MEASURE:Unit of measure": "367: Per cent", "UNIT_MULT:Unit Multiplier": "0: Units",
        "DECIMALS:Decimals": "1: One", "OBS_CONF:Observation confidentiality": "F: Free",
        "OBS_PRE_BREAK:Pre-Break Observation": "", "OBS_STATUS:Observation Status": "A: Normal value",
    }
    borrowers = {"P": "Private non-financial sector", "H": "Households & NPISHs", "N": "Non-financial corporations"}
    for r in rows:
        assert all(r[key] == value for key, value in fixed.items())
        code, label = r["BORROWERS_CTY:Borrowers' country"].split(": ", 1)
        assert code in areas and areas[code]["label"] == label, (code, label)
        b, borrower = r["DSR_BORROWERS:Borrowers"].split(": ", 1)
        assert borrowers[b] == borrower
        period, raw = r["TIME_PERIOD:Time period or range"], r["OBS_VALUE:Observation Value"]
        assert re.fullmatch(r"\d{4}-Q[1-4]", period) and "1999-Q1" <= period <= "2025-Q4"
        value = Decimal(raw)
        assert value.is_finite() and value >= 0 and value.as_tuple().exponent >= -1
        assert period not in groups[code, b]
        groups[code, b][period] = raw
        title = r["TITLE_TS:Title (tseries level)"]
        assert (code, b) not in titles or titles[code, b] == title
        titles[code, b] = title
        identities[code] = label
    assert len(rows) == 7116 and len(groups) == 66 and len(identities) == 32
    metrics = []
    labels = {"P": "Privater Sektor · Schuldendienst", "H": "Haushalte · Schuldendienst", "N": "Unternehmen · Schuldendienst"}
    descriptions = {
        "P": "Geschätzter Anteil des Einkommens für Zins und Tilgung des privaten nichtfinanziellen Sektors.",
        "H": "Geschätzter Anteil des Einkommens für Zins und Tilgung privater Haushalte einschließlich privater Organisationen ohne Erwerbszweck.",
        "N": "Geschätzter Anteil des Einkommens nichtfinanzieller Unternehmen, der für Zins und Tilgung verwendet wird.",
    }
    for b in ["P", "H", "N"]:
        metrics.append({"id": f"bis-dsr:{b}", "sourceId": "bis-dsr", "topicId": "finance:debt_service",
                        "providerCode": b, "label": labels[b], "unit": "% des Einkommens", "frequency": "quarterly",
                        "kind": "numeric", "comparison": "within_country", "connectAdjacent": True,
                        "explanation": descriptions[b], "scopeNote": "BIS-Modell mit Annahmen zu Zinsen und Restlaufzeiten. Die absolute Höhe eignet sich nur eingeschränkt zum Ländervergleich; hier wird die Entwicklung des gewählten Landes gezeigt. Keine Quote zum BIP, keine Staatsverschuldung und keine faire Marktbewertung."})
    source = {"id": "bis-dsr", "label": "BIS · Schuldendienst", "adapter": "bis_dsr",
              "url": "https://data.bis.org/static/bulk/WS_DSR_csv_flat.zip", "documentationUrl": "https://data.bis.org/topics/DSR",
              "licenseUrl": "https://data.bis.org/help/legal", "publishedAt": "2026-06-15", "reviewedAt": "2026-09-11",
              "recipe": "bis-dsr-original-quarterly-2026-06-v1", "observationKind": "modeled_estimate",
              "expectedSha256": hashlib.sha256(original).hexdigest(), "expectedRows": len(rows), "expectedNumeric": len(rows),
              "firstPeriod": "1999-Q1", "lastPeriod": "2025-Q4", "areas": []}
    evidence = {"source": source["url"], "sha256": source["expectedSha256"], "release": source["publishedAt"], "rows": len(rows), "numericValues": len(rows), "headers": reader.fieldnames, "fixedFields": fixed, "series": []}
    for code, label in sorted(identities.items()):
        owned = {b: titles[code, b] for b in borrowers if (code, b) in groups}
        source["areas"].append({"code": code, "label": label, "geographyId": areas[code]["geographyId"], "seriesTitles": owned})
        for b in owned:
            p = groups[code, b]
            evidence["series"].append({"area": code, "geographyId": areas[code]["geographyId"], "borrower": b, "title": owned[b], "count": len(p), "first": min(p), "last": max(p), "firstValue": p[min(p)], "lastValue": p[max(p)]})
    destination = DATA / "public-series-catalog.json"
    contract = json.loads(destination.read_text(encoding="utf-8")) if destination.exists() else {"version": "2026-09-11.1", "sources": [], "metrics": []}
    contract["sources"] = [s for s in contract["sources"] if s["id"] != source["id"]] + [source]
    contract["metrics"] = [m for m in contract["metrics"] if m["sourceId"] != source["id"]] + metrics
    destination.write_text(json.dumps(contract, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (EVIDENCE / "public-dsr-audit.json").write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    ledger_path = EVIDENCE / "remaining-40-ledger.json"
    ledger = json.loads(ledger_path.read_text(encoding="utf-8"))
    entry = next(t for t in ledger["topics"] if t["id"] == "finance:debt_service")
    entry["status"] = "source_validated"
    entry["research"] = [{"date": "2026-09-11", "url": source["documentationUrl"], "dataUrl": source["url"], "evidence": "public-dsr-audit.json", "finding": "7.116 Originalwerte, 66 Quartalsreihen für 32 Länder; Haushalte/Unternehmen nur für 17. Absoluter Ländervergleich wird nicht als gleichartig dargestellt."}]
    ledger_path.write_text(json.dumps(ledger, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"areas": len(identities), "series": len(groups), "observations": len(rows), "sha256": source["expectedSha256"]}))


if __name__ == "__main__":
    build()
