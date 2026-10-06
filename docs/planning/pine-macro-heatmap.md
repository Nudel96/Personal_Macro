# Personal Macro für TradingView – Plan und Berechnungsvertrag

Stand: 02.10.2026. Auftrag: erst planen, danach ein eigenständiges Pine-v6-Skript
programmieren und seine Berechnungen prüfen. Die Desktop-Anwendung bleibt eine
eigene Anwendung; dieses Skript verwendet TradingView-Daten.

## 1. Lieferumfang und Arbeitsreihenfolge

1. Datenzugriffe, Zeitverhalten und Abfragebudget festlegen (dieses Dokument).
2. Ein eigenständiges Skript unter `apps/desktop/tradingview/` erstellen.
3. Deutsche Anleitung, Quellenverzeichnis und konkrete Rechenbeispiele ergänzen.
4. Deterministische Tests direkt gegen ausführbare Rechenfunktionen des Skripts
   sowie Struktur-/Budgetprüfungen ausführen.
5. Im echten TradingView-Pine-Editor kompilieren und, soweit die vorhandene
   Anmeldung dies erlaubt, mit realen Daten ausführen. Ein lokaler Test ersetzt
   diese Plattformprüfung nicht. Grenzen ausdrücklich protokollieren.

## 2. Ein Skript mit begrenzbaren Modulen

- Währungsübersicht und vollständige Base-/Quote-Matrix.
- G8: USD, EUR, GBP, JPY, CHF, CAD, AUD, NZD. CNY optional und ausdrücklich
  getrennt von CNH.
- Basisprofil: BIP YoY, Inflation YoY, Arbeitslosenquote, Leitzins.
- Erweitertes Profil: zusätzlich Industrieproduktion YoY und Einzelhandel YoY.
- Zwei Rechenmodi: automatische Veränderung gegenüber dem vorherigen
  Quellenpunkt oder manuelle Actual-/Forecast-Überraschung.
- Detailansicht eines ausgewählten Paares mit Kennzahlen, Rohwerten und
  Verfügbarkeit.
- Für dieses Paar optional COT, H4-/D1-Trend und Monats-Saisonalität. Sie
  verändern den Macro-Score nicht.
- Drei Ansichten und einstellbare Schriftgröße, feste Navy-/Rot-/Grün-Palette;
  keine Brokeranbindung oder Orders.

Die erste Version ist ein Tages-Dashboard für normale 1D-Charts. Dadurch sind
Wirtschaftsbeobachtungen nicht vom Minuten-Historienlimit abhängig. Auswertungsstand
ist der letzte abgeschlossene Charttag. Andere Zeitrahmen oder synthetische
Charttypen werden mit einer klaren Meldung abgewiesen.

## 3. Daten und Grenzen

| Bereich | Zugriff | Bedeutung |
|---|---|---|
| Wirtschaft | `request.economic(country, field, gaps_on)` | Veröffentlichte TradingView-Zeitreihe, kein Kalender-Forecast |
| COT | Offizielle LibraryCOT für Ticker, eigene `request.security`-Abrufe | Legacy Noncommercial, Futures ohne Optionen |
| Charttrend | Gewähltes Forex-Symbol, H4 und D1 | Nur abgeschlossene Daten bis zum Auswertungsstand |
| Saisonalität | Dasselbe Symbol, Monatskerzen | Ausschließlich vollständige frühere Kalenderjahre |
| Manuelle Releases | Leeres Textfeld mit dokumentiertem Zeilenformat | Vom Benutzer bereitgestellte Actual-/Forecast-Werte |

Wirtschaftsfelder: `GDPYY`, `IRYY`, `UR`, `INTR`, optional `IPYY`, `RSYY`.
Länder: US, EU, GB, JP, CH, CA, AU, NZ, optional CN. EU steht für den Euroraum.
Fehlende Länder-/Feldkombinationen bleiben nicht verfügbar.

TradingViews Wirtschaftszeitachse ist kein Nachweis des amtlichen
Veröffentlichungszeitpunkts. Datumsangaben heißen daher Beobachtungs-/Quellenstand.
Revisionen der Anbieter können historische Ergebnisse verändern. Es wird kein
revisionssicherer Echtzeit-Backtest versprochen.

## 4. Abfragebudget

Die Zahl wird vor dem ersten Datenabruf aus den aktivierten Modulen berechnet.
Ungültige Einstellungen enden mit einer verständlichen Fehlermeldung.

