# Personal Macro – Handbuch für Coding-Agents

Diese Datei ist die verbindliche Einstiegshilfe und Arbeitsanweisung für jeden
Coding-Agenten, der in diesem Repository arbeitet. Lies sie vollständig, bevor
du Dateien änderst. Sie beschreibt den tatsächlich implementierten Stand. Bei
Widersprüchen gilt folgende Reihenfolge:

1. expliziter aktueller Auftrag des Benutzers,
2. ausführbarer Code und aktuelle SQLite-Migrationen,
3. diese Datei,
4. Dokumente unter `docs/`,
5. ältere Referenzprojekte unter `apps/api` und `apps/web`.

Planungs- und Audit-Dokumente erklären wichtige Entscheidungen, können dem Code
aber zeitlich hinterherlaufen. Behaupte nicht, eine Funktion sei implementiert,
nur weil sie in einem Plan beschrieben ist.

## 1. Produktauftrag und feste Grenzen

Personal Macro ist ein lokaler, persönlicher Trading-Workspace für genau einen
Benutzer. Die Anwendung verbindet:

- Tradingjournal, Trade-Erfassung und Trade-Reviews,
- Dashboard, Kalender, Analytics und Performance-Heatmaps,
- Setups, Playbook, Ziele, Fehler- und Emotionsanalyse,
- lokale Medien und Screenshot-Annotationen,
- Macro-Heatmap mit Base-/Quote-Vergleich,
- COT-/institutionelle Bewertung,
- Growth-, Inflation- und Arbeitsmarktdaten,
- Leitzinsen inklusive relativer USD-Wirkung,
- Seasonality,
- automatische Positionsgrößenberechnung,
- optionale read-only Kontoerstellung und Kontostandsaktualisierung über ein
  lokal angemeldetes MetaTrader-5-Terminal oder cTrader Open API OAuth,
- manueller, kontogebundener Import klassischer MetaTrader-HTML-Historien sowie
  cTrader-Account-Statements als HTML oder XLSX,
- direkter Forecast-/Actual-/Previous-Import aus EODHD Economic Events,
- lokale Importe, Exporte, Backups und Restore.

Nicht-Ziele, solange der Benutzer sie nicht ausdrücklich neu beauftragt:

- keine Broker-Orderausführung,
- kein Mehrbenutzerbetrieb und keine Rollenverwaltung,
- keine verpflichtende Cloud-Anmeldung,
- kein Social Feed, Marketplace oder öffentliches Profil,
- keine Zahlungs-, Abo- oder Lizenzlogik,
- keine automatische Handelsempfehlung durch externe Dienste,
- keine Übertragung persönlicher Journal-Daten an externe Datenanbieter.

Die Anwendung ist **local-first**. Journal- und Kontodaten bleiben standardmäßig
in einer lokalen SQLite-Datenbank. Netzwerkzugriffe sind auf ausdrücklich
konfigurierte Datenanbieter, releasegebundene EODHD-Aktualisierungen und vom
Benutzer autorisierte read-only-cTrader-Kontoverbindungen begrenzt.

## 2. Source of Truth und Repository-Aufbau

Das Repository liegt aktuell unter `D:\Macrotool`.

```text
D:\Macrotool
├─ AGENTS.md                       # dieses verbindliche Agenten-Handbuch
├─ README.md                       # Benutzer-Schnellstart
├─ START-MACROTOOL.cmd             # Start per Doppelklick
├─ .env.example                    # nur leere Konfigurationsbeispiele
├─ .env.local                      # lokale Secrets, niemals ausgeben/committen
├─ apps/
│  ├─ desktop/                     # PRODUKTIVE ANWENDUNG / SOURCE OF TRUTH
│  │  ├─ src/                      # React-/TypeScript-Frontend
│  │  ├─ src-tauri/                # Rust-, SQLite- und Tauri-Backend
│  │  ├─ public/                   # statische Frontend-Assets
│  │  ├─ package.json
│  │  └─ pnpm-lock.yaml
│  ├─ api/                         # älteres Referenzprojekt, nicht produktiv
│  └─ web/                         # ältere Browser-App, nicht produktiv
└─ docs/
   ├─ architecture/                # frühere Zielbilder und Schemaentwürfe
   ├─ audit/                       # Herkunfts- und Berechnungsaudits
   └─ planning/                    # Spezifikationen, Entscheidungen, Roadmaps
```

### Verbindliche Regel

Implementiere neue Produktfunktionen grundsätzlich in `apps/desktop`. Ändere
`apps/api` oder `apps/web` nur, wenn der Benutzer diese Projekte ausdrücklich
nennt. Die dortigen `.venv`-/`node_modules`-Ordner sind keine Architekturvorgabe
für die Desktop-App.

Build-Artefakte wie `node_modules`, `dist` und `src-tauri/target` sind keine
Quelltexte. Bearbeite sie nicht manuell und committe sie nicht.

## 3. Technischer Stack

### Frontend

- React 19 und TypeScript im Strict Mode
- Vite 7
- React Router mit lazy geladenen Seiten
- TanStack Query für Server-/Command-State
- Zustand für persistierten UI- und globalen Filter-State
- Radix UI für zugängliche Primitive
- React Hook Form und Zod für komplexe Formulare
- ECharts für quantitative Visualisierungen
- TipTap für Rich-Text-Felder
- Konva für Screenshot-Annotationen
- Sonner für Toasts
- Lucide für Icons
- Tailwind-Utilities plus ein umfangreiches CSS-Token-/Komponentensystem
- Vitest und Testing Library

