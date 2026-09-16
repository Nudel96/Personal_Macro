# Zusätzliche öffentliche Quellenbilder

**Aktueller Gesamtstand 15.09.2026:** 59 Quellenpakete und 342 Perspektiven.
Die [weltweite Erweiterung](GAP-EXPANSION.md) beschreibt die jüngsten 25 Pakete
und ihre unabhängige Prüfung. Die folgenden Tabellen dokumentieren frühere
Ausbaustände mit den jeweils genannten Datumsangaben.

Stand: 11.09.2026. Teil des laufenden Auftrags für die ursprünglich 40 offenen
Katalogthemen; die vollständige Liste und der jeweilige Prüfstatus stehen in
`evidence/remaining-40-ledger.json`.

Die ersten neun Themenanbindungen verwenden kostenlose Originalveröffentlichungen:

| Thema | Originalquelle | Tatsächlicher Umfang | Bedeutung |
|---|---|---|---|
| Schuldendienst | BIS WS_DSR | 32 Länder, 66 Reihen, 7.116 Quartalswerte, 1999-Q1 bis 2025-Q4 | Zinsen und Tilgung relativ zum Einkommen; privater nichtfinanzieller Sektor, Haushalte und Unternehmen getrennt. Modellannahmen begrenzen Niveauvergleiche. |
| Reallöhne | OECD AV_AN_WAGE | 38 Länder, 1.298 Jahreswerte, frühestens 1990 bis 2025 | Durchschnittlicher Bruttojahreslohn je abhängig Beschäftigtem in Vollzeitäquivalenten; Preise und Kaufkraftparitäten 2025. |
| Arbeitszeit | OECD DF_AVG_ANN_HRS_WKD | 45 Länder, 89 Reihen, 3.722 Werte und eine fehlende Zelle, frühestens 1950 bis 2025 | Tatsächlich geleistete Jahresstunden; Erwerbstätige und Arbeitnehmer getrennt. Länderdefinitionen schränken direkte Niveauvergleiche ein. |
| Institutionelle Indikatoren | World Bank WGI, Revision 2025 | 215 Länder/Gebiete, 1.286 Reihen, 32.319 Schätzwerte, 1996 bis 2024 | Sechs Wahrnehmungsdimensionen mit absoluten 0–100-Scores und veröffentlichten 90%-Unsicherheitsintervallen. |
| Kaufkraftvergleiche | WDI PA.NUS.GDP.PLI und PA.NUS.PRVT.PLI | 204/208 Länder und Gebiete, 13.346 Jahreswerte, 1990–2025 | Preisniveau der Gesamtwirtschaft und des privaten Konsums gegenüber USA = 100; ICP-Schätzungen mit Fortschreibungen, keine faire Währungsbewertung. |
| Cloud und Rechenzentren | U.S. Census, Private NSA | USA, 151 Monatswerte, 2014-01–2026-07 | Erbrachte private Bauleistung an Rechenzentren in laufenden Millionen USD; ohne Saisonbereinigung. |
| Logistikimmobilien | U.S. Census, Private NSA | USA, drei Perspektiven mit je 403 Monatswerten, 1993-01–2026-07 | Lagergebäude insgesamt, gewerbliche Lager-/Verteilgebäude und Selbstlagerzentren bleiben getrennt. Bauausgaben sind keine Immobilienpreise. |
| Elektromobilität und Ladeinfrastruktur | IEA Global EV Outlook 2026 | 61 Länder, Welt und neun eigene Regionen; 736 Profile, 8.649 Werte, frühestens 2010–2025 | Zehn Pkw-Perspektiven zu Bestand, Verkäufen und Anteilen; drei originale Klassen öffentlicher Ladepunkte. Historische Daten, keine Zukunftsszenarien. |
| KI, Robotik, IT-Sicherheit, Onlinehandel, Plattformen, Cloud und Mieten | Eurostat | 15 Perspektiven, 538 Profile, 3.589 Zahlen und 998 fehlende Zellen | Befragungen von Unternehmen bleiben einzelne Punkte; Mietindex mit Basis 2025 = 100, keine absoluten Mietpreise. Details: `EUROSTAT.md`. |
| Zement, Lithium und Seltene Erden | British Geological Survey | 13 Perspektiven, 114 Profile, 2.238 Zahlen und zehn fehlende Werte | Fertigzement/Klinker, Mineral-/Produktmengen und veröffentlichter Lithiumgehalt bleiben getrennt. Echte Nullproduktion und Schätzungen sind gekennzeichnet. Details: `BGS.md`. |
| Wohnungsbestand | OECD HM1.1.A1 | 43 Gebiete, 86 Profile und 248 Werte in zwei Perspektiven | Gesamtbestand und veröffentlichte Quote je 1.000 Einwohner; tatsächliche Bezugsjahre, eigenes England-Gebiet. Details: `SERVICES-AND-HOUSING.md`. |
| Bioenergie, Wärmepumpen und Fernwärme | Eurostat nrg_cb_rw / nrg_inf_hptc / ilc_lvhe02 | Sechs Perspektiven, 242 Profile, 3.142 eindeutige Zahlen; Energiegebiete 42, Fernwärmegebiete 32 | Primärerzeugung, thermische Leistung und personengewichtete Fernwärmenutzung getrennt. Mehrdeutige Quellen-Nullen bleiben ohne Zahlenpunkt. Details: `ENERGY-EXTENSIONS.md`. |

