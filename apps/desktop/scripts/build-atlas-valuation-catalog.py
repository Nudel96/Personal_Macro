"""Build source contracts from the independently inspected public XLS archive.

Input files are produced by the read-only source audit; no observations enter
the application bundle. Run from apps/desktop with --input <audit-directory>.
"""
import argparse
from collections import Counter
import hashlib
import json
import pathlib
import re
import unicodedata

args = argparse.ArgumentParser()
args.add_argument("--input", type=pathlib.Path, required=True)
options = args.parse_args()
desktop = pathlib.Path(__file__).resolve().parents[1]
root = desktop.parents[1]
audit_root = options.input.resolve()
read = lambda name: json.loads((audit_root / name).read_text(encoding="utf-8"))
links = read("download-audit.json")
if any(link.get("error") for link in links):
    raise ValueError("Source audit contains failed downloads")
audits = {row["file"]: row for row in read("workbook-audit.json")}
extracted = {row["file"]: row for row in read("extracted.json")}
geos = json.loads((desktop / "src/features/world-atlas/data/catalog.json").read_text(encoding="utf-8"))["geographies"]
un = json.loads((root / "docs/planning/world-atlas/catalogs/geographies.json").read_text(encoding="utf-8"))["areas"]
by_iso = {g["iso3"]: g for g in geos if g["iso3"]}
normalize = lambda value: "".join(c for c in unicodedata.normalize("NFKD", value).lower() if c.isalnum())
name_to_iso = {normalize(g["nameEn"]): g["iso3"] for g in un}
aliases = {
    "Antigua & Barbuda":"ATG", "British Virgin Islands":"VGB", "Czech Republic":"CZE",
    "Falkland Islands":"FLK", "Hong Kong":"HKG", "Ivory Coast":"CIV", "Kosovo":"XKX",
    "Laos":"LAO", "Macau":"MAC", "Macedonia":"MKD", "Moldova":"MDA", "Netherlands":"NLD",
    "Palestinian Authority":"PSE", "Republic of the Congo":"COG", "Russia":"RUS",
    "Saint Kitts & Nevis":"KNA", "South Korea":"KOR", "Taiwan":"TWN", "Tanzania":"TZA",
    "Trinidad & Tobago":"TTO", "Turkey":"TUR", "Turks & Caicos Islands":"TCA",
    "United Kingdom":"GBR", "United States":"USA", "Venezuela":"VEN", "Vietnam":"VNM",
}
name_to_iso.update({normalize(name): iso for name, iso in aliases.items()})
world_names = {"Global", "All countries", "Grand Total", "Total Market"}
excluded_countries = {"Channel Islands": "Historisches Sammelgebiet; nicht Jersey oder Guernsey zugeordnet.", "Netherlands Antilles": "Früheres Gebiet; nicht heutigen Nachfolgegebieten zugeordnet."}

