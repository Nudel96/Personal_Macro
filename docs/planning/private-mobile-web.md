# Privater Handyzugriff über Vercel

Stand: 25.09.2026. **Journal, Medien, neun Leitzinsreihen und 214 interaktive
Seasonality-Profile sind bereitgestellt. Die Analyseerweiterung ist ebenfalls
privat bereitgestellt und aktiviert; alle 22 Live-Analyse-Leseprüfungen bestehen.
Der frühere Navigationsfehler ist behoben; die abschließende Prüfung der
tatsächlich bereitgestellten mobilen Navigation und Oberfläche besteht.
Keine vollständige Desktop-Parität.**

Aktuell ist zusätzlich die Korrektur des langsamen iPhone-Sitzungsaufbaus als
`dpl_FJHF6sZthr7w9GiyA4USpDvSnGnp` bereitgestellt. Der stabile Alias zeigt auf
`personal-macro-qi1zlug2a-nudel96s-projects.vercel.app`. Die erneute vollständige
Live-Abnahme mit WebKit endete am 25.09.2026 um 15:51:25 UTC erfolgreich:
alle 22 Analyseprüfungen, Übersicht, Trades und sechs Analyseseiten bei 390 px.
Erster Sitzungsaufbau 4,4 Sekunden, folgender Browseraufruf 0,18 Sekunden;
Journalrevision unverändert, Testzugang widerrufen, SSO unverändert.
Die folgenden Aq-Nachweise beschreiben den davor abgenommenen Analyse-Rollout.
[Aktueller iPhone-Einstieg und Nachweise](../audit/private-web-iphone-startup.md).

Der Benutzer hat die private Bereitstellung über sein eigenes Vercel-Konto
beauftragt. Ausschließlich er soll auf die Inhalte zugreifen können. Der Auftrag
erlaubt die Hosting-Einrichtung; eine öffentlich zugängliche Veröffentlichung
erfüllt ihn nicht.

Der Benutzer hat inzwischen ausdrücklich bestätigt, dass er Inhalte am Handy
wie am PC aktiv nutzen und bearbeiten möchte. Ein schreibgeschützter Datenstand
erfüllt den Auftrag daher nicht. Er hat außerdem bestätigt: **Der PC darf aus
sein.** Ein Tunnel zu einem laufenden Windows-PC erfüllt den Auftrag nicht.

Der inzwischen bestätigte Zielweg bleibt vollständig über sein Vercel-Konto
verwaltbar: Vercel für Weboberfläche und Rust-Container, PostgreSQL über die
native Neon-Marketplace-Integration sowie privater Objektspeicher für Dateien.
Der besprochene Kostenrahmen beträgt höchstens 10 EUR monatlich. Zunächst wird
ausschließlich ein kostenloser Neon-Tarif eingerichtet; ein bezahlter Tarif
ohne nachgewiesene Begrenzung ist damit nicht freigegeben.

## Erweiterung der Analysebereiche – bereitgestellt und live geprüft

Der aktuelle Auftrag erweitert den privaten Browser um Macro-Heatmap, COT
Insights, Wirtschaftsdaten und Wirtschaftskalender, technische Signale,
Regime Insights, Weltatlas, Staatsanleihen und Zentralbankberichte. Die native
Rust-Fachlogik liest dazu getrennte geprüfte Marktpakete. Atlasnotizen und
Berichtslesemarker werden als persönliche Daten in PostgreSQL bearbeitet.
Die folgenden Erweiterungen sind bereitgestellt und ihre Manifestgeneration
ist aktiviert. Die API-Leseprüfung besteht; der zuerst gefundene Fehler der
Marktkontext-Navigation wurde korrigiert und am finalen Deployment erneut
erfolgreich geprüft. Persönliche Schreibpfade sind auf isoliertem PostgreSQL
getestet. Die Besitzerbedienung auf einem physischen iPhone mit Safari bleibt offen.

| Funktion | Aktueller Implementierungs- und Freigabestand |
| --- | --- |
| Macro, COT, Wirtschaftsdaten/-kalender, Technicals, Regime | Native Snapshot-Reader und private Bedienoberflächen bereitgestellt; Live-Lesen geprüft, mobile Seitenprüfung für Macro, COT, Wirtschaftsdaten und Kalender; Regime-Menülink geprüft |
| Weltatlas | Angebundene öffentliche Reihen und Profile, Länder-/Themenauswahl und Vergleiche bereitgestellt; ausgewählte Live-Lesepfade und Menülink geprüft, Seite im mobilen Live-Test nicht geöffnet; fehlende Quellprofile bleiben fehlend |
| Atlasnotizbuch und letzte Ansicht | Persönliche PostgreSQL-Lese-/Schreibpfade einschließlich Revision und Vorgangsbeleg bereitgestellt und auf isoliertem PostgreSQL geprüft; im Live-Test nicht bedient |
| Staatsanleihen | Katalog, Historien, Kurven und datierte Vergleiche bereitgestellt; Live-Lesen und mobile UI-Stichprobe bestehen |
| Zentralbankberichte | Vorhandene Texte und Zusammenfassungen aus geprüften Paketen, persönliche Lesemarker separat in PostgreSQL; bereitgestellt; Live-Lesen und mobile UI-Stichprobe bestehen |
| Seasonality-Screener und Chancensuche | Explizit gestartete Batches, Fortschritt, Abbruch weiterer Schritte und globale Rangfolge bereitgestellt; Live-Batch-Lesen geprüft, Scan-Bedienung im mobilen Live-Test nicht ausgeführt |
| Provider-Aktualisierungen und neue Berichtsverarbeitung | Kein automatischer oder manueller Cloud-Abrufdienst implementiert |
| Brokerverbindungen, native Dateiimporte/-exporte, Backup/Restore | Kein neuer Cloud-Bedienablauf implementiert |
| Automatische Desktop-/Cloud-Synchronisierung | Nicht implementiert; Browser und native Desktop-Datei bleiben getrennte Datenbestände |

