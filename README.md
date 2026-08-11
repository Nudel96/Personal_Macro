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

## BlackBull MT5 Live Chart

Die Seite **Marktkontext → Live Chart** liest Kurse ausschließlich aus einem
lokal angemeldeten BlackBull-MetaTrader-5-Terminal. Sie kann keine Orders
senden und speichert keine Zugangsdaten.

1. Installiere MetaTrader 5 von BlackBull Markets und melde dich manuell an.
2. Installiere das offizielle Python-Paket: `pip install MetaTrader5`.
3. Starte Personal Macro. Die Verbindung wird automatisch erkannt; eine
   manuelle Prüfung ist weiterhin im Live Chart möglich.

Optional kann in `.env.local` ein lokaler Terminalpfad hinterlegt werden:

```env
BLACKBULL_MT5_TERMINAL_PATH=
BLACKBULL_MT5_SERVER=
```

Bleibt der Pfad leer, sucht MetaTrader 5 die lokale Installation selbst. Die
Symbolauswahl wird immer aus dem tatsächlich verfügbaren BlackBull-Market-Watch
gelesen; es werden keine Symbolnamen geraten.

Unter **Einstellungen → MetaTrader 5** wird jeder erkannte Broker-Account über
die unverwechselbare Kombination aus Server und MT5-Login einem lokalen
Journal-Konto zugeordnet. Erst nach dieser Zuordnung importiert der
Read-only-Connector Positionen und abgeschlossene Deals. Kontowechsel im
Terminal werden automatisch erkannt; unbekannte Logins bleiben bis zur
Bestätigung gesperrt. Balance und Equity werden als Broker-Snapshots getrennt
vom lokal berechneten Journal-Kontostand gespeichert. Passwörter werden nicht
gelesen oder gespeichert und es existiert keine Orderfunktion.

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

Die Konfiguration erfolgt ausschließlich über `EODHD_API_KEY` in `.env.local`;
der Schlüssel wird weder protokolliert noch in der Datenbank gespeichert. Für
COT und Seasonality bleiben die bestehenden getrennten Datenpfade aktiv.

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
