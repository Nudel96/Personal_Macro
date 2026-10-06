# Personal Macro · Macro Heatmap für TradingView

Eigenständiger Indikator für **Pine Script v6**. Die Datei
[`personal-macro-heatmap.pine`](personal-macro-heatmap.pine) enthält das vollständige
Skript. Es zeigt eine G8-Paarmatrix, eine sortierbare Währungsübersicht und
Paar-Details. COT, H4-/D1-Trend und Monats-Saisonalität ergänzen das ausgewählte
Paar. CNY kann zusätzlich eingeschaltet werden.

Die Planung und der Berechnungsvertrag stehen in
[`docs/planning/pine-macro-heatmap.md`](../../../docs/planning/pine-macro-heatmap.md),
die tatsächlich ausgeführten Prüfungen in [`VALIDATION.md`](VALIDATION.md).

## Start in TradingView

1. Einen normalen **1D-Chart** öffnen, beispielsweise `OANDA:EURUSD`.
2. Pine Editor → neuen Indikator erstellen → den gesamten Inhalt der `.pine`-Datei
   einsetzen → speichern → zum Chart hinzufügen. Der offizielle Import
   `TradingView/LibraryCOT/6` wird von TradingView aufgelöst.
3. Den Indikatorbereich ausreichend hoch ziehen oder über das Maximieren-Symbol
   rechts oben im Bereich vergrößern. Eine große Tabelle kann in kleinen Bereichen
   abgeschnitten werden; die Schrift ist in den Einstellungen veränderbar.
4. Doppelklick auf **PM Macro** öffnet die Einstellungen. Unter **Ansicht** zwischen
   Paarmatrix, Währungen und Paar-Details wechseln. Zellen enthalten Tooltips.
5. Bei einem anderen Paar **Basiswährung**, **Quotewährung** und das **exakte
   Forex-Symbol** gemeinsam einstellen. Der Chart liefert den täglichen
   Auswertungszeitpunkt; Zusatzdaten stammen immer aus dem eingestellten Symbol.

Der Standard funktioniert mit dem Limit von 40 Datenabfragen: acht Währungen,
vier Wirtschaftsfelder und alle drei Zusatzmodule benötigen höchstens **39**.
Der Auswertungsstand ist der letzte bestätigte Charttag, kein laufender Intradaywert.
Ein normaler Forex-Tageschart vermeidet abweichende Börsenkalender eines Aktiencharts.

## Zwei klar bezeichnete Berechnungen

**Automatische Macro-Trends** vergleicht den letzten verfügbaren Wirtschaftswert
mit dem vorherigen Punkt derselben TradingView-Reihe. Das ist eine Veränderung,
keine Überraschung gegenüber einer Analystenprognose. Das Basisprofil verwendet
BIP YoY (`GDPYY`), Inflation YoY (`IRYY`), Arbeitslosenquote (`UR`) und Leitzins
(`INTR`). Das erweiterte Profil ergänzt Industrieproduktion YoY (`IPYY`) und
Einzelhandel YoY (`RSYY`).

**Manuelle Release-Überraschungen** vergleicht Actual mit Forecast aus den
eingetragenen Releases. Es gibt keine automatische Kalender-/Forecast-Abfrage.
Previous erscheint nur als Kontext. Es ersetzt keinen fehlenden Forecast.

Die Ländercodes sind US, EU (Euroraum), GB, JP, CH, CA, AU, NZ und optional CN.
Die Desktop-App verwendet andere Datenanbieter und teilweise andere Berechnungen.
Identische Scores zwischen beiden Anwendungen werden daher nicht behauptet.

## Wie der Score entsteht

Je Kennzahl gilt `Signal = sign((Actual − Referenz) × Richtung)` mit −1, 0 oder +1.
Referenz ist je nach Modus die Vorbeobachtung oder Forecast. Bei Arbeitslosenquote
und Erstanträgen ist die Richtung −1; bei den übrigen Kennzahlen +1.
Das ist eine offengelegte Modellannahme, keine allgemeingültige Kursreaktion.

Automatische Inflation wird standardmäßig **nur angezeigt** und erhält Gewicht 0.
Optional können steigende Inflation als Zinsdruck oder sinkende Inflation als
Disinflation gewertet werden. Im manuellen Modus bedeutet höhere Inflation als
erwartet entsprechend dem Überraschungsmodell +1.

