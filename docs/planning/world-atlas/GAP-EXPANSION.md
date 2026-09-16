# Weltweite Datenlücken: Erweiterung vom 15. September 2026

Der Auftrag ergänzt die noch dünnen Länder- und Quellenabdeckungen nach dem
[Afrika-Ausbau](AFRICA.md). Die Erweiterung umfasst **25 öffentliche Quellenpakete,
77 Perspektiven, 14.133 Länder-/Messgrößenprofile und 482.615 Zahlen**. Dazu kommen
**33 Länderfonds**. Der gemeinsame öffentliche Katalog enthält jetzt 59 Pakete
mit 342 Perspektiven; die 180 WDI-/SDG-Jahresstatistiken zählen weiterhin separat.
457 eigenständige Länder, Gebiete und veröffentlichte Quellenaggregate sind
im Verzeichnis enthalten. Die Anzahl der Gebiete ist keine Zahl souveräner Staaten.

## Ergänzte Daten

| Bereich | Neue Quelle und Umfang | Fachliche Grenze |
|---|---|---|
| Private Verschuldung | IWF Global Debt Database, sechs Definitionen, 17.331 Jahreswerte, längstens 1950–2024; Kredite/Schuldpapiere des privaten Sektors für 160 Länder/Gebiete, darunter 45 in Afrika | Schuldenbestand relativ zum BIP, keine Kreditwachstumsrate. Haushalte/Unternehmen und Instrumentabgrenzungen bleiben getrennt. Keine Verlängerung der BIS-Quartalsreihen. |
| Reallohnveränderung | ILO Global Wage Report 2024–25, 2.786 Werte, 2000–2023, 154 Länder mit Zahlen; 40 in Afrika | Veränderungsraten, keine vergleichbaren absoluten Lohnniveaus. Nationale Abgrenzungen und ILO-Schätzungen; die 2024-Teiljahreswerte sind ausgeschlossen. |
| Tatsächliche Wochenarbeitszeit | ILOSTAT, 2.163 Werte, frühestens 1976–2024, 160 Länder/Gebiete; 42 in Afrika | Alle Erwerbstätigen einschließlich Selbstständiger. Erhebungszeitpunkt, Jobs und Bevölkerungsabgrenzung stehen je Punkt. Kein OECD-Jahresstundenmaß. |
| Wohnen und Versorgung | Weltbank ICP, vier Größen, 1.492 Zahlen in den Benchmarks 2017 und 2021, 193 Quellengebiete mit Zahlen | Breite Wohnleistungen einschließlich unterstellter Eigentümermieten und Versorgung. Kein isolierter Mietpreis. Preisniveau, Ausgabenanteile und Pro-Kopf-Volumen getrennt; keine Interpolation. |
| Warenhandel nach Produkten | WTO, 36 Perspektiven, 237.978 Zahlen, längstens 1948–2025, 283 Quellengebiete einschließlich historischer und regionaler Aggregate | Bruttohandelswerte mit der Welt in laufenden Mio. USD. 18 hierarchische Produktgruppen, jeweils Exporte/Importe. Nicht über alle Gruppen summieren; keine Wertschöpfungsanteile. |
| Bilaterale Handelspartner | IWF IMTS, zwölf Partner, je Exporte FOB und Importe CIF, 220.815 Werte, 1960–2025; je Partner bis 208 heutige Länder/Gebiete | Auswahl USA, China, Deutschland, Großbritannien, Frankreich, Japan, Indien, Brasilien, Saudi-Arabien, Südafrika, Nigeria und Australien. Kein vollständiges Partnerranking, keine selbst errechneten Spiegelwerte. |
| Stationäre Batterien | Drei IEA-Pakete mit fünf Perspektiven und 50 Zahlen; Welt 2010–2023 im Stand 2024, Welt 2020–2025 und vier Regionen 2023–2025 im Stand 2026 | Jährlicher Zubau in GW, kein Bestand und keine Energiemenge in GWh. Großspeicher und Anlagen hinter dem Zähler getrennt. Frühere Datenrevision bleibt als eigene Reihe erhalten. |
| Länderbörsen | 33 zusätzliche EODHD-Fonds, jetzt 43 Länder plus Welt, elf US-Sektoren und vier globale Themen; insgesamt 59 Fonds | Bereinigte ETF-Kurse in USD, keine gesamten Volkswirtschaften. Definitionen und tatsächliche Auflegungsdaten wurden bei den Emittenten geprüft. |
| Fortschrittliche Materialien | Zusätzlicher Zugang zum bereits geladenen WIPO-Feld Mikrostruktur-/Nanotechnologie | Ergänzende Patent-Teilperspektive. Keine neue Produktionsstatistik und keine Gleichsetzung mit der EU-Werkstoffstudie. |

