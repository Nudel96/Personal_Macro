# Audit der Berechnungslogik

## Bewertungsmaßstab

Jede Berechnung wurde auf Definition, Eingabequalität, Zeit-/Kalenderbezug, Reproduzierbarkeit, Stichprobendesign und Fehlerverhalten geprüft. „Übernehmen“ bedeutet: als fachliche Vorlage neu kapseln und mit Fixtures/Property Tests absichern, nicht blind kopieren.

## Seasonality

### Vorhandene Formeln

- Forward Return über `h` Bars: `r(t,h) = close[t+h] / close[t] - 1`.
- Bucket-Mittel: arithmetisches Mittel aller Forward Returns eines Monats/ISO-Woche/Wochentags/Kalendertags.
- Median: mittleres Element bzw. Mittel der beiden mittleren Elemente.
- Standardabweichung: Stichprobenstandardabweichung mit Nenner `n-1`.
- Downside-Abweichung: Quadratwurzel des Mittels der quadrierten negativen Returns; hier wird nur durch die Zahl negativer Samples geteilt.
- Hit Rate: `count(r > 0) / n`; exakt null gilt nicht als Treffer.
- Payoff Ratio: `mean(positive returns) / abs(mean(negative returns))`.
- 95%-CI: `mean ± 1.96 * sample_std / sqrt(n)`.
- Saisonkurve je Jahr: `close[d] / close[first trading day] - 1`; danach arithmetisches Mittel je Handelstagindex.
- Period Return: `close[endIndex] / close[startIndex] - 1` je Jahr.
- Approximate annualized return: `avg_return * 252 / periodDays`.

### Befunde

1. **Überlappende Samples:** Für einen 20-Bar-Horizont werden täglich stark überlappende Forward Returns erzeugt. `n`, Standardfehler, CI und Signifikanz behandeln sie fälschlich wie unabhängige Beobachtungen.
2. **Monatssemantik:** Ein Monatsbucket enthält Returns, die an jedem Tag dieses Monats starten; er misst nicht die Rendite vom Monatsanfang bis Monatsende. Drilldown mittelt diese täglichen Forward Returns nochmals je Jahr.
3. **Aktuelles unvollständiges Jahr:** Die Jahreskurve nimmt jedes Jahr mit mindestens 20 Bars auf, einschließlich des laufenden Teiljahres. Spätere Handelstagsindizes basieren dann auf weniger Jahren; `n` je Punkt wird nicht angezeigt.
4. **Kalenderausrichtung:** Jahreskurven werden nach dem 1., 2., … Handelstag ausgerichtet. Feiertage, 24/7-Krypto, Leap Years und unterschiedliche Börsenkalender verschieben reale Kalendertage gegeneinander.
5. **Template-Datum:** Monatslabels stammen aus dem ersten historischen Jahr und werden auf alle Jahre übertragen; dadurch kann ein Index im Durchschnitt einem anderen Kalenderdatum entsprechen.
6. **ISO-Woche 53 fehlt:** Erwartete Buckets enden bei 52.
7. **Zeitzone:** `new Date('YYYY-MM-DD')` und lokale Getter vermischen UTC-Parsing und lokale Kalenderlogik. Das Ergebnis ist abhängig von Laufzeitzeitzone.
8. **Lookback:** Cutoff = „heute minus 365,25 Tage × Jahre“ erzeugt Teiljahre statt sauber abgeschlossener Kalenderjahre.
9. **Normal-CI:** `z=1.96` ist bei kleinen, schiefen saisonalen Stichproben ungeeignet; die separate Signifikanzheuristik verwendet weitere nicht versionierte Schwellen.
10. **Annualisierung:** lineare Annualisierung statt geometrischem Compounding; bei Jahreswechsel ist `abs(end-start)+1` nicht die tatsächliche Fensterlänge.
11. **Cumulative profit:** Jahresreturns werden addiert statt geometrisch verkettet.
12. **Datenqualität:** keine Adjusted/Unadjusted-Kennung, Duplikat-/Gap-Prüfung, Kalender-ID, Source-Version oder Mindestabdeckung pro Bucket.

