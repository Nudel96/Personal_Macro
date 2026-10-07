# Personal Macro – Handbuch für Coding-Agents

Diese Datei ist die verbindliche Einstiegshilfe und Arbeitsanweisung für jeden
Coding-Agenten, der in diesem Repository arbeitet. Lies sie vollständig, bevor
du Dateien änderst. Sie beschreibt den tatsächlich implementierten Stand. Bei
Widersprüchen gilt folgende Reihenfolge:

1. expliziter aktueller Auftrag des Benutzers,
2. ausführbarer Code und aktuelle SQLite-Migrationen,
3. diese Datei,
4. Dokumente unter `docs/`,
5. ältere Referenzprojekte unter `apps/api` und `apps/web`.

Planungs- und Audit-Dokumente erklären wichtige Entscheidungen, können dem Code
aber zeitlich hinterherlaufen. Behaupte nicht, eine Funktion sei implementiert,
nur weil sie in einem Plan beschrieben ist.

## 1. Produktauftrag und feste Grenzen

Personal Macro ist ein lokaler, persönlicher Trading-Workspace für genau einen
Benutzer. Die Anwendung verbindet:

- Tradingjournal, Trade-Erfassung und Trade-Reviews,
- Dashboard, Kalender, Analytics und Performance-Heatmaps,
- Setups, Playbook, Ziele, Fehler- und Emotionsanalyse,
- lokale Medien und Screenshot-Annotationen,
- Macro-Heatmap mit Base-/Quote-Vergleich,
- COT-/institutionelle Bewertung,
- Growth-, Inflation- und Arbeitsmarktdaten,
- Leitzinsen inklusive relativer USD-Wirkung,
- Seasonality,
- automatische Positionsgrößenberechnung,
- optionale read-only Kontoerstellung und Kontostandsaktualisierung über ein
  lokal angemeldetes MetaTrader-5-Terminal oder cTrader Open API OAuth,
- optionaler automatischer Journal-Abgleich über die persönliche Myfxbook-API,
- manueller, kontogebundener Import klassischer MetaTrader-HTML-Historien sowie
  cTrader-Account-Statements als HTML oder XLSX,
- direkter Forecast-/Actual-/Previous-Import aus EODHD Economic Events,
- lokale Importe, Exporte, Backups und Restore.

Nicht-Ziele, solange der Benutzer sie nicht ausdrücklich neu beauftragt:

- keine Broker-Orderausführung,
- kein Mehrbenutzerbetrieb und keine Rollenverwaltung,
- keine verpflichtende Cloud-Anmeldung,
- kein Social Feed, Marketplace oder öffentliches Profil,
- keine Zahlungs-, Abo- oder Lizenzlogik,
- keine automatische Handelsempfehlung durch externe Dienste,
- keine Übertragung persönlicher Journal-Daten an externe Datenanbieter.

Die Anwendung ist **local-first**. Journal- und Kontodaten bleiben standardmäßig
in einer lokalen SQLite-Datenbank. Netzwerkzugriffe sind auf ausdrücklich
konfigurierte Datenanbieter, releasegebundene EODHD-Aktualisierungen und vom
Benutzer autorisierte read-only-Kontoverbindungen (cTrader/Myfxbook) begrenzt.

## 2. Source of Truth und Repository-Aufbau

Das Repository liegt aktuell unter `D:\Macrotool`.

```text
D:\Macrotool
├─ AGENTS.md                       # dieses verbindliche Agenten-Handbuch
├─ README.md                       # Benutzer-Schnellstart
├─ START-MACROTOOL.cmd             # Start per Doppelklick
├─ .env.example                    # nur leere Konfigurationsbeispiele
├─ .env.local                      # lokale Secrets, niemals ausgeben/committen
├─ apps/
│  ├─ desktop/                     # PRODUKTIVE ANWENDUNG / SOURCE OF TRUTH
│  │  ├─ src/                      # React-/TypeScript-Frontend
│  │  ├─ src-tauri/                # Rust-, SQLite- und Tauri-Backend
│  │  ├─ public/                   # statische Frontend-Assets
│  │  ├─ package.json
│  │  └─ pnpm-lock.yaml
│  ├─ api/                         # älteres Referenzprojekt, nicht produktiv
│  └─ web/                         # ältere Browser-App, nicht produktiv
└─ docs/
   ├─ architecture/                # frühere Zielbilder und Schemaentwürfe
   ├─ audit/                       # Herkunfts- und Berechnungsaudits
   └─ planning/                    # Spezifikationen, Entscheidungen, Roadmaps
```

### Verbindliche Regel

Implementiere neue Produktfunktionen grundsätzlich in `apps/desktop`. Ändere
`apps/api` oder `apps/web` nur, wenn der Benutzer diese Projekte ausdrücklich
nennt. Die dortigen `.venv`-/`node_modules`-Ordner sind keine Architekturvorgabe
für die Desktop-App.

Build-Artefakte wie `node_modules`, `dist` und `src-tauri/target` sind keine
Quelltexte. Bearbeite sie nicht manuell und committe sie nicht.

## 3. Technischer Stack

### Frontend

- React 19 und TypeScript im Strict Mode
- Vite 7
- React Router mit lazy geladenen Seiten
- TanStack Query für Server-/Command-State
- Zustand für persistierten UI- und globalen Filter-State
- Radix UI für zugängliche Primitive
- React Hook Form und Zod für komplexe Formulare
- ECharts für quantitative Visualisierungen
- TipTap für Rich-Text-Felder
- Konva für Screenshot-Annotationen
- Sonner für Toasts
- Lucide für Icons
- Tailwind-Utilities plus ein umfangreiches CSS-Token-/Komponentensystem
- Vitest und Testing Library

### Desktop-Backend

- Tauri 2
- Rust Edition 2024
- SQLite über SQLx
- Tokio für asynchrone Jobs
- Reqwest mit Rustls für Markt-, COT- und Seasonality-Daten
- `rust_decimal` für präzise Dezimalwerte, insbesondere Zinsen
- CSV, Calamine/XLSX, ZIP und SHA-256 für Import, Export und Backup
- Proptest, Rust Unit- und Repository-Tests

### Speicher

- Desktop-App: SQLite und lokale Dateien in Windows AppData
- Browser-Vorschau: `localStorage` und Demo-/Fallback-Adapter
- Privater Webmodus: Neon PostgreSQL für Journal und Metadaten, privater Vercel
  Blob für Originalbilder und geprüfte Markt-Snapshots; persönliche UI-Entwürfe
  bleiben ausschließlich im Arbeitsspeicher der bestätigten Sitzung
- UI-Präferenzen: Zustand-Persistenz beziehungsweise Tauri Store

## 4. Laufzeitarchitektur

Der normale Datenfluss lautet:

```text
React-Seite
  → TanStack Query / Mutation
  → src/services/commands.ts
  → Tauri invoke(command, camelCase args)
  → src-tauri/src/commands/*.rs
  → Repository / Metrics Engine / SQLx
  → SQLite oder lokales Dateisystem
  → serialisierte camelCase-Antwort
  → Query-Cache / UI
```

In der Browser-Vorschau erkennt `isTauri()` die fehlende native Laufzeit. Der
Service verwendet dann Implementierungen aus `browser-adapter.ts`,
`rates-browser.ts` und `workspace-browser.ts`. Dieser Modus
ist für schnelle UI-Entwicklung, nicht für die vollständige Produktabnahme.

Für den beauftragten privaten Handyzugriff gibt es einen separaten
`pnpm build:private-web`-Build und `vercel.json` in `apps/desktop`.
Der Webmodus prüft vor dem App-Einstieg Sitzung und vollständige Journal-/Medien-
Capabilities; ohne bestätigte Cloud-Anbindung bleibt er geschlossen.
Vercel-Zugriffsschutz ist extern und muss vor Veröffentlichung für alle
Deployments sowie ausschließlich die Besitzeridentität nachgewiesen werden.
Die mobile Shell unter 1024 px ändert die Desktop-Dichte nicht. Aktueller
Umfang und verbleibende Abnahme: `docs/planning/private-mobile-web.md`.
Der Nutzer hat inzwischen schreibenden Betrieb bei ausgeschaltetem PC bestätigt.
Der vorbereitete separate Rust-Server wird mit `--no-default-features --features
server --bin personal-macro-server` gebaut; Desktop bleibt das Standardfeature.
`runtime.rs` trennt Tauri-Handles und Tokio, ohne die Geschäftslogik zu ersetzen.
`initialize_at()` erfordert einen absoluten dauerhaften Datenpfad und SQLite FULL.
Die HTTP-Freigabeliste in `web_server/dispatch.rs` ist ausdrücklich begrenzt;
niemals alle nativen Commands, freie Dateipfade oder Geheimnisse durchreichen.
`api/` und `server/gateway/` unter `apps/desktop` gehören zur neuen privaten
Browser-Anbindung, nicht zum älteren Referenzprojekt `apps/api`.
Bei Vercel Services wird das Verzeichnis `api/` nicht automatisch gebaut.
Der produktive Einstieg ist deshalb `server/gateway/service.mjs` als eigener
Dienst `gateway` mit `runtime: "node"`; `/api/:path*` wird unverändert dorthin
geroutet. Die interne Backend-Bindung gehört zum Gateway, nicht zur statischen
Weboberfläche. Vor Freigabe müssen Gateway-Funktion und Rust-Container im echten
Build nachgewiesen und Sitzung sowie Datenzugriff am veröffentlichten Host geprüft
werden; ein erfolgreicher Frontend-Build reicht nicht aus.
Gateway und Browsertransport verwenden ausschließlich freigegebene Cloud-Commands.
Nicht verfügbare Routen dürfen keine Browser-Demodaten laden. Keine automatische
Synchronisierung mit der bestehenden lokalen Desktop-Datenbank behaupten.

Der bereitgestellte Cloudbetrieb nutzt Vercel mit PostgreSQL über die native
Neon-Marketplace-Integration und privatem Objektspeicher. Die vorhandene
SQLite-Serverbasis ist eine getrennte Alternative mit dauerhaftem Datenträger.
Das separate PostgreSQL-Backend sichert Datenmutation, Revision und Vorgangsbeleg
in derselben Datenbanktransaktion ab; Dateisperren oder Prozess-Mutex reichen nicht.
Nach bestätigten Anbieterbedingungen wurden Neon Free in Frankfurt und ein privater
Vercel-Blob-Speicher eingerichtet, zunächst für Preview. `cloud_postgres` und
`cloud_server` bilden den getrennten Build `--no-default-features --features postgres
--bin personal-macro-cloud`. Die Journal-/Medienbasis umfasst 45 Commands plus
privaten Bild-Upload; zusätzliche Analyse-Capabilities bleiben getrennt optional.
Mutation, Revision und Beleg sind atomar. Medienobjekte sind nur über den separat
signierten internen Pfad erreichbar. Originaldateien bleiben unverändert.
Eine konsistente SQLite-Sicherung außerhalb des Repository wurde geprüft und
338 persönliche Datensätze aus 51 freigegebenen Tabellen in ein neues
PostgreSQL-Schema übernommen. Hashes und Kennzahlen beider Konten
stimmen. Beim Journalimport wurden Provider-Caches und Broker-Zugangsdaten
ausgeschlossen. Ausgewählte öffentliche Marktdaten wurden anschließend separat
als geprüfte Pakete übertragen. Vier Originalbilder wurden privat übertragen und durch erneuten Abruf
bytegenau geprüft. Die Workspace-Identität wurde danach atomar aktiviert.
Der echte signierte Gateway-/Server-Lesetest gegen Neon und Blob besteht.
Journal-Weboberfläche, Node-Gateway und Rust-Container sind über den geschützten
Projektlink bereitgestellt. Nach Korrektur des fehlenden API-Dienstes bestehen
der Live-Lesetest mit 46 Pflicht-Capabilities, beiden Konten und vier Bildern
sowie der mobile Browsertest bei 390 px mit Übersicht und Trade-Navigation.
Der temporäre Testzugang wurde widerrufen und seine Sperre nachgewiesen;
anonyme Seiten- und API-Zugriffe bleiben blockiert. Die erneute Besitzerbedienung
am tatsächlichen iPhone ist noch offen; der Browsertest verwendet Chromium.

`cloud_public` ergänzt getrennte, unveränderliche Markt-Snapshots. Ein expliziter
Exporter erzeugt neue SQLite-Dateien mit freigegebenen Tabellen und Spalten;
niemals die persönliche Datenbank kopieren und daraus Tabellen löschen.
Migration `postgres-migrations/0004_public_cache.sql` veröffentlicht Generationen
mit atomarem Vergleich des vorherigen Zeigers, getrennt von der Journalrevision.
216 Pakete für neun Leitzinsreihen, Katalog und alle 214 EODHD-Symbole wurden privat
hochgeladen, bytegenau geprüft und aktiviert: 1.690.660 öffentliche Zeilen,
142.450.688 unkomprimierte und 34.170.392 komprimierte Byte.
Der Rust-Lader prüft Roh-/Transporthash, Größe, Schema und Symbolzuordnung,
hält höchstens zwei temporäre Pakete und öffnet sie unveränderlich/query-only.
Analysen laufen außerhalb von PostgreSQL-Transaktionen und auf begrenzten
Blocking-Tasks. Details und Analyse verlangen die angezeigte Generation.
Die bisherige Grundlage mit vier Markt-Lesebefehlen und `/rates` sowie
`/seasonality` ist bereitgestellt und optional; fehlende Pakete dürfen die
46 Pflicht-Capabilities des Journals nicht erweitern oder den Journalzugang
sperren. Die Cloudseiten zeigen den Übernahmestand ohne Provider-Refresh oder
Polling.
Vier echte Analysen aus unterschiedlichen Assetklassen bestanden einschließlich
Cloudabruf in maximal 8.047 ms im lokalen Debug-Build; dies ist kein Vercel-Benchmark.
Die Erweiterung vom 25.09.2026 implementiert die optionalen Analysefamilien
Macro-Heatmap, COT, Wirtschaftsdaten/-kalender, Technicals, Regime Insights,
Weltatlas, Staatsanleihen und Zentralbankberichte. `cloud_public/macro_readers.rs`,
`atlas_readers.rs` und `report_readers.rs` verwenden die nativen Fachreader auf
geprüften unveränderlichen Paketen. Der neue Codestand enthält ausdrücklich
gestartete Seasonality-Screener und Fenstersuchen über generationstreue Batches.
Die vollständigen erforderlichen Capabilities jeder Route werden geprüft;
fehlende optionale Pakete dürfen weder das Journal sperren noch Demodaten laden.

Persönliche Atlasnotizen, gespeicherte Ansichten und die letzte Ansicht gehören
zu `cloud_postgres/atlas.rs`, persönliche Berichtslesemarker zum separaten
PostgreSQL-Pfad. Diese Mutationen verwenden dieselbe atomare Revision- und
Vorgangsbeleg-Transaktion wie das Journal. Notizen und Lesemarker werden nicht
in öffentliche Marktpakete exportiert. Berichtstexte und vorhandene
Zusammenfassungen werden gelesen; neue Cloud-Erfassung, Textextraktion und
KI-Zusammenfassung waren in diesem Rollout noch nicht implementiert. Die
Erweiterung vom 30.09.2026 ergänzt sie über die vorhandene Provider-Jobfamilie:
zwölf bankgebundene Quellen, tägliche Planung, getrennte Erfassungs- und
Zusammenfassungsaufträge, geprüfter Berichtspaket-Export und atomare Veröffentlichung
über den Generationsvergleich. Persönliche Lesemarker und Journalrevision werden
dabei nicht verändert. Details und datierte Abnahmen stehen in
`docs/planning/cloud-central-bank-briefings.md`.

Briefing-Version 3 verlangt wortgetreue Quellenzitate und prüft Quellenmarken,
Zahlen, Zentralbankzuordnung und ausgewählte Bedeutungsgrenzen. Lange Texte bleiben
begrenzt und werden als Auszüge kenntlich gemacht; dies ist keine vollständige
semantische Faktenprüfung. SQLite-Migration 0051 und PostgreSQL-Migration 0011
führen einen separaten dauerhaften KI-Kostenbeleg mit jeweils 0,50 USD je UTC-Monat
und Datenspeicher ein. Höchstbeträge werden vor dem API-Aufruf atomar reserviert;
ungeklärte Aufträge bleiben gesperrt, erfolgreiche identische Ergebnisse werden
wiederverwendet. Keine Budgettabellen, Zugangsdaten oder persönlichen Metadaten in
öffentliche Markt-Snapshots aufnehmen. Die Cloud-Aktivierung benötigt
`MACRO_REPORT_AUTOMATION=1` und einen ausschließlich serverseitigen OpenAI-Schlüssel.

Alle 555 Pakete der neuen Gesamtgeneration wurden mit dem produktiven Loader
und nativen Readern geprüft sowie privat hochgeladen und bytegenau erneut
gelesen: 1.000.374.272 Rohbytes und 141.744.234 Gzip-Bytes. Die Gesamtbelegung
einschließlich vorheriger Generation und vier Originalbildern beträgt
176.407.066 Byte. Migrationen 0005 und 0006 wurden identitätsgeprüft angewendet.
Deployment `dpl_AqHBFCN5aPmYKpv5EePWhjQHeuWh` ist `READY`, `public: false`,
Region `fra1`, mit Web-, Gateway- und Rust-Service. Der stabile Projektalias
zeigt auf `personal-macro-i1ktdtp9e-nudel96s-projects.vercel.app`. Die
CAS-Veröffentlichung der Generation `9aa3d4e2-1c44-4852-bc16-cf400fd72d3e` ist
erfolgreich bestätigt: `published: true`, 555 Artefakte und 141.744.234
Transportbytes. Die Generation ist am stabilen Alias aktiviert.

Der Live-Lesetest vom 25.09.2026, 13:36–13:44 UTC, bestand alle 22
Analyseprüfungen, darunter eine Atlas-Antwort mit 2.112.285 Byte, ein
Screener-Batch mit fünf Instrumenten und die Fenstersuche in zwei Schritten
mit fünf und zwei Instrumenten. Die gemessenen Scan-Schritte benötigten etwa
16–18 Sekunden. Persönliche Schreibbefehle wurden nicht ausgeführt
(`personalWritesPerformed: false`); ihre Nachweise stammen aus isolierten
PostgreSQL-Tests. Die damalige Gesamtprüfung meldete trotzdem `ok: false`, weil
`AppShell` die Marktkontext-Navigation im privaten Webmodus ausblendete.
Nachweis: `apps/desktop/.vercel/live-owner-service-report.json` außerhalb der
versionierten Quellen. Der temporäre Zugang ist entfernt (`cleanup: true`);
anonyme und widerrufene Testanfragen lieferten HTTP 401.

