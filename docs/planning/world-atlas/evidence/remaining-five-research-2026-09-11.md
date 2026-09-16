# Noch nicht abgenommene Quellenkandidaten

Diese Notizen sind Research, keine Implementierungsabnahme. Der Original-Ledger
bleibt maßgeblich. Nach GFDD sind noch folgende fünf Themen zu bearbeiten.

## Wirtschaftspolitische Regime

Primärquelle: Aizenman / Chinn / Ito, Trilemma-Indizes, Veröffentlichung
31.08.2021. Drei ausdrücklich verschiedene Dimensionen: geldpolitische
Unabhängigkeit, Wechselkursstabilität und rechtliche Kapitalverkehrsoffenheit.
Das bildet einen internationalen wirtschaftspolitischen Rahmen, keine
vollständige Typologie aller Wirtschaftspolitik.

- Seite: https://web.pdx.edu/~ito/trilemma_indexes.htm
- Original: https://web.pdx.edu/~ito/trilemma_indexes_update2020.xlsx
- Methoden: https://web.pdx.edu/~ito/ReadMe_trilemma_indexes2014.pdf
- Lokal: `apps/desktop/.tmp/atlas-remaining-40/aci-trilemma-2020.xlsx`
- SHA256: `3091a6f2de4656d3f07155de1b7a96b5b6680ffb1a7a3d77ca1acd4fdd2f7107`

Eine Tabelle, 12.077 Zeilen, 199 Quellenidentitäten, sechs Spalten:
IMF-World Bank Country Code / year / Exchange Rate Stability Index /
Monetary Independence Index / Financial Openness Index / Country Name.
Numerische Werte sind alle 0–1. Kalender 1960–2020; tatsächliche Abdeckung
je Dimension geringer. Quellenfeld MI enthält bereits eine gleitende Glättung
mit Vorjahr und Folgejahr. Konstanten Zinsen können einen Modellwert 0,5
erzeugen; nicht automatisch politische Neutralität. ERS verwendet Schwellen.
KAOPEN ist de jure, keine beobachtete Kapitalflussmenge. Keine eigene
Gesamtnote oder erzwungene Summe 1 aus den drei Achsen erzeugen.

USA fehlt laut Methodenpapier. Euro_Area, Netherlands Antilles,
Czechoslovakia und historische Gebietsänderungen brauchen Prüfung; keine
Nachfolgestaaten-Zuordnung. Die GFDD-Originaldatei enthält als unabhängige
Identitätshilfe IMF-Codes, ISO3 und Namen für 214 Länder; Namen trotzdem prüfen.
Die Quelldatei hat beschädigte Namen für Côte d'Ivoire und São Tomé.

Eine neuere eigenständige KAOPEN-Version wurde ebenfalls gefunden:
https://web.pdx.edu/~ito/Chinn-Ito_website.htm, veröffentlicht 18.01.2026,
https://web.pdx.edu/~ito/kaopen_2023.xls (`chinn-ito-2023.xls` lokal),
https://web.pdx.edu/~ito/Readme_kaopen2023.pdf. 1970–2023. Jede Ausgabe berechnet
die gesamte Vergangenheit neu; nicht in das 2020-Trilemma einkleben.
Alle Autoren nennen eine verpflichtende Quellenzitierung bei Nutzung.

## Geld- und Währungssysteme

JST R6 ist bereits als eigener Atlas-Datensatz vorhanden. Der rohe Originaldownload
liegt unter `apps/desktop/.tmp/atlas-validation/macrohistory/raw/JSTdatasetR6.xlsx`.
`macrohistory-catalog.json` enthält den geprüften Originallink und SHA256.
18 Länder, 1870–2020, 2.718 Zeilen. Noch nicht als geldgeschichtliche
Kategorien dargestellte Spalten:

- peg: 1 (1658), 0 (1010), leer (50);
- peg_strict: 1 (1404), 0 (1264), leer (50);
- peg_type: PEG (1582), FLOAT (961), BASE (125), leer (50);
- peg_base: GBR (763), HYBRID (364), USA (720), DEU (618), NA (203), leer (50).

`macrohistory_source.rs` überspringt aktuell die Textfelder `peg_type` und
`peg_base`, daher sind sie nicht im vorhandenen Cache. Eine Erweiterung muss
Originaldatei und Herkunft erneut prüfen. Kategorien dürfen nicht als
numerische Wertungswelle erscheinen. Peg/Anker bedeutet nicht automatisch
Golddeckung, und NA ist ein Quellenlabel, nicht dasselbe wie leere Zelle.
Die Unterschiedlichkeit der vier Felder ist vor Nutzung gegen Dokumentation
und Methodenpapier zu prüfen.

Dokumentation: https://sfff5b3ac9317c4be.jimcontent.com/download/version/1676279836/module/9834516169/name/JST_documentationR6.pdf
(Release Juli 2022, CC BY-NC-SA 4.0, nichtkommerzieller persönlicher Gebrauch).
Breitere neuere Klassifikation: https://carmenreinhart.com/exchange-rate/,
Ilzetzki/Reinhart/Rogoff 1946–2016. Downloadlink des Jahresdatensatzes ist
vorhanden, bisher kein nutzbarer Download geprüft. JST bietet längere Geschichte.