### Zielmethodik

- Explizite Analysearten: Kalenderperiodenreturn, nichtüberlappendes Forward Window und rollendes/überlappendes Research Window getrennt ausweisen.
- Standardmäßig nur abgeschlossene Jahre in historische Schätzung; laufendes Jahr separat als Vergleich.
- Börsen-/Assetkalender und IANA-Zeitzone pro Instrument; 24/7-Kalender für Krypto.
- Kurven auf Month-Day/Session-Position oder 366-Tage-Normalachse mit transparenter Leap-Day-Regel ausrichten.
- Arithmetic und Log Return als versionierte Option; kumulierte Kurven geometrisch.
- Median, Std, MAD/Quantile, Best/Worst Year, Hit Rate, Sample Count und Coverage pro Punkt/Bucket.
- CI vorzugsweise per Bootstrap auf unabhängigen Jahresreturns; bei zu kleinem `n` keine Signalwertung.
- Mindestqualität: vollständige Quellhistorie, keine ungeklärten Gaps, ausreichend unabhängige Jahre, aktueller Datenstand.

## COT

### Vorhandene Formeln

- Net: `long - short`.
- Net Change: `long_change - short_change`.
- Long/Short/Net % OI: jeweilige Position geteilt durch `open_interest` (als Anteil 0–1).
- Rolling Z-Score: `(current - mean(window)) / population_std(window)` mit `window = 52 × {3,5,10}` Wochen.
- Extreme Long/Short: Z-Score ≥ 2 bzw. ≤ -2.
- Transition: `abs(netChange-globalMean)/globalStd ≥ 1.5` und `abs(z) ≥ 1`.
- Crowding: bis 40 Punkte aus `abs(z)/3`, 35 aus absolutem 4-Wochen-Momentum relativ zu dessen 95. Perzentil und 25 aus absoluter Momentum-Beschleunigung relativ zu deren 95. Perzentil.
- Ausreißer: Net Change außerhalb `Q1 - 1.5×IQR` bzw. `Q3 + 1.5×IQR` über die komplette geladene Serie.
- Perzentil: Anteil historischer Werte strikt kleiner als aktuell, geteilt durch `n-1`.
- Economic-Kurzcache: Long % = `long / (long + short)`; Bullish ab 55 %, bearish bis 45 %. Nonreportables werden konträr interpretiert.

### Befunde

1. Parser setzt fehlende/ungültige Zahlen auf `0`; echte Null und fehlender Wert sind nicht unterscheidbar.
2. `publish_date` bleibt immer `null`; Report Date (Dienstag) und Release Date (normalerweise Freitag) werden nicht getrennt.
3. Z-Score-Fenstertypen sind inkonsistent: UI/API akzeptiert auch 2 Jahre, die Analytics-Typdefinition nur 3/5/10.
4. `zscore_net` wird nie berechnet, nur `zscore_net_pct_oi`.
5. Regime-Transition nutzt Mean/Std über die gesamte geladene Serie, nicht das gewählte rollierende Fenster; Ergebnis hängt vom API-Lookback/Fetchlimit ab.
6. Crowding verwendet absolute Richtung für Momentum/Beschleunigung und verliert den Kontext Long vs. Short.
7. Perzentilbehandlung bei Gleichständen und Nenner `n-1` sind nicht dokumentiert; das aktuelle Element bleibt im `belowCount`-Array.
8. Statische 55/45-Prozentwerte messen den Anteil an Long+Short, nicht historische Extremität oder OI-normalisierte Netto-Position.
9. USD-Index und einzelne FX-Futures sind nicht symmetrisch vergleichbar; Contract Units und Roll-/Klassifikationsänderungen fehlen.
10. CFTC liefert offizielle Prozentfelder und umfangreiche Metadaten, die nicht vollständig übernommen werden.

