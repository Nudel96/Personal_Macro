# Datenquellen-Audit

Stand: 17. Juli 2026. Aussagen zu APIs, Limits und Lizenzen müssen vor der produktiven Aktivierung erneut automatisiert/vertraglich geprüft werden.

## Grundsätze

1. Offizielle Primärquelle vor Aggregator.
2. Raw Responses unverändert und mit Abrufzeitpunkt/Hash speichern.
3. Fehlende Werte bleiben fehlend; keine stillen Schätzungen.
4. Revisionen als neue Version speichern, nie historisch überschreiben.
5. Forecast/Consensus getrennt von Actual/Official Source behandeln.
6. Jeder Adapter besitzt Rate-Limit, Retry, Timeout, Schema-Contract, Lizenznotiz und Fallback.

## Quellen im Quell-Repository

| Quelle | Verwendung | Kosten/Auth | Audit | Empfehlung |
|---|---|---|---|---|
| CFTC Public Reporting Environment | Legacy, Disaggregated, TFF; Futures-only/combined | kostenlos, laut CFTC derzeit ohne Token bei angemessener Nutzung | beste vorhandene Pipeline; keine Raw-Historie/Publish Date/Pagination | **Primärquelle COT** |
| FRED API | WTI, Brent, Gas und Fallback-Preisreihen | kostenloser Key; API-Terms und 429-Limits | brauchbar, aber Metadaten/Vintages werden ignoriert | **Aggregator/Fallback**, für Revisionen ALFRED-Funktionen nutzen |
| Alpha Vantage | FX, Krypto, Rohstoffe | kostenloser Key mit engen Limits; einige Full-History-Endpunkte/Entitlements tarifabhängig | Quellcode ist gleichzeitig auf Free- und Pro-Annahmen getrimmt; nicht garantiert kostenlos skalierbar | **Optionaler Adapter**, nicht zwingende Grundlage |
| ForexFactory | Kalender, Actual, Forecast, Previous | Website/Exporte, kein freigegebener Produkt-API-Vertrag | Terms untersagen Kopie/Weitergabe der Kalenderdaten und nicht vorgesehene Zugriffsmethoden | nicht automatisiert ingestieren; nur manuell ansehen, durch offizielle Quellen + lizenzierte Adapter ersetzen |
| statische manuelle Heatmapdaten | Seed/Fallback | keine | nicht reproduzierbar, teils uneinheitliche Herkunft | nicht als Live-Daten übernehmen |
| „Retail Sentiment“ | COT Nonreportables + zufällig simulierte Tageswerte | keine echte Quelle | simulierte Werte sind unzulässig | vollständig entfernen |

## Empfohlene offizielle Quellenmatrix

### Übergreifend

