# Täglicher 4H-/Daily-Charttrend aus MetaTrader 5

Stand: 02.10.2026. Implementiert in der lokalen Desktop-App.

## Bedienung

1. MetaTrader 5 mit dem gewünschten Brokerkonto öffnen und anmelden.
2. Personal Macro starten und **Macro** öffnen. Nach dem Start prüft der
   Hintergrundjob, ob für den aktuellen Berliner Kalendertag ein Abruf fehlt.
3. **MT5-Trends** aktualisiert den Stand bei Bedarf sofort. Der automatische
   Abruf erfolgt einmal täglich; bei laufender App wird der Tageswechsel
   berücksichtigt. Nach einem Fehler folgt nach 30 Minuten ein neuer Versuch.
4. Bei mehreren MT5-Installationen unter **MT5-Verbindung** den vollständigen
   Pfad zur gewünschten `terminal64.exe` speichern. Ein leeres Feld verwendet
   die automatische Terminalerkennung des MT5-Pakets.

Voraussetzungen sind Windows, Python 3 mit dem Paket `MetaTrader5` und ein
erreichbares, angemeldetes Terminal. Es wird kein zusätzliches Datenabo
benötigt; die verfügbaren Symbole und Kursdaten stammen aus der bestehenden
Brokerverbindung. Die App muss für Aktualisierungen laufen. Nach ausgeschaltetem
PC wird beim nächsten Start nachgeholt; es entsteht kein Dienst für den Betrieb
bei ausgeschaltetem Rechner.

## Daten und Berechnung

Der Connector liest je Paar bis zu 300 abgeschlossene Brokerkerzen für H4 und
D1. `copy_rates_from_pos(..., 1, 300)` lässt die aktuelle Kerze aus. Zusätzlich
werden Zeitpunkte, Reihenfolge, Duplikate und gültige positive OHLC-Werte in
Python und erneut im Rust-Backend geprüft. Die nativen Broker-Zeitrahmen
bleiben erhalten; es werden keine H4-Kerzen aus fremden Tagesdaten erfunden.

Die bestehende Methodik `metrics/technical_trend.rs` bleibt unverändert:

- mindestens 100 abgeschlossene Kerzen pro Zeitrahmen;
- OHLC4 als Grundlage der EMA20-/EMA50-Trendbewertung;
- gerichtete, ATR-normalisierte EMA-Steigung und ADX-/DMI-Bestätigung;
- gemeinsames Bullish/Bearish nur bei übereinstimmendem H4- und Daily-Signal;
- neutrale, gegensätzliche und nicht verfügbare Evidenz bleiben unterscheidbar.

Die Heatmap zeigt Daily und 4H einzeln, auch wenn nur ein Zeitrahmen verfügbar
ist. Tooltip und Quellenzeile enthalten Symbol, Brokerquelle, Abrufzeit,
Kerzenstand und berechnete Indikatoren. Bei inversen Quellen wird die
Signalrichtung umgekehrt; die Indikatorzahlen beziehen sich ausdrücklich auf
das angegebene Quellsymbol. Der Fundamentals Score bleibt davon unabhängig.

Symbolzuordnung verwendet die MT5-Währungsmetadaten und Forex-Berechnungsarten.
Broker-Suffixe sind erlaubt. Bei mehreren Kandidaten wird eine eindeutige
sichtbare Variante bevorzugt, danach ein exakter Paarname, danach ein einziger
Kandidat. Mehrdeutige Varianten bleiben unverfügbar. CNH ersetzt niemals CNY.

H4-Kerzen gelten im täglichen Snapshot bis 32 Stunden nach Kerzenschluss als
verwendbar; Samstag bis Montag sind bis 80 Stunden erlaubt. Daily erlaubt vier
Tage. Diese Fristen ändern keine Quellzeitpunkte. Ältere Daten bleiben lokal
gespeichert, liefern aber keinen aktuellen Trend.

## Speicherung und Laufzeit

Migration `0052_mt5_technical_trends.sql` ergänzt drei eigenständige Tabellen:
`mt5_technical_refresh`, `mt5_technical_pairs`, `mt5_technical_candles`.
Marktdaten werden nicht in EODHD- oder Journal-Tabellen geschrieben.

Ein bedingter SQL-Claim schützt jeden Abruf mit einer 120-Sekunden-Lease.
Die Python-Brücke ist auf 90 Sekunden und 8 MiB Antwort begrenzt. Validierung,
Snapshot-Ersetzung und Statusänderung werden atomar veröffentlicht; ein
abgelaufener Worker darf keinen neueren Stand überschreiben. Fehler erhalten
den letzten erfolgreichen Snapshot. Abgebrochene Läufe werden wiederaufgenommen.
Der nächste reguläre Termin ist Mitternacht in Europe/Berlin, einschließlich
Sommer-/Winterzeitwechsel. Der unabhängige Scheduler prüft alle 60 Sekunden.

