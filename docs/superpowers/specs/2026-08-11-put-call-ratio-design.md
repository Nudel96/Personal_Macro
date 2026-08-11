# Put/Call-Ratio – Design- und Fachspezifikation

## Ziel

Personal Macro erhält einen neuen, fachlich und technisch isolierten Research-Bereich für die Put/Call-Ratio von liquiden CME-FX-Optionen. Die erste Ausbaustufe enthält genau eine Seite, genau eine Chart-Card und genau eine auswählbare Ratio-Zeitreihe. Sie verändert weder die Macro-Heatmap noch deren Scores, Queries, Cache-Keys oder Datenmodell.

## Nutzerfrage

Die Ansicht beantwortet ausschließlich:

> Ist die geglättete Optionsaktivität des ausgewählten FX-Paares aktuell put-dominant, call-dominant oder innerhalb ihres eigenen normalen historischen Bereichs?

Die Ratio ist beobachteter Optionskontext. Sie ist keine Orderempfehlung und kein Beweis dafür, dass das gehandelte Volumen ausschließlich von Optionskäufern eröffnet wurde.

## Navigation und Seitenaufbau

- In der Sidebar entsteht eine eigene Gruppe `Research`.
- Die Gruppe enthält zunächst ausschließlich `Put/Call Ratio` mit Route `/put-call-ratio`.
- Die Seite verwendet den bestehenden `PageHeader` mit Eyebrow `Research`, Titel `Put/Call Ratio` und einer kurzen methodischen Beschreibung.
- Unter dem PageHeader steht genau eine bestehende `Card`.
- Der Card-Header enthält links Titel und Datenfrequenz, rechts den vorhandenen `.select` für das Asset sowie optional die bereits verwendeten Badge-/Button-Komponenten für Datenstatus und Aktualisierung.
- Der Card-Inhalt enthält genau einen ECharts-Line-Chart. Es gibt keine KPI-Kacheln, keine weiteren Indikatoren und keine zweite Grafik.

## Visuelle Integration

Die Seite übernimmt das bestehende Personal-Macro-Designsystem:

- Card, Border, Radius und Schatten kommen aus den vorhandenen `.card`-Stilen.
- Der Asset-Selektor verwendet `.field` und `.select`.
- Achsen, Split-Lines und Tooltip bauen auf `BaseChart`, `axisLabel`, `axisLine`, `splitLine` und `tooltip` auf.
- Die Ratio wird als einzelne helle, nicht semantisch eingefärbte Linie gezeichnet.
- Die obere Schwelle ist rot und gestrichelt; der Bereich darüber erhält eine sehr transparente rote Fläche.
- Die untere Schwelle ist grün und gestrichelt; der Bereich darunter erhält eine sehr transparente grüne Fläche.
- Der mittlere Bereich bleibt in der normalen Navy-Card-Fläche.
- Rot und Grün werden nur semantisch verwendet: bearish = rot, bullish = grün.
- Die Zustände bleiben zusätzlich durch direkte Linienlabels, Linienstil und Text verständlich; Farbe ist nicht das einzige Unterscheidungsmerkmal.
- Die Y-Achse ist adaptiv, enthält aber immer alle verfügbaren Ratio-Punkte und beide Schwellen mit Abstand.
- Die X-Achse zeigt die letzten 90 gültigen Handelstage.

## Datenquelle und unterstützte Assets

Primärquelle ist der offizielle CME-Report `Daily FX Options Update`:

`https://www.cmegroup.com/reports/fx-put-call.pdf`

Der Report liefert tägliches Call- und Put-Notional in US-Dollar nach Währung und Fälligkeit. Die Anwendung aggregiert die im Report bereits ausgewiesene Gesamtsumme je Währung und speichert keine persönlichen Daten beim Provider.

Die erste Ausbaustufe unterstützt:

| Anzeige | CME-Underlying | Orientierung |
| --- | --- | --- |
| EUR/USD | Euro FX, EUR/USD | direkt |
| GBP/USD | British Pound, GBP/USD | direkt |
| AUD/USD | Australian Dollar, AUD/USD | direkt |
| NZD/USD | New Zealand Dollar, NZD/USD | direkt |
| USD/JPY | Japanese Yen, JPY/USD | invers |
| USD/CAD | Canadian Dollar, CAD/USD | invers |
| USD/CHF | Swiss Franc, CHF/USD | invers |

Für inverse Anzeigen werden Put und Call fachlich vertauscht, bevor die Ratio gebildet wird. Dadurch bleibt die UI-Semantik konsistent: Ein hoher Wert ist immer bearish für das angezeigte Paar, ein niedriger Wert immer bullish.

