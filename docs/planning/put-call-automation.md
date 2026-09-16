# Put/Call Ratio – archivierte Umsetzung

Stand: 15.09.2026.

## Aktueller Stand: Bereich entfernt

Auf Wunsch des Benutzers wurde der Bereich am 15.09.2026 vorerst aus der
Desktop-App entfernt, nachdem der CME-Datenzugang nicht nutzbar war.
Seite, Route, Navigationseinträge, Frontend-Verträge, Browser-Adapter, native
Commands, Importe und Hintergrundjob wurden entfernt. Alte Seitenlinks werden
durch die allgemeine Routenregel zur Übersicht weitergeleitet.

Die Migrationen `0032`, `0033` und `0048` bleiben unverändert. Vorhandene
Put/Call-Daten werden nicht gelöscht und bleiben auch beim Journal-Reset
geschützt. Die produktive Benutzerdatenbank wird durch diese Entfernung nicht
direkt bearbeitet.

### Prüfung der Entfernung

- `pnpm build` einschließlich TypeScript-Prüfung: bestanden.
- Navigation sowie Import-/Export- und Kontobezug: acht Vitest-Tests bestanden.
- `cargo test journal_reset --lib -j 2`: vier Tests bestanden.
- `cargo clippy --all-targets -j 2 -- -D warnings`: bestanden.
- Fokussiertes ESLint und Rustfmt für die geänderten Quelldateien: bestanden.
- Browser-Prüfung: `/put-call-ratio` führt zur Übersicht; Seitenleiste und
  Befehlssuche enthalten keinen Put/Call-Eintrag. Keine JavaScript-Fehler.
- Quelltext- und Build-Prüfung: kein Put/Call-Laufzeitcode mehr. Nur der
  Schutz historischer `put_call_*`-Tabellen im Journal-Reset bleibt bestehen.
- Windows-Debug-Build erstellt und mit dem separaten Test-Identifier
  `com.personal-macro.put-call-qa` real gestartet. Prozess reagiert,
  Datenbank-/Atlas-Initialisierung erfolgreich, keine Initialisierungswarnung.
  Die Testinstanz wurde anschließend beendet; die laufende Benutzer-App blieb
  geöffnet. Die Änderung wird dort beim nächsten Build und Neustart wirksam.

**Archivhinweis:** Alle folgenden Abschnitte beschreiben den früheren
Implementierungsstand und seine damaligen Prüfungen. Sie sind keine Beschreibung
aktiver Funktionen. Eine erneute Datenanbindung ist derzeit nicht beauftragt.

## Ergebnis und offene Zugriffsvoraussetzung