## Neue Materialien

Die aktuelle EU-Studie vom 01.09.2026 liegt als
`apps/desktop/.tmp/atlas-remaining-40/eu-materials-2026.pdf` vor.
Portal: https://op.europa.eu/en/publication-detail/-/publication/18eaba28-a5ac-11f1-b25c-01aa75ed71a1/language-en
Originaldownload: https://op.europa.eu/o/opportal-service/download-handler?identifier=18eaba28-a5ac-11f1-b25c-01aa75ed71a1&format=pdf&language=en&productionSystem=cellar&part=

PDF Seite 17, Tabelle 1: sechs Zeilen (fünf Sektoren plus deduplizierte
Gesamtzahl), drei Prioritätsregionen (EU/US/China), jeweils Unternehmenspatente
und Triadenanteil. Zeitraum 2010–2024 insgesamt, keine Jahresreihe.
Ein korrektes Produktbild müsste als 15-Jahres-Fenstervergleich ohne
scheinbare Jahresachse erscheinen. PDF-Parser ist im Rust-Stack bereits
vorhanden (`pdf-extract = 0.12.0`). Deutsche Sektorlabels: Bau, Elektronik,
Energie, Medizintechnik, Mobilität. Sektorwerte überlappen und dürfen nicht
zur Gesamtzahl summiert werden.

Seite 70 beschreibt die Methodik: Familie nach frühester Patentzuständigkeit,
nicht nach Wohnsitz; nur eindeutige einzelne Prioritätsregion in den Tabellen.
EU bedeutet EU27-Patentämter plus EPA, daher keine Gleichsetzung mit
Erfinderherkunft oder heutiger EU-Region. Unternehmen hat bei gemischten
Anmeldertypen Vorrang vor Universität. Tabelle 5 (Universitäten) auf Seite 21
hat eine zweifelhafte Zelle `01%` für chinesische Medizintechnik; nicht reparieren.
Tabelle 10 enthält weitere Zitationsmaße, aber keine notwendige Ergänzung.

UKIPO-CSV zu Metamaterialien enthält nur Veröffentlichungsnummern, keine
ausreichenden Jahres-/Herkunftswerte. Nicht als Patentgeschichte verwenden.

## Synthetische Kraftstoffe

Sasol bietet echte Produktionsdateien öffentlich an:
https://www.sasol.com/investor-centre/financial-results.
Lokale Original-URLs/Hashes in `apps/desktop/.tmp/atlas-remaining-40/sasol-downloads.json`.
`sasol-production-2026.xlsx` ist das am 30.06.2026 endende Geschäftsjahr;
`sasol-production-2022.xlsx` enthält FY2020–FY2022. Weitere Originaldateien
für 2023–2025 sind auf derselben Seite verlinkt. Keine finale Quellenauswahl.

2026-Blatt Fuels:
- Zeile 9: Secunda Operations total refined, mm bbl, FY2026 30.6, 2025 27.6,
  2024 29.1. Spalten H/I/J sind volle Geschäftsjahre, E/F nur Quartale.
- Zeile 11: ORYX GTL production, mm bbl, 3/5/2.9.
- Zeile 5 Gesamtproduktion kt enthält Chemieprodukte und ist keine reine
  Kraftstoffmenge. Zeile 6 Fuels enthält white und black products.

2022-Blatt Fuels:
- Zeile 13: Synfuels total refined product, mm bbl, FY2022 29.2, 2021 32.1,
  2020 31.2 (Spalten F/G/H).
- Zeile 20: ORYX GTL Production, mm bbl, 5.16/4.67/3.31.

Abgrenzung Secunda/Sasolburg und Unternehmensanteil bei ORYX müssen vor
Nutzung geprüft werden. Keine Summe als gesamte Produktion Südafrikas oder
Katars ausgeben; fossile Synthese ist keine erneuerbare E-Fuel-Produktion.
Natref verarbeitet Rohöl und bleibt ausgeschlossen. Jahres-/Quartals- und
Geschäftsjahrsgrenzen beachten. Datei `sasol-analysts-2026.xlsx` ist überwiegend
Finanzdaten; ein Blatt hat extreme Formatdimensionen (701445 × 16323),
daher nicht unbeschränkt mit OpenPyXL iterieren.

Weitere Primärquellen: DMRE Energy Sector Reports 2023/2024/2025, IEA Hydrogen
Production and Infrastructure Projects Database. Letzteres unterscheidet
angekündigte Projekte und Betrieb; eine heutige Liste darf keine historische
Produktionsmenge vortäuschen. DMRE-Berichte nennen nationale Syntheseanlagen,
aber eine passende lange Originaltabelle wurde noch nicht gefunden.

## Sektoren im Marktvergleich

Vorhandene 26 EODHD-Fondsproxies können Daten liefern. Vergleichsmarkt,
Währung, Kalender und Ausschüttungsbehandlung müssen gemeinsam passen.
Keine Subtraktion separat normalisierter Marktwellen. Native Rezept- und
UI-Erweiterung noch nicht begonnen; keine weitere kostenpflichtige API nötig.
