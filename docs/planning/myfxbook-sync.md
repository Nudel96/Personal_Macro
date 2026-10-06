# Myfxbook-Journalsynchronisierung

Implementiert am 17.09.2026 in `apps/desktop`. Öffentliche Spezifikation:
https://www.myfxbook.com/api (API 1.38, geprüft am 17.09.2026).

## Bedienung und Datenfluss

Einstellungen → Konten → aktives Zielkonto → Myfxbook automatisch synchronisieren.
Login mit eigenem Myfxbook-Konto, Portfolioauswahl aus `get-my-accounts`, explizite
IANA-Brokerzeitzone, Vorschau, Aktivierung. Der öffentliche Link ist kein
Authentifizierungsersatz. Ein Portfolio kann nur einem Journal-Konto zugeordnet
sein; Kontowährung muss gleich sein. Für Tradeup lautet die öffentliche ID
12168214. Private Quellantworten oder Zugangsdaten sind keine Repository-Fixtures.

Der native Client verwendet ausschließlich HTTPS auf `www.myfxbook.com`, keine
Redirects, eine begrenzte Antwortgröße und Zeitlimits. Endpunkte: `login.json`,
`logout.json`, `get-my-accounts.json`, `get-history.json`, `get-open-trades.json`.
Es werden keine Order-Endpunkte verwendet und keine Journal-Daten hochgeladen.
Provider- und Netzwerkfehler werden ohne Rohantworten, URLs oder Secrets
normalisiert. Das Passwort bleibt nur im laufenden Login. Der Frontend-Login
verwendet keinen Mutation-Cache; das Passwortfeld wird sofort geleert.

Eine kurzlebige Autorisierungskennung (15 Minuten) und Vorschaukennung
(10 Minuten) ersetzen die Sitzung im Frontend. Nur die native Sitzung wird
nach erfolgreicher Vorschau im Windows-Anmeldedatenspeicher abgelegt.
Sitzungen sind laut Provider IP-gebunden und nach einem Monat ungültig.
Kein automatischer Passwort-Login; erforderliche Anmeldung wird angezeigt.

## Abgleich und Persistenz

`commands/myfxbook/provider.rs`: begrenzter Client, Dezimalparser, Brokerzeit →
UTC. JSON verwendet `openTime`/`closeTime`, nicht die XML-Namen. Floating-P&L
wird nicht als realisierter Gewinn übernommen. Kontoaggregationen vor und nach
den Detailabrufen müssen gleich sein, sonst erneuter Versuch.

Leere optionale Preise (`sl`/`tp`, fehlend, `null` oder leerer Text) sind nicht
verfügbar. Fehlende/leer übertragene Kosten bleiben unbekannt; nur vollständige
`interest`- und `commission`-Angaben erlauben die Bruttoberechnung. Pflichtwerte
(Ausführungspreise, Handelszeiten und realisierter Gewinn) werden weiterhin
geprüft. Bei Kapitalbuchungen darf ein expliziter `closeTime` den nicht vorhandenen
`openTime` ersetzen; bei Trades gilt dieser Ersatz nicht. Dezimaltexte werden
getrimmt. Reine Serialisierungsabweichungen bis 0,00000001 Cent werden toleriert,
echte Untercentbeträge nicht still gerundet. ISO-Zeiten mit explizitem Offset
werden direkt nach UTC umgerechnet; Zeiten ohne Offset benötigen weiterhin die
angegebene Brokerzeitzone.

Eine explizit übermittelte Positionsgröße `0` gilt seit der Korrektur vom
20.09.2026 als nicht verfügbare Menge. Der Quellwert bleibt im Importnachweis
erhalten; neue Journal-Trades speichern `NULL`, vorhandene Mengen bleiben
unverändert. Vorschau und Importbericht nennen diese Einschränkung. Negative,
fehlende oder unlesbare Mengen bleiben Fehler. Eine Rundung durch Myfxbook ist
damit nicht belegt; aus `0` wird weder eine Mindestmenge noch eine Kontraktgröße
abgeleitet. Die übrigen Ausführungsfelder und sämtliche Kontosummen müssen
weiterhin vollständig passen.

