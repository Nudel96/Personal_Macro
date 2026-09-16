# Öffentliche Dienstleistungen, Nahverkehr und Wohnungsbestand

Quellenprüfung: 11.09.2026. Drei weitere Themen des ursprünglichen Auftrags.
Den Status von Originalprüfung, echtem Import, Bedienprüfung und Windows-Build
führt `evidence/remaining-40-ledger.json` getrennt.

## Öffentliche Dienstleistungen und Nahverkehr · UN SDG

Die feste UN-Ausgabe `2026.Q2.G.02` liefert fünf zusätzliche Perspektiven:

| Messgröße | Code | Gebiete mit Werten | Beobachtungen bis 2025 |
|---|---|---:|---:|
| Gesamtzufriedenheit mit Behördenleistungen | SP_PSR_OSATIS_GOV | 46 | 75 |
| Gesamtzufriedenheit mit Gesundheitsdiensten | SP_PSR_OSATIS_HLTH | 148 | 491 |
| Gesamtzufriedenheit mit Primarschulen | SP_PSR_OSATIS_PRM | 12 | 25 |
| Gesamtzufriedenheit mit Sekundarschulen | SP_PSR_OSATIS_SEC | 44 | 68 |
| Erreichbarkeit öffentlicher Verkehrsmittel | SP_TRN_PUBL | 29 | 71 |

Alle fünf verwenden beide Geschlechter, alle Altersgruppen und die veröffentlichte
Gesamtgruppe. Zufriedenheit verwendet die Gesamtfrage `OSATIS`, keinen selbst
berechneten Durchschnitt der fünf Qualitätsmerkmale. Die enthaltenen
Statistikamts-, OECD- und Gallup-Befragungen unterscheiden sich in Fragen,
Teilnehmerkreis und Antwortskala. Vier Dienste bleiben deshalb getrennt und
ohne gemeinsamen Ländervergleich. Armeniens Primarschulreihe meldet beispielsweise
das gesamte Bildungssystem als Ersatz; der Originalhinweis bleibt erhalten.
Zufriedenheit ist eine befragte Erfahrung oder Wahrnehmung, kein objektiver
Leistungsindex. [UN-Metadaten 16.6.2](https://unstats.un.org/sdgs/metadata/files/Metadata-16-06-02.pdf).

Nahverkehr übernimmt ausschließlich `Cities=NOCITI` ohne einzelne Stadt oder
Sonderuntergruppe. Es werden keine Stadtwerte zu einem Land zusammengerechnet.
Der UN-Standard verwendet 500 Meter Fußweg zu kleineren Verkehrssystemen oder
einen Kilometer zu Bahn, Metro und Fähre. Nationale Reihen können auf
Stadtstichproben beruhen. Erreichbarkeit beschreibt weder Fahrgastzahlen noch
Umsatz oder Verkehrsanteile. Abweichende Gebietsabgrenzungen und unvollständig
erfasste informelle Netze bleiben Quellenhinweise. Die Weltwerte sind
veröffentlichte UN-Aggregate. [UN-Metadaten 11.2.1](https://unstats.un.org/sdgs/metadata/files/Metadata-11-02-01.pdf).

Die 730 Beobachtungen wurden zweimal unabhängig abgeglichen: einmal aus den
vollständigen Serien mit 5.000 Zeilen je Seite, einmal mit der nativen Seitengröße
1.000. Für diese fünf Serien liefert selbst ein einzelner serverseitiger
Dimensionsfilter HTTP 500. `unfiltered=true` lädt deshalb vollständige Seiten;
die exakte Dimensionsauswahl und Jahresgrenze werden weiter lokal geprüft.
Die bisherigen 33 SDG-Reihen behalten ihre erprobte Abrufart. Keine
Fehlerantwort wird als leere Datenreihe übernommen.

Der native Test vergleicht alle zusätzlichen Werte und vollständigen
Quellenkennzeichen einschließlich Fußnoten nach SQLite-Wiederöffnung. Zusammen
mit den früheren 33 Reihen umfasst die Originalprüfung nun 80.641 endliche Werte.
Alle Erhebungen bleiben einzelne Punkte. Zahlen sind optional; Quellenhinweise
bleiben erreichbar. Es gibt keine neue Cachemigration.

## Wohnungsbestand · OECD

Die veröffentlichte Tabelle `HM1.1.A1` der Ausgabe vom 15.04.2024 enthält
43 Gebiete mit 86 Profilen und 248 Werten. Gesamtbestand und die veröffentlichte
Relation je 1.000 Einwohner bilden zwei eigene Perspektiven. Sie zeigen den
Wohnungsbestand, einschließlich bewohnter und unbewohnter Wohnungen, keine
aktuellen Inserate oder freie Mietobjekte. Es wird keine eigene Bevölkerungsquote
berechnet. [OECD HM1.1, Originalmetadaten](https://webfs.oecd.org/Els-com/Affordable_Housing_Database/HM1-1-Housing-stock-and-construction.pdf).

Die tatsächlichen Bezugsjahre aus den Spalten K–M gelten: Deutschlands letzter
Wert ist 2021, Frankreichs 2019; Schwedens erste Beobachtung stammt aus 2017.
Die Überschriften „um 2011“, „um 2018“ und „2022 oder zuletzt verfügbar“ sind
keine Ersatzjahre. Fünf vollständig undatierte Länderblöcke werden für beide
Perspektiven ausgelassen. Korea bleibt ein einzelner Quellenpunkt aus 2013.
Historische Arbeitsblätter werden nicht mit der publizierten Tabelle vermischt.

Die britische Quellenzeile gilt nur für England und verwendet
`oecd:england`; sie wird weder dem Vereinigten Königreich noch Welt zugeordnet.
Zyperns staatlich kontrolliertes Quellengebiet, Kolumbiens Projektionen,
Spaniens Schätzungen und die originalen Tabellenhinweise bleiben sichtbar.
Länder verwenden unterschiedliche nationale Erfassungen.

Python prüft die veröffentlichten Excel-Zahlen zusätzlich gegen ihre originalen
XML-Zellen. Rust prüft Hash, Blatt, Überschriften, jede Länderidentität, tatsächliche
Jahre, Einheiten und alle 248 Zahlen. Die 86 Profile werden nach temporärer
SQLite-Wiederöffnung verglichen. Ganzzahlige Bestände und echte Null bleiben
von leeren Zellen getrennt. Der produktive Import verwendet das bestehende
atomare öffentliche Quellenpaket mit gemeinsamer Sperre und 24-Stunden-Abstand.

Nachweise: `evidence/sdg-services-audit.json`,
`evidence/public-housing-stock-audit.json` und die ergänzenden lokalen sowie
nativen Abnahmen im Ledger.