Alle Analysebereiche sind **optional gegenüber den unveränderten 46
Pflicht-Capabilities** des Journals und der Medien. Die passende Route benötigt
ihren vollständigen Command-Satz; fehlende Marktbestände sperren weder das
Journal noch erlauben sie einen Demo-Fallback. Lesende Analysen sind mit
ausgeschaltetem PC vorgesehen; ein aktueller Providerstand wird dadurch nicht
automatisch erzeugt.

Die neue Gesamtgeneration umfasst **555 Pakete,
1.000.374.272 Rohbytes und 141.744.234 Gzip-Bytes**. Alle Pakete sind privat
hochgeladen und durch erneuten Abruf bytegenau bestätigt. Die gesamte Blob-Belegung
einschließlich bisheriger Generation und vier Originalbildern beträgt
**176.407.066 Byte**. Die Generation
`9aa3d4e2-1c44-4852-bc16-cf400fd72d3e` ist durch erfolgreiche atomare
Compare-and-Swap-Veröffentlichung aktiviert (`published: true`, 555 Artefakte,
141.744.234 Transportbytes). Der gemeinsame Vertrag erlaubt höchstens
1.024 Artefakte, 2 GiB Rohdaten und 500 MiB Gzip pro Generation. Pro Paket gelten
32 MiB Transport und 128 MiB entpackt; höchstens zwei temporäre Lese-Leases
begrenzen die gleichzeitige Dateibelegung auf 320 MiB. Die JSON-Anfragegrenze
bleibt 2 MiB; Antworten sind getrennt auf 4 MiB begrenzt.

Saisonale Scans starten ausschließlich auf ausdrückliche Bedienung, nie beim
Öffnen der Seite. Ihre Batches pinnen eine Generation und werden sequenziell
zusammengeführt. Ein Batch enthält höchstens fünf Instrumente; der erste
Divergenzschritt lädt zusätzlich sieben USD-Spotreihen. Zwei serverseitige
Compute-Permits bleiben auch nach einem Request-Abbruch bis zum tatsächlichen
Ende der Blocking-Berechnung gehalten. Die Gesamtfrist beträgt 75 Sekunden je
Batch, die numerische Teilfrist 50 Sekunden. Livegeschwindigkeit und Abbruch-
Bedienung müssen noch geprüft werden; echte FX-Futures bleiben ohne Datenzugang.

Der abgeschlossene Prüfstand umfasst **66 Rust-Cloudtests einschließlich
isolierter PostgreSQL-Prüfungen, 20 erfolgreiche COT- und 18 erfolgreiche
Macrotests bei einem weiteren ignorierten Test, 161 Frontendtests in 26 Dateien
und einen erfolgreichen privaten Produktionsbuild**. 38 Gateway-/Service-Tests
einschließlich der Größengrenzen bestehen ebenfalls; der vorherige Node-Lauf
mit Uploader-/Schemaprüfungen bestand mit 110 erfolgreichen Tests und einem
Skip. Diese Läufe und die historischen Nachweise unten sind nicht zu einer
überschneidungsfreien Gesamtsumme zu addieren.

**Alle 555 echten Pakete wurden durch Loader und native Reader geprüft.** Die
einzige Antwort oberhalb der früheren 2-MiB-Grenze war
`atlas:valuation:countries` mit 2.112.267 Byte. Mit der separaten Antwortgrenze
von 4 MiB bestand die erneute Prüfung genau dieses unveränderten Pakets;
Quelldaten wurden nicht gekürzt. Native- und Cloud-Clippy sowie der echte
Windows-Debug-Build bestehen. Prozess und Fenster „Personal Macro“ wurden
gestartet und nachgewiesen. Das native Frontend war nicht über CDP prüfbar;
eine vollständige native UI-Abnahme ist damit nicht belegt.

Die PostgreSQL-Migrationen 0005 und 0006 sind nach Prüfung der
Workspace-Identität angewendet. Deployment `dpl_AqHBFCN5aPmYKpv5EePWhjQHeuWh`
ist `READY`, `public: false`, Region `fra1`, mit allen drei Services für
Weboberfläche, Node-Gateway und Rust-Backend. Der stabile Projektalias zeigt
auf `personal-macro-i1ktdtp9e-nudel96s-projects.vercel.app`; die neue Generation
ist dort aktiviert. Alleinige Besitzeridentität und SSO-Konfiguration sind
erneut bestätigt.

### Live-Lesen und abschließende mobile Browserprüfung vom 25.09.2026

Der Liveprüflauf von 13:36 bis 13:44 UTC bestand **alle 22 Analyse-Leseprüfungen**,
einschließlich einer Atlas-Antwort mit 2.112.285 Byte, eines Screener-Batches
mit fünf Instrumenten und der Fenstersuche in zwei Schritten mit fünf und zwei
Instrumenten. Die gemessenen Scan-Schritte lagen bei etwa 16–18 Sekunden.
Diese Messung stammt vom veröffentlichten Dienst; sie ersetzt keine Prüfung
jeder möglichen großen Auswahl.

Das damalige Gesamtergebnis im lokalen Nachweis
`apps/desktop/.vercel/live-owner-service-report.json` lautete trotzdem
**`ok: false`**: `AppShell` blendete die Marktkontext-Navigation im privaten
Webmodus aus. Der aktuelle Fix filtert Navigationseinträge nach den verfügbaren
Capabilities und besteht 16 Tests. Zwei mobile Macro-Layoutkorrekturen wurden
mit lokalen Fixtures bei 320, 390, 768 und 1440 px geprüft.