Der gemeinsame öffentliche Katalog umfasst damit 65 Perspektiven in 19
Quellenpaketen. Die fünf zusätzlichen UN-SDG-Dienstereihen verwenden weiter
die jährlichen Statistiktabellen und zählen separat.

Länderreihen enden unterschiedlich. Die Zeitgrenzen in dieser Tabelle beschreiben
den Gesamtbestand, keine vollständige Historie für jedes Land.

## Herkunft und Übernahme

`public-series-catalog.json` benennt jede freigegebene URL, den geprüften Hash,
Zeitraum, Originalgebietscode und die jeweilige Messgröße. Die eigenständigen
Python-Audits unter `evidence/build_public_*.py` lesen die Originaldateien und
prüfen die Werte unabhängig vom Rust-Import. Die Rohdateien bleiben im ignorierten
Prüfverzeichnis `.tmp/atlas-remaining-40`.

`public_source.rs`, `public_oecd.rs`, `public_wgi.rs`, `public_census.rs` und
`public_iea.rs` übernehmen ausschließlich
diese Quellenverträge. SHA-256, Spalten, Einheiten, Frequenzen, Gebietsnamen,
Preisbasen, Beschäftigtengruppen und doppelte Beobachtungen werden geprüft.
Bei einer veränderten Veröffentlichung bleibt der vorige Stand erhalten, bis
die neue Fassung geprüft und freigegeben wurde. Die OECD-CSV nennt kein
Veröffentlichungsdatum; die UI weist es als nicht angegeben aus und nennt den
Prüftag getrennt.

Atlasmigration `0022_public_series.sql` ergänzt ausschließlich den öffentlichen
Atlas-Cache. Ein vollständiges Quellenpaket wird atomar ausgetauscht. Alle Pakete
verwenden die gemeinsame Atlas-Abrufsperre und mindestens 24 Stunden Abstand.
Die Funktion zum Laden fehlender Atlas-Inhalte berücksichtigt diese Pakete.
Der Browser stellt das Verzeichnis dar und erfindet keine lokalen Werte.

Die zwei Preisniveauindizes nutzen den bestehenden validierten WDI-Import und
die jährlichen Cachetabellen. Die WDI-Veröffentlichung vom April 2026 ersetzt
die alte archivierte Reihe `PA.NUS.PPPC.RF` (USA = 1) durch die neuen Indizes
(USA = 100). Der native Test vergleicht alle 13.346 importierten Zahlen mit
unabhängig geladenen Originalen. Die Fortschreibung bis 2025 bleibt als
Modellschätzung erkennbar; für Welt wird kein eigener Durchschnitt berechnet.

Census prüft das Blatt `Private NSA`, alle freigegebenen Spalten und den
Veröffentlichungsstand 01.09.2026. Vorläufige und revidierte Monate bleiben
gekennzeichnet; die vor 2014 nicht ausgewiesenen Rechenzentren werden nicht mit
Null aufgefüllt. IEA prüft historische Kategorie, Einheit, Verkehrsmittel,
Antrieb und explizite Gebietsschlüssel. Fünf auffällige Prozentwerte bei Vans
sind im unabhängigen Audit dokumentiert; Vans gehören nicht zur freigegebenen
Pkw-/Ladepunktauswahl. Gerundete Originalbestände werden nicht aus Komponenten
neu summiert. Auch geschätzte nicht ganzzahlige Anzahlen bleiben erhalten.
Die IEA-Bezeichnungen für Schnell- und Ultraschnellladen überlappen textlich
bei 150 kW; die veröffentlichten Gruppen werden unverändert übernommen.

## Anzeige und Gebiete

Quartale bleiben Quartale, Monate bleiben Monate. Es gibt keine Kompression in
scheinbare Jahreswerte. Verbindungen entstehen nur zwischen direkt aufeinander
folgenden Beobachtungen; Nullwerte, fehlende Zellen, fehlende Perioden und
Reihenbrüche bleiben unterscheidbar. Zahlen und Wertetooltips sind optional.