### Zielmethodik

- Raw Row unverändert speichern; nullable Parsing mit Quarantäne statt Nullersatz.
- Eindeutiger Schlüssel aus Dataset, Report Date, Contract Market Code, Scope und ggf. Submarket; Source Row Hash.
- Net/Brutto/%OI, 1/4/13/26-Wochen-Changes, rollierende Z-Scores und empirische Perzentile als versionierte Derived Metrics.
- Fenster in Wochen und Mindestbeobachtungen explizit; Sample vs. Population Std dokumentieren.
- Regime/Extremzonen konfigurierbar und mit Reason Codes; keine pauschale Handelsempfehlung.
- Release-Freshness, erwartetes nächstes Release, Datenlücken und CFTC-Sonderhinweise anzeigen.

## Macro-Heatmap und Scoring

### Vorhandene Formeln

- Parser entfernt `%`, `K`, `M`, `B`, `<`, `>` und skaliert K/M/B.
- Surprise: `actual - forecast` in Roh-Einheit.
- Neutral, wenn `abs(surprise) < 0.01`.
- Wachstum/Inflation: positive Surprise → Currency Bullish; inverse Arbeitsmarktindikatoren: positive Surprise → Bearish.
- Currency Score: reine Anzahl bullish, bearish, neutral; `bullishPct = bullish / total`.

### Befunde

1. Ein universeller Rohwert-Schwellenwert `0.01` ist über Prozentpunkte, Indexpunkte, Tausend Jobs und Milliardenbeträge dimensionswidrig.
2. Scores gewichten alle Indikatoren gleich, unabhängig von Impact, Aktualität, Frequenz, Datenqualität und Korrelation.
3. Inflation wird immer „höher = bullish“ bewertet; Regime, Zielabweichung, Basiseffekte und Wachstums-/Risk-Off-Kontext fehlen.
4. Keine Trends, langfristigen Z-Scores, Revisionen, Gruppen-Scores, Zinsdifferenzen oder Score-Historie.
5. Leere Forecast-/Actual-Werte werden neutral statt „nicht bewertbar“; Skeletons erhöhen visuell die Neutralität.
6. `parseFloat(value) || null`-Muster in manueller Seedlogik behandelt echte 0 als fehlend.
7. Eventdatum enthält kein Jahr im Scrape; Parser hardcodiert 2026. Jahreswechsel und Terminverschiebungen sind fehlerhaft.
8. Kein stabiler Eventschlüssel, keine Reference Period, Einheit oder Seasonal-Adjustment-Kennung.
9. Forecast-Konsens stammt aus einer Drittseite, nicht aus der offiziellen Statistikquelle.
10. Simuliertes Retail-Sentiment ist erfunden und verletzt die zentrale Anforderung, fehlende Daten nicht unbemerkt zu schätzen.

### Vorgeschlagene Score-Formel v1

Pro Observation werden getrennte Komponenten berechnet:

```text
surprise_component = direction(regime) × clip((actual - forecast) / historical_surprise_scale, -3, 3)
trend_component    = direction × clip(zscore(transformed_value, rolling_window), -3, 3)
momentum_component = direction × clip(zscore(latest_change, rolling_changes), -3, 3)
target_component   = regime_function(value, policy_target, growth_context)
raw_indicator      = weighted_mean(available components)
quality_multiplier = freshness × source_quality × revision_status × coverage
indicator_score    = 100/3 × raw_indicator × quality_multiplier
```

- `direction`, Transformation, Fenster, Komponenten- und Gruppengewichte liegen in einer versionierten Indicator-Definition.
- Forecast fehlt → Surprise-Komponente `null`, nicht 0; Trend/Target können weiterhin mit reduzierter Coverage rechnen.
- Quality Gate schlägt fehl → kein positiver/negativer Score, sondern `unavailable/stale`.
- Gruppen- und Währungsscore sind gewichtete Mittel nur verfügbarer, qualifizierter Inputs; Coverage und effektives Gewicht werden angezeigt.
- Score Snapshot speichert Rohwerte, Transformationsparameter, Komponenten, Gewicht, Version und Reason Codes.

