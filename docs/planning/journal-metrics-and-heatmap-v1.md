# Berechnungsspezifikation v1: Journal-Metriken und Heatmaps

Stand: 17. Juli 2026

## Grundregeln

- Eine Kennzahl wird ausschließlich in der zentralen Metrics Engine berechnet.
- Tabelle, KPI-Karte, Chart, Kalender und Export verwenden denselben Filter und
  dieselbe Berechnungsversion.
- Jede Ausgabe enthält Zeitraum, Filterfingerprint, `n`, Einheit,
  Verfügbarkeitsstatus und Reason Code.
- `NULL`/unavailable ist kein numerischer Nullwert.
- Geld wird in der Kontowährung und als Integer-Minor-Units aggregiert.
- R-Metriken verwenden nur Trades mit gültigem ursprünglichem Risiko größer 0.
- Offene, stornierte, archivierte und gelöschte Trades werden nur einbezogen,
  wenn die konkrete Kennzahl dies ausdrücklich erlaubt.
- Standardpopulation für Ergebniskennzahlen sind geschlossene Trades.
- Vergleiche verwenden eine unmittelbar vorhergehende Periode gleicher Länge
  und identische Filter.

## Primäre KPI-Struktur

Das Standarddashboard besitzt drei primäre Entscheidungskennzahlen:

1. **Netto-PnL:** finanzielles Ergebnis nach Gebühren und Finanzierung;
2. **Gesamt-R:** kontounabhängige risikonormierte Performance;
3. **Prozess-Score/Regelkonformität:** Qualität der Ausführung unabhängig vom
   Ergebnis.

Drawdown, Profit Factor, Expectancy, Setups, Zeit, Psychologie und Fehler sind
Treiber beziehungsweise Guardrails. Damit wird ein gutes finanzielles Ergebnis
nicht mit einem schlechten Prozess verwechselt.

## Trade-Ergebnis und R

```text
net_pnl = gross_pnl - fees - commission - swap
initial_planned_risk = abs(planned_entry - initial_stop_loss) * position_value_per_price_unit
realized_r = net_pnl / initial_planned_risk
```

Für Instrumente mit abweichender Tick-/Pip-Logik liefert das Instrumentprofil
`position_value_per_price_unit`. Ist das ursprüngliche Risiko kleiner oder
gleich null, ist `realized_r` unavailable (`INVALID_INITIAL_RISK`).

Ein manueller R-Override wird getrennt vom berechneten Wert gespeichert und
benötigt einen Grund. Standardauswertungen verwenden den berechneten Wert; ein
Filter kann Overrides einbeziehen.

## Basiskennzahlen

Sei `T` die gefilterte Population geschlossener Trades mit Ergebnis.

| Kennzahl | Formel | Sonderfall |
|---|---|---|
| Total Trades | `count(T)` | 0 ist gültig |
| Winning Trades | `count(net_pnl > 0)` | – |
| Losing Trades | `count(net_pnl < 0)` | – |
| Break-even Trades | `count(net_pnl = 0)` | exakter Decimal-/Integervergleich |
| Win Rate | `wins / count(T)` | unavailable bei `count(T)=0` |
| Loss Rate | `losses / count(T)` | unavailable bei `count(T)=0` |
| Gross Profit | `sum(max(net_pnl, 0))` | – |
| Gross Loss | `sum(min(net_pnl, 0))` | negativ dargestellt |
| Net Profit | `sum(net_pnl)` | – |
| Average Trade | `mean(net_pnl)` | identisch zur monetären Expectancy |
| Average Winner | `mean(net_pnl where >0)` | unavailable ohne Gewinner |
| Average Loser | `mean(net_pnl where <0)` | unavailable ohne Verlierer |
| Largest Winner | `max(net_pnl)` | unavailable ohne Gewinner |
| Largest Loser | `min(net_pnl)` | unavailable ohne Verlierer |
| Payoff Ratio | `avg_winner / abs(avg_loser)` | unavailable ohne beide Gruppen |
| Profit Factor | `gross_profit / abs(gross_loss)` | `∞` nur als Text, wenn Gewinn >0 und kein Verlust; nie für Ranking verwenden |
| Expectancy | `sum(net_pnl) / count(T)` | unavailable bei leerer Population |

