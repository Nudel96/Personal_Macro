# Automatische Cloud-Aktualisierung

Stand: 15.10.2026. Die ursprüngliche Automation ist im bestehenden privaten Cloudprojekt
bereitgestellt und am veröffentlichten Host geprüft. Die persönliche
Myfxbook-Verbindung wird durch den Besitzer in der App aktiviert.

## Vereinbarter Betrieb

- Wirtschaftsdaten: viermal täglich um 00, 06, 12 und 18 Uhr UTC für AUD, CAD,
  CHF, CNY, EUR, GBP, JPY, NZD und USD abrufen. Im deutschen Sommer entspricht
  das 02, 08, 14 und 20 Uhr, im Winter 01, 07, 13 und 19 Uhr. Jeder Cloudabruf
  prüft sieben vergangene und vierzehn kommende Tage; vorhandene Historie bleibt
  erhalten. Die bisherige reine Wochenplanung wird dadurch ersetzt.
  Nach einer Unterbrechung wird der aktuelle Slot nachgeholt, ohne alle
  vergangenen Slots erneut abzuarbeiten.
  Freigegebene, aktivierte Indikatorreihen erhalten dauerhafte Jobs für eine
  Stunde nach ihrem jeweiligen Veröffentlichungstermin. Die vorhandene native
  Zuordnung und Actual/Forecast-Scoringlogik gelten auch in der Cloud.
- COT: offizieller CFTC-Veröffentlichungskalender mit `America/New_York`,
  Sommerzeit und Feiertagsverschiebungen; erster Abruf eine Stunde nach der
  Veröffentlichung. Das erwartete Berichtsdatum wird vor Freigabe geprüft.
- Myfxbook: nach einmaliger Cloud-Anmeldung und Bestätigung der Importvorschau
  alle sechs Stunden, in UTC-Slots um 00, 06, 12 und 18 Uhr. Aktivierung holt den
  aktuellen Slot nach. Im deutschen Sommer sind die regulären Slots 02, 08, 14
  und 20 Uhr, im Winter 01, 07, 13 und 19 Uhr. Der PC muss nicht laufen.

Die Zeitpunkte sind früheste Abrufzeitpunkte. Warteschlangen, Ausfälle oder noch
nicht verfügbare Providerwerte können den Abschluss verzögern. Wirtschaftsdaten
ohne erforderlichen Actual oder Forecast ersetzen keine vorhandene vollständige
Bewertung; aus fehlenden Werten entsteht kein neutrales Signal. Wiederholungen
sind begrenzt und der Aktualisierungsstatus ist in der Oberfläche sichtbar.

## Ablauf und Persistenz

Vercel Hobby bleibt unverändert. Zwei tägliche Cron-Auslöser rufen die internen
Planer auf: `/api/cron/providers` um 00 UTC und `/api/cron/cot` um 16 UTC.
Der tägliche Aufruf plant den aktuellen Sechs-Stunden-Slot und die nächsten
24 Stunden für jede der neun Währungen. Eindeutige Slot-/Währungsschlüssel
verhindern doppelte Abrufe bei wiederholter Planung. Der nächste Slot ist bereits
dauerhaft gespeichert; jeder abgeschlossene Worker stößt den Dispatcher erneut an.
Alte unerledigte Slotjobs verfallen nach sechs Stunden. Die vorhandenen separaten
Release-Jobs behalten ihre begrenzten Wiederholungen.
Die minütliche Ausführung vieler Cronjobs ist nicht nötig: Vercel Queues hält
die fälligen Einzelaufgaben mit verzögerter Zustellung. Beide Queue-Worker
arbeiten in `fra1`, jeweils mit maximal einer parallelen Zustellung.

