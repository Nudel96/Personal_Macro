# Stationäre Batteriespeicher

Die fünf Datenbilder verwenden die frei veröffentlichte EIA-Arbeitsmappe
`2024 Battery Storage Figures.xlsx`, verlinkt am 17. März 2026. Der Dateiname
ist kein Datenjahr: Die ausgewählten Tabellen nennen ausdrücklich **2023 Final
Data**. Figure 1b enthält tatsächliche Tabellenjahre 2003–2023, obwohl ihre
Überschrift 2010–2023 nennt. Die vollständige veröffentlichte Tabellenreihe
bleibt erhalten.

Die Quelle erfasst stationäre, netzsynchronisierte Großbatterien an Standorten
ab 1 MW Nennleistung in den Vereinigten Staaten. Sie liefert keine Werte für
Indien, Deutschland, Afrika oder Welt. Kleine Heimspeicher, Fahrzeugbatterien
und andere Speichertechnologien werden nicht ergänzt oder mitgezählt.

Die Perspektiven trennen:

- veröffentlichte kumulierte Nettoleistung in MW, 2003–2023;
- veröffentlichte kumulierte speicherbare Energie in MWh, 2003–2023;
- Leistung neu installierter Anlagen in MW, 2015–2023;
- Speichermenge neu installierter Anlagen in MWh, 2015–2023;
- veröffentlichte durchschnittliche Entladedauer der jeweiligen neuen
  Installationskohorte in Stunden, 2015–2023.

Bestand und Zubau bleiben unterschiedliche Bilder. MWh sind hier speicherbare
Energie, kein jährlicher Stromdurchsatz. Die Dauer neuer Anlagen ist keine
mittlere Dauer des Gesamtbestands. Weder Werte noch aktuelle Betriebsfähigkeit
werden aus einem heutigen Anlagenverzeichnis in die Vergangenheit zurückgerechnet.
Die Originaldatei enthält lange Nachkommastellen; deren unveränderte Speicherung
behauptet keine entsprechend hohe Messgenauigkeit.

Figure 6 enthält eine ausdrücklich mit „planned“ bezeichnete Erweiterung bis
2025. Sie wird nicht als realisierter Ausbau übernommen. Andere Blätter mit
Kosten, US-Netzregionen oder kleinen Speichern werden ebenfalls nicht zu
passenden Landeswerten umgedeutet. Die JRC-Karte für Europa und IEA-Charts wurden
als weitere Quellen geprüft. Der JRC-Export war nicht erreichbar; der geprüfte
IEA-Chart bietet ausdrücklich keinen Datendownload. Diese Kandidaten zählen
nicht als importierte Daten.

`evidence/build_public_eia_storage.py` prüft Metadaten mit OpenPyXL und liest
die ursprünglichen Dezimaltexte unabhängig aus dem Arbeitsmappen-XML.
`public_eia_storage.rs` validiert dieselbe Originaldatei mit Calamine und einem
begrenzten Zugriff auf die numerischen XML-Zellen. 69 Werte, 30 Zeilen und fünf
Profile werden in Atlasmigration 0022 gespeichert. Der vollständige Import
bleibt atomar und nutzt die gemeinsame Abrufsperre sowie 24 Stunden Abstand.
Quellenstand, Prüfsumme und Perspektive gehören zum gespeicherten Merkkontext.
Import-, Bedien- und Buildabnahme werden im ursprünglichen 40-Themen-Ledger
erst nach tatsächlichem Abschluss vermerkt.

Originalquellen:

- [EIA-Veröffentlichung und Originaldatei](https://www.eia.gov/analysis/studies/electricity/batterystorage/)
- [EIA-Begriffe, Appendix A](https://www.eia.gov/analysis/studies/electricity/batterystorage/pdf/battery_storage_2021.pdf)
- [EIA-Nutzung und Quellenangabe](https://www.eia.gov/about/copyrights_reuse.php)
- [JRC-Speicherinventar](https://ses.jrc.ec.europa.eu/storage-inventory)

Die EIA-Daten sind gemeinfrei. Veröffentlichung und Urheber bleiben angegeben;
deutsche Erläuterungen stammen von Personal Macro.