### Desktop-Backend

- Tauri 2
- Rust Edition 2024
- SQLite über SQLx
- Tokio für asynchrone Jobs
- Reqwest mit Rustls für Markt-, COT- und Seasonality-Daten
- `rust_decimal` für präzise Dezimalwerte, insbesondere Zinsen
- CSV, Calamine/XLSX, ZIP und SHA-256 für Import, Export und Backup
- Proptest, Rust Unit- und Repository-Tests

### Speicher

- Desktop-App: SQLite und lokale Dateien in Windows AppData
- Browser-Vorschau: `localStorage` und Demo-/Fallback-Adapter
- UI-Präferenzen: Zustand-Persistenz beziehungsweise Tauri Store

## 4. Laufzeitarchitektur

Der normale Datenfluss lautet:

```text
React-Seite
  → TanStack Query / Mutation
  → src/services/commands.ts
  → Tauri invoke(command, camelCase args)
  → src-tauri/src/commands/*.rs
  → Repository / Metrics Engine / SQLx
  → SQLite oder lokales Dateisystem
  → serialisierte camelCase-Antwort
  → Query-Cache / UI
```

In der Browser-Vorschau erkennt `isTauri()` die fehlende native Laufzeit. Der
Service verwendet dann Implementierungen aus `browser-adapter.ts`,
`rates-browser.ts` und `workspace-browser.ts`. Dieser Modus
ist für schnelle UI-Entwicklung, nicht für die vollständige Produktabnahme.

Native Funktionen, die in der Browser-Vorschau nicht vollständig funktionieren:

- echte SQLite-Persistenz,
- sichere native Dateiimporte,
- Medien im AppData-Verzeichnis,
- automatische Backups und Restore,
- COT- und Seasonality-Aktualisierung.

## 5. Frontend-Struktur

```text
apps/desktop/src
├─ App.tsx                         # Routing und Lazy Loading
├─ app/providers.tsx               # QueryClient, Tooltip, Toasts
├─ components/
│  ├─ layout/                      # Shell, Sidebar, Command Palette
│  └─ ui/                          # kleine wiederverwendbare UI-Primitives
├─ charts/base-chart.tsx           # ECharts-Basis
├─ features/                       # vertikale Produkt-Slices
│  ├─ dashboard/
│  ├─ trades/
│  ├─ calendar/
│  ├─ analytics/
│  ├─ reviews/
│  ├─ playbook/
│  ├─ mistakes/
│  ├─ media/
│  ├─ goals/
│  ├─ macro/
│  ├─ seasonality/
│  ├─ rates/
│  ├─ import-export/
│  └─ settings/
├─ services/commands.ts            # einzige öffentliche Command-Fassade
├─ services/*-browser.ts           # Browser-Fallbacks
├─ stores/ui-store.ts              # globale Filter und Dialog-/Sidebar-State
├─ types/domain.ts                 # Frontend-Datenverträge
├─ lib/utils.ts                    # Formatierung und kleine Hilfen
└─ styles/globals.css              # Design-Tokens und App-Styling
```

### Aktuelle Routen

- `/` – Übersicht/Dashboard
- `/trades` – Trades, Filter, Saved Views, Papierkorb
- `/calendar` – Tradingkalender und tägliche Performance
- `/analytics` – gruppierte Journal-Auswertungen
- `/reviews` – periodische Reviews
- `/playbook` – Setups und versionierte Regeln
- `/mistakes` – Fehleranalyse
- `/media` – Medien und Annotationen
- `/goals` – Ziele und Fortschritt
- `/macro` – Macro- und Pair-Heatmap
- `/regime-insights` – langfristige, empirisch validierte Regime-Treiber;
  aktuell China CPI YoY im Vergleich mit AUDUSD-D1-/W1-OHLC
- `/seasonality` – saisonale Daten
- `/rates` – Leitzinsen
- `/import-export` – Exporte, Backup, Restore, Legacy-Import
- `/settings` – Konten, Taxonomien, Felder und Systemeinstellungen

### Frontend-Konventionen

1. Feature-Seiten greifen über `api` aus `services/commands.ts` zu. Verteile
   keine direkten `invoke()`-Aufrufe in Komponenten.
2. Neue native Commands benötigen normalerweise vier Änderungen:
   Rust-Command, Registrierung in `src-tauri/src/lib.rs`, TypeScript-Vertrag in
   `types/domain.ts` und Methode in `services/commands.ts`.
3. Entscheide ausdrücklich, ob ein Browser-Fallback sinnvoll ist. Liefere keine
   scheinbar erfolgreiche Mock-Antwort für sicherheits- oder netzwerkkritische
   Funktionen.
4. Mutationen müssen betroffene Query Keys invalidieren. Häufige Keys sind
   `bootstrap`, `trades`, `dashboard`, `macro`, `rates`, `seasonality`, `media`,
   `backups` und die jeweiligen Detail-Keys.
5. Formulare zeigen verständliche deutsche Fehlermeldungen. Backendfehler werden
   als `CommandError` normalisiert.
6. Nutzertexte sind grundsätzlich Deutsch. Code, Dateinamen und technische
   Identifikatoren bleiben Englisch.
