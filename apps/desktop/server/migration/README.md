# Vorbereitung einer privaten Datenübernahme

`inventory.py` ist eine lokale, providerunabhängige Bestandsprüfung. Sie richtet
keine Cloudressource ein, exportiert keine Datensätze und führt keine Migration
auf einer Benutzer-Datenbank aus. Die Inventur allein bestätigt weder eine
Cloudübernahme noch eine spätere Synchronisierung.

Ohne Datenbankargument baut das Skript aus den SQL-Migrationen im Repository
eine temporäre SQLite-Datenbank im Arbeitsspeicher. Es gibt die vertrauenswürdigen
Tabellendefinitionen, Spalten, Indizes, Fremdschlüssel und SHA-256-Prüfsummen aus.
Desktop-Start, AppData, Provider und persönliche Dateien werden nicht geöffnet.

```powershell
python apps/desktop/server/migration/inventory.py
python apps/desktop/server/migration/inventory.py --family atlas
python apps/desktop/server/migration/inventory.py --family bonds
python -m unittest discover -s apps/desktop/server/migration -p 'test_*.py' -v
```

Der geprüfte Quellstand hat 49 Hauptmigrationen und 89 Haupttabellen, 44 separate
Atlas-Cachetabellen und vier Bond-Cachetabellen. Die 39 bisherigen HTTP-Commands
benötigen 23 Tabellen direkt. Ihre Fremdschlüssel ergänzen `checklist_templates`
und `checklist_template_items`: 25 Kerntabellen. Medien ergänzen drei und
persönliche Atlasansichten zwei Tabellen. Die Kandidatenmenge umfasst **30**
Tabellen; sie ist eine Arbeitsaufteilung und keine Freigabe zum Weglassen der
übrigen persönlichen Daten.

## Explizite Datenbankprüfung

Ein später ausdrücklich übergebener, konsistenter SQLite-Snapshot kann geprüft
werden. Verwende eine geschlossene, selbstständige Sicherung, die SQLite mit
seinem Backupverfahren oder `VACUUM INTO` erzeugt hat. Eine laufende WAL-Datei
einfach zu kopieren ergibt keine sichere Sicherung. Dieses Skript erzeugt keine.

```powershell
python apps/desktop/server/migration/inventory.py --snapshot 'D:/Sicherungen/journal-snapshot.sqlite'
```

Der Standardmodus öffnet ausschließlich den angegebenen Pfad mit `mode=ro` und
`immutable=1`. Er verweigert Dateien im bekannten produktiven AppData-Verzeichnis
und Dateien mit `-wal`, `-shm` oder `-journal` daneben. Dateiänderungen während der
Prüfung führen zum Abbruch. Ein immutable Snapshot muss während der gesamten
Prüfung unverändert bleiben; der Vergleich von Größe und Änderungszeit ersetzt
keine Betriebssystem-Sperre oder sichere Snapshot-Erstellung.

Für eine ausdrücklich autorisierte Bestandsmessung ohne Kopie gibt es separat:

```powershell
python apps/desktop/server/migration/inventory.py --snapshot 'D:/ausdruecklich-gewaehlt/journal.sqlite' --live-read-only
```

Dieser Modus verwendet `mode=ro` und **eine gemeinsame Lesetransaktion** inklusive
bereits bestätigter WAL-Einträge. Er schreibt keine Journalwerte, führt keinen
Checkpoint aus und ändert keinen Journalmodus. SQLite kann für normales
WAL-Lesen bestehende SHM-Lesersperren verwenden. Der Modus erstellt keine
unveränderliche Sicherung und ist keine Grundlage für einen späteren Import
anderer, inzwischen geänderter Dateien. Eine Leseverbindung kann während der
Prüfung den Abbau alter WAL-Seiten verzögern. Das Laufzeitlimit beträgt 60
Sekunden; `--timeout-seconds` erlaubt ausdrücklich 1 bis 600 Sekunden. Ein
Timeout wird als gescheiterte Prüfung ausgegeben, nicht als leerer Bestand.

In beiden Modi sind `query_only`, abgeschaltete vertrauenswürdige Schemafunktionen,
deaktiviertes Extension-Laden und ein schreibverweigernder SQLite-Authorizer
aktiv. Es werden nur bekannte Tabellen mit exakt passendem Schema gezählt.
Unbekannte oder geänderte Schemaobjekte werden ausschließlich gezählt und
gehasht; ihre Namen, SQL-Literale und Definitionen erscheinen nicht im Bericht.

