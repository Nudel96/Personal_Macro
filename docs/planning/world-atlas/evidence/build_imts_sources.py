"""Original IMF IMTS partner flows; explicit counterpart selection and area aliases."""
import collections
import csv
import hashlib
import json
import sys
from xml.etree import ElementTree as ET
from build_gap_sources import DATA, RAW, EXPECTED, HERE, write, area, point, profile

PARTNERS = ["USA", "CHN", "DEU", "GBR", "FRA", "JPN", "IND", "BRA", "SAU", "ZAF", "NGA", "AUS"]
ACCEPT = "application/vnd.sdmx.data+csv;version=2.0.0;labels=both"

def build():
    config = json.loads((DATA / "public-series-catalog.json").read_text("utf-8"))
    catalog = json.loads((DATA / "catalog.json").read_text("utf-8"))
    geos = {g["iso3"]: g for g in catalog["geographies"] if g["iso3"]}
    ns = {"s": "http://www.sdmx.org/resources/sdmxml/schemas/v2_1/structure", "c": "http://www.sdmx.org/resources/sdmxml/schemas/v2_1/common"}
    xml = ET.parse(RAW / "imf-imts-flow.xml")
    def english(node):
        return next(n.text for n in node.findall("c:Name", ns) if n.attrib.get("{http://www.w3.org/XML/1998/namespace}lang") == "en")
    codelists = {l.attrib["id"]: {c.attrib["id"]: english(c) for c in l.findall("s:Code", ns)} for l in xml.findall(".//s:Codelist", ns)}
    countries = codelists["CL_IMTS_COUNTRY"]
    indicators = codelists["CL_IMTS_INDICATOR"]
    sources, metrics, contracts, audit = [], [], {}, []
    topic = next(m["topicId"] for m in config["metrics"] if m["sourceId"] == "oecd-tiva-partners")
    for partner in PARTNERS:
        sid = "imf-imts-" + partner.lower()
        file = RAW / f"imts-{partner}.csv"
        rows = list(csv.DictReader(file.read_text("utf-8").splitlines()))
        labels = {r["COUNTRY"]: countries[r["COUNTRY"]] for r in rows}
        mapping = {c: geos[c]["id"] for c in labels if c in geos}
        # Original IMF country labels stay visible. No historical successor mapping.
        if "KOS" in labels: mapping["KOS"] = geos["XKX"]["id"]
        if "WBG" in labels: mapping["WBG"] = geos["PSE"]["id"]
        scope = f"IWF IMTS: jährlicher Warenhandel des gewählten Berichtslands mit {geos[partner]['label']}, historische Angaben 1960–2025. Auswahl von zwölf Partnerländern, kein vollständiges Ranking aller Handelspartner. Quellenwerte in laufenden US-Dollar; SCALE=6 beschreibt die Anzeige in Millionen, der gelieferte OBS_VALUE bleibt unverändert in USD. Exporte FOB und Importe CIF sind unterschiedliche Bewertungen. Partnerstatistiken können wegen Bewertung, Zuordnung und Meldezeit voneinander abweichen. Keine TiVA-Wertschöpfungsanteile und keine aus Spiegelmeldungen selbst berechneten Ersatzwerte. Quellenkennzeichen e bleibt als Schätzung sichtbar; fehlende Jahre werden nicht aufgefüllt. Historische Staaten und IWF-Aggregate sind ausgeschlossen; Kosovo (KOS) und Westbank/Gaza (WBG) behalten ihre originalen Gebietsbezeichnungen."
        ms = {}
        for code in ["XG_FOB_USD", "MG_CIF_USD"]:
            m = dict(id=sid+":"+code, sourceId=sid, topicId=topic, providerCode=code, label=("Exporte nach " if code.startswith("XG") else "Importe aus ")+geos[partner]["label"]+(" · FOB" if code.startswith("XG") else " · CIF"), unit="Laufende US-Dollar", frequency="annual", kind="source_statistic", comparison="same_definition", connectAdjacent=False, explanation="Veröffentlichter Bruttowarenhandel des Berichtslands mit dem ausgewählten Partnerland.", scopeNote=scope)
            metrics.append(m); ms[code] = m
        groups = collections.defaultdict(list); titles = collections.defaultdict(dict); seen = set()
        for r in rows:
            assert r["DATAFLOW"] == "IMF.STA:IMTS(1.0.0)" and r["COUNTERPART_COUNTRY"] == partner
            assert r["INDICATOR"] in ms and r["FREQUENCY"] == "A" and r["UNIT"] == "USD" and r["SCALE"] == "6"
            assert r["SERIES_NAME"] == indicators[r["INDICATOR"]] and r["DERIVATION_TYPE"] == "M" and r["OVERLAP"] == "OL"
            assert r["STATUS"] in {"", "e"} and r["TRADE_FLOW"] == r["INDICATOR"].split("_")[0] and r["VALUATION"] == r["INDICATOR"].split("_")[1]
            assert 1960 <= int(r["TIME_PERIOD"]) <= 2025 and float(r["OBS_VALUE"]) >= 0
            if r["COUNTRY"] not in mapping: continue
            key = (r["COUNTRY"], r["INDICATOR"], r["TIME_PERIOD"]); assert key not in seen; seen.add(key)
            notes = ["Partner: "+countries[partner]+" ("+partner+")", "Bewertung: "+r["VALUATION"], "Quelle: "+r["SHORT_SOURCE_CITATION"]]
            if r["STATUS"] == "e": notes.append("e: IWF-Schätzung")
            groups[key[:2]].append(point(r["TIME_PERIOD"], r["OBS_VALUE"], "estimated" if r["STATUS"] == "e" else "source_statistics", notes))
            titles[r["COUNTRY"]][r["INDICATOR"]] = r["SERIES_NAME"]
        areas = [area(c, labels[c], mapping[c], titles[c]) for c in sorted(titles)]
        assert len({a['geographyId'] for a in areas}) == len(areas)
        profiles = [profile(ms[code], a, sorted(groups[(a['code'], code)], key=lambda p:p['period'])) for a in areas for code in sorted(a['seriesTitles'])]
        numeric = sum(len(r['points']) for r in profiles)
        url = f"https://api.imf.org/external/sdmx/2.1/data/IMF.STA,IMTS,1.0.0/.XG_FOB_USD+MG_CIF_USD.{partner}.A?startPeriod=1960&endPeriod=2025"
        s = dict(id=sid, label="IWF · Warenhandel mit "+geos[partner]['label'], adapter="imf_imts", url=url, documentationUrl="https://data.imf.org/en/datasets/IMF.STA:IMTS", licenseUrl="https://www.imf.org/external/terms.htm", publishedAt=max(r['UPDATE_DATE'] for r in rows)[:10], reviewedAt="2026-09-15", recipe=sid+"-reviewed-20260915-v1", observationKind="source_estimates", expectedSha256=hashlib.sha256(file.read_bytes()).hexdigest(), expectedRows=len(rows), expectedNumeric=numeric, firstPeriod=min(r['TIME_PERIOD'] for r in rows), lastPeriod=max(r['TIME_PERIOD'] for r in rows), areas=areas)
        sources.append(s)
        contracts[sid] = dict(partner=partner, partnerLabel=countries[partner], accept=ACCEPT, headers=list(rows[0]), allCountries=labels, excludedCountries={c:l for c,l in labels.items() if c not in mapping}, titles=indicators, sourceCitations=sorted({r['SHORT_SOURCE_CITATION'] for r in rows}), sourceFile=file.name)
        write(EXPECTED / (sid+'.json'), profiles)
        geo_set={a['geographyId'] for a in areas}
        audit.append(dict(sourceId=sid, sourceFile=file.name, sha256=s['expectedSha256'], metadataSha256=hashlib.sha256((RAW/'imf-imts-flow.xml').read_bytes()).hexdigest(), rows=len(rows), numeric=numeric, profiles=len(profiles), areasWithValues=len(areas), africanCountriesWithValues=sum(g['id'] in geo_set and g['regionId']=='Africa' for g in geos.values()), firstPeriod=s['firstPeriod'], lastPeriod=s['lastPeriod']))
    ids={s['id'] for s in sources}
    config['sources']=[s for s in config['sources'] if s['id'] not in ids]+sources
    config['metrics']=[m for m in config['metrics'] if m['sourceId'] not in ids]+metrics
    write(DATA/'public-series-catalog.json',config)
    write(DATA/'public-imts-contracts.json',contracts)
    write(HERE/'imts-source-audit-2026-09-15.json',audit)
    print(json.dumps(audit,ensure_ascii=False,indent=2))

if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    build()