Wachstum, Inflation, Arbeitsmarkt und Zinsen besitzen eigene Gewichte. Innerhalb
einer Gruppe wird ihr Gewicht gleich auf die konfigurierten Kennzahlen verteilt.
So erhält Wachstum durch zusätzliche Reihen nicht automatisch mehr Gesamtgewicht.

```text
Währung = 100 × Σ(Gewicht × Signal) / Σ(verfügbare Gewichte)
Paarbeitrag je Kennzahl = Signal der Basis − Signal der Quote
Paar = 100 × Σ(Gewicht × Paarbeitrag) / (2 × Σ(gemeinsame Gewichte))
Abdeckung = 100 × Σ(verfügbare bzw. gemeinsame Gewichte) / Σ(geplante Gewichte)
```

Ein Paar verwendet ausschließlich Kennzahlen, die auf **beiden** Seiten verfügbar
sind. Standardmäßig sind mindestens zwei gemeinsame Kennzahlen und 75 % des
konfigurierten Gewichts erforderlich. Gewicht 0 wird auch aus dem Nenner entfernt.
Ein fehlender Wert bleibt `—`; eine echte unveränderte Beobachtung ist 0.
Der Score liegt zwischen −100 und +100 und ist keine Rendite in Prozent.
Die zusätzlich angezeigte Rohsumme ist ungewichtet und verwendet dieselben
verfügbaren Kennzahlen mit positivem Gewicht.

Beispiel: Die Paarbeiträge +2, −1, +1, 0 mit vier gleichen Gewichten ergeben
Rohsumme +2 und Paar-Score `100 × 2 / (2 × 4) = +25`. Das inverse Paar ergibt −25.
Bei weniger als 75 % gemeinsamer Abdeckung bleibt der Gesamtscore gesperrt;
die vorhandene Teil-Rohsumme und Abdeckung bleiben nachvollziehbar.

## Manuelle Daten korrekt eingeben

Aktive Kennzahlen als kommaseparierte Keys wählen, Herkunft eintragen und die
Zuordnung von Release, Einheit und Transformation bestätigen. Für jede Zeile:

```text
CCY;KEY;PERIODE;YYYY-MM-DDTHH:MM;ACTUAL;FORECAST;PREVIOUS
```

Die Zeit ist **UTC**. Keine Kopfzeile; `#` beginnt eine Kommentarzeile.
Dezimalpunkt verwenden, keine Prozentzeichen, Einheiten, Tausendertrennzeichen
oder Exponentialschreibweise. Zulässig sind höchstens neun Stellen vor und sechs
Stellen nach dem Punkt. Previous darf leer bleiben, das siebte Feld bleibt erhalten.
Beispiel für eine leere Previous-Spalte: `EUR;gdp;2026-Q2;2026-09-15T09:00;2.1;2;`.

| Key | Einheit / verbindliche Bedeutung für vergleichbare Eingaben |
|---|---|
| `gdp` | Reales BIP, Veränderung zum Vorjahr in % |
| `manufacturing_pmi` | Industrie-PMI, Indexpunkte; dieselbe Flash-/Final-Abgrenzung |
| `services_pmi` | Dienstleistungs-PMI, Indexpunkte |
| `retail_sales` | Einzelhandelsumsatz YoY in %, innerhalb eines Releases gleiche Bereinigung |
| `consumer_confidence` | Konsumvertrauen, Punkte des benannten Index |
| `industrial_production` | Industrieproduktion YoY in % |
| `trade_balance` | Handelsbilanzsaldo in Milliarden der jeweiligen Landeswährung |
| `cpi_yoy` | Gesamt-CPI YoY in %, nicht Kerninflation |
| `ppi_yoy` | Gesamt-PPI YoY in % |
| `pce_yoy` | Gesamt-PCE-Preisindex YoY in %, nicht Core-PCE |
| `interest_rates` | Beschlossener Leitzins in %; bei Zielband eine einheitlich benannte Bandgrenze |
| `nfp` | Beschäftigungsänderung in Tausend; US: Nonfarm Payrolls, andernorts Definition dokumentieren |
| `unemployment_rate` | Arbeitslosenquote in % |
| `unemployment_claims` | Erstanträge in Tausend, Wochenwert |
| `adp` | ADP-Beschäftigungsänderung in Tausend |
| `jolts` | Offene Stellen in Millionen |
| `wage_growth` | Lohnwachstum YoY in % |

