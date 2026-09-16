"""Build the reviewed UIS catalogue from public source files, never personal data.

Usage: python scripts/build-atlas-education.py .tmp/atlas-validation/uis
The bulk ZIP and the independently downloaded, versioned India API response
are required. This script performs no network requests.
"""
import csv
import hashlib
import io
import json
import re
import sys
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
source = Path(sys.argv[1])
target = root / "src/features/world-atlas/data/education-catalog.json"
archive = zipfile.ZipFile(source / "SDG.zip")

def rows(name):
    return csv.DictReader(io.TextIOWrapper(archive.open(name), encoding="utf-8-sig"))

def load(path):
    return json.loads(path.read_text(encoding="utf-8"))

labels = {r["INDICATOR_ID"]: r["INDICATOR_LABEL_EN"].strip() for r in rows("SDG_LABEL.csv")}
metadata = {m["indicatorCode"]: m for m in load(source / "india-40-api.json")["indicatorMetadata"]}
catalog = load(root / "src/features/world-atlas/data/catalog.json")
iso = {g["iso3"]: g for g in catalog["geographies"] if g["iso3"]}

# German meanings are deliberately specific to the published indicator.
specs = """
NER.02.CP|early_learning|Vorschule im vorgesehenen Alter|administrative|Kinder im offiziellen Vorschulalter, die eine Vorschule besuchen. Die Quote beschreibt Zugang, keine Lernergebnisse.
NERA.AGM1.CP|early_learning|Bildungszugang vor der Grundschule|administrative|Kinder ein Jahr vor dem offiziellen Grundschuleintritt, die eine Bildungseinrichtung besuchen; die besuchte Bildungsstufe kann abweichen.
CR.1|primary_school|Grundschule abgeschlossen|survey|Anteil der jungen Menschen drei bis fünf Jahre über dem vorgesehenen Abschlussalter, die die letzte Grundschulklasse abgeschlossen haben. Haushaltsbefragungen und Volkszählungen; einzelne Erhebungen bleiben einzelne Punkte.
ROFST.1.CP|primary_school|Kinder ohne Schulbesuch|administrative|Kinder im offiziellen Grundschulalter, die keine Grundschule oder weiterführende Schule besuchen. Höher bedeutet mehr ausgeschlossene Kinder.
EA.1T8.AG25T99|primary_school|Erwachsene mit Grundschulabschluss|survey|Anteil der Bevölkerung ab 25 Jahren mit abgeschlossener Grundbildung oder einem höheren Abschluss. Diese Erwachsenenperspektive ist von aktuellen Kinderkohorten getrennt.
CR.2|secondary_school|Untere Sekundarstufe abgeschlossen|survey|Anteil der jungen Menschen drei bis fünf Jahre über dem vorgesehenen Abschlussalter, die die letzte Klasse der unteren Sekundarstufe abgeschlossen haben.
CR.3|secondary_school|Obere Sekundarstufe abgeschlossen|survey|Anteil der jungen Menschen drei bis fünf Jahre über dem vorgesehenen Abschlussalter, die die letzte Klasse der oberen Sekundarstufe abgeschlossen haben.
ROFST.2.CP|secondary_school|Ohne Schulbesuch · untere Sekundarstufe|administrative|Jugendliche im offiziellen Alter der unteren Sekundarstufe ohne Besuch einer Grundschule oder weiterführenden Schule. Höher bedeutet mehr Jugendliche außerhalb des Schulsystems.
ROFST.3.CP|secondary_school|Ohne Schulbesuch · obere Sekundarstufe|administrative|Jugendliche im offiziellen Alter der oberen Sekundarstufe ohne Schulbesuch nach der UIS-Abgrenzung. Höher bedeutet mehr Jugendliche außerhalb des Schulsystems.
EA.3T8.AG25T99|secondary_school|Erwachsene mit höherem Schulabschluss|survey|Bevölkerung ab 25 Jahren mit abgeschlossener oberer Sekundarstufe oder höherem Abschluss; keine aktuelle Abschlussquote eines Schuljahrgangs.
GER.5T8|higher_education|Hochschulbeteiligung · Bruttoquote|administrative|Alle Studierenden unabhängig vom Alter im Verhältnis zur Bevölkerung im vorgesehenen Hochschulalter. Werte über hundert sind möglich; die Quote ist kein Anteil aller Menschen mit Hochschulabschluss.
EA.6T8.AG25T99|higher_education|Erwachsene mit Bachelor oder höher|survey|Anteil der Bevölkerung ab 25 Jahren mit Bachelorabschluss oder höherem Abschluss. Nationale Bildungsabschlüsse werden den internationalen Bildungsstufen zugeordnet.
EV1524P.2T5.V|vocational_training|Junge Menschen in beruflicher Bildung|administrative|Anteil der 15- bis 24-Jährigen in beruflichen Bildungsprogrammen der internationalen Stufen ISCED 2 bis 5. Dies umfasst nicht jede informelle Ausbildung oder betriebliche Weiterbildung.
PRYA.12MO.AG15T24|adult_learning|Lernbeteiligung junger Menschen|survey|15- bis 24-Jährige mit formaler oder nicht formaler Bildung und Weiterbildung in den letzten zwölf Monaten. Teilnahme sagt nichts über Dauer, Qualität oder Abschluss aus.
PRYA.12MO.AG15T64|adult_learning|Lernbeteiligung im Erwerbsalter|survey|15- bis 64-Jährige mit formaler oder nicht formaler Bildung und Weiterbildung in den letzten zwölf Monaten. Altersgruppe und Zeitraum bleiben beim Vergleich gleich.
LR.AG15T24|literacy|Lesen und Schreiben · junge Menschen|survey|15- bis 24-Jährige, die eine kurze einfache Aussage über den Alltag lesen und schreiben können. Nationale Definitionen und Erhebungsverfahren können abweichen.
LR.AG15T99|literacy|Lesen und Schreiben · Erwachsene|survey|Bevölkerung ab 15 Jahren mit grundlegender Lese- und Schreibfähigkeit. Dies ist keine umfassende Prüfung funktionaler Lesekompetenz; teilweise beruhen die Angaben auf Selbstauskunft.
LR.AG25T64|literacy|Lesen und Schreiben · mittlere Altersgruppe|survey|Bevölkerung von 25 bis 64 Jahren mit grundlegender Lese- und Schreibfähigkeit. Die Altersgruppe bleibt von Jugend- und Gesamtquoten getrennt.
LR.AG65T99|literacy|Lesen und Schreiben · ältere Menschen|survey|Bevölkerung ab 65 Jahren mit grundlegender Lese- und Schreibfähigkeit. Die Perspektive zeigt ältere Bildungskohorten.
READ.PRIMARY|learning_outcomes|Lesekompetenz am Grundschulende|assessment|Anteil der Schüler am Ende der Grundbildung mit mindestens der festgelegten Mindestkompetenz im Lesen. Unterschiedliche Testprogramme sind nicht automatisch vergleichbar.
READ.LOWERSEC|learning_outcomes|Lesekompetenz am Ende der unteren Sekundarstufe|assessment|Anteil der Schüler am Ende der unteren Sekundarstufe mit Mindestkompetenz im Lesen. Die Originalquelle des jeweiligen Tests steht bei der Erhebung.
MATH.PRIMARY|learning_outcomes|Mathematik am Grundschulende|assessment|Anteil der Schüler am Ende der Grundbildung mit mindestens der festgelegten Mindestkompetenz in Mathematik. Unterschiedliche Tests bleiben einzelne Erhebungsbilder.
MATH.LOWERSEC|learning_outcomes|Mathematik am Ende der unteren Sekundarstufe|assessment|Anteil der Schüler am Ende der unteren Sekundarstufe mit Mindestkompetenz in Mathematik. Gleiche Prozentangaben garantieren keine gleichen Tests.
XGDP.FSGOV|education_spending|Staatliche Bildungsausgaben|administrative|Öffentliche laufende Ausgaben und Investitionen in Bildung als Anteil am BIP. Teilweise erfassen Länder nur das Bildungsministerium; mehr Ausgaben sind kein Beleg für bessere Ergebnisse.
TRTP.02|teachers|Qualifikation der Vorschullehrkräfte|administrative|Lehrkräfte mit der im jeweiligen Land vorgeschriebenen Mindestqualifikation für die Vorschule. Die nationalen Mindestanforderungen sind unterschiedlich.
TRTP.1|teachers|Qualifikation der Grundschullehrkräfte|administrative|Grundschullehrkräfte mit der national vorgeschriebenen Mindestqualifikation. Ein gleich hoher Anteil bedeutet keine gleichwertige Ausbildung zwischen Ländern.
TRTP.2|teachers|Qualifikation · untere Sekundarstufe|administrative|Lehrkräfte der unteren Sekundarstufe mit der national vorgeschriebenen Mindestqualifikation.
TRTP.3|teachers|Qualifikation · obere Sekundarstufe|administrative|Lehrkräfte der oberen Sekundarstufe mit der national vorgeschriebenen Mindestqualifikation.
SCHBSP.1.WINTERN|education_technology|Internet in Grundschulen|administrative|Grundschulen mit Internetzugang für pädagogische Zwecke. Vorhandener Zugang misst weder Unterrichtsqualität noch tatsächliche Nutzung.
SCHBSP.2.WINTERN|education_technology|Internet · untere Sekundarstufe|administrative|Schulen der unteren Sekundarstufe mit Internetzugang für pädagogische Zwecke.
SCHBSP.3.WINTERN|education_technology|Internet · obere Sekundarstufe|administrative|Schulen der oberen Sekundarstufe mit Internetzugang für pädagogische Zwecke.
SCHBSP.1.WCOMPUT|education_technology|Computer in Grundschulen|administrative|Grundschulen mit Computern für pädagogische Zwecke. Die Statistik misst Ausstattung, keine Lernergebnisse oder Umsätze der Bildungswirtschaft.
SCHBSP.1.WELEC|primary_school|Grundschulen mit Strom|administrative|Grundschulen mit einer verlässlichen, verfügbaren Stromversorgung für den Bildungsbetrieb.
SCHBSP.1.WWATA|primary_school|Grundschulen mit Trinkwasser|administrative|Grundschulen mit einer grundlegenden Trinkwasserversorgung nach der UIS-Abgrenzung.
SCHBSP.1.WWASH|primary_school|Grundschulen mit Handwaschmöglichkeiten|administrative|Grundschulen mit grundlegenden Handwascheinrichtungen nach der UIS-Abgrenzung.
SCHBSP.1.WTOILA|primary_school|Grundschulen mit Sanitärversorgung|administrative|Grundschulen mit grundlegenden, nach Geschlechtern getrennten Sanitäreinrichtungen.
SCHBSP.1.WINFSTUDIS|primary_school|Grundschulen mit barrierearmer Ausstattung|administrative|Grundschulen mit angepasster Infrastruktur und Materialien für Schüler mit Behinderungen. Der Anteil ist keine umfassende Messung der Inklusion.
CR.MOD.1|primary_school|Grundschulabschluss · UIS-Modell|modelled|Von UIS veröffentlichte modellierte Abschlussquote. Die jährlichen Modellwerte sind von einzelnen Haushaltserhebungen getrennt; keine eigene Sinuskurve und keine Zukunftsprognose.
CR.MOD.2|secondary_school|Untere Sekundarstufe · UIS-Modell|modelled|Von UIS veröffentlichte modellierte Abschlussquote für die untere Sekundarstufe. Die Linie zeigt ein statistisches Modell und bleibt von Erhebungswerten getrennt.
CR.MOD.3|secondary_school|Obere Sekundarstufe · UIS-Modell|modelled|Von UIS veröffentlichte modellierte Abschlussquote für die obere Sekundarstufe. Die Linie zeigt ein statistisches Modell und bleibt von Erhebungswerten getrennt.
"""
metrics = []
for line in specs.strip().splitlines():
    code, topic, label, kind, explanation = line.split("|")
    assert labels[code] == metadata[code]["name"].strip(), code
    metrics.append(dict(code=code, topicId="education:" + topic, label=label,
                        providerLabel=labels[code], kind=kind, explanation=explanation,
                        boundedPercentage=code not in ["GER.5T8", "XGDP.FSGOV"]))