7. Vermeide neue globale Zustände, wenn Query-State oder lokaler Component-State
   genügt.
8. Geldwerte aus dem Backend sind überwiegend Integer in kleinster
   Währungseinheit und werden erst in der Anzeige durch 100 geteilt.
9. ISO-Zeitstempel aus dem Backend werden in der UI lokal formatiert.
10. Erhalte Tastaturbedienung, Fokusmarkierungen und Radix-Dialogverhalten.

## 6. Designsystem und visuelle Regeln

Das Produkt verwendet ein dichtes, hochwertiges Dark-Dashboard. Die zentralen
Tokens stehen am Anfang von `src/styles/globals.css`.

- Hintergrund: sehr dunkles Navy statt reines Schwarz
- Flächen: gestaffelte Navy-Surfaces mit feinen blauen Borders
- Primärfarbe: Blau/Violett
- positiv/bullish: Grün
- negativ/bearish: Rot
- Warnung/neutraler Hinweis: Amber
- abgerundete Cards, zurückhaltende Schatten, kompakte Tabellen
- Zahlen müssen auch bei hoher Informationsdichte schnell vergleichbar bleiben

Wichtige visuelle Regeln:

1. Verwende bestehende Tokens (`--surface`, `--text-2`, `--positive`, usw.) und
   bestehende UI-Komponenten vor neuen Einzelstilen.
2. Rot und Grün transportieren Bedeutung. Nutze sie nicht dekorativ oder mit
   vertauschter Semantik.
3. Fehlende Werte werden als nicht verfügbar dargestellt, nie automatisch als
   neutral oder Null.
4. Heatmap-Zellen müssen Score, Richtung und Verfügbarkeit nachvollziehbar
   darstellen.
5. Neue Charts brauchen lesbare Achsen, Tooltips, Einheiten und Empty States.
6. Die App hat aktuell eine Mindestbreite von 1024 px. Änderungen dürfen die
   vorhandene Desktop-Dichte nicht unbeabsichtigt auflösen.
7. Neue umfangreiche Abhängigkeiten nur ergänzen, wenn der vorhandene Stack die
   Anforderung nicht bereits erfüllt.

## 7. Rust-/Tauri-Backend

```text
apps/desktop/src-tauri/src
├─ lib.rs                           # Plugins, Setup, Scheduler, Command-Registry
├─ main.rs                          # dünner Windows-/Tauri-Einstieg
├─ errors.rs                        # AppError und serialisierbarer CommandError
├─ database/mod.rs                  # AppData-Pfade, Pool, Migrationen, Seeds
├─ domain/models.rs                 # Trade-/Bootstrap-Domainmodelle
├─ commands/
│  ├─ system.rs                     # Bootstrap, Konten, Cashflows, Settings
│  ├─ trades.rs                     # dünne Trade-Command-Schicht
│  ├─ journal.rs                    # Kontext, Legs, Tags, Checklisten, Felder
│  ├─ analytics.rs                  # Dashboard und Kalender
│  ├─ workspace.rs                  # Reviews, Ziele, Playbook, Fehler
│  ├─ eodhd.rs                      # EODHD Economic Events Client
│  ├─ eodhd_fundamentals.rs         # Fundamentals-Snapshots und Heatmap
│  ├─ eodhd_prices.rs               # EODHD EOD-/Commodity-Historien für Seasonality
│  ├─ cot.rs                        # eigenständige COT-Daten und Bewertung
│  ├─ policy_rates.rs               # Zins-Snapshots und USD-Relativwirkung
│  ├─ seasonality.rs                # EODHD-Seasonality, Analyse und Abruf
│  ├─ metatrader_html.rs             # Vorschau und atomarer HTML-Historienimport
│  ├─ ctrader_statement.rs           # sicherer cTrader-HTML-/XLSX-Import
│  ├─ journal_reset.rs               # verifizierter Backup-/Journal-Reset
│  ├─ media.rs                      # lokale Medien und Annotationen
│  ├─ data_transfer.rs              # Export, Backup und Restore
│  └─ legacy.rs                     # kontrollierter Alt-Datenbankimport
├─ metrics/
│  ├─ mod.rs                        # Journal-Kennzahlen
│  └─ policy_rates.rs               # präzise Zinsberechnung
└─ repositories/trades.rs           # Trade-Validierung, CRUD, Filter, Soft Delete
```

### Backend-Konventionen

- Commands validieren Eingaben und orchestrieren. Wiederverwendbare Berechnung
  gehört in `metrics`, komplexer Datenzugriff in `repositories`.
- SQL-Operationen über mehrere Tabellen laufen in Transaktionen.
- `AppError` bleibt intern; Tauri-Antworten verwenden `CommandError` mit stabilem
  Code und benutzerfreundlicher Nachricht.
- Serde-Verträge verwenden `#[serde(rename_all = "camelCase")]`, passend zum
  TypeScript-Frontend.
- Keine Secrets in Logs, Fehlermeldungen oder serialisierten Antworten.
- Begrenze externe Antworttexte und Providerfehler, bevor sie gespeichert oder
  angezeigt werden.
- Verwende UTC/RFC3339 für persistierte Zeitpunkte.
- Nutze `rust_decimal` oder Textrepräsentationen, wenn binäres Float-Runden die
  fachliche Aussage verändern kann.

## 8. SQLite-Datenmodell und Migrationen

