# Private Marktdaten im Browser

Stand: 25.09.2026. **Die Analyseerweiterung ist privat bereitgestellt und ihre
Manifestgeneration aktiviert; alle 22 Live-Analyse-Leseprüfungen bestehen.
Auch die Prüfung der tatsächlich bereitgestellten mobilen Navigation und
Oberfläche besteht; der frühere Navigationsfehler ist behoben.** Bereits
zuvor abgenommen sind das Journal, private Medien, neun Leitzinsreihen und 214 interaktive
Seasonality-Profile. Der geschützte Einstieg bleibt
[Personal Macro](https://personal-macro-nudel96s-projects.vercel.app).

Der aktuell aktive Korrekturbuild für den iPhone-Einstieg ist
`dpl_FJHF6sZthr7w9GiyA4USpDvSnGnp`. Er beseitigt wiederholtes Verarbeiten
unveränderlicher Atlaskataloge, ohne Datenvalidierungen zu reduzieren.
Die erneute Live-Abnahme aller 22 Analyselesepfade und der mobilen WebKit-
Oberfläche besteht; erster Sitzungsaufbau 4,4 Sekunden, folgender Browseraufruf
0,18 Sekunden. Die Aq-Nachweise unten beschreiben den vorherigen Analyse-Rollout.
[Korrektur und aktuelle Nachweise](../audit/private-web-iphone-startup.md).

Der neue Stand ergänzt Macro-Heatmap, COT, Wirtschaftsdaten und
Wirtschaftskalender, technische Signale, Regime Insights, Weltatlas,
Staatsanleihen, Zentralbankberichte sowie ausdrücklich gestartete saisonale
Screener und Fenstersuchen. Atlasnotizen und persönliche Berichtslesemarker
haben getrennte PostgreSQL-Schreibpfade. Bereitstellung und Aktivierung sind
bestätigt. Die API-Lesepfade und der korrigierte mobile Navigations-/Layoutstand
sind live geprüft. Persönliche Schreibpfade sind auf isoliertem PostgreSQL
getestet; die Besitzerbedienung auf einem physischen iPhone mit Safari bleibt offen.

## Freigabestand

Die **46 Pflicht-Capabilities für Journal und Medien bleiben unverändert**.
Alle Analysebereiche stehen in der optionalen Routenfreigabe; fehlende Pakete
oder unvollständige Fach-Capabilities sperren das Journal nicht. Eine optionale
Route öffnet erst mit ihrem vollständigen erforderlichen Command-Satz. Der
private Browser fällt niemals auf Demodaten zurück.

| Bereich | Umgesetzte Bedienung im privaten Webmodus | Freigabestand |
| --- | --- | --- |
| Journal und Medien | Persönliche Datenerfassung und Bearbeitung, private Originalbilder | Bestehende Grundlage bereitgestellt; Besitzerbedienung am iPhone offen |
| Leitzinsen | Neun Reihen, datierte Abdeckung und native relative USD-Bewertung | Bestehende Grundlage bereitgestellt |
| Seasonality-Einzelanalyse | 214 Profile, Jahre, Zyklen, Endziffern und Analysefenster auswählbar | Bestehende Grundlage bereitgestellt |
| Macro-Heatmap und technische Signale | Native Currency-/Paaransichten aus zusammengehörigen Fundamentals-, COT- und OHLC-Paketen | Bereitgestellt; Live-Lesen und mobile UI-Stichprobe bestehen |
| COT Insights | Dashboard und Kontraktdetails mit nativer Bewertung und wählbarer Historie | Bereitgestellt; Live-Lesen und mobile UI-Stichprobe bestehen |
| Wirtschaftsdaten und Kalender | Indikatorhistorien und datierte Ereignisse mit Actual/Forecast/Previous | Bereitgestellt; Live-Lesen und mobile UI-Stichprobe bestehen |
| Regime Insights | Bestehende China-CPI-/AUDUSD-Auswertung, D1-/W1-Auswahl | Bereitgestellt; Live-Lesen und Menülink geprüft; Seite im mobilen Live-Test nicht geöffnet |
| Weltatlas | Angebundene Länder-/Themenreihen, Vergleiche, Quellen, Markt-/Bewertungs- und Länderprofile über native Reader | Bereitgestellt; ausgewählte Live-Lesepfade und Menülink geprüft; Seite im mobilen Live-Test nicht geöffnet; fehlende Quellprofile bleiben fehlend |
| Atlasnotizbuch | Anlegen, Lesen, Bearbeiten, Favorisieren, Papierkorb und letzte Ansicht in PostgreSQL | Bereitgestellt; Lese-/Schreibpfade auf isoliertem PostgreSQL geprüft, im Live-Test nicht bedient; keine Notizen in Marktdateien |
| Staatsanleihen | Katalog, Historien, Kurven und Länderabstände bei passendem Tag und Tenor | Bereitgestellt; Live-Lesen und mobile UI-Stichprobe bestehen |
| Zentralbankberichte | Übersicht, vorhandener Berichtstext und vorhandene Zusammenfassung; persönlicher Lesemarker in PostgreSQL | Bereitgestellt; Live-Lesen und mobile UI-Stichprobe bestehen |
| Seasonality-Screener und Fenstersuche | Expliziter Start, generationstreue Batches, Fortschritt, Abbruch weiterer Schritte und globale Ergebnissortierung | Bereitgestellt; Live-Batch-Lesen geprüft, Scan-Bedienung im mobilen Live-Test nicht ausgeführt; echte FX-Futures weiterhin ohne Datenanbindung |

Analysefunktionen und Betriebsfunktionen haben unterschiedliche Freigaben:

| Betriebsfunktion | Stand und Grenze |
| --- | --- |
| Automatische oder manuelle Provider-Aktualisierung in der Cloud | Nicht implementiert; kein Cloud-Scheduler oder vorgetäuschter laufender Desktop-Job |
| Erneuter Datenstand aus geprüften Exporten | Expliziter Export, geprüfter privater Upload und atomare Manifestveröffentlichung; keine laufende Synchronisierung |
| Brokeranbindungen und Konto-/Historienimporte | Nicht in die Cloud portiert; keine Orderausführung |
| Native Dateiimporte und allgemeine Datei-/Datensicherungsexporte | Durch die neuen Analysereader nicht freigegeben |
| Backup und Restore | Kein Cloud-Bedienablauf implementiert; lokale Desktop-Funktionen bleiben getrennt |
| Neue Berichtserfassung, Textextraktion oder KI-Zusammenfassung | Keine Cloud-Automatik implementiert; die Leseansicht nutzt vorhandene geprüfte Inhalte |
| Automatische Desktop-/Cloud-Synchronisierung | Nicht implementiert; keine vollständige Desktop-Parität behaupten |

## Datenstände und Prüfnachweise

### Bereits aktivierte Grundlage

Der vorherige abgeschlossene Desktop-Snapshot wurde ausschließlich lesend
ausgewertet. Alle 214 EODHD-Symbole sind in 216 neuen SQLite-Paketen enthalten,
einschließlich Katalog und Leitzinsen: 1.690.660 öffentliche Zeilen,
142.450.688 unkomprimierte Byte und 34.170.392 Byte Gzip-Transport. Alle Objekte
wurden privat hochgeladen, erneut gelesen und bytegenau bestätigt. Migration
0004 und die initiale Veröffentlichung sind abgeschlossen; Journalrevision und
persönliche Daten wurden dadurch nicht verändert.

Der echte signierte Gateway-/Rust-/Neon-/Blob-Test lieferte neun Zinsreihen und
214 Profile. Vier Analysen mit den längsten Historien aus Forex, Indizes,
Kryptowährungen und Commodities bestanden; maximal 8.047 ms im lokalen
Debug-Build einschließlich Cloudabruf. Das ist kein Vercel-Laufzeitbenchmark.
Der korrigierte Gateway-Service und die Einzelanalyse sind am geschützten Host
geprüft; Details stehen unter
[Privater Handyzugriff](private-mobile-web.md#korrektur-und-live-abnahme-vom-25092026).

### Neue geprüfte und privat übertragene Gesamtgeneration

Der neue Export umfasst **555 Pakete**, **1.000.374.272 Rohbytes** und
**141.744.234 Gzip-Bytes**. Alle 555 Pakete wurden privat hochgeladen und durch
erneuten Abruf bytegenau bestätigt. Die gesamte Blob-Belegung einschließlich der
bisherigen Generation und der vier vorhandenen Originalbilder beträgt
**176.407.066 Byte**. Die Generation
`9aa3d4e2-1c44-4852-bc16-cf400fd72d3e` ist nach erfolgreicher
Compare-and-Swap-Veröffentlichung aktiviert: `published: true`, 555 Artefakte
und 141.744.234 Transportbytes.
Vollständige Dateien liegen außerhalb des Repositorys und gehören niemals
in einen Programm-Upload.

Der abgeschlossene Prüfstand der Erweiterung umfasst:

- **66 Rust-Cloudtests**, einschließlich der ausdrücklich isolierten
  PostgreSQL-Prüfungen und der Manifestregression mit mehr als 512 Artefakten.
- **20 COT- und 18 Macrotests bestanden**; ein weiterer Test blieb ausdrücklich
  ignoriert. Die dokumentierte native Methodik für fehlende Paarseiten bleibt
  unverändert.
- **161 Frontendtests in 26 Dateien** und ein erfolgreicher privater
  Produktionsbuild.
- **38 Gateway-/Service-Tests** einschließlich der getrennten Anfrage- und
  Antwortgrößen. Der zuvor dokumentierte Node-Lauf mit Uploader-/Schemaprüfungen
  bestand mit 110 erfolgreichen Tests und einem Skip. Diese Läufe sind nicht
  zu einer vermeintlich überschneidungsfreien Gesamtsumme zu addieren.
- Native- und Cloud-Clippy sowie ein echter Windows-Debug-Build bestanden.
  Der Start des Prozesses und Fensters „Personal Macro“ ist nachgewiesen.
  Das native Frontend war nicht über CDP prüfbar; eine vollständige native
  UI-Abnahme ist damit nicht belegt.

`src-tauri/examples/verify_analysis_shards.rs` prüft ausdrücklich angegebene
externe Exporte ohne Cloudzugriff: begrenzte lokale Gzip-Kompression,
produktiver Loader, Hash-/Schema-/Identitätsprüfung und native Reader pro
Paketfamilie. **Alle 555 Pakete wurden mit dem echten Loader und nativen Readern
geprüft.** Macro-Commands, Atlasprofile, Bonds-Übersicht und
Deutschland-USA-Vergleich, Berichtsübersicht und Detail sowie Seasonality-Index,
Symbol-Details und eine Analyse werden geprüft. Die Ausgabe enthält nur
Metadaten; Einzelantworten über 4 MiB oder Berechnungen über 50 Sekunden sind
Fehler. Als einzige Antwort überschritt `atlas:valuation:countries` mit
2.112.267 Byte die bisherige Antwortgrenze von 2 MiB. Für Antworten gilt nun
eine separate Grenze von 4 MiB; die Anfragegrenze bleibt 2 MiB. Genau dieses
unveränderte Paket wurde anschließend erneut erfolgreich geprüft. Es wurden
keine Daten zur Einhaltung der Grenze gekürzt. Paketprüfung und Uploadnachweis
ersetzen weiterhin keine Livebedienung.

Die PostgreSQL-Migrationen 0005 und 0006 wurden nach Prüfung der
Workspace-Identität angewendet. Deployment `dpl_AqHBFCN5aPmYKpv5EePWhjQHeuWh`
ist `READY`, `public: false`, Region `fra1`, mit allen drei Services für
Weboberfläche, Node-Gateway und Rust-Backend. Der stabile Projektalias zeigt
auf `personal-macro-i1ktdtp9e-nudel96s-projects.vercel.app`; die neue Generation
ist dort aktiviert. Alleinige Besitzeridentität und SSO-Konfiguration sind
erneut bestätigt.

### Live-Lesetest und mobile Oberfläche bestanden

Der Lauf vom 25.09.2026, 13:36–13:44 UTC, bestand **alle 22 Analyse-Leseprüfungen**.
Dazu gehören die große Atlas-Antwort mit 2.112.285 Byte, ein Screener-Batch
mit fünf Instrumenten und die Fenstersuche in zwei Schritten mit fünf und zwei
Instrumenten. Die gemessenen Scan-Schritte benötigten etwa 16–18 Sekunden.
Die 2.112.285 Byte sind die Liveantwort; die oben genannten 2.112.267 Byte
bezeichnen den zuvor lokal geprüften Reader-Inhalt.

Der erste Bericht meldete dennoch **`ok: false`**, weil die Oberfläche die
Marktkontext-Navigation im privaten Webmodus ausblendete. Der Befund liegt in
`apps/desktop/.vercel/live-owner-service-report.json`. Er ist kein Hinweis auf
fehlgeschlagene Analysereader, verhinderte damals aber die mobile Freigabe.
Die Navigation wird im korrigierten Codestand nach verfügbaren Capabilities
gefiltert; 16 Tests bestehen. Zwei Macro-Layoutkorrekturen sind mit lokalen
Fixtures bei 320, 390, 768 und 1440 px geprüft.

Der vorgeschaltete Test einer lokal kompilierten Oberfläche mit dem echten
Backend bestand (`apps/desktop/.vercel/live-owner-local-ui-report.json`):
sechs Analyseseiten, Übersicht und Trades bei 390 px ohne Seitenüberlauf,
zehn sichtbare Navigationslinks, keine Laufzeit-/API-Fehler und unveränderte
Revision. Dieser lokale UI-Lauf war noch kein Nachweis des deployten Frontends.

Der Korrekturbuild `dpl_AqHBFCN5aPmYKpv5EePWhjQHeuWh` ist inzwischen `READY`,
`public: false`, in `fra1` mit Web-, Gateway- und Backend-Service. Der stabile
Alias zeigt auf `personal-macro-i1ktdtp9e-nudel96s-projects.vercel.app`.
**Der anschließende Test genau dieser bereitgestellten Oberfläche besteht.**
`apps/desktop/.vercel/live-owner-mobile-report.json` dokumentiert den Abschluss
am `2026-09-25T14:15:31.548Z` mit `ok: true`, `validationSucceeded: true`,
`cleanupVerified: true`, `deployedUI: true` und `compiledLocalUI: false`.
Sechs Analyseseiten sowie Übersicht und Trades bestanden bei 390 px ohne
Seitenüberlauf; zehn Navigationslinks waren sichtbar. Es gab keine Laufzeit-
oder API-Fehler und keine blockierten Schreibversuche; die Journalrevision
blieb unverändert. Der frühere Navigationsfehler ist behoben und live nachgeprüft.

Der Liveprüflauf führte keine persönlichen Schreibbefehle aus
(`personalWritesPerformed: false`). Persönliche Schreibpfade wurden auf
isoliertem PostgreSQL geprüft; daraus wird keine Schreibabnahme am persönlichen
Livebestand abgeleitet. Der temporäre Testzugang wurde entfernt
(`cleanup: true` im ersten Lauf, `cleanupVerified: true` im Abschlusslauf).
Besitzeridentität und SSO-Schutz für alle Deployments blieben unverändert.
Genau der temporäre Testschlüssel wurde widerrufen; anonyme und widerrufene
Testanfragen lieferten HTTP 401.

## Datenpfade und fachliche Grenzen

Öffentliche Marktbestände entstehen als **neue SQLite-Dateien mit geprüfter
Minimalstruktur und expliziten Spaltenlisten**. Niemals eine persönliche
Datenbank kopieren und daraus Tabellen löschen: freie Seiten können frühere
Inhalte behalten. Exporter lesen ausdrücklich angegebene abgeschlossene
Sicherungen. Journalzeilen, Zugangsdaten, freie Dateipfade, Atlasnotizen und
Lesemarker gehören nicht in Marktpakete.

Pfade in der folgenden Tabelle sind relativ zu `apps/desktop`.

| Codepfad | Aufgabe und Abgrenzung |
| --- | --- |
| `server/migration/export-public-shards.mjs` | Bestehende Rates-/Seasonality-Minimalpakete; alte Dukascopy-Daten sind kein Fallback |
| `server/migration/export-macro-shards.mjs` | Zusammengehörige Macro-/COT-/Technicals-/Regime-Quellen mit freigegebenen Spalten; keine Brokerpreisverknüpfungen |
| Atlas-/Berichts-Exporter und `server/migration/domain-shard-contract.mjs` | Öffentliche Pakete mit Herkunft, exakten Tabellen und fachlicher Identität |
| `src-tauri/src/cloud_public/cache.rs` und `schema.rs` | Roh-/Transporthash, Größen, exakte STRICT-Schemas, Zeilenlimits und Identitäten; unveränderliche query-only SQLite-Pools |
| `src-tauri/src/cloud_public/macro_readers.rs` | Native Fundamentals, Historien, Kalender, COT und technische/regimebezogene Berechnungen ohne Seeds, Persistierung oder Providerjobs |
| `src-tauri/src/cloud_public/atlas_readers.rs` | Native Atlas- und Bonds-Reader auf dem gelieferten Pool; kein schreibender Cachekonstruktor oder Job-Recovery |
| `src-tauri/src/cloud_public/report_readers.rs` | Vorhandene öffentliche Berichtsinhalte mit geprüfter offizieller Quelle; keine lokalen Dateipfade oder übernommenen persönlichen Lesemarker |
| `src-tauri/src/cloud_public/seasonality_extended.rs` und `cloud_server/market_batches.rs` | Begrenzte Scans mit nativer Berechnung und gemeinsamer Generation |
| `src-tauri/src/cloud_postgres/atlas.rs` und Berichtslesemarker | Persönliche Mutationen innerhalb der bestehenden Revision-/Vorgangsbeleg-Transaktion |

AppState-basierte Reader erhalten ausschließlich den gelieferten Pool und
ungenutzte temporäre Pfade. Sie starten keine Journalmigration, Seeds oder
Backups. `database::initialize_at`, `AtlasService::db` und
`GovernmentBondsState::db` sind keine Konstruktoren für unveränderliche Pakete.
Datum, Quelle, Stichprobengröße, Nullwerte, Abdeckung und
`unsupported_area`/`empty`/`not_downloaded` bleiben nachvollziehbar. Fehlende
persönliche COT-Brokerpreisverknüpfungen erzeugen keine historischen Outcomes.

Die Macro-Leselogik prüft die Frische vor der aktuellen Aggregation und erhält
Actual, Forecast, Previous, Quelle und ursprünglichen Snapshotzeitpunkt.
Ein bereits bestehender fachlicher Widerspruch bleibt ausdrücklich dokumentiert:
AGENTS.md verlangt gemeinsame verfügbare Paarseiten; der native Paarvertrag
rechnet fehlende Seiten jedoch numerisch als null und summiert auch Komponenten
mit `available=false`. Der Cloudrollout verändert diese Methodik nicht
stillschweigend. Der Befund und die tatsächlichen Testvektoren stehen in
[Macro-Frischeprüfung](../audit/cloud-macro-freshness-review.md).

## Explizite saisonale Scans

Das Öffnen der Seite startet keinen vollständigen Screener oder Chancenscan.
Jeder ausdrücklich gestartete Schritt pinnt dieselbe Generation, verarbeitet
höchstens fünf Instrumente und liefert einen geprüften Fortschrittscursor.
Für Währungsdivergenzen liest der erste Schritt zusätzlich sieben gemeinsame
USD-Spotreihen; das Batchlimit begrenzt diesen ersten Schritt deshalb nicht
auf fünf Downloads.

Ein globaler Semaphore begrenzt umfangreiche Scans pro Serverinstanz auf zwei.
Der Permit wird vor dem Laden erworben und bleibt in der Blocking-Berechnung
bis zu deren tatsächlichem Ende erhalten, auch wenn die wartende Anfrage
abbricht. Die Gesamtfrist eines Batches beträgt 75 Sekunden, die numerische
Teilfrist 50 Sekunden. Das garantiert noch keine ausreichende
Livegeschwindigkeit des ersten Divergenzschritts.

Der Browser verarbeitet Batches sequenziell und zeigt globale Ergebnisse erst
nach vollständigem Durchlauf. Generation, Gesamtzahl und monotone Cursor werden
geprüft; Wechsel und Abbruch verwerfen den unvollständigen Lauf. Die globale
Zusammenführung erhält native Rangfolge und Überlappungsregel. Ein Abbruch
verhindert weitere Schritte; bereits laufende synchrone Berechnungen werden
dadurch nicht unmittelbar beendet. Echte FX-Futures bleiben ohne angebundene
Futures-Historie ausdrücklich nicht verfügbar.

## Manifest, Transport und Ressourcen

Manifest v1 enthält `schemaVersion`, UUID `generation`, UTC `createdAt` und
`artifacts`. Artefakte tragen `kind`, fachlichen `key`, Rohhash `sha256`,
`sizeBytes`, `rows`, `fileName=<sha256>.sqlite`, `format=sqlite` und
`schemaVersion=1`. Zulässige Arten: `rates`, `seasonality-index`,
`seasonality-symbol`, `macro`, `cot`, `technicals`, `regime`, `atlas`, `bonds`
und `central-bank-reports`. Katalogumfang und tatsächlich vorhandene
Artefaktabdeckung bleiben getrennte Angaben.

PostgreSQL speichert unveränderliche Generationen, Transportnachweise und einen
aktiven Pointer. Migration 0006 erweitert die Artefaktarten; persönliche
Berichtslesemarker bleiben separat. Erst nach geprüftem Upload wird der Pointer
atomar gegen die erwartete vorherige Generation getauscht. Die Journalrevision
ändert sich dadurch nicht. `load_active` bindet `MAX_MANIFEST_ARTIFACTS + 1` als
SQL-Limit und lehnt zusätzliche Transportzeilen ab, statt sie abzuschneiden.

| Grenze | Aktueller Vertrag |
| --- | ---: |
| Artefakte pro Generation | 1.024 |
| Gesamte unkomprimierte Generation | 2 GiB |
| Gesamter Gzip-Transport pro Generation | 500 MiB |
| Manifest / Publikationsdeskriptor | 1 MiB / 2 MiB |
| Ein Gzip-Transport / eine entpackte SQLite-Datei | 32 MiB / 128 MiB |
| Gleichzeitige temporäre Lese-Leases pro Instanz | 2 |
| Gleichzeitige Paketdateien einschließlich Transport | höchstens 320 MiB |
| SQLite-Verbindungen pro Paket | 1 |
| JSON-Anfrage / JSON-Antwort am Server und Gateway | 2 MiB / 4 MiB einschließlich Antwortumschlag |

Die Summe der Remote-Pakete ist keine lokale Speicherbelegung. Einzelne
Exporter besitzen zusätzliche engere Gruppenlimits; diese ersetzen nicht das
Generationenlimit. Es gibt keinen unbegrenzten zusätzlichen Dateicache.
Der Browser begrenzt parallele Marktanfragen auf zwei und verwirft wartende
Aufrufe aus einer inzwischen abgelösten Sitzung.

Ein Lease hält Dateien bis zum tatsächlichen Schließen des Pools. Fehler und
Abbruch räumen ausschließlich eigene zufällige Unterverzeichnisse auf. Bei
fehlgeschlagener Bereinigung bleibt die Kapazität bis zum Neustart gesperrt.
Die einmalige Startbereinigung akzeptiert nur geprüfte `request-<UUIDv4>`-
Verzeichnisse mit `download` und `data.sqlite`; fremde Inhalte, Symlinks oder
Windows-Junctions verhindern den Start. Der Cache wird nicht zwischen
Serverprozessen geteilt.

Objektpfade stammen ausschließlich aus dem vertrauenswürdigen Manifest,
nicht aus freien Browser-URLs. Der private Blob-Leser nutzt serverseitige
Zugangsdaten, verbietet Redirects und prüft beide Hashes und Größen auch ohne
verlässlichen Content-Length. `cache=0` vermeidet negative CDN-Einträge nach
neuen Uploads. Manifest und Journalrevision werden in einer kurzen
PostgreSQL-Transaktion gelesen; Downloads und Berechnungen laufen danach
ohne Journal-Schreibsperre.

Die Arbeitsvorgaben bleiben 1 GB Blob, ungefähr 500 MB temporärer Speicher,
2 GB RAM und höchstens 10 EUR monatlich. Das sind Entwurfsgrenzen, keine neue
Tarifprüfung oder Kostengarantie. Marketplace-Kosten werden von Vercels
Ausgabenlimit nicht vollständig erfasst. Vor Freigabe sind tatsächlicher
Speicher einschließlich alter Generation und Medien, Laufzeit und Transfer
zu prüfen. Persönliche Dateien dürfen nicht für Cacheplatz gelöscht werden.
Dauerhaft koordinierte Providerjobs und prozessübergreifende Quoten sind
noch nicht implementiert.

## Abschlussumfang und verbleibende Geräteprüfung

Paketlauf, Regressionen, privater Upload mit erneutem Bytevergleich,
identitätsgeprüfte Migrationen, atomare Manifestveröffentlichung und der echte
finale Vercel-Build aller drei Services sind abgeschlossen. Alle 22
Live-Analyse-Leseprüfungen bestehen. Der zunächst gefundene Navigationsfehler
und die mobilen Macro-Layouts sind korrigiert; der finale Build, Aliaswechsel
und erneute Live-UI-Nachweis sind bestätigt. Die Freigabe umfasst die
Analyselesepfade und die geprüfte mobile Navigation/Oberfläche. Persönliche
Schreibfunktionen sind durch isolierte PostgreSQL-Tests abgedeckt; persönliche
Live-Schreibvorgänge waren nicht Bestandteil der Prüfung. Das ist keine
vollständige Desktop-Parität und keine Abnahme sämtlicher möglicher Filterkombinationen.

Der Zugriffsschutz bleibt Voraussetzung für jede Route, jedes Deployment und
jeden Datenendpunkt: ausschließlich die Besitzeridentität, unveränderte SSO-
Grenze, blockierte anonyme Zugriffe und kein dauerhafter Testzugang. Die
Browserprüfung bei 390 px besteht. Die tatsächliche Bedienung mit der
Besitzeranmeldung auf einem physischen iPhone mit Safari bleibt separat offen.