Forecast und Actual müssen dieselbe Periode, Quelle, Bereinigung und Einheit
betreffen. QoQ, YoY, annualisierte Raten, Core und Headline nicht vermischen.
Die Herkunftsbestätigung kann die inhaltliche Prüfung der Quelle nicht automatisieren.
Nicht jedes Land besitzt jede Kennzahl; fehlende Reihen reduzieren die Abdeckung.
Die jeweils letzten Releases der beiden Länder dürfen unterschiedliche Perioden
haben. Diese Perioden sind im Tooltip sichtbar; der Score erzwingt keine identischen
nationalen Veröffentlichungskalender.

Die Eingabe ist auf 300 Zeilen und 30.000 Zeichen begrenzt. Doppelte Identitäten
aus Währung/Key/UTC-Zeit, ungültige Daten oder unbekannte Keys erzeugen klare Fehler.
Zeilen dürfen unsortiert sein. Nur der jüngste Release bis zum Auswertungsstand wird
verwendet; spätere Releases bleiben unberücksichtigt. Die Berechnung vergleicht
exakte Integer-Millionstel, ohne eine frei gewählte Rundungstoleranz.

[`fixtures/manual-releases.txt`](fixtures/manual-releases.txt) enthält ausdrücklich
**synthetische Prüfdaten**. Sie liefert am Auswertungsstand 02.10.2026 EUR/USD +25,
USD/EUR −25 und keine Werte für die übrigen Währungen. Nach Ablauf der Frischefristen
wird diese datierte Fixture erwartungsgemäß ungültig. Sie ist keine Marktprognose.

## Zeit, Datenalter und Abdeckung

Neue Wirtschaftsbeobachtungen werden über `gaps_on` erkannt, auch wenn der Zahlenwert
unverändert ist. Datum und Vorgänger werden je Währung und Kennzahl getrennt gehalten.
Die automatische Zeitangabe ist eine **Beobachtung auf der Chartzeitachse**, kein
Nachweis des amtlichen Releasezeitpunkts. TradingViews Anbieter können Daten revidieren.
Die Historie ist deshalb kein revisionssicheres Archiv des damaligen Wissensstands.

Frischegrenzen ab Beobachtungs-/Releasezeit: BIP und Leitzins 180 Tage, Erstanträge
21 Tage, AU-/NZ-Inflation sowie NZ-Arbeitslosenquote 135 Tage, sonst 75 Tage.
Im automatischen Modus darf die Vorbeobachtung zusätzlich höchstens das Doppelte
dieser Frist vor der aktuellen Beobachtung liegen. Die Fristen sind konfigurationsfeste
Plausibilitätsfilter, kein amtlicher Releasekalender. Fehlende Quellenkombinationen
und Datenlücken bleiben sichtbar. Die manuelle Auswahl definiert den Coverage-Nenner.

## Zusatzmodule

**COT:** Legacy Noncommercial, Futures ohne Optionen. EUR 099741, GBP 096742,
JPY 097741, CHF 092741, CAD 090741, AUD 232741, NZD 112741. USD 098662 ist ausdrücklich
ein USD-Index-Stellvertreter; CNY ist nicht verfügbar. Netto = Long − Short,
Änderung = Netto − vorheriges Netto. Long und Short müssen dieselbe Quellenwoche
haben. Der Z-Score vergleicht das aktuelle Netto mit 26–52 **vorherigen** Wochen,
mit Stichprobenstandardabweichung; konstante Historie ergibt keinen Z-Score.
Lücken über zehn Tage starten den Historienaufbau neu.

Die COT-Teilbewertung ist der Mittelwert aus Netto-Vorzeichen, Veränderungs-Vorzeichen
und Z-Richtung (+1 ab Z ≥ 1, −1 ab Z ≤ −1, sonst 0). Alle drei Komponenten müssen
vorliegen. Der Paarwert ist Basis minus Quote und liegt in [−2, +2].
`1W`, `[1]` und `lookahead_on` verwenden absichtlich die **vorherige abgeschlossene
Quellenwoche** und verzögern damit die Anzeige. Das angezeigte Datum ist weder der
CFTC-Dienstagsstichtag noch ein belegter Freitags-Veröffentlichungszeitpunkt.
Nach 21 Tagen ohne gültigen Quellenstand wird ausgeblendet. Beide Paarseiten müssen
dieselbe Quellenwoche verwenden. Dies ist ein Positionierungsmodell, kein Backtestsignal.

