# Entscheidungen und verbleibende offene Fragen

## Entscheidet und in die Planung übernommen

1. **Forecast/Consensus:** Manuelle Imports und Drittanbieter sind zulässig. Der
   Adapter bleibt optional, versioniert und lizenz-/quellennachweisbar. Ohne
   validen Forecast erhält ein Macro-Event keinen Score; es wird nicht aus
   Previous, Trend oder Momentum ersetzt.
2. **Asset-Universum:** Fiat-Futures allgemein über eine aktivierbare
   Contract-Registry, dazu Gold, Silber, Platin und Palladium sowie ein
   konfigurierbares Set von fünf bis zehn großen Kryptowerten. Der erste
   Currency-Strength-Slice ist USD, EUR, GBP, JPY, CHF, AUD, CAD und NZD.
3. **Scoring:** Relative Currency Strength über COT, Growth, Inflation, Labour
   und Seasonality. Jeder Macro-Release ist in v1 ausschließlich bullish,
   bearish oder bei Gleichheit neutral aus Actual gegen Forecast. Der
   Paarvergleich ist immer Base minus Quote und ergibt pro Faktor -2 bis +2.

Die vollständige Berechnungs-, Coverage- und Darstellungsregel steht in
[scoring-model-v1.md](scoring-model-v1.md).

## Noch zu entscheiden, aber kein Blocker für das Fundament

1. **COT-Primärsicht:** Welche Berichtsfamilie und Trader-Gruppe soll je Asset
   standardmäßig hervorgehoben werden? Vorgeschlagener konfigurierbarer Default:
   TFF Leveraged Funds für Fiat-Futures, Disaggregated Managed Money für
   Edelmetalle.
2. **Technik, Zinsen und Crowd-Sentiment:** Die Referenzbilder zeigen diese
   Kontextfelder, die beschriebene v1-Logik umfasst jedoch nur COT, Growth,
   Inflation, Labour und Seasonality. Sie bleiben daher außerhalb des v1-Total
   Scores, bis du sie ausdrücklich aktivierst.
3. **Journal-Migration:** Existieren reale Trade-/Account-/Ritualdaten oder
   Brokerexporte, die beim ersten produktiven Schema verlustfrei migriert
   werden müssen?
4. **Datenschutz/Backup:** Reicht zunächst ein lokaler Datenordner mit
   OS-Dateirechten, oder soll Verschlüsselung/App-Sperre bereits in Phase 1
   enthalten sein?

## Arbeitsdefaults

Der Kern nutzt offizielle Datenquellen. Forecasts können zusätzlich manuell
oder von zugelassenen Drittanbietern kommen. Fehlende, stale oder unpassende
Daten reduzieren Coverage und bleiben sichtbar; sie werden nie als neutral
oder als künstliches Signal in eine Pair-Matrix übernommen.