Der Navigationsfix filtert die Einträge jetzt anhand der verfügbaren
Capabilities; 16 Tests bestehen. Zwei mobile Macro-CSS-Korrekturen wurden mit
Fixtures bei 320, 390, 768 und 1440 px geprüft. Ein vorgeschalteter Test der
lokal kompilierten Oberfläche mit dem echten Backend bestand separat
(`apps/desktop/.vercel/live-owner-local-ui-report.json`); dieser war noch kein
Nachweis der bereitgestellten Oberfläche.

Der abschließende Test der tatsächlich bereitgestellten Aq-Oberfläche ist am
25.09.2026 um `14:15:31.548Z` erfolgreich abgeschlossen:
`apps/desktop/.vercel/live-owner-mobile-report.json` meldet `ok: true`,
`validationSucceeded: true`, `cleanupVerified: true`, `deployedUI: true` und
`compiledLocalUI: false`. Sechs Analyseseiten sowie Übersicht und Trades
bestanden bei 390 px ohne Seitenüberlauf; zehn Navigationslinks sind sichtbar.
Keine Laufzeit-/API-Fehler oder blockierten Schreibversuche, unveränderte
Journalrevision. Der frühere Navigationsfehler ist damit behoben und live
nachgeprüft. Besitzer-/SSO-Schutz für alle Deployments blieb unverändert;
genau der temporäre Testschlüssel wurde widerrufen, anonyme und widerrufene
Testanfragen lieferten HTTP 401. Diese Freigabe umfasst Analyselesepfade und
die geprüfte mobile Navigation/UI, keine persönlichen Live-Schreibvorgänge
oder vollständige Desktop-Parität. Die physische iPhone-/Safari-Bedienung
durch den Besitzer bleibt eine gesonderte offene Geräteprüfung.

Die nachfolgende Korrektur des iPhone-Einstiegs beseitigt wiederholtes Parsen
großer eingebetteter Atlaskataloge innerhalb der Cloud-Manifestprüfung.
`cloud_public/atlas_readers.rs` hält je Katalogfamilie eine unveränderliche
Menge geprüfter Identitäten. Diese Mengen stammen ausschließlich aus den
nativen, eingebetteten Katalogen einschließlich der Markt-Proxy-Prüfung;
unbekannte Anfragen werden nicht gespeichert. Keine Manifest-, Generations-,
Journal-, Hash- oder SQLite-Prüfung wird dadurch ersetzt. Die nativen
Desktop-Katalogfunktionen bleiben unverändert. 29 Cloud-Public-Tests bestehen,
zwei bestehende PostgreSQL-Integrationstests wurden dabei nicht ausgeführt.
Der private Browser gleicht seine 30-Sekunden-Sitzungsfrist zusätzlich bei
Rückkehr aus dem Hintergrund ab und bietet nach acht Sekunden einen manuellen
Neustart. Abgebrochene Antworten können keine Sitzung aktivieren. Details,
Vorher-/Nachhermessungen und Grenzen der Geräteabnahme:
`docs/audit/private-web-iphone-startup.md`.

Diese Korrektur ist als `dpl_FJHF6sZthr7w9GiyA4USpDvSnGnp` mit allen drei
Services `READY`, `public: false`, in `fra1` bereitgestellt. Der stabile Alias
zeigt aktuell auf `personal-macro-qi1zlug2a-nudel96s-projects.vercel.app`.
Der WebKit-Live-Lauf vom 25.09.2026, abgeschlossen um `15:51:25.087Z`,
bestand alle 22 Analyseprüfungen, Übersicht, Trades und sechs Analyseseiten
bei 390 px mit zehn sichtbaren Navigationslinks, ohne Laufzeit-/API-Fehler.
Der erste Sitzungsabruf dauerte 4.406 ms, der nachfolgende Browseraufruf 175 ms.
Journalrevision unverändert, keine persönlichen Live-Schreibvorgänge;
Testschlüssel widerrufen, anonyme und widerrufene JSON-Anfragen HTTP 401.
Nachweis: `apps/desktop/.vercel/iphone-final-live-report.json`; zusätzliche
anonyme Seiten-/API-Prüfung auf beiden Hosts: `iphone-final-anonymous-report.json`.
Das ersetzt weiterhin keine physische iPhone-/Besitzer-SSO-Abnahme.

Der gemeinsame Vertrag erlaubt 1.024 Artefakte und 2 GiB Rohdaten je
Generation, höchstens 500 MiB Gzip insgesamt und je Paket 32 MiB Transport
beziehungsweise 128 MiB SQLite. Zwei temporäre Lese-Leases begrenzen aktive
Paketdateien einschließlich Transport auf 320 MiB. `load_active` bindet
`MAX_MANIFEST_ARTIFACTS + 1`, damit zusätzliche Transportzeilen erkannt werden.
JSON-Anfragen bleiben auf 2 MiB begrenzt, vollständige Antworten auf 4 MiB.
Die Antwortgrenze wurde nach dem gemessenen Valuation-Paket mit 2.112.267 Byte
separat erhöht; derselbe unveränderte Inhalt wurde erfolgreich erneut geprüft.

Saisonale Batches verarbeiten höchstens fünf Instrumente; der erste
Divergenzschritt lädt zusätzlich sieben USD-Spotreihen. Ein globaler Semaphore
begrenzt umfangreiche Scans pro Instanz auf zwei und hält seinen Permit bis
zum tatsächlichen Ende der Blocking-Arbeit. Gesamtfrist je Batch: 75 Sekunden;
numerische Teilfrist: 50 Sekunden. Der Browser prüft Generation und monotone
Cursor, führt die globale Rangfolge erst nach Abschluss zusammen und startet
nach Abbruch keine weiteren Schritte. Laufende synchrone Berechnungen sind
dadurch nicht sofort beendet. Echte FX-Futures bleiben ohne Datenanbindung.

Die Macro-Frische wird vor der aktuellen Aggregation geprüft, ohne gespeicherte
Quellwerte oder Snapshotdatum zu ändern. Ein bestehender Widerspruch zwischen
§10.4 und dem tatsächlich implementierten nativen Paarvertrag für fehlende
Seiten wurde nicht als Teil des Cloudrollouts geändert. Siehe
`docs/audit/cloud-macro-freshness-review.md`; keine stillschweigende fachliche
Umstellung oder identische Zielmethodik behaupten.

Die Erweiterung vom 26.09.2026 ergänzt dauerhafte Cloudjobs für EODHD-Wochenplanung
und Aktualisierung eine Stunde nach Releases, den CFTC-Kalender mit einstündigem
Abstand sowie den ausdrücklich genehmigten Myfxbook-Abgleich alle sechs Stunden.
Myfxbook erfordert eine eigene Anmeldung und bestätigte Vorschau im privaten
Webmodus. Credentials werden mit ChaCha20-Poly1305 und getrenntem Serverschlüssel
verschlüsselt. Netzwerkabruf und Datenbanktransaktion sind getrennt; Journaländerung,
Revision, Beleg und Vorherabbild werden atomar bestätigt. Pausieren/Trennen sperrt
laufende Jobs; Trennen entfernt die gespeicherten Credentials. Migrationen 0007–0010
sind nach privater Sicherung und Identitätsprüfung angewendet, ohne persönliche
Datensätze oder Journalrevision zu verändern. Deployment
`dpl_Hpi448CaLwbTeNXp4rkgamBFUdQR` ist mit fünf Diensten `READY`, `public: false`,
in `fra1`; der stabile Alias zeigt auf
`personal-macro-bzmoadfjx-nudel96s-projects.vercel.app`. Alle neun Wochenplanungen
und der COT-Auftrag sind abgeschlossen. Der WebKit-Live-Lauf vom 26.09.2026,
abgeschlossen um `16:29:08.921Z`, besteht alle 22 Analyseprüfungen, Übersicht,
Trades, sechs Analyseseiten und die Myfxbook-Einrichtung bei 390 px ohne
Seitenüberlauf oder Laufzeit-/API-Fehler. Journalrevision 3 unverändert,
keine persönlichen Schreibversuche, Testzugang widerrufen und HTTP 401 für
anonyme sowie widerrufene Testanfragen. Die persönliche Myfxbook-Aktivierung
durch den Besitzer und die physische iPhone-Abnahme bleiben offen. Nachweise stehen in
`docs/planning/cloud-provider-automation.md`.

Cron und Queues bilden zwei getrennte Jobfamilien (`server/cot`, `server/providers`).
Die täglichen Cron-Auslöser verteilen fällige Jobs; die Wirtschaftswochenplanung
bleibt dedupliziert. Fachliche Wartezeiten werden als neue verzögerte Nachrichten
innerhalb der bisherigen Aufbewahrungsfrist eingeplant; erst nach bestätigter
Annahme wird die aktuelle Zustellung quittiert. PostgreSQL begrenzt weiterhin
die Datenabrufe und prüft Fälligkeit/Lease. Auch eine Queue-Annahme mit HTTP 202
und `messageId: null` gilt als Erfolg. Nur geprüfte öffentliche Pakete werden aktualisiert, alle
anderen Paketobjekte generationstreu wiederverwendet. Providerobjekte werden
referenzsicher mindestens 24 Stunden und für acht Generationen aufbewahrt;
ursprüngliche Pakete und persönliche Medien sind von dieser Bereinigung ausgenommen.
Der bestehende Hobby-/Free-Betrieb wurde nicht kostenpflichtig umgestellt.

Weitere Provider-Aktualisierungen, MT5-/cTrader-Anbindungen, native Dateiimporte/-exporte
und Backup/Restore sind weiterhin nicht in die Cloud portiert. Keine automatische
Desktop-/Cloud-Synchronisierung oder volle Desktop-Parität behaupten. Der
Windows-Debug-Build und der reale Prozess-/Fensterstart sind geprüft; mangels
CDP-Zugriff ist dies keine vollständige native UI-Abnahme. Die Ende-zu-Ende-
Abnahme mit der Besitzeranmeldung am iPhone bleibt offen. Aktueller Umfang und
Nachweise: `docs/planning/private-market-cloud.md` und
`docs/planning/private-mobile-web.md`.
Der vereinbarte Kostenrahmen beträgt höchstens 10 EUR pro Monat;
Vercels Ausgabenlimit erfasst Marketplace-Kosten nicht. Vor einer kostenpflichtigen
Umstellung müssen deren Grenzen nachgewiesen werden. Desktop-SQLite und bestehende
Migrationen bleiben unabhängig davon erhalten.

Native Funktionen, die in der Browser-Vorschau nicht vollständig funktionieren:

- echte SQLite-Persistenz,
- sichere native Dateiimporte,
- Medien im AppData-Verzeichnis,
- automatische Backups und Restore,
- COT- und Seasonality-Aktualisierung.

## 5. Frontend-Struktur

```text
apps/desktop/src
├─ App.tsx                         # Routing und Lazy Loading
├─ app/providers.tsx               # QueryClient, Tooltip, Toasts
├─ components/
│  ├─ layout/                      # Shell, Sidebar, Command Palette
│  └─ ui/                          # kleine wiederverwendbare UI-Primitives
├─ charts/base-chart.tsx           # ECharts-Basis
├─ features/                       # vertikale Produkt-Slices
│  ├─ dashboard/
│  ├─ trades/
│  ├─ calendar/
│  ├─ analytics/
│  ├─ reviews/
│  ├─ playbook/
│  ├─ mistakes/
│  ├─ media/
│  ├─ goals/
│  ├─ macro/
│  ├─ seasonality/
│  ├─ rates/
│  ├─ import-export/
│  └─ settings/
├─ services/commands.ts            # einzige öffentliche Command-Fassade
├─ services/*-browser.ts           # Browser-Fallbacks
├─ stores/ui-store.ts              # globale Filter und Dialog-/Sidebar-State
├─ types/domain.ts                 # Frontend-Datenverträge
├─ lib/utils.ts                    # Formatierung und kleine Hilfen
└─ styles/globals.css              # Design-Tokens und App-Styling
```

### Aktuelle Routen

- `/` – Übersicht/Dashboard
- `/trades` – Trades, Filter, Saved Views, Papierkorb
- `/calendar` – Tradingkalender und tägliche Performance
- `/analytics` – gruppierte Journal-Auswertungen
- `/reviews` – periodische Reviews
- `/playbook` – Setups und versionierte Regeln
- `/mistakes` – Fehleranalyse
- `/media` – Medien und Annotationen
- `/goals` – Ziele und Fortschritt
- `/learning` – umfangreiche Lernbibliothek mit Wirkungsketten, Lernwegen,
  Glossar, Fokusmodus, Merkliste und eigenen Lernnotizen
- `/macro` – Macro- und Pair-Heatmap
- `/weather` – Wetter & Rohstoffe: Produktionsschwerpunkte, öffentliche
  Punktprognosen, typischer Anbaukalender und erklärbare Wetterhinweise
- `/world-atlas` – weltweites Länder-/Themenverzeichnis, öffentliche WDI-
  Jahresreihen, langfristige Marktwellen und UN-Altersprofile mit getrennten
  Szenarien; weitere Sektor-, Bewertungs- und Jahrhundertansichten sind im Ausbau
- `/regime-insights` – langfristige, empirisch validierte Regime-Treiber;
  aktuell China CPI YoY im Vergleich mit AUDUSD-D1-/W1-OHLC
- `/seasonality` – saisonale Daten
- `/rates` – Leitzinsen
- `/government-bonds` – weltweites Länder-/Laufzeitverzeichnis für Staatsanleihe-
  Renditen, Historien, Zinskurven und datierte Länderabstände
- `/import-export` – Exporte, Backup, Restore, Legacy-Import
- `/settings` – Konten, Taxonomien, Felder und Systemeinstellungen

### Frontend-Konventionen

1. Feature-Seiten greifen über `api` aus `services/commands.ts` zu. Verteile
   keine direkten `invoke()`-Aufrufe in Komponenten.
2. Neue native Commands benötigen normalerweise vier Änderungen:
   Rust-Command, Registrierung in `src-tauri/src/lib.rs`, TypeScript-Vertrag in
   `types/domain.ts` und Methode in `services/commands.ts`.
3. Entscheide ausdrücklich, ob ein Browser-Fallback sinnvoll ist. Liefere keine
   scheinbar erfolgreiche Mock-Antwort für sicherheits- oder netzwerkkritische
   Funktionen.
4. Mutationen müssen betroffene Query Keys invalidieren. Häufige Keys sind
   `bootstrap`, `trades`, `dashboard`, `macro`, `rates`, `seasonality`, `media`,
   `backups` und die jeweiligen Detail-Keys.
5. Formulare zeigen verständliche deutsche Fehlermeldungen. Backendfehler werden
   als `CommandError` normalisiert.
6. Nutzertexte sind grundsätzlich Deutsch. Code, Dateinamen und technische
   Identifikatoren bleiben Englisch.
7. Vermeide neue globale Zustände, wenn Query-State oder lokaler Component-State
   genügt.
8. Geldwerte aus dem Backend sind überwiegend Integer in kleinster
   Währungseinheit und werden erst in der Anzeige durch 100 geteilt.
9. ISO-Zeitstempel aus dem Backend werden in der UI lokal formatiert.
10. Erhalte Tastaturbedienung, Fokusmarkierungen und Radix-Dialogverhalten.

## 6. Designsystem und visuelle Regeln

Das Produkt verwendet ein dichtes, hochwertiges Dark-Dashboard. Die zentralen
Tokens stehen am Anfang von `src/styles/globals.css`.

- Hintergrund: sehr dunkles Navy statt reines Schwarz
- Flächen: gestaffelte Navy-Surfaces mit feinen blauen Borders
- Primärfarbe: Blau/Violett
- positiv/bullish: Grün
- negativ/bearish: Rot
- Warnung/neutraler Hinweis: Amber
- abgerundete Cards, zurückhaltende Schatten, kompakte Tabellen
- Zahlen müssen auch bei hoher Informationsdichte schnell vergleichbar bleiben

Wichtige visuelle Regeln:

1. Verwende bestehende Tokens (`--surface`, `--text-2`, `--positive`, usw.) und
   bestehende UI-Komponenten vor neuen Einzelstilen.
2. Rot und Grün transportieren Bedeutung. Nutze sie nicht dekorativ oder mit
   vertauschter Semantik.
3. Fehlende Werte werden als nicht verfügbar dargestellt, nie automatisch als
   neutral oder Null.
4. Heatmap-Zellen müssen Score, Richtung und Verfügbarkeit nachvollziehbar
   darstellen.
5. Neue Charts brauchen lesbare Achsen, Tooltips, Einheiten und Empty States.
6. Die App hat aktuell eine Mindestbreite von 1024 px. Änderungen dürfen die
   vorhandene Desktop-Dichte nicht unbeabsichtigt auflösen.
7. Neue umfangreiche Abhängigkeiten nur ergänzen, wenn der vorhandene Stack die
   Anforderung nicht bereits erfüllt.

## 7. Rust-/Tauri-Backend

```text
apps/desktop/src-tauri/src
├─ lib.rs                           # Plugins, Setup, Scheduler, Command-Registry
├─ main.rs                          # dünner Windows-/Tauri-Einstieg
├─ errors.rs                        # AppError und serialisierbarer CommandError
├─ database/mod.rs                  # AppData-Pfade, Pool, Migrationen, Seeds
├─ domain/models.rs                 # Trade-/Bootstrap-Domainmodelle
├─ commands/
│  ├─ system.rs                     # Bootstrap, Konten, Cashflows, Settings
│  ├─ trades.rs                     # dünne Trade-Command-Schicht
│  ├─ journal.rs                    # Kontext, Legs, Tags, Checklisten, Felder
│  ├─ analytics.rs                  # Dashboard und Kalender
│  ├─ workspace.rs                  # Reviews, Ziele, Playbook, Fehler
│  ├─ eodhd.rs                      # EODHD Economic Events Client
│  ├─ eodhd_fundamentals.rs         # Fundamentals-Snapshots und Heatmap
│  ├─ eodhd_prices.rs               # EODHD EOD-/Commodity-Historien für Seasonality
│  ├─ cot.rs                        # eigenständige COT-Daten und Bewertung
│  ├─ policy_rates.rs               # Zins-Snapshots und USD-Relativwirkung
│  ├─ seasonality.rs                # EODHD-Seasonality, Analyse und Abruf
│  ├─ metatrader_html.rs             # Vorschau und atomarer HTML-Historienimport
│  ├─ ctrader_statement.rs           # sicherer cTrader-HTML-/XLSX-Import
│  ├─ journal_reset.rs               # verifizierter Backup-/Journal-Reset
│  ├─ media.rs                      # lokale Medien und Annotationen
│  ├─ data_transfer.rs              # Export, Backup und Restore
│  └─ legacy.rs                     # kontrollierter Alt-Datenbankimport
├─ metrics/
│  ├─ mod.rs                        # Journal-Kennzahlen
│  └─ policy_rates.rs               # präzise Zinsberechnung
└─ repositories/trades.rs           # Trade-Validierung, CRUD, Filter, Soft Delete
```