Ein separater Vorabtest der lokal kompilierten Oberfläche mit dem echten
Backend bestand (`apps/desktop/.vercel/live-owner-local-ui-report.json`):
sechs Analyseseiten sowie Übersicht und Trades bei 390 px ohne Seitenüberlauf,
zehn sichtbare Navigationslinks, keine Laufzeit-/API-Fehler und unveränderte
Revision. Dieser Vorabtest war keine Abnahme des deployten Frontends.

Der Korrekturbuild `dpl_AqHBFCN5aPmYKpv5EePWhjQHeuWh` ist `READY`,
`public: false`, in `fra1` mit Web-, Backend- und Gateway-Service. Der stabile
Projektalias zeigt auf `personal-macro-i1ktdtp9e-nudel96s-projects.vercel.app`.
**Die nachfolgende Prüfung der tatsächlich bereitgestellten mobilen Oberfläche
ist erfolgreich abgeschlossen.** Der Nachweis
`apps/desktop/.vercel/live-owner-mobile-report.json` endet am
`2026-09-25T14:15:31.548Z` mit `ok: true`, `validationSucceeded: true`,
`cleanupVerified: true`, `deployedUI: true` und `compiledLocalUI: false`.
Sechs Analyseseiten sowie Übersicht und Trades bestanden bei 390 px ohne
Seitenüberlauf; zehn Navigationslinks sind sichtbar. Keine Laufzeit-/API-Fehler,
keine blockierten Schreibversuche und unveränderte Journalrevision. Der
ursprüngliche Navigationsfehler ist damit behoben und live nachgeprüft.

Der Liveprüflauf führte ausschließlich Lesezugriffe und UI-Prüfungen aus,
keine persönlichen Schreibbefehle (`personalWritesPerformed: false`).
Persönliche Schreibpfade wurden auf isoliertem PostgreSQL geprüft; das ist
keine Schreibabnahme am persönlichen Livebestand. Der temporäre Testzugang
wurde entfernt (`cleanup: true` im ersten Lauf, `cleanupVerified: true` im
Abschlusslauf). Besitzeridentität und SSO-Schutz für alle Deployments blieben
unverändert; genau der temporäre Testschlüssel wurde widerrufen. Anonyme und
widerrufene Testanfragen lieferten HTTP 401. Die bestätigte Freigabe umfasst
Analyselesepfade und die geprüfte mobile Navigation/UI. Sie ist keine
vollständige Desktop-Parität. Die Besitzerbedienung auf dem tatsächlichen
iPhone mit Safari bleibt als gesonderte Geräteprüfung offen.

Die bestehende Macro-Methodik wurde nicht stillschweigend geändert. Insbesondere
ist der Widerspruch zwischen der Anforderung gemeinsamer verfügbarer Paarseiten
und dem tatsächlichen Desktopvertrag für fehlende Seiten dokumentiert:
[Macro-Frischeprüfung](../audit/cloud-macro-freshness-review.md). Die neue
Frischeprüfung erhält die native Aggregation und verändert keine gespeicherten
Quellwerte. Vollständiger Stand und Ressourcenvertrag:
[Private Marktdaten](private-market-cloud.md).

## Historisch abgenommene Journal- und Marktgrundlage

Die zusätzliche Bestätigung wurde übernommen. `personal-macro-data` ist als
Neon `free_v3` in Frankfurt ohne separate Neon-Auth eingerichtet und an Preview
angeschlossen. `personal-macro-files` ist ein privater Vercel-Blob-Speicher,
ebenfalls in Frankfurt. Es wurde kein kostenpflichtiger Tarif aktiviert.
Zugangsdaten liegen nur in den geschützten Preview-Umgebungsvariablen und lokal
unter dem ausgeschlossenen `.vercel`-Verzeichnis; niemals im Client-Bundle.

Die vollständige lokale Sicherung wurde außerhalb des Repository erstellt und
integritätsgeprüft. Der explizite Import hat 338 persönliche Zeilen aus 30 Kern-
und 21 Historientabellen übertragen (192.679 Byte Nutzinhalt). Historien bleiben
in einem getrennten Archiv; sichere Einstellungen werden nach Freigabeliste
übernommen, Broker-Konfigurationen benötigen eine neue Cloud-Anbindung.
2.466.149 Provider-/Cachezeilen und geheime Konfigurationsfelder wurden bei diesem
Journalimport ausgeschlossen. Alle Zeilenhashes und Journal-Kennzahlen der beiden Konten stimmen.
Vier Originalbilder mit insgesamt 492.440 Byte wurden in den privaten Blob-Speicher
übertragen. Größe, MIME-Typ, SHA-256 und erneut gelesene Originalbytes stimmen.
Die vollständige Medienzuordnung und Workspace-Identität wurden anschließend
gemeinsam aktiviert; die initiale Journalrevision bleibt 0.

Anschließend wurden öffentliche Leitzins- und Seasonality-Daten getrennt als
216 neue Minimalpakete exportiert, privat hochgeladen und aktiviert: 1.690.660
Zeilen, 142.450.688 unkomprimierte Byte und 34.170.392 Byte Gzip-Transport.
Neun Leitzinsreihen und alle 214 vorhandenen Seasonality-Profile sind über die
optionalen Browserrouten verfügbar. Vier Analysen mit jeweils der längsten
Historie aus Forex, Indizes, Kryptowährungen und Commodities bestanden im echten
Gateway-/Rust-/Neon-/Blob-Integrationstest; maximal 8.047 ms im lokalen Debug-Build
einschließlich Cloudabruf. Diese Messung ist kein Vercel-Laufzeitbenchmark.

