# Scoring-Modell v1: Currency Strength und Paarvergleich

## Verbindliche Vorgaben

Stand: 17. Juli 2026. Dieses Dokument konkretisiert die fachlichen Entscheidungen
aus dem Audit und die bereitgestellten UI-Referenzen. Es ist eine
Berechnungsspezifikation, kein Handelssignal und keine Prognose.

- Drittanbieter für Forecast-/Consensus-Daten sind erlaubt, aber nur über einen
  versionierten Adapter mit Quellenangabe, Lizenznotiz, Abrufzeit und Raw-Payload.
- Der Startumfang umfasst Fiat-Futures, Edelmetalle und ein konfigurierbares Set
  von 5–10 großen Kryptowerten.
- Der Currency-Strength-Score bewertet zunächst Fiatwährungen. Edelmetalle und
  Krypto erhalten nur Faktoren, für die echte assetbezogene Daten vorliegen.
- Macro-Releases werden in v1 ausschließlich über Actual gegen Forecast bewertet.
  Previous und ein revidierter Vorperiodenwert werden angezeigt und versioniert,
  beeinflussen den Macro-Score aber nicht.

## Asset-Universum

### Fiat und Fiat-Futures

Die Registry ist nicht auf harte Symbollisten begrenzt. Für den ersten
vollständigen Currency-Strength-Slice werden USD, EUR, GBP, JPY, CHF, AUD, CAD
und NZD mit ihren verfügbaren CFTC-Financial-Futures-Verträgen abgedeckt.
Weitere von CFTC geführte Fiat-Futures können nach validierter Quellen- und
Indikatorabdeckung über die Contract Registry aktiviert werden.

### Edelmetalle

Gold, Silber, Platin und Palladium erhalten COT- und Seasonality-Abdeckung.
Ihre Preis-, Kontrakt- und Kalenderdefinitionen bleiben jeweils getrennt;
Spot, Future und Continuous Contract dürfen nicht still vermischt werden.

### Kryptowährungen

Als anfängliche, frei konfigurierbare Auswahl sind BTC, ETH, SOL, XRP, BNB,
ADA, DOGE und AVAX vorgesehen. Die Liste ist kein dauerhaftes
Marktkapitalisierungsranking und kann auf fünf bis zehn Werte reduziert oder
erweitert werden.

Krypto besitzt keine nationale GDP-/CPI-/Arbeitsmarktserie. Daher werden nur
verfügbare eigene Faktoren (z. B. Seasonality und passende CFTC-Futures)
veröffentlicht. Ein nicht vorhandener Macro-Score bleibt unavailable, nicht
neutral.

## Eingangsdaten und Freigaberegeln

Jede wirtschaftliche Veröffentlichung besitzt unabhängig versionierte Felder:

| Feld | Bedeutung |
|---|---|
| Actual | veröffentlichter aktueller Wert mit Einheit und Veröffentlichungszeit |
| Forecast | vor der Veröffentlichung gültiger Konsens eines manuellen oder Drittanbieter-Feeds |
| Previous | bei Veröffentlichung angegebener Vorwert |
| Revised Previous | später bestätigter/revidierter Vorwert, falls vorhanden |

Ein Macro-Score ist nur zulässig, wenn Actual und Forecast numerisch,
einheitlich und zeitlich dem gleichen Referenzzeitraum zugeordnet sind. Ein
fehlender, widersprüchlicher oder stale Forecast erzeugt unavailable mit Reason
Code, keinen neutralen Wert und keinen Ersatz über Trend oder Momentum.

Der verwendete Forecast behält Anbieter, Abrufzeitpunkt, Lizenz-/Terms-Link und
Payload-Hash. Eine nachträgliche Änderung erzeugt eine neue Revision; bereits
gespeicherte Score-Snapshots bleiben unverändert.

## Binäre Release-Bewertung

Für jeden Indikator wird eine explizite Wirkungsrichtung hinterlegt:

    surprise = actual - forecast
    currency_signal = direction × sign(surprise)

Direction +1 bedeutet: ein höherer Wert ist für die betreffende Währung in
diesem Modell bullish. Direction -1 bedeutet: ein niedrigerer Wert ist bullish.
Das Ergebnis ist +1 (bullish), -1 (bearish) oder 0 bei exakter Gleichheit.
Unavailable ist ein eigener Zustand und mathematisch nicht 0.

Die Größe der Überraschung verändert in v1 nicht die Punktzahl. Sie bleibt als
Rohdifferenz und gegebenenfalls standardisierte Zusatzinformation sichtbar, um
Actual, Forecast und Surprise erklären zu können, ohne versteckte Gewichtung.

## Macro-Domänen und Richtungen

Die Indicator Registry bestimmt pro Währung, welche Reihen tatsächlich
verfügbar sind. Ein Indikator fehlt, wenn er nicht existiert oder keine valide
Veröffentlichung/Forecast-Kombination besitzt.

