# Learning-Dashboard

Implementierter Stand: 05.10.2026. Produktive Frontendbasis: `apps/desktop`.

Der Auftrag ist ein umfangreiches, wiederholt nutzbares Nachschlagewerk in einfacher
Sprache. Der Nutzer braucht besonders den Kontext einer Nachricht, die Verbindung
zum Asset und verständliche nächste Beobachtungsschritte. Die Oberfläche vermeidet
Tagespflichten, automatische Lernbewertungen und Zeitdruck.

## Inhalte

Der lokale Katalog enthält 69 Kapitel, sieben Themenwelten, acht geführte Lernwege
und 95 Glossarbegriffe. Jede Lektion enthält Einordnung, konkrete Treiber mit
Beobachtungspunkten, eine schrittweise Wirkungskette, ein hypothetisches Beispiel,
Gegenkräfte, einen Merksatz, eine kleine Aufgabe, eine Verständnisfrage sowie
passende Folgekapitel und Quellen.

| Themenwelt | Kapitel | Beispiele |
| --- | ---: | --- |
| Grundlagen | 9 | Währungspaare, Erwartungen, Zentralbanken, Realzinsen, CPI/PPI, Wachstum, Arbeit, Anleihen |
| Währungen | 12 | CAD, GBP, USD, EUR, AUD, NZD, JPY, CHF, CNY/CNH, NOK, SEK, Schwellenländer |
| Agrarrohstoffe | 10 | Soja, Crush, Mais, Weizen, Kaffee, Kakao, Baumwolle, Zucker, Palmöl, Raps |
| Metalle & Energie | 8 | Gold, Silber, Kupfer, Eisenerz, Aluminium, Platin, Öl, Gas |
| Wirtschaftliche Zusammenhänge | 8 | China-Stagnation, China-PPI, Stimulus, Ölschock, Stagflation, Soft Landing, USD-Zyklus, Terms of Trade |
| Tokenisierung | 9 | Tokenansprüche, Anleihen, Stablecoins, Smart Contracts, Verwahrung, Blockchain, DeFi, Produktvergleich |
| Beobachten & anwenden | 13 | Angebot/Nachfrage, Lager, Anbauphase, Basis, Futures, COT, Seasonality, Korrelationen, Liquidität, Risiko, Carry, Routine, Preisweitergabe |

Lernwege verbinden Grundlagen mit der Anwendung: Einstieg, CAD/GBP, China,
Soja, Metalle, Tokenisierung, digitale Erträge und eine eigene Beobachtungsroutine.
Ein Lernweg zeigt die Reihenfolge und die manuell markierten Kapitel.

## Bedienung und Kontext

- Route `/learning`, eigener Navigationsbereich **Lernen** und Befehlspaletteneintrag.
- Übersicht mit direkten Einstiegen in die ausdrücklich gewünschten Themen.
- Volltextsuche über Titel, Kontext, Treiber, Beispiele, Begriffe und Themenwelt.
  Deutsche/englische Tokenisierungsnamen sowie „Tokenasation“ werden erkannt.
  Titel- und Assettreffer werden vor beiläufigen Erwähnungen gezeigt.
- Themenfilter, Filter nach verstanden/offen und unabhängige Merkliste.
- Fokusmodus mit sechs Abschnitten als Voreinstellung; vollständige Leseansicht
  ist ebenfalls möglich. Der Abschnittswechsel beginnt beim Kontextkasten.
- Fachwörter lassen sich unmittelbar im Kapitel aufklappen; das komplette Glossar
  ist separat durchsuchbar und verbindet Definition, Beispiel und Vertiefung.
- URL-Links enthalten Kapitel, Leseschritt und gegebenenfalls Lernweg. Suchkontext
  bleibt beim Öffnen eines Bibliothekskapitels und beim Zurückgehen erhalten.
- Eigene Zusammenfassung mit maximal 2.000 Zeichen und automatisch gespeicherter
  Lesestelle. Die Markierung „verstanden“ erfolgt ausschließlich durch den Nutzer.
- Verständnisfragen erklären sowohl die passende Antwort als auch eine nötige
  Korrektur. Sie entscheiden nicht über Lernfortschritt oder Handelsaktionen.
- Bestehende Workspace-Seiten werden nur verlinkt, wenn ihre Route verfügbar ist.
- Tastaturfokus, sichtbare Fokusmarkierungen, zugängliche Beschriftungen und
  eigenständige schmale Layouts; bestehende Desktop-Dichte bleibt erhalten.

## Quellen und fachliche Grenzen

`data/sources.ts` dokumentiert Primärquellen von Zentralbanken, BLS, IMF/Weltbank,
USDA/ICCO, USGS, EIA, CME/CFTC, BIS/FSB und SEC. Es werden Definitionen und
wirtschaftliche Mechanismen in eigenen Worten erklärt. Forschungsberichte bleiben
als historische Untersuchungen erkennbar; ihre Koeffizienten, Mengen und Prognosen
werden nicht als aktuelle Marktwerte übernommen. US-Rechts-/Aufsichtsmaterial
belegt Strukturunterschiede und ist keine Beurteilung eines deutschen/EU-Angebots.

Die Wirkungsketten sind bedingte Szenarien, keine kalibrierten Preisprognosen.
China-Bau, Industrie und Konsum bleiben getrennt. PPI ist kein automatischer
Vorläufer jedes CPI. Relative Währungsseite, Realzins, Liquidität und Erwartungen
bleiben als Gegenkräfte sichtbar. Wetterpunkte belegen keinen Ernteverlust;
Lagerbestände benötigen Verbrauchs- und Lieferkontext. Futureskurven, COT und
historische Saisonalität garantieren keine nächste Preisrichtung.