Formatfehler nennen Antwortbereich, Eintragsnummer und betroffenes Feld. Sie
enthalten keine Quellwerte, Rohantworten oder Zugangsdaten. Ungültige lokale
Herkunftsdaten und fehlende Kosten für die Bruttoberechnung erhalten eigene
Fehlercodes statt der pauschalen Providerfehlermeldung.

Bei Quell-Duplikaten nennt die Prüfung beide Einträge mit Antwortbereich und
Eintragsnummer. Lokale Zuordnungsfehler unterscheiden mehrere Kandidaten,
abweichende Einstiegspreise und abweichende Mengen. Fehlgeschlagene Vorschauen
legen zusätzlich `logs/myfxbook-last-preview-error.json` in lokalem AppData ab.
Der Bericht enthält maximal 100 normalisierte Ausführungssätze pro Liste,
Quell-/Journal-Kontosummen und die konkreten Konfliktfelder. Er enthält keine
Anmeldung, Sitzung, Kontobeschreibung, persönlichen Notizen, beliebigen
Herkunftsmetadaten oder vollständigen Rohantworten. Pro Anwendung bleibt nur
der letzte Bericht; er wird nicht hochgeladen. Schreibfehler des Diagnoseberichts
ändern weder den ursprünglichen Importfehler noch die Datenbank.

`reconcile.rs`: rein lesende Planung mit Snapshot-Fingerprint. Eine Transaktion
mit `BEGIN IMMEDIATE` prüft unmittelbar vor dem Commit, ob sich das Journal
geändert hat. Der Commit umfasst Verbindung, Trades, Cashflows, Quellzuordnungen
und `import_runs`/`import_rows`. Fehler rollen sämtliche Änderungen zurück.
Vor Aktivierung entsteht ein vollständiges lokales Backup; weitere Schreibläufe
erstellen spätestens nach 24 Stunden erneut eines. Unveränderte Abrufe erzeugen
keine neuen Trades, Buchungen oder Importläufe.

Migration 0049 ergänzt `myfxbook_connections` und `myfxbook_links`. Keine Secrets
in SQLite oder Backups. Bestehende Migrationen bleiben unverändert. Journal-Reset
löscht diese persönlichen Tabellen vor Trades/Konten; Macro-Daten bleiben
geschützt. Der normale Backup/Restore enthält die SQLite-Tabellen.

Abgleichregeln:

- Persistente Quellidentität aus Symbol, Richtung, Einstiegsminute, Entry,
  Quellmenge und Einheit. Die API dokumentiert keine stabile Ticket-ID.
- Mehrere Positionen mit gleichem Symbol, gleicher Richtung und Einstiegsminute
  bleiben über unterschiedliche Einstiegspreise getrennt. Sind auch die
  Einstiegspreise gleich, bleiben die Einträge mehrdeutig; unterschiedliche
  Mengen oder Abschlussangaben allein belegen keine getrennten Positionen.
  Das gilt auch über offene und geschlossene API-Einträge hinweg.
- Erscheint zu einer bereits erfassten Einstiegsminute ein weiterer Preis,
  muss der vorhandene Journal-Trade im selben Snapshot separat zugeordnet sein,
  bevor eine weitere Position neu angelegt wird. Ohne diese Gegenprüfung bleibt
  ein abweichender Preis ein lokaler Konflikt. Die Quellreihenfolge ist irrelevant.
- Bekannte Altimporte dürfen über ihre dokumentierte `sourceDisplayedLots`
  zugeordnet werden. Korrigierte Journalgrößen werden nicht ersetzt.
- Bei Quellmenge `0` muss die Zuordnung über die übrigen Identitätsfelder
  eindeutig sein, auch wenn bereits eine Quellzuordnung existiert. Wechselt
  die Mengenverfügbarkeit, bleibt dieselbe Journal-ID mit genau einer
  Quellzuordnung erhalten. Eine beim API-Import ausdrücklich als unbekannt
  gespeicherte Menge darf später mit einer positiven Quellmenge ergänzt werden;
  manuell vorhandene Größen werden dabei nicht überschrieben.
- Offene Trades behalten ID, Entry, Größe, ursprünglichen Stop, Risiko,
  Notizen, Reviewfelder, Tags und Medien. Nur Abschlussdaten und Herkunft werden
  aktualisiert, zusätzlich darf eine zuvor unbekannte API-Menge ergänzt werden.
  R wird nur bei vorhandenem, positivem ursprünglichem Risiko
  berechnet. Neue Trades haben kein erfundenes Risiko oder ursprünglichen Stop.