Vergleichsländer verwenden denselben Kalender. Bei identischen Definitionen
teilen sie einen Maßstab; für BIS-Schuldendienst und OECD-Arbeitszeit bleiben
die Landesverläufe mit eigenen Maßstäben getrennt und entsprechend bezeichnet.
WGI bleibt auf seiner veröffentlichten absoluten 0–100-Skala. Unsicherheitsbalken
bleiben auch bei ausgeschalteten Zahlen sichtbar.

Die nicht gebundene OECD-Ländergruppe wird nicht Welt genannt. Die ehemaligen
Niederländischen Antillen werden nicht Nachfolgestaaten zugeschlagen. WGI-Code
ADO ist ausdrücklich Andorra. Fehlende Haushaltsreihen etwa für Indien werden
nicht mit der privaten Gesamtquote ersetzt. Bei nicht enthaltenen Gebieten kann
der Benutzer ein tatsächlich verfügbares Quellenland auswählen.

`publicSource`, `publicMetric` und `publicSince` gehören zum gespeicherten
Merkkontext. Quellenname, Veröffentlichungsangabe, Rezept und Originalhash werden
mit der Ansicht gespeichert. Die Abdeckungsübersicht zählt nur lokal vorhandene
Werte der konkreten Messgröße als verfügbares Bild.

## Prüfung der ersten vier Themen

Vor der nativen Bedienprüfung:

- Alle vier Originaldateien werden vollständig geparst, in temporäre SQLite-
  Datenbanken geschrieben und nach erneutem Öffnen mit den Ausgangsprofilen
  verglichen. Separate Prüfungen decken andere Einheiten, falsche Gebiete,
  falsche Preisbasis, doppelte Perioden und veränderte Quelldateien ab.
- Die Ansicht muss die vier Datenpfade, jede Perspektive, Zeitraumwechsel und
  Zahlen an/aus/ausgangszustand über echte Bedienelemente zeigen.
- Native Prüfung im eigenen Testprofil mit Kopie ausschließlich des öffentlichen
  Atlas-Caches: Deutschland, Indien, Kolumbien, Andorra und nicht enthaltene
  Welt-/Regionsansichten; Wechsel zwischen Regionen über den Quellengebietwähler.
- WGI-Unsicherheitsbalken und 0–100-Maßstab, OECD-Kolumbien 2025 ohne erfundenen
  Stundenwert, fehlende Haushaltsreihe Indien und frei bleibende WGI-Jahre vor
  2002 sind gezielte Gegenprüfungen.
- Vergleich mit zwei Ländern, Merken/Wiederöffnen, Abdeckungsnavigation,
  Quelleninformationen und 24-Stunden-Abrufsperre werden geprüft.
- Eigener visueller Durchgang bei Startgröße und Mindestbreite 1024 px,
  anschließend kurze freie Bedienprüfung. Ergebnisse und Screenshots werden
  erst nach Durchführung in der Fortschrittsliste vermerkt.

Die vollständige Abnahme aller ursprünglich 40 Themen bleibt ein gesonderter,
noch laufender Auftrag.

Die nächste Gruppe ist unter `evidence/public-second-qa-inventory.md`
beschrieben. Die echten lokalen Importe sind in
`evidence/public-second-local-fill-2026-09-11.json` belegt: zusätzlich 23.355
Werte. Vollständige Originaltests für Census, IEA und WDI mit temporärem
SQLite-Wiederöffnen bestehen. Alle 286 Atlas-Frontendtests, TypeScript und
Clippy bestehen. Die ersten neun Themen sowie die sechs neuen Eurostat-Themen
und drei BGS-Themen sind inzwischen nativ geprüft und in einer regulären
Windows-Version gebaut. Der jüngste BGS-Nachweis ist
`evidence/public-bgs-windows-release-2026-09-11.json`.
Die drei nächsten Themen (UN-Dienstleistungen, Nahverkehr und OECD-Wohnungsbestand)
sind ebenfalls vollständig importiert, nativ geprüft und gebaut. Nachweise:
`evidence/services-housing-native-qa-2026-09-11.json` und
`evidence/services-housing-windows-release-2026-09-11.json`. Der ursprüngliche Auftrag bleibt bis zur Abnahme aller
40 Themen offen.

Abnahme 11.09.2026: Auch die drei Eurostat-Energiepakete sind tatsächlich lokal
geladen und in der nativen App geprüft. Der reguläre Windows-Build ist fertig;
Nachweise: `evidence/public-energy-local-fill-2026-09-11.json`,
`evidence/public-energy-native-qa-2026-09-11.json` und
`evidence/public-energy-windows-release-2026-09-11.json`. Damit sind 24 der
ursprünglichen 40 Themen vollständig abgenommen.

Eurostat SBS ergänzt sechs Perspektiven mit 1.482 Zahlen: Unternehmensdienste
2005–2020 und 2021–2024 sowie persönliche Dienste 2021–2024. Die
Klassifikationsgrenze 2008 und der EBS-Wechsel 2021 werden nicht verkettet.
Der öffentliche Katalog enthält damit 71 Perspektiven in 21 Quellenpaketen.
Details und Prüfverfahren: [BUSINESS-SERVICES.md](BUSINESS-SERVICES.md).