| Konfiguration | Wirtschaft | COT maximal | Trend | Saison | Gesamt |
|---|---:|---:|---:|---:|---:|
| G8 Basis, alles aktiv | 32 | 4 | 2 | 1 | 39 |
| G9 Basis, alles aktiv | 36 | 4 | 2 | 1 | 43 |
| G8 erweitert, alles aktiv | 48 | 4 | 2 | 1 | 55 |
| G9 erweitert, alles aktiv | 54 | 4 | 2 | 1 | 61 |
| Manuelle Releases, alles aktiv | 0 | 4 | 2 | 1 | 7 |

Standard: 40 Abfragen. 64 ist eine ausdrückliche Ultimate-Einstellung.
Das Skript erkennt den gebuchten Tarif nicht. Fehlende COT-Zuordnungen führen
zu weniger tatsächlichen Abrufen; die Budgetprüfung bleibt konservativ.

## 5. Automatischer Macro-Trend

Für zwei aufeinanderfolgende verfügbare Quellenpunkte derselben Reihe:

`delta = aktuell - vorher`

`signal = sign(delta * richtung)`, Ergebnis -1, 0 oder +1.

- BIP, Industrieproduktion und Einzelhandel: steigende Wachstumsrate = +1.
- Arbeitslosigkeit: sinkende Quote = +1.
- Leitzins: Anhebung = +1, Senkung = -1, unverändert = 0. Dies ist weder
  Zinserwartung noch Überraschung gegenüber dem Marktkonsens.
- Inflation wird standardmäßig nur angezeigt. Optional wählbar sind die
  ausdrücklich bezeichneten Modelle „Zinsdruck“ oder „Disinflation“.
  Höhere Inflation ist kein allgemeingültiges positives Währungssignal.
- Ein unveränderter neuer Quellenpunkt muss den vorherigen Impuls auf 0 setzen.
  Deshalb niemals neue Releases allein über `ta.change(value)` erkennen.
- Fehlende Vorbeobachtung, zu alte Beobachtung und ungültige Quelle ergeben `na`.

GDP hat eine längere Frist als monatliche Reihen; Leitzins und die teilweise
vierteljährlichen AU-/NZ-Reihen erhalten eigene, dokumentierte Fristen.
Die Fristen sind Plausibilitätsfilter für die Quellenzeitachse, kein belegter
Veröffentlichungskalender. Rohwerte und Alter bleiben sichtbar.

## 6. Manuelle Überraschungen

`signal = sign((actual - forecast) * richtung)`.

Previous ist optionaler Kontext und ersetzt niemals Forecast. Eingaben werden
als begrenzte Dezimalstrings in Integer-Millionstel umgewandelt; dadurch sind
Gleichheit, negative Werte und Null ohne frei gewählte Rundungstoleranz prüfbar.

Zeilen enthalten Währung, kanonische Kennzahl, Bezugsperiode, UTC-Releasezeit,
Actual, Forecast und optional Previous. Actual und Forecast beziehen sich auf
dieselbe definierte Kennzahl/Einheit/Transformation. Die Anleitung verlangt die
Prüfung desselben Releases und der Quelle. Keine automatische Quellenbestätigung.
Unbekannte Schlüssel, falsche Daten, leere Pflichtfelder und doppelte
Währung/Kennzahl/Release-Identitäten erzeugen einen Fehler mit Zeilennummer.
Zukünftige Releases werden vor ihrem Zeitpunkt nicht ausgewertet.

Bis zu 17 kanonische Kennzahlen aus der Desktop-Heatmap sind auswählbar. Die
Auswahl definiert den Coverage-Nenner; nicht eingegebene Werte sind keine Null.

## 7. Aggregation und Paarvergleich

Vier Domänen haben getrennt einstellbare Gewichte: Wachstum, Inflation,
Arbeitsmarkt und Zinsen. Ein Domänengewicht wird gleichmäßig auf ihre
konfigurierten Kennzahlen verteilt. Zusätzliche Wachstumsreihen erhöhen dadurch
nicht automatisch das gesamte Wachstumsgewicht.

Währung: `100 * sum(weight * signal) / sum(verfügbare weights)`.

Paar: Für exakt dieselbe Kennzahl müssen beide Signale verfügbar sein.
`component = base - quote`; danach
`100 * sum(weight * component) / (2 * sum(gemeinsame weights))`.