48 gemeinsame Rust-Cloudtests einschließlich echter, isolierter Neon-Testschemata
und die 13 abschließenden Cache-Tests bestehen. Gateway, Medien und Migrationen
sind zusätzlich durch 176 Node-Tests geprüft; ein Windows-Dateisymlink-Test wurde
mangels Berechtigung übersprungen, Junction-Prüfungen bestehen. Der private Blob-Praxistest bestätigt
unveränderte Originalbytes, Wiederverwendung bei Wiederholung und HTTP 403 beim
unangemeldeten Abruf. Die ausschließlich künstliche Testdatei wurde gelöscht.

Ein zusätzlicher echter Lesetest startet den HMAC-geschützten Rust-Server nur auf
Loopback, verbindet den unveränderten Node-Gateway mit Neon und liest beide Konten
sowie alle vier privaten Bilder. Signierte Zugriffe funktionieren, Zugriffe ohne
Sitzung/Signatur werden abgewiesen und die Journalrevision bleibt unverändert.
Dies ersetzt nicht die Ende-zu-Ende-Prüfung mit der Besitzeranmeldung am iPhone.
Private Blob-Lesezugriffe umgehen den CDN-Cache, damit ein zuvor fehlendes Objekt
nach erfolgreichem Upload sofort zuverlässig überprüft werden kann.

Der Cloudbetrieb verwendet ein eigenes PostgreSQL-Backend. Die Desktop-SQLite-
Migrationen bleiben unverändert. HTTP-Vertrag und reine Rust-Berechnungen werden
wiederverwendet; Datenmutationen, Revisionsprüfung und Vorgangsbeleg liegen in
derselben PostgreSQL-Transaktion. Prozess-Mutex und SQLite-Kontrolldatei der
älteren Serverbasis reichen für mehrere Vercel-Instanzen nicht.

Die aktuelle Vercel-Dokumentation unterstützt Container auf Hobby und einen
entfernten Dockerfile-Build. Rust-Container und Weboberfläche wurden erfolgreich
bereitgestellt; der geschützte Link ist
https://personal-macro-nudel96s-projects.vercel.app.
Aktuelle Konfiguration verwendet `services`, nicht `experimentalServices`.
Der Backend-Service erhält keine öffentliche Weiterleitung; der Gateway ist auf
die interne Service-Bindung mit zusätzlicher HMAC-Prüfung konfiguriert.
Das damals abgenommene Deployment `dpl_ARdMPAyeNpNTdzYSpZ92Sjx7Dtry` war `READY`;
der stabile Projektlink zeigte zu diesem Prüfzeitpunkt auf diesen Stand. Der Build enthält nachweislich
`services/gateway/index` und `services/backend/container` in `fra1`.
Der Live-Lesetest und ein mobiler Chromium-Browsertest bestehen. Die erneute
Bedienung mit der Besitzeranmeldung auf dem tatsächlichen iPhone bleibt offen.

### Korrektur und Live-Abnahme vom 25.09.2026

Der iPhone-Screenshot zeigte eine geladene Oberfläche, aber keine bestätigte
private Verbindung. Im vorherigen Deployment `dpl_CDUTLKZjQJBeo23iTrcVNETk1tFQ`
fehlte der Gateway: Vercel baut das Verzeichnis `api/` bei konfigurierten Services
nicht automatisch. Der erfolgreiche Rust-/Frontend-Build allein hatte den
fehlenden API-Dienst nicht aufgedeckt.

`server/gateway/service.mjs` ist jetzt ein eigener Service mit `runtime: "node"`.
Die interne Backend-Bindung gehört zu diesem Service; `/api/:path*` wird vor der
SPA-Weiterleitung dorthin geroutet. Nur Sitzung, freigegebene Commands und Medien
sind erreichbar. Der unveränderte Request geht an die bisherigen geprüften Handler.
58 Gateway-, Medien- und Service-Tests sowie der tatsächliche Vercel-Build bestehen.
Die geprüfte Uploadliste enthält 660 Dateien ohne persönliche Daten, Geheimnisse
oder die nicht verwendeten `api/`-Wrapper.

Die Prüfung am stabilen HTTPS-Projektlink bestätigte:

- Sitzung mit HTTP 200, allen 46 Pflicht-Capabilities, sicherem Host-Cookie und
  `no-store`; zwei Konten und alle vier Originalbilder mit insgesamt 492.440 Byte.
- Neun Zinsreihen, 214 Seasonality-Märkte und eine erfolgreiche Live-Einzelanalyse.
- Übersicht und Navigation zur Trade-Seite bei 390 × 844 px im mobilen Chromium;
  kein horizontaler Überlauf, keine Laufzeit- oder fehlgeschlagenen API-Anfragen.
- Keine persönlichen Schreibbefehle und unveränderte Journalrevision.

Der Test verwendete einen kurzlebigen Automation-Zugang ausschließlich im
Prozessspeicher. Nach Abschluss wurde genau dieser Schlüssel entfernt; erneute
Abrufe mit dem widerrufenen Schlüssel und ohne Anmeldung lieferten HTTP 401.
Die Besitzer-/SSO-Einstellungen blieben unverändert. Eine unabhängige anschließende
Prüfung von `/`, `/rates`, `/seasonality`, `/api/session`, `/api/commands` und
`/api/media` ohne Schlüssel oder Cookie wurde jeweils zur Vercel-Anmeldung
umgeleitet. Es wurde kein dauerhafter Testzugang oder Freigabelink hinterlassen.
Dieser technische Test ersetzt keine Safari-Anmeldung und keinen persönlichen
Schreibtest durch den Besitzer auf seinem iPhone.

Neon Free bietet 0,5 GB relationalen Speicher pro Projekt. Die vollständigen
bestehenden SQLite-Dateien überschreiten diesen Wert; daraus folgt noch nicht,
dass das persönliche Journal allein zu groß ist. Eine tabellenweise Prüfung
trennt persönliche Datensätze, historische Importnachweise und öffentliche
Marktdaten-Caches. Kein Aufteilen einer Datenbank auf mehrere kostenlose Projekte,
kein stilles Weglassen bestehender persönlicher Daten.
Vercels Ausgabenlimit schließt Marketplace-Dienste aus; ein dort gesetzter
Betrag wäre kein verlässliches Neon-Kostenlimit.