| Domäne | Standardindikatoren | Richtung in v1 |
|---|---|---|
| Growth | GDP (QoQ/YoY), Manufacturing PMI, Services PMI, Retail Sales, Consumer Confidence | höher ist bullish |
| Inflation | CPI, PPI, PCE, mit getrennten Varianten wie Headline/Core und YoY/MoM | höher ist bullish |
| Labour | NFP/Payrolls, ADP, JOLTS, Beschäftigung | höher ist bullish |
| Labour | Unemployment Rate, Initial/Continuing Jobless Claims | niedriger ist bullish |

Die Inflationsrichtung bildet bewusst die vorgegebene Score-Logik der
Referenzansicht ab. Ein späteres, regimeabhängiges Zentralbankmodell wäre eine
neue Scoring-Version und darf historische v1-Snapshots nicht umdeuten.

Policy-Rates, technische Trends und Crowd-Sentiment dürfen als Kontext sichtbar
sein, fließen aber nicht in den v1-Gesamtscore ein.

## Institutioneller COT-Bias

Der institutionelle Faktor wird je aktivem COT-Markt und konfigurierter
Trader-Gruppe aus drei transparenten Teilzeichen gebildet:

    position_signal = sign(net_pct_open_interest)
    change_signal   = sign(net_change_pct_open_interest)
    z_signal        = sign(rolling_zscore(net_pct_open_interest))
    cot_signal      = sign(position_signal + change_signal + z_signal)

Damit sind Long/Short, Netto-Positionierung, jüngste Käufe/Verkäufe und die
historische Einordnung über einen Z-Score sichtbar. Ein exakter Ausgleich
liefert 0; fehlende COT-Abdeckung liefert unavailable. Report-Familie und
Trader-Gruppe bleiben pro Asset konfigurierbar, etwa TFF Leveraged Funds für
Fiat-Futures und Disaggregated Managed Money für Edelmetalle.

## Seasonal Trend

Für Fiat wird zunächst eine Currency-Strength-Basket-Reihe aus aktiven
G10-Referenzkursen gebildet. Der Seasonal-Score ist das Vorzeichen der
historischen Durchschnittsrendite im konfigurierten Vorschaufenster; Standard
sind die nächsten vier Wochen mit abgeschlossenen Kalenderjahren und einer
Mindestanzahl valider Jahre. +1 bedeutet saisonal positiv, -1 negativ.
Niedrige Stichprobe oder unzureichende Qualität ergibt unavailable.

Für Edelmetalle und Krypto wird die Seasonality direkt auf der jeweiligen
Instrumentreihe berechnet. Sie darf nicht als Currency-Strength-Faktor für eine
Fiatwährung ausgegeben werden.

## Currency- und Pair-Matrix

Jede Fiatwährung erhält pro aktivem Einzelindikator sowie für COT und
Seasonality genau einen -1-, 0- oder +1-Wert. Der Paarvergleich folgt direkt
der gewünschten Base/Quote-Logik:

    pair_cell(base, quote, factor) = base_factor - quote_factor

Eine Zelle liegt damit zwischen -2 und +2.

| Base-Faktor | Quote-Faktor | Paarzelle |
|---:|---:|---:|
| +1 | -1 | +2, stark bullish für Base/Quote |
| +1 | +1 | 0, hebt sich auf |
| -1 | -1 | 0, hebt sich auf |
| -1 | +1 | -2, stark bearish für Base/Quote |

Beispiel AUD/CHF: liefert australisches GDP +1 und schweizerisches GDP -1,
beträgt die GDP-Zelle für AUD/CHF +2. Sind beide GDP-Signale gleich, ist die
Zelle 0.

Der sichtbare Rohscore eines Paars ist die Summe seiner verfügbaren Zellen.
Zusätzlich speichert die Anwendung den normierten Wert raw_score / (2 × n) und
coverage = n / enabled_factors. Ranglisten und starke Bias-Labels werden nur
oberhalb einer konfigurierbaren Mindestabdeckung veröffentlicht.

## Darstellung und Nachvollziehbarkeit

Die UI folgt dem Informationsaufbau der Referenzbilder: Currency-Drilldown mit
COT, Growth, Inflation, Labour und Seasonality sowie eine Matrix der
Base/Quote-Paare. Jede Zelle zeigt Zahl, Textlabel, Aktualität, Datenabdeckung
und einen Drilldown zu Actual/Forecast/Previous, Quelle und Revisionskette.

Blau/Rot/Grau dürfen die Richtung unterstützen, aber nie die einzige
Information sein. 0 wird als neutraler berechneter Gleichstand gezeigt;
unavailable erhält ein eigenes Symbol/Muster und Reason Code.

Jeder Snapshot speichert Scoring-Version, aktiven Asset-/Indicator-Satz,
Richtungsregel, COT-Konfiguration, Seasonality-Parameter und alle Input-IDs.
Dadurch kann eine historische Matrix jederzeit reproduziert werden.

## Nicht-Ziele von v1

- keine Vermischung von Actual-vs-Forecast mit Previous-vs-Actual;
- keine versteckten Trend-, Momentum-, Target- oder Magnitude-Gewichte;
- keine erfundenen Forecasts, Fake-Sentiment-Werte oder implizit neutralen
  Missing Values;
- keine Übertragung von Fiat-Macroindikatoren auf Edelmetalle oder Krypto;
- keine automatische Handelsausführung oder Anlageempfehlung.