PostgreSQL speichert Jobidentität, Fälligkeit, Lease, Versuche, Staging und
Abschluss. Doppelte Zustellungen können denselben Auftrag nicht doppelt anwenden.
Netzwerkabrufe erfolgen außerhalb der Datenbanktransaktion. Abschluss und
Veröffentlichung prüfen das Lease erneut. Providerjobs versuchen höchstens
achtmal; vorübergehende Fehler werden mit Abstand erneut versucht.

Eine fachlich erwartete Wartezeit (zum Beispiel ein noch fehlender Forecast)
wird als eigene, verzögert zugestellte Nachricht eingeplant. Erst nach deren
bestätigter Annahme wird die aktuelle Nachricht quittiert. Die neue Nachricht
bleibt innerhalb der ursprünglichen Aufbewahrungsfrist; Job-Lease, Fälligkeit
und die maximal acht Datenabrufe werden weiterhin in PostgreSQL geprüft.
HTTP 202 mit `messageId: null` gilt gemäß Queue-SDK als bestätigte, verzögerte
Annahme und bricht die Einplanung weiterer Jobs nicht ab.

Wirtschaftsabrufe bearbeiten ausschließlich eine temporäre Kopie des geprüften
öffentlichen Macro-Pakets. Der Export erzeugt ein neues Paket anhand der festen
Tabellen-/Spaltenfreigabe. Das Paket wird privat gespeichert, erneut geladen
und mit Hash, Größe, Schema sowie nativem Reader geprüft. Erst danach wird der
Generationszeiger atomar ersetzt. Alle anderen Marktobjekte werden weiterverwendet.
COT folgt demselben Veröffentlichungsvertrag. Die Journalrevision bleibt bei
Marktaktualisierungen unverändert.

Wiederholte Release-Abrufe vergleichen die tatsächlichen Quellwerte ohne
Abrufzeitstempel. Unveränderte Daten erzeugen weder ein weiteres Blob-Paket
noch eine neue Generation. Auch dieser Abschluss prüft Job-Lease und aktive
Generation; fehlende Actual-/Forecast-Werte behalten ihren Wiederholungsstatus.

Die Oberfläche überprüft Marktgeneration und Verbindungsstatus bei geöffneter
Seite regelmäßig und bei Rückkehr. Änderungen invalidieren die betroffenen
Abfragen. Ein laufender Scan behält seine ursprüngliche Generation.

Die lokale Desktop-App verwendet dieselben vier UTC-Slots, solange sie läuft.
Ihr eigener Scheduler prüft jede Minute, unabhängig von längeren Seasonality-
oder Berichtsabrufen. Nur ein erfolgreicher vollständiger Abruf aller neun
Währungen erfüllt einen Slot; Einzelreihenimporte, Release-Nachprüfungen sowie
fehlgeschlagene oder unvollständige Läufe verschieben ihn nicht. Ein vollständiger
manueller Abruf erfüllt den laufenden Slot ebenfalls. Maßgeblich ist die Startzeit,
damit ein über die Zeitgrenze laufender Abruf keinen zweiten Slot verbraucht.
Nach App-Neustart wird der aktuelle fehlende Abruf nachgeholt. Die bestehende
lokale Historienbreite und Release-Nachprüfungen bleiben erhalten.

Die Änderung benötigt keine SQLite-/PostgreSQL-Migration, keine neuen Secrets
und keinen zusätzlichen Cronjob oder Tarifwechsel. Desktop und Cloud rufen den
Provider weiterhin getrennt ab; ihre Datenbanken synchronisieren sich nicht.

## Myfxbook einrichten

Im privaten Workspace **Einstellungen → Konten** öffnen, das passende bestehende
Konto wählen und im Abschnitt **Myfxbook automatisch synchronisieren** anmelden.
Das Myfxbook-Portfolio und seine Brokerzeitzone auswählen, die Vorschau prüfen
und aktivieren. Die Desktop-Anmeldung wird nicht automatisch übertragen.

