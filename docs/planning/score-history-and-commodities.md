# Score-Historie und Rohstoff-Fundamentals

Stand: 13.10.2026. Arbeitsbranch: `codex/score-history-commodities`.
Der zuvor vorhandene Stand wurde als `50c8f70` auf `main` gesichert.

## Vertrag

- Unveränderliche Beobachtungen speichern Erfassungszeit, Quell-Snapshot,
  Modellversion, Rohscore, Verfügbarkeit und die verwendeten Einzelbeiträge.
  Ein Release-Datum ist kein Erfassungszeitpunkt. Vorhandene gespeicherte
  EODHD-Evaluierungen werden als archivierte Snapshot-Beobachtungen übernommen;
  heutige Eventwerte werden dafür nicht rückdatiert.
- Forex behält die tatsächlich implementierte 17-Zellen-Summe Base minus Quote
  einschließlich der ausdrücklich dokumentierten einseitigen Nullbeiträge.
  Ein vollständig fehlender Score bleibt unavailable. Die Standardschwellen
  sind +5 / −5; positive/negative Rohscores bleiben zusätzlich sichtbar.
- Ein Daily-Vergleich benutzt nur eine vor Kerzenbeginn bekannte, noch gültige
  Beobachtung. Eine Beobachtung wird höchstens 36 Stunden beziehungsweise bis
  zum frühesten Ablauf ihrer verwendeten Release-Daten fortgeführt. Lücken
  bei ausgeschalteter App werden sichtbar. Das ist keine historische
  Rekonstruktion aller damals marktverfügbaren Daten.
- MT5 liefert die tatsächliche Zeitachse der gespeicherten Kerzen. EODHD
  liefert im bestehenden Cache nur Handelsdaten ohne exakten Open-Zeitpunkt.
  Dessen visueller Vergleich verwendet konservativ den vorangehenden
  UTC-Tagesbeginn und kennzeichnet diesen Zuordnungszeitpunkt. Eine zeitgenaue
  Open-to-Close-Trefferquote wird ausschließlich für MT5-OHLC berechnet.
- Trefferstatistiken vergleichen den ersten zukünftigen Daily-Open mit dem
  Close nach 5 oder 20 Handelstagen. Nur Richtungswechsel mit vollständig
  verfügbaren Folgekerzen werden gezählt; überlappende Stichproben entfallen.
  Anzahl, Zeitraum und Grenzen stehen unmittelbar an den Ergebnissen.

## Rohstoffe

Gold, Silber, Platin, Palladium, Kupfer, WTI, Brent und Henry-Hub-Erdgas werden
als eigene USD-notierte Assets behandelt. Der Commodity-Score ist eine
offengelegte, ungewichtete Modellannahme aus verfügbaren Überraschungssignalen:

- Gold: bestehender inverser USD-Kanal aus US-Releases.
- Industrielle Metalle / Öl: inverse US-Inflations-, Zins- und Arbeitsmarktsignale
  als USD-Kanal; US-/China-GDP, Manufacturing PMI und Industrieproduktion als
  eigener Nachfragekanal. Derselbe Growth-Release wird nicht zusätzlich invertiert.
- Henry Hub: US-Nachfrage und US-Gasspeicher, ohne China-Gasnachfrage als
  identischen US-Markt zu behandeln.
- WTI / Brent: ausdrücklich identifizierte EIA-Rohöllager-Überraschung aus
  vorhandenen EODHD-Events; bei Brent als US-Lagerstellvertreter gekennzeichnet.
  Actual und Forecast sind Pflicht; ein Lageranstieg ist kein automatisches
  Verkaufssignal, sondern wird relativ zur Erwartung bewertet.
- Realzinsen, ETF-/Zentralbanknachfrage, Minenangebot, OPEC-Angebot und regionale
  Wetter-/Transporteffekte sind relevante, hier noch ungemessene Komponenten.
  Ihre fehlende Abdeckung bleibt sichtbar und erhöht keinen Score.
- COT bleibt direkte Asset-Evidenz und wird separat gezeigt. Technische Trends
  und Seasonality werden nicht nachträglich in den Fundamentals-Score addiert.

