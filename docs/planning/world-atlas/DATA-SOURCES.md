# Weltatlas – Quellen, Kosten und Datenqualität

Stand: 9. September 2026. Die Prüfung unterscheidet dokumentierte Angebote,
tatsächliche Stichprobenabrufe und noch nicht implementierte Produktadapter.

## 1. Kostenentscheidung

Eine zusätzliche kostenpflichtige API ist keine Voraussetzung des Atlas.
Öffentliche Statistik bildet die weltweite Basis. Die vorhandene EODHD-Anbindung
ergänzt Marktzeitreihen, soweit der bestehende Tarif die benötigten Instrumente
und Historien umfasst. Inzwischen wurden die 26 angebundenen ETF-Stellvertreter
mit der vorhandenen Konfiguration tatsächlich geladen; siehe
[Marktwellen](MARKET-WAVES.md). Weitere Instrumente und Bewertungsdaten sind
dadurch nicht automatisch abgedeckt.

Kostenfreie Daten können trotzdem Limits, Nutzungsbedingungen, notwendige
Quellennennung und Wartungsaufwand haben. Das Projekt kauft keine neuen Abos und
umgeht keine Download-, Lizenz- oder Zugangsschranken. Ein fehlender frei
nutzbarer Sektorindex bleibt eine echte Beschränkung. Die App darf daraus keine
scheinbare kostenlose Komplettabdeckung ableiten.

Kursreihen werden initial geladen und anschließend begrenzt nachgeführt;
jüngste Korrekturen und Corporate Actions benötigen gelegentliche weiter
zurückreichende Abgleiche. Jahresstatistiken folgen dem Quellenrhythmus.
Ein jährlicher Indikator wird nicht täglich in identischer Form geladen.
Abrufe laufen beim geöffneten Desktop, mit Nachholprüfung beim nächsten Start.

## 2. Quellen nach Aufgabe

Das maschinenlesbare Register des Planungsstands mit Zugriffseinschätzung und
Nutzungsgrenzen liegt in `catalogs/sources.json`. Nachträglich angebundene
Quellen stehen zusätzlich im produktiven Atlas-Katalog und in ihren
Methodikdokumenten, darunter [Ember-Stromwirtschaft](ENERGY.md) und
[74 statistische Länderperspektiven](STATISTICS.md). Die WDI-Erweiterung nutzt
auch dort veröffentlichte Daten von UIS, WHO, ILO, FAO und WIPO; dies ist noch
keine eigene Direktanbindung an all diese Anbieter.

