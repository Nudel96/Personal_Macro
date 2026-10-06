# COT Insights: Teilnehmer- und Saisonvergleich

Stand: 26.09.2026. Implementierung in `apps/desktop`; die hier dokumentierte
Korrektur wurde als lokaler Desktop-Auftrag ausgeführt.

Die COT-Seite ergänzt vier Diagramme: zwei unabhängig wählbare Märkte mit jeweils
einem historischen Verlauf und darunter einem saisonalen Jahresverlauf.
Die Währungsmatrix übernimmt dieselbe Auswahl; auch Gold, Indizes und andere
katalogisierte CFTC-Kontrakte sind vergleichbar. Beide Märkte teilen Zeitachsen,
gemeinsame Werteskalen und Einheiten. Auf kleinen Bildschirmen bleiben die
Diagramme paarweise nebeneinander in einem horizontal scrollbaren Bereich.

## Herkunft und Speicherung

Quelle ist ausschließlich CFTC **Legacy Futures Only**, Datensatz `6dca-aqww`.
Die am 26.09.2026 geprüften Originalfelder sind:

| Teilnehmer | Long | Short |
| --- | --- | --- |
| Große Spekulanten | `noncomm_positions_long_all` | `noncomm_positions_short_all` |
| Commercials | `comm_positions_long_all` | `comm_positions_short_all` |
| Non-Reportables | `nonrept_positions_long_all` | `nonrept_positions_short_all` |

