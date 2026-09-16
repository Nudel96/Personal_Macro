# Seasonality: Monatsfenster und Währungsdivergenzen

Stand: 15.09.2026.

## Auftrag und tatsächlich umgesetzter Stand

Gewünscht sind ausschließlich echte FX-Futures-Fenster, starke gegen schwache
Währungen im selben Fenster und eine Auswahl der 1–10 stärksten Fenster des
aktuellen Monats.

Die Desktop-App besitzt jetzt eine zusätzliche lokale Fenstersuche mit
Monats-/Jahresauswahl, Top 1–10, einstellbarer Dauer und Mindeststichprobe,
Rangliste, ausgewähltem Verlauf und überprüfbaren Einzeljahres-Terminen.
Die Berechnung von Währungsdivergenzen ist implementiert. Sie kann mit den
bereits vorhandenen Forex-Spotdaten ausdrücklich separat verwendet werden.

**Die echte FX-Futures-Datenversorgung ist offen.** Der Standardfilter bleibt
„Ausschließlich FX-Futures“ und zeigt den fehlenden Datenbestand an. Er liefert
keine Spot-Rankings. Es wurde kein neuer externer Anbieter angebunden. Die
ursprüngliche Anforderung echter Futures-Ergebnisse ist daher noch nicht erfüllt.

## EODHD-Prüfung

Der vorhandene lokale API-Zugang wurde für lesende Kataloganfragen verwendet.
Schlüssel, Accountinformationen und Journalwerte sind nicht Teil dieses Berichts.

- `exchanges-list`: keine passende CME-Futures-Börse im zurückgegebenen Katalog.
- `exchange-symbol-list/FOREX`: 995 Instrumente, alle Typ `Currency`; kein
  passender Futures-Typ oder 6A/6B/6C/6E/6J/6N/6S-Kontrakt.
- Symbolsuche `6E`: elf Aktien-Treffer, kein Euro-FX-Future.
- Symbolsuche `Euro FX`: Forex-Cross-Rates.
- Symbolsuche `Japanese Yen Futures`: zwei gehebelte/inverse ETFs in Taiwan;
  diese sind keine CME-Yen-Kontrakte und werden nicht übernommen.