Die tatsächliche Datenbank wird ausschließlich durch die SQL-Dateien unter
`apps/desktop/src-tauri/migrations` definiert. Aktuell existieren Migrationen
`0001` bis `0027`.

Wichtige Tabellengruppen:

- System: `app_settings`, `schema_migrations`
- Konten: `accounts`, `account_cashflows`
- Taxonomie: `strategies`, `setups`, `setup_versions`, `tags`
- Trades: `trades`, `trade_legs`, `trade_tags`, Checklisten, Emotionen,
  Fehlerzuordnungen und Kontextlinks
- Medien: `media_files`, `trade_media`, `media_annotations`
- Arbeitsprozess: `reviews`, `goals`, `goal_progress`, Saved Views und Custom
  Fields
- Datenverkehr: `import_runs`, `import_rows`, `export_runs`, `deleted_items`
- Macro: `macro_snapshots`, `macro_indicators`, `cot_snapshots`,
  `seasonality_snapshots`, `policy_rate_snapshots`, Currency- und Pair-Scores
- Provider: `economic_provider_events`, `provider_sync_runs`
- Legacy-MT5: alte Snapshot-, Deal-, Positions- und Sync-Tabellen bleiben nur
  als Upgrade-Historie bestehen und werden nicht mehr zur Laufzeit befüllt
- EODHD: Events, Mappingkandidaten, Release-Jobs und Fundamentals-Snapshots

### Migrationsregeln

1. Bereits ausgelieferte Migrationen niemals nachträglich umschreiben. Lege die
   nächste nummerierte Migration an.
2. Migrationen müssen auf einer bestehenden Benutzer-Datenbank funktionieren,
   nicht nur auf einer leeren Testdatenbank.
3. Bei neuen Spalten sinnvolle Defaults oder einen kontrollierten Backfill
   vorsehen.
4. Foreign Keys und Such-/Sortierpfade mit passenden Indizes absichern.
5. Nach Schemaänderungen Rust-Modelle, SQL-Abfragen, TypeScript-Typen,
   Browser-Fallback und Tests prüfen.
6. Persönliche Datenbanken niemals ins Repository kopieren oder für Tests
   verändern. Tests verwenden temporäre Datenbanken.
7. Direkte Reparaturen an der Benutzer-Datenbank sind nur mit expliziter
   Zustimmung und vorherigem Backup zulässig.

## 9. Lokale Daten, AppData und Backups

Die produktive App verwendet durch den Tauri-Identifier
`com.personal-macro.app` derzeit:

```text
%APPDATA%\com.personal-macro.app\PersonalMacro
├─ database\journal.sqlite
├─ media\
├─ exports\
├─ backups\
├─ logs\
└─ settings\
```

Die Daten liegen absichtlich nicht unter `D:\Macrotool`. Ein Wechsel des
Quellordners darf daher die Journaldaten nicht verschieben oder löschen.

Beim Start:

1. werden Verzeichnisse angelegt,
2. ein SQLite-Pool mit Foreign Keys, WAL und Busy Timeout geöffnet,
3. Migrationen und Seeds ausgeführt,
4. ein automatisches Backup geprüft,
5. höchstens einmal in 24 Stunden ein ZIP-Backup erstellt,
6. die konfigurierte Aufbewahrungszahl angewendet.

Restore wird zuerst validiert und gestaged. Vor einem tatsächlichen Austausch
entsteht eine Sicherheitskopie. Schwäche diese Reihenfolge nicht ab.

## 10. Verbindliche Macro- und Heatmap-Logik

Dieser Abschnitt ist fachlich kritisch. Ändere die Methodik nicht stillschweigend
und ersetze sie nicht durch eine allgemeinere Currency-Strength-Formel.

### 10.1 Einzelindikator

Für ökonomische Daten mit Actual, Forecast und Previous gilt:

```text
surprise = actual - forecast
signal = sign(surprise × direction)
```

- `direction = +1`: höher als Forecast ist positiv für die Währung.
- `direction = -1`: niedriger als Forecast ist positiv, zum Beispiel
  Arbeitslosenquote oder Jobless Claims.
- `signal ∈ {-1, 0, +1}`.
- `previous` ist Kontext und wird nicht anstelle des Forecasts gescored.
- Actual und Forecast müssen beide vorhanden sein.
- Fehlend bedeutet `unavailable`, nicht neutral.
- Exakte Gleichheit bedeutet neutral.

Der Provider-Mapper klassifiziert aktuell unter anderem:

- Growth: GDP, Manufacturing/Services PMI, Retail Sales, Consumer/Business
  Confidence, Industrial Production, Household Spending
- Inflation: CPI, Core CPI, PPI, PCE und länderspezifische Varianten
- Labor: NFP, Employment Change, ADP, JOLTS, Jobless Claims,
  Arbeitslosenquote und Wage Growth

Nicht jede Währung besitzt jeden Datenpunkt. Die Matrix darf fehlende
Gegenstücke nicht erfinden.

### 10.2 COT / institutionelle Aktivität

Pro Währung werden ausgewertet:

```text
net_positions = long_positions - short_positions
net_change = net_positions - previous_net
z_score = (net_positions - historical_mean) / historical_stddev
```

Position, Change und Z-Score werden jeweils auf `-1`, `0` oder `+1` reduziert.
Der COT-Faktorscore ist der Durchschnitt der verfügbaren Signale. Coverage zeigt,
welche der drei Komponenten tatsächlich vorlagen. Mindestens zwei historische
Netto-Beobachtungen sind für einen Z-Score erforderlich.

