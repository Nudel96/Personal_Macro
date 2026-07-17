# Echte offene Fragen vor der Implementierung

Diese Punkte lassen sich weder aus dem Quellcode noch aus offiziellen technischen Dokumentationen zuverlässig ableiten. Sie blockieren nicht das Audit, aber einzelne Produktentscheidungen.

1. **Forecast/Consensus:** Soll die erste Version vollständig forecast-frei starten, oder möchtest du Consensuswerte manuell importieren bzw. einen bestimmten kostenlosen Drittanbieter zulassen? Ohne explizite Quelle bleibt die Surprise-Komponente leer.
2. **Seasonality-Universum:** Welche Assets außerhalb der 28 G8-FX-Paare haben für den ersten Release Priorität, und stehen dafür eigene lizenzierte Broker-/CSV-Historien bereit? Das bestimmt, welche Preisadapter zuerst nötig sind.
3. **COT-Primärsicht:** Welche Berichtsfamilie und Gruppe soll je Asset standardmäßig hervorgehoben werden (z. B. Legacy Non-Commercial für FX, TFF Leveraged Funds für Financials, Disaggregated Managed Money für Commodities)? Alle Daten können gespeichert werden; die Default-Interpretation ist eine persönliche Analyseentscheidung.
4. **Scoring-Präferenz:** Soll Macro-Scoring primär relative Currency Strength, zyklisches Wachstum/Inflation oder erwartete Zentralbankreaktion abbilden? Die Engine unterstützt Versionen, aber die Defaultgewichte benötigen deine Präferenz.
5. **Journal-Migration:** Existieren reale Trade-/Account-/Ritualdaten aus dem bisherigen Tool oder Brokerexporte, die beim ersten produktiven Schema zwingend verlustfrei migriert werden müssen?
6. **Datenschutz/Backup:** Reicht ein lokaler unverschlüsselter Datenordner mit OS-Dateirechten, oder soll Verschlüsselung/App-Sperre bereits in Phase 1 statt im späteren Hardening enthalten sein?

Empfohlene Defaults, falls keine andere Vorgabe erfolgt: forecast-freier Start; zuerst G8 FX + WTI/Gold über lokalen Import; quellen-/assetklassenspezifische COT-Defaults; zentralbankreaktionsorientiertes, aber gruppenbalanciertes Scoring; keine Altdatenmigration; lokale Backups mit OS-Schutz und spätere optionale Verschlüsselung.
