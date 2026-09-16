"""Build reviewed IEA battery chart contracts from the original public HTML.

Hash only the identified chart payload: unrelated page recommendations can change.
CSV, chart options, units, credit and historical/scenario attributes are included.
No plotted coordinates, rounded article totals or forecasts become observations.
"""
import csv
import hashlib
import io
import json
from pathlib import Path

from bs4 import BeautifulSoup
from build_gap_sources import DATA, RAW, EXPECTED, HERE, write, area, point, profile

ATTRS = ["identifier", "csv", "chartoptions", "units", "credit", "crediturl", "lasthistoricalyear", "futurescenariolabel"]
TOPIC = "energy:battery_storage"


def build():
    config = json.loads((DATA / "public-series-catalog.json").read_text("utf-8"))
    # Use the already registered battery topic, independently of its display name.
    topic = next(m["topicId"] for m in config["metrics"] if m["sourceId"] == "eia-battery-storage")
    sources, metrics, contracts, audit = [], [], {}, []
    extra = json.loads((DATA / "public-geographies.json").read_text("utf-8"))
    for code, label in [("europe", "Europa · IEA-Batteriebericht"), ("rest", "Übrige Welt · IEA-Batteriebericht")]:
        ident = "iea-storage:" + code
        if not any(g["id"] == ident for g in extra):
            extra.append(dict(id=ident, label=label, iso3="", regionId="Unassigned", kind="aggregate"))
    choices = [
        ("iea-battery-world", "global-battery-storage-capacity-additions-2020-2025", "Welt · Batterie-Zubau 2020–2025", "2026", [("World", "world", list(range(2020, 2026)))]),
        ("iea-battery-region", "battery-storage-capacity-additions-by-region-2023-2025", "Regionen · Batterie-Zubau 2023–2025", "2026", [("China", "m49:156", [2023, 2024, 2025]), ("United States", "m49:840", [2023, 2024, 2025]), ("Europe", "iea-storage:europe", [2023, 2024, 2025]), ("Rest of world", "iea-storage:rest", [2023, 2024, 2025])]),
        ("iea-battery-2010-2023", "global-battery-storage-capacity-additions-2010-2023", "Welt · Batterie-Zubau 2010–2023, Stand 2024", "2024", [("World", "world", list(range(2010, 2024)))])
    ]
    for sid, slug, label, published, groups in choices:
        filename = sid + ".html"
        soup = BeautifulSoup((RAW / filename).read_text("utf-8"), "html.parser")
        nodes = soup.select(f'[data-chart-identifier="{slug}"][data-chart-csv]')
        assert len(nodes) == 1
        node = nodes[0]
        values = [node["data-chart-" + a].replace("\r\n", "\n") for a in ATTRS]
        assert node["data-chart-units"] == "GW" and "CC BY 4.0" in node["data-chart-credit"]
        assert not node["data-chart-lasthistoricalyear"] and not node["data-chart-futurescenariolabel"]
        payload = "\0".join(values).encode("utf-8")
        digest = hashlib.sha256(payload).hexdigest()
        old = sid.endswith("2010-2023")
        delimiter = "," if old else ";"
        rows = list(csv.reader(io.StringIO(values[1]), delimiter=delimiter))
        headers = rows[0]
        assert headers == (["", "Battery storage capacity additions "] if old else ["", "Utility-scale", "Behind-the-meter"])
        if len(groups) > 1:
            options = json.loads(values[2].replace('\\"', '"'))
            boundaries = options["xAxis"]["plotLines"]
            assert [(b["label"]["text"], b["value"]) for b in boundaries] == [(g[0], i * 3 - .5) for i, g in enumerate(groups)]
        scope = "IEA, veröffentlichter jährlicher Zubau stationärer Batteriespeicher in GW elektrischer Leistung. Kein kumulierter Anlagenbestand und keine gespeicherte Energie in GWh. Großspeicher und Anlagen hinter dem Zähler bleiben getrennt. Gerundete Quellenstatistik mit Schätzungen; eine veröffentlichte 0,0 ist keine Aussage über vollständige Abwesenheit. Eigene Summen oder Länderableitungen aus Regionswerten werden nicht erzeugt."
        scope += " Veröffentlichung 2024; ältere Datenrevision, getrennt vom Global Energy Review 2026. Unterschiede in überlappenden Jahren sind Revisionen, keine zusammenhängende Reihe." if old else " Global Energy Review 2026, historische Angaben bis 2025. Europa und übrige Welt sind eigene IEA-Quellengebiete und keine UN-Regionen."
        ms = []
        for i, code in enumerate(["total"] if old else ["utility", "behind_meter"], 1):
            m = dict(id=sid+":"+code, sourceId=sid, topicId=topic, providerCode=code, label=("Batterie-Zubau insgesamt · Stand 2024" if old else "Batterie-Zubau · " + ("Großspeicher" if i == 1 else "hinter dem Zähler")), unit="GW zusätzlicher Leistung pro Jahr", frequency="annual", kind="source_statistic", comparison="same_definition", connectAdjacent=True, explanation="Veröffentlichter jährlicher Leistungszubau stationärer Batteriespeicher.", scopeNote=scope)
            metrics.append(m); ms.append(m)
        areas, profiles = [], []
        cursor = 1
        for idx, (name, geo, years) in enumerate(groups):
            a = area(str(idx), name, geo, {m["providerCode"]: headers[i+1].strip() for i, m in enumerate(ms)})
            block = rows[cursor:cursor+len(years)]
            assert [int(r[0]) for r in block] == years
            assert all(len(r) == len(headers) and all(float(v) >= 0 for v in r[1:]) for r in block)
            profiles += [profile(m, a, [point(r[0], r[i+1], "estimated") for r in block]) for i, m in enumerate(ms)]
            areas.append(a); cursor += len(years)
        assert cursor == len(rows)
        url = "https://www.iea.org/data-and-statistics/charts/" + slug
        s = dict(id=sid, label="IEA · "+label, adapter="iea_battery_chart", url=url, documentationUrl=url, licenseUrl=node["data-chart-crediturl"], publishedAt=published, reviewedAt="2026-09-15", recipe=sid+"-identified-chart-payload-v1", observationKind="source_estimates", expectedSha256=digest, expectedRows=len(rows)-1, expectedNumeric=sum(len(p["points"]) for p in profiles), firstPeriod=min(p["period"] for r in profiles for p in r["points"]), lastPeriod=max(p["period"] for r in profiles for p in r["points"]), areas=areas)
        sources.append(s)
        contracts[sid] = dict(slug=slug, attributes=ATTRS, delimiter=delimiter, headers=headers, groups=[dict(label=name, years=years) for name, _, years in groups], sourceFile=filename)
        write(EXPECTED / (sid+".json"), profiles)
        audit.append(dict(sourceId=sid, sourceFile=filename, canonicalSha256=digest, wholeHtmlSha256=hashlib.sha256((RAW/filename).read_bytes()).hexdigest(), numeric=s["expectedNumeric"], profiles=len(profiles), firstPeriod=s["firstPeriod"], lastPeriod=s["lastPeriod"]))
    ids = {s["id"] for s in sources}
    config["sources"] = [s for s in config["sources"] if s["id"] not in ids] + sources
    config["metrics"] = [m for m in config["metrics"] if m["sourceId"] not in ids] + metrics
    write(DATA/"public-series-catalog.json", config)
    write(DATA/"public-battery-contracts.json", contracts)
    write(DATA/"public-geographies.json", extra)
    write(HERE/"battery-expansion-sources-2026-09-15.json", audit)
    print(json.dumps(audit, indent=2))


if __name__ == "__main__":
    build()
