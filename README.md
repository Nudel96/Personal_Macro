# Personal_Macro

Lokales persönliches Macro-, Seasonality-, COT-, Heatmap- und Tradingjournal-Tool.

Die aktuelle Anwendung liegt in `apps/desktop` und läuft als lokale
Windows-Desktop-App auf Basis von Tauri, React und SQLite. Sie enthält das
Tradingjournal, Dashboard, Kalender, Analytics, Reviews, Ziele, Playbook,
Fehleranalyse, Screenshot-Annotationen, Macro-Heatmap, Seasonality und
Leitzinsanalyse in einem Workspace.

## Einstieg für Coding-Agenten

Neue Coding-Agenten müssen vor Änderungen das verbindliche
[`AGENTS.md`](AGENTS.md) lesen. Es beschreibt die produktive Architektur,
fachliche Invarianten, Scoring- und Journal-Logik, Datenhaltung, Sicherheitsregeln,
Tests und die Definition of Done. `apps/desktop` ist die produktive Anwendung;
`apps/api` und `apps/web` dienen nur als ältere Referenzen.

## Schnellstart zum Testen

Einmalig die Pakete installieren:

```powershell
cd D:\Macrotool\apps\desktop
pnpm install --frozen-lockfile
```

Browser-Vorschau starten:

```powershell
pnpm dev
```

Danach ist der Workspace unter `http://localhost:5173` erreichbar. Die Vorschau
speichert Testdaten im Browser. Für echte SQLite-Daten, Backups, Restore und
lokale Medien die Desktop-App starten:

```powershell
pnpm tauri dev
```

Den installierbaren Windows-Build erzeugen:

```powershell
pnpm tauri build
```

## Broker-Konto verbinden und historische Trades importieren

Unter **Einstellungen → Konten → MT5 / cTrader verbinden** kann ein bestehendes
Broker-Konto als Journal-Konto angelegt werden. MT5 wird über das lokal geöffnete
und bereits angemeldete Terminal erkannt; Passwörter werden nicht abgefragt oder
gespeichert. cTrader verwendet den offiziellen OAuth-Flow mit reinem
`accounts`-Scope. Die Verbindung liest Kontoinformationen und Broker-Balance,
enthält aber ausdrücklich keine Orderfunktionen. cTrader benötigt einmalig eine
freigegebene Open-API-App und die drei leeren Konfigurationswerte aus
`.env.example`; Tokens werden außerhalb von SQLite im Windows-Anmeldedatenspeicher
geschützt.

Historische Trades werden weiterhin bewusst über eine geprüfte Vorschau einem
ausgewählten Journal-Konto zugeordnet:

1. In MetaTrader den klassischen History-/Kontohistorie-Report als HTML
   speichern.
2. In **Import & Export → MetaTrader HTML-Historie** das Zielkonto und die
   Broker-Server-Zeitzone wählen.
3. Die native Vorschau prüfen und anschließend atomar übernehmen.

Der Import führt HTML niemals aus. Reine grafische Aggregate-Reports ohne
Trade-Ledger werden abgelehnt; wiederholte Imports werden über stabile
Quellpositionen dedupliziert.

Für cTrader steht unter **Import & Export → cTrader Statement** zusätzlich ein
Import für HTML- und XLSX-Kontoauszüge bereit. Das ausgewählte Journal-Konto ist
nur das Ziel; Berichtskonto und Berichtswährung dürfen abweichen. Netto-P&L wird
bei abweichender Währung unverändert und ohne automatische FX-Umrechnung
übernommen. Verwendet wird die `History`-Tabelle. Leere XLSX-Exporte enthalten
keine Trades und werden mit einem klaren Hinweis abgelehnt; in diesem Fall den
HTML-Kontoauszug exportieren.

## Automatische Positionsgröße und EODHD-Fundamentaldaten

Die schnelle und die geführte Trade-Erfassung enthalten einen automatischen
Positionsgrößenrechner. Er übernimmt das gewählte Konto, den aktuellen
Kontostand und das Standardrisiko. Forex-Paare, Edelmetalle, bekannte Kryptos
sowie wichtige Währungs-, Metall- und Krypto-Futures besitzen Presets.
Brokerabhängige Kontraktgrößen, Tickgrößen und Tickwerte bleiben im Rechner
editierbar.

