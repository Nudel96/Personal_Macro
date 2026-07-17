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
4. **Leitzinsen:** Eigene Domäne mit aktuellem Zielzins, nächstem Termin,
   erwartetem Zielzins und Rate Surprise. Für USD wird die erwartete bzw.
   tatsächliche Fed-Änderung gegen den abgedeckten ausländischen
   Zentralbankkorb relativiert.
5. **Journal:** Das Tool startet mit einem sauberen, neuen Journal. Es ist
   keine Migration aus dem Referenzsystem oder bestehenden Brokerexporten
   erforderlich.
6. **Datenschutz:** Ausschließliche Einzelnutzung. Es gibt keine Anmeldung,
   Benutzerverwaltung oder Cloud-Synchronisierung; lokale OS-Dateirechte sind
   der Startschutz, optionale Verschlüsselung bleibt später möglich.

Die vollständige Berechnungs-, Coverage- und Darstellungsregel steht in
[scoring-model-v1.md](scoring-model-v1.md) und
[policy-rate-model-v1.md](policy-rate-model-v1.md).

## Noch zu entscheiden, aber kein Blocker für das Fundament

1. **COT-Primärsicht:** Welche Berichtsfamilie und Trader-Gruppe soll je Asset
   standardmäßig hervorgehoben werden? Vorgeschlagener konfigurierbarer Default:
   TFF Leveraged Funds für Fiat-Futures, Disaggregated Managed Money für
   Edelmetalle.
2. **Technik, Zinsen und Crowd-Sentiment:** Die Referenzbilder zeigen diese
   Kontextfelder. Leitzinsen sind jetzt eine eigene v1-Domäne. Technische
   Trends und Crowd-Sentiment bleiben außerhalb des v1-Total-Scores, bis du
   sie ausdrücklich aktivierst.

## Arbeitsdefaults

Der Kern nutzt offizielle Datenquellen. Forecasts können zusätzlich manuell
oder von zugelassenen Drittanbietern kommen. Fehlende, stale oder unpassende
Daten reduzieren Coverage und bleiben sichtbar; sie werden nie als neutral
oder als künstliches Signal in eine Pair-Matrix übernommen.