Daily-Kurse werden aus vorhandenen geprüften MT5-/EODHD-Caches gelesen, mit
expliziter Quelle und korrekter inverser OHLC-Umrechnung. EODHD-Energiereihen
enthalten tägliche Einzelpreise: dort eine Preislinie, keine erfundenen Kerzen.
Kupfer bleibt ohne exakt zugeordnete Kursreihe ausdrücklich ohne Chart.

## Laufzeit und Freigabe

Desktop-Tracking läuft bei laufender App und nach neuen Fundamentals-Snapshots.
Die Browser-Vorschau erfindet keine Historie. Neue Cloud-Capabilities sind
optional; eine neue Live-Veröffentlichung oder automatische Desktop-/Cloud-
Synchronisierung ist nicht beauftragt. Der neue Stand bleibt auf dem Branch.

## Primärquellen (geprüft am 13.10.2026)

- [World Gold Council: What drives gold?](https://www.gold.org/goldhub/research/what-drives-gold)
- [Silver Institute: World Silver Survey 2026](https://silverinstitute.org/wp-content/uploads/2026/04/World-Silver-Survey-2026.pdf)
- [CME: Base Metals Supply and Demand](https://www.cmegroup.com/education/courses/introduction-to-base-metals/base-metals-supply-and-demand.html)
- [EIA: Oil market drivers](https://www.eia.gov/finance/markets/crudeoil/)
- [EIA: Natural gas price factors](https://www.eia.gov/energyexplained/natural-gas/factors-affecting-natural-gas-prices.php)
- [CFTC: Release Schedule](https://www.cftc.gov/MarketReports/CommitmentsofTraders/ReleaseSchedule/index.htm)

Die Richtung der Commodity-Beiträge ist unsere Modellannahme; die Quellen
belegen relevante Treiber, keine kalibrierten Gewichte oder Trefferquote.
Die CFTC berichtet meist freitags über Dienstag. Historisches COT wird hier
deshalb nicht mit dem Dienstagstermin als früher bekanntes Signal ausgegeben.

## Prüfung vom 13.10.2026

- Typecheck, ESLint und Prettier für die geänderten Frontend-Dateien bestehen.
- 66 Macro-/Historien-/Navigations-Tests bestehen. Der breite Lauf bestand
  813 Tests und meldete zwölf Zeitüberschreitungen unter paralleler Last.
  Die vier betroffenen UI-Suites bestanden anschließend seriell alle 91 Tests.
  Der zusätzliche UTC-Vortags-Vektor besteht ebenfalls.
- 29 relevante Rust-Tests bestehen: acht History-/Repository-Tests, drei
  Commodity-Tests und 18 vorhandene EODHD-Tests. Rust-Clippy für alle Targets
  sowie der PostgreSQL-Buildcheck bestehen. Vier bestehende Cloud-Macro-
  Regressionstests bestehen ohne persönlichen Datenzugriff.
- Der ausdrücklich gestartete native Review-Fixture-Lauf erzeugt DTOs für
  89 Instrumente und 61 Erfassungstage aus einer isolierten SQLite-Testdatenbank
  auf D:. Keine persönlichen Journalzeilen. Die Browserbilder tragen sichtbar
  „Synthetische QA-Daten“.
- Chromium prüft Macro-Widget, Daily-Chart, SMA-Schalter, Schwelle, Folgefenster,
  Marktwechsel und die acht Rohstoffzeilen. Nach ECharts-Resize passen 1024 und
  1536 px ohne Seitenüberlauf; keine Browserfehler. Screenshots liegen lokal
  unter `apps/desktop/output/playwright/` und werden nicht versioniert.
- Der erste Windows-Release-Build und reale Prozess-/Fensterstart bestehen.
  Die reguläre native Erfassung übernahm 6.141 öffentliche Score-Beobachtungen
  aus 68 archivierten Fundamentals-Snapshots plus dem aktuellen Stand. Für den
  Start wurde anschließend ein unabhängiger Collector mit zwei Sekunden
  Anfangswartezeit und 60 Sekunden Abstand ergänzt, damit Seasonality- und
  Providerabrufe die Erfassung nicht verzögern.

Die Softwareprüfungen bestätigen keine allgemeine Prognosegüte des Teilmodells.
Die Bilder sind keine Live-Marktdaten. Browser-DTO-Prüfung und nativer
Fensterstart ersetzen keine vollständige native UI-/Besitzerabnahme.
Keine Cloud-Veröffentlichung und kein Merge der neuen Arbeit nach `main`.