Der Snapshotbericht enthält ausschließlich Schema-/Prüfmetadaten, Beziehungen,
Zeilenanzahlen und Größen. Er enthält **keine Zeilen, IDs, Kontonamen, Notizen,
Dateipfade, Einstellungswerte oder Geheimnisse**. Fremdschlüsselfehler werden nur
je bekannter Tabellenbeziehung gezählt; SQLite-Fehlertexte werden nicht ausgegeben.
Die bekannten Beziehungsdefinitionen stammen aus dem Repository; bei
Schemaabweichung behauptet der Bericht keine geprüfte Übereinstimmung.

`allocatedBytesIncludingIndexes` ist die belegte Seitengröße des Tabellenbaums
einschließlich seiner Indizes aus SQLite `dbstat`, keine Netto-Nutzdatenmenge.
Ohne `SQLITE_ENABLE_DBSTAT_VTAB` liefert das Feld `null` statt einer erfundenen
Größe. Die Python-Installation dieses Rechners verwendet SQLite 3.40.1 ohne
dieses Modul. Gesamtdateigröße, Seitengröße, Seitenzahl und Freiliste bleiben
verfügbar. Im Live-Modus umfasst die logische Seitenzahl den Lesesnapshot;
`fileBytes` misst allein die Hauptdatei, nicht die WAL-Datei.

Exit-Codes: `0` erfolgreiche Inventur, `1` Eingabe-/Laufzeitfehler, `2` erkannte
Schema-/Integritäts-/Referenzabweichung. Kein Exit-Code bestätigt, dass eine
Cloudmigration ausgeführt oder vollständig abgenommen wurde.

## Persönliche Daten und Einstellungen

| Bestand                                                                                                          | Festgelegte Behandlung für einen späteren Import                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Konten, Kapitalbuchungen, Trades, Taxonomien, Kontexte, Reviews, Ziele, Playbook, Fehler, gespeicherte Ansichten | Kandidaten für verlustfreie Übernahme mit unveränderten IDs, Geldwerten, Nullwerten und Beziehungen. Soft-Delete und Papierkorb behalten.                                                                                                                                        |
| `app_settings.appearance`                                                                                        | Nur `theme`, `density`, `sidebarCollapsed` nach Typ-/Wertvalidierung.                                                                                                                                                                                                            |
| `app_settings.analytics`                                                                                         | Nur `minimumRankingSample`, `minimumCorrelationSample`, `rollingWindow` nach Typ-/Wertvalidierung.                                                                                                                                                                               |
| `app_settings.locale`                                                                                            | Persönliche Präferenz, derzeit kein freigegebener Browser-Command. Lokal behalten; erst nach ausdrücklich implementierter Unterstützung übernehmen.                                                                                                                              |
| `app_settings.backup`                                                                                            | Lokale Aufbewahrung und Desktop-Automatik. Nicht als Cloudbackup-Konfiguration übernehmen. Cloudbackup separat nachweisen.                                                                                                                                                       |
| `macroDataAutomation`, `macroSync`, `weeklyMacroResearch`                                                        | Stillgelegte Provider-/Automatisierungskonfiguration; ausgeschlossen.                                                                                                                                                                                                            |
| Alle anderen Settingschlüssel sowie zusätzliche Eigenschaften in erlaubten Objekten                              | Standardmäßig ausgeschlossen und lokal erhalten; gesonderte Prüfung erforderlich. Auch ein erlaubter Schlüssel macht unbekannte verschachtelte Inhalte nicht sicher.                                                                                                             |
| Brokerverbindungen                                                                                               | Allenfalls ausdrücklich gekennzeichnete Kontostands-Snapshots mit Zeit-/Quellennachweis übernehmen. `credential_ref`, Sitzungen, Zugangsdaten und Verbindungskonfiguration niemals als funktionierende Cloudverbindung kopieren.                                                 |
| Medien                                                                                                           | Inhalte und Vorschaubilder erst nach Hash-/Typ-/Größenprüfung in privaten Blob-Speicher. Metadaten, Zuordnungen und Annotationen beibehalten; lokale Pfade durch explizite Objektzuordnungen ersetzen.                                                                           |
| Persönliche Atlasansichten                                                                                       | Namen, Notizen, feste Kontexte/Quellen, Revisionen, Papierkorb und Original-PNG mit Hash erhalten. Sie liegen in der Journal-DB und sind keine öffentlichen Atlas-Caches.                                                                                                        |
| Zusätzliche persönliche und Importhistorie                                                                       | `saved_filters`, `dashboard_layouts`, `trade_context_links`, `metric_snapshots`, Import-/Exportnachweise und Broker-/Myfxbook-Zuordnungen bleiben erhalten. Sie sind noch nicht vollständig durch die 39 Commands abgedeckt und benötigen eigene Port-/Migrationsentscheidungen. |
| Öffentliche Provider-, Atlas- und Bondcaches                                                                     | Eigene Bestände mit Herkunft und Schema. Separat prüfen; keine Journalwerte zu Providern übertragen und keine identische Cloudverfügbarkeit behaupten.                                                                                                                           |
| `_sqlx_migrations`, `schema_migrations`                                                                          | Zielmigrationen neu verwalten; SQLite-Migrationsbelege nicht als erfolgreich ausgeführte PostgreSQL-Migrationen übernehmen.                                                                                                                                                      |
| `.env.local`, Windows-Anmeldedatenspeicher, Logs, Restore-Aufträge, Backup-Verzeichnisse                         | Kein automatischer Import. Servergeheimnisse ausschließlich in dafür vorgesehene Secret-Konfiguration, nie Browserantworten oder Blob-Metadaten.                                                                                                                                 |