- Bestehende geschlossene oder gelöschte Trades werden bei Abweichungen nicht
  überschrieben bzw. wiederhergestellt. Fehlende offene Positionen werden nicht
  als geschlossen geraten. Lokale Konflikte stoppen den gesamten Import.
- Der erste passende Deposit kann bereits erfasstes Startkapital repräsentieren;
  sonst sind Cashflows eigene Ein-/Auszahlungen mit persistenter Zuordnung.
- Summe realisierter Nettoergebnisse = API-Kontogewinn;
  Startkapital + Cashflows = Deposits − Withdrawals;
  Kapital + Nettoergebnis = API-Balance. Alle drei Prüfungen sind exakt in Cent.
- Die API erklärt die Kostenkonvention von `profit` nicht hinreichend. Netto-
  und Bruttointerpretation (`profit + interest + commission`) werden nur durch
  vorhandene Trade-Evidenz und die exakten Kontosummen entschieden. Sind beide
  gleichwertig, bleibt der Modus `auto`; es wird keine spätere Konvention
  vorweggenommen. Unterschiedliche gleich plausible Zeilenergebnisse stoppen.

## Automatik und Grenzen

Ein eigener nativer Scheduler prüft aktivierte Konten alle fünf Minuten;
UI-Status und letzte erfolgreiche Synchronisierung sind jederzeit sichtbar.
`myfxbook-updated` invalidiert Journal-, Konto-, Dashboard-, Kalender- und
Analytics-Abfragen auch außerhalb der Einstellungen. Manueller Abruf mindestens
eine Minute nach dem letzten Versuch. Ein gemeinsamer Vorgangsschutz serialisiert
Login, Vorschau, Aktivierung, Abruf, Pause und Trennung. Eine Pausierung bleibt
auch nach manuellem Abruf bestehen. Fehler mit Klärungsbedarf deaktivieren die
Automatik; vorübergehende Netzwerkfehler werden im nächsten Intervall versucht.

Die Anwendung muss laufen; es gibt keinen Windows-Dienst und keinen Webhook.
Quellseitige Aktualisierungsverzögerungen bleiben erhalten. Keine offenen
Pending-Orders aus `get-open-orders`; nur ausgeführte Positionen.

Historie ist laut API auf die letzten 50 Transaktionen begrenzt, ohne Pagination.
Nach initialem Abgleich muss jedes spätere Fenster mindestens einen bekannten
Historieneintrag enthalten. Fehlt die Überlappung, wird pausiert. Ein vollständiger
Brokerbericht und eine erneute Vorschau können eine Lücke beheben. Die ersten
50 Einträge allein belegen keine vollständige ältere Historie; vorhandenes
Journal und Quellsummen müssen vor Aktivierung vollständig abgestimmt sein.
Die API kann keine beweisbare Vollständigkeit für ältere, sich im Ergebnis
gegenseitig aufhebende und zugleich fehlende Trades liefern.

Die Überlappung berücksichtigt einen Wechsel zwischen Quellmenge `0` und
bekannter Menge nur dann, wenn der gespeicherte geschlossene Quellsatz in allen
anderen Feldern identisch ist. Eine gleichzeitig geänderte Ausführung oder
ein geändertes Ergebnis belegt keine Historienkontinuität.

Zeiten besitzen häufig nur Minutengenauigkeit. Mehrdeutige/nicht existente
Brokerzeiten an DST-Wechseln werden abgelehnt. Konten mit Teilpositionsmodell,
Sonderbuchungen (z. B. Credits), abweichenden Währungen oder unzureichender
Quelltransparenz können einen manuellen Brokerimport erfordern. Mengen bleiben
in der Quelleneinheit; keine erfundene Kontraktgrößen- oder FX-Umrechnung.

UTC ist eine zulässige Eingabe, keine automatisch bestätigte Brokerzeitzone.
Die bisherigen manuellen Tradeup-Importe nennen UTC; dies allein belegt nicht
die Zeitzone des API-Endpunkts. Die Plattform/Broker-Historie muss diese Wahl
bestätigen. Weder die persönliche Myfxbook-Anzeige noch die PC-Zeitzone wird
automatisch übernommen. Bestehende Journalzeiten werden nicht umgedeutet.

