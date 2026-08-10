# Economic Heatmap und Institutional Activity – Design

**Datum:** 2026-08-10  
**Status:** Vom Benutzer im Gespräch freigegeben

## Ziel

Die fundamentale Forex-Heatmap soll positive, negative, neutrale und nicht
verfügbare Evidenz wesentlich schneller erkennbar machen. Zusätzlich erhält sie
einen eigenständigen Bereich „Institutional Activity“ mit zwei gleichrangigen
COT-Indikatoren:

1. der jüngsten Veränderung von Long- und Short-Positionen;
2. dem bereits bestehenden bestätigten COT-Pipeline-Signal.

Die bestehende EODHD-Fundamentalbewertung bleibt fachlich unverändert und wird
nicht stillschweigend mit dem COT-Score vermischt.

## Berechnungsregeln

### Latest Buys/Sells

Der CFTC-Report liefert `long_change` und `short_change` für die zuletzt
gemeldete Woche. Daraus wird berechnet:

```text
latest_net_change = long_change - short_change
latest_change_signal = sign(latest_net_change)
```

- positiver Wert: `+1` / Bullish
- negativer Wert: `-1` / Bearish
- exakt null: `0` / Neutral
- fehlender oder veralteter Report: unavailable

Der Indikator verwendet die providerseitig gemeldeten Wochenveränderungen. Er
benötigt keine langjährige Historie, übernimmt aber die bestehende
Zehn-Tage-Freshness-Grenze der COT-Pipeline.

### Bestehende COT-Pipeline

Der zweite Indikator übernimmt unverändert `assessment.bias_signal` aus der
bestehenden COT-v3-Auswertung. Diese kombiniert Positionierungsperzentil,
4-Wochen-Kapitalfluss und 13-Wochen-Theil-Sen-Persistenz einschließlich ihrer
bestehenden History-, Gap-, Freshness- und Qualitätsregeln.

### Institutional Activity je Währung

Beide verfügbaren Signale werden ohne versteckte Zusatzgewichte addiert:

```text
institutional_score = latest_change_signal + confirmed_pipeline_signal
```

Die Anzeige verwendet:

| Score | Label |
|---:|---|
| `+2` | Sehr Bullish |
| `+1` | Bullish |
| `0` | Neutral |
| `-1` | Bearish |
| `-2` | Sehr Bearish |

Coverage zeigt `0/2`, `1/2` oder `2/2`. Ist nur ein Indikator verfügbar, wird
der verfügbare Wert angezeigt und die reduzierte Coverage ausdrücklich
markiert. Sind beide unavailable, besitzt auch der Institutional Score keinen
Zahlenwert.

### Institutional Activity je Währungspaar

Jeder der beiden COT-Indikatoren folgt der kanonischen Base-minus-Quote-Regel:

```text
component_score = base_signal - quote_signal
```

Eine Pair-Komponente ist nur verfügbar, wenn Base und Quote beide ein Signal
besitzen. Fehlende Werte werden weder als neutral noch als null eingesetzt. Der
separate Institutional Pair Score ist die Summe der verfügbaren COT-Pair-
Komponenten; bei null verfügbaren Komponenten bleibt auch dieser Score
unavailable. Die Paarwerte müssen antisymmetrisch sein.

## Architektur und Datenfluss

EODHD und CFTC bleiben unabhängige Datenpipelines:

```text
MacroPage
  ├─ macroFundamentalsDashboard → EODHD/SQLite
  └─ cotDashboard               → CFTC-COT/SQLite
       └─ UI-Komposition nach Currency-Code
```

Im Rust-COT-Modul wird `latest_change_signal` als eigenes Feld des
`CotContractView` berechnet und serialisiert. Die bestehende Bedeutung von
`change_signal` – historisches Perzentil des 4-Wochen-Flows – bleibt
unverändert. Es ist keine SQLite-Migration erforderlich, weil alle benötigten
Rohwerte bereits in `cot_observations` gespeichert sind.

Das Frontend führt die beiden Responses über den Currency-Code zusammen und
berechnet daraus reine, testbare Currency- und Pair-View-Modelle. Die
Fundamentalverträge und der vorhandene `fundamentalScore` bleiben erhalten.

## Benutzeroberfläche

### Pair-Heatmap