Economic Overview, fundamentale Pair-Heatmap und Leitzinsansicht beziehen ihre
Economic-News-Werte ausschließlich aus EODHD. Actual, Forecast und Previous
werden provider-nativ in SQLite gespeichert. Der letzte vollständige Release
bleibt aktiv, bis ein vollständiger Nachfolger vorliegt. Monats-, Quartals- und
Wochenreleases dürfen im Base-/Quote-Vergleich direkt gegenüberstehen.

Die Heatmap verwendet je Zelle `BaseSignal - QuoteSignal`. Eine fehlende Seite
bleibt sichtbar nicht verfügbar, geht gemäß der verbindlichen Bewertungslogik
aber numerisch als `0` ein. Unsichere Provider-Bezeichnungen landen in einer
manuellen Prüfliste und werden nicht automatisch gescored. Nach bekannten
Release-Terminen prüft die Desktop-App gezielt nach; zusätzlich erfolgt ein
täglicher vollständiger Abgleich, solange die App geöffnet ist.

Die Konfiguration erfolgt ausschließlich über `EODHD_API_KEY` in der
`.env.local` im Repository-Stamm. Eine installierte App kann dieselbe Datei
alternativ unter
`%APPDATA%\com.personal-macro.app\PersonalMacro\settings\.env.local` lesen.
Die Auflösung ist unabhängig vom Startordner; der Schlüssel wird weder
protokolliert noch in der Datenbank gespeichert. Für
COT bleibt der eigenständige Datenpfad aktiv. Seasonality verwendet nun
ausschließlich lokal gespeicherte EODHD-Tageshistorien: Forex, Indizes,
Kryptowährungen und Edelmetall-Spots kommen aus dem EOD-Historical-Endpoint;
täglich verfügbare Energie-Rohstoffe aus dem EODHD-Commodities-Endpoint.
Provider-native Handelstage und Herkunft bleiben in der Analyse sichtbar.
Unvollständige Jahre sowie Kohorten unter fünf Beobachtungen werden nicht als
belastbare oder neutrale Evidenz gewertet.

Voraussetzungen für den Desktop-Build sind Node.js, pnpm, Rust, Microsoft C++
Build Tools und WebView2. Details stehen in
[`apps/desktop/README.md`](apps/desktop/README.md).

Die SQLite-Datenbank, Medien, Exporte und Backups liegen im Windows-AppData-Ordner
`%APPDATA%\com.personal-macro.app\PersonalMacro`. Die älteren Projekte in `apps/api` und `apps/web`
bleiben als Referenz erhalten, werden für die Desktop-App aber nicht benötigt.

## Audit-Dokumente

- [`docs/audit/source-codebase-overview.md`](docs/audit/source-codebase-overview.md)
- [`docs/audit/relevant-feature-map.md`](docs/audit/relevant-feature-map.md)
- [`docs/audit/excluded-product-features.md`](docs/audit/excluded-product-features.md)
- [`docs/audit/data-source-audit.md`](docs/audit/data-source-audit.md)
- [`docs/audit/calculation-audit.md`](docs/audit/calculation-audit.md)
- [`docs/architecture/target-architecture.md`](docs/architecture/target-architecture.md)
- [`docs/architecture/database-schema.md`](docs/architecture/database-schema.md)
- [`docs/planning/implementation-roadmap.md`](docs/planning/implementation-roadmap.md)
- [`docs/planning/free-data-strategy.md`](docs/planning/free-data-strategy.md)
- [`docs/planning/forecast-acquisition-policy.md`](docs/planning/forecast-acquisition-policy.md)
- [`docs/planning/eodhd-fundamentals-workflow.md`](docs/planning/eodhd-fundamentals-workflow.md)
- [`docs/planning/policy-rate-model-v1.md`](docs/planning/policy-rate-model-v1.md)
- [`docs/planning/scoring-model-v1.md`](docs/planning/scoring-model-v1.md)
- [`docs/planning/trading-journal-tauri-implementation-plan.md`](docs/planning/trading-journal-tauri-implementation-plan.md)
- [`docs/planning/journal-metrics-and-heatmap-v1.md`](docs/planning/journal-metrics-and-heatmap-v1.md)
- [`docs/planning/trading-journal-ui-reference-analysis.md`](docs/planning/trading-journal-ui-reference-analysis.md)
- [`docs/planning/open-questions.md`](docs/planning/open-questions.md)

## Sicherheitsstatus

Lokale Datenbanken, Brokerimporte, Anhänge, Exporte, Backups und `.env`-Dateien
sind über `.gitignore` ausgeschlossen. `.env.example` enthält ausschließlich
leere Platzhalter für optionale API-Keys und lokale Pfade.