Break-even-Trades sind im Nenner der normalen Win Rate enthalten. Optional kann
eine „Decisive Win Rate“ ohne Break-even separat angezeigt werden, darf aber
nicht dieselbe Bezeichnung tragen.

## R-basierte Kennzahlen

Sei `R` die Population gültiger `realized_r`-Werte.

| Kennzahl | Formel |
|---|---|
| Total R | `sum(R)` |
| Average R | `mean(R)` |
| Median R | `median(R)` |
| Average Winning R | `mean(r where r>0)` |
| Average Losing R | `mean(r where r<0)` |
| Best R | `max(R)` |
| Worst R | `min(R)` |
| Expected R per Trade | `sum(R)/count(R)` |

„Average R“ und „Expected R per Trade“ sind mathematisch identisch. Im UI wird
nur eine Karte gezeigt; der zweite Name bleibt als fachliches Alias für Exporte.

## Equity und Drawdown

Eine korrekte Equity benötigt Startbalance und Cashflows. Reine kumulierte PnL
wird ausdrücklich als „PnL-Kurve“ bezeichnet, nicht als Equity.

Für jeden chronologisch geordneten Zeitpunkt `t`:

```text
equity_t = initial_balance + cumulative_cashflows_t + cumulative_net_pnl_t
peak_t = max(equity_0 ... equity_t)
drawdown_amount_t = max(0, peak_t - equity_t)
drawdown_pct_t = drawdown_amount_t / peak_t, wenn peak_t > 0
```

| Kennzahl | Definition |
|---|---|
| Maximum Drawdown | Maximum von `drawdown_amount_t` und separat Prozentwert |
| Current Drawdown | letzter Drawdown-Wert |
| Average Drawdown | Mittel der maximalen Tiefen abgeschlossener Drawdown-Episoden |
| Longest Drawdown | längste Zeit von Peak bis vollständiger Erholung; offene Episode endet am Filterende |
| Recovery Factor | `net_profit / maximum_drawdown_amount` |

Einzahlungen/Auszahlungen dürfen keine künstlichen Gewinne oder Drawdowns
erzeugen. Bei Kontovergleichen werden Prozent- oder R-Werte priorisiert.

## Serien und Risiko

- Trades werden nach `closed_at`, dann stabil nach ID sortiert.
- Gewinnserie: aufeinanderfolgende `net_pnl > 0`.
- Verlustserie: aufeinanderfolgende `net_pnl < 0`.
- Break-even beendet beide Serien.
- Average/Maximum Risk verwenden das ursprünglich geplante Risiko.
- Risk Rule Violations zählen Trades mit explizit verletzter Risikoregel, nicht
  nur Trades mit hohem Verlust.

## Prozessmetriken

Boolean-Raten verwenden ausschließlich bewertete Trades im Nenner. Ein nicht
ausgefülltes Feld ist nicht automatisch ein Regelverstoß.

| Kennzahl | Formel |
|---|---|
| Plan Adherence | `followed_plan=true / followed_plan non-null` |
| Risk Rule Adherence | `followed_risk_rules=true / field non-null` |
| Entry Rule Adherence | `followed_entry_rules=true / field non-null` |
| Exit Rule Adherence | `followed_exit_rules=true / field non-null` |
| Average Process Score | Mittel der ausgefüllten 1–10-Werte |
| Average Execution Score | Mittel der ausgefüllten 1–10-Werte |
| Average Setup Quality | Mittel der ausgefüllten 1–10-Werte |
| Rule Violation Rate | Trades mit mindestens einer expliziten Verletzung / bewertete Trades |
| Impulse Trade Rate | explizit als Impulstrade markierte Trades / bewertete Trades |
| Reviewed Trade Rate | geschlossene Trades mit abgeschlossenem Review / geschlossene Trades |
| Screenshot Completion | vorhandene konfigurierte Pflicht-Slots / erforderliche Slots |

Ein Impulstrade wird nicht automatisch aus einem hohen Impulsivitätswert
abgeleitet. Dafür existiert ein explizites Feld beziehungsweise eine
Fehlerzuordnung.

## Setup-, Zeit- und Psychologieauswertung

Alle Gruppenauswertungen liefern zusätzlich `n`, Median R und den Anteil
fehlender Werte.

