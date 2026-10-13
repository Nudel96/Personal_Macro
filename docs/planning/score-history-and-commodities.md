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
Die Browser-Vorschau erfindet keine Historie. Der ergänzende Auftrag vom
13.10.2026 umfasst auch die private Smartphone-Version. Die neuen Cloud-
Capabilities bleiben optional; der Journalzugang braucht sie nicht.
Der neue Codestand bleibt bis zur gesonderten Freigabe auf dem Branch.

### Private Browser-Anbindung

PostgreSQL-Migration `0013_score_history.sql` führt getrennte öffentliche
Beobachtungsbatches, Punkte, D1-Preisstände und den Erfassungszustand ein.
Unveränderliche Beiträge bleiben beim ursprünglichen Beobachtungszeitpunkt.
Die Cloud berechnet mit dem nativen Modell über das geprüfte Macro-Paket.
Die vorhandene tägliche Providerplanung sowie die Veröffentlichung neuer
Makro-Pakete lösen eine Erfassung aus; manuelle Erfassung ist ebenfalls verfügbar.
Downloads laufen außerhalb von PostgreSQL-Transaktionen. Vor dem Speichern
werden die aktive Generation und der Startzeitpunkt auf Millisekunden geprüft;
parallele, identische oder verspätete Berechnungen verändern keinen neueren Stand.
Journalrevision und persönliche Vorgangsbelege werden nicht verändert.

Der explizite Exporter `export_public_scores` öffnet die lokale SQLite-Datei
read-only und wählt ausschließlich Score-Felder sowie die nativen öffentlichen
D1-Kerzen. Die Importdatei liegt außerhalb des Repository auf D:. Der Importer
prüft SHA-256, Feldfreigabe, 89 bekannte Instrumente, Modellversion, Summen,
Abdeckung, Zeitgrenzen, Duplikate und OHLC. Die Übernahme erfolgt atomar und
prüft bei Wiederholung identische unveränderliche Inhalte. Accounts, Trades,
Zugangsdaten, Terminalpfade, Medien und Notizen werden nicht übernommen.
Desktop-Archiv, Desktop-Erfassung und Cloud-Erfassung bleiben unterscheidbar.

Die Daily-Übernahme umfasst verfügbare MT5- und EODHD-Daten. Sie ist ein
datierter Preisstand, keine automatische MT5-Synchronisierung. Die bestehenden
Seasonality-Symbolpakete enthalten nur `mid_close`; dieser Rückfall zeigt
Schlusskurslinien. Native EODHD-OHLC wird ausdrücklich separat übernommen.
EODHD-Einzelpreise und Handelsdatum-Grenzen behalten dieselbe
Methodik wie auf dem Desktop. Eine fehlende exakte Kupfer-Preiszuordnung bleibt
sichtbar. Mobile Filter, Charts, Kennzahlen und innerhalb der Cards scrollbare
Tabellen erhalten die Desktop-Dichte ab 1024 px.

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
- Der abschließende reguläre Tauri-Produktionsbuild mit eingebetteter Oberfläche
  bestand um 20:40 Uhr Europe/Berlin. Die EXE liegt unter
  `apps/desktop/src-tauri/target/release/personal-macro-desktop.exe` (73.462.784 Byte).
  Der erneute reale Fenster-/Prozessstart reagiert; der read-only-Lesetest sieht
  6.141 Beobachtungen für alle 89 Instrumente und eine abgeschlossene
  Archivübernahme. Keine Score-/Initialisierungsfehlermeldung in den separat
  erfassten Startlogs. Der bisherige Nutzerprozess wurde nicht beendet.

Die Softwareprüfungen bestätigen keine allgemeine Prognosegüte des Teilmodells.
Die Bilder sind keine Live-Marktdaten. Browser-DTO-Prüfung und nativer
Fensterstart ersetzen keine vollständige native UI-/Besitzerabnahme.
Die Desktop-Abnahme wurde zunächst ohne Cloud-Veröffentlichung abgeschlossen.
Die ergänzende Browser-Abnahme folgt unten. Kein Merge der neuen Arbeit nach `main`.