EODHD wird nicht als FX-Optionsquelle verwendet. Das verfügbare EODHD-Optionsprodukt deckt US-Aktien und ETFs ab; ein ETF-Proxy wäre kein nativer FX-Put/Call-Wert.

## Berechnung

### Gültiger Tageswert

Für die angezeigte Paarorientierung gilt:

```text
daily_pcr = effective_put_notional_usd / effective_call_notional_usd
```

Ein Tageswert ist nur gültig, wenn:

- Call- und Put-Notional vorhanden sind,
- beide Werte größer als null sind,
- das Berichtsdatum valide ist.

Nullvolumen, fehlende Felder, ein nicht parsebarer Report oder ein Nenner von null erzeugen keinen Wert und werden nie als neutral oder als `0` gespeichert.

### Glättung

```text
pcr_ma5(t) = Mittelwert der letzten 5 gültigen, aufeinanderfolgenden Handelstage
```

Die 5-Tage-Glättung entspricht ungefähr einer Handelswoche und reduziert Tagesrauschen für den Swing-Kontext. Fehlt innerhalb des Fensters ein erforderlicher Handelstag, entsteht an dieser Stelle kein geglätteter Punkt.

### Sentiment-Schwellen

Die Schwellen werden pro Asset aus den letzten 252 gültigen `pcr_ma5`-Beobachtungen berechnet:

```text
bullish_threshold = P20(pcr_ma5 history)
bearish_threshold = P80(pcr_ma5 history)
```

Die Perzentile verwenden lineare Interpolation zwischen benachbarten sortierten Beobachtungen. Genau 252 gültige geglättete Beobachtungen sind erforderlich. Bei weniger Historie bleiben Schwellen und Sentiment nicht verfügbar; es gibt keine festen Ersatzwerte.

Die sichtbaren horizontalen Linien verwenden die aktuell aus dem jüngsten 252er-Fenster berechneten Schwellen über die gesamte 90-Tage-Anzeige. Die Seite ist eine aktuelle Kontextansicht, kein historischer Backtest. Tooltips und Methodiktext machen diese Kalibrierung sichtbar.

### Aktueller Zustand

```text
latest_ma5 >= bearish_threshold  -> bearish
latest_ma5 <= bullish_threshold  -> bullish
sonst                            -> neutral
fehlender Wert oder Schwelle     -> unavailable
```

Eine exakte Gleichheit gehört zur jeweiligen äußeren Zone. Der Zustand wird nicht in die Macro-Heatmap oder einen Currency-Score geschrieben.

## Persistenz

Eine neue additive Migration legt zwei eigenständige Tabellen an.

### `put_call_observations`

- `asset_symbol` – kanonisches UI-Symbol, zum Beispiel `EURUSD`
- `source_symbol` – CME-Währungsbezeichnung
- `trade_date` – ISO-Datum des Reports
- `call_notional_usd` – provider-native Gesamtsumme als Integer
- `put_notional_usd` – provider-native Gesamtsumme als Integer
- `source_orientation` – `direct` oder `inverse`
- `source_url`
- `collected_at` – UTC/RFC3339
- Primärschlüssel aus `asset_symbol` und `trade_date`

Providerwerte werden unverändert in Providerorientierung gespeichert. Die Inversion geschieht in der Berechnungsschicht, nicht destruktiv beim Import.

### `put_call_sync_runs`

- technische Run-ID
- Start- und Endzeit
- Status `success` oder `failed`
- Anzahl gelesener und gespeicherter Assets
- begrenzte, nutzerfreundliche Fehlermeldung

Eine fehlgeschlagene Aktualisierung verändert vorhandene Beobachtungen nicht.

## Backend-Verträge

Das neue Rust-Modul `commands/put_call.rs` enthält Providerabruf, Parsing, Berechnung und Commands. Es greift ausschließlich auf die neuen Tabellen zu.

### `get_put_call_dashboard`

Liefert:

- unterstützte Assets,
- ausgewähltes beziehungsweise angefragtes Asset,
- bis zu 90 geglättete Punkte,
- Raw-Ratio und Notionalwerte für Tooltips,
- aktuelle Schwellen, falls verfügbar,
- aktuellen Zustand,
- Anzahl gültiger Kalibrierungswerte,
- letzten erfolgreichen Datenstand,
- letzten Sync-Status und Providerhinweise.

### `sync_put_call_data`

- ruft ausschließlich den offiziellen CME-Report ab,
- begrenzt Timeout und Providerfehlermeldungen,
- validiert Content-Type, PDF-Signatur, Reportdatum und alle Zahlen,
- schreibt alle gültigen Assets in einer Transaktion,
- ersetzt bei gleichem Asset/Datum nur denselben Provider-Snapshot,
- erhält bei Fehlern den letzten guten Datenstand.