- Zeit-Buckets werden aus `opened_at` in der zum Trade gespeicherten IANA-
  Zeitzone erzeugt.
- Session ist ein gespeicherter Kontextwert und wird nicht rückwirkend aus
  willkürlichen Uhrzeitgrenzen geändert.
- Für ordinale Skalen 1–10 wird Spearman-Korrelation verwendet.
- Für Boolean-Gruppen werden Gruppenmittel/Median und Differenz gezeigt.
- Texte verwenden „beobachteter Zusammenhang“, niemals „verursacht“.

### Mindeststichproben

| Ausgabe | Standard |
|---|---:|
| Wert anzeigen | `n >= 1`, immer mit `n` |
| Setup-/Session-Ranking | `n >= 10` |
| Profit Factor pro Gruppe | `n >= 5` und mindestens ein Verlusttrade |
| rollende Kennzahlen | 20 Trades |
| psychologische Korrelation | `n >= 20`, Warnung bis `n < 30` |
| „Bestes/Schlechtestes Setup“ | `n >= 10` |

Die Grenzwerte sind konfigurierbar, werden aber mit dem Snapshot gespeichert.

## Journal-Heatmaps

Eine Heatmap-Zelle ist die Aggregation aller gefilterten Trades im Schnittpunkt
von Zeilen- und Spalten-Bucket.

Mögliche Achsen:

- Wochentag × Stunde;
- Wochentag × Session;
- Monat × Setup;
- Instrument × Setup;
- Emotion × Ergebnis/Regelkonformität;
- Setup × Prozess-Score-Bucket;
- Risiko-Bucket × Ergebnis;
- Haltedauer-Bucket × Ergebnis.

Umschaltbare Zellwerte:

| Wert | Aggregation |
|---|---|
| Netto-PnL | Summe `net_pnl` |
| Total R | Summe gültiger R-Werte |
| Average R | Mittel gültiger R-Werte |
| Win Rate | Gewinner / geschlossene Trades mit Ergebnis |
| Trade Count | Anzahl Trades |
| Profit Factor | Gross Profit / abs(Gross Loss) |
| Process Score | Mittel ausgefüllter Prozess-Scores |

Für PnL, Total R und Average R wird eine divergierende Farbskala um null
verwendet. Trade Count, Win Rate und Process Score verwenden eine sequentielle
Skala. Jede Zelle zeigt Tooltip, Wert, `n`, Missing-Anteil und gegebenenfalls
Mindeststichproben-Warnung. Farbe ist nie die einzige Information.

## Macro-Heatmap aus dem Referenzbild

Das Bild definiert den visuellen Aufbau, ist aber keine widerspruchsfreie
Rechenquelle. Beispiel: `USD +1,62` minus `JPY -1,35` wäre `+2,97`, die Matrix
zeigt jedoch `+1,87`. Deshalb gelten die folgenden expliziten Formeln.

### Einzelindikator

```text
surprise = actual - forecast
indicator_signal = direction * sign(surprise)
```

`indicator_signal` ist -1, 0 oder +1. Missing/stale Daten sind unavailable.

### Währungsfaktor

Für Faktor `f` und Währung `c`:

```text
currency_factor(c,f) = sum(component_weight_i * signal_i)
                       / sum(available_component_weight_i)
```

Der Wert liegt zwischen -1 und +1. Komponenten sind beispielsweise einzelne
Growth-Releases oder die drei COT-Teilzeichen Position, Change und Z-Score.

### Paarfaktor

```text
pair_factor(base, quote, f) = currency_factor(base,f) - currency_factor(quote,f)
```

Der Paarfaktor liegt zwischen -2 und +2 und erfüllt:

```text
pair_factor(A,B,f) = -pair_factor(B,A,f)
pair_factor(A,A,f) = unavailable / Diagonale
```

### Rohscore, normierter Score und Faktorbeiträge

```text
factor_contribution_f = pair_factor_f * factor_weight_f
pair_raw_score = sum(factor_contribution_f)
pair_normalized_score = pair_raw_score / sum(abs(available_factor_weight_f))
```

- Der Rohscore ist die Summe des Faktor-Breakdowns und kann außerhalb ±2
  liegen.
