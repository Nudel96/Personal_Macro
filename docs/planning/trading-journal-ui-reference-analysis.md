# UI-Referenzanalyse: Tradingjournal-Dashboard

Stand: 17. Juli 2026

## Rolle der Referenz

Das bereitgestellte LIVDER-Bild ist die visuelle Referenz für Informationsdichte,
Hierarchie und Interaktion des Tradingjournals. Es ist kein Daten- oder
Formelstandard. Alle dargestellten Werte werden in Personal Macro aus der
zentralen Metrics Engine erzeugt und müssen untereinander mathematisch
konsistent sein.

## Übernommene Informationsarchitektur

### Kopfbereich

- Titel und kurze Kontextbeschreibung;
- globaler Zeitraum;
- kombinierbarer Filter-Button mit aktivem Filterzähler;
- prominente Aktion „Trade hinzufügen“;
- Zugriff auf Dashboard-Layouts beziehungsweise Command Palette.

Der Zeitraum und alle globalen Filter steuern jede KPI-Karte, jeden Chart, die
Kalender-Heatmap und die Liste der letzten Trades gleichzeitig.

### KPI-Zeile

Sechs kompakte Karten im Standardlayout:

1. Netto-PnL;
2. Profit Factor;
3. Win Rate;
4. Durchschnittliches realisiertes R;
5. Anzahl Trades;
6. monetäre Expectancy pro Trade.

Jede Karte enthält:

- Wert und Einheit;
- Delta zur vorherigen Periode gleicher Länge;
- Mini-Sparkline;
- Tooltip mit Formel und Stichprobe;
- Klick in den entsprechenden Analytics-Drilldown.

„Durchschnittliches R“ und „durchschnittliches geplantes R/R“ werden nicht
vermischt. Falls beide angezeigt werden, erhalten sie getrennte Karten und
eindeutige Bezeichnungen.

### Hauptvisualisierungen

| Widget | Darstellung | Standardinhalt |
|---|---|---|
| Equity Curve | große Area-/Line-Chart | echte Equity mit Cashflows; Umschalter zu PnL- und R-Kurve |
| Performance Heatmap | Monat × Kalendertag | Netto-PnL; umschaltbar auf R, Win Rate, Count und Prozess-Score |
| Statistik | Donut plus Kennzahlen | Gewinner, Verlierer, Break-even, größte und durchschnittliche Ergebnisse |
| Letzte Trades | dichte Tabelle | Instrument, Setup, Richtung, Größe, Entry, Exit, realisiertes R, Netto-PnL |
| PnL-Verteilung | Histogramm | konfigurierbare Geld- oder R-Buckets |
| Wochentag | Balkendiagramm | Netto-PnL; umschaltbar auf R, Win Rate und Prozess-Score |
| Setup Performance | Rankingliste | Win Rate, Average R, Profit Factor, `n` und Prozess-Score |

## Abweichungen zur Referenz wegen der Produktgrenzen

- Es gibt keinen Login, Avatar, Abonnementstatus oder Multi-User-Profilblock.
  Dieser Bereich zeigt lokalen Workspace-, Backup- und Datenbankstatus.
- „Live“ wird nicht verwendet. Anzeigen heißen „Lokaler Stand“ oder
  „Berechnet am“.
- „Assets“ wird als Filter-/Analysebereich umgesetzt, nicht als Live-Marktfeed.
- „Screenshots“ geht in der zentralen Medienbibliothek auf.
- Reports werden aus Reviews und Exporten erzeugt.
- Die umfangreichere Hauptnavigation aus dem Auftrag bleibt verbindlich; die
  Referenz bestimmt nur die visuelle Form der Sidebar.

## Mathematische Prüfung der Beispielwerte

Die Referenzdaten sind teilweise synthetisch und nicht vollständig konsistent.

### Nachvollziehbare Beziehung

```text
18.742,39 € / 86 Trades = 217,93 € pro Trade (gerundet)
```

Die dargestellte Expectancy entspricht damit sinnvollerweise dem
durchschnittlichen Netto-PnL pro geschlossenem Trade.

### Widersprüche

- 55 Gewinner von 86 Trades ergeben 63,95 %, also 64,0 %, nicht die obere
  Win-Rate-Karte mit 64,7 %.
- Aus 55 Gewinnern mit durchschnittlich 642,51 € und 28 Verlierern mit
  durchschnittlich -403,84 € ergäbe sich ein anderes Netto-PnL als 18.742,39 €.
- Dieselben Durchschnittswerte würden einen Profit Factor von ungefähr 3,12
  ergeben, nicht 2,13.
- Die Spalte „R/R“ in der letzten Trade-Liste bleibt bei einem Verlusttrade
  positiv und ist daher vermutlich geplantes Chance-Risiko-Verhältnis, nicht
  realisiertes R.
- Der globale Datumsfilter zeigt Juni/Juli, während die Heatmap Werte für Januar
  bis Mai enthält. In Personal Macro darf ein globaler Filter nicht von einzelnen
  Widgets ignoriert werden.

Deshalb werden keine Beispielzahlen aus dem Bild als Test-Sollwerte verwendet.
Verbindlich sind die Formeln in `journal-metrics-and-heatmap-v1.md`.

## Gemeinsamer Dashboard-Datenvertrag

### Anfrage