region_specs = """
Australia and New Zealand|Australien und Neuseeland|Oceania
Central Asia|Zentralasien|Asia
Central and Southern Asia|Zentral- und Südasien|Asia
Eastern Asia|Ostasien|Asia
Eastern and South-Eastern Asia|Ost- und Südostasien|Asia
Europe|Europa|Europe
Europe and Northern America|Europa und Nordamerika|world
Europe, Northern America, Australia and New Zealand|Europa, Nordamerika, Australien und Neuseeland|world
Landlocked Developing Countries|Binnenentwicklungsländer|world
Latin America and the Caribbean|Lateinamerika und Karibik|Americas
Least Developed Countries|Am wenigsten entwickelte Länder|world
Northern Africa|Nordafrika|Africa
Northern Africa and Western Asia|Nordafrika und Westasien|world
Northern America|Nordamerika|Americas
Oceania|Ozeanien|Oceania
Oceania (excluding Australia and New Zealand)|Ozeanien ohne Australien und Neuseeland|Oceania
Small Island Developing States|Kleine Inselentwicklungsländer|world
South-Eastern Asia|Südostasien|Asia
Southern Asia|Südasien|Asia
Sub-Saharan Africa|Afrika südlich der Sahara|Africa
Western Asia|Westasien|Asia
World|Welt|world
"""
members = {}
for row in rows("SDG_REGION.csv"):
    members.setdefault(row["REGION_ID"], set()).add(row["COUNTRY_ID"])