Zusätzlich wird die ungewichtete Rohsumme ausgewiesen. Coverage ist der Anteil
der tatsächlich vorhandenen Gewichte am konfigurierten Gewicht. Mindestens zwei
Kennzahlen und standardmäßig 75 % Coverage sind für einen Gesamtscore erforderlich.
Gewicht 0 schließt eine Kennzahl aus dem Score und dessen Coverage-Nenner aus.
Fehlende Seiten werden niemals mit Null ersetzt. Bei identischer Datenbasis gilt
`score(A/B) = -score(B/A)`. Auf der Matrixdiagonale steht ein Strich.

Das ist ein eigener, offengelegter Pine-Score. Insbesondere die normalisierte
Anzeige und die strenge gemeinsame Verfügbarkeit sind keine Behauptung identischer
Desktop-Ergebnisse. Bestehende native Berechnungen werden nicht geändert.

## 8. COT, Charttrend und Saisonalität

COT: gleiche Quellenwoche für Long und Short verlangen; Netto = Long - Short,
Änderung = Netto - vorige Netto-Beobachtung. Neue Wochen mit gleichem Wert zählen
als neue Beobachtungen. Z-Score verwendet ausschließlich vorherige Beobachtungen,
Stichproben-Standardabweichung, mindestens 26 und höchstens 52 vorherige Wochen.
Varianz 0 ergibt keinen Z-Score. USD verwendet ausdrücklich den USD-Index-Kontrakt
als Stellvertreter; CNY bleibt ohne COT-Abdeckung. Die COT-Teilbewertung ist ein
eigenes transparentes Modell, keine Kopie der gesamten Desktop-Pipeline.

Charttrend: OHLC4, EMA20/EMA50, ADX14 und DMI14; mindestens 100 Kerzen. Bullish
bei OHLC4 > EMA20 > EMA50, positiver EMA20-Steigung, +DI > -DI, ADX >= 20;
Bearish spiegelbildlich, sonst neutral. H4/D1 werden einzeln angezeigt und
bestätigen nur bei gleicher gerichteter Aussage. Forex-Metadaten des gewählten
Symbols müssen zu Base/Quote passen; kein stilles Invertieren oder CNH-Ersatz.

Saisonalität: `(Monatsschluss / Vormonatsschluss - 1) * 100`, arithmetischer
Mittelwert und Anteil strikt positiver Monate. Nur vollständige frühere Jahre,
maximal 20, mindestens 5. Lücken und fehlender Dezember-Vorjahreskurs schließen
das betroffene Jahr aus. Kein laufendes Jahr, keine aktuelle Monatskerze und
kein Zugriff auf künftige Kurse. Aussage gilt für ganze Kalendermonate, nicht
für ein verbleibendes Monatsfenster oder die Desktop-20-Handelstage-Suche.
Forex-Monatskerzen können am Abend des vorherigen Kalendertags beginnen.
Die Monatszuordnung verwendet deshalb `time_close - 1` in der Zeitzone des
angefragten Symbols; die Kursberechnung verwendet ausschließlich vergangene
Monatsschlusskurse. Dies wurde im Live-Lauf mit EUR/USD nachgeprüft.

## 9. Abnahme

- Vorzeichen, exakte Gleichheit, echte Null, negative Werte und Fehlwerte.
- Unveränderte neue Quellenbeobachtung sowie getrennte Kennzahlzustände.
- Gemeinsame Coverage, ausgeschaltete Gewichte, Grenzwerte und Antisymmetrie.
- Dezimalparser, Datum, Zukunft, doppelte/manipulierte Eingaben.
- COT-Wochenabgleich, Historienminimum, konstante Werte und Stichprobenvarianz.
- Saisonjahre, Schalt-/Jahreswechsel, Kurslücken und keine laufenden Jahre.
- Budget für jede Profil-/Modulkombination.
- Echter Pine-Compiler und sichtbarer Laufzeitstatus, soweit zugänglich.

## Primärquellen

- https://www.tradingview.com/pine-script-docs/concepts/other-timeframes-and-data/
- https://www.tradingview.com/pine-script-docs/writing/limitations/
- https://www.tradingview.com/pine-script-docs/visuals/tables/
- https://www.tradingview.com/pine-script-docs/concepts/repainting/
- https://in.tradingview.com/script/ysFf2OTq-LibraryCOT/

Umsetzung und tatsächlich ausgeführte Prüfungen werden nach Abschluss in
`apps/desktop/tradingview/VALIDATION.md` festgehalten.