### Backend-Konventionen

- Commands validieren Eingaben und orchestrieren. Wiederverwendbare Berechnung
  gehört in `metrics`, komplexer Datenzugriff in `repositories`.
- SQL-Operationen über mehrere Tabellen laufen in Transaktionen.
- `AppError` bleibt intern; Tauri-Antworten verwenden `CommandError` mit stabilem
  Code und benutzerfreundlicher Nachricht.
- Serde-Verträge verwenden `#[serde(rename_all = "camelCase")]`, passend zum
  TypeScript-Frontend.
- Keine Secrets in Logs, Fehlermeldungen oder serialisierten Antworten.
- Begrenze externe Antworttexte und Providerfehler, bevor sie gespeichert oder
  angezeigt werden.
- Verwende UTC/RFC3339 für persistierte Zeitpunkte.
- Nutze `rust_decimal` oder Textrepräsentationen, wenn binäres Float-Runden die
  fachliche Aussage verändern kann.

## 8. SQLite-Datenmodell und Migrationen

Die tatsächliche Datenbank wird ausschließlich durch die SQL-Dateien unter
`apps/desktop/src-tauri/migrations` definiert. Aktuell existieren Migrationen
`0001` bis `0052`.

Wichtige Tabellengruppen:

- System: `app_settings`, `schema_migrations`
- Konten: `accounts`, `account_cashflows`
- Taxonomie: `strategies`, `setups`, `setup_versions`, `tags`
- Trades: `trades`, `trade_legs`, `trade_tags`, Checklisten, Emotionen,
  Fehlerzuordnungen und Kontextlinks
- Medien: `media_files`, `trade_media`, `media_annotations`
- Arbeitsprozess: `reviews`, `goals`, `goal_progress`, Saved Views und Custom
  Fields
- Datenverkehr: `import_runs`, `import_rows`, `export_runs`, `deleted_items`
- Macro: `macro_snapshots`, `macro_indicators`, `cot_snapshots`,
  `seasonality_snapshots`, `policy_rate_snapshots`, Currency- und Pair-Scores
- Provider: `economic_provider_events`, `provider_sync_runs`
- Legacy-MT5: alte Snapshot-, Deal-, Positions- und Sync-Tabellen bleiben nur
  als Upgrade-Historie bestehen und werden nicht mehr zur Laufzeit befüllt
- MT5-Charttrends: `mt5_technical_refresh`, `mt5_technical_pairs` und
  `mt5_technical_candles` speichern ausschließlich lokale H4-/D1-Marktdaten
- EODHD: Events, Mappingkandidaten, Release-Jobs und Fundamentals-Snapshots

### Migrationsregeln

1. Bereits ausgelieferte Migrationen niemals nachträglich umschreiben. Lege die
   nächste nummerierte Migration an.
2. Migrationen müssen auf einer bestehenden Benutzer-Datenbank funktionieren,
   nicht nur auf einer leeren Testdatenbank.
3. Bei neuen Spalten sinnvolle Defaults oder einen kontrollierten Backfill
   vorsehen.
4. Foreign Keys und Such-/Sortierpfade mit passenden Indizes absichern.
5. Nach Schemaänderungen Rust-Modelle, SQL-Abfragen, TypeScript-Typen,
   Browser-Fallback und Tests prüfen.
6. Persönliche Datenbanken niemals ins Repository kopieren oder für Tests
   verändern. Tests verwenden temporäre Datenbanken.
7. Direkte Reparaturen an der Benutzer-Datenbank sind nur mit expliziter
   Zustimmung und vorherigem Backup zulässig.

## 9. Lokale Daten, AppData und Backups

Die produktive App verwendet durch den Tauri-Identifier
`com.personal-macro.app` derzeit:

```text
%APPDATA%\com.personal-macro.app\PersonalMacro
├─ database\journal.sqlite
├─ media\
├─ exports\
├─ backups\
├─ logs\
└─ settings\
```

Die Daten liegen absichtlich nicht unter `D:\Macrotool`. Ein Wechsel des
Quellordners darf daher die Journaldaten nicht verschieben oder löschen.

Beim Start:

1. werden Verzeichnisse angelegt,
2. ein SQLite-Pool mit Foreign Keys, WAL und Busy Timeout geöffnet,
3. Migrationen und Seeds ausgeführt,
4. ein automatisches Backup geprüft,
5. höchstens einmal in 24 Stunden ein ZIP-Backup erstellt,
6. die konfigurierte Aufbewahrungszahl angewendet.

Restore wird zuerst validiert und gestaged. Vor einem tatsächlichen Austausch
entsteht eine Sicherheitskopie. Schwäche diese Reihenfolge nicht ab.

## 10. Verbindliche Macro- und Heatmap-Logik

Dieser Abschnitt ist fachlich kritisch. Ändere die Methodik nicht stillschweigend
und ersetze sie nicht durch eine allgemeinere Currency-Strength-Formel.

### 10.1 Einzelindikator

Für ökonomische Daten mit Actual, Forecast und Previous gilt:

```text
surprise = actual - forecast
signal = sign(surprise × direction)
```

- `direction = +1`: höher als Forecast ist positiv für die Währung.
- `direction = -1`: niedriger als Forecast ist positiv, zum Beispiel
  Arbeitslosenquote oder Jobless Claims.
- `signal ∈ {-1, 0, +1}`.
- `previous` ist Kontext und wird nicht anstelle des Forecasts gescored.
- Actual und Forecast müssen beide vorhanden sein.
- Fehlend bedeutet `unavailable`, nicht neutral.
- Exakte Gleichheit bedeutet neutral.

Der Provider-Mapper klassifiziert aktuell unter anderem:

- Growth: GDP, Manufacturing/Services PMI, Retail Sales, Consumer/Business
  Confidence, Industrial Production, Household Spending
- Inflation: CPI, Core CPI, PPI, PCE und länderspezifische Varianten
- Labor: NFP, Employment Change, ADP, JOLTS, Jobless Claims,
  Arbeitslosenquote und Wage Growth

Nicht jede Währung besitzt jeden Datenpunkt. Die Matrix darf fehlende
Gegenstücke nicht erfinden.

### 10.2 COT / institutionelle Aktivität

Pro Währung werden ausgewertet:

```text
net_positions = long_positions - short_positions
net_change = net_positions - previous_net
z_score = (net_positions - historical_mean) / historical_stddev
```

Position, Change und Z-Score werden jeweils auf `-1`, `0` oder `+1` reduziert.
Der COT-Faktorscore ist der Durchschnitt der verfügbaren Signale. Coverage zeigt,
welche der drei Komponenten tatsächlich vorlagen. Mindestens zwei historische
Netto-Beobachtungen sind für einen Z-Score erforderlich.

Die COT-Seite ergänzt seit 26.09.2026 einen deskriptiven Vergleich zweier Märkte:
je drei Legacy-Teilnehmer im historischen Diagramm und darunter COT-Saisonalität.
Migration `0050` speichert Commercial-/Non-Reportable-Long/Short als zusätzliche
nullable Spalten; der Collector liest dieselben offiziellen Legacy-Berichte.
`participantSeries` ergänzt die bestehenden Detailantworten. Fehlende Gruppen
bleiben unavailable. `cot-chart-data.ts` mittelt wöchentliche Netto-Bestände
über vollständige Kalenderjahre; keine Kursrendite, Indexierung oder Änderung
der bestehenden COT-/Macro-Bewertung. Cloudpakete akzeptieren genau das alte
oder neue geprüfte DDL, die isolierte Arbeitskopie wird atomar erweitert.
Methodik, Mindeststichproben und Rolloutgrenzen:
`docs/planning/cot-participant-comparison.md`.

### 10.3 Currency-Faktoren

Die verbindliche Reihenfolge der Kernfaktoren lautet:

1. COT / institutionelle Aktivität
2. Growth
3. Inflation
4. Labor
5. Rates
6. Seasonality

Technischer Trend und Crowd Sentiment können als weitere Currency-Faktoren
gespeichert werden. Raw-Wirtschaftsdaten werden innerhalb ihrer Domäne als
gewichteter Durchschnitt der binären Signale aggregiert. Currency-Scores dienen
Ranking und Überblick; der Paarvergleich nutzt nach Möglichkeit die einzelnen
Indikatoren.

### 10.4 Base-/Quote-Paarvergleich

Für jeden Datenpunkt mit Signalen auf beiden Seiten:

```text
component_score = base_signal - quote_signal
component_score ∈ {-2, -1, 0, +1, +2}
```

Beispiele:

- Base `+1`, Quote `-1` → `+2`
- Base `+1`, Quote `+1` → `0`
- Base `-1`, Quote `-1` → `0`
- Base `0`, Quote `+1` → `-1`
- eine Seite fehlt → nicht verfügbar und kein Beitrag zum Rohscore

Der Paar-Rohscore ist die **Summe** aller verfügbaren Komponenten, keine
Faktor-Durchschnittsnote. COT, Rates und Seasonality werden als
Faktorkomponenten ergänzt. Der normierte Anzeigenwert ist derzeit:

```text
normalized_score = clamp(raw_score / available_component_count, -2, +2)
```

Weitere Metadaten:

- Coverage = verfügbare Komponenten / alle vorgesehenen Komponenten
- Quality = Durchschnitt der Qualitätswerte verfügbarer Komponenten
- Agreement = Anteil der dominierenden Beitragsrichtung
- Conviction 0–5 wird aus dem Betrag des Rohscores abgeleitet
- Bias-Labels verwenden den Rohscore: ab `+5` Bullish, ab `+9` Sehr Bullish,
  bis `-5` Bearish und bis `-9` Sehr Bearish; dazwischen Neutral

Die vollständige Paarmatrix muss antisymmetrisch sein:

```text
score(A/B) = -score(B/A)
```

Jede Änderung braucht mindestens Tests für `+2`, Aufhebung gleicher Signale,
fehlende Gegenstücke, Summenbildung und Antisymmetrie.

### 10.5 Lokaler 4H-/Daily-Charttrend über MT5

Die Desktop-Heatmap liest abgeschlossene H4- und D1-Kerzen aus dem lokal
angemeldeten MT5-Terminal über `connectors/mt5_market_connector.py`. Dafür
wird kein EODHD-Intraday-Abruf mehr ausgeführt. Python und das Paket
`MetaTrader5` müssen lokal verfügbar sein. Ein optionaler Terminalpfad unter
**Macro → MT5-Verbindung** wählt bei mehreren Installationen die konkrete
`terminal64.exe`; keine Zugangsdaten und keine Journal-Kontoverbindung nötig.

`commands/mt5_technicals.rs` aktualisiert einmal je Kalendertag Europe/Berlin
bei laufender App, erstmalig kurz nach dem Start. Fehler werden nach 30 Minuten
erneut versucht; **MT5-Trends** erlaubt einen sofortigen manuellen Abruf.
Lease und atomare Veröffentlichung verhindern konkurrierende oder verspätete
Schreibvorgänge. Fehler erhalten den letzten guten Snapshot; alte Kerzen werden
bei der Auswertung als nicht verfügbar markiert. Broker-Suffixe werden über
Währungsmetadaten zugeordnet, CNH wird nicht als CNY ausgegeben.

Die vorhandene OHLC4-/EMA20-/EMA50-/ADX-/DMI-Methodik bleibt erhalten,
mindestens 100 abgeschlossene Kerzen je Zeitrahmen. Nur übereinstimmende
gerichtete Signale bestätigen den gemeinsamen Trend. H4 und Daily bleiben
einzeln sichtbar, auch bei fehlender oder gegensätzlicher Evidenz; der
Fundamentals Score wird dadurch nicht verändert. Migration 0052 trennt diese
Marktdaten von EODHD und Journal. Der private Webmodus behält seine bisherigen
unveränderlichen Marktpakete; es gibt keine automatische MT5-Cloudübertragung.
Bedienung und Prüfnachweise: `docs/planning/mt5-technical-trends.md`.

### 10.6 Gold und Silber: eigener USD-Einfluss

Die Macro-Seite ergänzt XAU/USD und XAG/USD in einer separaten Heatmap.
`features/macro/precious-metals.ts` bildet ausschließlich den angenommenen
USD-Kanal ab: verfügbare US-Indikatorsignale werden genau einmal invertiert
und summiert. Actual/Forecast/Previous, Quelle, Release und Verfügbarkeitsgründe
bleiben erhalten. Ohne bewertbares Signal bleibt der angezeigte Score leer.
Gold und Silber teilen diesen USD-Score; keine gemessene Korrelation oder
Gesamtprognose des Metalls behaupten. Realzinsen, Krisennachfrage und
Industrienachfrage werden als Gegenkräfte erklärt.

Metall-COT wird direkt aus GOLD/SILVER gelesen, nicht aus USD abgeleitet.
Die technische Lesefamilie und der MT5-Connector umfassen die bisherigen
36 Fiat-Paare plus genau XAU/USD und XAG/USD. Forex-/CFD-Metadaten sind Pflicht;
Futures, fremde Quotes und mehrdeutige Symbole bleiben ausgeschlossen.
Seasonality liest die eigenen vorhandenen EODHD-Spotprofile. Alte MT5-Caches
bleiben lesbar; fehlende Metallhistorie wird nicht als neutral behandelt.
Neue öffentliche Technicals-Pakete dürfen genau diese zwei USD-Spots ergänzen;
das bestätigt keine Cloud-Bereitstellung oder MT5-Übertragung. Vertrag und
Prüfungen: `docs/planning/precious-metals-heatmap.md`.

## 11. Leitzinsmodell

Zinsen sind ein eigener fachlicher Bereich und kein versteckter Teil von
Inflation.

Pro Zentralbank:

```text
expected_delta_bps = (expected_rate - current_rate) × 100
decision_surprise_bps = (actual_rate - expected_rate) × 100
```

- positive Erwartungsänderung → hawkish/positiv
- negative Erwartungsänderung → dovish/negativ
- Hold → neutral
- fehlende Erwartung oder nicht frische Daten → unavailable

Für USD wird die relative Wirksamkeit gegenüber ausländischen Zentralbanken
berechnet:

```text
foreign_pressure = gewichteter Durchschnitt ausländischer expected_delta_bps
usd_relative_stance = usd_expected_delta_bps - foreign_pressure
```

Mindestens vier nutzbare ausländische Zentralbanken sind standardmäßig nötig.
Wenn die Welt gleichzeitig ähnlich stark anhebt, kann eine US-Anhebung relativ
neutral werden. Verwechsele diese Relativwirkung nicht mit dem absoluten
Fed-Signal.

## 11a. Eigenständige Staatsanleihe-Renditen

`/government-bonds` verwendet ausschließlich den geprüften EODHD-GBOND-Katalog.
Der gemeinsame Katalog unter `src/features/government-bonds/data/catalog.json`
enthält 250 Länder/Gebiete und 266 Renditereihen für 60 davon (Prüfung 10.09.2026).
`USDSB3L1Y` ist ein ausgeschlossener Swap. Providerpräfix `CH` bedeutet Chile,
`SW` Schweiz; Länder und Metadaten niemals allein aus ISO-Präfixen erraten.
`government_bonds` speichert öffentliche Reihen separat in
`PersonalMacro/government-bonds/cache.sqlite`, mit eigenen `bond-migrations`.
Keine Änderungen an Leitzins-/Fundamentals-/Seasonality- oder Regime-Scores.
GBOND `close` ist Rendite in Prozent pro Jahr, kein Anleihekurs oder Kupon.
Dezimalstrings, negative Renditen, echte Null und fehlende Werte bleiben erhalten.
Basispunkte = Differenz in Prozentpunkten × 100. Kurven und Länderabstände
benötigen gleiche Beobachtungstage; Länderabstände außerdem gleiche Laufzeiten.
Unbekannte Quellwährungen und Kroatiens historische HRK-Metadaten bleiben sichtbar.
Abrufe laufen explizit, pro erfolgreicher Reihe höchstens alle 24 Stunden,
atomar je Reihe und abbrechbar nach der laufenden Reihe. Teilerfolge bleiben
erhalten. Der Browser zeigt das Verzeichnis ohne erfundene Renditen.
Details und Prüfungen: `docs/planning/government-bonds.md`.

## 11b. Wetter & Rohstoffe

`/weather` verwendet den gemeinsamen, versionierten JSON-Katalog unter
`src/features/weather/data/catalog.json`: 21 Rohstoffprofile, 49 redaktionelle
Anbauschwerpunkte und 147 feste benannte Wetterpunkte (Stand 05.10.2026).
Der Generator liegt unter `scripts/build-weather-catalog.mjs`. Keine aktuellen
Produktionsanteile oder genauen Anbauflächen aus diesen Punkten ableiten.
Die Karte verwendet die vorhandene Natural-Earth-Geometrie und Equal-Earth-Projektion.

`commands/weather.rs` akzeptiert nur bekannte Asset-IDs und ruft ausschließlich
Open-Meteo über HTTPS ab. Koordinaten und Variablen stammen aus dem Katalog;
Journal, Konten und Nutzerstandort sind nicht beteiligt. Vor dem 30-Minuten-Cache
werden Ortszuordnung, UTC-Zeitachse, Einheiten, Wertebereiche und Modellzeit geprüft.
Frist 25 Sekunden, Antwortgrenze 4 MiB, mindestens eine Minute zwischen
Abrufversuchen nach einem Fehler.
Die lokale Browser-Vorschau verwendet denselben Vertrag mit echten öffentlichen
Abrufen. Der private Webmodus besitzt einen eigenen lesenden Backendpfad und eine
optionale Capability; fehlende Unterstützung darf weder Demo-Wetter laden noch
das Journal sperren. Eine Live-Bereitstellung dieser neuen Route ist nicht bestätigt.

Alle Tagesfenster sind UTC: sieben archivierte Modelltage und heute plus 13
Vorhersagetage. Aktuelle Werte sind Modellwerte, keine Stations-/Radarmessungen.
`weather-model.ts` trennt fehlende Werte und echte Null, prüft Punktabdeckung und
behält Einzelpunktextreme neben dem ungewichteten Vergleich bei. Typische Phasen
sind redaktionell und manuell übersteuerbar; dies misst keine aktuelle Phänologie.
P−ET₀ verwendet eine Grasreferenz und ist keine Bodenfeuchte- oder Dürrediagnose.
Schwellen erklären mögliche Wasserzufuhr, Hitze, Frost, Nässe oder Ernteerschwernis;
keine Ertragsverluste, Preisrichtungen oder Handelssignale daraus behaupten.
Alte Daten bleiben sichtbar, die Wirkungsbewertung wird nach drei Stunden oder
einem UTC-Tageswechsel ausgesetzt. Langfristige Anomalien, Produktionsmasken,
Ensembles und eigenständige Energiewirkungen sind noch nicht implementiert.
Der Layer `picture` zeigt pro Region einen benannten Wetterpunkt mit Symbol
und Tagesmaximum. `weather-picture.tsx` verbindet dieselbe Orts-/Tagesauswahl
mit einer schematischen SVG-Wetterdarstellung und 14 anklickbaren Tagesbildern.
`weather_code` ist der tägliche WMO-Code für die schwerwiegendste modellierte
Wetterart, kein aktueller Radar-/Stundenverlauf. Einheit `wmo code`, 21 Werte,
Ganzzahlen 0–99 oder null werden geprüft. Ältere Backendantworten ohne Code
behalten ihre Messgrößen, zeigen aber ausdrücklich keine bekannte Wetterart.
Unbekannte Codes werden nicht als klarer Himmel behandelt. Animationen beachten
reduzierte Bewegung und den manuellen Schalter; die Landschaft ist kein Feldbefund.
Aufbau, Primärquellen und Prüfungen: `docs/planning/weather-insights.md`.