Myfxbook-Sitzungen sind IP-gebunden. Jeder Cloud-Abruf meldet sich deshalb in
derselben Ausführung neu an und beendet die Sitzung anschließend bestmöglich.
Passwörter stehen weder in Antworten noch Browserpersistenz oder Query-Caches.
Serverseitige Credentials und kurzlebige Anmeldungen/Vorschauen werden mit
ChaCha20-Poly1305, zufälligem Nonce und an Workspace/Konto/Vorgang gebundenem
AAD verschlüsselt. Der Schlüssel liegt getrennt als sensible Servervariable.
Anmeldungen verfallen nach 15 Minuten, Vorschauen nach zehn Minuten.

Aktivierung prüft den Vorschau-Fingerprint erneut. Automatische Importe nutzen
den vorhandenen nativen Reconciliation-Plan und erhalten zugeordnete Trade-IDs,
Notizen und manuelle Risikowerte. Journaländerungen, Revision, Verknüpfungen und
Importbeleg einschließlich begrenztem Vorherabbild werden gemeinsam bestätigt.
Ein unveränderter Quellenstand erzeugt keine neue Journalrevision. Veraltete
Vorschauen oder zwischenzeitliche Journaländerungen werden nicht überschrieben.

Pausieren sperrt auch bereits laufende Jobs vor deren Abschluss. Trennen entfernt
Credentials und Vorschauen; bereits importierte Trades bleiben erhalten.
Anmeldefehler oder fachliche Unstimmigkeiten verlangen eine erneute Prüfung.
Es werden keine Brokerorders ausgeführt. Die Myfxbook-API liefert eine begrenzte
Historie (zuletzt 50 Einträge); hohe Aktivität oder längere Ausfälle können eine
manuelle Ergänzung über die bestehenden Importwege erforderlich machen.

## Speicher und Betrieb

Migrationen `0007`–`0010` ergänzen COT-/Providerjobs, verschlüsselte Anmeldungen,
Myfxbook-Verknüpfungen/Importbelege und die Aufbewahrung von Providerobjekten.
Sie wurden nach Identitäts- und Checksum-Prüfung mit privater Sicherung außerhalb
des Repository angewendet. Bestehende persönliche Daten und Revision 3 blieben
unverändert. Nachweis: `.vercel/provider-migration-report.json` (nicht versioniert).

Neue Macro-Pakete werden direkt vom Rust-Server zum privaten Blob-Speicher
hochgeladen; die vier-MiB-Grenze der JSON-Antworten bleibt erhalten. Aufbewahrung
betrifft ausschließlich vom neuen Scheduler registrierte Macro-/COT-Objekte:
mindestens 24 Stunden und die letzten acht Generationen. Referenzen der aktiven
Generation oder eines noch gültigen Jobs verhindern das Entfernen. Alte
Generationsmetadaten können entfallen, während weiterhin verwendete Objekte
erhalten bleiben. Ursprüngliche Marktpakete und persönliche Bilder werden nicht
durch diese Bereinigung entfernt. Pro Konto bleiben acht Importvorherabbilder,
erledigte Providerjobs mindestens 90 Tage erhalten.

Benötigte **Servervariablen** (keine `VITE_`-Variablen): `CRON_SECRET`,
`EODHD_API_KEY`, `MACRO_PROVIDER_KEY` (32 zufällige Bytes als Base64) und die
Flags `MACRO_ECONOMIC_AUTOMATION`, `MACRO_COT_AUTOMATION`,
`MACRO_MYFXBOOK_AUTOMATION`, jeweils `1`. Bestehende Datenbank-, Blob- und
Gateway-Konfiguration bleibt erforderlich. Schlüssel nicht ohne kontrollierte
Neuanmeldung/Rotation ersetzen. Browserkommandos sind capability-begrenzt;
Jobendpunkte benötigen interne HMAC-Signaturen, Cronendpunkte ihr eigenes Secret.

Es wurde kein kostenpflichtiger Tarifwechsel vorgenommen. Der vereinbarte
Kostenrahmen bleibt höchstens 10 EUR monatlich; zusätzliche kostenpflichtige
Anbieteroptionen sind nicht Teil dieser Änderung.

