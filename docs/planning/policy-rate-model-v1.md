# Leitzins-Modell v1: Erwartung, Entscheidung und USD-Relativwirkung

## Zweck

Leitzinsen bilden eine eigene Heatmap-Domäne neben COT, Growth, Inflation,
Labour und Seasonality. Sie werden nicht in Inflation oder Growth versteckt.
Die Darstellung beantwortet zwei getrennte Fragen:

1. Welche nächste Leitzinsentscheidung und welcher Zielzins werden für jede
   aktive Währung erwartet?
2. Wie wirksam ist eine erwartete oder beschlossene US-Zinsänderung relativ zu
   den erwarteten Entscheidungen anderer Zentralbanken?

## Eingaben je Zentralbank

| Feld | Beschreibung |
|---|---|
| current_target_rate | aktuell bestätigter Leitzins aus offizieller Zentralbankquelle |
| next_decision_at | nächster geplanter Entscheidungszeitpunkt in UTC und Originalzeitzone |
| expected_target_rate | Konsenszielzins für den nächsten Termin aus Forecast-Adapter oder manuellem Import |
| expected_delta_bps | expected_target_rate minus current_target_rate in Basispunkten |
| actual_target_rate | nach dem Entscheid offiziell veröffentlichter Zielzins |
| decision_surprise_bps | actual_target_rate minus expected_target_rate |
| provider_snapshot_at | Zeitpunkt, zu dem der verwendete Forecast vorlag |
| quality_status | fresh, stale, failed, conflict oder unavailable |

Aktueller Zins und Entscheidungsdatum können ohne Forecast angezeigt werden.
Eine erwartete Zinsrichtung oder ein Rate-Score wird jedoch nur mit einem
validen expected_target_rate gebildet.

## Scoring für alle Fiatwährungen

Vor dem Zentralbanktermin lautet das erwartete Stance-Signal:

    expected_stance = sign(expected_delta_bps)

Nach der Entscheidung entsteht zusätzlich das Surprise-Signal:

    decision_surprise = sign(decision_surprise_bps)

Ein höherer tatsächlicher Zielzins als erwartet ist +1, ein niedrigerer -1.
Ein unveränderter Zins ist nur dann neutral, wenn er auch erwartet wurde. Die
UI zeigt Erwartung und Überraschung als getrennte Zeilen, damit eine erwartete
Erhöhung nicht mit einer unerwarteten Entscheidung doppelt gezählt wird.

Der Rate-Bereich einer Währung verwendet eine konfigurierte, dokumentierte
Kombination dieser getrennten Signale. Die Default-Version zeigt beide Werte
und nutzt für den Vorabvergleich expected_stance; nach dem Termin ersetzt
decision_surprise das Ereignisfenster nicht dauerhaft, sondern bleibt als
versionierter Release-Faktor sichtbar.

## USD-Relativwirkung gegenüber anderen Zentralbanken

Eine US-Erhöhung oder ein US-Hold ist nicht isoliert aussagekräftig. Daher
berechnet das System zusätzlich eine relative Fed-Stance gegen den abgedeckten
ausländischen Zentralbankkorb:

    foreign_pressure_bps =
        weighted_mean(expected_delta_bps of covered non-USD central banks)

    usd_relative_stance_bps =
        usd_expected_delta_bps - foreign_pressure_bps

    usd_relative_signal = sign(usd_relative_stance_bps)

Der anfängliche Korb umfasst ECB, BoE, BoJ, SNB, BoC, RBA und RBNZ. Er wird in
der Konfiguration geführt, enthält nur frische valide Forecasts und schließt
die Fed selbst aus. Die UI zeigt zusätzlich die Anzahl abgedeckter Banken sowie
Anteil erwarteter Hikes, Holds und Cuts.

Beispiele:

| Erwartung Fed | Auslandskorb | USD-Relativsignal | Aussage |
|---:|---:|---:|---|
| +25 bp | +25 bp im Mittel | 0 | US-Hike ist relativ nicht restriktiver |
| +25 bp | 0 bp im Mittel | +1 | US wird relativ restriktiver |
| 0 bp | +25 bp im Mittel | -1 | US-Hold ist relativ weniger restriktiv |
| 0 bp | -25 bp im Mittel | +1 | US-Hold ist relativ restriktiver |

Damit schwächt eine breite ausländische Straffung die Aussagekraft einer
US-Erhöhung automatisch ab, ohne sie fälschlich als bearish umzudrehen.

Nach einer Fed-Entscheidung wird dieselbe relative Logik zusätzlich mit dem
tatsächlichen US-Entscheid und den zu diesem Zeitpunkt eingefrorenen
Auslandserwartungen als historischer Snapshot gespeichert.

## Pair-Matrix

Der Leitzinsbereich wird als eigene Kategorie in die Pair-Matrix aufgenommen.
Die erwartete Zeile folgt derselben Regel wie alle anderen Faktoren:

    pair_rate_expectation = base_expected_stance - quote_expected_stance

Für USD verwendet die Matrix standardmäßig usd_relative_signal statt des
isolierten Fed-expected_stance. So ist sichtbar, ob der Dollar gegenüber dem
abgedeckten Auslandskorb tatsächlich relativ restriktiver oder expansiver ist.

Ein fehlender Forecast ist unavailable und nicht 0. Eine Rate-Zelle enthält
immer Forecastzeitpunkt, aktueller Leitzins, erwarteter Zielzins, erwartete
Änderung, Datenabdeckung und Quellenkette.

## Daten- und Qualitätsregeln

- Aktuelle Leitzinsen und Entscheidungen: offizielle Zentralbanken.
- Erwartungen: manueller Import oder aktivierter, lizenzierter Forecast-Adapter.
- Der letzte Forecast vor dem Termin wird eingefroren; spätere Korrekturen
  überschreiben keinen historischen Surprise-Score.
- Konflikte zwischen mehreren Forecast-Anbietern unterdrücken den Score, bis
  eine eindeutige Priorität besteht.
- Der Begriff global bezeichnet in der UI stets den abgedeckten
  Zentralbankkorb, nie unbelegte weltweite Vollständigkeit.
- Änderungen an Korb, Gewichtung oder Formel erzeugen eine neue Scoring-Version.

## Nicht-Ziele

- Keine Aussage über den absoluten „richtigen“ Zins.
- Keine Vermischung mit Renditekurve, Staatsanleiherenditen oder technischen
  Marktpreisen; diese können später als getrennte Faktoren ergänzt werden.
- Keine automatische Handelsentscheidung.