## 11c. Learning

`/learning` ist ein lazy geladenes, redaktionelles Nachschlagewerk unter
`src/features/learning`. Stand 05.10.2026: 69 Kapitel, sieben Themenwelten,
acht Lernwege und 95 Glossarbegriffe. Themen sind Währungen, Agrarrohstoffe,
Metalle/Energie, wirtschaftliche Zusammenhänge, Tokenisierung und Beobachtungswerkzeuge.
Die Texte verwenden einfache deutsche Sprache und denselben Kontextaufbau:
Einordnung, Treiber, Wirkungskette, Gedankenbeispiel, Gegenkräfte und Anwendung.
Fokusmodus ist die Voreinstellung; alle Abschnitte können gemeinsam gelesen werden.

Der Katalog ist typisiert und wird mit dem Frontend ausgeliefert. Er lädt keine
Marktprognosen, persönlichen Journal-Daten oder automatisch generierten Texte.
Quellen sind verlinkte Primärquellen mit datierter Prüfung und jeweiligem
Geltungsbereich. Beispiele sind ausdrücklich hypothetisch. US-Aufsichtsmaterial
zu Tokens nicht als deutsches/EU-Produktrecht ausgeben; keine sichere Preisrichtung
oder persönliche Produktempfehlung aus den Wirkungsketten ableiten.

`learning-progress.ts` speichert auf Desktop und in der lokalen Browser-Vorschau
Lesestelle, manuell markiertes Verständnis, Merkliste und höchstens 2.000 Zeichen
Notiz je Kapitel im lokalen Browser-/WebView-Speicher. Diese Daten sind nicht
Teil des SQLite-Backups. Bei gesperrtem Speicher bleibt der Zustand im Arbeitsspeicher
und wird entsprechend beschriftet. Im privaten Webmodus darf dieser Pfad keinen
Browser-Speicher lesen oder schreiben: Zustand bleibt ausschließlich im
Arbeitsspeicher der bestätigten Sitzung und wird bei Sitzungsende verworfen.
Keine Desktop-/Cloud-Synchronisierung des Lernfortschritts behaupten.
Die Erweiterung vom 06.10.2026 ergänzt optionale `get_learning_progress` und
`save_learning_progress` in PostgreSQL. Bei vollständiger Capability-Anbindung
bleiben Lernstand und Notizen dort dauerhaft; der Browser nutzt weiterhin keinen
persönlichen localStorage. Ohne diese Commands bleibt der Sitzungsmodus bestehen.
Migration `0012_cloud_transfer.sql` ergänzt außerdem private Journal-Sicherungen;
sie gehören weder in öffentliche Marktpakete noch in deren Generationsrevision.
Browser-Import/-Export, begrenzte Cloud-Wiederherstellung und Screenshot-Erfassung
mit Browser-OCR sind unter `docs/planning/mobile-function-parity-2026-10-06.md`
beschrieben. Dies bestätigt keine vollständige Desktop-Parität.

Die private Sitzungsschranke bleibt vorgeschaltet. Die statische Lernroute benötigt
keine zusätzlichen Cloud-Commands und erweitert die 46 Pflicht-Capabilities nicht.
Weiterführende Workspace-Links werden nach den verfügbaren Routen gefiltert.
Aufbau, Quellenregeln und Abnahme: `docs/planning/learning-dashboard.md`.

## 12. Seasonality

Seasonality-Snapshots speichern Asset, Symbol, Horizont, Stichprobenzeitraum,
durchschnittliche Rendite, positive Trefferquote, Stichprobengröße, Signal und
Kurvenpunkte. Das Signal ist `-1`, `0`, `+1` oder nicht verfügbar.

Die aktive Preisquelle ist ausschließlich EODHD. Forex, Indizes,
Kryptowährungen und Edelmetall-Spots werden aus dem EOD-Historical-Endpoint
geladen; täglich verfügbare Energie-Rohstoffe aus dem EODHD-Commodities-Endpoint.
Frühere Dukascopy-Kerzen und -Profile bleiben nur als nicht gelesene
Upgrade-Historie erhalten und dürfen nicht als Laufzeit-Fallback verwendet
werden. Der alte Instrumentkatalog darf einmalig nur zur expliziten
Symbolzuordnung in den validierten EODHD-Katalog gelesen werden.

- Keine belastbare Seasonality ohne Herkunft, Zeitraum und Stichprobengröße.
- Nur Kalenderjahre mit Abdeckung am Jahresanfang und Jahresende zählen als
  vollständige Stichprobe; unter fünf Jahren bleiben Rankings explorativ.
- Fehlende oder zu kleine Stichproben nicht als neutrale Evidenz behandeln.
- Das Paar-Scoring verwendet den saisonalen Currency-/Asset-Faktor in derselben
  Base-minus-Quote-Richtung.

### Ergänzung zur saisonalen Fenstersuche

`get_seasonality_opportunities` ergänzt die bestehende Seasonality um eine
Top-1-bis-Top-10-Suche mit lokalem aktuellem Monat und optionaler Jahresübersicht.
Die neue Suche zählt ausdrücklich Kalendertage, verwendet gemeinsame historische
Ein-/Ausstiegstage für Divergenzen und verändert keine Macro-Scores. Die reine
Berechnung steht in `metrics/seasonality_opportunities.rs`. FX-Futures bleiben
ohne angebundene Futures-Historie ausdrücklich nicht verfügbar; die EODHD-
Katalogprüfung vom 15.09.2026 ergab nur Forex-Spotpaare. Spotdaten werden nur nach
ausdrücklicher UI-Auswahl verwendet und nie als Futures ausgegeben. Details,
Methodik und offene Datenanbindung: `docs/planning/seasonality-opportunities.md`.

**Chancen im Markt** ergänzt seit 05.10.2026 einen rollierenden, lokalen
90-Kalendertage-Horizont: tägliche Einstiege ab heute, beide Fenstergrenzen
innerhalb des Horizonts, gemeinsame Long-/Short-Rangfolge. Die Berechnung
`scan_market_windows` nutzt dieselbe Kalenderfenster-Engine mit mindestens fünf
vollständigen Jahren aus den letzten 20 abgeschlossenen Jahren. Je Markt und
Richtung bleiben zehn unterschiedliche Kandidaten für eine globale Top 10.
Der optionale native Input `{ asOf }` und Cloud-`screenerInput` trennen dies vom
älteren jährlichen Screener-Vertrag. Die Desktop-Abfrage wechselt mit dem lokalen
Tag und Profilstand; Cloud-Batches bleiben ausdrücklich gestartet und an den
Tag sowie die Generation gebunden. Kalender- und Handelstage nicht gleichsetzen.
Eine neue Cloud-Bereitstellung ist damit nicht bestätigt. Vertrag und Grenzen:
`docs/planning/seasonality-market-opportunities-90-days.md`.

## 12a. Put/Call-Bereich vorerst entfernt

Der Put/Call-Ratio-Bereich wurde am 15.09.2026 auf Benutzerwunsch entfernt.
Seite, Navigation, Command-Palette, Browser-Adapter, native Commands und
CME-Hintergrundjob sind nicht mehr Bestandteil der Anwendung. Alte Links auf
`/put-call-ratio` fallen auf die vorhandene Weiterleitung zur Übersicht zurück.

Die unveränderlichen Migrationen `0032`, `0033` und `0048` sowie vorhandene
`put_call_*`-Daten bleiben erhalten. Der Journal-Reset schützt diese historischen
Daten weiterhin; es gibt keine neue Löschmigration. Eine erneute Anbindung
benötigt einen neuen Benutzerauftrag und einen nutzbaren Datenzugang.
Die frühere Umsetzung ist unter `docs/planning/put-call-automation.md` archiviert.

## 13. Fundamentaldatenquelle

Die aktive Fundamentals-Pipeline liegt ausschließlich in `commands/eodhd.rs`
und `commands/eodhd_fundamentals.rs`. Numerische Source of Truth sind die
provider-nativen Tabellen `eodhd_events`, `eodhd_fundamental_snapshots` und
`eodhd_fundamental_evaluations`. Excel, OpenAI, Forex Factory, Trading
Economics und BIS dürfen nicht als Fundamentals- oder Rates-Fallback
wiedereingebaut werden. Die alten nummerierten Migrationen bleiben
unveränderliche Upgrade-Historie; Migration `0030` entfernt ihre Laufzeittabellen.

## 13a. Eigenständiger Weltatlas

Der Atlas unter `src/features/world-atlas` und `src-tauri/src/world_atlas`
verwendet für seine statistischen Jahresreihen die öffentliche World-Bank-WDI-
API. Diese Daten werden ausschließlich im Atlas genutzt. Sie sind kein Fallback
für die bestehende EODHD-Fundamentals-/Rates-Pipeline.

Die statistische Grundlage umfasst 142 WDI-Reihen; 38 zusätzliche UN-SDG-Perspektiven erweitern den gemeinsamen Statistikkatalog auf 180 Reihen. Der ergänzende Produktionskatalog
`data/statistics-catalog.json` enthält 83 geprüfte Zuordnungen mit deutschen
Bedeutungs- und Geltungstexten. Ähnliche Größen bleiben über `series` in der URL
bewusst auswählbar. `worldbank.rs` prüft Quellenidentität und freigegebene
Providerbezeichnung einschließlich Preisbasis vor der Übernahme. Bildung mit
Bruttozugang zur Abschlussklasse ist keine direkt gemessene Abschlussquote;
Mobilfunkverträge sind keine eindeutigen Menschen, Kreditquoten keine jährlichen
Wachstumsraten. Bruttoquoten über hundert, negative Werte, Lücken und einzelne
Erhebungsjahre bleiben erhalten. Zahlen einschließlich Tooltips sind optional.
Einzelheiten und tatsächliche Quellenabdeckung: `docs/planning/world-atlas/STATISTICS.md`.

Die Afrika-Erweiterung `data/africa-development-catalog.json` ergänzt 49 WDI-
Reihen zu Grundversorgung, Ernährung, Gesundheit, Landwirtschaft, Außenwirtschaft,
Auslandsschulden, Beschäftigung und Armut. Neue Reihen enden fest spätestens 2024;
Erhebungen und Mehrjahresfenster bleiben einzelne Punkte. Armut verwendet 2021-PPP;
Unterernährung mit Quellenwert 2,5 kann unter 2,5 Prozent bedeuten. BNE, BIP,
Stadt-/Land-/Risiko- und Altersnenner bleiben getrennt. Auslandsschulden sind keine
reinen Staatsschulden. Drei Originalaggregate `worldbank:SSF`, `worldbank:AFE` und
`worldbank:AFW` haben keine ISO-Codes; `worldbank.rs` prüft Codes, Namen und
Aggregatstatus und speichert ausschließlich veröffentlichte Regionalwerte.
UN-/ILO-/FAO-/Ember-Regionen werden nicht ersetzt. Der gemeinsame Katalog umfasst
457 Gebiete und 260 Themen. Explizite WDI-Reihen dürfen nicht von einer anderen
Quellenansicht oder einem Kontext-Einstieg verdeckt werden. Details und
unabhängiger Zahlenabgleich: `docs/planning/world-atlas/AFRICA.md`.

Die drei ILO-Beschäftigungsanteile sind Modellschätzungen mit festem
`throughYear: 2024`; Import und Cache-Lesen beachten diese Grenze auch in
späteren Kalenderjahren. Neuere Modelljahre benötigen eine Quellenprüfung vor
der Erweiterung. Die fünf UNIDO-Industrieanteile verwenden die Wertschöpfung
des verarbeitenden Gewerbes als Nenner, nicht das BIP. Breite Branchen und der
veröffentlichte Restbereich bleiben ausdrücklich abgegrenzt. Keine selbst
berechneten Weltanteile oder auf hundert normierten Ersatzwerte.
Details: `docs/planning/world-atlas/SECTOR-STRUCTURE.md`.

Vierzehn weitere WDI-Kontextreihen ergänzen Energie, Brennstoffe, Rohstoffe,
Gründungen, Handel, Logistik und Erwerbsbeteiligung nach Bildungsstufe.
Ressourcenrenten sind Modellschätzungen relativ zum BIP, keine Firmengewinne.
Energie-Nettoimporte bleiben negativ bei Nettoexporteuren. Der historische
Logistikindex ist auf WDI-Quellenjahre bis 2022 begrenzt und bleibt von LPI 2.0
getrennt. Energieintensität verwendet Kaufkraftbasis 2021. Einkommen/Konsum
und staatliche Abgrenzungen benötigen vor weiteren Reihen eigene Metadaten;
keine scheinbar gleichartigen Länderbilder daraus erzeugen. Details:
`docs/planning/world-atlas/ECONOMIC-CONTEXTS.md`.

Drei Migrationsbilder trennen jährlichen Wanderungssaldo, internationalen
Migrantenbestand und veröffentlichten Bevölkerungsanteil. WPP-Salden sind
historisch auf 2023 begrenzt; Bestandsmodelle aus International Migrant Stock
reichen bis 2024. Zwischen den acht Bestandsjahren keine Linien interpolieren.
UN-Nenner nicht durch WDI-Gesamtbevölkerung ersetzen; ein gerundeter Nullanteil
kann trotz positivem Bestand vorliegen. Grenzänderungen, Staatsangehörigkeits-
Ersatz und abweichende Weltaggregate bleiben erläutert. Modellschätzungen sind
im Einzelbild und in der Übersicht unmittelbar gekennzeichnet. Details:
`docs/planning/world-atlas/MIGRATION.md`.

Die Länderübersicht (`view=statistics`) ordnet diese Reihen nach Themenfeld,
Gruppe und Katalogthema. `statDomain`, `statGroup` und `statHorizon` erhalten die
Auswahl beim Wechsel zum Einzelbild. SVG-Karten teilen den Kalender, verwenden
aber je Statistik einen eigenen Maßstab; Länder derselben Karte haben dieselbe
Einheit, Skala und denselben Quellenstand. Sichtbare gemeinsame Zeiträume,
Lücken und einzelne Erhebungen bleiben erhalten. Optionale Zahlen vergleichen
nur dasselbe tatsächlich verfügbare Jahr. `statistics_batch.rs` lädt explizit
gewählte Reihen nacheinander weltweit, teilt die globale Atlas-Abrufsperre und
überspringt erfolgreiche Abrufe der letzten 24 Stunden. Ein Abbruch beendet die
laufende Statistik atomar und stoppt vor der nächsten. Der gemeinsame Job zählt
gespeicherte Statistiken statt Providerseiten. Teilerfolge bleiben bei Fehlern
und Neustart erhalten; die UI invalidiert bereits bei Fortschritt sowie bei
Abschluss, Fehler und Unterbrechung. Keine zusätzliche Cachemigration.

`view=coverage` zeigt die Quellen- und Themenabdeckung über die vorhandenen
lesenden Atlas-Commands. `atlas-coverage.ts` unterscheidet lokale Bilder,
fehlende/noch nicht geladene Werte, zu kurze Marktwellen, andere Quellengebiete
und Katalogthemen ohne Anbindung. Quellenkandidaten allein zählen nicht als
implementierte Daten. Suche nach einer Messgröße darf deren fehlende Werte
nicht mit einer anderen verfügbaren Perspektive überdecken. Gebietswechsel
sind ausdrücklich; globale Fonds sind keine Länderwerte. Der separate
`data/coverage-catalog.json` wird durch `evidence/audit_geographies.py` aus
öffentlichen Quellen- und nativen Gebietsnachweisen erzeugt. Er ist eine
datierte Zuordnungsprüfung, kein Ersatz für lokale Werte. Bei Katalogänderungen
erneut prüfen; insbesondere WDI `CHI` nicht Jersey oder Guernsey zuschlagen.
Details: `docs/planning/world-atlas/COVERAGE.md`.

Stromwirtschaft verwendet ausschließlich die feste öffentliche Ember-Datei
`yearly_full_release_long_format.csv`. `energy_source.rs` prüft neun
Erzeugungsarten, Einheiten, Jahresgrenzen, Gebietsidentitäten und Duplikate.
Anteile, Erzeugung und installierte Leistung bleiben getrennte Größen;
Nettoimporte dürfen negativ sein. Vollständige Strommixe benötigen alle neun
verfügbaren Anteile. Fehlende Zellen und Zeilen werden nicht auf null gesetzt
oder umgewichtet. Alle Werte heißen Quellenstatistik mit Schätzungen, weil die
Datei keinen Mess-/Schätzstatus je Zelle enthält. Eigene `ember:*`-Aggregate
bleiben von UN-/Maddison-Regionen getrennt. Atlasmigration 0005 speichert einen
vollständigen Stand atomar; eine globale Abrufsperre und 24 Stunden Abstand
verhindern gleichzeitige beziehungsweise wiederholte Downloads. Details:
`docs/planning/world-atlas/ENERGY.md`.

`capacity_*` ergänzt installierte elektrische Leistung aus den festen öffentlichen
IRENASTAT-Capacity-2026-H1-Tabellen. Atlasmigration 0007 speichert 224 Länder-
und zehn Regionsprofile getrennt von Ember. MW sind keine erzeugten MWh oder
Bewertungen. Netzarten, Solar/PV/Solarthermie und übergeordnete Technologiesummen
bleiben getrennt; der Quellenmarker `"-"` bleibt ohne erfundenen Zahlenwert.
Länder-Regionalzeilen REA/OCA werden ausgelassen, eigene `irena:*`-Gebiete
verwenden unverändert die Regionstabelle. Es gelten gemeinsame Abrufsperre,
atomarer Austausch und 24 Stunden Mindestabstand. Details: `docs/planning/world-atlas/CAPACITY.md`.

