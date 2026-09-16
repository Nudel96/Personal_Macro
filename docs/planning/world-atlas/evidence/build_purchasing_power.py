"""Validate the April-2026 WDI replacement, then add its two distinct perspectives."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
DATA = ROOT / "apps/desktop/src/features/world-atlas/data"
RAW = ROOT / "apps/desktop/.tmp/atlas-remaining-40"
HERE = Path(__file__).resolve().parent


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


catalog = read(DATA / "catalog.json")
statistics = read(DATA / "statistics-catalog.json")
metadata = {r["id"]: r for r in read(RAW / "wdi-indicators-current.json")[1]}
geo = {g["iso3"]: g for g in catalog["geographies"] if g["iso3"]}
assert "PA.NUS.PPPC.RF" not in metadata, "The old ratio must remain outside the current WDI source."
definitions = []
audits = []
for code, title, label, meaning, boundary in [
    ("PA.NUS.GDP.PLI", "Price level index (GDP)", "Preisniveau · Gesamtwirtschaft",
     "Wie hoch das allgemeine Preisniveau eines Landes gegenüber den USA im selben Jahr ist.",
     "Bezieht sich auf die gesamte Wirtschaftsleistung einschließlich Konsum und Investitionen. Kein persönlicher Warenkorb."),
    ("PA.NUS.PRVT.PLI", "Price level index (Households and NPISHs Final consumption expenditure)",
     "Preisniveau · privater Konsum",
     "Wie sich das Preisniveau des privaten Konsums zwischen Ländern und gegenüber den USA unterscheidet.",
     "Haushalte einschließlich privater Organisationen ohne Erwerbszweck im Dienst der Haushalte (NPISHs). Kein individuelles Haushaltsbudget und keine Messung verfügbarer Einkommen."),
]:
    meta = metadata[code]
    assert meta["source"]["id"] == "2" and meta["name"] == title
    assert "set equal to 100" in meta["sourceNote"]
    payload = read(RAW / f"{code}.json")
    assert payload[0]["sourceid"] == "2" and payload[0]["pages"] == 1
    assert payload[0]["total"] == len(payload[1])
    numeric = []
    seen = set()
    for row in payload[1]:
        assert row["indicator"] == {"id": code, "value": title}
        key = row["country"]["id"], row["date"]
        assert key not in seen
        seen.add(key)
        if row["value"] is not None:
            assert 1990 <= int(row["date"]) <= 2025 and row["value"] > 0
            numeric.append(row)
            if row["countryiso3code"] == "USA":
                assert row["value"] == 100
    assert not any(r["countryiso3code"] == "WLD" for r in numeric)
    definition = {
        "id": f"worldbank:2:{code}", "topicId": "macro:purchasing_power",
        "sourceId": "worldbank_wdi", "providerCode": code, "label": label,
        "providerLabel": title, "unit": "price_level_us100",
        "observationKind": "modeled_estimate", "throughYear": 2025,
        "explanation": meaning,
        "scopeNote": boundary + " USA = 100 in jedem Jahr; über 100 bedeutet ein höheres, unter 100 ein niedrigeres Preisniveau. ICP-Vergleichsjahre und fortgeschriebene Kaufkraftparitäten bilden gemeinsam diese Quellenreihe; insbesondere 2025 ist fortgeschrieben. Wechselkurse beeinflussen den Verlauf. Keine jährlich vollständig neu erhobene Preiswelle, Inflationsrate oder faire Wechselkursbewertung. Die im April 2026 ersetzte GDP-Quotenreihe mit USA = 1 wird nicht angehängt. Keine eigene Welt- oder Regionalmittelung.",
    }
    definitions.append(definition)
    codes = sorted({r["countryiso3code"] for r in numeric})
    audits.append({
        "id": definition["id"], "providerMetadata": meta, "responseMetadata": payload[0],
        "originalUrl": f"https://api.worldbank.org/v2/country/all/indicator/{code}?format=json&source=2&per_page=20000",
        "sha256": hashlib.sha256((RAW / f"{code}.json").read_bytes()).hexdigest(),
        "numericValues": len(numeric), "sourceAreaCount": len(codes),
        "mappedAreas": [{"code": c, "geographyId": geo[c]["id"]} for c in codes if c in geo],
        "unmappedAreas": [c for c in codes if c not in geo],
        "firstYear": min(int(r["date"]) for r in numeric),
        "lastYear": max(int(r["date"]) for r in numeric),
        "usaReference": "Every numeric United States value is exactly 100; no world value is supplied.",
    })
ids = {d["id"] for d in definitions}
for target in (catalog, statistics):
    target["series"] = [r for r in target["series"] if r["id"] not in ids] + definitions
    target["version"] = "2026-09-11.4"
write(DATA / "catalog.json", catalog)
write(DATA / "statistics-catalog.json", statistics)
evidence = {"reviewedAt": "2026-09-11", "releaseNote": "https://datatopics.worldbank.org/world-development-indicators/release-note/apr-2026.html", "methodology": "https://www.worldbank.org/en/programs/icp/faq", "license": "https://datacatalog.worldbank.org/public-licenses#cc-by", "series": audits}
write(HERE / "purchasing-power-audit.json", evidence)
ledger = read(HERE / "remaining-40-ledger.json")
topic = next(t for t in ledger["topics"] if t["id"] == "macro:purchasing_power")
topic["research"] = [{"sourceId": "worldbank_wdi", "reviewedAt": "2026-09-11", "evidence": "purchasing-power-audit.json", "finding": "Two current WDI price-level perspectives, USA=100, annual source estimates through 2025. Old ratio is now archive-only and excluded."}]
if topic["status"] == "research_pending":
    topic["status"] = "source_validated"
write(HERE / "remaining-40-ledger.json", ledger)
print(json.dumps({"series": [{"id": r["id"], "values": r["numericValues"], "areas": r["sourceAreaCount"], "unmapped": r["unmappedAreas"]} for r in audits]}))