Die Desktop-App besitzt einen eigenständigen automatischen Abruf des bisherigen
[CME Daily FX Options Update](https://www.cmegroup.com/reports/fx-put-call.pdf).
Ein Direktdownload mit dem produktiven User-Agent hat am 15.09.2026 jedoch
HTTP 403 zurückgegeben. Die CME-Antwort benennt ausdrücklich eine Sperre für
automatisierte Zugriffe. Deshalb ist der Live-Datenbezug derzeit blockiert;
die vorhandene Importstrecke allein löst den manuellen Download nicht ab.

Die Implementierung umgeht diese Sperre nicht. Ein freier maschinenlesbarer
Zugang für genau diesen Notional-Bericht ist bisher nicht bestätigt.
[CME DataMine List API](https://www.cmegroup.com/datamine/datamine-list-api.html)
ist eine offiziell dokumentierte Alternative zur Dateizustellung, verlangt
aber authentifizierte und für den jeweiligen Datensatz berechtigte Zugänge.
Ob genau die bestehende FX-Berichtsgrundlage darüber geliefert werden kann,
muss mit dem konkreten Zugang geprüft werden. Kein Konto und kein Abonnement
wurden angelegt. Zugangsdaten werden nicht über die Put/Call-Seite abgefragt.

Der Benutzer hat inzwischen ein gewöhnliches CME-Konto angelegt; eine
Datensatz- oder API-Freischaltung ist noch nicht bestätigt. Ein gewöhnliches
[CME-Konto](https://login.cmegroup.com/sso/register/) kann kostenlos angelegt
werden; CME bezeichnet es in seinem
[Bildungsangebot](https://www.cmegroup.com/education/files/educational-inventory.pdf)
ausdrücklich als kostenlos. Das Konto allein bestätigt keine Berechtigung
für den automatischen FX-Berichtsabruf.

Eine anschließende direkte Prüfung des aktuellen DataMine-Shops am 15.09.2026
ergab eine konkretere kostenlose Möglichkeit als die allgemeine
[Zugangs-FAQ](https://www.cmegroup.com/articles/faqs/access-to-cme-group-settlement-data-faq.html):
[FX End of Market Summary – Basic](https://datamine.new.cmegroup.com/catalog/dataset/1a559536dd9d5cd4e3fb46e7a91e5dc5)
zeigt **Monthly Subscription: $0.00 / month**. Die historischen Einmalkäufe auf
derselben Seite sind kostenpflichtig. Diese Beobachtung bestätigt den
angezeigten Abopreis, noch keine Bestellung, Freischaltung oder erfolgreiche
API-Verbindung. Warenkorb und Konto wurden nicht verändert.

Der Datensatz heißt `BAS_STLCUR`; das aktuelle Dateimuster im Shop lautet
`{YYYYMMDD}-STLBASIC_STLCUR_EOM_SUM_0`. Angezeigt werden tägliche Zustellung und
API, E-Mail, S3 und SFTP als Lieferwege. Der Kategorienhinweis nennt Mitternacht
Chicago als Bereitstellung und ab 01.01.2027 07:00 Uhr Chicago am Folgetag.
Die [offizielle Basic-Dokumentation](https://cmegroupclientsite.atlassian.net/wiki/spaces/EPICSANDBOX/pages/457572776)
beschreibt Settlement-, Volumen- und Open-Interest-Daten als Textdateien.

Die kostenlose Basic-Datei ist ein Kandidat für die neue Datenanbindung. Sie
ist nicht der bisherige PDF-Bericht. Vollständige Abdeckung der sieben
Währungen, Put-/Call-Zuordnung, Notional-Gewichtung und Wertegleichheit sind
vor einer Umstellung anhand echter Dateien zu prüfen. Der Download der
öffentlichen älteren Beispieldatei endete lokal mit Zeitüberschreitung, ohne
Daten zu liefern. Eine vollständige Prüfung ihres Inhalts wird nicht
behauptet. Ob der genaue FX-Notional-Bericht selbst automatisch geliefert
werden kann, kann der im Bericht genannte Kontakt `cmefxoptions@cmegroup.com`
klären. Es wurde keine Anfrage versendet.

Eine Kontraktvolumen-PCR, Volatilität oder Aktien-/ETF-PCR wird nicht als
identischer Ersatz eingesetzt.

## Laufzeit

- Default: Automatik aktiv, eigene Schleife zehn Sekunden nach App-Start.
- Fälligkeit wird einmal pro Minute lokal geprüft. Die Schleife hängt nicht
  hinter langen COT-, Seasonality- oder Zentralbank-Downloads.
- Nach Erfolg frühestens in sechs Stunden erneut herunterladen, auch nach
  Neustart. Manuelle Aktualisierungen können ausdrücklich früher erfolgen.
- Fehler: Wiederholung nach 15, 60, anschließend jeweils 360 Minuten.
- HTTP 403: persistierter Sperrstatus ohne weitere automatische Anfragen.
  Erst die ausdrückliche Aktion „Zugriff erneut prüfen“ prüft den Zugang erneut.
- Eine Pause bleibt gespeichert. Ein manueller Abruf aktiviert sie nicht neu.
- SQLite-Lease: ein Netzabruf zur selben Zeit, auch bei zwei App-Prozessen.
  Nach fünf Minuten kann ein unterbrochener Abruf übernommen werden.
- Kein externer Windows- oder Cloud-Dienst: bei geschlossener App keine Abrufe.
- Der feste PDF-Link bietet einen Tagesbericht. Fehlende vergangene Tage können
  damit nicht rekonstruiert werden; der bestehende Archivimport bleibt separat.

## Datenintegrität

Migration `0048_put_call_automation.sql` ergänzt ausschließlich eine Statuszeile.
Alte Migrationen bleiben unverändert. Der Zustand automatischer Downloads wird
separat von `put_call_sync_runs` gehalten, damit ein erfolgreicher manueller
Import einen gesperrten Netzwerkzugang nicht scheinbar repariert.

PDF-Downloads haben zehn Sekunden Verbindungs- und dreißig Sekunden Gesamtlimit,
folgen keinen Weiterleitungen und prüfen MIME-Typ, PDF-Signatur und maximal
8 MiB Inhalt. Die Größenprüfung erfolgt auch während des Einlesens ohne
Content-Length. PDF-Parsing läuft außerhalb des asynchronen Arbeitsloops.
Berichtsdatum, alle sieben Währungszeilen und Notional-Summen werden geprüft;
ein zukünftiger Bericht wird abgelehnt. Gültige Beobachtungen werden gemeinsam
über die bestehende Transaktion geschrieben. Der Schlüssel aus Asset und
Handelstag verhindert Duplikate; ein erneut veröffentlichter Tagesstand kann
denselben Tag korrigieren.

Put/Call-Rechnung, Inversion, MA5, Kalibrierung und Vorrang offizieller PDFs vor
XLSX-Kontraktvolumina bleiben erhalten. Es gibt keine Änderung der Macro-Scores.

## Oberfläche

Der Status zeigt automatische Aktivierung beziehungsweise Pause, laufenden
Abruf, Erfolg, vorübergehenden Fehler oder CME-Sperre. Abrufversuch, erfolgreicher
Download und Berichtsdatum sind getrennt. Während eines Abrufs liest die UI den
lokalen Zustand alle zwei Sekunden, sonst alle dreißig Sekunden. Mutationen
invalidieren nur `put-call`. Die Browser-Vorschau simuliert keine Marktdaten und
erlaubt weder Downloads noch die Aktivierung einer scheinbaren Automatik.

## Prüfung

Die fokussierten Tests prüfen erfolgreiche PDF-Verarbeitung, sieben Assets,
Duplikatvermeidung, Fälligkeit, persistierte Sperre, Fehlererholung, Pause,
parallele Ansprüche, Wiederaufnahme nach Unterbrechung, Größenlimits,
Weiterleitungen, Migration mit existierenden Beobachtungen und UI-Status.
HTTP-Testantworten stammen ausschließlich von lokalen Testservern; sie sind
kein Nachweis eines funktionierenden CME-Livezugangs.

Ergebnisse vom 15.09.2026:

- `cargo test put_call --lib -j 2`: 32 bestanden.
- `pnpm exec vitest run src/features/put-call-ratio/put-call-ratio-page.test.tsx --maxWorkers=2`:
  21 bestanden.
- `pnpm typecheck`, fokussiertes ESLint und `pnpm build`: bestanden.
- `cargo clippy --all-targets -j 2 -- -D warnings`: bestanden.
- Geänderte Rust-Dateien: `rustfmt --check` bestanden. Der globale
  `cargo fmt --all -- --check` meldet bereits vorhandene Formatabweichungen in
  `world_atlas/mod.rs`, `world_atlas/notebook.rs` und `world_atlas/public_source.rs`.
  Diese fachfremden Dateien wurden nicht dafür verändert.
- Native Windows-App als Debug-Build erstellt und real gestartet, mit separatem
  Test-Identifier `com.personal-macro.put-call-qa`. Die produktive Journal-
  Datenbank wurde für diese Prüfung nicht geöffnet oder kopiert.
- Der echte Startup-Job liefert `PUT_CALL_SOURCE_BLOCKED`; die Oberfläche zeigt
  den Fehler und den tatsächlichen Versuchstermin. Pause bleibt nach Neuladen
  erhalten. Kein vorgetäuschter erfolgreicher Download.
- Browser- und native Oberfläche ohne JavaScript-Fehler; Sichtprüfung bei
  1536 und 1024 Pixeln. Native Initialisierung ohne neue Initialisierungswarnung.
  Ein späterer, fachfremder Technicals-Job meldete fehlenden Zugriff auf
  EODHD-Intraday-Historie; der Put/Call-Job ist davon unabhängig.
- `git diff --check` für betroffene Dateien bestanden. Bestehende Benutzer-
  Änderungen bleiben erhalten; kein Commit erstellt.

Ein anfänglich mit zusätzlichem `--` gestarteter Vitest-Aufruf wählte irrtümlich
die gesamte Suite einschließlich lokaler Atlas-Prüfdateien. Dieser Lauf wurde
abgebrochen; die oben genannte explizite Dateiauswahl lief anschließend vollständig
und erfolgreich. Eine erfolgreiche Gesamtsuite wird nicht behauptet.