`credit_*` ergänzt im Atlas den festen öffentlichen BIS-Download
`WS_CREDIT_GAP_csv_flat.zip`. Atlasmigration 0008 speichert 43 Länder und den
separaten `bis:euro_area`-Euroraum. Quartalsquote, veröffentlichter einseitiger
HP-Modelltrend und Trendabstand bleiben getrennt. Weder Mittellinie noch
negative Abweichung bedeuten faire/günstige Bewertung. Keine Zyklen erfinden,
keine Welt-/Afrikawerte mitteln und keine private Quote als Staatsverschuldung
ausgeben. Quellenrundung, Modellvorgeschichte, andere Quellenstände und Lücken
sind geprüft. Gemeinsame Abrufsperre, atomarer Austausch und 24 Stunden
Mindestabstand gelten. `creditMode`/`creditSince` und BIS-Quellenmetadaten gehören
zum Merkkontext. Details: `docs/planning/world-atlas/CREDIT.md`.

`debt_*` ergänzt getrennte Haushalts- und Unternehmensschulden aus dem festen
öffentlichen BIS-Download `WS_TC_csv_flat.zip`. Atlasmigration `0016` speichert
48 Profile (43 Länder/Wirtschaftsgebiete, Euroraum, vier explizite
`bis:debt_*`-Aggregate). Es gibt kein vollständiges Welt-/Afrikaprofil.
Schuldenquote und Differenz zum Vorjahresquartal bleiben von fairer Bewertung
und dem BIS-Kreditgap getrennt. Brüche, fehlende Zwischenquartale und heutige
Quellenrevisionen werden erhalten; keine App-Interpolation. H/N-Sektoren,
Originaltitel, Dezimaldefinitionen (Kolumbien drei, sonst eine Stelle),
Quellenhash und Abrufzeit werden geprüft. Deutschland vor 1991 und Indien
besitzen sichtbare historische Schätzungshinweise. Gemeinsamer atomarer Cache,
globale Abrufsperre und 24-Stunden-Abstand gelten. `debtMode`/`debtSince` und
BIS-Herkunft gehören zu letzter Ansicht und Merkkontext. Details:
`docs/planning/world-atlas/DEBT.md`.

`property_*` ergänzt den festen öffentlichen BIS-Download
`WS_SPP_csv_flat.zip`. Atlasmigration 0009 speichert 57 Länder/Wirtschaftsgebiete
und vier eigene BIS-Aggregate. Nominaler und realer Index (2010 = 100) sowie
Vorjahresänderungen bleiben getrennte veröffentlichte Reihen; Preisentwicklung
ist keine Bezahlbarkeit oder faire Bewertung. Sehr kleine historische Indizes
benötigen Rundungsintervalle für den Abgleich mit veröffentlichten Änderungen.
`bis:property_world`, `bis:advanced_economies` und `bis:emerging_economies` sind
keine vollständigen Welt-/Kontinenterhebungen. Historische Quellenwechsel und
mögliche Interpolation durch den Anbieter bleiben als Grenzen sichtbar;
die CSV liefert keine datierten Bruchmarkierungen. Nationale Ausgangsquellen
sind katalogisiert. Vier `property*`-Darstellungsparameter und BIS-Herkunft
gehören zum Merkkontext; Preisbasis und Maßstab stehen auch im festen Bild.
Gemeinsame Abrufsperre, atomare Übernahme und 24 Stunden Mindestabstand gelten.
Details: `docs/planning/world-atlas/PROPERTY.md`.

`ratio_*` ergänzt die kostenlosen OECD Analytical house prices indicators
für 42 Länder und drei eigene `oecd:housing_*`-Aggregate. Atlasmigration 0010
speichert vier veröffentlichte Quartalsreihen: Kaufpreise zu Einkommen/Mieten,
jeweils als Index mit Bezugsjahr 2015 und, soweit vorhanden, Prozent des
langfristigen OECD-Durchschnitts. Die Hoch-/Tiefansicht zieht nur 100 ab;
keinen eigenen Durchschnitt, Trend, fairen Preis oder fehlende Referenz erfinden.
Indien, China und Welt haben in dieser Quelle kein Profil. Historische
Skalierungswechsel zwischen Index und standardisierter Reihe sind geprüft und
segmentieren beide Bilder; ungeprüfte neue Wechsel verhindern die Übernahme.
Die Quelle nennt keinen einheitlichen Referenzzeitraum. Preis-, Einkommens- und
Mietindexdefinitionen bleiben von BIS-Preisen getrennt. Gleicher Quellenstand,
gemeinsame Quartale und identische Skala sind Voraussetzung für Ländervergleiche.
Die drei `ratio*`-Parameter und `oecd`-Herkunft gehören zum Merkkontext.
Gemeinsame Sperre, atomarer Austausch und 24 Stunden Mindestabstand gelten.
Details: `docs/planning/world-atlas/HOUSING-RATIOS.md`.

`education_*` ergänzt 40 UIS-Bildungsreihen aus dem festen kostenlosen
SDG-Gesamtdownload Februar 2026. Atlasmigration 0011 speichert 245 tatsächliche
Profile (223 Länder/Gebiete, 22 eigene `uis:*`-SDG-Regionen). 15 weitere
zugeordnete Quellengebiete bleiben in diesen Reihen ohne Werte. Umfragepunkte,
Lernstandstests, administrative Statistiken und veröffentlichte Abschlussmodelle
bleiben unterscheidbar; Modelle ersetzen keine fehlenden Erhebungen. `NA` ist
trotz rohem Nullwert fehlend, `NIL` ist null. Alle Quellenkennzeichen und
unterschiedlichen Fußnoten bleiben erhalten. Nicht gleichgesetzte Testprogramme
werden nicht überlagert. Zahlen sind optional; gemeinsame Datenstände und
Erhebungsjahre begrenzen Vergleiche. Der separate Gesamtkatalog enthält nun
353 Gebiete einschließlich der FAO-Regionen und getrennten BIS-Schuldengruppen.
`educationMetric`/`educationSince` und UIS-Herkunft gehören zum
Merkkontext. Bestehende explizite WDI-Links bleiben gültig. Gemeinsame Sperre,
atomarer Cachewechsel und 24 Stunden Mindestabstand gelten. Details:
`docs/planning/world-atlas/EDUCATION.md`.

`agriculture_*` ergänzt FAOSTAT Production Indices (QI), kostenlos und ohne
Schlüssel. Atlasmigration 0012 speichert 234 tatsächliche Profile: 199
Länder/Gebiete und 35 ausdrücklich gewählte `fao:*`-Aggregate. 196 Erzeugnisse
und Produktgruppen sind in zwölf Gruppen geordnet. Die Elemente 432 und 434
sind veröffentlichte Brutto-Produktionsindizes insgesamt/je Einwohner, jeweils
Basis 2014–2016 = 100. Keine absoluten Marktgrößen, Preise, Flächenerträge,
Ernährungssicherheit oder Anlagebewertungen daraus ableiten. Die Methodennotiz
spricht teilweise von Nettoabzügen, die Datei ausdrücklich von Gross; keine
eigenen Nettoindizes berechnen. Alle Werte sind FAO-Schätzungen (`E`). Fehlende
Reihen und echte Nullwerte unterscheiden; Deutschlands Weizen endet im
geprüften Stand 2017, die Gesamtlandwirtschaft 2024. Chinas Festland (`41`) und
FAO-China (`351`) bleiben getrennt. Keine historischen Staaten auf Nachfolger
oder Quellenregionen auf fremde Aggregate abbilden. Sechs `agri*`-
Parameter und `fao`-Herkunft gehören zum Merkkontext. Katalog, Originalelemente,
Quellenstand vor/nach Download und Zeilenzahl werden streng geprüft; atomarer
Gesamtwechsel, globale Sperre und 24 Stunden Mindestabstand gelten. Details:
`docs/planning/world-atlas/AGRICULTURE.md`.

Alle gewöhnlichen Reqwest-Clients wählen ausdrücklich `.tls_backend_rustls()`.
Der IRENA-Endpunkt benötigt unter Windows `.tls_backend_native()` über Schannel
für seine ältere TLS-Konfiguration; mindestens TLS 1.2, Zertifikats- und
Hostnameprüfung bleiben aktiv. Das zusätzliche Reqwest-Feature darf nicht
unbeabsichtigt den TLS-Standard anderer Provider ändern.

UN-Demografie verwendet ausschließlich drei feste WPP-2024-Dateien einschließlich
der Togo-Zwischenkorrektur vom 19.01.2026. `demography_source.rs` liest alle
Gzip-Mitglieder, validiert vollständige Fünfjahres-Altersgruppen und rechnet die
Quelleinheit Tausend Menschen einmalig in Menschen um. 1950–2023 bleiben
Schätzungen, 2024–2100 Projektionen, auch wenn Projektionsjahre inzwischen
vergangen sind. Welt-/Regionsaggregate werden unverändert von der UN übernommen;
sie enthalten laut Anbieter die Togo-Korrektur noch nicht. Fehlende Alterswerte
und Nenner null ergeben keine erfundenen Anteile oder Quotienten. Details:
`docs/planning/world-atlas/DEMOGRAPHY.md`.

Haushaltsbilder verwenden separat die feste UN-DESA-Arbeitsmappe 2026.
`households_source.rs` prüft Hash, Metadaten, alle 1.129 Erhebungen, 39 Maße
und 200 ISO3-/UN-Location-Zuordnungen vor der atomaren Speicherung in
Atlasmigration `0015`. Originalzeile, Quellengruppe und Katalog-ID bleiben
erhalten, auch bei mehreren Quellen im selben Land/Jahr. Fehlwerte `..`
bleiben leer; zwischen Erhebungen wird weder gemittelt noch interpoliert.
Welt-/Kontinentmittel werden nicht berechnet. Acht ungewichtete MICS-Erhebungen
werden gesondert markiert. Überlappende Alters-/Generationengruppen und
unterschiedliche Nenner bleiben ausdrücklich beschriftet. Bei den beiden
irreführenden Excel-Definitionen zu durchschnittlicher Größe und weiblicher
Bezugsperson gilt der offizielle Methodenbericht für alle Haushalte.
Länder teilen Zeit- und Wertskala. Explizite Erhebungen stehen in `hhRecord`
und `hhCompareRecord`; automatisch gewählte Erhebungen werden erst im
Merkkontext konkretisiert und erzeugen keine URL-Nebenwirkungen in Kindkomponenten.
Quelle, Erhebungsjahr und ausgewählte Balken bleiben im gespeicherten PNG
nachvollziehbar. Details: `docs/planning/world-atlas/HOUSEHOLDS.md`.

Findex-Bilder verwenden die feste öffentliche Global-Findex-2025-Länderdatei.
Atlasmigration `0021` speichert 42 Perspektiven in sieben Gruppen für 174
Profile: 162 Länder/Gebiete, Welt und elf eigene `findex:*`-Aggregate. Fünf
veröffentlichte Erwachsenengruppen bleiben getrennt; keine Gesamtwerte als
Ersatz für fehlende Frauen-/Männer-/Einkommensgruppen. Alle 59.471 Quellanteile
zwischen null und eins bleiben unveränderte Dezimalstrings, einschließlich
zehn wissenschaftlicher Schreibweisen. 98.701 Fehlwerte sind keine Null;
273 veröffentlichte Nullwerte bleiben echt. Die Anzeige rechnet nur in Prozent
um und verwendet für sämtliche Karten die feste Spanne null bis hundert.
Erhebungen 2011/2014/2017/2021/2022/2024 bleiben einzelne Punkte; die 16 verspäteten
2022-Länder werden nicht auf 2021 zurückdatiert. Keine Interpolation, statistischen
Signifikanzbehauptungen, eigenen Regionsmittel oder Marktbewertungen.
Hash, Datei-/Spaltenumfang, alle Quellengebiete und demografischen Zeilen sind
geprüft; atomarer Cachewechsel, globale Sperre und 24 Stunden Abstand gelten.
`findexGroup`, `findexMetric`, `findexPopulation`, `findexSince` und beide
Quellen-/Glossarhashes gehören zum Merkkontext. Die Quellenübersicht prüft je
Messgröße ausschließlich die tatsächlichen Werte aller Erwachsenen und führt
zur genauen Messgröße. Der gemeinsame Katalog umfasst jetzt 378 Gebiete.
Details: `docs/planning/world-atlas/FINANCIAL-INCLUSION.md`.

Rohstoffbilder verwenden separat die feste öffentliche World-Bank-Pink-Sheet-
Arbeitsmappe September 2026. Atlasmigration `0020` speichert 85 internationale
Preis-/Indexreihen in beiden Preisbasen, 1960–2025, ohne Länderprofile zu erfinden.
10.310 Zahlen werden als exakte Integer-Hundertstel gespeichert; 910 Fehlwerte
bleiben leer. Die reale Quelle verwendet MUV statt nationalem CPI. Darstellung
relativ zum eigenen Wert von 2010 bedeutet keine faire Bewertung. Sichtbare
Karten teilen Skala und Kalender. Quellenwechsel, die Realindex-Abweichung bei
Ölen/Schroten 2014 und ungeklärte Eisenerz-Einheiten vor 2009 bleiben abgegrenzt.
Hash, Dateigröße, Blattmetadaten, Kalender und Umfang sind fest geprüft;
atomarer Cachewechsel, globale Abrufsperre und 24 Stunden Abstand gelten.
Sieben `commodity*`-Parameter sowie World-Bank-Herkunft gehören zum Merkkontext.
Der globale Query-Key benötigt keine Länder-ID. Details:
`docs/planning/world-atlas/COMMODITIES.md`.

ILO-Beschäftigungsbilder verwenden den kostenlosen dokumentierten CSV-Endpunkt
`rplumber.ilo.org/data/indicator`, `EMP_2EMP_SEX_ECO_NB_A`, Modellstand November
2025, `SEX_T`, 14 ILO-/ISIC4-Bereiche plus Total, 1991–2024. `labor_source.rs`
prüft Hash, Schema, Metadaten, Gebiets-/Quellencodes, Felder, Jahre und Flags.
Tausend Personen mit maximal drei Dezimalstellen werden exakt in Integer-Personen
umgerechnet; die Anzeige berechnet nur den Anteil am selben Länderjahres-Total.
190 Profile enthalten 96.765 Zahlen und 135 offene Kalenderzellen. A bedeutet
angepasst, leer ist kein Messnachweis. Keine App-Glättung, Projektion, Umgewichtung
oder Bewertungsformel. 188 Länder/Gebiete, Weltmodell X01 und eigene
`ilo:africa`-Modellregion X06 bleiben von fremden Regionen getrennt; Kanalinseln
und 85 weitere Quellengruppen bleiben ausgeschlossen. D/E, H/J, L/M/N, R/S/T/U
sind Sammelbereiche, keine einzelnen Energie-/Technologiesektoren. Atlasmigration
`0019`, gemeinsame Abrufsperre und 24 Stunden Mindestabstand gelten.
`laborGroup`, `laborMetric`, `laborSince`, Familie `ilo`, Ausgabe und Hash gehören
zum Merkkontext. Details: `docs/planning/world-atlas/LABOR.md`.

WIPO-Technologiebilder verwenden den kostenlosen öffentlichen CSV-Export,
Indikator `17` (4a), Bericht `13` (Total nach Herkunft), Quellenjahre 1980–2024,
Ausgabe Mai 2026. `innovation_source.rs` sendet den erforderlichen öffentlichen
Sprachheader `Accept-Language: en`, prüft den Quellenstand vor und nach dem
Download, Hash, Schema, sämtliche Ursprungscodes und Feldnamen. 35 Technikfelder
und „Unknown“ ergeben sieben UI-Gruppen, keine erfundenen Wirtschaftssektoren.
199 heutige Profile enthalten 108.696 exakt geprüfte Integer und 213.684
Fehlwerte. Die sechs historischen Codes AN/CS/DD/SU/YU/ZR werden keinem
Nachfolgestaat zugeordnet; NU/TL fehlen im geprüften Export. Keine Weltmittel,
Nullersatzwerte oder Patentanzahl-zu-Bewertung-Formel. Linien verbinden nur
benachbarte vorhandene Jahre bis 2023; 2024 ist optional und unverbunden als
redaktionelles Randjahr gekennzeichnet, nicht als erfundener Providerstatus.
Die ältere ZIP-Ausgabe bis 2022 darf nicht als Fallback dienen. Atlasmigration
`0018`, gemeinsame Sperre und 24 Stunden Mindestabstand gelten. `innovationGroup`,
`innovationMetric`, `innovationSince`, `innovationThrough`, `wipo`, Ausgabe und
Hash gehören zum Merkkontext. Rohdaten werden nicht ins Repository kopiert.
Details: `docs/planning/world-atlas/INNOVATION.md`.

WHO-Gesundheitsbilder verwenden zwei feste öffentliche GHED-Arbeitsmappen,
einschließlich der Korrektur vom 1. April 2026 und der Länderhinweise Dezember
2025. `health_source.rs` prüft beide Hashes, sämtliche 195 Landesidentitäten,
Codebook, Metadaten und 4.612 Länderjahre. Der vorhandene Calamine-Zellleser
streamt das breite Blatt, ohne 19 Millionen Zellen vollständig zu materialisieren.
38 Ausgabenmaße in sieben Gruppen bleiben direkte Quellwerte; laufende Dollar,
verschiedene Nenner und überlappende Klassifikationen werden ausdrücklich
benannt. Keine Anlagebewertung, Glättung oder erfundene Weltmittelwerte.
Die Jahrespunkte verbinden keine Methodenbrüche; 2024 ist vorläufig und hohl
markiert. Originale Methoden- und Länderhinweise bleiben vollständig erhalten,
ohne daraus einen Mess-/Schätzstatus je Einzelwert zu erfinden. Die 81.762
Zahlen des Caches sind exakt gegen die Quelle geprüft; der vorhandene
JSON-Commandleser kann beim erneuten Lesen um eine binäre Rundungseinheit
abweichen. Atlasmigration `0017`, gemeinsame Abrufsperre und 24 Stunden
Mindestabstand gelten. `healthGroup`/`healthMetric`/`healthSince`, `who` und beide
Dateihashes gehören zum Merkkontext. Details:
`docs/planning/world-atlas/HEALTH-FINANCE.md`.

Marktwellen verwenden explizite ETF-Stellvertreter aus `data/market-proxies.json`
und den vorhandenen EODHD-Schlüssel. Der eigene begrenzte Atlas-Preisadapter
benötigt `adjusted_close`, berücksichtigt abgeschlossene Monate und führt keine
Rohkurse als Ersatz ein. `market_wave.rs` berechnet rückblickend einen
60-Monats-Logtrend, zwölf Monate Glättung und eine optionale historische
Einordnung. Datenlücken und katalogisierte Strukturbrüche starten die Vorlaufzeit
neu. Alternative lange Fenster prüfen die Empfindlichkeit. Marktlage ist keine
fundamentale Bewertung; globale Themenfonds werden nicht als Länderfonds
ausgegeben. Pro Fonds höchstens ein expliziter erfolgreicher Abruf je 24 Stunden.
Methodik und Grenzen stehen unter `docs/planning/world-atlas/MARKET-WAVES.md`.