| Quelle | Daten | Abruf/Frequenz/Historie | Auth/Limit | Lizenz/Stabilität | Fallback/Revisionsstrategie |
|---|---|---|---|---|---|
| [CFTC COT](https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm) | COT Legacy ab 1986; Disaggregated/TFF ab 2006; Dienstag-Positionen, wöchentlich veröffentlicht | Socrata JSON/CSV und jährliche ZIPs | derzeit tokenlos bei angemessener Nutzung; kein garantiertes fixes Limit | offizielle US-Quelle, sehr stabil | API primär, jährliche Historical Compressed ZIPs als Backfill/Fallback; Source Row Hash und CFTC-Hinweise speichern |
| [FRED/ALFRED API](https://fred.stlouisfed.org/docs/api/fred/series_observations.html) | viele US-/globale Macroserien, Rates, FX/Commodity-Referenzserien; Vintages | REST JSON/XML/XLSX/CSV; quellenabhängige Frequenz | kostenloser registrierter Key; 429 bei Limit, kein dauerhaft zugesichertes Volumen | stabiler Aggregator; Attribution/Terms beachten | Originalagentur ist Primärquelle; ALFRED `vintage_dates`/`output_type` für Revisionen; Cache und Backoff |
| lokale CSV/XLSX/Parquet-Imports | Broker-, Preis- und eigene Forecastdaten | manuell | keine | vollständig kontrollierbar | verpflichtender universeller Fallback, Importprotokoll + Hash |

### USA / USD

| Quelle | Abdeckung | Zugang | Limits/Lizenz | Empfehlung |
|---|---|---|---|---|
| [BLS Public Data API](https://www.bls.gov/developers/) | CPI, PPI, Payrolls, Unemployment, Earnings, Participation, JOLTS u. a. | v1 ohne Registrierung; v2 kostenlos registriert, JSON/XLSX | registrierte Stufe hat höhere Serien-/Jahres-/Tagesgrenzen; exakte aktuelle Limits aus API-FAQ lesen | Primär für Arbeitsmarkt/Inflation; Releasekalender separat importieren |
| [BEA API](https://apps.bea.gov/api/_pdf/bea_web_service_api_user_guide.pdf) | GDP, PCE, Personal Income, Trade/International Accounts | kostenloser User ID/API Key | offizieller Guide nennt Account- und Requestlimits; Responses cachen | Primär für GDP/PCE; News Release und Revisionen versionieren |
| Federal Reserve/FRED | Policy Rate, Yields, Curve, Financial Conditions, Expectations | FRED/Board Downloads | kostenlos | Primärquelle je Serie festlegen; FRED als einheitlicher Adapter möglich |
| Census / US Census APIs | Retail Sales, Durable Goods, Trade, Housing | REST/CSV, häufig ohne Key bis Schwelle | datasetabhängig | Primär für Census-Serien; Dataset-Metadaten pinnen |
| EIA Open Data | Öl/Gas/Inventories/Energiepreise | API v2, kostenloser Key | rate-limited | Primär für Energie-Macro; FRED als Fallback |

### Eurozone / EUR

| Quelle | Abdeckung | Zugang | Limits/Lizenz | Empfehlung |
|---|---|---|---|---|
| [Eurostat APIs](https://ec.europa.eu/eurostat/data/web-services) | HICP, Unemployment, GDP, Production, Retail, Trade, Confidence u. a. | SDMX 2.1/3.0, JSON-stat, CSV/TSV, ohne Key | kleine gefilterte Queries; große Datensätze asynchron; Daten werden zweimal täglich aktualisiert | Primär für Eurozone-Macro; da API nur neueste Version hält, eigene Revisionstabelle zwingend |
| [Eurostat Reuse](https://ec.europa.eu/eurostat/help/copyright-notice) | Lizenz | – | Reuse mit Quellenangabe, Ausnahmen für Drittmaterial beachten | Source/Access Date speichern |
| [ECB Data API](https://data.ecb.europa.eu/help/getting-data-web-services-sdmx) | Rates, Yields, FX, Monetary/Financial Statistics, Expectations | SDMX 2.1 REST, ohne Key | keine garantierte feste Quote dokumentiert; gefiltert/cached abrufen | Primär für ECB-/Zinsdaten; statistischen Kalender separat abonnieren |

### Vereinigtes Königreich / GBP

| Quelle | Abdeckung | Zugang | Limits/Lizenz | Empfehlung |
|---|---|---|---|---|
| ONS API/Downloads | CPI, Labour, GDP, Retail, Production, Trade | API und CSV/XLSX-Downloads | kostenlos; API-Schema/Verfügbarkeit pro Dataset prüfen | Primär für UK-Macro; Release Calendar/ICS und Revision Triangle speichern |
| [Bank of England IADB](https://www.bankofengland.co.uk/boeapps/database/Help.asp?Highlight=Hierarchy&Travel=) | Bank Rate, Yields, FX, monetary/financial series | automatisierbarer CSV-Download nach Series Code | kostenlos; angemessen cachen | Primär für Zins-/BoE-Daten |

### Japan / JPY

| Quelle | Abdeckung | Zugang | Limits/Lizenz | Empfehlung |
|---|---|---|---|---|
| Statistics Bureau Japan / e-Stat | CPI, Labour, Household, GDP-nahe Statistiken | e-Stat API/CSV; kostenloser App-ID-Flow | API-Key/Registration je Dienst | Primär für nationale Macroserien |
| [BoJ Time-Series API](https://www.stat-search.boj.or.jp/info/api_manual_en.pdf) | Policy/Market Rates, Money, Tankan, CGPI, BOP-nahe Daten | offizielle Time-Series API/CSV | kostenlos; API-Manual beachten | Primär für BoJ-Daten |
| [BoJ Release Schedule](https://www.boj.or.jp/en/about/calendar/index.htm) | geplante Veröffentlichungen und MPMs | HTML/XLSX, wöchentlich aktualisiert | kostenlos | Event-Scanner-Primärquelle; Terminänderungen versionieren |

### Schweiz / CHF

| Quelle | Abdeckung | Zugang | Limits/Lizenz | Empfehlung |
|---|---|---|---|---|
| Swiss Federal Statistical Office PXWeb/API | CPI, Labour, GDP, Production, Trade | PXWeb/CSV | kostenlos | Primär für nationale Macroserien |
| [SNB Data Portal](https://data.snb.ch/en) | Rates, Yields, FX, monetary/financial und ausgewählte Macroserien | Download/API-Link aus jeder Tabelle | kostenlos; nichtkommerzielle Nutzung mit Quellenhinweis laut Portal, Detailbedingungen prüfen | Primär für SNB/Zinsen; API-Links als Konfiguration speichern |
| [SNB Calendar Feeds](https://www.snb.ch/en/services-events/digital-services/rss-calendar-feeds) | Geldpolitik/Veröffentlichungen | iCalendar/RSS | kostenlos | Event-Scanner-Primärquelle |

### Kanada / CAD

| Quelle | Abdeckung | Zugang | Limits/Lizenz | Empfehlung |
|---|---|---|---|---|
| [Statistics Canada WDS](https://www.statcan.gc.ca/en/developers/wds/user-guide) | CPI, Labour, GDP, Retail, Trade, Housing u. a. | REST JSON, Full Table CSV/SDMX und Delta Files | 50 Requests/s serverweit, 25 Requests/s pro IP; täglich verfügbare Updates | Primär; Vectors/PIDs pinnen, 409 während Updates behandeln, issueDate speichern |
| [Bank of Canada Valet](https://www.bankofcanada.ca/valet-api-how-to/) | Rates, FX, Yields und weitere Finanzserien | JSON/CSV/XML, kein Key, kostenlos | akzeptable Nutzung, cachen | Primär für BoC-/Zinsdaten |

### Australien / AUD

| Quelle | Abdeckung | Zugang | Limits/Lizenz | Empfehlung |
|---|---|---|---|---|
| [ABS Data API](https://www.abs.gov.au/statistics/application-programming-interfaces-apis/data-api-user-guide) | CPI, Labour, GDP, Retail, Trade, Housing u. a. | SDMX 2.1 REST, JSON/XML/CSV, seit Nov. 2024 ohne Key | Beta: Verfügbarkeit/Schema kann sich ändern; kein SLA | Primär mit Contract Tests; offizielle XLSX/CSV als Fallback |
| RBA Statistical Tables/Calendar | Cash Rate, Yields, FX, Credit, Forecasts, Meetings | XLSX/CSV/HTML | kostenlos | Primär für RBA-/Zinsdaten; Release-/Meetingkalender ingestieren |

### Neuseeland / NZD

| Quelle | Abdeckung | Zugang | Limits/Lizenz | Empfehlung |
|---|---|---|---|---|
| [Stats NZ API Portal](https://portal.apis.stats.govt.nz/) | CPI, Labour, GDP, Retail/Trade u. a. | registrierter kostenloser API-Key | Terms: CC BY 4.0, Key sicher speichern; Quoten im Portalvertrag prüfen | Primär für nationale Macroserien; Infoshare Downloads als Fallback |
| [RBNZ Data File Index](https://www.rbnz.govt.nz/statistics/series/data-file-index-page) | Rates, FX, Inflation Expectations, Housing/Employment, Bankdaten | stabile XLSX-Dateilinks | kostenlos, Terms für automatisierten Abruf beachten | Primär für RBNZ-/Zinsdaten; Dateihash/Sheet-Schema prüfen |

## Preisreihen für Seasonality

| Assetklasse | Primär | Fallback | Einschränkung |
|---|---|---|---|
| G8 FX | ECB/BoC/RBNZ/BoE/SNB/FRED Referenzkurse; Crosses aus USD/EUR-Legs | lokaler CSV-Import; optional Alpha Vantage | Fixing-/Referenzkurse sind keine Broker-Closes; Quelle und Cutoff-Zeit anzeigen |
| Öl/Gas/Energie | EIA/FRED offizielle Spot-/Benchmarkserien | lokaler CSV; optional Alpha Vantage | Spot ist nicht Futures-Continuous; keine Vermischung |
| Bonds/Yields | Zentralbank-/Treasury-Serien | FRED | Rendite statt handelbarem Total-Return-Index klar kennzeichnen |
| Aktien/Indizes/Futures | lokaler, vom Nutzer lizenzierter Export | optionaler kostenloser Provider nach Terms-Prüfung | dauerhaft kostenlose offizielle 20-Jahres-OHLC-Daten sind nicht flächendeckend verfügbar |
| Fiat-Futures/Edelmetalle | lokaler lizenzierter Preisexport | dokumentierter Provideradapter | Kontraktspezifikation, Roll- und Continuous-Future-Policy strikt speichern |
| Krypto | lokaler CSV-Import; optional öffentliche Exchange-Candles | zweiter Exchangeadapter | Exchange-, Paar-, Zeitzonen- und Survivorship-Unterschiede |

Die Quell-Alpha-Vantage-Integration darf optional bleiben, aber nicht Voraussetzung sein. Die [offizielle Dokumentation](https://www.alphavantage.co/documentation/) zeigt, dass Entitlements und Full-History-Verfügbarkeit endpointabhängig sind; der Zielbetrieb muss ohne bezahlten Tarif funktionieren.

## Event-Scanner-Strategie

### Offizielle Primärquellen

- Statistikämter: Release Calendar, ICS, RSS oder maschinenlesbare Veröffentlichungstabellen.
- Zentralbanken: Meetingkalender, statistische Kalender, ICS/RSS.
- FRED Release Calendar kann als Discovery/Fallback dienen, deckt aber laut API-Dokumentation zukünftige Release Dates nicht vollständig über `release/dates` ab.

### Forecast-Problem und beschlossene Lösung

Offizielle Stellen veröffentlichen in der Regel Actual, Previous/Revised und
Release Schedule, aber keinen Markt-Konsens. Ein kostenloser, global
konsistenter Consensus-Feed mit verlässlicher Lizenz wurde nicht gefunden.
Deshalb gilt:

1. Forecast kann manuell importiert oder über einen optionalen, separat
   lizenzierten Drittanbieter-Adapter ergänzt werden.
2. Ein Macro-Signal wird nur aus einem validen Actual/Forecast-Paar gebildet.
   Fehlt der Forecast, ist der Score `unavailable`, nicht `neutral`.
3. Previous/Revised Previous werden gespeichert und angezeigt, aber in
   Scoring v1 nicht als Ersatz für einen Forecast verwendet.
4. Drittseiten-Scraping darf nie still als offizielle Quelle erscheinen und
   ist standardmäßig deaktiviert.

## Datenqualitätsregeln pro Abruf

- HTTP-/Parserstatus, Dauer, Retrycount und Payload Hash speichern.
- Schema-Fingerprint und Contract-Test.
- Observation Count, erwartete Frequenz, Gap-/Duplicate-Checks.
- Unit/Frequency/Seasonal Adjustment/Reference Period validieren.
- Latest release vs. erwarteter Kalendertermin; Freshness SLA pro Indikator.
- Revision gegenüber letzter gespeicherter Version erkennen.
- Fehlgeschlagene Abrufe lassen letzte gute Version bestehen, markieren sie aber als stale.
- Kein Score bei failed/stale/insufficient Coverage.

## Empfohlene Reihenfolge der Adapter

1. CFTC, FRED/ALFRED, BLS, BEA, Eurostat, ECB.
2. BoE/ONS, StatsCan/BoC, ABS/RBA, Stats NZ/RBNZ, BoJ/e-Stat, SNB/BFS.
3. Offizielle Eventkalender für alle acht Währungsräume.
4. Preisadapter für FX/Energie plus universeller Dateiimport.
5. Nur danach optionale Drittanbieter-/Scrapingadapter.