Die Anwendung versucht keine erfundene historische Rückrechnung. Der kostenlose aktuelle Report baut die lokale Zeitreihe ab Einführung täglich auf. Ein lizenzierter DataMine-Backfill ist eine spätere, getrennte Erweiterung.

## Frontend-Verträge und Browser-Vorschau

- TypeScript erhält eigene `PutCall...`-Typen.
- `services/commands.ts` bleibt die einzige öffentliche Command-Fassade.
- Query-Key ist ausschließlich `put-call` mit Asset-Unterkey.
- Eine erfolgreiche Mutation invalidiert nur `put-call`.
- Der Browser-Fallback liefert keine Demo- oder Mockdaten. Er liefert einen klaren `nativeOnly`-/Unavailable-Vertrag, weil der CME-Abruf und SQLite-Persistenz native Funktionen sind.

## Zustände

### Loading

Die Seite verwendet die vorhandenen Skeleton-/Loading-Muster.

### Keine Beobachtungen

Die einzelne Card zeigt einen `EmptyState`: Noch keine CME-Tageswerte lokal gespeichert. Die Macro-Heatmap und andere App-Bereiche bleiben nutzbar.

### Weniger als fünf gültige Handelstage

Die Card erklärt, wie viele Tageswerte bis zum ersten 5-Tage-Punkt fehlen. Es wird keine künstliche Linie gezeigt.

### Linie vorhanden, Schwellen noch nicht verfügbar

Der Chart zeigt die vorhandene MA5-Linie ohne rote/grüne Schwellen und ohne Sentimentlabel. Ein kompakter Hinweis nennt `n/252` gültige Kalibrierungswerte.

### Fehler bei Aktualisierung

Der letzte gute Chart bleibt sichtbar. Eine vorhandene Notice meldet, dass die Aktualisierung fehlgeschlagen ist und der bestehende Datenstand unverändert blieb.

### Vollständig verfügbar

Der Chart zeigt Linie, zwei Schwellen, Zonen, aktuellen Zustand, Datenstand und Tooltipdetails.

## Tooltip

Pro Datum zeigt der Tooltip:

- 5-Tage-PCR,
- Tages-PCR,
- Put-Notional,
- Call-Notional,
- angezeigte und CME-native Paarorientierung,
- Datenquelle und Berichtsdatum.

## Tests

### Rust

- direkte Ratio `put / call`
- inverse Anzeige vertauscht Put und Call
- Nenner null und fehlendes Put-/Call-Volumen sind unavailable
- MA5 benötigt fünf gültige aufeinanderfolgende Handelstage
- P20/P80 mit linearer Interpolation
- exakt 251 Werte liefern keine Schwellen
- exakt 252 Werte liefern beide Schwellen
- Gleichheit an den Schwellen ergibt bullish beziehungsweise bearish
- Parser erkennt alle sieben unterstützten CME-Zeilen
- Parser lehnt falschen Content-Type, fehlende PDF-Signatur, fehlendes Datum und unvollständige Werte ab
- fehlgeschlagener Sync bewahrt bestehende Daten
- Migration funktioniert in einer temporären Datenbank

### Frontend

- Seite zeigt genau eine Chart-Card
- Assetwechsel lädt den passenden Query-Key
- ohne Daten erscheint der deutsche Empty State
- mit Linie, aber ohne 252 Werte erscheinen keine Schwellen
- mit vollständigen Daten erscheinen exakt zwei Schwellen und die richtige Zustandsbeschriftung
- Fehlernotice lässt vorhandene Chartdaten sichtbar
- Browser-Vorschau behauptet keinen erfolgreichen CME-Sync

## Abgrenzung

Nicht Bestandteil dieser Ausbaustufe sind:

- H4-/D1-Trend,
- Open-Interest-PCR,
- Gold, Indizes, Aktien oder ETF-Proxys,
- Intraday-PCR,
- automatische Tradingempfehlungen,
- Macro-Heatmap- oder Pair-Score-Integration,
- DataMine-Kauf, Lizenzierung oder historischer Backfill,
- weitere Research-Fenster.

## Quellenbasis

- CME Daily FX Options Update: https://www.cmegroup.com/reports/fx-put-call.pdf
- CME Daily Bulletin: https://www.cmegroup.com/market-data/daily-bulletin.html
- CME DataMine: https://www.cmegroup.com/datamine.html
- Cboe zur Interpretation und zu Verzerrungen einfacher Put/Call-Ratios: https://www.cboe.com/insights/posts/how-early-exercise-order-flow-impacts-equity-option-put-call-ratios
- Pan/Poteshman zur präziseren buyer-initiated opening volume Ratio: https://papers.ssrn.com/sol3/papers.cfm?abstract_id=368980
- EODHD US Stock Options API: https://eodhd.com/marketplace/unicornbay/options