## Journal

### Vorhandene Formeln

- Win Rate: Wins / alle geschlossenen Trades; Breakevens bleiben im Nenner.
- Profit Factor: Gross Profit / abs(Gross Loss); ohne Verlust und mit Gewinn `Infinity`.
- Expectancy in Geld: `winRate×avgWin - lossRate×avgLoss`; Breakevens reduzieren beide Raten.
- Average R: Mittel gespeicherter `rMultiple`.
- Drawdown: Peak minus kumulierter PnL; Peak startet bei 0.
- Drawdown %: `maxDrawdown / maximaler kumulierter PnL`.
- Sharpe/Sortino: durchschnittlicher Trade-PnL geteilt durch Std/Downside Dev von Trade-PnL; keine Zeit- oder Return-Normalisierung.
- Calmar/Recovery: Total PnL / Max Drawdown.
- Kelly: `winRate - (1-winRate)/payoffRatio`.
- Haltedauer: Differenz Exit/Entry in Minuten.

### Befunde

1. Drawdown-Prozent ist falsch, wenn das Startkapital nicht einbezogen wird; vor erstem neuen Gewinn kann Peak 0 bleiben.
2. Unterschiedliche Accounts/Währungen werden ohne FX-Konvertierung aggregiert.
3. Fees/Commission/Swap fehlen oder werden nur implizit in PnL erwartet.
4. Gespeichertes R wird nicht aus initialem Risiko, Stop und Size nachvollziehbar rekonstruiert.
5. Sharpe, Sortino und Calmar auf Trade-PnL-Beträgen sind nicht zwischen Konten/Positionsgrößen vergleichbar und nicht annualisiert.
6. Open Trades sind sinnvoll ausgeschlossen, aber Teil-Exits, Scale-ins, Deposits/Withdrawals und Equity Snapshots fehlen.
7. `Infinity` ist für JSON/UI/Export problematisch; Status „kein Verlust im Fenster“ ist semantisch besser.
8. Keine Confidence/Minimum-Sample-Regeln für Gruppenperformance.

### Zielmethodik

- PnL gross/net, Fees, Financing und FX Conversion getrennt speichern.
- Initial Risk in Geld und Prozent als unveränderlichen Entry Snapshot speichern; `R = net_pnl / initial_risk_amount`.
- Equity aus Startbalance + Cashflows + Net PnL; Drawdown in Geld und Prozent relativ zum jeweiligen High-Water Mark.
- Geld-Expectancy und R-Expectancy getrennt.
- Risikoadjustierte Kennzahlen nur aus periodischen Account Returns mit dokumentierter Frequenz/Risk-free-Annahme; sonst nicht anzeigen.
- Alle Aggregationen mit `n`, Zeitraum, Account/Strategy/Timezone und Definition Version.

## Pflicht-Tests für die Neuentwicklung

- Goldene Fixtures für jede CFTC-Berichtsfamilie und Scope.
- Missing vs. zero, negative/positive Direction, Ties, konstante Serie, Window Edge Cases.
- Leap Day, ISO-Woche 53, DST, Feiertage, 24/7-Asset, Jahreswechsel und unvollständiges Jahr.
- Non-overlap/overlap Seasonality mit handgerechneten Mini-Serien.
- Macro Surprise mit Einheiten, Revisionen, fehlendem Forecast und Regimewechsel.
- Scoreaggregation mit fehlenden/stalen Inputs und Weight Renormalization.
- Event-Deduplizierung, Terminverschiebung, Actual-Ergänzung und Revisionshistorie.
- Journal mit Fees, Short/Long, Teilverlust, Breakeven, Multi-Account, Cashflow, Drawdown und Streaks.
