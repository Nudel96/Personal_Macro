# Eurostat · Unternehmensnutzung und Wohnungsmieten

Geprüfte Originale vom 11.09.2026. Sechs zusätzliche Themen erhalten
15 Datenperspektiven aus sechs getrennt abrufbaren Eurostat-Paketen. Die
Cloud-Nutzung ergänzt außerdem das bereits vorhandene Census-Baubild.

| Paket | Zahlen | Profile | Gebiete mit Werten | Tatsächliche Perspektive |
|---|---:|---:|---:|---|
| KI-Nutzung | 401 | 104 | 35 | Mindestens eine KI-Technologie, Textanalyse und maschinelles Lernen; Erhebungen 2021, 2023, 2024, 2025 |
| Robotik | 278 | 107 | 36 | Industrie- und/oder Serviceroboter; Erhebungen 2018, 2020, 2022 |
| IT-Sicherheit | 337 | 141 | 36 | Maßnahmen nach Fragenkatalog ab 2022, getrennte Sicherung und Sicherheitstests ab 2019 |
| Elektronischer Handel | 1.323 | 111 | 37 | Elektronische Verkäufe, Web-Verkäufe und Nutzung von Online-Marktplätzen; Verkaufsjahre frühestens 2009–2024 |
| Cloud | 277 | 37 | 37 | Bezug kostenpflichtiger Cloud-Dienste; Erhebungsjahre frühestens 2014–2025 |
| Mieten | 973 | 38 | 38 | Tatsächliche Wohnungsmieten, jährlicher HICP-Preisindex, frühestens 1996–2025 |

Diese Zahlen beschreiben den Paketbestand. Nicht jedes Land hat jedes Jahr
oder jede Messgröße. Die 1.0-Statistik-API ist frei erreichbar und benötigt
keinen Schlüssel. Die [Eurostat-Nutzungsbedingungen](https://ec.europa.eu/eurostat/help/copyright-notice)
erlauben die persönliche nichtkommerzielle Nutzung mit Quellenangabe. Auswahl
und deutsche Erläuterungen sind als Darstellung von Personal Macro bezeichnet.

## Was die Bilder messen

Die Unternehmensbilder zeigen Stichprobenergebnisse für Unternehmen mit
mindestens zehn Beschäftigten einschließlich Selbständiger. Sie betreffen
den festgelegten Branchenkreis C–J, L–N und S95.1, nicht die gesamte Wirtschaft.
Ab 2021 enthält der Erhebungsrahmen auch Tierarztpraxen. Die Originaleinheit
`PC_ENT` bezieht sich auf alle erfassten Unternehmen; Nenner nur für
Internetnutzer, Cloud-Kunden oder KI-Anwender werden nicht übernommen.
Die [Erhebungsmetadaten](https://ec.europa.eu/eurostat/cache/metadata/en/isoc_e_esms.htm)
erklären Umfang, Referenzperioden, Stichproben und wechselnde Fragenmodule.

Alle Unternehmenswerte bleiben sichtbare Einzelpunkte. Aus Erhebungen mit
Abständen werden keine jährlichen Zwischenwerte erzeugt. Änderungen an
Fragenkatalogen und Länderbrüche bleiben beschrieben. Die aktuelle KI-Liste
enthält auch Bild-, Video- und Audiogenerierung; sie ist kein über Jahrzehnte
unveränderter Marktindex. Bei Robotik bleibt Unternehmensnutzung von der Zahl
der Roboter, Neuinstallationen und Roboterdichte getrennt.

Für Onlinehandel und Marktplätze ist die Zeitachse das Verkaufsjahr, also
Erhebungsjahr minus eins. Jeder Punkt nennt beide Jahre. Elektronische
Bestellung verlangt keine digitale Lieferung. Geschäftskunden, Staat und
Privatkunden sind im gewählten Gesamtindikator enthalten. Eine Plattform wird
nach Nutzung durch das befragte Unternehmen erfasst, nicht nach ihrem Firmensitz.
Die [Originalerhebung](https://ec.europa.eu/eurostat/cache/metadata/Annexes/isoc_e_simsie_lu_an_Questionnaire_EN.pdf)
unterscheidet Online-Marktplätze von Software zum Betrieb eines eigenen Shops.

Die Mietreihe verwendet das neue `prc_hicp_ainr` mit `coicop18=CP041` und
`unit=INX_A_AVG`. Sie umfasst tatsächlich gezahlte Mieten einschließlich
Haupt-/Zweitwohnungen und zugehöriger Garagen. Unterstellte Eigentümermieten,
Nebenkosten und isolierte Neuvertragsangebote sind andere Größen. Der
Jahresdurchschnitt 2025 ist 100 in jedem Land; das erlaubt einen Vergleich
der Preisentwicklung, nicht absoluter Monatsmieten. Die von Eurostat neu
veröffentlichte Historie wird verwendet, keine eigene Verkettung alter und
neuer Basen. Die [Umstellung 2026](https://ec.europa.eu/eurostat/web/hicp/information-data)
ersetzt die archivierte alte Klassifikation und Datenbanktabelle.

## Gebiete, Speicherung und Prüfung

`EL` ist Griechenland, `UK` das Vereinigte Königreich und `XK` Kosovo. Die
EU27-Gruppe ab 2020 erhält die eigene Kennung `eurostat:eu27_2020`. Historische
EU-Zusammensetzungen, wechselnder Euroraum und EWR werden nicht daran angehängt.
Keine Welt- oder Afrikaquoten werden berechnet. Länder ohne Werte, etwa die
USA und das Vereinigte Königreich im geprüften Mietpaket, erhalten kein Profil.

Der unabhängige Python-Audit rekonstruiert die mehrdimensionale JSON-stat-
Anordnung aus ihren veröffentlichten Koordinaten. Der Rust-Import prüft
Quellenhash, Dataset, Aktualisierungsstand, Dimensionen, Einheiten, Größenklasse,
Branchen, Gebiete, Zeitgrenzen, numerische Grenzen und Statuskennzeichen.
Vertrauliche `C`-Angaben bleiben ohne Wert; `u` bleibt geringe Zuverlässigkeit,
`b` ein Quellenbruch. Nicht vorhandene Zellen sind niemals nullwertige Messungen.
Verwendet werden die bestehenden öffentlichen Atlas-Cachetabellen, atomare
Paketspeicherung, gemeinsame Abrufsperre und 24 Stunden Mindestabstand.

`evidence/build_public_eurostat.py` erzeugt Verträge und
`evidence/public-eurostat-audit.json`. Der native Originaltest vergleicht alle
Profile mit der unabhängigen Rekonstruktion und liest sie nach dem erneuten
Öffnen einer temporären SQLite-Datenbank zurück. Manipulierte Gebiete, Einheiten,
Indizes und Zukunftsjahre werden abgewiesen; echte Null bleibt zulässig.
Status von Import, nativer Bedienprüfung und Windows-Build steht im ursprünglichen
40-Themen-Ledger; die Recherche allein zählt nicht als abgeschlossene Anbindung.