### 10.3 Currency-Faktoren

Die verbindliche Reihenfolge der Kernfaktoren lautet:

1. COT / institutionelle Aktivität
2. Growth
3. Inflation
4. Labor
5. Rates
6. Seasonality

Technischer Trend und Crowd Sentiment können als weitere Currency-Faktoren
gespeichert werden. Raw-Wirtschaftsdaten werden innerhalb ihrer Domäne als
gewichteter Durchschnitt der binären Signale aggregiert. Currency-Scores dienen
Ranking und Überblick; der Paarvergleich nutzt nach Möglichkeit die einzelnen
Indikatoren.

### 10.4 Base-/Quote-Paarvergleich

Für jeden Datenpunkt mit Signalen auf beiden Seiten:

```text
component_score = base_signal - quote_signal
component_score ∈ {-2, -1, 0, +1, +2}
```

Beispiele:

- Base `+1`, Quote `-1` → `+2`
- Base `+1`, Quote `+1` → `0`
- Base `-1`, Quote `-1` → `0`
- Base `0`, Quote `+1` → `-1`
- eine Seite fehlt → nicht verfügbar und kein Beitrag zum Rohscore

Der Paar-Rohscore ist die **Summe** aller verfügbaren Komponenten, keine
Faktor-Durchschnittsnote. COT, Rates und Seasonality werden als
Faktorkomponenten ergänzt. Der normierte Anzeigenwert ist derzeit:

```text
normalized_score = clamp(raw_score / available_component_count, -2, +2)
```

Weitere Metadaten:

- Coverage = verfügbare Komponenten / alle vorgesehenen Komponenten
- Quality = Durchschnitt der Qualitätswerte verfügbarer Komponenten
- Agreement = Anteil der dominierenden Beitragsrichtung
- Conviction 0–5 wird aus dem Betrag des Rohscores abgeleitet
- Bias-Labels verwenden den Rohscore: ab `+5` Bullish, ab `+9` Sehr Bullish,
  bis `-5` Bearish und bis `-9` Sehr Bearish; dazwischen Neutral

Die vollständige Paarmatrix muss antisymmetrisch sein:

```text
score(A/B) = -score(B/A)
```

Jede Änderung braucht mindestens Tests für `+2`, Aufhebung gleicher Signale,
fehlende Gegenstücke, Summenbildung und Antisymmetrie.

## 11. Leitzinsmodell

Zinsen sind ein eigener fachlicher Bereich und kein versteckter Teil von
Inflation.

Pro Zentralbank:

```text
expected_delta_bps = (expected_rate - current_rate) × 100
decision_surprise_bps = (actual_rate - expected_rate) × 100
```

- positive Erwartungsänderung → hawkish/positiv
- negative Erwartungsänderung → dovish/negativ
- Hold → neutral
- fehlende Erwartung oder nicht frische Daten → unavailable

Für USD wird die relative Wirksamkeit gegenüber ausländischen Zentralbanken
berechnet:

```text
foreign_pressure = gewichteter Durchschnitt ausländischer expected_delta_bps
usd_relative_stance = usd_expected_delta_bps - foreign_pressure
```

Mindestens vier nutzbare ausländische Zentralbanken sind standardmäßig nötig.
Wenn die Welt gleichzeitig ähnlich stark anhebt, kann eine US-Anhebung relativ
neutral werden. Verwechsele diese Relativwirkung nicht mit dem absoluten
Fed-Signal.

## 12. Seasonality

Seasonality-Snapshots speichern Asset, Symbol, Horizont, Stichprobenzeitraum,
durchschnittliche Rendite, positive Trefferquote, Stichprobengröße, Signal und
Kurvenpunkte. Das Signal ist `-1`, `0`, `+1` oder nicht verfügbar.

Die aktive Preisquelle ist ausschließlich EODHD. Forex, Indizes,
Kryptowährungen und Edelmetall-Spots werden aus dem EOD-Historical-Endpoint
geladen; täglich verfügbare Energie-Rohstoffe aus dem EODHD-Commodities-Endpoint.
Frühere Dukascopy-Kerzen und -Profile bleiben nur als nicht gelesene
Upgrade-Historie erhalten und dürfen nicht als Laufzeit-Fallback verwendet
werden. Der alte Instrumentkatalog darf einmalig nur zur expliziten
Symbolzuordnung in den validierten EODHD-Katalog gelesen werden.

- Keine belastbare Seasonality ohne Herkunft, Zeitraum und Stichprobengröße.
- Nur Kalenderjahre mit Abdeckung am Jahresanfang und Jahresende zählen als
  vollständige Stichprobe; unter fünf Jahren bleiben Rankings explorativ.
- Fehlende oder zu kleine Stichproben nicht als neutrale Evidenz behandeln.
- Das Paar-Scoring verwendet den saisonalen Currency-/Asset-Faktor in derselben
  Base-minus-Quote-Richtung.

## 13. Fundamentaldatenquelle