[CFTC-Berichtsklassen](https://publicreporting.cftc.gov/stories/s/r4w3-av2u),
[CFTC-Felddefinitionen](https://www.cftc.gov/MarketReports/CommitmentsofTraders/HistoricalViewable/deanexplanatory.html).
Non-Reportables bezeichnen Positionen unterhalb der Meldegrenze; eine reine
Retail-Klassifikation ist daraus nicht ableitbar. Farben kennzeichnen Gruppen.

Migration `0050` ergänzt vier nullable Integer-Spalten. Ein früherer Stand bleibt
für die zusätzlichen Gruppen unbekannt, niemals automatisch null Kontrakte.
Der bestehende CFTC-Abruf lädt alle drei Gruppen für seine bisherige
15-Jahres-Historie. **Historien laden** ermöglicht das explizite Ergänzen in der
Desktop-App. Neues JSON-Feld `participantSeries` ergänzt `get_cot_asset_detail`;
alle bisherigen Bewertungen und Non-Commercial-Felder bleiben erhalten.
Keine neue Brokerzuordnung, kein Preis-Proxy und keine neue Datenquelle.

Die privaten Marktpakete exportieren nur die vier zusätzlichen geprüften
Zahlenfelder. Der Loader akzeptiert genau das alte oder das neue freigegebene
Tabellenschema; andere Erweiterungen bleiben unzulässig. Der Cloud-Collector
erweitert ausschließlich die isolierte Arbeitskopie innerhalb seiner Transaktion.
Alte veröffentlichte Pakete bleiben lesbar und zeigen fehlende Gruppen offen.
Nach einem separaten Deployment und einer Paketaktualisierung stehen auch dort
die zusätzlichen Gruppen zur Verfügung; das Ändern des Quellcodes veröffentlicht
weder Server noch Marktdaten. Die Detailabfragen sind an die angezeigte Generation
gebunden, die reine Browser-Vorschau erzeugt keine COT-Demodaten.

## Saisonale Darstellung

Der Benutzer hat ausdrücklich **COT-Netto-Positionen im Jahresverlauf** gewählt.
Netto = Long − Short; alternativ Netto / Open Interest × 100. Es handelt sich
um Bestände, keine Renditen, und es gibt keine Indexierung auf 100.
`cot-chart-data.ts` ist die gemeinsame reine Darstellungsberechnung für native
und private Web-Oberfläche. Sie verändert keine Backend-Bewertung.

- Rückblicke: letzte 3, 5, 10 und 15 abgeschlossene Kalenderjahre relativ zum
  aktuellen UTC-Jahr. Das laufende Jahr erscheint optional separat gestrichelt.
- Je Gruppe zählt ein Jahr nur mit mindestens 50 nutzbaren Berichten, erstem
  Bericht spätestens 7. Januar, letztem Bericht frühestens 25. Dezember und
  maximal zehn Tagen Abstand zwischen nutzbaren Berichten.
- Feste Jahreswochen statt ISO-Jahre: 1.–7. Januar ist Woche 1, 24.–31. Dezember
  Woche 52. Der 29. Februar liegt auf der Kalenderposition des 28. Februar.
- Mehrere Berichte derselben Woche werden zuerst innerhalb ihres Jahres gemittelt.
  Danach wird der ungewichtete Durchschnitt der beitragenden Jahre gebildet.
  Bei Prozentdarstellung wird zunächst jeder Bericht durch sein eigenes OI geteilt.
- Ohne mindestens drei beitragende Jahre bleibt ein Wochenwert fehlend. Unter
  fünf Jahren heißt die Stichprobe explorativ. Rückblick, tatsächliche Jahre
  und Anzahl sind sichtbar; Tooltips nennen das `n` der jeweiligen Woche.
- Keine Glättung, Interpolation, Fortschreibung oder Einsetzung fehlender Werte.
  Historische Linien werden bei Abständen über zehn Tagen unterbrochen.
  Echte Null und negative Netto-Positionen bleiben erhalten.
- Die beiden Märkte können unterschiedliche verfügbare Jahre besitzen;
  die gemeinsame Skala behauptet keine identische Stichprobe.

### Einzeljahre und verstellbare Werteskala

Die Ansicht **Einzeljahr · Originalberichte** zeigt sämtliche vorhandenen
wöchentlichen Berichte des gewählten Kalenderjahres. Die einzelnen Werte werden
nicht in Wochenbehältern gemittelt; auch zwei Berichte in der letzten Jahreswoche
bleiben getrennt. Lücken bleiben offen. Das einzelne Jahr ist kein saisonaler
Durchschnitt und benötigt deshalb keine dreijährige Stichprobe. Der 3-Jahres-
Rückblick bietet zusätzlich einen kürzeren, weiterhin klar bezeichneten Mittelwert.
Keine Linie erhält einen gleitenden Durchschnitt oder eine Kurvenglättung.

Historie und Saisonalität besitzen je einen Skalenregler: gemeinsam an die Daten
angepasst (Standard), individuell je Markt oder gemeinsam symmetrisch um Null.
Unter jedem Diagramm lässt sich **Werteskala** aufklappen. Plus/Minus zoomen
vertikal, Min/Max setzen ausdrückliche Grenzen für genau diesen Chart. Ein
manueller Ausschnitt wird so bezeichnet; Auto stellt die gewählte Vergleichsskala
wieder her. Wechsel von Markt, Einheit, Gruppe, Ansicht oder Bezugsjahr setzt
veraltete Grenzen zurück. Deutsche Dezimalkommas werden akzeptiert; leere,
nicht endliche oder umgekehrte Grenzen werden abgelehnt. Zoom verändert weder
die berichteten Zahlen noch die Auswertungen.

### Korrektur fehlender Teilnehmerdaten

Die Diagnose am 26.09.2026 fand im lokalen Bestand 26.513 COT-Beobachtungen,
jedoch null geladene Commercial-/Non-Reportable-Werte. Die seit 15:30 Uhr laufende
Desktop-Instanz verwendete noch das vorherige Backend. Ein vorhandener aktueller
Non-Commercial-Bericht ließ außerdem den geplanten Abruf bereits als erfüllt
gelten. Der Scheduler prüft nun zusätzlich, ob für jeden aktiven Markt mit
vorhandenen Beobachtungen beide neuen Teilnehmergruppen bereits importiert
wurden. Fehlt dieser Erstimport, greift der normale begrenzte Abruf mit seiner
bisherigen atomaren Speicherung und Retry-Regel. Einzelne echte Quellenlücken
lösen anschließend keinen dauernden Neuabruf aus.

Die Oberfläche unterscheidet jetzt eine veraltete native Antwort, fehlende
Teilnehmerdaten und eine tatsächlich zu kurze saisonale Stichprobe. Bei einem
alten Backend wird zum Neustart aufgefordert und der dort wirkungslose
Historienabruf gesperrt. Im privaten Webmodus werden fehlende Gruppen weiter
offen benannt; sie erfordern ein aktuelles veröffentlichtes Paket.

Der reguläre native CFTC-Abruf hat am 26.09.2026 um 17:55 UTC die fehlenden
Gruppen im lokalen Bestand ergänzt: jeweils 26.289 Commercial- und
Non-Reportable-Beobachtungen, darunter je 784 für EUR und USD. Die sieben
älteren EUR-/USD-Berichte vor dem aktuellen 15-Jahres-Abruffenster bleiben für
die zusätzlichen Gruppen leer. Vorher wurde außerhalb des Repository über die
SQLite-Backup-API eine konsistente Sicherung erstellt und mit `quick_check`
geprüft. Ein ausschließlich lesender Vergleich aller 26.513 vorhandenen
Beobachtungen fand keine Änderung an Non-Commercial-Long/Short, Netto oder OI.
Keine direkte SQL-Reparatur und keine Testdaten wurden in den Bestand geschrieben.

## Prüfung

Gezielte Vitest-Prüfungen schützen Jahres-/Schaltjahresgrenzen, Lücken,
Teilnehmerausfälle, Nullwerte, kleine Stichproben, OI-Normalisierung und gleiche
Jahresgewichte. Bedienungstests prüfen vier Diagramme, unabhängige Marktauswahl,
Tauschen, gemeinsame Regler, Generationsbindung und getrennte Fehlerzustände.
Rust prüft Parser, Speicherleser, die additive Migration, alte Pakete und atomare
Paket-Erweiterung. Der Export prüft fehlende, negative und übergroße Teilnehmerwerte.
Browserprüfungen verwenden einen lokalen Prüfaufbau mit öffentlichen CFTC-Daten,
keine persönlichen Journal-Daten. Auswahl, Tauschen und gemeinsame Regler wurden
bedient; bei 320, 390, 768, 1024 und 1440 px entstand kein Seitenüberlauf. Beide
Diagrammreihen bleiben nebeneinander. Die Browserkonsole meldete keine Fehler
oder Warnungen.

Bestanden sind Typecheck, 16 COT-Frontendtests, 16 Tests der Generationsbindung,
28 native COT-Tests, der Test der exakten alten und neuen Cloud-Schemata sowie
neun Exporttests. Gezieltes ESLint, Prettier und Rustfmt sind sauber; Clippy mit
PostgreSQL-Feature und `-D warnings`, Desktop-Frontend-Build und privater
Web-Build bestehen. Die bestehenden Bundle-Größenhinweise bleiben erhalten.

Der echte native Start und CFTC-Abruf wurden mit der eigenen Testidentität
`com.personal-macro.cot-verification` und getrenntem AppData-Verzeichnis geprüft.
Die Testdatenbank enthält 26.289 Berichte für 35 Märkte, jeweils mit allen drei
Teilnehmergruppen. Anschließend wurden EUR und USD über die echte Tauri-Fassade
abgerufen: je 784 Berichte, letzter Stand 22.09.2026, unveränderte Übereinstimmung
mit der bisherigen Non-Commercial-Reihe. Die vier Diagramme wurden in WebView2
angezeigt; keine JavaScript-Laufzeitfehler im Prüflauf. Die persönliche Datenbank
und die bereits laufende Benutzerinstanz wurden nicht für diese Prüfung verwendet.

Beim ersten parallelen Aufbau der leeren Testdatenbank meldeten andere
Marktdatenjobs vorübergehend SQLite-Sperren. Beim erneuten Start mit geladenem
Bestand blieben separate Hinweise zum vorhandenen EODHD-Intraday-Zugriff und
einer bereits laufenden Zentralbankbericht-Aktualisierung. Der COT-Import und
die geprüften COT-Lesepfade bestanden. Diese Hintergrundjobs wurden nicht als
Teil des Vergleichs umgestellt; der native Lauf ist kein Nachweis eines
warnungsfreien Starts sämtlicher Provider.

Lokale Nachweise (ignorierte Prüfartefakte):
`apps/desktop/output/playwright/cot-comparison/desktop-percent.png`,
`mobile.png`, `native.png` und `native-check.json` im selben Verzeichnis.
Es erfolgte kein Cloud-Deployment und keine Änderung veröffentlichter Pakete.

### Abnahme der Korrektur

Die Nachprüfung besteht mit 21 COT-Frontendtests und 29 nativen COT-Tests,
Typecheck, gezieltem ESLint, Prettier/Rustfmt, `cargo clippy --lib -- -D warnings`
und dem regulären `pnpm exec tauri build --no-bundle`. Ein reiner Cargo-Release
ohne Tauri-Protokollfeature wurde als ungeeigneter Einstieg erkannt und durch
den regulären Tauri-Build ersetzt. Die fertige App lädt ihre eingebaute
Oberfläche über `http://tauri.localhost/` ohne Entwicklungsserver.

Die echte lokale App wurde nach der Nachladung über WebView2 geprüft:
Commercials und Non-Reportables als Saisonalität, vier sichtbare Diagramme,
Einzeljahr und manuelle Achsengrenzen mit Zoom und Rücksetzung. Die native
Detailantwort für EUR/USD bestätigt jeweils 784 geladene Berichte beider
zusätzlicher Gruppen und unveränderte Übereinstimmung der Non-Commercial-
Verläufe. Der Prüflauf meldet keine JavaScript-Laufzeitfehler und
`verified: true`. Ein gesonderter Browserlauf prüfte 320, 390, 768, 1024 und
1440 px ohne Seitenüberlauf und ohne Konsolenwarnungen/-fehler.

Ergänzende lokale Nachweise im oben genannten ignorierten Prüfverzeichnis:
`local-recovery-backup.json`, `local-recovery-data.json`,
`recovered-native-report.json`, `recovered-commercials-native.png`,
`axis-single-year.png` und `axis-nonreportables.png`.
Nach der Prüfung wurde die normale sichtbare Desktop-App mit demselben
Release neu gestartet; der temporäre Debug-Zugang ist beendet. Der finale
Prozess antwortet mit Fenstertitel „Personal Macro“, der Startlog meldet nur
die erfolgreiche Atlas-Initialisierung. Kein Entwicklungsserver wird benötigt.