```text
DashboardQuery
  date_range
  timezone
  account_ids[]
  instruments[]
  asset_classes[]
  directions[]
  strategy_ids[]
  setup_ids[]
  sessions[]
  outcomes[]
  rule_status[]
  emotions[]
  tags[]
  comparison_mode
```

### Antwort

```text
DashboardReadModel
  calculation_version
  calculated_at
  filter_fingerprint
  currency
  sample_counts
  kpis[]
  equity_curve[]
  pnl_curve[]
  r_curve[]
  drawdown_curve[]
  calendar_cells[]
  outcome_summary
  latest_trades[]
  pnl_distribution[]
  weekday_performance[]
  setup_performance[]
  warnings[]
```

Alle Widgets erhalten dieselbe `calculation_version` und denselben
`filter_fingerprint`. Dadurch kann die UI keine Zahlen aus unterschiedlichen
Populationen kombinieren.

## Widget-Berechnungen

| Widget | Primärwert | Vergleich/Sparkline |
|---|---|---|
| Netto-PnL | Summe `net_pnl` | Tages-/Wochenaggregate der aktuellen und vorherigen Periode |
| Profit Factor | Gross Profit / abs(Gross Loss) | rollend über 20 Trades; unavailable ohne Verlusttrade |
| Win Rate | Gewinner / alle geschlossenen Ergebnis-Trades | rollend über 20 Trades |
| Ø realisiertes R | Mittel aller gültigen `realized_r` | rollend über 20 gültige R-Trades |
| Trades | Anzahl geschlossener Trades | Count der Vergleichsperiode |
| Expectancy | Netto-PnL / geschlossene Trades | rollende Average-Trade-Serie |
| Equity Curve | Startbalance + Cashflows + kumuliertes Netto-PnL | keine Cashflows als Gewinn interpretieren |
| Kalenderzelle | gewählte Aggregation pro lokaler Session-Date | Tooltip mit PnL, R, Count, Win Rate, Prozess und Verstößen |
| Ergebnis-Donut | Gewinner/Verlierer/Break-even | absolute Counts und Prozentanteile mit identischem Nenner |
| PnL-Verteilung | Count pro festem/automatischem Bucket | Bucketgrenzen im Tooltip/Export |
| Wochentag | gewählte Aggregation pro lokalem Wochentag | `n` und Missing-Anteil |
| Setup-Ranking | gewählte Setup-Metrik | Mindeststichprobe standardmäßig 10 |

## Interaktionen

- Klick auf KPI filtert Analytics auf die zugrunde liegende Population.
- Klick auf Kalenderzelle öffnet die Trades dieses Tages im Drawer.
- Klick auf Setup öffnet Setup-Detail und zugehörige Trades.
- Klick auf letzten Trade öffnet das Detailpanel ohne Seitenwechsel.
- Filteränderungen werden atomar auf das gesamte Dashboard angewendet.
- Dashboard-Anfrage ist abbrechbar; veraltete Ergebnisse dürfen aktuelle Filter
  nicht überschreiben.
- Widget-Skeletons behalten die finale Größe und vermeiden Layout-Sprünge.
- Leere Population zeigt Erklärung und „Trade hinzufügen“, keine Null-Charts.

## Visuelle Vorgaben

- ruhige dunkelblaue bis anthrazitfarbene Flächen;
- feine, kontrastarme Borders statt starker Schatten;
- blauer/violetter Primärakzent, Grün/Rot nur semantisch;
- 6 KPI-Karten auf breiten Ansichten, responsive 3/2/1 Spalten;
- Charts mit tabellarischen Zahlen und klaren Achsen;
- Sparkline-Farbe unterstützt den Kontext, ersetzt aber nie Delta-Text;
- Heatmap enthält Zahlen/Tooltip und Legende, nicht nur Farbe;
- positive und negative Zustände zusätzlich durch `+/-`, Text und Icons;
- Light Mode nutzt dieselbe semantische Zuordnung, nicht invertierte Bedeutung.

## Responsive Verhalten

| Breite | Layout |
|---|---|
| ≥ 1440 px | Sidebar, 6 KPI-Karten, zweispaltige Hauptcharts |
| 1024–1439 px | einklappbare Sidebar, 3 KPI-Karten pro Zeile |
| 768–1023 px | Icon-Rail, 2 KPI-Karten, Charts untereinander |
| < 768 px | kompakte Top-Navigation, 1 KPI-Karte, Tabellen-Drawer/Vollbild |

Die Desktop-App wird primär für 1280–1920 Pixel optimiert, bleibt aber auch in
einem schmaleren Tauri-Fenster vollständig bedienbar.

## Abnahmekriterien für das Dashboard

- alle Widgets reagieren auf denselben globalen Filter;
- Netto-PnL dividiert durch Trade Count stimmt mit Expectancy überein;
- Donut-Counts summieren sich zum angezeigten Trade Count;
- Setup- und Wochentagswerte summieren sich bei disjunkten Gruppen zum
  Gesamtergebnis;
- kein Ranking unterhalb der Mindeststichprobe;
- jede KPI zeigt Definition und `n`;
- alle Charts besitzen Empty, Loading, Error und Missing States;
- Tastaturnavigation und nicht-farbige Statushinweise funktionieren;
- 10.000 Trades bleiben durch SQL-Aggregation und Virtualisierung flüssig.