### Tatsächliche Tabellenprüfung vom 24.09.2026

Der neue [Migrationsprüfer](../../apps/desktop/server/migration/README.md) wurde
nach Prüfung seines Codes mit ausdrücklich angegebenem Datenbankpfad und
`--live-read-only` ausgeführt. Er liest eine konsistente SQLite-Transaktion
einschließlich WAL, führt keine Migration oder Sicherung aus und gibt keine
Datensatzwerte aus. Die persönliche Journal-Datenbank stimmt mit den aktuellen
Quellmigrationen überein; Integritätsprüfung bestanden, keine Fremdschlüsselfehler,
keine unbekannten Schemaobjekte. Die zusätzliche SQLx-Migrationstabelle erklärt
90 tatsächlich vorhandene gegenüber 89 aus den SQL-Dateien rekonstruierten Tabellen.

Da die lokale Python-SQLite-Version kein `dbstat` enthält, wurde die
Speicherbelegung ergänzend mit Nodes SQLite im expliziten Lesemodus und einer
einzigen Transaktion gemessen. Nur die aus dem Quellcode bekannten Tabellennamen
wurden ausgewertet; keine Inhaltszeilen ausgegeben.

| Tabellengruppe | Belegte SQLite-Seiten einschließlich Indizes |
| --- | ---: |
| Persönlicher Journal-Kern | 0,35 MiB |
| Einstellungen, persönliche Atlasansichten, Kontoverbindungsmetadaten | 0,05 MiB |
| Zusätzliche persönliche Daten und Importnachweise | 0,42 MiB |
| Medienmetadaten | 0,03 MiB |
| Provider- und historische Quelldaten | 806,30 MiB |

Die größten Quelltabellen sind Seasonality-Tageskurse (513,43 MiB),
EODHD-Release-Jobs (58,50 MiB), historische COT-Rohzeilen (57,13 MiB) und
historische COT-Beobachtungen (39,84 MiB). Die separate Atlas-/Anleihe-Dateigröße
ist darin nicht enthalten. Diese Messung spricht für einen kleinen persönlichen
PostgreSQL-Bestand; sie ersetzt weder die tatsächliche PostgreSQL-Größenprüfung
noch eine vollständige Lösung für die Marktbestände. Die damalige Prüfung änderte
keine Daten. Die nachfolgende persönliche Übernahme ist oben getrennt dokumentiert;
die lokale Datenbank bleibt unverändert.

Der Prüfer besitzt 11 Tests mit ausschließlich temporären Testdatenbanken,
einschließlich konsistenter WAL-Lesetransaktion, unveränderter DB-/WAL-Dateien,
unterdrückter unbekannter Schemawerte und nicht gelesener Einstellungswerte.

## Bestehende Bereitstellung und aktueller Codestand

- Die Shell erhält unter 1024 px eine mobile Navigation. Die Desktop-Anordnung
  bleibt erhalten.
- `apps/desktop/vercel.json` definiert einen eigenen Vite-Webbuild,
  SPA-Routen und restriktive Cache-/Frame-/Indexierungsheader.
- `.vercelignore` erlaubt geprüfte Web-/Rust-Quellen, den eigenen Gateway-Service,
  Gateway-/Medien-Laufzeitcode und Build-Eingaben. Lokale
  Ausgaben, Datenbanken, Backups und Konfigurationsgeheimnisse gehören nicht
  zum Upload. Vor einem Upload auch `src` und `public` auf persönliche Dateien
  prüfen: Dateiausschlüsse ersetzen keine Inhaltsprüfung.
- `pnpm build:private-web` baut nach `dist-private-web`; der normale Tauri-Build
  bleibt in `dist`. Auch ein Vercel-Build mit `VERCEL=1` aktiviert den Webmodus.
- Der neue private Webmodus verlangt eine bestätigte Sitzung und sämtliche 46
  Journal-/Medien-Capabilities vor dem Einstieg. Browser-Demoadapter sind gesperrt,
  persönliche UI-Zustände und Entwürfe werden im privaten Modus nur im Speicher
  gehalten. Fehlende Markt-/Provider-Routen werden vor ihrem Laden abgefangen.
- Der ausgelieferte Stand enthält den schreibenden Journalzugang und private
  Bilder. Medienübernahme und Vercel-Build sind abgeschlossen; die tatsächliche
  Besitzerbedienung ist noch zu prüfen. Es gibt keine automatische Desktop-/Cloud-Synchronisierung.
  Der Einrichtungszustand ist **keine Authentifizierung**.
- Die bisher bereitgestellten vier optionalen Markt-Lesebefehle für neun Leitzinsreihen und die interaktive
  Seasonality-Einzelanalyse aller 214 übernommenen Märkte sind aktiviert.
  Historische Jahre, Zyklen und Analysefenster sind wählbar; Folgeanfragen pinnen
  die Generation der Übersicht. Stand und Übernahmezeit sind sichtbar,
  automatische Cloud-Aktualisierungen werden nicht behauptet. Provider-Refresh
  und Polling bleiben im privaten Modus deaktiviert. Die neue bereitgestellte
  Erweiterung ergänzt ausdrücklich gestartete Screener und Chancensuche;
  deren API-Lesetest und mobile Browserprüfung nach dem Navigationsfix
  bestehen. Umfang und Nachweise:
  [Marktdaten](private-market-cloud.md).
