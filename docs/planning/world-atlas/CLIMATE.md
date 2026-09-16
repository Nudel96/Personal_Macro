# Klimaexposition und klimatische Anfälligkeit

Der Atlas verwendet den öffentlichen ND-GAIN Country Index, Ausgabe 2026, der
University of Notre Dame. Das feste Originalarchiv enthält zehn ausgewählte
veröffentlichte Indizes für 192 Länder. Daraus entstehen 1.847 vorhandene
Länderperspektiven mit 49.842 Zahlen. Fehlende Gesamt- oder Teilmodelle bleiben
ohne Bild; beispielsweise besitzt Liechtenstein eine Klimaexposition, aber
keinen Gesamtindex der Anfälligkeit. Es gibt keinen Quellen-Weltindex.

## Bedeutung des Bilds

Neun Perspektiven zeigen veröffentlichte Modellreihen 1995–2024: gesamte
Anfälligkeit, Empfindlichkeit, den belastenden Beitrag eingeschränkter
Anpassungskapazität sowie Ernährung, Wasser, Gesundheit, Ökosysteme,
Lebensraum und Infrastruktur. Höhere Werte auf der festen Skala 0–1 bedeuten
größere Anfälligkeit beziehungsweise einen stärkeren belastenden Beitrag.
Der Kapazitätsbeitrag ist invers: höher bedeutet hier **geringere** Kapazität.

ND-GAIN interpoliert fehlende Eingangsjahre und kann Randwerte fortschreiben.
Eine durchgehende Modelllinie ist daher keine jährlich gemessene Klimawirkung.
Die App interpoliert oder gewichtet selbst nichts. Unterschiedlich vorhandene
Teilindikatoren und Quellenrevisionen begrenzen historische Vergleiche.

**Klimaexposition · Projektionen** zeigt ausschließlich einen festen Marker auf
derselben Skala. Die Quelle wiederholt den identischen Modellwert in sämtlichen
30 Archivspalten; diese Wiederholungen werden nicht als Zeitreihe übernommen.
Nur die letzte Originalspalte 2024 bleibt intern zur Nachprüfung erhalten.
Das sichtbare Bild besitzt keine Jahresachse und heißt Projektionsmodell,
Ausgabe 2026. Zeitraumfilter gelten hier nicht. Auch Datenabdeckung und
gemerkte Bilder stellen die Archivspalte nicht als beobachtetes Klimajahr dar.

Die Expositionsmodelle verwenden unterschiedliche Szenarien, Basisperioden
und Zukunftshorizonte: unter anderem 2030, die Jahrhundertmitte und das
Jahrhundertende. Es gibt kein gemeinsames Prognosejahr. Keiner dieser Indizes
ist eine Schadenssumme, Eintrittswahrscheinlichkeit oder Anlagebewertung.

## Quelle und Umsetzung

- [ND-GAIN-Methodik](https://gain.nd.edu/our-work/country-index/methodology/)
- [Öffentlicher Download](https://gain.nd.edu/our-work/country-index/download-data/)
- [Originalarchiv 2026](https://gain.nd.edu/assets/647440/ndgain_countryindex_2026.zip)
- [Technischer Bericht 2026](https://gain.nd.edu/assets/581554/nd_gain_countryindex_technicalreport_2024.pdf)

Der technische Bericht trägt im festen Dateinamen weiterhin 2024, der geprüfte
Inhalt ist ausdrücklich die Ausgabe 2026. Das ZIP enthält 550 eindeutige
Einträge. Nur die zehn freigegebenen CSV-Dateien unter
`resources 2/vulnerability/` werden im Speicher gelesen. Es werden keine
Archivpfade auf das Dateisystem extrahiert.

Der native Adapter `public_ndgain.rs` prüft ZIP- und Dateihashes, Umfang,
Originalüberschriften, alle 192 ISO3-/Namensidentitäten, die 30 Archivjahre,
exakte Dezimalstrings zwischen null und eins sowie die Vollständigkeit jeder
Perspektive. Wechselnde oder fehlende Expositionsspalten stoppen den Import.
Ein vollständig leeres Teilmodell wird nicht durch null ersetzt.

`evidence/build_public_ndgain.py` erstellt einen unabhängigen Decimal-Abgleich
aller Originalzellen, den Quellvertrag und die erwarteten lokalen Profile.
`evidence/public-ndgain-audit.json` enthält den datierten Befund. Native Tests
vergleichen sämtliche Profile und öffnen den temporären SQLite-Cache erneut;
veränderte Länder, Jahre, Werte und Duplikate werden zurückgewiesen.

Die gemeinsame Atlas-Abrufsperre, atomarer Paketwechsel und 24 Stunden
Mindestabstand gelten. Speicherung über die vorhandene Atlasmigration 0022.
Die Browser-Vorschau erfindet keine Klimawerte. Die endgültige Import-, Bedien-
und Buildabnahme steht im ursprünglichen 40-Themen-Ledger.
