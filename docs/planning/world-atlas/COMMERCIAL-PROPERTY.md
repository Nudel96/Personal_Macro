# Gewerbeimmobilienpreise

Der Atlas verwendet die kostenlose BIS-Veröffentlichung vom 27. August 2026,
`WS_CPP_csv_flat.zip`. Die geprüfte Auswahl enthält 65 Originalreihen für 24
Länder und eine gesonderte Euroraum-Gruppe: 5.586 Werte und 649 ausdrücklich
fehlende Beobachtungen. Die längste Quellenreihe beginnt 1945-Q4; viele
Länderbilder sind wesentlich kürzer. Die gemeinsame Paketgrenze Juni 2026 ist
kein Versprechen aktueller Daten in jedem Land.

## Auswahl und Darstellung

Büro-, Einzelhandels- und Industrieimmobilien, Gewerbegrundstücke sowie
veröffentlichte Gesamtindizes bleiben eigene Originalreihen. Jedes Land besitzt
eine passende Auswahl seiner nationalen oder städtischen Reihen. Die Quellen
für Wohninvestmentobjekte in der Schweiz und den Niederlanden sowie dänische
Agrarimmobilien gehören nicht zur Gewerbeauswahl. Für Indien und Welt wird
kein Ersatzbild erzeugt.

Der zusätzliche Eintrag **Euroraum · BIS-Gewerbeimmobilien (20 Länder)**
verwendet die feste Quellenzusammensetzung vom 1. Januar 2023. Er bleibt von
der allgemeinen BIS-Euroraum-Region und anderen regionalen Aggregaten getrennt.
Der gemeinsame Atlas-Katalog umfasst damit 377 Gebiete.

Die Preisbasen bleiben unverändert. Indizes verschiedener Bezugsjahre werden
nicht neu skaliert. AED-, USD- und PHP-Reihen behalten die veröffentlichte
Einheit je Quadratmeter. Island bietet getrennte nominale und reale Indizes
für den Großraum Reykjavík. Der reale Deflator ist der Kreditkonditionenindex,
der seit Mitte 2008 an den Verbraucherpreisindex gekoppelt ist.

Das Vergleichsland erhält eine eigene Reihenauswahl. Automatisch wird nur
dieselbe Gebäudeart angeboten; fehlt sie, bleibt der Vergleich leer, bis eine
andere Originalreihe ausdrücklich gewählt wird. Beide Bilder teilen den
Kalender und behalten ihre ursprünglichen Einheiten und eigenen Maßstäbe.
Preisniveaus und unterschiedlich basierte Indexstände ergeben kein direktes
Länderranking und keine Aussage über faire Bewertung.

Halbjahre bleiben `YYYY-S1` und `YYYY-S2`. Die japanischen älteren Landreihen
führen dagegen halbjährliche Erhebungen als Q1/Q3 in einem Quartalskalender;
die offenen Zwischenquartale werden weder ergänzt noch verbunden. Vorläufige
Werte sind hohl markiert und auch ohne Zahlen im Tooltip bezeichnet.

Quellenwechsel und dokumentierte Grenzen trennen die Linien, ohne die
Originalwerte zu verändern:

- USA: Wechsel von NREI-Gutachterreihen zu CoStar-Wiederverkaufsdaten 1996-Q1.
- Brasilien: zusätzliche Städte ab Januar 2014 und Januar 2016.
- Makati: Revisionsgrenze 2019-Q1; weitere historische Revisionen sind möglich.
- Hongkong: fehlende Büromonate bleiben offen.
- Frankreich: experimentelle Quellenreihen enden im geprüften Archiv 2021-Q2.

## Umsetzung und Nachweise

`evidence/build_public_cpp.py` liest sämtliche 6.599 Originalzeilen unabhängig
vom nativen Adapter. Die 68 Zeilen ohne Datum enthalten die Metadaten, die
anhand der vollständigen sieben übrigen Dimensionen vererbt werden. Sämtliche
Originaltitel, Einheiten, Methoden, Gebietsabgrenzungen und ursprünglichen
Datengeber bleiben im Quellenvertrag erhalten und in den Quellenhinweisen
der jeweiligen Ansicht zugänglich.

`public_cpp.rs` prüft Hash, ZIP-Inhalt, vollständige Metadaten, Dimensionen,
Originalfrequenzen, Status, Duplikate und Umfang. `NaN` mit Status M bleibt
fehlend; eine echte Null mit normalem Status bleibt null. Atlasmigration 0022,
gemeinsame Abrufsperre, atomarer Paketwechsel und 24 Stunden Abstand gelten.

Die gemeinsame Speicherprüfung vergleicht gemischte Frequenzen anhand ihrer
Kalenderabschnitte. Ein Quartal, das im Juni endet, liegt innerhalb der
Paketgrenze Juni; alphabetische Vergleiche von `Q2` mit `06` reichen dafür
nicht aus. Dies wurde auch mit den bestehenden ND-GAIN- und Census-Importen
geprüft. Die endgültige Abnahme ist bestanden: vollständiger lokaler Originalabgleich,
35 native Prüfschritte, vier gesichtete Screenshots und regulärer Windows-Build.
Nachweise: `evidence/public-cpp-*-2026-09-11.json`.

`publicMetric`, `publicCompareMetric` und `publicSince` erhalten beide
tatsächlich gewählten Originalreihen im Merkkontext. Die Browser-Vorschau
erfindet keine Preise.

Primärquellen:

- [BIS-Daten und Methodik](https://data.bis.org/topics/CPP)
- [Originaldownload](https://data.bis.org/static/bulk/WS_CPP_csv_flat.zip)
- [Gebiets- und Reiheninventar](https://www.bis.org/statistics/pp_inventory_commercial.pdf)
- [Ursprüngliche Datengeber](https://www.bis.org/statistics/pp_sources.pdf)
- [Quellenänderungen](https://www.bis.org/statistics/pp_changes.pdf)