## Prüfung und Grenzen

- 69 Node-Tests für Gateway, COT und Providerworker, einschließlich verzögerter
  Queue-Annahme, getrennt eingeplanter Wiederholungen und Aufbewahrungsgrenzen.
- TypeScript, privater Web-Build, gezielte Frontendtests und ESLint.
- Cloud- und Desktop-Clippy mit Warnungen als Fehler.
- Isoliertes PostgreSQL: Kontolebenszyklus, doppelte Zustellung, unveränderte
  Revision bei unverändertem Inhalt, Konflikte, Trennen/Pausieren und
  referenzsichere Aufbewahrung; bestehende atomare Journalcommands bestehen.
- Native Myfxbook-Reconciliation: 34 Tests; EODHD: 30 Tests, ein bewusst
  nicht ausgeführter Provider-Livetest; COT-Kalender: vier Grenz-/Feiertagstests.
- Zusätzlicher echter EODHD-Abruf aller neun Währungen auf einer temporären
  Kopie des öffentlichen Pakets: 60.090 exportierte öffentliche Zeilen,
  41 erkannte Release-Jobs; Originaldatei bytegleich. Der Test deckte einen
  SQLite-ATTACH-Fehler auf: Die Produktionsverbindung darf die bestehende
  Arbeitskopie öffnen, aber keine neue angehängte Datei erzeugen. Der Export
  legt sein neues Ziel nun atomar mit `create_new` an, bevor er es anhängt.
  Derselbe vollständige Live-Test besteht nach der Korrektur.

Die tatsächliche Myfxbook-Anmeldung und der erste persönliche Cloudimport
benötigen die einmalige Eingabe durch den Besitzer in der App. Zugangsdaten
werden nicht aus dem Chat oder dem lokalen Windows-Anmeldespeicher übernommen.
Automatische Desktop-/Cloud-Datenbanksynchronisierung, neue Cloudabrufe für
Seasonality, Zinsen, Atlas und Berichte sowie eine physische iPhone-Abnahme
werden mit dieser Erweiterung nicht zugesagt.

Der lokale WebKit-Lauf mit der kompilierten privaten Oberfläche und dem echten
Backend bestand am 26.09.2026: Übersicht, Trades, sechs Analyseseiten und die
Myfxbook-Einrichtung bei 390 px. Passwortfeld leer, Intervall sechs Stunden,
keine persönlichen Schreibbefehle, kein Seitenüberlauf, Testzugang anschließend
widerrufen. Die mobilen COT-Auswahlelemente begrenzen den WebKit-Überlauf langer
Marktnamen; die Chartfläche bleibt horizontal scrollbar. Dieser lokale UI-Lauf
allein ersetzt nicht die nachfolgende Prüfung der bereitgestellten Oberfläche.

## Produktionsabnahme

Deployment `dpl_Hpi448CaLwbTeNXp4rkgamBFUdQR` ist `READY`, `public: false`,
Region `fra1`, mit Web, Gateway, Rust-Backend und beiden Queue-Workern.
Der bestehende Alias `personal-macro-nudel96s-projects.vercel.app` zeigt auf
`personal-macro-bzmoadfjx-nudel96s-projects.vercel.app`. Besitzer-/SSO-Schutz
für sämtliche Deployments wurde beibehalten; kein kostenpflichtiger Tarifwechsel.