- Macro/COT, Wirtschaftsdaten, Regime, Atlas, Staatsanleihen und Berichte sind
  jetzt als optionale Cloudbereiche bereitgestellt. Die Freigabetabelle
  oben trennt diesen Stand von noch nicht implementierten Providerdiensten,
  Dateiimport/-export, Backup/Restore und Brokerverbindungen. Die native
  Desktop-Datei synchronisiert nicht automatisch mit dem Cloud-Workspace.
- Die erneute Geräteanmeldung wurde am 24.09.2026 erfolgreich gespeichert;
  `vercel whoami` bestätigt `nudel96`. Der separate Windows-Anmeldeprozess hat
  die Freigabe übernommen. Die verbundene Vercel-App liefert weiterhin keine
  Teams, deshalb erfolgt die Einrichtung über die authentifizierte CLI.
- Das separate Projekt `personal-macro` gehört zum bestehenden persönlichen
  Hobby-Team `nudel96s-projects`. Projekt-ID: `prj_GkIrGyOAJ7hGTKQoiuvi6F8zYwPt`.
  Die lokale Verknüpfung liegt ausschließlich unter `apps/desktop/.vercel`.
- Vor dem ersten Upload wurde `ssoProtection.deploymentType = all` gesetzt und
  per API rückgelesen. Vertrauensbasierte Projekt-/OIDC-Zugriffe sind leer;
  gleiches Git-Repository gewährt keinen automatischen CI-Zugriff. Keine
  Passwort-, IP- oder OPTIONS-Ausnahmen wurden eingerichtet. Die API meldet
  genau ein Teammitglied, den bestätigten Besitzer `nudel96`, und keine
  zusätzlichen Projektmitglieder. Vercel-Toolbar-Feedback ist ausgeschaltet.
- Hochgeladen werden ausschließlich geprüfte Programmquellen und Build-Dateien,
  kein persönlicher Datenbestand. Beim ersten Build fehlten wegen einer
  Verzeichnis-Negation in `.vercelignore` die Quellen. Die Negationen `!/src`
  und `!/public` wurden gegen den tatsächlichen Vercel-59.26-Dateilauf geprüft:
  344 erlaubte Dateien, 14 Einschluss- und 25 Ausschlussprüfungen erfolgreich.