- Der normierte Score liegt zwischen -2 und +2 und dient Ranking und
  Vergleichbarkeit bei unterschiedlicher Coverage.
- Die Matrix zeigt standardmäßig den normierten Score.
- Das Detailpanel zeigt normierten Score und Rohscore getrennt; die sichtbaren
  Beiträge summieren sich exakt zum Rohscore.
- Die Farbskala wird bei ±2 gesättigt, numerische Werte werden nie abgeschnitten.

### Coverage, Agreement und Überzeugung

```text
coverage = sum(abs(available weights)) / sum(abs(enabled weights))
agreement = max(sum(abs(positive contributions)), sum(abs(negative contributions)))
            / sum(abs(all non-zero contributions))
quality = gewichtetes Mittel der Input-Qualitätswerte zwischen 0 und 1
conviction_raw = min(abs(normalized_score) / strong_threshold, 1)
                 * coverage * agreement * quality
conviction_dots = round(5 * conviction_raw)
```

Bei null Beiträgen ist Agreement null. Ranking und Signale benötigen standardmäßig
Coverage ≥ 0,67, Quality ≥ 0,8 und mindestens drei verfügbare Faktoren.

### Karten und Rankings

| UI-Element | Definition |
|---|---|
| Stärkste Währung | höchster normierter Currency-Score mit Mindestcoverage |
| Schwächste Währung | niedrigster normierter Currency-Score mit Mindestcoverage |
| Bestes Paar | höchster positive normierte Paarwert je ungeordnetem Paar |
| Aktive Signale | Paare mit `abs(score) >= signal_threshold` und mindestens 3 Conviction-Dots |
| Währungsranking | normierter Currency-Score; Ties durch Coverage, dann Code |
| Stärkeverlauf | gespeicherte Berechnungssnapshots, keine interpolierten Fake-Werte |

Es gibt wegen der Offline-Grenze keine „Live Signale“. Die UI nennt sie
„Aktive lokale Signale“ und zeigt den Snapshot-Zeitpunkt.

### Macro Bias / Risk Regime

Ein globaler Mittelwert aller gerichteten Paare ist ungeeignet, weil sich eine
antisymmetrische Matrix zu null aufhebt. Ein Risk-On/-Off-Label wird deshalb als
eigenes, versioniertes Basket-Modell berechnet:

```text
risk_on = mean(AUD, NZD, CAD, EUR, GBP)
risk_off = mean(USD, JPY, CHF)
regime_score = risk_on - risk_off
```

Dieses vorgeschlagene Basket-Modell ist Kontext und fließt nicht in einzelne
Pair-Scores ein. Die endgültigen Basket-Mitglieder und Schwellen müssen vor der
Implementierung fachlich bestätigt werden.

## Bias-Labels

Standard für normierte Pair-/Currency-Scores:

| Betrag | Label |
|---:|---|
| `< 0,25` | Neutral |
| `0,25 bis < 0,75` | leicht bullish/bearish |
| `0,75 bis < 1,25` | bullish/bearish |
| `>= 1,25` | stark bullish/bearish |

Schwellen sind Teil der Berechnungsversion und werden nicht rückwirkend geändert.

## Pflicht-Testvektoren

### Journal

- Long/Short mit Gebühren und Swap;
- Risiko null und fehlendes Risiko;
- Gewinner, Verlierer und Break-even;
- Profit Factor ohne Verlusttrade;
- Ein-/Auszahlungen ohne künstlichen Drawdown;
- offene und abgeschlossene Drawdown-Episoden;
- Break-even in Streaks;
- gleiche Zeitpunkte und stabile Sortierung;
- Zeitzonen-/DST-Buckets;
- Missing Process-/Rule-Felder;
- Filteridentität zwischen Karte, Chart, Heatmap und Export.

### Macro Heatmap

- AUD Growth +1 und CHF Growth -1 ergibt Paarfaktor +2;
- gleiche Signale ergeben 0;
- `A/B = -(B/A)`;
- Diagonale unavailable;
- Beiträge summieren sich exakt zum Rohscore;
- normierter Score bleibt in [-2,+2];
- Missing reduziert Coverage und wird nicht zu 0;
- Mindestcoverage unterdrückt Ranking/Signal;
- gleicher Input und gleiche Version erzeugen identischen Snapshot.
