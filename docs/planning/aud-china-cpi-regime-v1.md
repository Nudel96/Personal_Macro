# AUD–China-CPI-Regime v1

## Ziel

Der erste Treiber unter `/regime-insights` untersucht den langfristigen
Zusammenhang zwischen China CPI YoY und dem Australian Dollar. Das Modell ist
eine empirische Kontextanalyse und keine automatische Handelsempfehlung. Es
verändert weder die fundamentale Pair-Heatmap noch bestehende Currency-Scores.

## Datenquellen

- Makro: provider-native China-Releases aus `eodhd_events`, verbunden über die
  explizite Reihe `CNY / cpi_yoy` in `eodhd_indicator_series`.
- Markt: EODHD-D1-OHLC aus `seasonality_provider_daily_candles` für
  `AUDUSD.FOREX`.
- Der Markt wird in der UI als `AUDUSD Spot-Proxy` bezeichnet. Er ist kein
  rollbereinigter kontinuierlicher CME-6A-Future und enthält neben AUD- auch
  USD-Einflüsse.
- EODHD liefert für diesen Pfad keine vollständige historische
  Point-in-Time-Vintage-Datenbank. Frühere CPI-Werte können deshalb den heute
  bekannten Revisionsstand enthalten.

## Regimeklassifikation

Die Klassifikation verwendet ausschließlich chronologisch verfügbare
CPI-Actuals:

```text
change_1m = CPI(t) - CPI(t-1)
momentum_3m = CPI(t) - CPI(t-3)
slope_6m = lineare Steigung der letzten bis zu sechs Releases
```

Mindestens vier Releases sind nötig. Für die letzten drei Veränderungen wird
außerdem die Anzahl nicht steigender beziehungsweise nicht fallender Werte
gezählt.

```text
falling:
  momentum_3m <= -0,10 Prozentpunkte
  slope_6m <= -0,02 Prozentpunkte je Release
  mindestens 2 der letzten 3 Veränderungen <= 0

rising:
  momentum_3m >= +0,10 Prozentpunkte
  slope_6m >= +0,02 Prozentpunkte je Release
  mindestens 2 der letzten 3 Veränderungen >= 0

sonst:
  transition
```

Vor der vierten Beobachtung lautet der Zustand `unavailable`.

## Zeitliche Aktivierung

Ein Release darf nicht rückwirkend auf seine Berichtsperiode wirken. Der neue
Zustand beginnt konservativ am **nächsten AUDUSD-Handelstag nach dem
Veröffentlichungsdatum**. Der Open dieses Bars ist der Startpreis für eine neue
Regimeepisode. Dadurch wird auch dann kein Same-Day-Look-ahead eingeführt, wenn
die genaue Handelssession des provider-nativen Tagesbars nicht bekannt ist.

W1-Kerzen werden deterministisch aus den gespeicherten D1-Bars aggregiert:

```text
Open  = erster Open der ISO-Woche
High  = höchstes High der ISO-Woche
Low   = tiefstes Low der ISO-Woche
Close = letzter Close der ISO-Woche
```

## Historische Marktvalidierung

Eine Stichprobe entspricht dem Beginn einer zusammenhängenden Regimeepisode,
nicht jedem monatlichen Release innerhalb derselben Phase. Das reduziert
überlappende und künstlich aufgeblähte Beobachtungen.

Ausgewertet werden 1, 4, 8 und 12 Wochen beziehungsweise 5, 20, 40 und 60
Handelstage:

```text
forward_return = end_close / start_open - 1
MFE = max(highs) / start_open - 1
MAE = min(lows) / start_open - 1
```

Pro Zustand und Horizont werden Mittelwert, Median, positive Trefferquote,
P25, P75, durchschnittliche MFE, durchschnittliche MAE und Stichprobengröße
geliefert.

Eine AUD-Wirkungsrichtung wird erst ab fünf unabhängigen Regimeanfängen
vergeben:

```text
bullish:
  12W-Median >= +0,25 % und positive Trefferquote >= 55 %

bearish:
  12W-Median <= -0,25 % und positive Trefferquote <= 45 %

sonst:
  mixed
```

Unter fünf Beobachtungen bleibt der AUD-Kontext `unavailable`. Die
Konfidenzstufen sind niedrig ab 5, mittel ab 7 und hoch ab 12 Beobachtungen.

## Qualitätsstatus

- `unavailable`: weniger als vier CPI-Releases oder keine AUDUSD-D1-Historie.
- `available`: mindestens zehn gemeinsame Jahre und mindestens acht
  gerichtete Regimeepisoden.
- `exploratory`: Berechnung möglich, aber mindestens eine dieser
  Qualitätsgrenzen ist noch nicht erreicht.

Fehlende Werte werden nie zu Null oder neutraler Evidenz umgedeutet. Revisions-
und Proxy-Einschränkungen bleiben dauerhaft in der Oberfläche sichtbar.

## Tests

Die deterministischen Tests decken mindestens ab:

- fallende und steigende CPI-Phasen,
- widersprüchliches Momentum als Übergang,
- Aktivierung erst am nächsten Handelstag,
- korrekte W1-OHLC-Aggregation,
- Forward Return, MFE und MAE aus Open/High/Low/Close,
- den vollständigen SQL-Vertrag auf einer frisch migrierten temporären
  SQLite-Datenbank,
- OHLC-Reihenfolge und CPI-Fortschreibung im ECharts-Vertrag,
- getrennte Darstellung von Makrozustand und empirischem AUD-Bias.