## Private Smartphone-Abnahme vom 13.10.2026

Der geschützte Build `dpl_7L6zohc7b4DHCJMfohehxACtBEjK` mit Codestand
`3eff2c6666e0572174a955f1022845b7827e2fe1` ist READY in Frankfurt (`fra1`),
`public: false`. Nach der Abnahme über eine gesonderte geschützte Prüfadresse
wurde exakt dieser Build auf den bestehenden Projektlink übernommen:
`https://personal-macro-nudel96s-projects.vercel.app`.

- Migrationen 0012 und 0013 wurden nach direkter Identitäts- und Prüfsummenprüfung
  sowie verifizierter Sicherung auf D: additiv angewendet. Sämtliche zuvor
  vorhandenen Tabellen und die Journalrevision 9 blieben unverändert.
- 6.141 Desktop-Beobachtungen aus 69 gespeicherten Datenständen wurden atomar
  übernommen. Die reale Cloud-Erfassung ergänzte 89 Beobachtungen; weitere
  unveränderte Erfassungen erzeugten keine Duplikate. Der erneute Import prüfte
  identische Inhalte und meldete null neue Score-Beobachtungen.
- 65 datierte MT5-/EODHD-Preisreihen mit 29.090 Daily-Werten wurden übernommen.
  Die Datei mit den vollständigen verfügbaren Daily-Daten ist 29.936.084 Byte
  groß; SHA-256 `46da500d73e01b4e1dbc51d13bc44c3b1c96b53058d38e6119eaef84bc6f86ac`.
  Es wurden keine persönlichen Tabellen, Medien oder Zugangsdaten übertragen.
- Der Live-Lauf prüft Katalog (72 Forex-Paare, neun Währungen, acht Rohstoffe),
  EUR/USD und USD/EUR einschließlich inverser High-/Low-Umrechnung, USD-Historie,
  Gold-OHLC, WTI-Einzelpreise, fehlende Kupfer-Preiszuordnung, die acht
  Commodity-Summen und sichtbare fehlende physische Treiber.
- WebKit mit Touch-/Mobilkontext prüft echte Cloud-Antworten, Marktwechsel,
  SMA-Steuerung, manuelle Erfassung sowie die acht kompakten Rohstoff-Karten.
  Score-Seite bei 320/390/430/768/1440 px und Macro bei 320/390/768/1440 px
  ohne Seitenüberlauf. Keine Laufzeit-/API-Fehler und keine persönlichen
  Schreibversuche. Dieselbe Prüfung am tatsächlichen stabilen Projektlink besteht.
- Temporäre Testschlüssel wurden widerrufen; anonyme und widerrufene
  JSON-Anfragen liefern HTTP 401. Separate Prüfadresse und zusätzliches
  `MACRO_WEB_REVIEW_ORIGIN` wurden wieder entfernt. Die bestehende sensible
  Origin-Konfiguration und der Besitzerzugriffsschutz für alle Deployments
  blieben erhalten. Vercel meldete bereits vor dieser Konfiguration Pro;
  diese Arbeit führte keinen Tarifwechsel durch.
- Typecheck, Format-/Lintprüfung, die betroffenen Frontend-Suites, vier
  Cloud-History-Tests einschließlich echter isolierter PostgreSQL-Tests,
  acht native History-Tests, drei Commodity-Tests, vier Cloud-Macro-Tests
  und 30 Gateway-Tests bestehen. Das schmale öffentliche Schlusskurs-Schema
  wird ausdrücklich read-only ohne OHLC-Spalten getestet.

Prüfberichte und Screenshots liegen ausschließlich lokal auf D: unter
`apps/desktop/.vercel/score-history-*-report.json` und
`apps/desktop/output/playwright/`. Sie werden nicht versioniert.
Die WebKit-Abnahme ersetzt keine physische iPhone-/Besitzer-SSO-Abnahme.
Der Rohstoff-Score bleibt ein transparentes Teilmodell mit sichtbaren Lücken;
diese Softwareprüfung bestätigt keine allgemeine Prognosegüte.