Die öffentliche [EODHD-EOD-Dokumentation](https://eodhd.com/financial-apis/api-for-historical-data-and-volumes)
beschreibt Aktien, ETFs, Fonds, Indizes, Forex und Kryptowährungen.
Der [Forex-Katalog](https://eodhd.com/financial-apis/list-supported-forex-currencies)
beschreibt Währungspaare. Dies sind die geprüften Grenzen der vorhandenen
Anbindung, kein Anspruch über zukünftige Anbieterprodukte.

[CME: FX Futures](https://www.cmegroup.com/markets/fx/fx-futures.html)
ordnet die tatsächlichen Kontrakte ein. [CME: Spot-/Futures-Preise](https://www.cmegroup.com/education/whitepapers/reconciling-fx-spot-futures-prices)
erklärt die Preisbasis. Für die spätere Futures-Anbindung werden historische
Kontraktidentität, USD-Notierung, Tages-/Settlement-Definition und eine
dokumentierte Rollbehandlung benötigt. Eine mögliche gesonderte Quelle ist
[Databento Historical](https://databento.com/docs/api-reference-historical?historical=http);
diese ist bisher nur recherchiert und nicht eingerichtet oder bezahlt.

## Berechnung

- Der aktuelle **lokale** Monat ist vorbelegt; ein Minutentimer erkennt Tages-
  und Monatswechsel. „Ganzes Jahr“ und andere Monate sind auswählbar.
- Ein Fenster beginnt im gewählten Monat. Das Enddatum kann im Folgemonat
  oder Folgejahr liegen. 5–90 **Kalendertage**, Standard 7–45; tägliche Start-
  und Endvarianten innerhalb dieses Bereichs. Diese Suche ist von den bisherigen
  in Handelstagen definierten Einzelasset-Fenstern unabhängig.
- Standard: letzte 20 abgeschlossene Kalenderjahre, mindestens zehn passende
  Jahre. Mindeststichprobe kann bis fünf reduziert werden. Ein Jahr braucht
  mindestens 180 Tageswerte, den ersten Wert spätestens am 15. Januar und den
  letzten frühestens am 16./15. Dezember (Ordinaltag 350). Das aktuelle Jahr
  wird nicht als historische Stichprobe benutzt.
- Einstiegs-/Ausstiegstag: erster verfügbarer Kurs auf/nach dem Kalendertag,
  höchstens vier Tage später. Jahresgrenzen werden beim Mapping nicht
  überschritten. Ein beabsichtigtes Dezember-/Januar-Fenster benötigt beide
  vollständigen Jahre. Lücken von mehr als sieben Tagen schließen das Fenster aus.
- Der 29. Februar ist keine Fenstergrenze. Innerhalb historischer Fenster
  bleiben vorhandene Schaltjahr-Beobachtungen erhalten. Die Kurve zeigt ihre
  Beobachtungszahl und enthält fehlende Werte statt Nullersatz.
- Rendite je Jahr: `exit / entry - 1`. Mittel und Median müssen dieselbe
  von null verschiedene Richtung haben. Mehr als die Hälfte der Jahre muss
  diese Richtung tatsächlich aufweisen.
- Rangfolge: 95%-Wilson-Untergrenze, absoluter Median / Stichprobenstandardabweichung,
  Stichprobengröße, stabile ID. Die Standardabweichung hat nur in der Sortierung
  eine numerische Untergrenze von 0.000001; angezeigt wird der unveränderte Wert.
- Gleichgerichtete Fenster desselben Instruments/Paares mit mindestens 75%
  Überlappung bezogen auf das kürzere Fenster werden nach Rang zusammengefasst.
  Weniger als zehn passende Muster werden nicht künstlich aufgefüllt.
- Alle Fenster werden im selben Datenbestand ausgewählt und bewertet. Dies ist
  eine historische Suche, keine unabhängige Prognosevalidierung. Die Wilson-
  Grenze korrigiert nicht für die Vielzahl untersuchter Fenster.

## Divergenzen

Beide Serien verwenden **identische tatsächliche Einstiegstage, Ausstiegstage
und gemeinsame vollständige Jahre**. Die erste Währung steigt im Mittel und
Median, die zweite fällt. Die gemeinsame Trefferquote zählt Jahre, in denen
beide Bedingungen zugleich eintreten; mehr als die Hälfte ist Voraussetzung.

Der Renditeabstand entsteht zunächst je Jahr als `strong_return - weak_return`.
Erst danach werden Mittel, Median und Schwankung berechnet. Die Anzeige nutzt
Prozentpunkte. Das ist keine handelbare Spread-Rendite, keine Kontraktzahl und
keine Aussage über eine USD-neutrale Futures-Position.

Nur bei ausdrücklich ausgewählter Spot-Datenbasis: EUR, GBP, AUD und NZD aus
den jeweiligen `...USD.FOREX`-Reihen, JPY/CHF/CAD aus `USD....FOREX` mittels
**Kehrwert jedes Preises**. Bloßes Negieren der Rendite wäre falsch. Beide
Source-Symbole und Kehrwertbehandlungen stehen in den Nachweisen. Ein konstanter
USD-Vergleichspartner wird nicht als Datenreihe erfunden. Andere Cross-Rates
werden nicht als zusätzliche unabhängige Währungen verwendet.

„Forex-Spot · 7 Hauptwährungen“ verwendet diese sieben einheitlich gegenüber
USD notierten Reihen auch für die Einzelwährungsfenster. So haben JPY, CHF
und CAD dort dieselbe Richtung wie in den Divergenzen. „Alle vorhandenen
EODHD-Märkte“ behält die ursprünglichen Instrumentnotierungen für Einzel-
fenster; seine Währungsdivergenzen verwenden weiterhin nur diese sieben Reihen.

## Architektur und Prüfung

- `metrics/seasonality_opportunities.rs`: reine Berechnung aus Tageskursen.
- `commands/seasonality_opportunities.rs`: validiert Eingaben und liest nur
  bestehende EODHD-Instrumente/Tageskurse; ein gemeinsamer SQLite-Lesesnapshot.
- CPU-Berechnung nach Transaktionsende über `spawn_blocking`.
- Kein Providerabruf durch den Scanner; keine Migration oder Scoreänderung.
- TypeScript-Fassade: `api.seasonalityOpportunities`. Browser ohne native
  Tageskurse liefert `DESKTOP_REQUIRED`, keine simulierten Ergebnisse.
- UI: `features/seasonality/seasonality-opportunities.tsx`, erreichbar direkt
  oberhalb der bestehenden Seasonality-Einzelanalyse.
- Deterministische Rust-Prüfungen: Rangfolge, Vorzeichen, Überlappung, gemeinsame
  Kalender/Jahre, Inversion, kurze/fehlende Historie, Feiertage, große Lücken,
  Schaltjahr, Jahreswechsel, aktuelle Jahre, Eingabegrenzen und strikte
  Futures-Abgrenzung. UI-Prüfungen: Monatsvorgabe, expliziter Datenwechsel,
  Top 1/10, Divergenzen, Filter, Einzeljahre, Fehler und rohe Einzelkurve.

### Prüfstand vom 15.09.2026

- `pnpm typecheck`: erfolgreich.
- `pnpm exec vitest run src/features/seasonality`: 13 Tests erfolgreich.
- `cargo test --lib seasonality`: 25 Tests erfolgreich.
- `cargo clippy --all-targets -- -D warnings`: erfolgreich.
- `pnpm exec tauri build --no-bundle`: aktueller Release-Build erfolgreich.
- Native Prüfung dieses Builds: Futures-Standard bleibt ohne Spot-Ergebnisse;
  ausdrücklicher Spotwechsel lädt genau sieben Märkte und sieben Währungsreihen.
  Top 1 zeigt einen, Top 10 zeigt zehn Treffer. September liefert unter den
  Standardfiltern zwei Divergenzen (NZD/JPY und AUD/JPY); beide bleiben als
  Spotdaten beschriftet. Die Kurven wurden visuell geprüft. Bei 1024 Pixeln
  entsteht kein horizontaler Seitenüberlauf. Anschließend regulärer Neustart
  ohne Browser-Testzugang.
- Die neue Oberfläche wurde im Browser bei 1440 und 1024 Pixeln geprüft;
  der Browser meldet den notwendigen Desktop-Datenzugriff korrekt.
- Eine unabhängige, ausschließlich lesende Python-Nachrechnung der öffentlichen
  lokalen Kursreihen bestätigt die native Spot-Divergenz NZD/JPY vom 25.09.
  bis 03.11. über 20 Jahre: NZD-Mittel +0.0523296%, JPY-Mittel -0.8923215%,
  mittlerer Abstand 0.9446512 Prozentpunkte, Medianabstand 1.5454741
  Prozentpunkte, gemeinsame Trefferquote 60%, Stichprobenstandardabweichung
  des Abstands 5.3358282 Prozentpunkte. Diese Zahlen sind eine Prüfung der
  Spotberechnung und keine Futures-Ergebnisse.
