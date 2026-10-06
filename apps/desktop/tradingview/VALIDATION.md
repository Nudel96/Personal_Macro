# Abnahmeprotokoll · Pine Macro Heatmap 1.0.0

Abnahme: 03.10.2026, Europe/Berlin (02.10.2026 abends UTC).
Das Skript wurde im echten TradingView-Pine-v6-Editor kompiliert, auf realen
Marktdaten ausgeführt und privat als **Personal Macro · Macro Heatmap v1.0**
gespeichert. Es wurde nicht als Community-Skript veröffentlicht.

## Ausgelieferter Stand

Datei: `personal-macro-heatmap.pine`, 737 Quellzeilen plus abschließender Zeilenumbruch.

```text
SHA-256 (UTF-8, LF):
a09056cb69d285134b7f62f074770fb042a169bbad7f9371ded73553c85fd32e
```

Der Inhalt des gespeicherten Pine-Editors wurde über dessen normale
Textauswahl/Kopierfunktion zurückgelesen und mit der lokalen Datei verglichen.
Nach Normalisierung von CRLF auf LF stimmt er vollständig einschließlich Hash
überein. Der Editor zeigte „Saved“, Version 1, Pine Script v6. Die gespeicherte
Version wurde anschließend erneut auf den Chart angewendet.

Die Endfassung enthält eine präzisere Anzeige manueller Werte mit bis zu sechs
Nachkommastellen, minutengenaue manuelle UTC-Tooltips und eine Trend-Warmup-Prüfung
über den tatsächlich vorhandenen 100. Quellbalken. Die abschließende Kompilierung
und der Live-Lauf erfolgten mit diesen Änderungen.

## Lokale Berechnungsprüfung

Ausgeführt: `node --test apps/desktop/tradingview/verify.mjs`.

Ergebnis: **10 Testgruppen bestanden, 0 fehlgeschlagen**.
Protokoll: [`evidence/local-tests.tap`](evidence/local-tests.tap).

Der Testadapter liest 14 markierte skalare Ausdrücke direkt aus der ausgelieferten
Pine-Datei. Er übersetzt ausschließlich deren einfache Operatoren und Funktionsnamen
für Node; er ist weder Pine-Compiler noch Provider-Simulator.

Geprüft sind Vorzeichen, negative Werte, echte Null, fehlende Gegenseiten,
Normierungsdivisor, Mindestzahl und Coverage-Grenze, exakte Millionstel-Skalierung,
Frische einschließlich Zukunftssperre, COT-Wochenidentität und Z-Grenzen,
Monatsrenditen und Kalenderzulässigkeit sowie sämtliche 64 Kombinationen der
Profil-/G8-/G9-/Modulbudget-Formel. 10.000 generierte Portfolios prüfen Grenzen
und Antisymmetrie. Strukturprüfungen sichern kritische Zeit- und Fehlwertverträge.

Zusätzlich liefen **25 Pine-interne Assertions** im echten Indikator mit aktivierter
Option „Interne Rechenprüfungen beim Start“. Sie prüfen unter anderem den echten
Dezimal-/UTC-Parser, gemeinsame gewichtete Aggregation, Gewicht 0 sowie die echte
COT-Historienfunktion. COT-Kontrollfall: Vorgeschichte 0…25, aktueller Wert 26,
Mittelwert 12,5, Stichprobenvarianz 58,5, Z = 13,5 / √58,5. Eine konstante Historie
liefert keinen erfundenen Z-Score oder Composite.

## Tatsächlich ausgeführte TradingView-Prüfungen

