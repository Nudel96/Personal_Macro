"""Build inspectable planning artifacts from the already completed public probes.

No network requests and no app data access. Also validates catalog references.
"""
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
CATALOGS = ROOT / "catalogs"

SEED_MAP = {
    "SP.POP.TOTL": ("demography:population", "persons", "development", "unknown"),
    "SP.POP.65UP.TO.ZS": ("demography:age_structure", "percent_population", "structure", "unknown"),
    "SP.DYN.TFRT.IN": ("demography:fertility", "births_per_woman", "development", "unknown"),
    "SP.URB.TOTL.IN.ZS": ("demography:urbanization", "percent_population", "structure", "unknown"),
    "NY.GDP.PCAP.KD": ("macro:output_per_capita", "constant_2015_usd_per_person", "development", "unknown"),
    "SL.UEM.TOTL.ZS": ("labor:unemployment", "percent_labor_force", "development", "modeled_estimate"),
    "SE.SEC.ENRR": ("education:secondary_school", "percent_gross_enrollment", "development", "unknown"),
    "EG.ELC.ACCS.ZS": ("electricity:electricity_access", "percent_population", "structure", "unknown"),
    "NV.IND.MANF.ZS": ("macro:manufacturing_share", "percent_gdp", "structure", "unknown"),
    "IT.NET.USER.ZS": ("digital:internet", "percent_population", "structure", "unknown"),
}


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main():
    report = json.loads((HERE / "source-readiness.json").read_text(encoding="utf-8"))
    topics = json.loads((CATALOGS / "topics.json").read_text(encoding="utf-8"))
    sources = json.loads((CATALOGS / "sources.json").read_text(encoding="utf-8"))
    geographies = json.loads((CATALOGS / "geographies.json").read_text(encoding="utf-8"))
    domains = {d["id"] for d in topics["domains"]}
    source_ids = {s["id"] for s in sources["sources"]}
    topic_ids = [g["id"] + ":" + t[0] for g in topics["groups"] for t in g["topics"]]
    assert len(domains) == len(topics["domains"]), "Duplicate domain"
    assert len(source_ids) == len(sources["sources"]), "Duplicate source"
    assert len({g["id"] for g in topics["groups"]}) == len(topics["groups"]), "Duplicate group"
    assert len(set(topic_ids)) == len(topic_ids), "Duplicate topic"
    for group in topics["groups"]:
        assert group["domainId"] in domains, group["id"]
        assert set(group["sourceCandidates"]) <= source_ids, group["id"]
        assert all(len(t) == 2 and t[0] and t[1] for t in group["topics"]), group["id"]
    samples = [c for c in report["checks"] if c["check"] == "worldbank_indicator_sample" and c["status"] == "passed"]
    seed = []
    for sample in samples:
        topic, unit, view, observation = SEED_MAP[sample["indicator"]]
        assert topic in topic_ids, topic
        seed.append({
            "id": "worldbank:2:" + sample["indicator"],
            "sourceId": "worldbank_wdi", "providerDatasetId": "2", "providerIndicatorId": sample["indicator"],
            "topicId": topic, "labelDe": sample["labelDe"], "providerLabel": sample["providerName"],
            "frequency": "annual", "canonicalUnit": unit, "defaultView": view,
            "observationKind": observation,
            "coverageStatus": "sample_tested_not_globally_audited_not_implemented",
            "probeCountryIso3": [c["iso3"] for c in sample["countries"]],
            "numericUrl": sample["provenance"]["url"], "metadataUrl": sample["metadataProvenance"]["url"],
            "checkedAt": sample["provenance"]["retrievedAt"],
            "sourceOrganization": sample["sourceOrganization"],
            "notes": [
                "Zeitraum und Datenstand werden je Gebiet aus tatsächlichen Beobachtungen bestimmt.",
                "Eine geprüfte Stichprobe belegt keine Implementierung und keine weltweite Vollständigkeit.",
                "Unklare Beobachtungsart vor Produktfreigabe über Quellenmetadaten auflösen; nicht aus dem Bezugsjahr ableiten.",
            ],
        })
    write_json(CATALOGS / "series-seed.json", {"schemaVersion": 1, "status": "planning_seed", "series": seed})
    geo_check = next(c for c in report["checks"] if c["check"] == "un_m49_geography_catalog")
    global_check = next(c for c in report["checks"] if c["check"] == "worldbank_global_population_2023")
    assert len(geographies["areas"]) == geo_check["areas"]
    assert len(set(a["id"] for a in geographies["areas"])) == len(geographies["areas"])
    assert all(geo_check["requestedCountriesPresent"].values())
    failed = [c for c in report["checks"] if c["status"] != "passed"]
    overview = {
        "domains": len(domains), "groups": len(topics["groups"]), "topics": len(topic_ids),
        "sourceRecords": len(source_ids), "statisticalAreas": len(geographies["areas"]),
        "sampledIndicatorFamilies": len(samples), "sampledCountrySeries": sum(len(c["countries"]) for c in samples),
        "sourceChecksPassed": len(report["checks"]) - len(failed), "sourceChecksFailed": len(failed),
        "catalogValidation": "passed", "applicationImplementation": "not_started",
    }
    write_json(HERE / "planning-validation.json", overview)
    lines = [
        "# Quellenbereitschaft – tatsächliche Planungsevidenz", "",
        f"Erzeugt aus den Abrufen vom {report['checkedAt']}. Keine Produktionsadapter wurden hiermit abgenommen.", "",
        "## Umfang und Ergebnis", "",
        f"- {overview['domains']} Hauptfelder, {overview['groups']} Gruppen und {overview['topics']} Themen sind im Planungskatalog enthalten.",
        f"- {overview['sourceRecords']} Quellen-/Quellenfamilieneinträge; generische Kandidaten sind ausdrücklich so markiert.",
        f"- {geo_check['areas']} UN-M49-Gebiete eingelesen; IDs und ISO3 eindeutig, die vier ausdrücklich genannten Länder vorhanden.",
        f"- Bevölkerung 2023: {global_check['areasWithValues']} von {global_check['providerNonAggregateAreas']} nicht aggregierten World-Bank-Gebieten mit Wert.",
        f"- {len(samples)} Reihenfamilien, {overview['sampledCountrySeries']} Land-Reihe-Stichproben; jede mit Beginn, Ende und internen Lücken.",
        "- JSON-Struktur, IDs, Eltern, Quellenreferenzen und Verweise der Startreihen lokal validiert.",
        "- Keine Aussage über allgemeine weltweite Themenvollständigkeit, aktuelle native Funktion oder verlässliche Anlageprognosen.", "",
        "## Länderstichprobe", "",
        "| Reihe | Deutschland | USA | Indien | China | Länder mit internen Lücken (von zwölf) |", "| --- | --- | --- | --- | --- | --- |",
    ]
    for sample in samples:
        by_country = {c["iso3"]: c for c in sample["countries"]}
        cells = []
        for code in ["DEU", "USA", "IND", "CHN"]:
            c = by_country[code]
            cells.append(f"{c['firstYear']}–{c['lastYear']}" if c["firstYear"] is not None else "keine Werte")
        gaps = sum(bool(c["internalMissingYears"]) for c in sample["countries"])
        lines.append("| " + " | ".join([sample["labelDe"], *cells, str(gaps)]) + " |")
    lines += [
        "", "Ein Zeitbereich in der Tabelle belegt nicht automatisch eine lückenlose Reihe. Die letzten Spalten und die JSON-Details zeigen interne Lücken.",
        "", "## Auswirkung auf die Planung", "",
        "- **Hohe Relevanz:** Chinas geprüfte Bildungsreihe endet 2012. Deshalb UNESCO prüfen und keine aktuelle Bildungswelle aus dieser WDI-Reihe konstruieren.",
        "- **Hohe Relevanz:** Die US-Reihe zum verarbeitenden Gewerbe endet 2021. Ein heutiger Vergleich braucht einen gemeinsamen historischen Zeitpunkt oder eine getrennt geprüfte Aktualisierung.",
        "- **Hohe Relevanz:** Die Arbeitslosenreihe ist ausdrücklich modellgeschätzt; die UI muss diesen Ursprung erhalten.",
        "- **Mittlere Relevanz:** Unterschiedliche Gebietskataloge brauchen explizite Crosswalks. World-Bank-Gruppen dürfen nicht als zusätzliche Länder summiert werden.",
        "- **Mittlere Relevanz:** Unterschiedliche Start-/Endjahre und Lücken begrenzen mögliche gemeinsame Fenster. Glättung darf sie nicht verdecken.",
        "- Die vermuteten Ursachen sind unterschiedliche Erhebungen, Methodik und Veröffentlichungspraxis; die konkrete Ursache einzelner Lücken wurde nicht unabhängig nachgewiesen.",
        "", "## Reproduzierbarkeit", "",
        "`probe_sources.py` führt die begrenzten öffentlichen Abrufe aus. `build_planning_evidence.py` validiert Kataloge und erstellt Startreihen/Notiz aus vorhandenen Ergebnissen ohne Netzwerk.",
        "Das Notebook `source-readiness.ipynb` enthält den lesbaren Prüfpfad. Vollständige URLs, Abrufzeitpunkte, Antwort-Hashes, Metadaten und Länderdiagnostik stehen in `source-readiness.json`.",
        "", "Die Planung hat keine produktiven App-Dateien, persönliche Datenbanken oder Secrets für diese Prüfung verändert.", "",
    ]
    (HERE / "READINESS.md").write_text("\n".join(lines), encoding="utf-8")
    def cell(kind, text):
        common = {"cell_type": kind, "metadata": {}, "source": text.splitlines(True)}
        if kind == "code":
            common.update({"execution_count": None, "outputs": []})
        return common
    notebook = {"nbformat": 4, "nbformat_minor": 5, "metadata": {"kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"}}, "cells": [
        cell("markdown", "# Weltatlas: Quellenbereitschaft\nDieses Notebook liest die bereits durchgeführten öffentlichen Stichproben. Es verändert keine App-Daten. Die optionale Wiederholung am Ende führt nur die expliziten World-Bank-/M49-Abfragen des lesbaren Skripts aus.\n"),
        cell("code", "import json\nfrom pathlib import Path\n\ncwd = Path.cwd()\ncandidates = [candidate for base in [cwd, *cwd.parents] for candidate in [base, base / 'docs/planning/world-atlas/evidence']]\nevidence = next(path for path in candidates if (path / 'source-readiness.json').is_file())\nreport = json.loads((evidence / 'source-readiness.json').read_text(encoding='utf-8'))\nvalidation = json.loads((evidence / 'planning-validation.json').read_text(encoding='utf-8'))\nvalidation\n"),
        cell("code", "samples = [check for check in report['checks'] if check['check'] == 'worldbank_indicator_sample']\ncoverage = [{'indicator': check['indicator'], **country} for check in samples for country in check['countries']]\nissues = [row for row in coverage if row['internalMissingYears'] or row['lastYear'] is None or row['lastYear'] < 2024]\nissues\n"),
        cell("code", "# Exakter lesbarer Code des Abrufs und der Prüfungen:\nprint((evidence / 'probe_sources.py').read_text(encoding='utf-8'))\n"),
        cell("code", "# Optional: bewusst erneut ausführen; schreibt nur öffentliche Planungsevidenz.\n# import runpy\n# runpy.run_path(str(evidence / 'probe_sources.py'), run_name='__main__')\n# runpy.run_path(str(evidence / 'build_planning_evidence.py'), run_name='__main__')\n"),
    ]}
    for index, entry in enumerate(notebook["cells"]):
        entry["id"] = "readiness-" + str(index)
    write_json(HERE / "source-readiness.ipynb", notebook)
    for entry in notebook["cells"]:
        if entry["cell_type"] == "code":
            compile("".join(entry["source"]), "source-readiness.ipynb", "exec")
    print(json.dumps(overview, ensure_ascii=False))


if __name__ == "__main__":
    main()