## Verifikation

Rust-Fixtures verwenden ausschließlich synthetische Daten und temporäre SQLite-
Datenbanken. Geprüft werden Dezimalwerte, UTC/DST, Mehrdeutigkeiten, Gebühren,
Floating-P&L, Erhalt von Altimporten, offene → geschlossene Positionen,
Idempotenz, Historienlücken, lokale Konflikte, Transaktionsrollback, veraltete
Vorschauen und Upgrade einer vorhandenen Testdatenbank. UI-Tests prüfen
Login/Passwortlebensdauer, Konto-/Zeitzonenbindung, Vorschau, Aktivierung, Pause,
Konfliktanzeige und Browser-Abweisung. Ein echter Myfxbook-Login erfordert die
private Anmeldung des Benutzers im Tool und wurde nicht durch Fixtures ersetzt.

Prüflauf am 17.09.2026: 11 Myfxbook-Rusttests, vier bestehende Backup-/Resettests
und 26 relevante Konten-/Command-Frontendtests bestanden. Typecheck, ESLint der
geänderten Frontend-Dateien, Formatprüfung und `cargo clippy --all-targets --
-D warnings` bestanden ebenfalls. Zeitüberschreitungen im parallel ausgeführten
Gesamt-Frontendlauf ließen sich im gezielten Wiederholungslauf mit einem Worker
auflösen (85 Tests in den betroffenen bestehenden Dateien bestanden).
Die abschließende eigene Sichtprüfung der neuen nativen Oberfläche bleibt nach
dem vom Benutzer beendeten Desktopzugriff offen. Der anschließend vom Benutzer
bereitgestellte Screenshot bestätigt Login und Portfolioauswahl; die Vorschau
brach mit der zuvor pauschalen Meldung `MYFXBOOK_DATA` ab. Die konkrete private
API-Antwort liegt für die Fehleranalyse nicht vor. Die ergänzten Parserfälle
und Feldmeldungen ersetzen keinen erfolgreichen erneuten Live-Abgleich.

Nach der Parserkorrektur bestanden alle 18 Myfxbook-Rusttests und erneut
`cargo clippy --all-targets -- -D warnings`. Die sieben zusätzlichen Regressionen
prüfen leere optionale Felder gegenüber Pflichtwerten, teilweise fehlende Kosten,
sichere Feldmeldungen, Buchungszeiten, Dezimalrauschen, ISO-Offsets und die
Unterscheidung lokaler Metadatenfehler von Providerfehlern.

Der produktive Frontend-Build und der native Windows-Release-Build
(`pnpm exec tauri build --no-bundle`) wurden nach der Parserkorrektur
erfolgreich abgeschlossen. Die aktuelle EXE liegt unter
`apps/desktop/src-tauri/target/release/personal-macro-desktop.exe`.
Der vorhandene Starter wählt diese neuere EXE beim
nächsten vollständigen App-Neustart. Die laufende ältere App wurde nicht beendet.

Prüflauf zur Mengenkorrektur am 20.09.2026: alle 26 Myfxbook-Rusttests und
`cargo clippy --all-targets -- -D warnings` bestanden. Acht zusätzliche
Regressionen prüfen Nullmengen gegenüber negativen/ungültigen Mengen,
mehrdeutige Journalpositionen trotz vorhandener Quellzuordnung, unveränderte
Kontosummenprüfungen, den Schutz lokal geänderter/gelöschter Trades,
leere Mengen in temporärem SQLite, spätere Mengenergänzung ohne doppelte Trades
und Historienkontinuität bei wechselnder Mengenverfügbarkeit. Alle Testdaten
sind synthetisch. Die private API-Antwort des gemeldeten Eintrags 10 liegt
weiterhin nicht vor; der erneute Live-Abgleich bleibt gesondert zu bestätigen.