regions = []
for line in region_specs.strip().splitlines():
    name, label, parent = line.split("|")
    code = "SDG: " + name
    regions.append(dict(code=code, label=name, geographyId="uis:" + re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_"),
                        title=label + " · UIS-SDG-Region", regionId=parent, members=sorted(members[code])))
assert {r["code"] for r in regions} == {k for k in members if k.startswith("SDG:")}
excluded = [r for r in rows("SDG_COUNTRY.csv") if r["COUNTRY_ID"] not in iso]
assert {r["COUNTRY_ID"] for r in excluded} == {"ANT", "XDN", "ZZA"}
areas = [dict(code=r["COUNTRY_ID"], label=r["COUNTRY_NAME_EN"], geographyId=iso[r["COUNTRY_ID"]]["id"])
         for r in rows("SDG_COUNTRY.csv") if r["COUNTRY_ID"] in iso]
areas += [dict(code=r["code"], label=r["label"], geographyId=r["geographyId"]) for r in regions]
result = dict(version="2026-02", url="https://download.uis.unesco.org/bdds/202602/SDG.zip",
              release="Februar 2026", license="CC BY-SA 3.0 IGO",
              licenseUrl="https://creativecommons.org/licenses/by-sa/3.0/igo/",
              metadataUrl="https://www.uis.unesco.org/en/methods-and-tools/sdg4-indicators",
              metrics=metrics, regions=regions, areas=areas, excludedCountries=excluded)
target.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(dict(metrics=len(metrics), areas=len(areas), regions=len(regions),
                     zipSha256=hashlib.sha256((source / "SDG.zip").read_bytes()).hexdigest())))