| Datenfamilie | Primärer Weg | Aussage und Grenze |
| --- | --- | --- |
| Gebiete/Regionen | [UN M49](https://unstats.un.org/unsd/methodology/m49/overview/) | Weltverzeichnis; Anbieter- und historische Gebiete zusätzlich zuordnen |
| Demografie und Wirtschaftsstruktur | [World Bank WDI](https://datahelpdesk.worldbank.org/knowledgebase/articles/889392) | Öffentliche API ohne Schlüssel; Abdeckung pro Kennzahl prüfen |
| Alter, Kohorten und Projektionen | [UN WPP](https://population.un.org/wpp/?os=0) | Historische Schätzungen und Zukunftsvarianten unterscheiden |
| Bildung/Wissenschaft | [UNESCO UIS](https://databrowser.uis.unesco.org/resources) | Bildungsstruktur und Ergebnisse; keine Bewertung privater Bildungstitel |
| Arbeitsmarkt | [ILOSTAT](https://ilostat.ilo.org/data/bulk/) | Modellschätzungen und nationale Erhebungen unterscheiden |
| Stromwirtschaft nach Land/Region | [Ember](https://ember-energy.org/data/yearly-electricity-data/) | Implementierter öffentlicher Jahresdownload: neun Erzeugungsarten, Anteil/Erzeugung/Kapazität; Schätzungen enthalten; [Abnahme](ENERGY.md) |
| Anlagenleistung nach Technologie | [IRENASTAT](https://pxweb.irena.org/pxweb/en/IRENASTAT/IRENASTAT__Power%20Capacity%20and%20Generation/) | 224 Länder/Wirtschaftsgebiete und zehn Regionen angebunden; Netzarten getrennt, kein Aktienwert; [Nachweis](CAPACITY.md) |
| Ernährung/Landwirtschaft | [FAOSTAT](https://www.fao.org/faostat/en/) | Breiter Länderbestand, häufig ab 1961; produkt- und gebietsspezifische Lücken |
| Gesundheit | [WHO-Dokumentation](https://apps.who.int/gho/athena/public_docs/api.html) | Konkreten aktuellen Endpunkt vor Integration bestätigen |
| Patente/Innovation | [WIPO](https://www.wipo.int/en/web/ip-statistics) | Kostenloser Statistikzugang; Patentzählung ist kein vollständiges Innovationsmaß |
| Europa/Deutschland | [Eurostat](https://ec.europa.eu/eurostat/web/user-guides/data-browser/api-data-access/api-getting-started), [GENESIS](https://www.destatis.de/DE/Service/OpenData/genesis-api-webservice-oberflaeche.html) | Regionale Vertiefung; keine globale Ersatzstatistik |
| Weitere internationale Strukturvergleiche | [OECD](https://www.oecd.org/en/data/insights/data-explainers/2024/09/api.html) | Kostenloses SDMX-Angebot mit Bedingungen; Abdeckung je Datenfluss |
| Sektor-/Länder-Marktlage | [EODHD](https://eodhd.com/financial-apis/api-for-historical-data-and-volumes) | Passende Indizes/ETFs und Adjustments prüfen; Kurslage ≠ Bewertung |
| Branchenbewertungen | [Damodaran](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datacurrent.html) | Jährliche Kennzahlen, begrenzte Historie/Regionalität |
| Indische Indexbewertungen | [Nifty](https://www.niftyindices.com/reports/historical-data) | Veröffentlichte Kennzahlen; zulässigen automatischen Zugriff gesondert prüfen |
| Kredit/Immobilien im Atlas | [BIS](https://data.bis.org/topics/RPP) | Kreditquote, Trend und Welle für 44 Quellengebiete sowie Wohnimmobilienpreise für 61 Profile implementiert. [Kreditbilder](CREDIT.md), [Immobilienbilder](PROPERTY.md). Keine EODHD-Fallbacks. |
| Kaufpreise zu Einkommen/Mieten | [OECD](https://www.oecd.org/en/data/indicators/housing-prices.html) | Kostenloser nativer SDMX-Abruf, 42 Länder und drei Quellenaggregate. Vier veröffentlichte Reihen; Hoch-/Tiefbilder verwenden nur vorhandene Langfristvergleiche. Kein fairer Preis. [Quelle und Abnahme](HOUSING-RATIOS.md). |
| Historischer Wohlstand | [Maddison Project](https://www.rug.nl/ggdc/historicaldevelopment/maddison/releases/maddison-project-database-2023?lang=en) | Historische Rekonstruktionen; Land und Zeitspanne begrenzen Aussage |
| Lange Finanzgeschichte | [JST](https://www.macrohistory.net/database/) | R.6: 18 entwickelte Volkswirtschaften seit 1870, kein Weltmodell |
| Historische Staatsfinanzen | [IMF Public Finances in Modern History](https://www.imf.org/external/datamapper/datasets/FPP) | Geprüfte Dezember-2025-Originaldatei aus dem öffentlichen OWID-Archiv, acht direkte Messgrößen für 151 Länder/Gebiete. Historische Rekonstruktionen, staatliche Ebenen und Zeitlücken bleiben getrennt; keine Weltaggregate. [Abnahme](FISCAL.md). |

## 3. Reale Prüfung am Planungstag

Reproduzierbarer Code: `evidence/probe_sources.py`. Er greift ausschließlich auf
zwei öffentliche Hosts zu und liest keine lokale Benutzer-Datenbank oder Secrets.
Die Ergebnisse mit Abrufdatum, URL, SHA-256 und Prüfdetails stehen in
`evidence/source-readiness.json`. Das begleitende Notebook lädt diese Ergebnisse
und ermöglicht die gezielte Wiederholung der Quellenprüfung.

Der M49-Abruf ergab 248 Gebiete: Afrika 60, Amerika 57, Asien 50, Europa 51,
Ozeanien 29 und ein von der Quelle keiner Großregion zugeordnetes Gebiet.
Das ist ein Quellverzeichnis einschließlich Territorien, keine Zahl souveräner Staaten.
Alle IDs und ISO3-Zuordnungen waren innerhalb dieses Snapshots eindeutig.

Die Weltbank lieferte für die Bevölkerungsreihe im geprüften Jahr 2023 Werte für
217 von 217 nicht aggregierten Gebieten ihres eigenen Katalogs. Die abweichende
Gebietszahl zeigt, warum Provideridentitäten und Regionskatalog nicht einfach
gleichgesetzt werden dürfen. Auch World-Bank-Regionsnamen weichen von M49 ab.

Für zehn Indikatoren wurden zwölf Länder angefragt: Deutschland, USA, Indien,
China, Brasilien, Nigeria, Südafrika, Saudi-Arabien, Australien, Japan, Mexiko
und Indonesien. Der angefragte Bereich war 1960–2025. Alle zwölf Prüfvorgänge
(Geografie, globale Einzeljahresabdeckung und zehn Reihenfamilien) liefen durch;
„passed“ bedeutet einen erfolgreich ausgewerteten Abruf, nicht lückenlose Daten.

Wesentliche Ergebnisse:

- Bevölkerung, Anteil ab 65 und Urbanisierung waren in diesen zwölf
  Länderstichproben 1960–2025 durchgängig numerisch belegt.
- Fertilität war dort 1960–2024 durchgängig belegt. Ein fehlendes 2025 darf
  weder ergänzt noch als Verschlechterung dargestellt werden.
- Das geprüfte reale BIP je Einwohner lautet ausdrücklich **constant 2015 US$**.
  Diese Basis wird aus Metadaten übernommen und nicht pauschal durch eine andere
  Preis- oder Kaufkraftbasis ersetzt.
- Die Arbeitslosenreihe bezeichnet sich bereits als **modeled ILO estimate**.
  Eine Vergangenheit vor dem heutigen Datum ist nicht automatisch „gemessen“.
- Die geprüfte Sekundar-Bruttoeinschulungsquote für China endete 2012; für
  mehrere andere Länder lagen größere interne Lücken vor. Sie eignet sich in
  diesem Zustand nicht als heutiger vollständiger Bildungsvergleich.
- Beim Anteil des verarbeitenden Gewerbes endete die US-Stichprobe 2021;
  die China-Stichprobe begann 2004. Gemeinsame lange Vergleiche benötigen
  entsprechend begrenzte Fenster oder eine zusätzlich geprüfte Reihe.
- Elektrizitätszugang war innerhalb der je Land verfügbaren Historie lückenlos,
  beginnt aber zu unterschiedlichen Zeitpunkten. Internetnutzung enthielt in
  mehreren Ländern einzelne interne Lücken.

Die Stichprobe prüfte Antwortstruktur, Pagination-Vollständigkeit der kleinen
Abfragen, Primärschlüssel, Beginn/Ende und Lücken. Sie war kein vollständiger
Abgleich mit nationalen Originalstatistiken und kein Beweis aller Quellmethoden.

### Spätere statistische Erweiterung

Am 9. September wurden 56 weitere WDI-Zuordnungen einzeln geprüft und
implementiert. Alle 66 produktiven Reihen wurden anschließend weltweit über
den nativen Adapter geladen und in temporärem SQLite geprüft. Ein unabhängiger
Neun-Gebiete-Abgleich bestätigte 20.464 neue Zahlenwerte exakt; Lücken und
Quellkennzeichen stimmten ebenfalls überein. [Bedeutung, Grenzen und Abdeckung](STATISTICS.md),
[Prüfbericht](evidence/statistics-independent-check.json).

Die ursprüngliche Planungstag-Stichprobe oben bleibt historisch erhalten.
Ein neuer zusätzlicher Indikator ersetzt keine alte Reihe und behebt deren
Länder- oder Zeitlücken nicht stillschweigend.

## 4. Herkunft und Qualität als Teil des Datenvertrags

Jede Reihe besitzt Quelle, Quellenkennung, Statistikgegenstand, Gebiet,
Bezugsgruppe, Einheit, Nenner, Frequenz, saisonale Bereinigung, Preisbasis,
Währung, Datenstand, Release/Version, Nutzungsbedingungen und erlaubte Ansichten.

Jeder Wert besitzt Bezugszeitraum, Veröffentlichungsdatum soweit bekannt,
Abrufdatum, ursprünglichen Wert/Flag, Beobachtungsart und Quellenreferenz.
Beobachtungsarten sind berichtet, geschätzt, projiziert, historisch rekonstruiert
oder unklar. Berechnete Werte erhalten zusätzlich Rezeptversion und Eingaben.
Das Alter eines Werts und sein Status sind verschiedene Eigenschaften.

Keine stillen Umdeutungen:

- Null ist ein gültiger Wert; fehlend bleibt `null` mit Grund.
- Bruttoeinschulungsquoten können über 100 liegen. Nicht jede Prozentangabe
  ist ein auf 0–100 begrenzter Anteil.
- Aus einem Quellenfehler folgt `sync_failed`, aus einem noch nicht geprüften
  Markt `not_checked`, aus echter fehlender Quelle `no_suitable_series`.
- Eine abgelaufene zulässige Aktualität ergibt `stale`; sie ist
  indikatorspezifisch und orientiert sich am Veröffentlichungsrhythmus.
- Verlässlichkeit wird zunächst als erklärbare Merkmale angezeigt
  (Historie, Lücken, Aktualität, Passung), nicht als scheinpräziser Gesamtscore.

## 5. Harmonisierung und Aggregation

Absolute Größen, Pro-Kopf-Größen, Anteile, Wachstumsraten und Bewertungen dürfen
nicht beliebig gegeneinander normalisiert werden. Länderentwicklung wird bei
Bedarf real oder kaufkraftbereinigt verglichen, mit expliziter Basis. Ein
USD-notierter Länderfonds enthält Wechselkurseinflüsse; die gewählte Perspektive
bleibt sichtbar. Gehebelte/inverse ETFs sind keine Standard-Sektorvertreter.

Sektorvertretung wird nach wirtschaftlicher Tätigkeit, Umsatzexposition und
Gebiet geprüft. Börsenplatz, Firmensitz und Absatzmarkt sind verschiedene Dinge.
Ein Themenfonds mit globalen Unternehmen ist nicht automatisch Indien oder Afrika.

Regionale Summen verwenden additive Werte derselben Einheit und desselben
Bezugszeitraums. Anteile werden aus passenden Zählern/Nennern neu berechnet;
Ländermediane und Länderprozentsätze werden nicht einfach gemittelt. Altersquoten
benötigen ihre tatsächlichen Altersgruppengrößen. Unvollständige Gebietsabdeckung
bleibt ausgewiesen; unbekannte Länder werden nicht als null gewichtet.

Providerwechsel, Fondsauflagen, Fondsauflösungen, Indexmethodenwechsel,
Inflationsbasen, neue Grenzen und Revisionen unterbrechen gegebenenfalls die
Vergleichbarkeit. Überlappende Reihen werden nicht nur zur Verlängerung einer
Kurve zusammengeklebt. Ein rückgerechneter Index wird als Rückrechnung markiert.
Ein heutiger Aktienkorb darf nicht als historischer Korb ohne Survivorship-Bias
ausgegeben werden.

## 6. Berechnungsgrundlagen

**Marktwelle:** Bereinigte Monatskurse beziehungsweise geeigneter Total-Return-
Index. Nachvollziehbare einseitige Trendberechnung, Abstand zum Trend und
zurückblickende Glättung. Keine zukünftigen Werte in aktuellen/historischen
Zuständen. Robuste Normierung gegen die eigene ausreichend lange Historie.
Parameter und Empfindlichkeit werden vor Freigabe mit Referenzreihen geprüft.

**Bewertungswelle:** Geeignete positive Bewertungskennzahlen im gleichen Sektor
und einer vergleichbaren Historie. Bei Verlusten ist ein negatives KGV keine
günstige Bewertung. Unterschiedliche Kennzahlenmodelle werden nicht zu einer
unbegründeten Gesamtzahl gemittelt. Ohne längere vergleichbare Bewertungsreihe
erscheint höchstens ein datiertes Bewertungsbild, keine historische Welle.

**Struktur/Demografie:** Originalmaß, Anteil oder begründete Veränderung;
keine automatische Wellen-Normierung. Eine Bevölkerungspyramide verwendet
gleiche Altersklassen und transparente Bezugsgrößen. Bevölkerung nach Alter
allein erlaubt keine Aussage über individuelle Produktivität oder Wert.

**Jahrhundertperspektive:** Historische Messungen/Schätzungen und dokumentierte
Kontextmarken. Die [BIS-Forschung](https://www.bis.org/publications/financial-cycle-and-recession-risk)
untersucht längere Finanzzyklen in bestimmten Ländern/Perioden; diese Befunde
werden nicht als überall geltendes Periodengesetz verwendet.

Alle Fenster respektieren Datenlücken, Stabilitätsgrenzen, gemeinsame
Vergleichszeiträume und Mindeststichproben. Glättung darf keine fehlenden Jahre
auffüllen. Unsicherheit und Aktualitätsverlust können ein Signal unverfügbar
machen, statt es zur Mitte zu ziehen.

## 7. Offene konkrete Quellenarbeiten

1. EODHD-Entitlements und tatsächliche Historie geeigneter Sektor-/Länderindizes
   beziehungsweise ETFs prüfen; gemeinsames Abrufbudget mit Seasonality erhalten.
2. WPP-Altersdatei, Togo-Korrektur und Gebietsnoten sind inzwischen tatsächlich
   angebunden und weltweit geprüft; siehe [Demografie](DEMOGRAPHY.md).
   Weitere demografische Maße und alternative Szenarien bleiben ergänzbar.
3. UNESCO-Bildungsreihen insbesondere für China/Indien auf Aktualität,
   Definitionen und Lücken prüfen; keine automatische Ersetzung allein wegen
   ähnlicher Namen.
4. Ember-Stromdaten einschließlich Solar/Kernenergie für afrikanische Länder
   und eigene Quellenregionen sind angebunden und unabhängig geprüft; siehe
   [Stromwirtschaft](ENERGY.md). IRENA-Anlagenleistung nach Technologie und
   Netzanbindung ist zusätzlich nativ angebunden und vollständig mit den
   Originaldateien abgeglichen; siehe [Anlagenbilder](CAPACITY.md).
   Finanzierungs-, Wärme- und weitere Energiegrößen bleiben ergänzbar.
5. Damodaran-Archive und indische Indexbewertungen auf vergleichbare
   historische Klassifikationen prüfen. Quelle mit Momentaufnahme nicht als
   jahrzehntelangen Bewertungsverlauf vermarkten.
6. Maddison über die öffentliche OWID-Veröffentlichung ist inzwischen angebunden,
   global profiliert und unabhängig nachgerechnet; siehe [Historie](HISTORY.md).
   JST R6 ist nach erneutem erfolgreichem offiziellen Download ebenfalls
   angebunden: 20 historische Perspektiven für 18 Länder, mit geprüftem
   Quellenstand bis 2020. Siehe [Finanzgeschichte](MACROHISTORY.md).
   IMF-Staatsfinanzen erweitern diese Geschichte nun für 151 Länder/Gebiete
   einschließlich Indien und China, mit acht eigenen Perspektiven und
   Quellenstand bis spätestens 2024. Die tatsächliche Originaldatei ist
   vollständig gegen den nativen Cache geprüft. [Staatsfinanzen](FISCAL.md).
7. Weitere Themen in der Katalogreihenfolge mit konkreten offiziellen Reihen
   verknüpfen. Verbleibende Nischen werden mit geprüftem Fehlgrund dokumentiert.

## 8. Plugins und Werkzeuge

Vorhandene Webrecherche, lokale Skripte, Tauri/Rust/SQLite und ECharts reichen
für die geplante Grundlage. Der Skill zur Datenqualität unterstützt die
Prüfkriterien; der Visualisierungs-Skill unterstützt die anschauliche Planung.
Der Deep-Research-Skill wurde auf Anwendbarkeit gelesen, wegen seines expliziten
Aktivierungskriteriums für diesen normalen Planungsauftrag nicht angewendet.

Ein zusätzliches Broker-, Handels- oder KI-Datenplugin löst fehlende
historische Länder-Sektor-Daten nicht. Gegenwärtig ist keine neue
Plugininstallation erforderlich. Für laufende Erklärtexte genügt eine lokale,
quellengebundene Vorlagenlogik; eine zusätzliche kostenpflichtige KI-API ist
nicht erforderlich.