translations = {
    "Advertising":"Werbung", "Aerospace/Defense":"Luftfahrt und Verteidigung", "Air Transport":"Flugverkehr",
    "Apparel":"Bekleidung", "Auto & Truck":"Auto- und Lkw-Hersteller", "Auto Parts":"Autozulieferer",
    "Bank (Money Center)":"Großbanken", "Banks (Regional)":"Regionalbanken", "Beverage (Alcoholic)":"Alkoholische Getränke",
    "Beverage (Soft)":"Alkoholfreie Getränke", "Broadcasting":"Rundfunk", "Brokerage & Investment Banking":"Wertpapierhandel und Investmentbanken",
    "Building Materials":"Baustoffe", "Business & Consumer Services":"Unternehmens- und Verbraucherdienste", "Cable TV":"Kabelfernsehen",
    "Chemical (Basic)":"Grundchemie", "Chemical (Diversified)":"Breit aufgestellte Chemie", "Chemical (Specialty)":"Spezialchemie",
    "Coal & Related Energy":"Kohle und verwandte Energie", "Computer Services":"IT-Dienstleistungen", "Computers/Peripherals":"Computer und Peripherie",
    "Construction Supplies":"Baubedarf", "Diversified":"Mischkonzerne", "Drugs (Biotechnology)":"Biotechnologie",
    "Drugs (Pharmaceutical)":"Pharma", "Education":"Bildungsunternehmen", "Electrical Equipment":"Elektrotechnik",
    "Electronics (Consumer & Office)":"Verbraucher- und Büroelektronik", "Electronics (General)":"Allgemeine Elektronik", "Engineering/Construction":"Ingenieurwesen und Bau",
    "Entertainment":"Unterhaltung", "Environmental & Waste Services":"Umwelt- und Abfalldienste", "Farming/Agriculture":"Landwirtschaft",
    "Financial Svcs. (Non-bank & Insurance)":"Finanzdienste außerhalb von Banken und Versicherungen", "Food Processing":"Lebensmittelverarbeitung", "Food Wholesalers":"Lebensmittelgroßhandel",
    "Furn/Home Furnishings":"Möbel und Einrichtung", "Green & Renewable Energy":"Grüne und erneuerbare Energie", "Healthcare Products":"Gesundheitsprodukte",
    "Healthcare Support Services":"Unterstützende Gesundheitsdienste", "Heathcare Information and Technology":"Gesundheitsinformation und -technologie", "Homebuilding":"Wohnungsbau",
    "Hospitals/Healthcare Facilities":"Krankenhäuser und Gesundheitseinrichtungen", "Hotel/Gaming":"Hotels und Glücksspiel", "Household Products":"Haushaltsprodukte",
    "Information Services":"Informationsdienste", "Insurance (General)":"Allgemeine Versicherungen", "Insurance (Life)":"Lebensversicherungen",
    "Insurance (Prop/Cas.)":"Sach- und Unfallversicherungen", "Investments & Asset Management":"Anlagen und Vermögensverwaltung", "Machinery":"Maschinenbau",
    "Metals & Mining":"Metalle und Bergbau", "Office Equipment & Services":"Büroausstattung und -dienste", "Oil/Gas (Integrated)":"Integrierte Öl- und Gaskonzerne",
    "Oil/Gas (Production and Exploration)":"Öl- und Gasförderung", "Oil/Gas Distribution":"Öl- und Gasvertrieb", "Oilfield Svcs/Equip.":"Ölfelddienste und -ausrüstung",
    "Packaging & Container":"Verpackungen und Behälter", "Paper/Forest Products":"Papier und Forstprodukte", "Power":"Stromerzeuger",
    "Precious Metals":"Edelmetalle", "Publishing & Newspapers":"Verlage und Zeitungen", "R.E.I.T.":"Immobilienfonds (REITs)",
    "Real Estate (Development)":"Immobilienentwicklung", "Real Estate (General/Diversified)":"Breit aufgestellte Immobilienunternehmen", "Real Estate (Operations & Services)":"Immobilienbetrieb und -dienste",
    "Recreation":"Freizeit", "Reinsurance":"Rückversicherungen", "Restaurant/Dining":"Gastronomie",
    "Retail (Automotive)":"Autohandel", "Retail (Building Supply)":"Baumärkte", "Retail (Distributors)":"Handelsvertrieb",
    "Retail (General)":"Allgemeiner Einzelhandel", "Retail (Grocery and Food)":"Lebensmitteleinzelhandel", "Retail (REITs)":"Einzelhandelsimmobilien (REITs)",
    "Retail (Special Lines)":"Spezialisierter Einzelhandel", "Rubber& Tires":"Gummi und Reifen", "Semiconductor":"Halbleiter",
    "Semiconductor Equip":"Halbleiterausrüstung", "Shipbuilding & Marine":"Schiffbau und Meerestechnik", "Shoe":"Schuhe",
    "Software (Entertainment)":"Unterhaltungssoftware", "Software (Internet)":"Internetsoftware", "Software (System & Application)":"System- und Anwendungssoftware",
    "Steel":"Stahl", "Telecom (Wireless)":"Mobilfunk", "Telecom. Equipment":"Telekommunikationsausrüstung",
    "Telecom. Services":"Telekommunikationsdienste", "Tobacco":"Tabak", "Transportation":"Transport",
    "Transportation (Railroads)":"Eisenbahnen", "Trucking":"Straßengüterverkehr", "Utility (General)":"Allgemeine Versorger",
    "Utility (Water)":"Wasserversorger", "Total Market":"Gesamte Unternehmensstichprobe", "Total Market (without financials)":"Unternehmensstichprobe ohne Finanzunternehmen", "Grand Total":"Gesamte Unternehmensstichprobe · Quellenzeile Grand Total",
}

