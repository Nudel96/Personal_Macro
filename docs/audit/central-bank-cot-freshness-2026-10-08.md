# Zentralbankberichte und COT: Aktualität und manueller Cloudabruf

Prüfdatum: 8. Oktober 2026. Umfang: produktive Desktop-Quellen und der
geschützte private Webbetrieb. Persönliche Journalbefehle gehören nicht zu
dieser Abnahme.

## COT

Die Smartphone-Version enthielt vor der Reparatur für alle 35 aktiven Märkte
den Berichtsstand 22. September. Der Auftrag für die Veröffentlichung vom
2. Oktober mit Berichtsdatum 29. September war nach acht Versuchen abgelaufen.
Der Kalender und die tägliche Planung waren vorhanden.

Der unveränderte native Collector wurde auf einer ausschließlich öffentlichen,
disposablen COT-Paketkopie ausgeführt. Der Abruf importierte 26.292 Zeilen und
lieferte alle 35 Märkte mit Datum 29. September. Das erzeugte Paket hatte
14.102.528 SQLite-Bytes beziehungsweise 4.884.730 Gzip-Bytes. Es überschritt
damit die bisherige Cloudgrenze von 2.900.000 Gzip-Bytes; zusätzlich hätte seine
Base64-Übertragung die interne JSON-Antwortgrenze überschritten.

Der Rust-Worker lädt das Paket jetzt direkt in den privaten Objektspeicher.
Die Queue erhält ausschließlich Status und Lease-ID. Der Abschluss lädt das
Objekt separat erneut, prüft Transport-/Rohhash, Schema, Zeilen und
Berichtsdatum und veröffentlicht über den bestehenden atomaren
Generationsvergleich. Die COT-Transportgrenze beträgt jetzt 32 MiB; die
allgemeine JSON-Grenze wurde nicht vergrößert. Die zulässige Auftragsdauer
wurde von fünf auf sieben Tage erweitert.

Der autorisierte manuelle Abruf hat den bereits abgelaufenen aktuellen Auftrag
erneut eingeplant. Die produktive Ausführung bestand beim ersten Versuch:
Synchronisierung `2026-10-08T16:20:58.903302652Z`, Abschluss um 16:21:03 UTC,
alle 35 Märkte mit Berichtsdatum `2026-09-29`. Dies ist am Prüftag der neueste
veröffentlichte Stand, kein angeblich täglicher COT-Datensatz.

