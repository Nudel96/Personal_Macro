# Relevante Feature-Map

Referenzstand: Quellcommit `520216be8810f7754387b9aba0ccf47a24f5e4e8`.

Bewertung:

- **hoch**: fachliches Konzept oder Pure Function nach Tests gut übertragbar.
- **mittel**: als Referenz brauchbar, aber Datenmodell oder Methodik muss deutlich geändert werden.
- **niedrig**: nur UX-/Mapping-Idee übernehmen.
- **neu**: fehlt oder ist fachlich nicht belastbar.

## COT

| Quelldatei | Funktion/Klasse | Zweck | Eingaben → Ausgaben | Datenquelle/Abhängigkeiten | Wiederverwendbarkeit und Anpassung |
|---|---|---|---|---|---|
| `src/app/datentool/cot/lib/types.ts` | `CFTC_DATASETS`, `COT_GROUPS`, Assetlisten | Berichtsfamilien, Gruppen und CFTC-Dataset-IDs | Family/Scope → Dataset/Gruppe | CFTC PRE | **hoch**; IDs gegen Metadaten prüfen, Source-Version und Contract-Mapping aus DB laden |
| `src/app/datentool/cot/lib/cftc-api.ts` | `fetchCotData` | Socrata-Query, Normalisierung, Sortierung | Family, Scope, Contract, Limit → `CotWeeklyRecord[]` | CFTC JSON API, Next fetch cache | **mittel**; Adapter neu schreiben, Raw Payload persistieren, Pagination, Retries, Schema-Drift und Datenchecks ergänzen |
| gleiche Datei | `normalizeLegacy` | Legacy-Gruppen, Net und Changes | CFTC Legacy Row → normalisierte Gruppen | Raw CFTC-Felder | **hoch** nach Fixture-Tests; fehlend ≠ 0 behandeln |
| gleiche Datei | `normalizeDisagg` | Disaggregated-Gruppen | CFTC Row → Producer, Swap, Managed Money usw. | Raw CFTC-Felder | **hoch** nach Fixture-Tests; Spreading-Changes und offizielle Prozentfelder vollständig abbilden |
| gleiche Datei | `normalizeTff` | TFF-Gruppen | CFTC Row → Dealer, Asset Manager, Leveraged Funds usw. | Raw CFTC-Felder | **hoch** nach Fixture-Tests |
| `src/app/datentool/cot/lib/analytics.ts` | `enrichRecords` | Rolling Z-Score, Regime, Crowding, IQR-Ausreißer | Records, Primary Group, Jahre → Derived Metrics | Normalisierte Records | **mittel**; Z-Score retten, Crowding/Regime versionieren und kalibrieren, fehlende Gruppen nicht als 0 werten |
| gleiche Datei | `computeNetPctOiPercentile` | Historischer Perzentilrang | Records, Gruppe → 0–100 | Normalisierte Records | **hoch** nach Definition von Ties und Fenster |
| gleiche Datei | `generateAssetSentimentText` | Erklärtext | letzter Record/Perzentil → Text | Derived Metrics | **niedrig**; nur aus strukturierten Reason Codes erzeugen |
| `src/app/api/cot/route.ts` | `GET` | Auth, Queryvalidierung, Fetch/Enrichment | HTTP Query → Records/Status | Auth/Abo, CFTC | **niedrig**; Auth entfernen, Service/API trennen, echte Freshness/Publish Date liefern |
| `scripts/update-cot-cache.mjs` | `updateCotCache` | FX-Kurzcache und Long-Anteile | CFTC Legacy → JSON | CFTC, Dateisystem | **niedrig**; duplizierte Logik entfernen, DB-Upsert und Job-Run-Protokoll neu bauen |
| `src/app/datentool/cot/components/*` | Charts/Screener/Drawer | COT-Visualisierung | API-Records → Tabellen/Charts | Recharts | **mittel**; visuelle Muster übernehmen, numerische Belege/Freshness ergänzen |

## Seasonality