Die echten Cron-Aufrufe wurden am 26.09.2026 um 16:20 UTC erneut ausgelöst.
Alle neun Wirtschaftswochenjobs sind um 16:22:52 UTC abgeschlossen. Neun neue
Macro-Objekte wurden über den produktiven Export-, Blob-, Prüf- und
Veröffentlichungspfad erzeugt; die aktive Gesamtgeneration enthält weiterhin
555 Pakete. Der überprüfte Stand `e717f0af-1d2d-4a82-8273-9993ffd3460a`
umfasst 141.810.552 Transportbytes. 38 noch nicht fällige Release-Jobs und drei
Wiederholungen wegen unvollständiger Quellen sind eingeplant. Die getrennten
Wiederholungen erlaubten den Abschluss der übrigen Währungsplanungen.
Der COT-Auftrag für den Veröffentlichungstermin 25.09. mit Berichtsdatum
22.09. ist abgeschlossen; dieser geprüfte Berichtsstand war bereits vorhanden.
Die Journalrevision blieb 3; Myfxbook-Verbindungen: null, aktiv: null.

Der abschließende WebKit-Live-Lauf ist um `16:29:08.921Z` erfolgreich beendet:
`ok`, `validationSucceeded` und `cleanupVerified` sind wahr. Alle 22
Analyseprüfungen, beide Konten und vier Originalbilder sowie Übersicht, Trades,
sechs Analyseseiten und die Myfxbook-Einrichtung bei 390 px bestehen. Das
Passwortfeld ist leer und der Sechs-Stunden-Abgleich sichtbar. Keine Laufzeit-
oder API-Fehler im erfolgreichen Lauf, kein Seitenüberlauf und keine persönlichen
Schreibversuche. Dies prüft die tatsächlich bereitgestellte Oberfläche.
Der temporäre Testschlüssel wurde widerrufen; anonyme und widerrufene
Testanfragen liefern HTTP 401. Die physische iPhone-/Besitzer-SSO-Abnahme und
der erste persönliche Myfxbook-Import bleiben separate Benutzerschritte.
Die zusätzliche anonyme Prüfung um 16:31:25 UTC bestätigt auf stabilem Alias
und neuem Deploymenthost jeweils HTTP 401 für die Sitzungs-API sowie die
Weiterleitung der Seite zur Vercel-Anmeldung. Keine temporären Zugangsschlüssel
bleiben bestehen.

Vorläufe hatten einzelne Plattform-SSO-Ablehnungen des temporären Testzugangs
sowie einen abgebrochenen Macro-Leseabruf. Die abschließende vollständige
Wiederholung bestand ohne diese Fehler; der Zugriffsschutz wurde dafür nicht
abgeschwächt. Frühere Berichte bleiben als Diagnose erhalten.

Nachweise (nicht versioniert): `apps/desktop/.vercel/provider-ready-report.json`,
`provider-cron-providers.json`, `provider-cron-cot.json`,
`provider-status-report.json`, `provider-local-ui-report.json` und
`provider-live-report.json` und `provider-final-anonymous-report.json`.
Sie enthalten keine Zugangsdaten oder persönlichen
Journalinhalte. Der echte Windows-Start des separat gebauten Prüfprogramms wurde
ebenfalls nachgewiesen; der bereits laufende Desktop-Prozess und seine EXE
wurden erhalten. Das ist keine vollständige native UI-Abnahme.

## Vier tägliche EODHD-Abrufe – Abnahme 15.10.2026

Der Funktionsstand `26475e0` ist auf `main` committet und gepusht.
Deployment `dpl_FgEF3DAUPv4zJb8CirM7obduMGFi` ist `READY`, `public: false`,
mit Weboberfläche, Rust-Backend, Gateway und beiden Queue-Workern in `fra1`.
Der feste Smartphone-Link `personal-macro-nudel96s-projects.vercel.app` wurde
am 15.10.2026 um 01:01 UTC ausdrücklich diesem Deployment zugeordnet und
über die aufgelöste Deployment-ID geprüft. Die Produktionsziel-ID allein reicht
bei einem zuvor manuell festgelegten Alias nicht als Zuordnungsnachweis.