metric_list = [
    ("industry_pbv", "Kurs zu Buchwert", "Verhältnis der gesamten Börsenwerte zum gesamten bilanziellen Eigenkapital der Branche.", True, "valuation"),
    ("industry_roe", "Eigenkapitalrendite", "Verhältnis des gesamten Jahresgewinns zum gesamten bilanziellen Eigenkapital; Kontext zum Kurs-Buchwert-Verhältnis.", False, "context"),
    ("industry_pe_current", "KGV des letzten Geschäftsjahres", "Veröffentlichtes Branchen-KGV auf Basis des letzten Geschäftsjahres. Die aktuelle Methodik mittelt gewinnbringende Unternehmen einfach; frühe Archive erläutern die Aggregation nicht vollständig. Die Branchengrenze 2014 bleibt sichtbar.", True, "valuation"),
    ("industry_pe_trailing", "KGV der letzten zwölf Monate", "Veröffentlichtes Branchen-KGV auf Basis der letzten zwölf Monate. Die aktuelle Methodik mittelt gewinnbringende Unternehmen einfach; frühe Archive erläutern die Aggregation nicht vollständig. Die Branchengrenze 2014 bleibt sichtbar.", True, "valuation"),
    ("industry_pe_forward", "Erwartetes KGV", "Mittelwert mit erwarteten Gewinnen; eine Erwartungsgröße aus dem jeweiligen veröffentlichten Stand.", True, "forecast_valuation"),
    ("industry_pe_all", "Gesamter Börsenwert zu Gesamtgewinn", "Alle Unternehmen der Branche, einschließlich Verlustunternehmen. Ein nicht positiver Gesamtgewinn ergibt keine sinnvolle positive Bewertung.", True, "valuation"),
    ("industry_pe_profitable", "Börsenwert zu Gewinn profitabler Firmen", "Aggregierter Börsenwert zu aggregierten Zwölfmonatsgewinnen ausschließlich gewinnbringender Unternehmen.", True, "valuation"),
    ("industry_loss_share", "Anteil der Verlustunternehmen", "Anteil der Firmen mit negativen Zwölfmonatsgewinnen. Die Quellenzahl ist ein Anteil von null bis eins.", False, "context"),
    ("industry_pe_aggregate_legacy", "Archiv: Börsenwert zu Jahresgewinn", "Veröffentlichtes aggregiertes Verhältnis aus älteren Tabellen. Die damalige Spaltenbezeichnung nennt den Umgang mit Verlustfirmen nicht ausdrücklich; deshalb eine eigene Archivdefinition ohne historische Bewertungslage.", True, "legacy_valuation"),
    ("industry_pe_trailing_aggregate_legacy", "Archiv: Börsenwert zu Zwölfmonatsgewinn", "Ältere aggregierte Zwölfmonatsquote ohne ausdrücklich bezeichnete Auswahl profitabler Firmen. Sie bleibt getrennt von der heutigen Definition und erhält keine historische Bewertungslage.", True, "legacy_valuation"),
    ("industry_pe_forward_legacy", "Archiv: erwartetes KGV", "Frühe US-Tabellen nennen die Spalte Price/Forward PE. Dieser uneindeutig beschriftete Erwartungswert bleibt als eigene Archivperspektive erhalten und erhält keine historische Bewertungslage.", True, "forecast_valuation"),
]
country_metrics = [("pe_current", "KGV des letzten Geschäftsjahres", "Current PE"), ("pe_trailing", "KGV der letzten zwölf Monate", "Trailing PE"), ("pe_forward", "Erwartetes KGV", "Forward PE"), ("pbv", "Kurs zu Buchwert", "PBV"), ("ps", "Kurs zu Umsatz", "PS"), ("ev_ebitda", "Unternehmenswert zu EBITDA", "EV/EBITDA")]
for method, title in [("mean", "Mittelwert"), ("median", "Median")]:
    for key, label, _ in country_metrics:
        metric_list.append((f"country_{method}_{key}", f"{label} · {title}", f"{title} der vom Anbieter verwendeten Unternehmenskennzahlen für das Land. Keine Bewertung eines festen Länderindex; Branchenmix und Firmenzahl ändern sich.", True, "forecast_valuation" if key == "pe_forward" else "valuation"))