Der nächste kalendarische Abruf ist für 9. Oktober, 20:30 UTC beziehungsweise
22:30 Uhr in Berlin eingeplant. Die Ausführung dieses zukünftigen Termins kann
die heutige Abnahme nicht beobachten. Maßgeblich sind der
[offizielle CFTC-Kalender](https://www.cftc.gov/MarketReports/CommitmentsofTraders/ReleaseSchedule/index.htm)
und die [CFTC-Veröffentlichungen](https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm).

## Zentralbankquellen

Die tägliche Cloudplanung war aktiv. Elf der zwölf Quellenaufträge meldeten
bereits vor der Reparatur erfolgreiche Prüfungen. Das belegte nicht für jede
Quelle eine vollständige Erkennung der neuesten Veröffentlichung.

Korrigiert wurden:

- EZB: Die öffentliche Entscheidungsseite enthält nur eine HTML-Hülle. Der
  Collector folgt jetzt ausschließlich ihrem offiziellen, auf das aktuelle
  Jahr begrenzten Veröffentlichungs-Snippet.
- Bank of Japan: Die chronologisch aufsteigende Archivliste wird nach erkannten
  Veröffentlichungsdaten ausgewertet; Entscheidungs-PDFs liefern ihr Datum
  auch über den offiziellen Dateinamen.
- Bank of Canada: Titel wie „maintains the policy rate“ werden als Entscheidung
  erkannt. Der manuelle Lauf umgeht die bedingte RSS-Anfrage.
- PBC: Der Sonderpfad verwendet die tatsächlich registrierte Quellen-ID
  `pbc-reports` und das englische Jahresarchiv.
- Bank of England: Datumsangaben im umgebenden Listeneintrag werden berücksichtigt.
  Angekündigte zukünftige Termine werden ausgeschlossen. Während der
  ersten Liveprüfung fälschlich erkannte zukünftige Einträge wurden bei der
  nächsten regulären Quellübernahme aus der öffentlichen Arbeitskopie entfernt;
  der Leser blendet zukünftige Einträge zusätzlich aus. Vorherige Generationen
  bleiben unveränderlich.
- RBA: Der RSS-Feed enthält nur seine jeweils letzte Meldung, aktuell eine
  Financial-Stability-Meldung. Wenn kein geldpolitischer RSS-Eintrag enthalten
  ist, wird das offizielle aktuelle Jahresarchiv geprüft. Eine gültige RSS-Liste
  ohne einschlägigen Bericht wird von einem ungültigen Feed unterschieden.
- HTML-Listen werden nicht aufgrund eines unveränderten Index-ETags als
  unverändert behandelt. Extraktions-/Abruffehler können keinen erfolgreichen
  Quellenstatus mehr erzeugen.

Die erste erfolgreiche Cloudübernahme ergänzte die EZB-Entscheidung vom
10. September, die BOJ-Entscheidung vom 18. September und die BOC-Entscheidung
vom 2. September. Vorhandene aktuelle Entscheidungen von Fed, BoE, RBA und SNB
bleiben erhalten. Die englische PBC-Quelle bietet derzeit den Bericht Q1 2026;
ein nicht angebotenes englisches Q2-Dokument wird nicht erfunden.

RBNZ bleibt eine externe Einschränkung: Archiv, aktuelle Entscheidungsseite
und vollständiges September-Dokument liefern HTTP 403 beim normalen Abruf.
Der offizielle RSS-Feed ist erreichbar, enthält aber nur Titel und kurze
Beschreibungen. Diese wurden nicht als vollständige Originalberichte ausgegeben.
Die Quelle wird als fehlgeschlagen angezeigt; der vorhandene ältere Bestand
ist deshalb nicht als aktuell abgenommen.

## Deutsche Briefings und Kosten

Originalabruf und deutsche KI-Zusammenfassung sind getrennte Aufträge.
Ein neuer Originalbericht mit `local_fallback` ist keine erfolgreich geprüfte
deutsche KI-Zusammenfassung. Neue Zusammenfassungen behalten die bestehende
Quellen-, Zahlen-, Bank- und Bedeutungsprüfung.

Der Oktober-Beleg zeigte vor der Reparatur 88 abgerechnete Antworten,
3 geprüfte Zusammenfassungen und 0,465374 USD Kosten. Identische bereits
bezahlte, von der Qualitätsprüfung abgelehnte Antworten wurden wiederholt
kostenpflichtig angefragt. Die atomare Reservierung verhindert dies jetzt
innerhalb desselben UTC-Monats in SQLite und PostgreSQL. Erfolgreiche identische
Ergebnisse werden weiterverwendet; ungeklärte Anfragen bleiben gesperrt.

Das Monatslimit von 0,50 USD je Datenspeicher bleibt unverändert. Die
Quellenaktualisierung darf trotz fehlender oder abgelehnter Zusammenfassung
weiterlaufen. Vollständig aktuelle deutsche KI-Briefings für jede Bank sind
damit nicht pauschal zugesichert.

Die Abschlussprüfung weist für Oktober 91 abgerechnete Antworten,
3 geprüfte Zusammenfassungen, 0,480215 USD Kosten und keine offenen
Reservierungen aus. Der aktuelle Abruf hat damit neue Originale nachgewiesen,
aber keine vollständige neue deutsche Zusammenfassung für jede Bank.

## Manuelle Bedienung

Im privaten Webbetrieb besitzen COT und Zentralbankberichte die Schaltfläche
„Jetzt aktualisieren“, sofern die getrennte öffentliche Refresh-Capability
verfügbar ist. Die authentifizierten Anfragen benötigen CSRF und akzeptieren
keine fremden Quellen-URLs, Dateipfade oder Konten. Sie sind von persönlichen
Journalmutationen getrennt und ändern keine Journalrevision.

COT prüft den offiziellen Kalender und kann den fälligen, abgelaufenen neuesten
Auftrag wieder aktivieren. Noch nicht veröffentlichte zukünftige Berichte
werden nicht vorzeitig angefordert. Ein bereits abgeschlossener aktueller
Auftrag wird als aktuell gemeldet.

Zentralbankberichte planen zwölf feste Quellen mit erzwungener Prüfung ein.
Gleichzeitige beziehungsweise kurz aufeinanderfolgende Anfragen werden über
15 Minuten zusammengeführt. Der Gateway stößt die vorhandene Queue an; eine
vorübergehend fehlgeschlagene Queue-Annahme löscht den dauerhaften Auftrag
nicht. Der tägliche Dispatcher kann ihn wieder aufnehmen.

Die finale Prüfung zeigte außerdem Verzögerungen durch die serielle
Queue-Ansteuerung: Alte Aufträge wurden nach ihrem ursprünglichen Datum
sortiert, auch wenn ihre Wiederholung erst später fällig war. Der Dispatcher
sortiert jetzt nach tatsächlicher Fälligkeit einschließlich Retry und Lease.
Der Queueversand prüft zusätzlich diese Reihenfolge und arbeitet in Gruppen
von höchstens vier Aufträgen; alle Ergebnisse jeder Gruppe werden abgewartet.
Ein isolierter PostgreSQL-Test und ein Node-Test sichern aktuelle Aufträge
vor späteren Wiederholungen sowie vollständige und begrenzte Zustellung ab.

Die Oberfläche gleicht die kleine Generationsmetadaten-Antwort bei sichtbarer
Seite ab und invalidiert die zugehörigen Listen und Berichtsdetails nach einer
neuen Veröffentlichung. Der Auftrag läuft serverseitig weiter, wenn die Seite
geschlossen oder der PC ausgeschaltet ist.

## Validierung und Bereitstellung

Bestanden: TypeScript-Prüfung und privater Webbuild, gezielte UI-Tests,
19 COT-, 29 Gateway- und 15 Provider-Node-Tests, Rust-Clippy für alle
PostgreSQL-Ziele, 28 Zentralbank-Rusttests sowie der vollständige native
Rust-Testlauf mit 371 erfolgreichen und 56 ausdrücklich ausgeschlossenen
Integrationstests. Die isolierten PostgreSQL-Tests prüfen unter anderem
konkurrierende manuelle Anfragen, Lease-/Generationskonflikte, Kostenreservierung
und unveränderte Journalrevision.

Beim ersten breiten Frontend-/Rustlauf verursachte der volle temporäre
Datenträger C: zusätzliche Fehler. Die betroffenen vier Frontenddateien
bestanden anschließend mit 16 Tests unter temporären Pfaden auf D:; der
vollständige native Rustlauf bestand ebenfalls unter D:.

Die finale Version `dpl_3n7Yy3AJC3HWZ3ER3FjnqtbEWHKH` ist `READY`,
`public: false`, Region `fra1`, mit Web, Gateway, Rust-Backend und beiden
Workern. Der stabile
[Projektlink](https://personal-macro-nudel96s-projects.vercel.app) wurde am
8. Oktober um 16:58:44 UTC dem Host
`personal-macro-cr2l0gnbp-nudel96s-projects.vercel.app` zugeordnet. Beide
Cron-Auslöser wurden an genau dieser Produktionsversion erfolgreich
angestoßen: COT um 16:58:51 UTC, Provider um 16:58:57 UTC.

Der abschließende Livelauf ist um `2026-10-08T17:01:42.010Z` erfolgreich
beendet: `ok: true`, `validationSucceeded: true`, `cleanupVerified: true`.
Alle zwölf Quellen wurden neu geprüft, elf erfolgreich; RBNZ meldet weiterhin
einen Quellenfehler. Der unabhängige Paketabruf prüft Hashes und SQLite,
bestätigt 44 Berichte und keine zukünftigen Einträge. Die aktive Generation
ist `0e35341b-30f8-4285-a5cc-3b259583f1e6`. COT enthält unverändert alle
35 Märkte mit Stand 29. September. Die persönliche Journalrevision bleibt 9,
`personalWritesPerformed: false`.

WebKit prüft die tatsächlich bereitgestellten COT- und Zentralbankseiten
bei 390 px: beide manuellen Schaltflächen sichtbar, beide Anfragen HTTP 200,
kein seitlicher Seitenüberlauf, keine Laufzeit-/API-Fehler und keine
persönlichen Schreibversuche. Die erste mobile Testfassung enthielt eine
falsch kodierte Beschriftung. Ein weiterer Test ersetzte die Seite vor Ende
ihrer laufenden Nachladeanfragen; WebKit meldete hierfür eine
Access-Control-Fehlermeldung. Die finale Testfassung wartet deren Abschluss
ab und besteht ohne diese Fehler.

Der Besitzer-/SSO-Schutz für alle Deployments und die einzige Besitzeridentität
sind vor Aktivierung geprüft. Die exakt für die Tests erstellten Zugänge sind
widerrufen; anonyme und widerrufene Sitzungsanfragen liefern HTTP 401.

Ein Windows-Debug-Build und der tatsächliche Prozess-/Fensterstart wurden
geprüft. Mangels erreichbarer WebView-CDP-Anbindung ist dies keine vollständige
native UI-Abnahme. Zusätzlich besteht `pnpm tauri build --no-bundle` mit der
neuen Windows-Release-Datei unter
`apps/desktop/src-tauri/target/release/personal-macro-desktop.exe`.
`START-MACROTOOL.cmd` wählt sie beim nächsten Start als neueste Version.
Die bestehende Release-App wurde nicht beendet. Desktop-SQLite und Cloudpakete
sind getrennte Datenspeicher; diese Arbeit behauptet keine Synchronisierung
persönlicher Daten. Eine physische iPhone-/Safari-Abnahme mit Besitzeranmeldung
bleibt eine gesonderte Geräteprüfung.

Nachweise unter `apps/desktop/.vercel/` sind lokal und nicht versioniert:
`freshness-public.json`, `freshness-state.json`, `freshness-final-state.json`,
`freshness-live-report.json`, `freshness-alias.json` und die separaten
Cron-Nachweise. Sie enthalten keine
Schlüssel oder persönlichen Journalinhalte. Private Zugangskonfiguration
wird nicht in diese Dokumentation übernommen.