Das Skript liest **keine** `value_json`-Werte. Es zählt nur feste erlaubte
Schlüsselkategorien und fasst sämtliche unbekannten Schlüssel als eine Anzahl
zusammen. Property- und Wertvalidierung ist Aufgabe des späteren Importers;
die Inventur erklärt keinen Einstellungswert als geprüft oder sicher.

## Verbindlicher Validierungsplan für den späteren Import

1. Konsistente, wiederherstellbare Quellsicherung erzeugen und unverändert
   behalten. Quelle, Schema, Migrationen, Dateihashes und Inventurstand eindeutig
   an denselben Snapshot binden. Öffentliche Caches gesondert kennzeichnen.
2. Inventur muss Schema, SQLite-Integrität und Fremdschlüssel bestehen. Jede
   nicht übernommene persönliche Tabellen-/Spaltengruppe ausdrücklich benennen;
   fehlende Unterstützung nie still als leere Daten behandeln.
3. In ein leeres Stagingschema importieren. Text-IDs und Decimalstrings erhalten,
   Integer-Geldwerte exakt abbilden, Boolean- und Zeitverträge prüfen. SQLite-
   `NOCASE` und PostgreSQL-Kollationen nicht still gleichsetzen.
4. Zeilen- und Relationsanzahlen sowie kanonisch serialisierte Werte intern
   vergleichen; Prüfberichte geben nur Prüfsummen/Anzahlen aus. Namenskonflikte,
   Nullwerte, historische Datensätze ohne Konto und archivierte/gelöschte Daten
   ausdrücklich prüfen. Bestandsgrößen allein beweisen keine Wertgleichheit.
5. Medienbytes und Atlas-PNG gegen ihre Originalhashes prüfen. Keine Veröffentlichung
   von Blob-URLs, bevor ausschließlich Besitzerzugriff für Lesen und Schreiben
   einschließlich direkter API-Zugriffe nachgewiesen ist.
6. Trade-/Cashflow-/Metrikvektoren auf SQLite und PostgreSQL vergleichen. Gleiche
   IDs, Netto-P&L, Risiko/R, Win Rate, fehlende Werte und Soft-Delete-Semantik sind
   Pflicht. Transaktionsrollback für mehrteilige Änderungen testen.
7. Mehrere Serverinstanzen testen: Revision, Fachänderung und Vorgangsbeleg gehören
   in dieselbe PostgreSQL-Transaktion. Veraltete Änderungen ablehnen; Wiederholung
   einer Vorgangs-ID darf keine zweite Mutation auslösen. Unklaren Commit-Ausgang
   über den Beleg prüfen, nicht blind wiederholen.
8. Cloudbackup und Wiederherstellung in ein getrenntes Testziel nachweisen.
   Aktivierung erst nach Bestandsvergleich, Zugangstest und echter Bedienprüfung.
   Die bestehende lokale Desktop-Datenbank bleibt erhalten; automatische
   Synchronisierung ist eine separate, noch nicht implementierte Funktion.

## Kontrollierter initialer PostgreSQL-Import

`src-tauri/src/cloud_postgres/importer.rs` implementiert die Übernahme aus einer
ausdrücklich angegebenen konsistenten Sicherung. Der Rust-Importer hat absichtlich
keinen Live-Modus: Quelle muss absolut, geschlossen und außerhalb des produktiven
AppData-Bereichs sein. SQLite wird ausschließlich `read_only`, `immutable` und
`query_only` geöffnet. Alle 49 kompilierten SQLite-Migrationen rekonstruieren im
Arbeitsspeicher das erwartete Schema; Tabellen-/Indexdefinitionen, Integrität und
Fremdschlüssel müssen übereinstimmen. Ein späterer Migrationsstand benötigt eine
erneute Prüfung des Importumfangs.