metrics = [dict(id=m[0], label=m[1], explanation=m[2], positiveOnly=m[3], kind=m[4], unit="share" if m[0] in ["industry_roe", "industry_loss_share"] else "multiple") for m in metric_list]
region_labels = {"us": "USA", "europe": "Europa · NYU-Gruppe", "japan": "Japan", "emerging": "Schwellenländer · NYU-Gruppe", "china": "China", "india": "Indien", "global": "Global · NYU-Stichprobe", "rest": "Australien, Neuseeland und Kanada · NYU-Gruppe"}
prefix_region = {"data":"us", "europe":"europe", "japan":"japan", "emerg":"emerging", "china":"china", "india":"india", "global":"global", "rest":"rest"}
datasets = {}
file_evidence = []
country_names = set()
industry_names = set()
for link in links:
    filename = link["file"]
    data = extracted[filename]
    sheet = next(s for s in audits[filename]["sheets"] if s["name"] != "Variables & FAQ")
    stamp = sheet["header"][0][1] if sheet["header"] and sheet["header"][0][0] == "Date updated:" else None
    year = int(stamp[:4]) if isinstance(stamp, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", stamp) else None
    if year is None:
        stamp = None
        match = re.search(r"1/(\d{2})", link["label"])
        if not match:
            raise ValueError(f"No verified publication year: {filename}")
        year = (1900 if int(match[1]) >= 90 else 2000) + int(match[1])
    headers = data["headers"]
    fields = []
    if filename.startswith("countrystats"):
        dataset_id, region, kind = "countries", "global", "countries"
        method = "mean" if year <= 2020 else "median"
        for key, _, term in country_metrics:
            choices = [f"Average of {term}"] if method == "mean" else [f"Median {term}", f"median({term})"]
            column = next((h for h in headers if h in choices), None)
            if column is None:
                raise ValueError(f"Missing country definition: {filename}/{term}")
            fields.append({"metricId":f"country_{method}_{key}", "header":column})
        country_names.update(row[0].strip() for row in data["rows"])
    else:
        family = "pbv" if filename.startswith("pbv") else "pe"
        part = re.sub(r"\d+", "", filename.split(".")[0][len(family):]).lower()
        region = prefix_region[part]
        dataset_id, kind = f"{family}-{region}", "industries"
        expected = {"industry_pbv":["PBV","P/BV Ratio","Price/BV"], "industry_roe":["ROE"]} if family == "pbv" else {
            "industry_pe_current":["Current PE", "Price/Current EPS"], "industry_pe_trailing":["Trailing PE", "Price/Trailing EPS"], "industry_pe_forward":["Forward PE", "Price/Forward EPS"],
            "industry_pe_all":["Aggregate Mkt Cap/ Net Income (all firms)"], "industry_pe_profitable":["Aggregate Mkt Cap/ Trailing Net Income (only money making firms)"],
            "industry_loss_share":["% of Money Losing firms (Trailing)"],
            "industry_pe_aggregate_legacy":["Aggregate Market Cap/ Aggregate Net Income", "Aggregate Mkt Cap/ Net Income"],
            "industry_pe_trailing_aggregate_legacy":["Aggregate Mkt Cap/ Trailing Net Income"],
            "industry_pe_forward_legacy":["Price/Forward PE"],
        }
        for metric_id, choices in expected.items():
            column = next((h for h in headers if h in choices), None)
            if column is None:
                if family == "pe" and metric_id not in ["industry_pe_current", "industry_pe_trailing"]:
                    continue
                raise ValueError(f"Missing industry definition: {filename}/{metric_id}")
            fields.append({"metricId":metric_id, "header":column})
        industry_names.update(row[0].strip() for row in data["rows"])
    dataset = datasets.setdefault(dataset_id, dict(id=dataset_id, kind=kind, regionId=region, label="Länderbewertungen" if kind == "countries" else f"{'Buchwertbewertung' if family == 'pbv' else 'Gewinnbewertung'} · {region_labels[region]}", scopeLabel=region_labels[region], files=[]))
    region_cell = sheet["header"][2][5] if stamp and len(sheet["header"]) > 2 and len(sheet["header"][2]) > 5 and sheet["header"][2][0] == "What is this data?" else None
    record = dict(fileName=filename, url=link["url"], publicationYear=year, workbookDate=stamp, reviewedSha256=link["sha256"] if "/archives/" in link["url"] else None, regionCell=region_cell, sheetName=sheet["name"], headerRow=data["headerRow"], subjectHeader=headers[0], countHeader=headers[1], expectedSubjects=len(data["rows"]), fields=fields)
    record["ambiguousSubjects"] = sorted(name for name, count in Counter(row[0].strip() for row in data["rows"]).items() if count > 1)
    dataset["files"].append(record)
    file_evidence.append(dict(fileName=filename, url=link["url"], sha256=link["sha256"], bytes=link["bytes"], publicationYear=year, workbookDate=stamp, headerRow=data["headerRow"], sourceSubjects=len(data["rows"]), datasetId=dataset_id, ambiguousSubjects=record["ambiguousSubjects"], metricIds=[f["metricId"] for f in fields], archiveLinkCorrection=link.get("archiveLinkCorrection")))

geography_map = []
unmatched = []
for name in sorted(country_names):
    if name in world_names:
        geo = next(g for g in geos if g["id"] == "world")
    else:
        iso = name_to_iso.get(normalize(name))
        geo = by_iso.get(iso)
    if geo:
        geography_map.append(dict(providerLabel=name, geographyId=geo["id"], label=geo["label"]))
    else:
        unmatched.append(dict(providerLabel=name, reason=excluded_countries.get(name, "Noch nicht eindeutig zugeordnet.")))
unknown = [r["providerLabel"] for r in unmatched if r["providerLabel"] not in excluded_countries]
if unknown:
    raise ValueError(f"Unresolved country labels: {unknown}")

active = {r[0].strip() for dataset in datasets.values() if dataset["kind"] == "industries" for r in extracted[max(dataset["files"], key=lambda f: f["publicationYear"])["fileName"]]["rows"]}
if active - translations.keys():
    raise ValueError(f"Missing German labels: {active - translations.keys()}")
industries = [dict(id="industry:" + re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_") + ":" + hashlib.sha256(name.encode()).hexdigest()[:8], providerLabel=name, label=translations.get(name, f"Frühere Quellenbranche: {name}"), active=name in active) for name in sorted(industry_names)]
if len({i["id"] for i in industries}) != len(industries):
    raise ValueError("Duplicate industry ids")
for dataset in datasets.values():
    dataset["files"].sort(key=lambda f: f["publicationYear"])
    years = [f["publicationYear"] for f in dataset["files"]]
    if len(set(years)) != len(years):
        raise ValueError(f"Duplicate source years: {dataset['id']}")

catalog = dict(version="2026-09-09.3", sourceUrl="https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datacurrent.html", archiveUrl="https://pages.stern.nyu.edu/~adamodar/New_Home_Page/dataarchived.html", methodologyUrl="https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datahistory.html", datasets=list(datasets.values()), metrics=metrics, geographies=geography_map, excludedGeographies=unmatched, industries=industries)
target = desktop / "src/features/world-atlas/data/valuation-catalog.json"
target.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
evidence = dict(reviewedOn="2026-09-09", catalogVersion=catalog["version"], fileCount=len(file_evidence), files=file_evidence, countryLabels=len(country_names), assignedCountryLabels=len(geography_map), distinctAssignedGeographies=len({g["geographyId"] for g in geography_map}), excludedGeographies=unmatched, industryLabels=len(industries), activeIndustryLabels=len(active), notes=["Alle Dateien über öffentliche NYU-Quellen abgerufen und mit xlrd unabhängig eingelesen. Für den falschen Japan-2025-Archivlink ist eine explizit geprüfte Originaldatei dokumentiert.", "Dateinamen tragen vielfach das Vorjahr; Veröffentlichungsjahr stammt aus Tabellenkopf beziehungsweise dem dokumentierten Archivlink.", "Länder-Mittelwerte bis 2020 und Mediane ab 2021 erhalten getrennte Kennzahl-IDs.", "Aktuelle China-KGV-Datei stammt aus Januar 2025; China-Buchwerte aus Januar 2026.", "83 zusätzliche PE-Archive: USA 1999–2025, Europa/Japan/Schwellenländer/Global 2012–2025. Aktuelle Dateien ergänzen 2026.", "Japan 2025: falscher Europalink auf der Archivseite; die erreichbare Originaldatei peJapan24.xls ist anhand Tabellenstempel, Japan-Region und SHA-256 ausdrücklich geprüft.", "Frühe unpräzise Aggregatspalten und Price/Forward PE erhalten eigene Archivdefinitionen. Verlustfirmenanteile beginnen erst 2023.", "Alle Archivdateien sind an den geprüften SHA-256 gebunden; Änderungen benötigen eine erneute Quellenprüfung.", "Frühere Branchenbezeichnungen werden nicht automatisch zusammengeführt. Branchenvergleiche über 2014 hinweg brauchen eine sichtbare Methodengrenze."])
(root / "docs/planning/world-atlas/evidence/valuation-source-audit.json").write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"datasets":len(datasets), "files":len(file_evidence), "mappedGeographies":evidence["distinctAssignedGeographies"], "currentIndustries":len(active), "allIndustryLabels":len(industries)}, ensure_ascii=False))