Die Brücke übernimmt ausschließlich Kursdaten und den Broker-Servernamen.
MT5-Anmeldedaten bleiben im Terminal. Eine Kontoidentität wird nur im
Python-Prozess verglichen, um einen Kontowechsel während des Abrufs zu erkennen;
Kontonummer, Kontostand, Trades und Zugangsdaten verlassen die Brücke nicht.

Der EODHD-Intraday-Netzwerkabruf wurde aus diesem Desktop-Trendpfad entfernt.
Die EODHD-Historien für Seasonality bleiben eigenständig. Alte Intraday-Tabellen
werden weiterhin für bestehende Cloud-Snapshots gelesen. Der private Webmodus
erhält keine MT5-Verbindung und keine automatische Übertragung dieser lokalen
Snapshots. Neue MT5-Tabellen gehören nicht zu den öffentlichen Marktpaketen.

## Prüfung am 02.10.2026

- 15 relevante Rust-Tests bestanden: Trendvektoren, Antisymmetrie, tägliche
  Fälligkeit und DST, konkurrierende/unterbrochene Abrufe, atomare Speicherung,
  fehlende Daten, Aktualität und Terminalpfad-Validierung.
- Migration von Schema 51 auf 52 in einer isolierten Datenbank geprüft;
  bestehender Kontroll-Datensatz blieb erhalten. Leere Testdatenbanken starten.
- Neun Python-Connector-Tests und 16 Macro-UI-Tests bestanden.
- TypeScript-Prüfung, Frontend-Produktionsbuild, gezieltes ESLint/Prettier,
  Rustfmt und `cargo clippy --lib --tests -- -D warnings` bestanden.
  `cargo check --no-default-features --features postgres --lib` bestätigt
  zusätzlich die Kompilierbarkeit des getrennten Cloud-Backends.
- Regulärer optimierter Windows-Build erfolgreich erstellt, mit produktiver
  App-Kennung unter `apps/desktop/src-tauri/target/release/personal-macro-desktop.exe`.
  Er ist neuer als die relevanten Quellen und wird vom bestehenden Starter
  gewählt. Der Starter berücksichtigt jetzt auch eingebettete Python-Connectoren
  und ignoriert deren Bytecode-Cache bei der Prüfung auf Quelländerungen.
- Echter Abruf aus dem geöffneten MT5-Terminal: 28 von 36 Paaren mit
  auswertbaren H4- und Daily-Historien. Die acht CNY-Paare fehlen in dieser
  Brokerquelle und bleiben explizit nicht verfügbar.
- Der separate Live-Rust-Test durchlief die tatsächliche Python-Prozessbrücke,
  Validierung, SQLite-Speicherung und Trendberechnung. Ein zweiter automatischer
  Aufruf am selben Tag änderte den Abrufzeitpunkt nicht. Journal unverändert.
- Echte Tauri-Anwendung mit abweichender Testidentität gestartet: Fenster und
  isolierte SQLite-Datenbank angelegt, kein Initialisierungsfehler. Der Test
  wurde vor den anderen Providerjobs beendet. Die persönliche Datenbank wurde
  dafür nicht geöffnet oder migriert.
- Browser-Sichtprüfung der echten Macro-Komponente mit gekennzeichneten
  Testdaten bei 1024 und 1440 px; keine Seitenüberbreite, getrennte Zeitrahmen
  passen in die Trendspalte. Keine Browserfehler oder Konsolenwarnungen.
  Dies ist keine vollständige native UI-Abnahme.

Der Live-Test ist bewusst standardmäßig deaktiviert. Er benötigt ein geöffnetes
MT5-Terminal und ein ausdrücklich angegebenes Verzeichnis für isolierte Daten:

```powershell
cd D:\Macrotool\apps\desktop\src-tauri
$env:MACRO_MT5_SMOKE_ROOT = 'D:\Codex\Work\macrotool-mt5-trends-20261002'
cargo test --lib live_mt5_round_trip_in_isolated_workspace -- --ignored --nocapture
```

Optional wählt `MACRO_MT5_SMOKE_TERMINAL` eine konkrete `terminal64.exe`.
Der Test schreibt nur einen Markt-/Trendbericht in das angegebene Verzeichnis
und verwendet eine separate temporäre Datenbank darunter. Nachweise dieses
Laufs liegen außerhalb der versionierten Quellen in diesem D:-Verzeichnis;
UI-Bilder unter `apps/desktop/output/playwright/mt5-trends/`.