Der Frontend-Typecheck, Frontend-Produktionsbuild und native Windows-Release-Build
zur Mengenkorrektur sind am 20.09.2026 erfolgreich abgeschlossen worden.
Da die vorherige Standard-EXE noch lief, wurde mit
`pnpm exec tauri build --target x86_64-pc-windows-msvc --no-bundle` gebaut.
Die neue EXE liegt unter
`apps/desktop/src-tauri/target/x86_64-pc-windows-msvc/release/personal-macro-desktop.exe`;
`START-MACROTOOL.cmd` wählt nach vollständigem Schließen der bisherigen App diese
neuere Version. Es wurde kein direkter Eingriff in die persönliche Datenbank
vorgenommen und der beendete Desktopzugriff nicht wieder aufgenommen.

Nach dem folgenden Live-Versuch meldete die App `MYFXBOOK_AMBIGUOUS`. Eine
rein lesende Kontrolle der bestehenden Tradeup-Journalzeilen zeigte keine
doppelten Kombinationen aus Instrument, Richtung und Einstiegsminute; dies
belegt nicht, welche aktuelle API-Zeile den Fehler auslöst. Die Diagnose wurde
daher um die konkreten Quell-/Journal-Konflikte und den begrenzten lokalen
Vorschaubericht ergänzt. Die Zuordnungsregeln wurden dafür nicht gelockert.
Alle 30 Myfxbook-Rusttests und Clippy bestanden nach dieser Ergänzung;
vier weitere Regressionen prüfen Quellzeilen-Zuordnung, Preis-/Mengenfehler,
Auslassung von Zugangsdaten und Notizen sowie unveränderte Fehler und
Journaldaten bei fehlendem Diagnoseverzeichnis. Die tatsächliche Ursache des
neuen Live-Konflikts bleibt bis zur nächsten Vorschau mit Diagnosebericht offen.

Der native Release-Build einschließlich Frontend-Typecheck und Frontend-Build
mit der Diagnoseerweiterung wurde am 20.09.2026 erfolgreich abgeschlossen.
Die neueste EXE liegt wieder unter `src-tauri/target/release`; der Starter
wählt sie nach dem vollständigen Schließen der zuvor laufenden Version aus.

Der nächste lokale Diagnosebericht vom 20.09.2026 belegt die Ursache des
Quellkonflikts: Zwei Positionen derselben Einstiegsminute, desselben Instruments
und derselben Richtung hatten unterschiedliche Einstiegspreise. Die bisherige
Minutenprüfung blockierte sie dennoch. Die Eindeutigkeitsprüfung berücksichtigt
nun zusätzlich den normalisierten Einstiegspreis. Verschiedene Mengen oder
Abschlussdaten allein reichen weiterhin nicht zur Trennung; identische
Einstiegsangaben bleiben ein Konflikt. Bereits gespeicherte Quellschlüssel
ändern sich dadurch nicht.

Eine neue Position mit anderem Einstiegspreis darf neben einer vorhandenen
Journalposition derselben Minute nur hinzukommen, wenn die vorhandene Position
separat durch eine andere Zeile desselben Snapshots zugeordnet wird. Dadurch
bleiben lokale Preisänderungen geschützt. Der ergänzte SQLite-Test deckt
nacheinander auftauchende Positionen, umgekehrte Quellreihenfolge, getrennte
Abschlüsse, spätere Ergänzung einer unbekannten Menge, Erhalt von IDs und
Journalangaben sowie wiederholten Import ohne Duplikate ab.

Nach dieser Korrektur bestanden alle 34 Myfxbook-Rusttests sowie
`cargo clippy --all-targets -- -D warnings`. Die zusätzlichen Tests verwenden
ausschließlich synthetische Daten. Die Diagnose wurde nur lokal gelesen;
persönliche Journaldaten wurden nicht verändert. Ein erfolgreicher Live-Abgleich
nach der Korrektur steht noch aus.

Frontend-Typecheck, Frontend-Produktionsbuild und nativer Release-Build dieser
Korrektur wurden am 20.09.2026 erfolgreich abgeschlossen. Die neue EXE wurde
um 18:40 Uhr Ortszeit unter
`apps/desktop/src-tauri/target/x86_64-pc-windows-msvc/release/personal-macro-desktop.exe`
erstellt. Der Starter wählt sie als neueste Version; die noch laufende
Standard-EXE muss zuvor vollständig geschlossen werden. Die Bitte um erneute
Live-Prüfung erfolgt beim Benutzer, ohne den beendeten Desktopzugriff wieder
aufzunehmen.