Die Heatmap erhält die Gruppe „Institutional Activity“ mit folgenden Spalten:

- `Latest Buys/Sells`
- `COT Pipeline`
- separater `Institutional Score` im Output-Bereich

Der bestehende Fundamentals-Score und sein Bias bleiben separat sichtbar.
COT-Spalten werden nicht in den Fundamentals-Score eingerechnet.

Zellen verwenden eine semantische Farblogik:

- `+2`: kräftiges Grün
- `+1`: mittleres Grün
- `0`: dunkles neutrales Slate
- `-1`: mittleres Rot
- `-2`: kräftiges Rot
- unavailable: entsättigte Fläche mit klarer Kennzeichnung, niemals Grün oder
  Rot

Tooltips zeigen Base- und Quote-Signal, Reportdatum sowie den Grund für
Unavailable. Farbe ist nie die einzige Information; jede Zelle enthält
weiterhin Zahl, Label oder Gedankenstrich.

### Währungsdetail

Oberhalb von Economic Growth erscheint ein Institutional-Activity-Panel. Es
enthält:

- den aggregierten Institutional-Status samt Score und Coverage;
- die Zeile „Latest Buys/Sells“ mit Long-Änderung, Short-Änderung,
  Nettoänderung und Reportdatum;
- die Zeile „COT Pipeline“ mit bestätigtem Signal, Qualitätsstatus,
  Crowding-Status und Reportdatum;
- einen COT-Aktualisieren-Button mit eigenem Loading- und Fehlerzustand.

Die bestehenden Economic-Gruppen erhalten kräftigere semantische Statusfelder
und getönte Gruppenheader. Positive, negative und neutrale Zustände bleiben
zusätzlich textuell benannt.

## Fehler- und Verfügbarkeitsverhalten

- Ein COT-Ladefehler blockiert die EODHD-Fundamentalansicht nicht.
- Ein EODHD-Ladefehler wird weiterhin als Fehler der Fundamentals-Seite
  behandelt.
- CNY besitzt derzeit keinen CFTC-COT-Kontrakt und wird deshalb als
  unavailable angezeigt.
- Veraltete Reports liefern weder ein Latest-Buys/Sells-Signal noch einen
  bestätigten Pipelinebeitrag.
- Eine fehlgeschlagene COT-Aktualisierung löscht keine vorhandenen COT-Daten.
- Browser-Vorschau zeigt Institutional Activity als unavailable und behauptet
  keinen erfolgreichen Live-Abruf.

## Teststrategie

Die Umsetzung erfolgt testgetrieben.

### Rust

- positive, negative und exakt neutrale Nettoveränderung;
- `long_change - short_change` statt historischer Perzentilberechnung;
- unavailable bei fehlendem oder veraltetem Report;
- unveränderte Ergebnisse der bestehenden COT-v3-Pipeline;
- Serde-Vertrag für `latestChangeSignal`.

### TypeScript und React

- Currency-Aggregation für `+2`, `+1`, `0`, `-1`, `-2` und reduzierte
  Coverage;
- Base-minus-Quote-Werte `+2`, Aufhebung gleicher Signale und
  Antisymmetrie;
- unavailable bei fehlender Base oder Quote;
- Institutional-Spalten und Detailpanel verwenden echte COT-Response-Felder;
- COT-Fehler lässt die Fundamentals-Heatmap sichtbar;
- semantische Intensitätsklassen unterscheiden `±1`, `±2`, neutral und
  unavailable.

### Qualitätsgates

- relevante Vitest-Tests im Red-Green-Zyklus;
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build`;
- relevante Rust-Tests, `cargo fmt --all -- --check` und
  `cargo clippy --all-targets -- -D warnings`;
- realer Tauri-Start, da die COT-Pipeline nativ und SQLite-gebunden ist;
- abschließende Diff-Prüfung auf Secrets, persönliche Daten und generierte
  Dateien.

## Nicht-Ziele

- keine Änderung der EODHD-Surprise-Formel;
- keine Änderung des bestehenden COT-v3-Bestätigungssignals;
- keine neue Datenquelle und keine simulierten COT-Werte;
- keine SQLite-Migration;
- keine Einrechnung von COT in den bestehenden `fundamentalScore`;
- keine Broker- oder Orderfunktion.