Das zugehörige Beispiel `src-tauri/examples/import_private_snapshot.rs` prüft
standardmäßig nur. `--apply` benötigt zusätzlich einen expliziten absoluten
`--env-file`-Pfad und `--schema macro_stage_<32 hexadezimale Zeichen>`. Der Bereich
wird **neu** angelegt; bestehende Schemas werden niemals überschrieben. Verbindung
erfolgt über `DATABASE_URL_UNPOOLED` beziehungsweise `POSTGRES_URL_NON_POOLING`,
mit vollständiger TLS-Zertifikatsprüfung und abgeschalteten SQL-Statementlogs.
Verbindungswerte gehören weder in Kommandozeilenargumente noch Ausgaben.

Der aufrufende Code besitzt eine PostgreSQL-Transaktion und übergibt genau deren
Verbindung an `import_snapshot()`. Alle 30 Kandidatentabellen müssen im Ziel leer
sein. IDs, Integer, Decimalstrings, Nullwerte und Binärdaten bleiben erhalten;
SQLite-Booleanwerte werden ausdrücklich auf PostgreSQL-Booleanwerte abgebildet.
Jeder normalisierte Quelldatensatz und sein erneut gelesener Zieldatensatz werden
kanonisch gehasht und als vollständige Multimenge verglichen. Kontorechnung und
die bestehenden Rust-Journalkennzahlen werden zusätzlich zwischen SQLite und
PostgreSQL abgeglichen.

Die 21 ausdrücklich aufgeführten zusätzlichen persönlichen beziehungsweise
historischen Tabellen bleiben in `cloud_retained_records` erhalten. Das Archiv
speichert nach Tabelle und gehashter Originalidentität getrennte, typisierte
JSON-Datensätze mit Prüfhash. Es besitzt keinen generischen HTTP-Lesezugang;
das Aufbewahren ersetzt noch keinen Feature-Port. Der Import liest keine anderen
Settings als `appearance` und `analytics`; unbekannte Eigenschaften werden
entfernt. Ausgeschlossene Settingzeilen werden als Anzahl ausgewiesen.

Verbindungszustände werden gezielt inaktiviert: `broker_account_connections`
übernimmt keinen `credential_ref`, setzt `status=disconnected` und einen festen
Hinweis zur nötigen Neuverbindung. Im Archiv wird Myfxbook deaktiviert/pausiert
und MT5 als nicht verbunden gespeichert; freie Verbindungs-/Fehlertexte werden
dabei nicht übertragen. Kontoidentitäten, datierte historische Kontostände und
Handelszuordnungen bleiben erhalten. Jede betroffene Tabelle trägt im Bericht
`requiresCloudReconnect`. Die Quellen bleiben einschließlich ihrer lokalen
Anmeldedaten unverändert.

Das Budget begrenzt persönliche Nutzdaten samt aufbewahrter Historie auf 500 MiB
und einzelne kanonische Datensätze auf 64 MiB. Es gilt nicht für die Gesamtgröße
der SQLite-Datei, die große, ausdrücklich ausgeschlossene öffentliche Provider-
und Legacy-Caches enthalten kann. PostgreSQL-Indizes und Speicherverwaltung
verursachen zusätzliches Volumen; das Budget ist keine Zusage über Abrechnung
oder verbleibende Providerkapazität.

Medienmetadaten behalten zunächst ihre Originalwerte im privaten Stagingschema.
Die tatsächlichen Dateien brauchen anschließend eine separate geprüfte private
Blob-Übernahme. `cloud_media_objects` ergänzt später eine ID-gebundene Zuordnung;
lokale Dateipfade werden nicht als öffentliche URLs verwendet. Der Importbericht
meldet deshalb erforderliche Dateiübernahmen und setzt `activationReady=false`.
Das Beispiel legt auch keine Workspace-Identität an. Diese wird erst nach
separater Medien-, Zugriffs- und Betriebsprüfung aktiviert.

Vor Commit werden Fehler vollständig zurückgerollt; das CLI entfernt nur den
Stagingbereich, den genau dieser Aufruf neu angelegt hat. Ist der Commit-Ausgang
wegen eines Verbindungsfehlers unklar, bleibt der Bereich zur ausdrücklichen
Prüfung erhalten. Keine blinde Wiederholung, kein Überschreiben und keine
automatische Aktivierung.