Der echte Cron-Aufruf um 00:53 UTC erzeugte 45 deduplizierte Währungs-/Slotjobs.
Alle neun Abrufe des aktuellen 00-UTC-Slots sind zwischen 00:53:44 und 00:55:57
UTC erfolgreich abgeschlossen. Die Slots um 06, 12, 18 und den folgenden
00 Uhr UTC enthalten jeweils neun dauerhafte Folgejobs. Die veröffentlichte
Generation `9696faeb-e677-4f6d-ba0e-1b0e6ed5cab8` enthält weiterhin 555 Pakete;
die Journalrevision blieb 9. Die getrennten Release-Nachprüfungen bleiben aktiv.

Der neue lokale Windows-Release wurde gebaut und real gestartet:
`apps/desktop/src-tauri/target/release/personal-macro-desktop.exe`.
Das Fenster reagiert, der Atlas-Speicher ist initialisiert, stderr ist leer;
keine Initialisierungs- oder automatischen EODHD-Fehler im geprüften Start.
Der erste automatische vollständige Neun-Währungs-Abruf lief von 00:53:11
bis 00:54:22 UTC und verarbeitete 6.797 Ereignisse. Diese Metadaten wurden
ausschließlich lesend aus der bestehenden lokalen Datenbank geprüft.

Prüfungen des Funktionsstands:

- 34 relevante native Rust-Tests bestehen; drei gesonderte Provider-Livetests
  blieben im Unit-Testlauf bewusst ausgenommen. Die obigen echten Abrufe sind
  davon getrennte Produktionsnachweise.
- Sechs PostgreSQL-Integrationstests bestehen in eigens erzeugten isolierten
  Testschemas, darunter doppelte Zustellung, vier UTC-Slots mit je neun Währungen,
  wiederholte Planung, Zeitumstellung und Wiederanlauf ohne Abspielen alter Slots.
- 16 Node-Tests für Provider-Cron und Queue-Worker sowie 18 Macro-UI-Tests bestehen.
- TypeScript, gezieltes ESLint/Prettier, Rustfmt, Desktop- und Cloud-Clippy mit
  Warnungen als Fehler sowie privater Web- und Windows-Release-Build bestehen.
- Die veröffentlichte Oberfläche am festen Link besteht in WebKit auf `/macro`,
  `/economic-data` und `/economic-calendar` bei 320, 390, 768 und 1440 px:
  zwölf Ansichten ohne Seitenüberlauf, sichtbare neue Zeitplanung, keine
  Laufzeit-/API-Fehler und keine persönlichen Schreibversuche. Der API-Lesetest
  bestätigt neun Macro-Währungen und 263 Ereignisse in der aktuellen Woche.

Der erste erfolgreiche vollständige Browserlauf endete am 15.10.2026 um
01:02:06 UTC; die abschließende Wiederholung einschließlich Bildnachweisen
bestand um 01:03:32 UTC. Journalrevision und Besitzer-/SSO-Schutz blieben unverändert.
Der temporäre Testzugang wurde widerrufen; anonyme und widerrufene Anfragen
lieferten HTTP 401. Vorläufe am noch alten festen Alias bleiben als Diagnose
erhalten. Die spätere explizite Alias-Zuordnung und erfolgreiche Wiederholung
bestätigen die neue bereitgestellte Oberfläche. Eine physische iPhone-/Safari-
Bedienung durch den Besitzer ist damit weiterhin nicht nachgewiesen.

Nicht versionierte Nachweise unter `apps/desktop/.vercel/`:
`eodhd-four-daily-deployment.json`, `eodhd-four-daily-ready.json`,
`eodhd-four-daily-alias.json`, `eodhd-four-daily-cron.json`,
`eodhd-four-daily-status.json`, `eodhd-four-daily-desktop-start.json`,
`eodhd-four-daily-desktop-check.json`, `eodhd-four-daily-desktop-sync.json`
und `eodhd-four-daily-live-first-success.json` beziehungsweise der abschließende
`eodhd-four-daily-live.json`. Screenshots liegen ausschließlich unter
`apps/desktop/output/playwright/eodhd-four-daily-2026-10-15/` auf D:.