OECD TiVA ergänzt 83 Perspektiven: zwei Wertschöpfungsanteile und 81 auswählbare
Auslandspartner einschließlich des separat benannten Rests der Welt. Die
modellierte Geschichte 1995–2022 umfasst 80 Länder, 6.560 Profile und 183.680
Quellwerte. Die Partnerübersicht verwendet dasselbe Kalenderjahr und die
Originalanteile. Eigenland und überlappende Gruppen werden nicht umgedeutet.
Aktueller Katalog: 154 Perspektiven in 23 Quellenpaketen.
Details: [TRADE-NETWORKS.md](TRADE-NETWORKS.md).

WITS ergänzt den ausdrücklich gespiegelten Export-Produktkonzentrationsindex
für 238 Länder/Gebiete und den veröffentlichten Weltindex. 7.739 Werte aus
1988–2022 und zwei leere Zellen bewahren den Stand 11.03.2023; 2022 bleibt
wegen stark unvollständiger Meldungen als markierter Einzelpunkt stehen.
ND-GAIN 2026 ergänzt zehn Klimaperspektiven für 192 Länder und 49.842 Werte.
Historische Modellreihen und feste Zukunftsprojektionen erhalten unterschiedliche
Bilder; die Klimaexposition hat keine scheinbare Jahresgeschichte. Alle Länder
teilen die feste Skala 0–1. Details: `CLIMATE.md`.

Aktuell: 265 Perspektiven in 34 Quellenpaketen.

Fossile Synthesekraftstoffe: vier Anlagenperspektiven, 36 Fakten seit 2014 aus sechs originalen Sasol-Berichten. [Geschäftsjahre, Quellen und Grenzen](SYNTHETIC-FUELS.md).

Neue Materialien: zwölf Originalperspektiven für drei Patent-Prioritätsgebiete im gesamten Fenster 2010–2024. [Quelle, Darstellung und Grenzen](ADVANCED-MATERIALS.md).
Details: [EXPORT-CONCENTRATION.md](EXPORT-CONCENTRATION.md).

BIS-Gewerbeimmobilien ergänzt 65 Originalpreisreihen für 24 Länder und die
feste Euroraum-Gruppe mit 20 Ländern: 5.586 Zahlen, 649 explizite Lücken und
getrennte Jahres-, Halbjahres-, Quartals- und Monatskalender. Länder- und
Städtereihen behalten ihre Preisbasen. Der Vergleich verwendet eine eigene
Originalreihenauswahl und unabhängige Maßstäbe. Details: [COMMERCIAL-PROPERTY.md](COMMERCIAL-PROPERTY.md).


EIA ergänzt fünf Speicherperspektiven und 69 Originalwerte für die USA.
Bestand 2003–2023, Zubau und Kohortendauer 2015–2023. Planwerte bleiben
ausgeschlossen. Quelle und Umsetzung: [Batteriespeicher](BATTERY-STORAGE.md).

EPA-Archivstudien ergänzen sieben Patentperspektiven für Quantensensorik
(2000–2017, 72 Werte) und Raumfahrt (1990–2017, 370 Werte und 414 Lücken).
Welt, Patentzuständigkeit, Schutzgebiet und Anmelderherkunft bleiben getrennt.
Historische Patentaktivität ist keine heutige Branchenbewertung.
Quelle und Umsetzung: [Quanten- und Raumfahrtpatente](EPO-PATENTS.md).

Weltbank GFDD ergänzt zwei historische Börsenkonzentrationsbilder für 60 Länder
und Gebiete: 1.829 Werte und 931 offene Jahreszellen, 1998–2020, Archiv 2022.
Marktkapitalisierung und Handel außerhalb der jeweiligen Top 10 bleiben getrennt.
Quelle und Umsetzung: [Börsenkonzentration](MARKET-CONCENTRATION.md).

ACI ergänzt drei getrennte Forschungsindizes für 183 Quellenländer, 532 Profile und 24.641 Originalwerte. Die Ausgabe 2021 bleibt unvermischt; 7.803 fehlende Beobachtungen bleiben offen. Quelle und Umsetzung: [Wirtschaftspolitischer Rahmen](TRILEMMA.md).

JST R6 ergänzt weite und strenge Wechselkursbindung für 18 Länder von 1870–2020: 36 Profile, 5.336 klassifizierte Länderjahre, 100 Lücken. Die Darstellung verwendet historische Jahresklassen und bewahrt Modellrolle sowie Bezugsbasis. Quelle und Umsetzung: [Geld- und Währungssysteme](MONETARY-SYSTEMS.md).