| Prüffall | Beobachtung / Ergebnis |
|---|---|
| G8 Basis, alle Zusatzmodule, 1D, `OANDA:EURUSD` | Läuft mit höchstens 39/40 Abfragen ohne Compiler-/Laufzeitfehler |
| Paarmatrix | EUR/USD +50 und USD/EUR −50 am Stand 02.10.2026; Diagonale leer |
| Paar-Details | Gemeinsame Beiträge +2 (BIP), +1 (Arbeitslosigkeit), 0 (Zins); Inflation Gewicht 0; Rohsumme +3, Score +50, Coverage 100 %, n=3 |
| Währungsranking, G9 ohne COT | 39/40 Abfragen; neun Währungen einschließlich CNY mit Quellenwerten und sortierten Scores |
| COT EUR / USD | Gleiche Quellenwoche 21.09.2026; EUR Netto −52.334, Veränderung −25.341, Z −1,53; USD 10.330, −263, Z 0,82 |
| H4 / D1 | Beide −1 im geprüften EUR/USD-Stand; Metadaten stimmen zur Paarwahl |
| Saisonalität | Oktober, n=15 vollständige Jahre 2011–2025, Mittelwert gerundet −0,36 %, 33,33 % positive Monate |
| Manuelle Fixture mit zehn Releases | EUR/USD +25, inverse Matrixzelle −25, Rohsumme +2, Coverage 100 %, n=4; andere Währungen fehlen |
| Zukünftiger und unsortierter alter Release | Beide in derselben Fixture enthalten; überschreiben den aktuellen BIP-Release nicht |
| Zwei fehlende USD-Kennzahlen | Coverage 50 %, n=2, Teil-Rohsumme +1, Gesamtscore `—` |
| Doppelter manueller Release | Erwarteter Abbruch auf Bar 0 mit „Manuelle Zeile 16: Doppelter Release …“ |
| G9 Basis mit allen Modulen, Budget 40 | Erwarteter Abbruch vor Datenabruf: 43 benötigt, 40 eingestellt |
| Wechsel auf 4H-Chart | Erwarteter Abbruch mit verständlichem Hinweis auf normalen 1D-Chart; Rückkehr zu 1D erfolgreich |
| GBP/USD gewählt, Symbol bleibt EUR/USD | Macro/COT gehören zu GBP/USD; H4/D1 und Saison zeigen fehlende Werte sowie Symbolzuordnungsfehler |
| Übergabestand | Wieder EUR/USD, automatische G8-Matrix, alle Zusatzmodule, Budget 40, manuelle Felder leer und Alarme ausgeschaltet |

Der gefundene Forex-Kalenderfehler wurde vor der Abnahme korrigiert:
`month(time)` kann die am Vorabend beginnende Monatskerze falsch zuordnen.
Die vollständigen Jahresprüfungen verwenden jetzt den Schlusskalender
`time_close - 1`. Der Live-Lauf erkannte anschließend die 15 gültigen Vorjahre.

Die aufgeführten Werte sind datierte Beobachtungen dieses Prüfstands. Spätere
Marktdaten, Wirtschaftsrevisionen und Einstellungen dürfen zu anderen Ergebnissen führen.

## Lokale Bildnachweise

Alle Aufnahmen liegen ausschließlich auf Laufwerk D: unter `evidence/`.
Sie sind wegen der umgebenden Konto-/Watchlist-Oberfläche vom Git-Tracking
ausgenommen. Die Textprotokolle und Testfixture gehören zu den Quellen.

- `final-heatmap.png`: wiederhergestellte automatische EUR/USD-Matrix.
- `saved-editor.png`: neuer privater Skriptname, Version und gespeicherter Editor.
- `pair-details.png`: Rohwerte, Referenzen, Richtungen und Gewichte.
- `g9-currencies.png`: neun Währungen, Ranking und 39/40-Konfiguration.
- `manual-fixture.png`: manueller Kontrollwert +25 / −25.
- `manual-coverage.png`: fehlender Gesamtscore bei 50 % Coverage.
- `duplicate-rejected.png`, `budget-rejected.png`, `timeframe-rejected.png`:
  die drei erwarteten, tatsächlich ausgelösten Schutzmeldungen.
- `symbol-mismatch.png`: gesperrte Zusatzwerte bei unpassender Symbolzuordnung.

## Grenzen dieser Abnahme

- Kein unabhängiger Vollabgleich sämtlicher Wirtschaftswerte mit den
  amtlichen Veröffentlichungen; Datenherkunft bleibt TradingView.
- Keine Prüfung einer Ultimate-Konfiguration mit mehr als 40 realen Abfragen.
  Das erweiterte Profil ist implementiert und rechnerisch budgetgeprüft;
  seine vollständige Live-Datenabdeckung ist nicht abgenommen.
- Kein historischer Point-in-time- oder Profitabilitätsbacktest. Wirtschafts-
  und COT-Revisionen sowie Quellzeitachsen können historische Ergebnisse ändern.
- Kein vollständiger Kalender-/Feed-Simulator für ausgefallene Quellen,
  Tarifwechsel, alle 17 manuellen Kennzahlen oder alle internationalen Monatskalender.
- Alarmbedingungen sind implementiert, aber es wurde kein realer Alarm angelegt
  oder eine Benachrichtigung versendet.
- Die Desktop-App wurde durch diese eigenständige Pine-Erweiterung nicht geändert.
  Desktop-/Rust-Builds sind für diesen isolierten Lieferumfang nicht ausgeführt worden.