**Charttrend:** OHLC4, EMA20/EMA50, EMA20-Steigung über drei Kerzen sowie DMI/ADX14;
mindestens 100 Quellkerzen. Positiv bei OHLC4 > EMA20 > EMA50, positiver Steigung,
+DI > −DI und ADX ≥ 20; negativ spiegelbildlich, sonst neutral. H4 und D1 werden
einzeln gezeigt. Nur dieselbe gerichtete Aussage gilt als gemeinsame Bestätigung.
Es werden nur bis zum bestätigten Auswertungsstand abgeschlossene Quellkerzen
verwendet, maximal fünf Tage alt. Der Symbolvertrag prüft Basis und Quote;
inverse Paare und CNH werden nicht automatisch passend gemacht.

**Saisonalität:** Monatsrendite `100 × (Schluss / Vormonatsschluss − 1)`,
arithmetischer Mittelwert sowie Anteil strikt positiver Monate; Nullmonate bleiben
im Nenner. Standardmäßig 15, maximal 20 frühere volle Kalenderjahre; mindestens
fünf nötig. Jedes Jahr benötigt zwölf passende Monatskerzen und den vorherigen
Dezemberschluss. Forex-Monate werden anhand von `time_close − 1` zugeordnet,
weil ihre Eröffnung im vorherigen Kalendertag liegen kann. Laufendes Jahr und
aktuelle Monatskurse werden ausgeschlossen. Grün bei Mittelwert > 0 und
positivem Anteil ≥ 60 %, Rot bei Mittelwert < 0 und Anteil ≤ 40 %, sonst neutral.
Dies beschreibt den **ganzen Monat**, kein Restmonatsfenster oder Desktop-Screener.

Alle Zusatzmodule bleiben getrennt vom Macro-Gesamtscore. Abweichende Aussagen
werden gemeinsam angezeigt und nicht zu einer scheinbar eindeutigen Empfehlung verrechnet.

## Umfang, Limits und Alarme

| Konfiguration mit allen Zusatzmodulen | Maximale Abfragen |
|---|---:|
| G8, Basis | 39 |
| G9, Basis | 43 |
| G8, erweitert | 55 |
| G9, erweitert | 61 |
| Manueller Modus | 7 |

64 Abfragen erfordern TradingView Ultimate; das Skript erkennt den Tarif nicht.
Mit 40 kann G9 Basis beispielsweise bei ausgeschaltetem COT verwendet werden
(39 Abfragen). Größere Profile werden vor dem Datenabruf durch die Budgetprüfung
abgewiesen. Verfügbare Historie und Datenrechte hängen zusätzlich vom Feed/Konto ab.

Alarme sind standardmäßig ausgeschaltet. Zum Verwenden die Option aktivieren
und anschließend in TradingView einen Alarm auf die positive oder negative
Macro-Schwelle erstellen, vorzugsweise „einmal pro Kerzenschluss“. Ein Alarm
benötigt zwei aufeinanderfolgende verfügbare Tages-Scores und einen tatsächlichen
Schwellenübertritt. Nach Änderungen der Eingaben bestehende TradingView-Alarme
neu erstellen. Das Skript erstellt selbst keine Alarme und keine Orders.

## Nachprüfung und Quellen

```powershell
node --test apps/desktop/tradingview/verify.mjs
```

Der lokale Prüfer führt die markierten skalaren Ausdrücke direkt aus dem
ausgelieferten Pine-Quelltext aus und prüft Budget-/Strukturverträge. Er ist kein
Pine-Compiler. Die zusätzlichen Pine-internen Startprüfungen laufen standardmäßig
im echten Indikator. Plattformprüfung und deren Grenzen stehen in `VALIDATION.md`.

- [TradingView: Daten aus anderen Kontexten](https://www.tradingview.com/pine-script-docs/concepts/other-timeframes-and-data/)
- [TradingView: Pine-Limits](https://www.tradingview.com/pine-script-docs/writing/limitations/)
- [TradingView: Tabellen](https://www.tradingview.com/pine-script-docs/visuals/tables/)
- [TradingView: Repainting und Datenrevisionen](https://www.tradingview.com/pine-script-docs/concepts/repainting/)
- [TradingView: offizielle LibraryCOT](https://in.tradingview.com/script/ysFf2OTq-LibraryCOT/)