| Quelldatei | Funktion/Klasse | Zweck | Eingaben → Ausgaben | Datenquelle/Abhängigkeiten | Wiederverwendbarkeit und Anpassung |
|---|---|---|---|---|---|
| `src/app/datentool/seasonality/lib/instruments.ts` | Assetkatalog | 42 Assets und Provider-Mapping | Symbol → Metadaten | Alpha Vantage/FRED | **mittel**; als Seed nutzen, Source-Mapping in Datenbank, weitere Assetklassen und lokale CSVs |
| `.../lib/data-fetcher.ts` | `fetchFRED` | Historische Beobachtungen | Series ID/Key → Price Bars | FRED | **mittel**; Metadaten, Vintage/Revisionsinfos und Lizenzhinweis speichern |
| gleiche Datei | `fetchAVFX`, `fetchAVCommodity`, `fetchAVCrypto` | Preisreihen | Providerparameter → Price Bars | Alpha Vantage | **niedrig**; optionaler Adapter, da Limits/Full History teilweise tarifabhängig |
| gleiche Datei | `fetchSyntheticCross` | FX-Cross aus USD-Legs | zwei Leg-Zeitreihen → Cross | Alpha Vantage | **mittel**; Formel korrekt, aber Kalender-/Timestamp-/Quality-Provenance ergänzen |
| gleiche Datei | In-Memory-/Negative Cache | Laufzeitentlastung | Key → Bars/Fehler | Node-Prozess | **niedrig**; persistenter Source-aware Cache und Retry-Policy neu |
| `.../lib/analytics.ts` | `computeForwardReturns` | Forward Arithmetic Return | Bars, Handelstagshorizont → Samples | Price Bars | **mittel**; Pure Function brauchbar, aber Overlap explizit und unabhängige Jahresfenster nötig |
| gleiche Datei | `computeBucketStats` | Mean, Median, Std, Hit Rate, Payoff, CI | Samples → `BucketStat` | interne Statistik | **hoch** nach Empty/NaN/CI-Tests; t-Intervall/Bootstrap statt starrem Normalintervall erwägen |
| gleiche Datei | `computeAllBuckets` | Gruppierung nach Monat, ISO-Woche, DOW, DOM | Bars/Lookback/Horizon → Buckets | Kalenderhelper | **mittel**; Stichprobendesign, ISO-Woche 53, UTC/Exchange Calendar korrigieren |
| gleiche Datei | `computeLineChartSeries` | Jahreskurven und Durchschnitt | Bars/Lookback → Kurven | Price Bars | **niedrig**; auf normierte Kalendertags-/Sessionsachse und vollständige Jahre umstellen |
| gleiche Datei | `computePeriodStats` | Return je frei gewähltem saisonalem Fenster | Bars/Range → Jahresreturns/KPIs | Price Bars | **mittel**; Compounding, Wrap-around, echte Kalendertage und Std/CI ergänzen |
| `src/app/api/seasonality/route.ts` | `GET` | vier Analysemodi | Query → Statistik | Auth, Fetcher, Analytics | **niedrig**; dünne API über neuen Domain-Service |
| `src/app/datentool/seasonality/components/*` | Charts, Screener, Drilldown | interaktive Darstellung | Statistik → UI | Recharts | **mittel**; Median, Current Year, Konfidenz, Quality und Export ausbauen |

## Economic Calendar, Macro und Heatmap

| Quelldatei | Funktion/Klasse | Zweck | Eingaben → Ausgaben | Datenquelle/Abhängigkeiten | Wiederverwendbarkeit und Anpassung |
|---|---|---|---|---|---|
| `data/economic-calendar/event-mapping.json` | Aliasregeln | Rohname auf kanonischen Indikator | Eventname → Indicator | manuell gepflegt | **mittel**; Regeln als versionierte DB-Konfiguration mit landesspezifischen Varianten |
| `data/economic-calendar/datapoints.json` | Währungs-/Indikatorvorlage | gewünschte Heatmap-Zeilen | Currency → Indicators | statische JSON | **mittel**; Seed für Indicator Registry, Einheiten/Frequenz/Direction/Source ergänzen |
| `scripts/scrape-economic-calendar.mjs` | `extractEventsFromPage` | Kalender-DOM lesen | HTML → Raw Events | ForexFactory/Playwright | **niedrig**; nur optionaler Fallback nach Terms-Prüfung |
| gleiche Datei | `parseValue` | K/M/B/%-Parser | String → Number | keine | **mittel**; Einheit darf nicht verworfen werden, Locale/Revision/Range validieren |
| gleiche Datei | `determineCurrencyImpact` | Surprise-Richtung | Indikator, Surprise → Label | drei statische Listen | **niedrig**; versionierte, konfigurierbare Score Engine neu |
| gleiche Datei | `buildHeatmap` | neuester Eintrag je Währung+Indikator | Scrape-Historie → Heatmap | JSON Cache | **niedrig**; Event-/Observation-/Revisionstabellen und deterministische Deduplizierung neu |
| `scripts/plan-scrape-schedule.mjs` | Wochenplanung | Events in Timeslots | Kalenderseite → JSON | ForexFactory | **niedrig**; offizielle Kalenderadapter und stabile Event-IDs neu |
| `src/app/api/economic-calendar/route.ts` | `GET`, `enrichCurrency` | Heatmap laden, Skeletons, COT/Seasonality/Retail | JSON + Live Calls → API | Dateien, CFTC, AV/FRED | **niedrig**; orchestrierten Read Model Service neu bauen |
| `scripts/update-retail-sentiment.mjs` | `updateRetailSentiment` | zufällige „live-looking“ Werte | Cache + Zufall → JSON | keine echte Quelle | **nicht übernehmen**; Dateien und Anzeige vollständig ausschließen |
| `src/app/datentool/economic/components/*` | Score Cards, Tabs, Indicator Table, Bias Grid | Heatmap-UI | API → Visualisierung | React | **mittel**; numerische Scores, Gründe, Quelle, Freshness und Coverage ergänzen |