- Die aktuell abgenommene Web-/Rust-Bereitstellung ist auf Vercel gebaut und über den
  [stabilen geschützten Projektlink](https://personal-macro-nudel96s-projects.vercel.app)
  bereitgestellt. Deployment `dpl_AqHBFCN5aPmYKpv5EePWhjQHeuWh` enthält die
  Analyseerweiterung; die Live-Leseprüfungen und die oben abgegrenzte mobile
  UI-Abnahme sind erfolgreich abgeschlossen.
  Die API bestätigt `READY`, `public = false` und Region `fra1`; die erneut
  gelesene Projekteinstellung lautet `ssoProtection.deploymentType = all`.
- Sieben neue unangemeldete Abrufe auf `/`, `/rates`, `/seasonality`, die drei
  API-Endpunkte und die tatsächlich ausgelieferte JavaScript-Datei antworten
  jeweils mit HTTP 302 zur Anmeldung bei `vercel.com`. Persönliche Daten- und
  Medienendpunkte existieren und sind im signierten Integrationstest geprüft.
  Die aktive Besitzerbedienung am iPhone sowie ein fremdes angemeldetes Konto
  bleiben offene Ende-zu-Ende-Prüfungen. Aus dem vorangegangenen Deployment 4
  lagen keine Vercel-Laufzeitanfragen als zusätzlicher Bedienungsnachweis vor.

## Frühere SQLite-Serverbasis – nicht die aktuelle Vercel-Laufzeit

Dieser Abschnitt beschreibt die erhaltene Alternative für einen Host mit
dauerhaftem Datenträger. Die aktuelle Bereitstellung nutzt das oben beschriebene
PostgreSQL-Backend mit privatem Blob-Speicher.

Die produktive Anwendung verwendet Tauri/Rust und lokale SQLite-Datenbanken.
Ein Vite-Upload portiert diese Backend-Funktionen nicht zu Vercel Functions.
Die bisherige Browser-Vorschau verwendet eigene leere lokale Journaldaten;
Macro, Atlas, Seasonality und Brokeranbindungen benötigen überwiegend Tauri.
`apps/api` und `apps/web` bleiben ältere Referenzen und werden nicht eingesetzt.

Die bisher vorbereitete Variante verwendet Vercel für Oberfläche und authentifizierten
Gateway sowie einen separaten Rust-Server mit dauerhaftem SQLite-Datenträger.
Damit bleiben die vorhandenen SQL-Abfragen, Berechnungen und Migrationen
verwendbar. Vercel unterstützt zwar Rust-Container, deren lokaler Speicher ist
aber nicht dauerhaft. Eine reine Vercel-Variante würde zusätzlich eine Portierung
der SQLite-Persistenz auf einen unterstützten entfernten Datenbankdienst benötigen.

Eine reine Dateigrößenprüfung ergab etwa 807 MiB Journal-Datenbank, 651 MiB
Atlas-Cache und 133 MiB Staatsanleihe-Cache, zusätzlich Medien und Sicherungen.
Diese vorbereitete Variante benötigt einen separaten dauerhaften Datenträger.
Sie ist keine bereits lauffähige Vercel-/Neon-Anbindung. Keine kostenpflichtige
Ressource wurde angelegt oder gebucht.

Im Quellcode vorbereitet:

- `src-tauri` hat einen separaten Build ohne Tauri: `cargo build --locked
  --no-default-features --features server --bin personal-macro-server`.
  Der Desktop bleibt Standard. `initialize_at()` arbeitet nur mit einem expliziten
  absoluten Datenpfad und verwendet SQLite FULL auf jeder Verbindung.
- `web_server` bietet eine ausdrückliche Freigabeliste für Journal, Trades,
  Konten, Reviews, Ziele, Playbook und ausgewählte Einstellungen. Native
  Datei-/Restore-/Broker- und Windows-Funktionen sind nicht automatisch über
  HTTP erreichbar. Lokale Pfade und geheime Einstellungen werden nicht ausgegeben.
- Jede Anfrage vom Gateway trägt HMAC-SHA256 über Methode, Pfad, Zeit, Nonce
  und unveränderte Nutzdaten. Wiederholte/abgelaufene Signaturen scheitern.
  Ein Betriebssystem-Lock erlaubt nur einen Server je Datenträger.
- Schreibbefehle benötigen Workspace-ID, Basisrevision und UUID. Die Revision
  wird vor dem Geschäftsaufruf dauerhaft reserviert. Derselbe Vorgang wird
  nicht doppelt ausgeführt; unklare Vorgänge erfordern Prüfung nach Neuladen.
  Zwei Geräte mit derselben alten Revision können nicht beide schreiben.
- Der Vercel-Gateway prüft feste HTTPS-Ziele, genaue Browser-Origin,
  HttpOnly-/Secure-/SameSite-Cookie und CSRF-Token. Keine externen Bypass- oder
  Anmeldeheader werden an den Datenserver weitergeleitet. Geheimnisse gehören
  ausschließlich in die Serverumgebung, niemals in `VITE_*`.
- Der Frontend-Transport nutzt in diesem Modus ausschließlich die echte API.
  Nach Verbindungsfehlern wird nicht auf Browser-Demodaten zurückgefallen.
  Vorhandene native Command-Zuordnungen bleiben erhalten.
- Eine Bereitstellungsvorlage für einen eigenen Linux-Host liegt unter
  [server/deployment](../../apps/desktop/server/deployment/README.md), mit
  festgelegten Image-Versionen, nicht privilegierten Benutzern, HTTPS-Proxy
  und einem vom Build getrennten dauerhaften Datenverzeichnis.

Der frühere gesperrte Einrichtungszustand ist durch die bestätigte Sitzungsgrenze
mit echtem Journal-/Medienzugang abgelöst. Der Vercel-Rust-Container wurde erfolgreich
gebaut und bereitgestellt. Die übrigen Cloud-Fachbereiche bleiben ausdrücklich
gesperrt, bis ihre Lese- und Schreibabläufe vollständig angebunden sind.

Entwürfe der schnellen und geführten Trade-Erfassung werden im privaten Webmodus
inzwischen ausschließlich kontogetrennt im Arbeitsspeicher der bestätigten Sitzung
gehalten. Sitzungsende, verweigerter Zugriff und erforderliches Neuladen verwerfen
sie; nachträgliche Speicheraufrufe ohne aktive Sitzung werden abgelehnt. Desktop
und lokale Browser-Vorschau behalten ihr bisheriges localStorage-Verhalten.
25 gezielte Tests dieser Entwurfspeicherung, Typecheck und privater Produktionsbuild
bestanden. Die Aktivierung der Cloud-Anwendung erfolgte später mit der geprüften
Daten- und Medienübernahme.

Für einen gemeinsamen Datenbestand nutzen PC und Handy denselben
privaten Browser-Workspace. Die bestehende native Desktop-App bleibt bis zu
einer gesonderten, geprüften Anbindung lokal; sie synchronisiert nicht automatisch.
Komplette SQLite-Dateien zwischen aktiven Geräten hin und her zu kopieren ist
kein Synchronisierungsmodell.

Die initiale Übernahme verwendete eine konsistente Sicherung und einen geprüften
verbindlichen Datenstand in einem getrennten Zielbereich. Auch jede spätere
Übernahme benötigt diese Prüfungen. Ein reguläres Journal-Backup enthält nicht den getrennten
Atlas-/Staatsanleihe-Cache oder den neuen Server-Kontrollspeicher. Niemals die
aktive persönliche Datenbank für Tests oder als Build-Eingabe verwenden.

## Zugriffsschutz vor der ersten Veröffentlichung

Vercel Authentication muss für **All Deployments** eingeschaltet und
rückgelesen werden. „Standard Protection“ reicht als dauerhafte Anforderung
nicht aus, wenn eine Produktionsdomain öffentlich bleibt. Alle späteren
Preview-/Deployment-/Produktionsadressen müssen denselben Schutz erhalten.

Vercel-Zugang für ein Team ist nicht automatisch Zugang nur für den Besitzer.
Vor Veröffentlichung muss geprüft werden, dass allein seine Identität Zugang
hat, keine weiteren bestätigten oder eingeladenen Mitglieder vorgesehen sind,
keine externen Freigaben bestehen und keine Schutz-Ausnahmen aktiv sind.
Freigabelinks und Bypass-Tokens nicht zum Handyzugriff verwenden. Der Benutzer
meldet sich am Handy mit seiner eigenen berechtigten Vercel-Identität an.

`scripts/check-private-vercel.mjs` ist eine zusätzliche rein lesende Vorprüfung
der über die Vercel-API beweisbaren Eigenschaften. Sie benötigt die ausdrücklich
gewählten Projekt-/Team-IDs und ein `VERCEL_TOKEN` ausschließlich in der
Prozessumgebung. Keine Tokens als Kommandozeilenargument oder in `VITE_*`.
Offene Prüfungen bleiben sichtbar; eine API-Prüfung allein ersetzt nicht die
Überprüfung externer Freigaben und tatsächlicher Zugriffssperren.

Aufruf: `pnpm privacy:vercel --project-id prj_… --team-id team_…`.
Exitcode 1 bedeutet einen Fehler oder unzulässige Konfiguration; Exitcode 2
bedeutet noch offene Nachweise/Abnahme. Auch eine vollständig bestandene
Teilprüfung meldet keine generelle Deploymentfreigabe. Die Tests des Prüfers
laufen mit `pnpm test:private-vercel` unabhängig von Vitest.
Die aktuelle alternative Mitgliederantwort mit leerem `pagination`-Objekt
wird nur bei exaktem, ganzzahligem `totalCount` unter der Seitengrenze als
vollständige Einzelseite akzeptiert. Fehlende Einladungsdaten bleiben unbestätigt.
16 Tests bestehen; die tatsächliche API-Antwort bestätigt das einzige
OWNER-Mitglied, liefert aber keine eigenständige Einladungsprüfung.

Vor einem späteren Daten-Upload müssen abgemeldete Zugriffe auf Startseite,
Unterseiten, Assets und Daten-URLs nachweislich blockiert sein. Zusätzlich
autorisierte Anmeldung, Handyansicht, Datenherkunft und Aktualität prüfen.
`noindex`, versteckte URLs und React-Routensperren sind kein Zugriffsschutz.

## Lokale Prüfung

```powershell
cd D:\Macrotool\apps\desktop
pnpm typecheck
pnpm build
pnpm build:private-web
pnpm exec vite preview --outDir dist-private-web --host 127.0.0.1 --port 4174
```

Der letzte Befehl startet ausschließlich eine lokale Vorschau, ohne
Vercel-Authentifizierung oder bereitgestellte Cloud-Gateway-Verbindung.
Er ist kein privater Cloud-Zugang. Keine persönlichen Daten
zum Testen in `public`, `src`, `dist` oder `dist-private-web` kopieren.

## Historische lokale Abnahme der Vorbereitung

Die folgenden Nachweise stammen aus der früheren SQLite-/Webvorbereitung.
Den aktuellen PostgreSQL-/Medien-/Marktstand und die Vercel-Bereitstellung
beschreiben die Abschnitte oben; eine lokale Prüfung allein ersetzt weiterhin
nicht die ausstehende Besitzerbedienung auf dem iPhone.

- Nach der Server-Erweiterung: 331 Rust-Tests bestanden, 54 ausdrücklich
  ignorierte Live-/Quellentests nicht ausgeführt. Darin sieben HTTP-/Speicher-
  Tests und vier Tests des separaten Datenverzeichnisses; persönliche Daten
  wurden nicht als Testdaten genutzt.
- 51 gezielte Frontendtests einschließlich Sitzungsgrenze, Command-Fassade,
  Myfxbook-Regression und Mobilnavigation sowie 26 Gatewaytests bestanden.
- Der echte Node-zu-Rust-Test mit temporären Daten bestand: Sitzung,
  Schreibvorgang, wiederholte Vorgangskennung, konkurrierendes Gerät,
  Signaturablehnung und Fortbestand nach einem Prozessneustart.
- Der separate Windows-Server-Build, Server-Clippy mit `-D warnings` und
  der unveränderte Standard-Desktop-Buildpfad (`cargo check --lib`) bestehen.
  Der neue private Frontend-Produktionsbuild besteht ebenfalls. Dies ersetzt
  ausdrücklich noch keinen Linux-/Docker-Test auf dem vorgesehenen Host.
- Die aktuelle Vercel-Uploadliste ist mit CLI 59.26.0 geprüft: 352 Dateien,
  darunter ausschließlich die zwei API-Einstiege und ein Gateway-Modul im
  neuen Serverbereich. 8 Einschluss-/24 Ausschlussproben bestanden;
  Konfiguration und API-Ausnahme in der SPA-Weiterleitung sind validiert.
- TypeScript-Prüfung und regulärer Produktionsbuild erfolgreich.
- Separater `private-web`-Produktionsbuild erfolgreich.
- 13 Vitest-Fälle für Webmodus/Workspace-Grenze und fünf Navigationstests
  erfolgreich; 14 separate Node-Tests für den Vercel-Prüfer erfolgreich.
- 20 unterschiedliche Routen bei 390 px auf Seitenüberlauf geprüft; sechs
  zentrale Routen zusätzlich bei 320, 768 und 1440 px. Die
  Einrichtungsseite bei 390 × 844 px ebenfalls ohne horizontalen Überlauf.
- Geänderte Frontenddateien mit ESLint/Prettier geprüft; `git diff --check`
  ohne Fehler. Die bereits bekannten Hinweise auf große Build-Chunks bleiben.
- Die Anmeldung und ausgewählte Schutz-/Mitgliedseinstellungen sind inzwischen
  über die echte Vercel-API bestätigt. Die echte Vercel-Vorschau ist `READY`;
  drei unangemeldete Browserzugriffe wurden zur Anmeldung umgeleitet.
  Damals standen die Live-Abnahme und das schreibende Cloud-Backend noch aus.
  Das Backend ist inzwischen bereitgestellt; die Besitzerabnahme am iPhone bleibt offen.

## Offizielle Grundlagen

- [Vercel Authentication](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication)
- [Projektkonfiguration ändern](https://vercel.com/docs/rest-api/projects/update-an-existing-project)
- [Teammitglieder lesen](https://vercel.com/docs/rest-api/teams/list-team-members)
- [Upload-Dateien begrenzen](https://vercel.com/docs/deployments/vercel-ignore)
- [Vercel Services](https://vercel.com/docs/services)
- [Container und fehlender dauerhafter Datenträger](https://vercel.com/kb/guide/docker-compose-concepts-on-vercel)
- [Rust-Container direkt auf Vercel](https://vercel.com/kb/guide/deploy-rust-on-vercel-with-docker)
- [Interne Service-Bindungen](https://vercel.com/docs/services/bindings)
- [Native Vercel-/Neon-Integration](https://neon.com/docs/guides/vercel-managed-integration)
- [Neon-Tarife](https://neon.com/docs/introduction/plans)
- [Vercel-Ausgabenlimit und Marketplace-Ausnahme](https://vercel.com/docs/spend-management)