`market_context:relative_strength` verwendet dieselben gespeicherten bereinigten
Monatskurse für 25 relative Fondsvergleiche. Elf US-Sektoren verwenden SPY als
Referenz, Länder und globale Themen ACWI. Die Berechnung teilt die seit einem
gemeinsamen Monat indexierten Kurse; Wellenwerte werden nicht verrechnet.
Zwei Vergleichslinien brauchen dieselbe Referenz und denselben Basiszeitpunkt.
Nach katalogisierten Strukturbrüchen beginnt die Geschichte im Folgemonat.
Fehlende Monate bleiben leer, die Mittellinie ist keine faire Bewertung.
Der alte Monatscache enthält keine einzelnen Handelstagsdaten; identische
Handelstage werden nicht behauptet. Quellenstände, Fonds, Referenz und
`relativeHorizon` werden gemerkt. Keine zusätzliche API oder Cachemigration.
Details: `docs/planning/world-atlas/RELATIVE-STRENGTH.md`.

Die Marktübersicht verwendet dieselben nativen Wellen mit gemeinsamem Zeitraum
und symmetrischem Maßstab für alle sichtbaren Karten. Lücken und Einzelpunkte
bleiben erhalten; fremde Währungen oder Berechnungsrezepte werden nicht still
verglichen. `market_batch.rs` lädt nur explizite Katalogauswahlen nacheinander,
überspringt erfolgreiche Abrufe der letzten 24 Stunden und teilt die globale
Atlas-Abrufsperre. Ein Abbruch beendet den laufenden Fonds vollständig und stoppt
vor dem nächsten. Frühere Teilerfolge bleiben auch bei einem späteren Fehler
gespeichert; der UI-Cache wird bereits bei Fortschritt aktualisiert.

Öffentliche Atlasdaten liegen separat unter `PersonalMacro/atlas/cache.sqlite`,
mit eigenen Migrationen unter `src-tauri/atlas-migrations`. Der Cache enthält
keine persönlichen Notizen oder Journalwerte und gehört nicht zum Journal-
Backup. Ein vollständiger globaler Statistikabruf wird atomar übernommen;
Fehler lassen den bisherigen Datenstand bestehen. Ein fehlerhafter Atlas-Cache
darf den Journalstart nicht blockieren und wird nicht automatisch gelöscht.

Jahrhundertperspektiven verwenden den ausdrücklich benannten
Maddison-2023-Veröffentlichungsstand von Our World in Data. Der begrenzte
`history_source.rs` lädt zwei feste CSV-Reihen samt vorher/nachher geprüften
Metadaten. Preisbasis, Kennungen, Quellenstand und geprüfter Umfang sind fest.
Eigene Maddison-Regionen bleiben von UN-Regionen getrennt; frühere Staaten werden
keinen heutigen Nachfolgestaaten zugeschlagen. Weltanteile benötigen einen
veröffentlichten Weltnenner desselben Jahres. Frühe Einzelpunkte und Lücken
werden nicht verbunden; logarithmische Darstellung ist keine Zyklusberechnung.
Atlasmigration 0004 speichert den gemeinsamen Stand atomar im öffentlichen Cache.
Details: `docs/planning/world-atlas/HISTORY.md`.

Sechs Zyklusthesen verwenden ausschließlich redaktionelle Erklärungen und
frei gezeichnete SVG-Modelle aus `atlas-cycle-hypotheses.ts` und
`atlas-cycle-panel.tsx`. Sie starten geschlossen, besitzen keine Mess-/Zeitachse
und bestimmen keine heutige Länderphase. Ein Lernschritt ist keine Beobachtung;
Länderwechsel dürfen das Modellbild nicht verändern. Kontextlinks öffnen
vorhandene Datenperspektiven mit erhaltenem Gebiet/Vergleich; der Rückweg
erhält den Schritt. Quellenbefund, Gegenargument und Geltungsbereich bleiben
sichtbar unterscheidbar. In der Quellenabdeckung bleibt die numerische
Zyklusreihe unangebunden, auch wenn das Theorie-Modell geöffnet werden kann.
JST R6 ergänzt inzwischen eine eigene numerische Finanzgeschichte; die Theorie
erhält dadurch keine automatische Länderphase oder Zyklusuhr. Details:
`docs/planning/world-atlas/CYCLES.md`.

`macrohistory_*` verwendet die feste kostenlose JST-R6-Arbeitsmappe für 18
Länder und 1870–2020. Atlasmigration 0013 speichert alle Profile atomar. Der
offizielle Download und seine einzige geprüfte Weiterleitung sind erreichbar;
SHA-256, Blatt/Spalten, ISO-/IFS-Identitäten und sämtliche Kalenderjahre werden
validiert. 20 Perspektiven in sechs Gruppen verwenden direkte Quellwerte,
ausdrückliche Quoten oder mit dem CPI derselben Quelle bereinigte Renditen.
Die echte Vorjahres-CPI-Beobachtung ist Pflicht; historische Extremwerte und
kleine positive Nenner bleiben erhalten. Lücken, Quelleninterpolation,
wechselnde Gebietsstände und Schätzungen werden erläutert. `crisisJST` benennt
optionale Krisenanfänge, keine Dauer oder prognostizierten Wendepunkte. Indien,
China und Welt haben kein JST-Profil. Zahlen sind optional; gleiche Kalender-
und Quellenstände sind Voraussetzung für Vergleiche. Fünf `jst*`-Parameter,
`jst`-Herkunft und Länderlegende gehören zu gemerkten Ansichten. Gemeinsame
Abrufsperre, 24 Stunden Mindestabstand und getrennter öffentlicher Cache gelten.
Details: `docs/planning/world-atlas/MACROHISTORY.md`.

`fiscal_*` ergänzt historische IMF-Staatsfinanzen, Ausgabe Dezember 2025,
für 151 Länder/Gebiete bis spätestens 2024. Die feste unveränderte Arbeitsmappe
kommt ohne Schlüssel aus dem öffentlichen OWID-Archiv; direkte IMF-Abrufe
waren bei der Prüfung gesperrt. SHA-256, Datei-/Tabellenumfang, ISO-/IFS-IDs,
Namensvarianten und Kalender werden geprüft. Atlasmigration 0014 speichert
alle Profile atomar. Acht veröffentlichte Messgrößen bleiben unverändert;
negative Salden/Zinsen/Wachstumsraten, hohe BIP-Quoten, Null und fehlend bleiben
unterscheidbar. `GG_budg` und `GG_debt` bezeichnen getrennt Zentralregierung
oder Gesamtstaat; nur gleiche staatliche Ebenen werden im selben Jahr
verglichen. Lücken, Abgrenzungswechsel und dokumentierte Definitionsbrüche
trennen Linien ohne Verlust vorhandener Endpunkte. Keine Weltaggregate,
erfundene Jahrhundertwellen oder Anlagebewertungen. Drei Gruppen halten die
Bildauswahl klein; Zahlen sind optional. `fiscalGroup`, `fiscalMetric`,
`fiscalSince` und Quellenfamilie `imf` gehören zum Merkkontext. Gemeinsame
Abrufsperre, 24 Stunden Mindestabstand und getrennter Cache gelten.
Details: `docs/planning/world-atlas/FISCAL.md`.

Der gemeinsame Katalog liegt in
`src/features/world-atlas/data/catalog.json`; der Rust-Code bindet dieselbe
Datei ein. `scripts/build-atlas-catalog.mjs` erzeugt ihn aus der dokumentierten
Planungsgrundlage. Katalogisierte Themen ohne Datenzuordnung sind noch keine
fertige Länderanalyse. Aktueller Umfang und verbleibende Arbeit stehen unter
`docs/planning/world-atlas/IMPLEMENTATION-STATUS.md`.

Vierzehn Themen verwenden `atlas-context-guides.ts` als geordneten Einstieg
über 29 Verknüpfungen zu vorhandenen Datenperspektiven. Neben langen Entwicklungen
sind Gesamtproduktivität, Ungleichheit, Technologieverbreitung und finanzielle
Anspannung erschlossen. Arbeitsproduktivität ist dabei ausdrücklich nur ein
ergänzendes Bild zur noch nicht angebundenen Gesamtproduktivität. Eine Kontextseite
ist keine zusätzliche Messreihe oder automatisch erkannte Phase. Länder und
Vergleich bleiben erhalten; `fromGuide` bewahrt den Rückweg in URL, Notiz und
letzter Ansicht. Der Link ist nur für bekannte, zum aktuellen Thema passende
Ziele sichtbar. Gebietshinweise verwenden die bestehende Quellenprüfung, ohne
Profilzuordnung mit verfügbaren Werten gleichzusetzen. In **Daten & Quellen**
werden diese Einstiege erklärt, aber nicht als numerische Anbindung gezählt.
UN-Ziele starten ohne Projektion, Stromziele mit Erzeugungsanteilen ab 2000.
Details: `docs/planning/world-atlas/CONTEXT-GUIDES.md`.

10 weitere Themen verwenden `atlas-topic-research.ts` für datierte Quellenbefunde
mit konkreten Definitions-, Zugriffs- und Umsetzungslücken. Die verbleibenden
Einstiege verweisen auf neun Primärquellen. Der aktuelle Stand prüft
`scripts/audit-atlas-topic-routes.mjs` 225 numerische Perspektivzuordnungen,
14 ergänzende Kontext-Einstiege, 10 Quellen-Einstiege und sechs Theorieansichten.
Es gibt 31 Kontextverknüpfungen. Das bestätigt keine vollständige Länderabdeckung.
Die alte Quellen-Einstiegsroute wird bei neuer Anbindung entfernt, damit sie das
Datenbild nicht verdeckt. Historischer Recherchebericht: `docs/planning/world-atlas/TOPIC-RESEARCH.md`.

`sdg_source.rs` bindet die öffentliche UN Global SDG Database mit dem festen
Release `2026.Q2.G.02` an: 38 Perspektiven für 19 Themen, 249 explizite M49-
Zuordnungen einschließlich Welt. 80.641 endliche Zahlen und 278 `NaN`-Marker
wurden geprüft; fehlende Marker bleiben ohne Zahlenwert. Exakte Dimensionen,
primärer Indikator, Providerdefinition, Originaleinheit, vollständige Paginierung,
Gebietsidentität und historische Grenze 2025 sind verbindlich. Erhebungen werden
als Einzelpunkte dargestellt. Nationale Armutsgrenzen und die vier Zufriedenheitsbefragungen zu öffentlichen
Diensten sind nur für das Erstland sichtbar. Nahverkehr übernimmt nur explizite
Gesamtzeilen ohne einzelne Stadt. Fünf neue Dienstereihen laden wegen
Providerfehlern vollständige Seiten ohne Server-Dimensionsfilter und prüfen
die unverändert exakte Auswahl lokal. Originalquelle, Datenart, Fußnoten und Unsicherheitsgrenzen bleiben
je Punkt erhalten. Gemerkte Ansichten kennzeichnen SDG als UN-Quelle. Generische
Atlas-Cachetabellen, keine neue Migration. Details: `docs/planning/world-atlas/SDG.md`.

`public_*` ergänzt 342 Perspektiven für Schuldendienst (BIS), Reallöhne und
Arbeitszeit (OECD), institutionelle Indikatoren (WGI), private US-Bauausgaben
für Rechenzentren und Lagergebäude (Census) sowie Elektro-Pkw und öffentliche
Ladepunkte (IEA). Eurostat ergänzt KI, Robotik, IT-Sicherheit, Onlinehandel,
Cloudnutzung und Mietindizes; BGS ergänzt Zement, Lithium und Seltene Erden.
OECD HM1.1.A1 ergänzt den Wohnungsbestand mit tatsächlichen Bezugsjahren und
einem eigenen England-Gebiet. Eurostat ergänzt Bioenergie-Primärerzeugung,
Wärmepumpen-Wärmeleistung ab 2004 und die Fernwärme-Haushaltsbefragung 2023.
Das jährliche Energie-Meldesystem trennt echte Null, sehr kleine Mengen und
fehlende/vertrauliche Angaben nicht sicher; solche Quellen-Nullen bleiben als
Hinweise erhalten und im Diagramm offen. Keine erfundene lange Fernwärmereihe.
Details: `docs/planning/world-atlas/ENERGY-EXTENSIONS.md`. Eurostat SBS ergänzt sechs Ansichten zu Unternehmens- und persönlichen
Dienstleistungen. Archive 2005–2020 bleiben von EBS ab 2021 getrennt;
Brüche, vertrauliche Zellen und die Klassifikationsgrenze 2008 bleiben sichtbar.
Details: `docs/planning/world-atlas/BUSINESS-SERVICES.md`.
OECD TiVA ergänzt 83 Perspektiven für Handelspartner und Wertschöpfung in
Exporten: 80 Länder, 1995–2022, Ausgabe 2025 mit Revision Januar 2026.
Modellschätzungen, Waren und Dienstleistungen, feste Prozentbasis 0–100.
Partnerübersichten vergleichen nur dasselbe Jahr. Eigenland-Diagonalen und
überlappende Regionen werden nicht als Auslandspartner ausgegeben; WXD bleibt
als eigener Rest der Welt erhalten. Details: `docs/planning/world-atlas/TRADE-NETWORKS.md`.
WITS ergänzt den ausdrücklich gespiegelten Produktkonzentrationsindex aus
35 Originalarchiven (Stand 11.03.2023, 1988–2022). 238 Länder/Gebiete und der
Quellen-Weltindex behalten Skala 0–1 und Lücken; der unvollständige Rand 2022
steht als gekennzeichneter Einzelpunkt. WITS SDN ist ehemaliger Sudan 736,
SUD heutiger Sudan 729. Historische Sammelgebiete werden nicht neu zugeordnet.
Details: `docs/planning/world-atlas/EXPORT-CONCENTRATION.md`.
ND-GAIN 2026 ergänzt zehn Klimaperspektiven für 192 Länder. Neun Modellreihen
1995–2024 bleiben von der zeitlich konstanten Klimaexposition getrennt.
Exposition wird als einzelner Projektionsmarker ohne Jahresachse angezeigt;
die intern erhaltene Archivspalte 2024 ist kein beobachtetes Klimajahr.
Unterschiedliche Zukunftshorizonte, Quelleninterpolation und fehlende Teilmodelle
bleiben sichtbar. Höherer Kapazitätsbeitrag bedeutet geringere Kapazität.
Feste Skala 0–1, keine eigene Weltbildung. Details: `docs/planning/world-atlas/CLIMATE.md`.
BIS-Gewerbeimmobilien ergänzt 65 nationale und städtische Originalpreisreihen
für 24 Länder und den festen Euroraum mit 20 Ländern (Stand 2023). Unterschiedliche
Gebäudearten, Preisbasen und Einheiten bleiben getrennt; Halbjahre und echte
Quartalslücken bleiben erhalten. Das Vergleichsland hat eine eigene Reihenauswahl,
die als `publicCompareMetric` im Merkkontext bleibt. Vorläufige Werte sind hohl
markiert. Details: `docs/planning/world-atlas/COMMERCIAL-PROPERTY.md`.
EIA ergänzt fünf Perspektiven für stationäre US-Großbatterien: Bestand ab 2003,
Zubau und Dauer neuer Anlagen ab 2015, jeweils endgültiger Quellenstand 2023.
MW, MWh und Stunden bleiben getrennt; Planwerte 2024/2025 werden ausgelassen.
Details: `docs/planning/world-atlas/BATTERY-STORAGE.md`.
EPA-Archivstudien ergänzen sieben Patentperspektiven: Quantensensorik 2000–2017
und Raumfahrt 1990–2017. Weltweite Familien, Prioritätszuständigkeit, Anmelderherkunft
und Schutz in EPO38+ bleiben getrennt. Quellenjahre 2018/2019 werden wegen
abweichender Endfassung beziehungsweise Veröffentlichungsverzug ausgeschlossen;
414 leere Raumfahrt-Jahreszellen bleiben Lücken. Keine heutige Branchenbewertung.
Originaldiagramm-Caches und eingebettete Arbeitsmappen werden unabhängig geprüft.
Details: `docs/planning/world-atlas/EPO-PATENTS.md`.
GFDD ergänzt zwei Börsenkonzentrationsbilder für 60 Länder/Gebiete, 1998–2020,
Archiv September 2022. Marktwert und Handel außerhalb der jeweiligen Top 10
bleiben Originalanteile; niedriger bedeutet stärkere Konzentration. Keine
historischen Fondsgewichte, Weltaggregate oder Fortführung fehlender Jahre.
China, Hongkong und Taiwan bleiben getrennt. Details: `docs/planning/world-atlas/MARKET-CONCENTRATION.md`.
ACI ergänzt drei getrennte Trilemma-Forschungsdimensionen für 183 Länder: 532 Profile,
24.641 Originalwerte und 7.803 Lücken. Ausgabe 2021, MI/ERS bis 2020, KAOPEN bis
2019. Skala 0–1 ohne Gesamtnote; MI enthält bereits Vor-/Folgejahresglättung.
Historische Gebietsgrenzen sind ausdrücklich, USA und Welt bleiben ohne Ersatz.
Details: `docs/planning/world-atlas/TRILEMMA.md`.
JST ergänzt zwei historische Wechselkursklassifikationen für 18 Länder,
1870–2020. Die Originalfelder peg/peg_strict werden als benannte Jahresbänder
statt Zahlenwellen gezeigt; Modellrolle und Bezugsbasis bleiben im Tooltip.
NA ist eine Quellenkategorie, Irlands 50 leere frühe Jahre bleiben leer.
Kein erfundener Gold-/Fiatstandard. Details: `docs/planning/world-atlas/MONETARY-SYSTEMS.md`.
Die EU-Werkstoffstudie 2026 ergänzt zwölf Patentperspektiven für drei Prioritätsgebiete.
Ein festes Fenster 2010–2024 bleibt ein Zeitraum-Balken, keine Jahresreihe.
EU27-Patentämter plus EPA verwenden das eigene Gebiet `eu:am_priority`;
Priorität ist kein Unternehmenssitz. Sektorüberschneidungen werden nicht addiert.
Details: `docs/planning/world-atlas/ADVANCED-MATERIALS.md`.
Sasol ergänzt vier Anlagenperspektiven zu fossilen Synthesekraftstoffen,
2014–2026. Secunda White Product bleibt von Total Refined getrennt; ORYX
behält die berichtete Beteiligungsmenge und die separate Auslastung. Keine
Landesproduktion, erneuerbaren E-Fuels oder Hochrechnung auf die Gesamtanlage.
Geschäftsjahre enden am 30. Juni; sechs Originalberichte, 36 Fakten.
Details: `docs/planning/world-atlas/SYNTHETIC-FUELS.md`.
Atlasmigration 0022 speichert 59 atomare Quellenpakete
getrennt von den jährlichen WDI-Reihen. Census verwendet monatliche nominale
Bauausgaben ohne Saisonbereinigung. IEA übernimmt ausschließlich historische
Pkw- und Ladepunktdaten bis 2025; originale Welt- und neun IEA-Regionen bleiben
von anderen Gebietssystemen getrennt. Nicht ausgewählte Vans enthalten fünf
auffällige Quellenanteile über hundert und werden nicht importiert. Zwei neue
WDI-Preisniveauindizes verwenden USA = 100 und die seit April 2026 geltenden
Reihen PA.NUS.GDP.PLI / PA.NUS.PRVT.PLI; keine archivierte USA=1-Reihe.
Quartale und Monate bleiben Originalperioden. Die OECD-Lohnbasis ist 2025;
Arbeitsstunden unterscheiden Erwerbstätige und Arbeitnehmer. WGI ist eine
revidierte Wahrnehmungsschätzung auf absoluter 0–100-Skala mit 90%-Intervallen.
Keine Antillen-Nachfolgestaaten oder OECD-als-Welt-Zuordnung. Quellenhashes,
Gebiete und Dimensionen sind vor jedem Import geprüft, der feste Stand benötigt
bei neuer Veröffentlichung eine Quellenprüfung. Zahlen bleiben optional;
`publicSource`, `publicMetric`, `publicSince` und Herkunft gehören zum Merkkontext.
Details und Fortschritt: `docs/planning/world-atlas/PUBLIC-SOURCES.md` und
`docs/planning/world-atlas/evidence/remaining-40-ledger.json`.

