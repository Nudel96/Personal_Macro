# Wiederaufnahme der letzten Atlasansicht bei Schreibsperren

Stand: 9. September 2026. Der Weltatlas-Gesamtauftrag bleibt offen.

Beim ersten Start zweier isolierter Prüfprofile scheiterte das Speichern der
letzten Auswahl mit `SQLITE_BUSY`. Die Präferenz wurde danach erst bei einer
weiteren Änderung oder beim Verlassen der Seite erneut geschrieben. Ein
schnelles Zurückkehren konnte außerdem die ältere Datenbankauswahl lesen,
während der Schreibvorgang der vorherigen Seite noch wartete.

## Eingrenzung und Verhalten

Die fünf Sekunden lange SQLite-Wartezeit kann von Hintergrundimporten
überschritten werden. Im ursprünglichen FAO-Prüfprofil lagen die Zeitstempel
der 26.280 COT-Quellzeilen zwischen 07:42:32,944 und 07:42:44,298 UTC. Der Code
verarbeitet diese Zeilen innerhalb einer gemeinsamen Schreibtransaktion.
Der Präferenzfehler trat im selben Startlauf auf. Das grenzt den konkurrierenden
Import als Auslöser ein; es ist keine separate Messung des exakten Zeitpunkts,
an dem SQLite die Schreibsperre übernommen hat.

SQLite unterscheidet `BUSY` durch konkurrierende Verbindungen von `LOCKED`
innerhalb einer Verbindung beziehungsweise eines gemeinsamen Caches. Die
konfigurierte Wartezeit beendet einen Versuch, sobald die Sperre zu lange
besteht. [SQLite-Fehlercodes](https://www.sqlite.org/rescode.html#busy),
[Wartezeit](https://www.sqlite.org/c3ref/busy_timeout.html).

Die Änderung behandelt ausschließlich den einzelnen, idempotenten Upsert der
letzten Atlasansicht:

- Das Backend liefert für SQLite `BUSY` einschließlich erweiterter BUSY-Codes
  den stabilen Command-Code `ATLAS_PREFERENCES_BUSY`. Andere Fehler behalten
  ihren bisherigen Fehlerpfad.
- Die bestehende geordnete Schreibkette versucht diese Speicherung höchstens
  dreimal zusätzlich, mit Pausen von 250, 750 und 1.500 Millisekunden. Die
  normale Datenbank-Wartezeit gilt weiter für jeden Versuch.
- Neuere Auswahlen ersetzen noch wartende ältere Aufträge. Ein bereits
  laufender erfolgreicher Schreibvorgang darf abschließen; anschließend folgt
  die neueste Auswahl. Eine überholte Auswahl wird nicht erneut versucht und
  nicht als gespeichert markiert.
- Beim Wiederöffnen wartet das Lesen der letzten Ansicht auf den Abschluss
  der vorherigen Schreibkette. Ausdrückliche Links und zwischenzeitliche
  Navigation haben weiterhin Vorrang vor einer Wiederherstellung.
- Nach erfolgreichem Nachspeichern verschwindet ein früherer Speicherhinweis.
  Andere Fehler und eine über alle Versuche fortbestehende Sperre bleiben
  sichtbar. Ein reguläres Verlassen stößt weiterhin den eigenen letzten
  Schreibauftrag an.

COT-Import, Scoring, allgemeine Datenbank-Zeitlimits und andere Schreibbefehle
werden nicht verändert. Insbesondere das Erstellen einer gemerkten Notiz wird
nicht automatisch wiederholt. Es gibt keine neue Migration, Quelle oder
Netzwerkanbindung. Ein erzwungenes Beenden vor dem tatsächlichen Abschluss kann
weiterhin der Speicherung zuvorkommen.

## Nachweise

Fünf ergänzte Frontendtests prüfen erfolgreiche Wiederholung ohne Navigation,
die Obergrenze bei anhaltender Sperre, die neueste Auswahl statt überholter
Zwischenstände, keine automatische Wiederholung anderer Fehler und schnelles
Wiederöffnen. Die vier bisherigen Tests für Wiederherstellung, Linkpriorität,
Lesefehler und Reihenfolge bestehen weiterhin.

Ein zusätzlicher Rust-Test hält über eine zweite reale SQLite-Verbindung eine
Schreibtransaktion offen. Der bisherige Präferenzstand bleibt nach dem
abgelehnten Upsert unverändert; nach Freigabe kann der neue Stand gespeichert
werden. Ein schreibgeschützt geöffneter Speicher liefert weiterhin den normalen
Datenbankfehler, nicht den vorübergehenden BUSY-Code.

In der echten Tauri-App wurde ausschließlich das neue Profil
`com.personal-macro.atlas-preferences-recovery-20260909` verwendet. Ein separater
Python-Prozess hielt dort dreimal eine reale Schreibsperre für jeweils neun
Sekunden. Die produktive React-Speicherlogik und echte Tauri-Commands belegen:

| Ablauf | Überprüftes Ergebnis |
| --- | --- |
| Unveränderte Indien-Auswahl | Erster Versuch erhält BUSY, erneuter Versuch speichert nach Freigabe erfolgreich. |
| USA → Deutschland → China während der Sperre | Der bereits laufende USA-Versuch endet mit BUSY; anschließend wird nur China geschrieben. Der überholte Deutschland-Zwischenstand wird übersprungen. |
| Verlassen und sofortiges Wiederöffnen | Die neue Seite liest erst nach der ausstehenden Speicherung und zeigt Deutschland mit dem gewählten historischen Zeitraum. |
| Vollständiger Prozessneustart | Dieselbe Deutschland-Auswahl wird aus SQLite wiederhergestellt, ohne unnötige erneute Präferenzschreibung. |

Der unabhängige [Prüfer](evidence/audit_preferences_recovery.py) vergleicht
Sperrzeitpunkte, native Aufrufzeiten, BUSY-Antworten, Reihenfolge, gerenderte
Auswahl und den tatsächlichen SQLite-Stand.
[Vollständiger Nachweis](evidence/preferences-recovery-readiness.json).
Die Auswahländerungen der nativen Prüfung wurden programmgesteuert ausgelöst;
das ist keine vollständige native Klickabnahme des Weltatlas.

Die absichtlich erzeugten Sperren trafen im Test auch automatische Providerjobs,
die entsprechende Datenbankwarnungen meldeten. Beim anschließenden normalen
Neustart wurde keine neue Atlaswarnung beobachtet; die bekannten Meldungen zu
EODHD-Intradayzugriff und überlappenden Zentralbankberichten blieben bestehen.
Die persönliche Produktionsdatenbank wurde nicht verwendet.

149 Atlas-Frontendtests in 23 Dateien und 227 Rust-Librarytests bestehen;
20 explizit externe/manuelle Rust-Prüfungen bleiben im Standardlauf ausgenommen.
Typecheck, Produktionsbuild, gezieltes ESLint/Prettier, Rustfmt und Clippy für
alle Targets mit `-D warnings` bestehen. Die dokumentierten größeren
Produktionschunks bleiben eine bestehende Build-Meldung.