Die aktive Fundamentals-Pipeline liegt ausschließlich in `commands/eodhd.rs`
und `commands/eodhd_fundamentals.rs`. Numerische Source of Truth sind die
provider-nativen Tabellen `eodhd_events`, `eodhd_fundamental_snapshots` und
`eodhd_fundamental_evaluations`. Excel, OpenAI, Forex Factory, Trading
Economics und BIS dürfen nicht als Fundamentals- oder Rates-Fallback
wiedereingebaut werden. Die alten nummerierten Migrationen bleiben
unveränderliche Upgrade-Historie; Migration `0030` entfernt ihre Laufzeittabellen.

## 14. EODHD-Release-Workflow

Ein vollständiger Tagesabgleich lädt alle neun Währungen in begrenzten
Datumsfenstern und paginiert innerhalb der Providergrenzen. Bekannte kommende
Releases erzeugen Nachprüfungen nach 2, 10, 30 und 120 Minuten. Nachträglich
entdeckte unvollständige Releases der letzten sieben Tage erhalten denselben
Retry-Satz. Der letzte vollständige Actual-/Forecast-Release bleibt bis zu
einem vollständigen Nachfolger aktiv. Unsichere Mappings benötigen eine
manuelle Freigabe. Unterschiedliche Frequenzen und Release-Daten sind im
Paarvergleich zulässig; die Metadaten bleiben im Tooltip sichtbar.

## 15. Tradingjournal-Domain

### Konten

Konten besitzen Name, Broker, Kontotyp, Basiswährung, Startkapital, aktuellen
Kontostand, Standardrisiko und Archivstatus. Cashflows verändern den aktuellen
Kontostand nachvollziehbar. Globale Account-Filter liegen in `ui-store.ts` und
beeinflussen Dashboard-/Trade-Auswertungen.

Ein Account-Wechsel ist Filterung, kein Benutzerwechsel. Die App bleibt
Single-User.

Konten können optional read-only über ein lokal angemeldetes MT5-Terminal oder
über cTrader Open API OAuth mit dem Scope `accounts` erstellt und hinsichtlich
der Broker-Balance aktualisiert werden. Die Verbindung enthält keine
Orderfunktionen. MT5-Passwörter werden nicht abgefragt oder gespeichert;
cTrader-Tokens liegen nicht in SQLite, sondern geschützt im
Windows-Anmeldedatenspeicher. Historische Trades werden weiterhin ausschließlich
über die zweiphasige Vorschau und den atomaren Commit eines klassischen
MetaTrader-HTML-Reports oder eines cTrader-Statements als HTML/XLSX in ein
ausdrücklich ausgewähltes aktives Journal-Konto übernommen.
Beim cTrader-Import ist dieses Konto ausschließlich das Importziel;
Berichtskonto und Berichtswährung dürfen abweichen. Abweichende Netto-P&L-Werte
werden ohne erfundene FX-Umrechnung numerisch unverändert übernommen und mit der
Quellwährung gekennzeichnet.
Grafische Aggregate-Reports und leere XLSX-Dateien werden abgelehnt; HTML wird
niemals in der Oberfläche ausgeführt.

### Trades

Der Kern unterstützt Draft, Planned, Open, Closed, Cancelled, Archived und
Trashed/Soft-Delete.
Trade-Daten umfassen unter anderem Instrument, Assetklasse, Richtung, Zeitpunkte,
Entry, Stop, Target/Exit, Quantity, Kosten, P&L, R, Setup, Strategie, Session,
Timeframe, Prozess- und Qualitätsbewertungen, Regelbefolgung und Reviewtexte.

Ergänzende Entitäten:

- Legs/Teilausführungen
- Tags
- Checklisten
- Emotionen nach Phase
- Fehler mit Schweregrad und geschätzten Kosten
- Custom Fields
- Medien und Annotationen
- Macro-/Seasonality-/COT-Kontextlinks

Löschen ist standardmäßig Soft Delete mit Papierkorb und Restore. Füge keine
Hard-Delete-Oberfläche ohne explizite Anforderung und Schutzdialog hinzu.

### Journal-Metriken

Die kanonische Engine liegt in Rust unter `metrics/mod.rs`. Die Browser-Vorschau
enthält eine parallele Implementierung in `browser-adapter.ts`; fachliche
Änderungen müssen in beiden Pfaden identisch sein.

Wichtige Regeln:

- nur geschlossene Trades mit bekanntem P&L fließen in Ergebniskennzahlen ein,
- Win Rate = Gewinner / alle geschlossenen Trades inklusive Break-even im
  Nenner,
- Profit Factor = Gross Profit / Betrag Gross Loss,
- bei Gewinnen und null Verlusten ist Profit Factor ein besonderer Wert `∞`,
  nicht eine beliebige große Zahl,
- Expectancy = Net P&L / Anzahl geschlossener Trades,
- R wird nur mit gültigem initialem Risiko berechnet,
- SQN benötigt mindestens 30 gültige R-Werte,
- Equity Curve wird chronologisch nach Abschluss aufgebaut,
- Drawdown = bisheriger Peak minus aktuelle kumulierte Equity,
- Break-even setzt Gewinn- und Verlustserien zurück,
- Prozess-, Ausführungs- und Regelmetriken zeigen `n` und Availability,
- Setup-/Zeit-/Account-Auswertungen müssen kleine Stichproben sichtbar machen.

Fehlende Kennzahlen werden mit Status und Reason Code geliefert. Ersetze sie
nicht durch `0`, weil Null eine reale fachliche Aussage sein kann.

## 16. Positionsgrößenrechner

Der Rechner liegt unter:

- `features/trades/position-sizing.ts`
- `features/trades/position-size-calculator.tsx`
- `features/trades/position-sizing.test.ts`

Eingaben werden aus ausgewähltem Konto, aktuellem Kontostand und
`defaultRiskPercent` vorbelegt. Fachlich gilt:

```text
risk_amount = account_balance × risk_percent
stop_distance = abs(entry - stop)
```

Für Spot/CFD/Forex/Metalle/Krypto:

```text
risk_per_quantity_quote = stop_distance × contract_size
```

Für Futures:

```text
risk_per_contract_quote = (stop_distance / tick_size) × tick_value
```

Danach erfolgt die Umrechnung von Quote- in Kontowährung. Quantity wird immer
auf den zulässigen Step **abgerundet**, damit das Risikolimit nicht überschritten
wird. Unterhalb der Mindestgröße ist das Ergebnis null statt einer unzulässigen
Ordergröße.

Presets existieren für wichtige Fiat-Futures und Micros, Gold, Silber, Kupfer,
Platin, Palladium, Micro Bitcoin und Micro Ether sowie Forex-Standardlots,
Edelmetall-CFDs und bekannte Kryptos. Broker-Spezifikationen können abweichen;
Contract Size, Tick Size, Tick Value, FX-Umrechnung und Step müssen deshalb
editierbar und transparent bleiben.

## 17. Tests und Qualitätsgates

Arbeite in:

```powershell
cd D:\Macrotool\apps\desktop
```

Einmalige Installation:

```powershell
pnpm install --frozen-lockfile
```

Schnelle Frontend-Prüfung:

```powershell
pnpm typecheck
pnpm test
pnpm lint
pnpm format:check
pnpm build
```

Rust-/SQLite-Prüfung:

```powershell
cd D:\Macrotool\apps\desktop\src-tauri
cargo fmt --all -- --check
cargo test
cargo clippy --all-targets -- -D warnings
```

Realer App-Start:

```powershell
cd D:\Macrotool\apps\desktop
pnpm tauri dev
```

Browser-Vorschau:

```powershell
pnpm dev
```

Windows-Build:

```powershell
pnpm tauri build
```

Der Browser-Modus reicht nicht als Abnahme für Datenbank, Backup, EODHD-Sync,
Medien oder Restore. Nach Änderungen an diesen Bereichen muss die
Tauri-App real gestartet werden und ohne neue Warnungen initialisieren.

### Testpflicht nach Änderungsart

- UI-only: Typecheck, relevante Vitest-Tests, Build
- Browser-Fallback: Vitest plus Abgleich mit nativer Semantik
- Rust-Command/Repository: relevante Unit-/Repository-Tests und Clippy
- Migration: Start mit leerer und bestehender Testdatenbank
- Scoring: deterministische Vektoren und Antisymmetrie
- EODHD-Fundamentals: Pagination, Mapping, Deduplizierung, Release-Retries und fehlende Werte
- Backup/Restore: Erstellung, Manifest, Hash, Preview und sichere Staging-Reihenfolge
- Positionsgröße: Forex, Futures, Metall, Krypto, FX-Konvertierung und Rundung

## 18. Lokales Starten und typische Fehler

Die einfachste Startmöglichkeit ist:

```text
D:\Macrotool\START-MACROTOOL.cmd
```

Typische Ursachen:

- `localhost refused to connect`: Vite läuft nicht oder Port 5173 ist belegt.
- `strictPort`-Fehler: einen alten Vite-/Tauri-Prozess gezielt beenden, nicht
  wahllos alle Node-Prozesse.
- langsamer erster Start: Rust kompiliert Tauri/WebView/SQLite am neuen Ort.
- Browser kann Datei/Backup nicht: Browser-Vorschau statt Tauri gestartet.
- Fundamentals ohne Werte: API-Konfiguration, Mapping, Release, Forecast und Actual
  einzeln prüfen; nicht mit Mockdaten verdecken.
- alte Dokumentation zeigt `%APPDATA%\PersonalMacro`: der reale aktuelle Pfad
  enthält den Tauri-Identifier `com.personal-macro.app`.

## 19. Sicherheits- und Datenschutzregeln

1. `.env.local`, Datenbanken, Backups, Exporte, Imports und persönliche Medien
   niemals committen.
2. Keine Secrets in Screenshots, Testfixtures, Logs, Git-Diffs oder Antworten.
3. `.gitignore` nicht so ändern, dass lokale Daten plötzlich versioniert werden.
4. Externe URLs und Importpfade validieren; keine beliebigen Dateipfade aus
   untrusted Input öffnen.
5. HTML aus Rich-Text-Inhalten vor unsicherer Darstellung bereinigen.
6. Medienzugriff bleibt auf den Tauri-Asset-Scope beschränkt.
7. Import/Restore niemals direkt über die aktive Datenbank schreiben, bevor
   Validierung und Sicherheitskopie abgeschlossen sind.
8. Keine rekursiven Löschoperationen gegen Projektroot oder AppData.
9. User-Daten nicht zur Entwicklung leeren oder durch Demos ersetzen.
10. Netzwerkfehler dürfen die lokale Journal-Funktion nicht blockieren.

## 20. Dokumentationsindex

Nützliche Vertiefungen:

- `docs/planning/scoring-model-v1.md` – fachliche Score-Vorgaben
- `docs/planning/policy-rate-model-v1.md` – Zins- und USD-Relativmodell
- `docs/planning/journal-metrics-and-heatmap-v1.md` – Kennzahlen und Heatmaps
- `docs/planning/aud-china-cpi-regime-v1.md` – China-CPI-/AUD-Regimemodell
- `docs/planning/forecast-acquisition-policy.md` – Forecast-Beschaffung
- `docs/planning/free-data-strategy.md` – kostenlose Datenquellenstrategie
- `docs/audit/calculation-audit.md` – Audit früherer Formeln
- `docs/audit/data-source-audit.md` – Quellen- und Qualitätsmatrix
- `docs/planning/trading-journal-ui-reference-analysis.md` – UI-Referenz
- `docs/planning/trading-journal-tauri-implementation-plan.md` – historischer
  Implementierungsplan

Vorsicht:

- `docs/architecture/database-schema.md` ist ein früheres umfassendes Zielmodell,
  nicht das aktuelle SQLite-Schema.
- `docs/architecture/target-architecture.md` enthält eine größere frühere
  Zielarchitektur, nicht ausschließlich den implementierten Tauri-Stand.
- `docs/planning/implementation-roadmap.md` ist keine automatische Aussage über
  den Fertigstellungsstatus.

## 21. Empfohlener Arbeitsablauf für einen neuen Agenten

### Orientierung

1. Lies `AGENTS.md` und `README.md`.
2. Prüfe `git status`; vorhandene Änderungen gehören möglicherweise dem
   Benutzer und dürfen nicht überschrieben werden.
3. Lies die betroffene Feature-Seite und `services/commands.ts`.
4. Verfolge den nativen Command aus `lib.rs` in `commands`, `repositories` oder
   `metrics`.
5. Prüfe die betroffenen Migrationen und TypeScript-Datenverträge.
6. Lies nur die für die Aufgabe relevanten Detaildokumente unter `docs/`.

### Implementierung

1. Formuliere die fachliche Invariante vor der Codeänderung.
2. Ändere die kleinste sinnvolle Schicht, ohne Logik in UI und Backend doppelt
   auseinanderlaufen zu lassen.
3. Ergänze Tests zusammen mit der Änderung.
4. Behalte Browser-Fallback und Tauri-Modus bewusst im Blick.
5. Bei persistenten Änderungen neue Migration statt manueller DB-Anpassung.
6. Bei Mutationen Cache-Invalidierung und Empty/Error/Loading States ergänzen.
7. Dokumentiere neue Umgebungsvariablen leer in `.env.example`.

### Abschluss

1. Formatiere geänderte Dateien.
2. Führe risikoadäquate Frontend- und Rust-Checks aus.
3. Starte bei nativen Änderungen die echte Desktop-App.
4. Prüfe Logs auf neue Warnungen.
5. Prüfe `git diff` auf Secrets, generierte Dateien und unbeabsichtigte Änderungen.
6. Berichte konkret: geänderte Funktion, Tests, bekannte Einschränkungen und
   Startweg.

## 22. Definition of Done

Eine Aufgabe ist erst fertig, wenn:

- die Benutzeranforderung fachlich vollständig umgesetzt ist,
- bestehende Daten und Migrationen sicher bleiben,
- Tauri- und Browserverhalten bewusst behandelt wurden,
- keine Mockdaten als Live-Daten ausgegeben werden,
- fehlende Werte nicht als neutral umgedeutet werden,
- Scoring-/Metrikänderungen durch deterministische Tests geschützt sind,
- UI Loading, Empty, Error und Success nachvollziehbar darstellt,
- Query Caches nach Mutationen korrekt aktualisieren,
- relevante TypeScript-, Vitest-, Rust- und Build-Prüfungen bestehen,
- die reale App bei nativen Änderungen ohne neue Initialisierungswarnung startet,
- keine Secrets oder persönlichen Daten im Diff stehen,
- Dokumentation und `.env.example` bei neuen Verträgen aktualisiert sind.

## 23. Bekannte technische Hinweise

- Der Frontend-Produktionsbuild meldet derzeit große Chunks für ECharts,
  Dokumentexporte und XLSX. Das ist eine Optimierungsmöglichkeit, aber kein
  Funktionsfehler. Neue große Imports bevorzugt lazy laden.
- Browser- und Rust-Metrikimplementierungen sind bewusst parallel vorhanden.
  Diese Duplizierung ist ein Drift-Risiko und muss durch gemeinsame Testvektoren
  kontrolliert werden.
- Provider-Title-Mapping ist regelbasiert. Neue länderspezifische Bezeichnungen
  brauchen explizite Klassifikation und Tests.
- Forecasts sind nicht flächendeckend über offizielle Primärquellen verfügbar.
  Drittanbieter sind erlaubt, Herkunft und Aktualität müssen aber sichtbar
  bleiben.
- Der aktuelle Scheduler lebt im Desktop-Prozess. Er arbeitet nur, wenn die App
  läuft; es existiert kein externer Cloud-Cronjob. Das gilt auch für den
  release-nahen Macro Feed und seinen Nachhol-Lauf beim nächsten App-Start.

Wenn eine Anforderung eine dieser fachlichen Invarianten verändern würde, stoppe
nicht automatisch die Arbeit, aber benenne die Auswirkung ausdrücklich und hole
bei einer materiellen Produktentscheidung die Entscheidung des Benutzers ein.