Jahresgrenzen bezeichnen den Gesamtumfang einer Quelle. Einzelne Länder beginnen
später, enden früher oder besitzen nur einzelne Erhebungen. Quellenprofile mit
ausschließlich fehlenden Werten werden nicht als verfügbare Zahlenbilder gezählt.

## Quellen und Zuordnung

- [IWF Global Debt Database](https://data.imf.org/Datasets/FAD_GDD), Originalausgabe September 2025.
- [ILO Global Wage Report 2024–25](https://www.ilo.org/publications/flagship-reports/global-wage-report-2024-25-wage-inequality-decreasing-globally) und [ILOSTAT-Definitionen](https://ilostat.ilo.org/methods/concepts-and-definitions/description-wages-and-working-time-statistics/).
- [Weltbank ICP 2021 – Methodik](https://www.worldbank.org/en/programs/icp/brief/ICP2021_Methodology_PPP), Quelle 90, Ausgabenkomponente 9060000.
- [WTO-Originaldateien](https://data.wto.org/dataset/bulkdownload), jährlicher Warenhandel nach SITC Revision 3.
- [IWF IMTS – Handel nach Partnerland](https://data.imf.org/en/datasets/IMF.STA:IMTS), SDMX 2.1, Struktur 1.0.0. `OBS_VALUE` bleibt als originaler USD-Dezimalstring erhalten; keine zusätzliche Multiplikation mit der Anzeigeskala `SCALE=6`.
- [IEA – Batterie-Zubau 2020–2025](https://www.iea.org/data-and-statistics/charts/global-battery-storage-capacity-additions-2020-2025), [Regionen 2023–2025](https://www.iea.org/data-and-statistics/charts/battery-storage-capacity-additions-by-region-2023-2025), [älterer Stand 2010–2023](https://www.iea.org/data-and-statistics/charts/global-battery-storage-capacity-additions-2010-2023).

Explizite Zuordnungen: ICP `RUT` ist Russland. ICP `BON` ist ausschließlich
Bonaire und besitzt ein eigenes Gebiet; es wird nicht dem Sammelgebiet Bonaire,
Sint Eustatius und Saba zugeschlagen. ICP-Benchmarkaggregate und IEA-Batterieregionen
bleiben von UN-/WDI-Regionen getrennt. ILO und IWF `KOS` bezeichnen Kosovo;
IWF `WBG` behält die Originalbezeichnung Westbank/Gaza. Historische IWF-Staaten
und Aggregate werden in den neuen bilateralen Reihen ausgeschlossen. Historische
WTO-Quellengebiete bleiben eigene Gebiete und werden keinem Nachfolger zugeschlagen.
WTO `ROM`/`642` ist Rumänien, `CHT`/`158` ist Chinese Taipei/Taiwan.
Französisch-Guayana, Guadeloupe, Réunion, Martinique und die Karibischen
Niederlande besitzen im WTO-Original keinen ISO-Text, sind aber über die explizit
geprüften Quellencodes und Originalnamen ihren vorhandenen Gebieten zugeordnet.
Eine allgemeine Ableitung aus Zahlenpräfixen findet nicht statt.

GREK besitzt ab März 2016 eine neue Indexdefinition, VNM ab März 2023. Die
Wellen-Vorlaufzeit beginnt jeweils neu. VNM hat nach dem Wechsel noch keine
ausreichend lange aktuelle Welle. EPU und ARGT können auch im Ausland notierte
Unternehmen mit wirtschaftlicher Verbindung zum jeweiligen Land enthalten.
Der eingestellte Fonds EGPT wird nicht als aktiver Ägypten-Zugang aufgenommen.
Die Emittentennachweise stehen in
[market-expansion-sources-2026-09-15.json](evidence/market-expansion-sources-2026-09-15.json).

## Import und Verifikation

Die nativen Adapter `public_gap.rs`, `public_wto.rs`, `public_imts.rs` und
`public_battery.rs` verwenden die vorhandenen öffentlichen Atlas-Tabellen.
Es gibt keine neue Cachemigration und keine Verbindung zu Macro-Scores,
EODHD-Fundamentals oder persönlichen Journal-Tabellen. Speicherung ist atomar
je Quellenpaket; der gemeinsame Abruf bewahrt Teilerfolge.

Die WTO erzeugt identische CSV-Datensätze in unterschiedlicher Reihenfolge.
Der Quellenfingerabdruck umfasst deshalb sämtliche Originalspalten, Feldinhalte
und die vollständige Menge der Zeilen einschließlich Duplikaten, unabhängig von
deren Reihenfolge. Jede Zeile wird gehasht, die Hashes werden sortiert und zusammen
mit der Kopfzeile erneut gehasht. Anschließend prüft der Import wie bisher
Dimensionen, Eindeutigkeit, Zeitgrenzen und Zahlen. Zwei getrennte Live-Downloads
enthielten exakt dieselben 239.782 Quellzeilen und bestanden diese Prüfung.

IEA-HTML enthält wechselnde Empfehlungen zu anderen Diagrammen. Geprüft wird
das eindeutig identifizierte Hauptdiagramm einschließlich CSV, Diagrammoptionen,
Einheit, Lizenz sowie Historien-/Szenarioattributen. Ein zweites Diagramm mit
derselben Kennung wird abgelehnt. Keine Werte werden aus Bildkoordinaten abgelesen.

Der erneute automatische Zugriff auf die sechs alten IWF-DataMapper-Endpunkte
lieferte HTTP 403. Die bereits zuvor heruntergeladenen und vollständig geprüften
Originaldateien lassen sich ausdrücklich über
`src-tauri/examples/import_reviewed_public_atlas.rs` importieren. Dieser Weg benutzt
denselben Hash-/Schema-Prüfer, die gemeinsame Abrufsperre, die 24-Stunden-Grenze
und die atomare Speicherung. Es gibt keinen stillen Netzwerk-Fallback. Der neuere
IWF-SDMX-Zugang für IMTS funktioniert im regulären Import.

Eine ausdrücklich aufgerufene lokale Neuberechnung darf eine geprüfte
Gebietszuordnung auf exakt dieselbe Originaldatei anwenden, wenn ausschließlich
das Importrezept geändert wurde. Quellenhash, URL, Zeilen-, Werte- und
Gebietsanzahl müssen unverändert sein; der bisherige Abrufzeitpunkt bleibt erhalten.
Das ermöglicht die WTO-Codekorrektur ohne weiteren Netzwerkabruf. Die
24-Stunden-Grenze für Netzwerkabrufe bleibt unverändert.

Die unabhängigen Python-Extraktionen und nativen Prüfungen vergleichen alle
482.615 neuen Zahlen sowie Fehlwerte, Einheiten, Quellenbezeichnungen und Hinweise.
Die Speicherung wird vollständig in einer temporären SQLite-Datenbank geprüft
und nach erneutem Öffnen ausgelesen. Die abschließende Prüfung des Benutzer-Atlas
ist ausschließlich lesend:

```powershell
python docs/planning/world-atlas/evidence/audit_gap_cache.py '<absoluter Atlas-Ordner>'
```

Ergebnis: [gap-cache-audit-2026-09-15.json](evidence/gap-cache-audit-2026-09-15.json).
Der öffentliche Zusatzbestand steigt von 344.399 auf **827.014 Zahlen**.
Alle 25 neuen Pakete stimmen einschließlich Nullwerten, Fehlwerten,
Quellenkennzeichen und Originaldezimalen mit den unabhängigen Extraktionen überein.
Die 34 zuvor gespeicherten Zusatzpakete behalten Abrufdatum und Werteumfang.
Alle 33 neuen Länderfonds besitzen bereinigte Monatswerte bis August 2026:
**8.618 zusätzliche Monatsbeobachtungen**. Der September wird als noch laufender
Monat nicht übernommen.
Der reguläre Bibliotheksplaner wurde anschließend einschließlich Länderfonds
aufgerufen und meldete: „Alle angebundenen Datenpakete sind bereits lokal
gespeichert.“ Die Fehlversuche des ersten Abrufs sind damit fachlich erledigt;
ihre historischen Jobmeldungen werden nicht gelöscht.
Reproduzierbare Katalog-/Quellenprüfung:
`build_gap_sources.py`, `build_battery_sources.py`, `build_imts_sources.py`,
`build_market_expansion.py` und `audit_geographies.py` im Verzeichnis `evidence`.
Große öffentliche Rohdateien und Erwartungsprofile bleiben unter
`apps/desktop/.tmp/atlas-gaps`; keine persönlichen Daten werden dorthin kopiert.

## Sichtbarkeit in der App

**Weitere Quellenperspektive** öffnet die ergänzenden Reihen. Die vorhandenen
BIS-/OECD-Ansichten bleiben separat erreichbar. Eine anfängliche Quellenauswahl
kann eine passende Länderquelle wählen; eine ausdrücklich gewählte Messgröße
oder Quelle wird bei fehlenden Daten nicht durch etwas anderes ersetzt.
Explizite WDI-Links, Länder- und Vergleichsauswahl sowie gemerkte Quellen bleiben erhalten.
Ein Wechsel zu einem anderen Thema entfernt die Quellenauswahl des vorigen
Themas. Die neue erste Auswahl berücksichtigt das gewählte Land; die äußere
Quellenüberschrift verwendet dieselbe Auswahl wie das Diagramm. Ein bloßer
Länderwechsel erhält dagegen eine ausdrücklich gewählte Quelle und zeigt deren
fehlende Länderwerte weiterhin als fehlend.

## Technische Abnahme

- Gesamte Atlas-Frontendprüfung: 327 bestehende Tests bestanden. Die ergänzte
  Navigationsprüfung testet außerdem den Wechsel von ILO-Reallöhnen zu
  ICP-Wohnkosten in Ghana einschließlich konsistenter Quellenüberschrift.
  Die abschließende Seiten-/Erweiterungssuite bestand mit 64 von 64 Tests.
- Native Atlas-Suite: 113 bestanden; 49 abrufgebundene Prüfungen sind regulär
  ausgenommen. Die Originaldateienprüfung und der lokale Import-/Neuzuordnungsweg
  wurden zusätzlich explizit ausgeführt und bestanden: alle 25 Pakete, beide
  unterschiedlich sortierten WTO-Downloads, temporäre SQLite-Speicherung und
  Wiederöffnung sowie unveränderte Netzwerksperre und Abrufzeit bei lokaler
  Neuzuordnung.
- `cargo clippy --all-targets -- -D warnings` und die produktive
  TypeScript-/Vite-Prüfung bestanden. Die vorhandene Vite-Warnung zu großen
  Datenkatalog-Chunks bleibt ohne Buildfehler bestehen.
- Die produktive Oberfläche wurde mit echten öffentlichen Cache-Antworten in
  einer lokalen Browser-Prüfansicht kontrolliert: Reallöhne für Nigeria/Ghana,
  Quellenwechsel und ICP-Benchmarkpunkte 2017/2021 samt Zahlen und Bedeutungstext.
  Diese Prüfansicht ersetzt keine native SQLite-Startprüfung.

## Verbleibende tatsächliche Grenzen

- Die [NYU-Archivübersicht](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/dataarchived.html) stellt die vorhandenen langen US-/Europa-/Japan-/Schwellenländer-/Weltserien bereit. China und Indien besitzen für die entsprechenden Bewertungen keine gleichwertigen langen öffentlichen Archive.
- ICP ergänzt weltweite Wohnkosten-Benchmarks, aber keine global vollständige, isolierte Mietpreisgeschichte. Immobilien- und private Schuldendienstquellen bleiben außerhalb ihrer berichtenden Länder begrenzt.
- Der Handelspartnerausbau deckt zwölf ausgewählte Gegenländer ab. TiVA endet weiterhin 2022; nominaler IWF-/WTO-Warenhandel wird nicht als neuere TiVA-Wertschöpfung ausgegeben.
- Die EPO-Berichte 2023 zu Quantencomputing/-simulation liefern in den geprüften Zusatz-XLSX Dateien Suchstrategien statt numerischer Jahresreihen. Im [Quantum Data Desk 2026](https://datadesk.epo.org/dashboards/epo-cartographies-quantum) ist der Datenexport deaktiviert. Daraus wird keine erfundene Länderzeitreihe erstellt; die verifizierte Sensorik-Historie bis 2017 bleibt erhalten.
- WIPO-Patente messen weder Produktion noch die gesamte Branche fortschrittlicher Materialien. IEA-Zubau ersetzt keine weltweite Länderstatistik des Batterie-Energiebestands. Afrika bleibt bei Länderbörsen außerhalb Südafrikas im geprüften Fondsuniversum dünn abgedeckt.

Eine fehlende Zahl bleibt deshalb sichtbar fehlend. Diese Quellenbegrenzungen
sind nicht mit einem noch nicht ausgeführten lokalen Import gleichzusetzen.