## Tradingjournal

| Quelldatei | Funktion/Klasse | Zweck | Eingaben → Ausgaben | Datenquelle/Abhängigkeiten | Wiederverwendbarkeit und Anpassung |
|---|---|---|---|---|---|
| `src/app/academy/journal/types.ts` | `Trade`, `TradingAccount` | Kernmodell | Eingaben → browserseitiges Modell | keine | **mittel**; deutlich erweitern und CamelCase/UI vom Persistenzmodell trennen |
| gleiche Datei | Ritual-/Bias-Typen | Psychologie/Prozess | Formulare → Ritualtage | localStorage | **hoch** als fachliche Vorlage; pro Trade und Tag verknüpfen, DB-persistieren |
| `.../utils/calculations.ts` | `calculateMetrics` | Win Rate, PF, Expectancy, R, Streak, Drawdown | Trades → KPIs | Pure TS | **hoch** nach Definitionen/Tests; Fees/Risk/Account Equity berücksichtigen |
| gleiche Datei | `calculateAdvancedMetrics` | Sharpe, Sortino, Calmar, Kelly usw. | PnL-Serie → KPIs | Pure TS | **niedrig bis mittel**; auf Returns und Zeitbasis neu definieren |
| gleiche Datei | Gruppierungsfunktionen | Asset/Setup/Session/Emotion/Tag/Tagzeit | Trades → Gruppenperformance | Pure TS | **hoch** nach Zeitzonen- und Missing-Tests |
| `.../utils/importParsers.ts` | `parseFile` und Brokerparser | CSV/XLSX/HTML Import | Brokerexport → Trades/Errors | DOMParser, XLSX | **hoch** als Parser-Referenz; Raw Import, Mapping-Version und Idempotency ergänzen |
| gleiche Datei | `findDuplicates` | Duplikaterkennung | bestehend + importiert → IDs | heuristische ID | **mittel**; Broker Trade ID und Fingerprint mit Konfliktbericht |
| `.../data/lotSizeConfig.ts` | `calculateLotSize`, `calculateTradePnL` | Risiko-/Pip-Berechnung | Instrument/Preise/Risiko → Größe/PnL | statische Instrumentkonfig | **mittel**; Contract Specs versionieren, Quote Currency Conversion ergänzen |
| `.../utils/storage.ts` | Local CRUD/CSV Export | Browserpersistenz und Export | Trades/Accounts → localStorage/CSV | Browser | **niedrig**; DB-first, Backups, Attachment Store und Export-Service neu |
| `.../hooks/useJournalSync.ts` | Merge/Sync | lokale und Serverdaten synchronisieren | localStorage + API → State | Next API/Postgres | **niedrig**; Single-User braucht keine Dual-Master-Synchronisation |
| `src/lib/db-schema.ts` | `ensureJournalTables` | Accounts-/Trades-DDL | Startup → Tabellen | PostgreSQL/users | **mittel** als Feldreferenz; FK zu User entfernen, Migrationen statt Runtime-DDL |
| `src/app/academy/journal/components/*` | Forms, Calendar, Insights, Rituals | vollständige Journal-UX | State → UI | React/Recharts | **mittel bis hoch** als UX-Referenz |

## Fehlende Pflichtfunktionen

Neu zu entwickeln sind insbesondere:

- revisionssichere Macro-Observations, Veröffentlichungs- und Abrufzeitpunkte, Einheiten, Frequenzen und Provenance;
- offizieller Multi-Source-Event-Scanner mit stabiler ID, UTC/IANA-Zeitzone, Verschiebungs- und Deduplizierungslogik;
- konfigurierbares, versioniertes Macro-Scoring mit Gruppen, Coverage, Quality Gate und Reason Codes;
- Currency Ranking und zentrales Dashboard über persistierte Snapshots;
- unabhängige, reproduzierbare Seasonality-Stichproben, aktuelle-Jahr-Vergleich, Assetvergleich, Export und Datenqualitätsgrenzen;
- COT-Historie in lokaler DB, Publish Date, Quellenzeile, vollständige Änderungen/Perzentile und Rankings;
- erweiterte Journalfelder, mehrere Anhänge, Fees, Risiko, Thesis, Regeln/Fehler, Macro-/COT-/Seasonality-Snapshotlinks;
- automatisierte Unit-, Property-, Integration-, Contract- und UI-Tests.