Bei Tokenisierung werden Anspruch, Anbieter, Verwahrung, Rückgabe, Kosten und
konkreter Nutzen erklärt. Technik, Handel rund um die Uhr und kleinere Einheiten
garantieren weder liquide Käufer noch bessere Renditen. USD-Stabilität beseitigt
kein EUR-Wechselkursrisiko. Es werden keine bestimmten Tokens oder Anbieter
empfohlen und keine Transaktionen ausgelöst.

Die Quellen öffnen ausschließlich auf Nutzeraktion. Die neue Seite benötigt keine
Provider-Abfrage, zusätzliche Bibliothek, KI-Aufrufe oder Backendmigration.

## Persönlicher Lernstand

`learning-progress.ts` verwendet den versionierten Schlüssel
`personal-macro:learning:v1`. Auf Desktop und in der lokalen Vorschau liegen
Merkliste, Verständnis-Markierungen, letzte Lesestelle und Notizen im lokalen
WebView-/Browser-Speicher. Fremde oder entfernte Kapitel-IDs und überlange Notizen
werden verworfen beziehungsweise begrenzt. Ein blockierter Speicher wird als
Arbeitsspeicher ausgewiesen. Diese Daten gehören nicht zum SQLite-Backup und werden
nicht zwischen Desktop, Browserprofilen und Cloud synchronisiert.

Im privaten Webmodus wird der lokale Browser-Speicher weder gelesen noch
beschrieben. Lernstand entsteht nur innerhalb einer bestätigten Sitzung und wird
bei deren Ende oder Sperre gelöscht. Die bestehende private Sitzungsschranke
bleibt vor dem Workspace. Die statische Route besitzt eine leere optionale
Commandliste; die 46 verpflichtenden Journal-Capabilities bleiben unverändert.
Eine Veröffentlichung des neuen Frontends ist nicht Teil dieses lokalen Auftrags.

## Abnahme

Die zugehörigen Tests prüfen Katalogverweise und Quellen, verständliche Suche nach
den angefragten Assets, Datenspeicherung und Wiederherstellung, private
Sitzungsgrenzen, Fokusmodus, Suchkontext beim Zurückgehen, Merkliste, Notizen,
Verständnisfragen, Glossar und Lernwegwechsel. Shell- und Routentests prüfen die
statische Lernnavigation ohne zusätzliche Markt-Capabilities.

Visuelle Prüfungen werden ausschließlich unter `D:\Macrotool\output\playwright\learning`
gespeichert. Die Browser-Vorschau prüft Oberfläche und Bedienung; sie ist kein
Nachweis einer Cloudveröffentlichung oder einer vollständigen nativen UI-Abnahme.
Die sechs relevanten Vitest-Dateien bestehen mit 29 Tests. `pnpm build` und
`pnpm build:private-web` bestehen einschließlich TypeScript-Prüfung. Die geänderten
Frontendpfade bestehen ESLint und Prettier. Learning wird als eigener lazy Chunk
geladen: rund 258 kB JavaScript beziehungsweise 81 kB Gzip sowie 28 kB CSS
beziehungsweise 5 kB Gzip; keine zusätzliche Bibliothek wurde installiert.

Chromium prüfte Übersicht, gefilterte Bibliothek, vollständiges Tokenisierungskapitel,
China-Lernweg und PPI-Glossar bei 320, 390, 768, 1024 und 1440 px: 25 Ansichten,
keine JavaScript-Laufzeitfehler und kein zusätzlicher Seitenüberlauf. Bei exakt
1024 px bleibt die bestehende Mindestbreite des Desktop-Shells erhalten: mit
9 px vertikaler Scrollbar ist seine Fläche breiter als der 1015-px-Inhaltsviewport.
Diese bestehende Grenze wurde nicht durch eine Änderung der Desktop-Dichte aufgelöst.
Screenshots zeigen die Übersicht bei 1440 px, die CAD-Treiber und das
Tokenisierungskapitel bei 390 px. Der private Webmodus ist kompiliert und seine
Speichergrenzen sind getestet; eine neue Live-Bereitstellung wurde nicht durchgeführt.

Auch die fertig kompilierte lokale Oberfläche unter Port 5191 bestand die
CAD-Bedienfolge: Merken, Schrittwechsel, eigene Notiz, passende Quizantwort,
manuelle Verständnis-Markierung, Neuladen und Wiederfinden in der Merkliste.
Notiz und beide Markierungen waren wiederhergestellt. Der Kontextkasten begann
nach dem Schrittwechsel bei 84,42 px im Viewport und war vollständig sichtbar.
Keine JavaScript-Laufzeitfehler; ausschließlich synthetischer Lernstand in einem
isolierten Browserprofil, anschließend entfernt. Journal-Schreibvorgänge wurden
nicht ausgeführt. Bericht: `output/playwright/learning/compiled-ui-report.json`.

`pnpm tauri build --no-bundle` besteht als optimierter Windows-Releasebuild.
Die aktualisierte Anwendung liegt unter
`apps/desktop/src-tauri/target/release/personal-macro-desktop.exe`.
Die laufenden Desktopprozesse wurden dabei nicht beendet und die persönliche
Datenbank nicht für eine zusätzliche Testinstanz geöffnet. Der native Start und
die native Oberfläche wurden in diesem Auftrag nicht separat abgenommen; die
Bedienprüfung verwendet das identische kompilierte Frontend im Browser.
`START-MACROTOOL.cmd` wählt nach dem Beenden bisheriger App-Instanzen anhand
des Zeitstempels die neue Release-Datei. Eine neue Installerdatei wurde nicht erzeugt.
