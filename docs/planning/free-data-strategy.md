# Strategie für einen dauerhaft kostenlosen Betrieb

## Zielbild

Der Kernbetrieb benötigt weder Kreditkarte noch bezahlte API. Kostenlose Keys sind optional und lokal. Jede Funktion degradiert kontrolliert: letzte gute Daten bleiben mit Stale-Warnung sichtbar; fehlende Inputs erzeugen keinen erfundenen Ersatz.

## Source Tiers

### Tier 1 – offizielle, keylose Quellen

- CFTC Public Reporting Environment und Historical ZIPs
- Eurostat/ECB SDMX
- Bank of Canada Valet
- Statistics Canada WDS
- ABS Data API
- BoE CSV/IADB, RBNZ XLSX, SNB API/Downloads
- offizielle Releasekalender/ICS/RSS

### Tier 2 – offizielle Quellen mit kostenlosem Key

- FRED/ALFRED
- BLS v2 (v1 keyless möglich)
- BEA
- EIA
- Stats NZ API Portal
- e-Stat Japan

Keys werden in `.env`/OS-Keychain gespeichert und sind nie Voraussetzung für das Starten der App. UI zeigt, welche Abdeckung ohne jeweiligen Key fehlt.

### Tier 3 – lokale Imports

- universelle Preis-CSV/XLSX/Parquet;
- Brokerexports;
- manuelle Forecast-/Consensus-Datei;
- manuelle Events/Notizen.

Lokale Imports sind der garantierte Fallback für Assetklassen ohne freie stabile Historie.

### Tier 4 – optionale Drittanbieter

Ein Forecast-/Calendar-/Market-Data-Provider darf als Plugin-Adapter existieren,
wenn Terms, Lizenz, Kostenmodell, Limits, Quellenattribution und
Raw-Payload-Retention dokumentiert sind. Ein Free Tier ist willkommen, aber
keine fachliche Voraussetzung; der Core darf nie von einem konkreten Provider
abhängen. Scraping ist standardmäßig deaktiviert.

## Abdeckung nach Modul

| Modul | Kostenfreier Kern | Optional/Fallback |
|---|---|---|
| COT | CFTC API + annual ZIP | lokaler CFTC-Import |
| Macro | nationale Statistikämter/Zentralbanken | FRED als Aggregator; lokaler Import |
| Events | offizielle Calendars/ICS/RSS | manueller Eventimport; gekennzeichneter Scraper |
| Forecast | manueller, versionierter Import | optionaler lizenzierter Drittanbieter-Adapter |
| Seasonality FX | offizielle Referenzkurse/Crosses | lokaler Broker-/Providerexport |
| Seasonality Energie/Rates | EIA/FRED/Zentralbanken | lokaler Export |
| Seasonality Fiat-Futures/Edelmetalle | lokaler, lizenzierter Preisexport | dokumentierter Provideradapter |
| Seasonality Krypto | lokaler CSV-Import; öffentliche Exchange-Candles | zweiter Exchangeadapter |
| Journal | vollständig lokal | keine externe Quelle nötig |

## Betriebsmodell

- SQLite und lokale Dateien: keine laufenden Hostingkosten.
- Windows Task Scheduler/cron/APScheduler: keine Schedulerkosten.
- GitHub Actions nur für CI; optionale Datenjobs nur für ausdrücklich öffentliche, lizenzkonforme Daten und nie für Journal/Anhänge.
- Requests werden inkrementell und gecacht; keine unnötigen Full Backfills.
- Bulkdownloads für Backfill, APIs für Delta/Latest.

## Resilienz

1. Source Adapter besitzt Primary/Fallback/Manual.
2. Circuit Breaker nach wiederholten Fehlern; exponentieller Backoff mit Jitter.
3. Raw Payload wird vor Normalisierung gespeichert.
4. Schema Drift quarantiniert Payload statt alte gute Daten zu überschreiben.
5. Dashboard zeigt `fresh`, `stale`, `partial`, `failed`, `unavailable`.
6. Keine Quelle verfügbar → Modul bleibt lesbar, aber Score/Ranking wird unterdrückt.

## Revisionen

- FRED/ALFRED: Vintages/Initial Release, soweit verfügbar.
- Eurostat: da nur aktuelle Version angeboten wird, jeder regelmäßige Pull erzeugt bei Wertänderung eine lokale Revision.
- StatsCan WDS: issueDate/Changed Series nutzen.
- nationale Quellen: Release Timestamp + Payload Hash; geänderte Werte als neue Revision.
- Previous und Revised Previous werden getrennt gespeichert.

## Lizenz- und Terms-Kontrolle

- `data_source` speichert Terms URL, Lizenz, Attribution und Reviewdatum.
- Vor Aktivierung eines Adapters wird eine Source Card in der Dokumentation freigegeben.
- Raw Retention folgt Source Terms; wenn Weitergabe eingeschränkt ist, bleibt Payload lokal/ignoriert.
- Exporte enthalten Source Attribution und Access Date.
- Automatisierter Quartalscheck erinnert an Terms-/Endpoint-Review; keine automatische Rechtsbehauptung.

## Forecast-Handhabung in Scoring v1

Der permanente kostenfreie Betrieb bleibt möglich, weil Forecasts manuell
importiert werden können. Für den fachlichen Macro-Score v1 gilt jedoch strikt:
Nur ein valides Actual/Forecast-Paar erzeugt bullish, bearish oder neutral. Ein
fehlender Forecast erzeugt `unavailable`, nicht Trend-, Momentum- oder
Target-Ersatz. Previous und Revised Previous bleiben für die Erklärung und
Revision sichtbar, aber nicht Teil der Punktzahl.

## Schlüsselmanagement

- `.env.example` enthält nur Namen und Beschreibungen.
- `.env` ist ignoriert.
- Logs maskieren Queryparameter/Headers mit Keys.
- Source Health zeigt „configured/not configured“, nie den Wert.
- Vor Commit laufen Secret Scanner und ein Pattern Scan für typische Tokenformate.

## Minimaler kostenfreier Startumfang

1. USD/EUR: BLS, BEA, FRED, Eurostat, ECB + offizielle Kalender.
2. Danach GBP/JPY/CHF/CAD/AUD/NZD über die jeweilige Quellenmatrix.
3. COT: CFTC für aktivierte Fiat-Futures und Gold, Silber, Platin, Palladium.
4. Seasonality: G10-FX-Referenzkurse sowie lokale/zugelassene Preisimporte für
   Fiat-Futures, Edelmetalle und das konfigurierte Krypto-Set.
5. Journal: vollständig lokal.

Damit entsteht früh ein ehrlicher, belastbarer Kern statt einer optisch vollständigen Heatmap mit unzuverlässigen Füllwerten.