Die Erweiterung vom 15.09.2026 ergänzt 25 Pakete mit 77 Perspektiven und 482.615 geprüften Zahlen: sechs IWF-GDD-Schuldendefinitionen (bis 2024), ILO-Reallohnveränderung (bis 2023), ILO-Wochenstunden (bis 2024), vier ICP-Wohn-/Versorgungsbenchmarks (2017/2021), 36 WTO-Warenhandelsbilder und 24 IWF-IMTS-Partnerbilder (1960–2025) sowie fünf IEA-Batteriezubau-Perspektiven. Nominaler Handel, TiVA-Wertschöpfung, Bestände, Zubau, Lohnveränderung und Lohnniveau bleiben getrennt. WTO-Fingerabdruck prüft alle CSV-Felder als reihenfolgeunabhängige Zeilenmenge einschließlich Duplikaten; IEA prüft das identifizierte Hauptdiagramm samt CSV und Metadaten. GDD-Originaldateien sind bei blockiertem Neuabruf nur ausdrücklich über `import_reviewed_public_atlas.rs` importierbar; derselbe Quellenprüfer, Abrufsperre und 24-Stunden-Grenze gelten. Kein stiller Fallback. 33 zusätzliche EODHD-Länderfonds erweitern den Bestand auf 59 Fonds für 43 Länder, Welt, US-Sektoren und globale Themen. GREK: Definitionsbruch 2016-03; VNM: 2023-03, aktuelle Welle noch zu kurz. EGPT ist eingestellt. WIPO-Feld 22 ergänzt fortschrittliche Materialien ausdrücklich nur als Patent-Teilperspektive. Details, Originalnachweise und aktuelle Restgrenzen: `docs/planning/world-atlas/GAP-EXPANSION.md`.

`library_jobs.rs` ergänzt über `sync_atlas_library` die fehlenden öffentlichen
Quellenpakete für alle jeweils verfügbaren Gebiete. 18 eigenständige Grundlagen,
16 Bewertungspakete, alle 180 Katalogstatistiken und optional 59 bestehende
EODHD-Marktreihen verwenden ihre geprüften Originaladapter. Vorhandene Pakete
werden übersprungen; Aktualisierungen bleiben in den jeweiligen Einzelansichten.
Gemeinsame Abrufsperre, atomare Speicherung je Paket, Fortsetzung nach einem
Providerfehler und Stopp nach dem laufenden Paket. Fortschritt zählt Pakete,
nicht Providerseiten. Der Browser verspricht keine Speicherung. Das Beispiel
`src-tauri/examples/fill_atlas.rs` kann ausdrücklich einen absoluten öffentlichen
Atlas-Cache füllen, ohne die Journal-Datenbank zu öffnen.

Für `demography:age_structure` ergänzt `perspective=un-age65` den Anteil ab 65
Jahren aus den vollständigen UN-Altersbändern. Fehlen im gewählten Gebiet WDI-
Werte, verweist ein vorhandenes UN-Profil auf diesen ausdrücklich benannten
Quellenwechsel. Das Gebiet bleibt erhalten; Projektionen werden zunächst
abgeschaltet. Die WDI-Reihe wird nicht mit UN-Werten vermischt.

### Atlas-Karte und Gebietsverzeichnis

`atlas-location-explorer.tsx` ergänzt die Länderauswahl optional und lazy geladen.
Die Karte ist reine Navigation, keine Choroplethenbewertung. `map`, `mapSearch`
und `mapRegion` stehen in der URL; Land-/Vergleichswahl erhält Thema und Ansicht.
Alle Kataloggebiete bleiben per Liste erreichbar. `data/map-geometry.json`
enthält projizierte Natural-Earth-Map-Units 5.1.1; kein Kartendienst zur Laufzeit.
Der Generator und `evidence/map-geography-audit.json` dokumentieren Quellenhashes
und Zuordnung. Frankreich/Französisch-Guayana und Providergebiete bleiben getrennt.
Unzugeordnete Quellenumrisse dürfen keine fremde Länderreihe öffnen. Die Karte
hat einen Tastatureinstieg, Pfeilnavigation und Enter/Leertaste; die Liste bleibt
gleichwertig. Details: `docs/planning/world-atlas/MAP.md`.

### Öffentliche Atlas-Bewertungen

`world_atlas/valuation_*` verwendet ausschließlich explizit katalogisierte,
öffentliche NYU-/Damodaran-XLS-Veröffentlichungen für den eigenständigen Atlas.
Dies ist kein Excel-Fallback für Macro, Fundamentals oder Rates. Atlasmigration
0006 speichert ein vollständiges Länder-/Branchenpaket atomar im öffentlichen
Cache. Alte Werte bleiben bei Fehler oder Abbruch erhalten; es gelten die
gemeinsame Abrufsperre und 24 Stunden Mindestabstand nach Erfolg.

Länder-Mittelwerte bis 2020 und Mediane ab 2021 bleiben getrennte Kennzahlen.
Branchenabschnitte vor/ab 2014 werden nicht zu einer historischen Einordnung
verbunden. Fehlende, fehlerhafte oder nicht positive Bewertungsverhältnisse
sind keine günstige Bewertung. Die historischen Ranglagen benötigen zehn
frühere sinnvolle Stände derselben Definition und mindestens zwanzig Firmen
je Quellenstand; diese Firmenzahl ist kein exakter Kennzahlnenner. Aktuelle
Punkte gehören nicht in ihre eigene Referenz. Prognose-KGV, Eigenkapitalrendite
und Verlustfirmenanteil bekommen keine historische Bewertungslage.

Quellenjahr, regionale Abgrenzung und ältere Stände bleiben sichtbar.
Gewinnbewertungen besitzen nun US-Archive 1999–2026 und Europa-/Japan-/
Schwellenländer-/Global-Archive 2012–2026. Indien/China bleiben Einzelstände.
Frühe unpräzise Aggregatspalten erhalten eigene Archivkennungen ohne Ranglage;
Verlustfirmenanteile beginnen erst 2023. Alle Archivdateien werden gegen ihre
geprüften SHA-256-Werte validiert. Der falsch verlinkte Japan-Stand 2025 wird
über die separat geprüfte Japan-Originaldatei übernommen, niemals aus Europa.
Der Katalog `2026-09-09.3` enthält 195 Originaldateien in 16 Paketen. Ältere
Cachepakete bleiben als vorheriger Quellenstand lesbar, ohne Schemaänderung.
Simbabwes doppelte abweichende Zeilen im Länderstand 2023 werden ausdrücklich
ausgelassen; neue unbekannte Konflikte stoppen die Übernahme. Branchen werden
nicht unscharf umbenannt oder zu fehlenden Länder-Sektoren umgedeutet. Details:
`docs/planning/world-atlas/VALUATION.md`.

`data/valuation-topic-links.json` ordnet 47 Atlas-Themen ausdrücklich 90
vorhandenen NYU-Branchen zu. Die 169 Links sind redaktionelle Navigation, keine
numerische Aggregation oder GICS-Klassifikation. `valTopic` begrenzt Galerie,
Suche und gültige Detailauswahl; die Liste bleibt beim Rückweg erhalten und wird
in Frontend sowie nativer Notiz-Parameterliste gespeichert. Einstieg über ein
Thema setzt Suche und Seite zurück. Fehlende Themenbranchen bleiben sichtbar.
Quellenregionen werden nicht zu Ländern umbenannt; auch die Beschriftung
gemerkter Branchenansichten verwendet die tatsächliche Quellenregion.

`atlas-valuation-regions.ts` ergänzt den Vergleich derselben Quellenbranche
zwischen zwei expliziten NYU-Regionen derselben Bewertungsgrundlage. Die aktive
Branchen-ID, Quellenbezeichnung, Kennzahl, Katalogversion und Punktprovenienz
müssen übereinstimmen beziehungsweise zu ihrem eigenen Paket passen. Nur mit
mindestens einem gemeinsamen sinnvollen Jahr desselben Methodenabschnitts
wird die zweite Reihe auf gemeinsamer Skala eingeblendet. Eigene Vorgeschichten
und Lücken bleiben erhalten; Indien PE 2026 und China PE 2025 werden nicht
überlagert. `valCompareScope` und `valCompare` wählen alternativ Region oder
andere Branche. Schnelle Grundlagen-/Regionswechsel werden gegen die aktuelle
URL-Transaktion validiert. Beide Regionsnamen, Originalquellen und Hashes bleiben
im Merkkontext. Dafür sind keine neue Datenquelle oder Migration nötig.

### Persönliche Atlasansichten

Hauptmigration 0047 speichert Ansichten, Favoriten, Klartextnotizen, letzte
Auswahl und feste PNG-Diagrammstände in der gesicherten Journal-Datenbank.
`world_atlas/notebook.rs` verwendet `AppState`, nicht den öffentlichen Cache.
Bearbeiten ändert nur Name, Notiz und Favoritenmarkierung; Kontext, Aufnahmezeit,
Quellenreferenzen und Bild bleiben fest. Revisionsnummern schützen vor
zwischenzeitlichen Änderungen. Ausschließlich Soft Delete mit Restore.

`atlas-display-state.ts` hält Diagrammjahr, Projektion, Maßstab, Zeitraum und
Bewertungssuche in der URL. `use-atlas-last-view.ts` respektiert ausdrückliche
Links und schreibt geordnet; Lesefehler dürfen den letzten Stand nicht ersetzen.
Nur der idempotente Upsert der letzten Ansicht meldet vorübergehendes SQLite
BUSY als `ATLAS_PREFERENCES_BUSY`. Die Schreibkette wiederholt höchstens dreimal
mit 250/750/1500 ms Pause, überspringt überholte Auswahlen und liest bei schneller
Wiederkehr erst nach der vorherigen Schreibkette. Andere Datenbankfehler und
Notizmutationen nicht blind wiederholen. Dauerhafte Sperren bleiben sichtbar.
Die COT-Hintergrundtransaktion und globalen SQLite-Zeitlimits bleiben unverändert.
Details: `docs/planning/world-atlas/PREFERENCES-RECOVERY.md`.
`atlas-picture-capture.ts` zeichnet ausschließlich Atlas-SVG-/Canvas-Flächen als
begrenztes PNG. Notizen gehen niemals an Datenanbieter. Der Browser bietet
keine vorgetäuschte persönliche Speicherung. Die eigentlichen Journal-Backups
und Pre-Restore-Sicherheitskopien verwenden konsistente SQLite-Kopien per
`VACUUM INTO`; Archivmanifest und Staging-Reihenfolge bleiben erhalten.
Details: `docs/planning/world-atlas/NOTEBOOK.md`.

## 14. EODHD-Release-Workflow

Ein vollständiger Tagesabgleich lädt alle neun Währungen in begrenzten
Datumsfenstern und paginiert innerhalb der Providergrenzen. Bekannte kommende
Releases erzeugen Nachprüfungen nach 2, 10, 30 und 120 Minuten. Nachträglich
entdeckte unvollständige Releases der letzten sieben Tage erhalten denselben
Retry-Satz. Der letzte vollständige Actual-/Forecast-Release bleibt bis zu
einem vollständigen Nachfolger aktiv. Unsichere Mappings benötigen eine
manuelle Freigabe. Unterschiedliche Frequenzen und Release-Daten sind im
Paarvergleich zulässig; die Metadaten bleiben im Tooltip sichtbar.

Der Wirtschaftskalender öffnet standardmäßig `currentWeek`: alle lokal geladenen
Termine ab Montag 00:00 Uhr bis zum nächsten Montag (exklusive). Vergangene
und kommende Termine stehen gemeinsam mit unveränderten Actual-/Forecast-/
Previous-Werten in der Liste. `week` bleibt der separate Verlauf seit Montag
bis einschließlich jetzt. Die optionale IANA-`timezone` berücksichtigt beide
Wochengrenzen einschließlich Zeitumstellung; ältere Aufrufe ohne sie verwenden
weiterhin `timezoneOffsetMinutes`. Die Oberfläche liest den lokalen Kalender
einmal pro Minute neu; dabei wird kein zusätzlicher Providerabruf ausgelöst.

## 15. Tradingjournal-Domain

### Konten

Konten besitzen Name, Broker, Kontotyp, Basiswährung, Startkapital, aktuellen
Kontostand, Standardrisiko und Archivstatus. Cashflows verändern den aktuellen
Kontostand nachvollziehbar. Globale Account-Filter liegen in `ui-store.ts` und
beeinflussen Dashboard-/Trade-Auswertungen.

Ein Account-Wechsel ist Filterung, kein Benutzerwechsel. Die App bleibt
Single-User.

`get_account_journal` liefert die ungefilterte Historie eines
ausdrücklich gewählten aktiven Kontos: Startkapital + Kapitalbuchungen + bekannte
Netto-Ergebnisse geschlossener, nicht gelöschter Trades = Journal-Kontostand.
Konto-P&L summiert ausschließlich diese Trade-Ergebnisse; Ein-/Auszahlungen,
offene Positionen und unbekannte Ergebnisse zählen nicht dazu. Fehlende
Ergebnisse werden zusätzlich gezählt. Eine verbundene Broker-Balance wird
separat geliefert und ersetzt die Journal-Rechnung nicht. Die Kapitalkurve hat
auch ohne Trades einen expliziten Startpunkt ohne erfundenes Kalenderdatum.
Die feste Kontoleiste im Journal bleibt unabhängig von Zeitraum-/Trade-Filtern.
`useAccountJournal` hängt unter dem Query-Key-Präfix `bootstrap`, damit bestehende
Import-, Trade- und Kontomutationen auch diese Summen aktualisieren.

Kontoeinstellungen verlangen ausdrücklich eingegebenes Startkapital (auch 0
ist möglich), erlauben dessen nachträgliche Korrektur und bewahren die Währung
bestehender Konten. Einzahlungen sind positiv, Auszahlungen negativ,
Korrekturen vorzeichenbehaftet und jeweils ungleich 0; Buchungszeiten sind UTC.
`accounts-browser.ts` verwendet dieselbe Rechnung und persistiert Testkonten
und Kapitalbuchungen in localStorage. Benutzer-SQLite-Daten werden dafür nicht
direkt bearbeitet; eine Schemamigration ist nicht nötig.

Konten können optional read-only über ein lokal angemeldetes MT5-Terminal oder
über cTrader Open API OAuth mit dem Scope `accounts` erstellt und hinsichtlich
der Broker-Balance aktualisiert werden. Die Verbindung enthält keine
Orderfunktionen. MT5-Passwörter werden nicht abgefragt oder gespeichert;
cTrader-Tokens liegen nicht in SQLite, sondern geschützt im
Windows-Anmeldedatenspeicher. Historische Trades werden über die zweiphasige
Vorschau und den atomaren Commit eines klassischen
MetaTrader-HTML-Reports oder eines cTrader-Statements als HTML/XLSX in ein
ausdrücklich ausgewähltes aktives Journal-Konto übernommen.
Beim cTrader-Import ist dieses Konto ausschließlich das Importziel;
Berichtskonto und Berichtswährung dürfen abweichen. Abweichende Netto-P&L-Werte
werden ohne erfundene FX-Umrechnung numerisch unverändert übernommen und mit der
Quellwährung gekennzeichnet.
Grafische Aggregate-Reports und leere XLSX-Dateien werden abgelehnt; HTML wird
niemals in der Oberfläche ausgeführt.

Zusätzlich kann ein bestehendes aktives Journal-Konto unter **Einstellungen →
Konten → Myfxbook automatisch synchronisieren** verbunden werden. Die erste
Übernahme erfordert Anmeldung, ausdrückliche Brokerzeitzone, geprüfte Vorschau
und Aktivierung. `commands/myfxbook` liest die offizielle persönliche API; ein
separater Scheduler prüft aktivierte Verbindungen alle fünf Minuten, solange
die App läuft. Es gibt keine Broker-Orderausführung und keinen Journal-Upload.
Passwörter werden nur für den Login verwendet; Sitzungen liegen im
Windows-Anmeldedatenspeicher. SQLite speichert ausschließlich Verbindung,
Zuordnungen und Importnachweise (`0049_myfxbook_sync.sql`).

Die API liefert höchstens 50 Historieneinträge, brokerlokale Zeiten und keine
dokumentierte verlässliche Ticket-ID. Mehrdeutige Einstiege/Teilschließungen,
fehlende offene Positionen, Historienlücken, lokale Konflikte und abweichende
Kontosummen stoppen den Import atomar. Identitäten berücksichtigen Symbol,
Richtung, Einstiegsminute, Preis und Quellmenge. Altimporte mit dokumentierter
Myfxbook-Anzeigemenge behalten korrigierte Journalgrößen. Offene Trades werden
unter derselben Journal-ID abgeschlossen; Notizen, Risiko und Beziehungen
bleiben erhalten. Explizite Quellmenge `0` bedeutet unbekannt und wird bei neuen
Trades als `NULL` mit sichtbarem Hinweis gespeichert; bestehende Größen bleiben
erhalten. Die übrigen Identitätsfelder müssen eindeutig passen. Nur zuvor als
unbekannt importierte API-Mengen dürfen später positiv ergänzt werden, auch bei
geschlossenen Trades; Journal-ID und Quellzuordnung bleiben stabil. Fehlende,
negative oder unlesbare Mengen bleiben Fehler. Startkapital, Kapitalbuchungen,
realisiertes Netto-P&L und
Quellbalance müssen exakt übereinstimmen; offene Gewinne werden ausgeschlossen.
Kosteninterpretation bleibt ohne eindeutige Evidenz offen. Vor Aktivierung und
anschließend vor Änderungen spätestens alle 24 Stunden wird ein Backup erstellt.
Der Browser bietet keine simulierte Verbindung. Details und Grenzen:
`docs/planning/myfxbook-sync.md`.

Mehrere Trades in derselben Einstiegsminute sind bei unterschiedlichen
Einstiegspreisen getrennt zuordenbar. Gleiche Preise bleiben trotz anderer
Mengen/Abschlüsse mehrdeutig. Ist bereits ein Journal-Trade dieser Minute
vorhanden, darf ein weiterer Einstieg erst neu angelegt werden, wenn der
bisherige Trade im selben API-Snapshot separat eindeutig enthalten ist.
So bleibt ein lokal geänderter Einstiegspreis ein Konflikt und wird nicht als
neuer Trade vervielfacht. Parser und Abgleich erzwingen dieselbe Eindeutigkeit.

Fehlgeschlagene Myfxbook-Vorschauen unterscheiden Quell-Duplikate und lokale
Preis-/Mengenkonflikte. `diagnostics.rs` schreibt dafür genau einen begrenzten
lokalen Bericht `logs/myfxbook-last-preview-error.json` mit normalisierten
Ausführungsfeldern; keine Sitzungen, Passwörter, Notizen oder beliebigen
Quellantworten. Diagnosefehler ersetzen nie den ursprünglichen Importfehler
und lösen keine Journalmutation aus. Zuordnungsregeln dürfen aus einer
pauschalen Fehlermeldung allein nicht gelockert werden.

### Trades

Der Kern unterstützt Draft, Planned, Open, Closed, Cancelled, Archived und
Trashed/Soft-Delete.

Primärer Einstieg ist die kompakte Erfassung mit Abgeschlossen / Läuft noch /
Geplant, direktem Netto-Ergebnis und optional aufklappbaren Screenshots,
Ausführungsdaten sowie Notizen. Brutto-Ergebnisse ziehen separat erfasste Kosten
ab; Netto-Eingaben ziehen sie nicht erneut ab. Der Positionsrechner wird in der
kompakten Erfassung ausdrücklich aktiviert. Formularentwürfe bleiben pro Konto
lokal erhalten. Ein gespeicherter Entwurf behält eingegebene Abschlusswerte,
trägt aber erst mit Status Closed zum Konto-P&L bei. Die ausführliche Erfassung
bleibt über Weitere Aktionen erreichbar. Beide Erfassungen verzichten auf
MAE/MFE und psychologische Eingaben; historische Felder bleiben kompatibel.
Der Trade-Dialog bietet einen direkten Abschluss mit Zeit, Netto-Ergebnis und
optionalem Exit-Preis für dieselbe bestehende Position.
Trade-Daten umfassen unter anderem Instrument, Assetklasse, Richtung, Zeitpunkte,
Entry, Stop, Target/Exit, Quantity, Kosten, P&L, R, Setup, Strategie, Session,
Timeframe, Prozess- und Qualitätsbewertungen, Regelbefolgung und Reviewtexte.

Ergänzende Entitäten:

- Legs/Teilausführungen
- Tags
- Checklisten
- Emotionen nach Phase
- Fehler mit Schweregrad und geschätzten Kosten
- Custom Fields
- Medien und Annotationen
- Macro-/Seasonality-/COT-Kontextlinks

Löschen ist standardmäßig Soft Delete mit Papierkorb und Restore. Füge keine
Hard-Delete-Oberfläche ohne explizite Anforderung und Schutzdialog hinzu.

Die schnelle und geführte Erfassung unterstützen lokale PNG-/JPEG-Screenshots
per Datei, Drag-and-drop und Zwischenablage. `commands/trade_screenshot.rs`
verwendet Windows OCR; es gibt keinen Cloud-Upload oder Browser-Mock.
`trade-screenshot-parser.ts` ordnet explizite Beschriftungen, einzelne
Positionstabellen und überprüfbare TradingView-Preislabels zu. Open/Closed P&L
einer Zeichnung ist kein Broker-Status; Stop-/Target-Abstände und Amount-
Kontostände dürfen nicht direkt als Stop-Preis oder Risikobetrag übernommen
werden. Unklare Mengen benötigen eine bestätigte Einheit, Geldbeträge die
Kontowährung. Übernommene Werte werden vor der bestehenden automatischen
Positionsberechnung geschützt. `create_trade_with_screenshot` speichert Trade,
Medieneintrag und Verknüpfung gemeinsam in einer Transaktion; das Originalbild
bleibt lokal und unverändert. Ein geführter Formularentwurf persistiert keine
Bildbytes; ein noch nicht gespeichertes Bild muss nach dem Schließen erneut
hinzugefügt werden.

`trade-screenshot-colors.ts` liest lokal die Farben der OCR-Wörter und lässt
die rechte Preisskala in vergrößerten, überlappenden Ausschnitten erneut per
Windows OCR lesen. `tradingview-chart-parser.ts` erkennt ausgeschriebene deutsche
und englische Paarnamen sowie Positions-/Bracket-Anzeigen. Die Preiszuordnung
benötigt passende Farben, gleiche Mengen/Währungen, plausible Long-/Short-Preise
und ein mit der Anzeigerundung vereinbares Verhältnis der Stop-/Zielbeträge.
Verschobene Achsenlabels sind zulässig; reine Nähe oder Rot/Grün allein genügen
nicht. Bid/Ask und Indikatoren dürfen nicht zum Entry werden. Nur eine eindeutig
zugeordnete offene Positionsanzeige darf „Offen“ vorbelegen. Temporäre Ausschnitte
werden nicht gespeichert; das Originalbild bleibt maßgeblich.

### Journal-Metriken

Die kanonische Engine liegt in Rust unter `metrics/mod.rs`. Die Browser-Vorschau
enthält eine parallele Implementierung in `browser-adapter.ts`; fachliche
Änderungen müssen in beiden Pfaden identisch sein.

Wichtige Regeln:

- nur geschlossene Trades mit bekanntem P&L fließen in Ergebniskennzahlen ein,
- Win Rate = Gewinner / alle geschlossenen Trades inklusive Break-even im
  Nenner,
- Profit Factor = Gross Profit / Betrag Gross Loss,
- bei Gewinnen und null Verlusten ist Profit Factor ein besonderer Wert `∞`,
  nicht eine beliebige große Zahl,
- Expectancy = Net P&L / Anzahl geschlossener Trades,
- R wird nur mit gültigem initialem Risiko berechnet,
- SQN benötigt mindestens 30 gültige R-Werte,
- Equity Curve wird chronologisch nach Abschluss aufgebaut,
- Drawdown = bisheriger Peak minus aktuelle kumulierte Equity,
- Break-even setzt Gewinn- und Verlustserien zurück,
- Prozess-, Ausführungs- und Regelmetriken zeigen `n` und Availability,
- Setup-/Zeit-/Account-Auswertungen müssen kleine Stichproben sichtbar machen.

Fehlende Kennzahlen werden mit Status und Reason Code geliefert. Ersetze sie
nicht durch `0`, weil Null eine reale fachliche Aussage sein kann.

## 16. Positionsgrößenrechner

Der Rechner liegt unter:

- `features/trades/position-sizing.ts`
- `features/trades/position-size-calculator.tsx`
- `features/trades/position-sizing.test.ts`

Eingaben werden aus ausgewähltem Konto, aktuellem Kontostand und
`defaultRiskPercent` vorbelegt. Fachlich gilt:

```text
risk_amount = account_balance × risk_percent
stop_distance = abs(entry - stop)
```

Für Spot/CFD/Forex/Metalle/Krypto:

```text
risk_per_quantity_quote = stop_distance × contract_size
```

Für Futures:

```text
risk_per_contract_quote = (stop_distance / tick_size) × tick_value
```

Danach erfolgt die Umrechnung von Quote- in Kontowährung. Quantity wird immer
auf den zulässigen Step **abgerundet**, damit das Risikolimit nicht überschritten
wird. Unterhalb der Mindestgröße ist das Ergebnis null statt einer unzulässigen
Ordergröße.

Presets existieren für wichtige Fiat-Futures und Micros, Gold, Silber, Kupfer,
Platin, Palladium, Micro Bitcoin und Micro Ether sowie Forex-Standardlots,
Edelmetall-CFDs und bekannte Kryptos. Broker-Spezifikationen können abweichen;
Contract Size, Tick Size, Tick Value, FX-Umrechnung und Step müssen deshalb
editierbar und transparent bleiben.

## 17. Tests und Qualitätsgates

Arbeite in:

```powershell
cd D:\Macrotool\apps\desktop
```

Einmalige Installation:

```powershell
pnpm install --frozen-lockfile
```

Schnelle Frontend-Prüfung:

```powershell
pnpm typecheck
pnpm test
pnpm lint
pnpm format:check
pnpm build
```

Rust-/SQLite-Prüfung:

```powershell
cd D:\Macrotool\apps\desktop\src-tauri
cargo fmt --all -- --check
cargo test
cargo clippy --all-targets -- -D warnings
```

Realer App-Start:

```powershell
cd D:\Macrotool\apps\desktop
pnpm tauri dev
```

Browser-Vorschau:

```powershell
pnpm dev
```

Windows-Build:

```powershell
pnpm tauri build
```

Wenn die bisherige Release-Datei noch geöffnet ist, kann ein separater regulärer
Windows-Build ohne Installationspaket verwendet werden:

```powershell
pnpm exec tauri build --target x86_64-pc-windows-msvc --no-bundle
```

`START-MACROTOOL.cmd` wählt die neuere vorhandene Datei aus `target/release`
und `target/x86_64-pc-windows-msvc/release`. Neuere Quelldateien lösen weiterhin
einen normalen Build aus; anschließend wird dessen Standard-Release gestartet.
Die Prüfung umfasst auch `src-tauri/connectors`, da diese Python-Dateien in
den nativen Build eingebettet werden.

Der Browser-Modus reicht nicht als Abnahme für Datenbank, Backup, EODHD-Sync,
Medien oder Restore. Nach Änderungen an diesen Bereichen muss die
Tauri-App real gestartet werden und ohne neue Warnungen initialisieren.

### Testpflicht nach Änderungsart

- UI-only: Typecheck, relevante Vitest-Tests, Build
- Browser-Fallback: Vitest plus Abgleich mit nativer Semantik
- Rust-Command/Repository: relevante Unit-/Repository-Tests und Clippy
- Migration: Start mit leerer und bestehender Testdatenbank
- Scoring: deterministische Vektoren und Antisymmetrie
- EODHD-Fundamentals: Pagination, Mapping, Deduplizierung, Release-Retries und fehlende Werte
- Backup/Restore: Erstellung, Manifest, Hash, Preview und sichere Staging-Reihenfolge
- Positionsgröße: Forex, Futures, Metall, Krypto, FX-Konvertierung und Rundung

## 18. Lokales Starten und typische Fehler

Die einfachste Startmöglichkeit ist:

```text
D:\Macrotool\START-MACROTOOL.cmd
```

Typische Ursachen:

- `localhost refused to connect`: Vite läuft nicht oder Port 5173 ist belegt.
- `strictPort`-Fehler: einen alten Vite-/Tauri-Prozess gezielt beenden, nicht
  wahllos alle Node-Prozesse.
- langsamer erster Start: Rust kompiliert Tauri/WebView/SQLite am neuen Ort.
- Browser kann Datei/Backup nicht: Browser-Vorschau statt Tauri gestartet.
- Fundamentals ohne Werte: API-Konfiguration, Mapping, Release, Forecast und Actual
  einzeln prüfen; nicht mit Mockdaten verdecken.
- alte Dokumentation zeigt `%APPDATA%\PersonalMacro`: der reale aktuelle Pfad
  enthält den Tauri-Identifier `com.personal-macro.app`.

## 19. Sicherheits- und Datenschutzregeln

1. `.env.local`, Datenbanken, Backups, Exporte, Imports und persönliche Medien
   niemals committen.
2. Keine Secrets in Screenshots, Testfixtures, Logs, Git-Diffs oder Antworten.
3. `.gitignore` nicht so ändern, dass lokale Daten plötzlich versioniert werden.
4. Externe URLs und Importpfade validieren; keine beliebigen Dateipfade aus
   untrusted Input öffnen.
5. HTML aus Rich-Text-Inhalten vor unsicherer Darstellung bereinigen.
6. Native Medienzugriffe bleiben auf den Tauri-Asset-Scope beschränkt. Im privaten
   Webmodus erfolgt der Bildzugriff ausschließlich über den geschützten Medien-
   Endpunkt; keine lokalen Pfade, Blobtokens oder freien Blob-URLs an den Browser.
7. Import/Restore niemals direkt über die aktive Datenbank schreiben, bevor
   Validierung und Sicherheitskopie abgeschlossen sind.
8. Keine rekursiven Löschoperationen gegen Projektroot oder AppData.
9. User-Daten nicht zur Entwicklung leeren oder durch Demos ersetzen.
10. Netzwerkfehler dürfen die lokale Journal-Funktion nicht blockieren.

## 20. Dokumentationsindex

Nützliche Vertiefungen:

- `docs/planning/scoring-model-v1.md` – fachliche Score-Vorgaben
- `docs/planning/policy-rate-model-v1.md` – Zins- und USD-Relativmodell
- `docs/planning/journal-metrics-and-heatmap-v1.md` – Kennzahlen und Heatmaps
- `docs/planning/aud-china-cpi-regime-v1.md` – China-CPI-/AUD-Regimemodell
- `docs/planning/forecast-acquisition-policy.md` – Forecast-Beschaffung
- `docs/planning/free-data-strategy.md` – kostenlose Datenquellenstrategie
- `docs/audit/calculation-audit.md` – Audit früherer Formeln
- `docs/audit/data-source-audit.md` – Quellen- und Qualitätsmatrix
- `docs/planning/trading-journal-ui-reference-analysis.md` – UI-Referenz
- `docs/planning/trading-journal-tauri-implementation-plan.md` – historischer
  Implementierungsplan

Vorsicht:

- `docs/architecture/database-schema.md` ist ein früheres umfassendes Zielmodell,
  nicht das aktuelle SQLite-Schema.
- `docs/architecture/target-architecture.md` enthält eine größere frühere
  Zielarchitektur, nicht ausschließlich den implementierten Tauri-Stand.
- `docs/planning/implementation-roadmap.md` ist keine automatische Aussage über
  den Fertigstellungsstatus.

## 21. Empfohlener Arbeitsablauf für einen neuen Agenten

### Orientierung

1. Lies `AGENTS.md` und `README.md`.
2. Prüfe `git status`; vorhandene Änderungen gehören möglicherweise dem
   Benutzer und dürfen nicht überschrieben werden.
3. Lies die betroffene Feature-Seite und `services/commands.ts`.
4. Verfolge den nativen Command aus `lib.rs` in `commands`, `repositories` oder
   `metrics`.
5. Prüfe die betroffenen Migrationen und TypeScript-Datenverträge.
6. Lies nur die für die Aufgabe relevanten Detaildokumente unter `docs/`.

### Implementierung

1. Formuliere die fachliche Invariante vor der Codeänderung.
2. Ändere die kleinste sinnvolle Schicht, ohne Logik in UI und Backend doppelt
   auseinanderlaufen zu lassen.
3. Ergänze Tests zusammen mit der Änderung.
4. Behalte Browser-Fallback und Tauri-Modus bewusst im Blick.
5. Bei persistenten Änderungen neue Migration statt manueller DB-Anpassung.
6. Bei Mutationen Cache-Invalidierung und Empty/Error/Loading States ergänzen.
7. Dokumentiere neue Umgebungsvariablen leer in `.env.example`.

### Abschluss

1. Formatiere geänderte Dateien.
2. Führe risikoadäquate Frontend- und Rust-Checks aus.
3. Starte bei nativen Änderungen die echte Desktop-App.
4. Prüfe Logs auf neue Warnungen.
5. Prüfe `git diff` auf Secrets, generierte Dateien und unbeabsichtigte Änderungen.
6. Berichte konkret: geänderte Funktion, Tests, bekannte Einschränkungen und
   Startweg.

## 22. Definition of Done

Eine Aufgabe ist erst fertig, wenn:

- die Benutzeranforderung fachlich vollständig umgesetzt ist,
- bestehende Daten und Migrationen sicher bleiben,
- Tauri- und Browserverhalten bewusst behandelt wurden,
- keine Mockdaten als Live-Daten ausgegeben werden,
- fehlende Werte nicht als neutral umgedeutet werden,
- Scoring-/Metrikänderungen durch deterministische Tests geschützt sind,
- UI Loading, Empty, Error und Success nachvollziehbar darstellt,
- Query Caches nach Mutationen korrekt aktualisieren,
- relevante TypeScript-, Vitest-, Rust- und Build-Prüfungen bestehen,
- die reale App bei nativen Änderungen ohne neue Initialisierungswarnung startet,
- keine Secrets oder persönlichen Daten im Diff stehen,
- Dokumentation und `.env.example` bei neuen Verträgen aktualisiert sind.

## 23. Bekannte technische Hinweise

- Der Frontend-Produktionsbuild meldet derzeit große Chunks für ECharts,
  Dokumentexporte und XLSX. Das ist eine Optimierungsmöglichkeit, aber kein
  Funktionsfehler. Neue große Imports bevorzugt lazy laden.
- Browser- und Rust-Metrikimplementierungen sind bewusst parallel vorhanden.
  Diese Duplizierung ist ein Drift-Risiko und muss durch gemeinsame Testvektoren
  kontrolliert werden.
- Provider-Title-Mapping ist regelbasiert. Neue länderspezifische Bezeichnungen
  brauchen explizite Klassifikation und Tests.
- Forecasts sind nicht flächendeckend über offizielle Primärquellen verfügbar.
  Drittanbieter sind erlaubt, Herkunft und Aktualität müssen aber sichtbar
  bleiben.
- Der native Scheduler lebt weiterhin im Desktop-Prozess und arbeitet nur bei
  laufender App. Die getrennten privaten Cloudjobs für EODHD, COT und Myfxbook
  sind in `docs/planning/cloud-provider-automation.md` beschrieben. Ihre
  Produktionsabnahme ist nachgewiesen; die persönliche Myfxbook-Aktivierung
  erfolgt getrennt durch den Besitzer;
  Cloud- und Desktop-Datenbanken synchronisieren sich nicht automatisch.

Wenn eine Anforderung eine dieser fachlichen Invarianten verändern würde, stoppe
nicht automatisch die Arbeit, aber benenne die Auswirkung ausdrücklich und hole
bei einer materiellen Produktentscheidung die Entscheidung des Benutzers ein.
