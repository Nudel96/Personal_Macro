# Smartphone-Funktionsabgleich vom 06.10.2026

Der Auftrag umfasst Start der Desktop-App, den EXE-Pfad, Commit/Push aller
Quelländerungen und die Angleichung des privaten Smartphone-Workspace.
Vollständige Desktop-Parität ist weiterhin ein offenes Ziel.

## Ergänzte Browserfunktionen

- Import von CSV, JSON und Excel mit Kontobindung und Vorschau. Ein Batch mit
  höchstens 250 neuen Trades wird in einer Revisionstransaktion gespeichert.
  Ein Fehler rollt den ganzen Batch zurück. Die Dateien werden im Browser gelesen.
- Kontogebundene CSV-/JSON-Downloads sowie die bestehenden Excel- und PDF-Exporte.
  Maschinenformate behalten Integer-Geldwerte; leere Ergebnisse bleiben fehlend.
- Cloud-Sicherungen über fest freigegebene persönliche Tabellen, ohne Provider-
  Credentials, Budgettabellen, öffentliche Marktpakete oder Vorgangsbelege.
  Wiederherstellung prüft den Hash, erstellt eine Sicherheitskopie und ersetzt
  den Journalstand in derselben Transaktion mit Revision und Vorgangsbeleg.
  Konten außerhalb des Sicherungsstands werden archiviert; ihre Identitäten
  bleiben für unveränderliche Provider-Nachweise erhalten. Myfxbook muss zuvor
  getrennt sein. Cloud- und Desktop-Sicherungen haben unterschiedliche Formate.
- ZIP-Download einer Cloud-Sicherung ergänzt Originalbilder über den geschützten
  Medienpfad und prüft ihre Größe und SHA-256 vor dem Download. Keine Blob-URLs
  oder Dateisystempfade gelangen an den Browser. Die Originale bleiben unverändert.
- Lesestand, Merkliste und Lernnotizen über optionale PostgreSQL-Commands.
  Der Browser verwendet keinen persönlichen localStorage. Lade-/Speicherfehler
  bleiben sichtbar; fehlende Capabilities erhalten den bisherigen Sitzungsmodus.
- Screenshot-Erkennung auf dem Smartphone über lokal ausgeführtes Tesseract.js.
  Worker, WASM und Sprachmodelle kommen vom eigenen geschützten Host. Bildbytes
  und OCR-Wörter werden nicht an einen OCR-Anbieter gesendet. Der vorhandene
  Feld-/Farbparser und die ausdrückliche Prüfung übernommener Werte bleiben erhalten.
  OCR-Ergebnisse können vom Windows-Reader abweichen.
- Beim Speichern eines Trades mit Screenshot werden Trade, Medieneintrag und
  Zuordnung gemeinsam in PostgreSQL bestätigt. Das Original wird vorher privat
  abgelegt und geprüft. Unklare Speicherergebnisse dürfen keinen blinden zweiten
  Trade anlegen. Der öffentliche JSON-Pfad kann keine internen Medienbefehle aufrufen.

Die 46 Pflicht-Capabilities bleiben unverändert. Import/Export ist optional;
fehlende neue Commands dürfen das vorhandene Journal nicht sperren. Learning
bleibt als statische Route erreichbar. Persönliche Lernmutationen verwenden die
bestehende Revisionsprüfung.

## Grenzen und verbleibende Arbeit

Keine automatische Synchronisierung zwischen Desktop-SQLite und PostgreSQL.
Ein ausgeschalteter Windows-PC stellt weder MT5 noch Windows-OCR bereit.
MT5-Terminalaktionen, cTrader-OAuth, originale MetaTrader-/cTrader-Reportimporte,
Legacy-SQLite-Import, Desktop-ZIP-Restore und weitere öffentliche Provider-
Aktualisierungen sind noch nicht vollständig in einen Cloudablauf portiert.
EODHD-, COT-, Berichts- und Myfxbook-Jobs behalten ihre vorhandenen Verträge.
Die physische iPhone-/Safari-Abnahme durch den Besitzer bleibt gesondert offen.

Browser-Screenshots sind auf 3 MiB, 16 Millionen Pixel und 8192 Pixel je Achse
begrenzt. Importdateien auf 2 MiB und 250 Trades. Sicherungen auf 16 MiB pro
Stand und 32 MiB insgesamt; keine automatische Löschung. Der bestehende
JSON-Antwortvertrag von 4 MiB gilt auch für Sicherungsdownloads. Originalbilder
werden separat bis insgesamt 128 MiB in den ZIP-Download aufgenommen.
Größere Datenaustauschvorgänge benötigen einen getrennten, begrenzten Transport.

## Nachweise

Vor der Veröffentlichung entstand eine konsistente, read-only PostgreSQL-
Sicherung von 53 Tabellen und 9450 Zeilen, Journalrevision 9. Das Gzip-Archiv
liegt außerhalb der versionierten Quellen ausschließlich auf D: und wurde
durch erneutes Lesen bytegenau geprüft. Persönliche Werte und Zugangsdaten
werden nicht in diesen Bericht aufgenommen.

Die neuen Restore-/Batch-Pfade bestehen auf einem isolierten PostgreSQL-Schema,
einschließlich Sicherheitskopie, unverändertem P&L und Transaktionsrollback.
Die erweiterten Medienprüfungen bestehen mit 25 Tests. Die Prüfung mit Clippy
für das Cloudprofil besteht. Der private Produktionsbuild besteht.
Der abschließende Frontendlauf besteht mit 800 Tests in 125 Dateien, begrenzt
auf zwei Prozesse. Der Rust-Gesamtlauf bestand 429 Tests; zwei veraltete
Vertragsassertionen (Command-Anzahl und SQLite-Migrationsstand) wurden korrigiert
und beide gezielt erneut erfolgreich geprüft. 87 Tests waren im Gesamtlauf
ignoriert, darunter separat auszuführende Provider-/PostgreSQL-Prüfungen.
Der neue PostgreSQL-Transfer-Test wurde ausdrücklich zusätzlich ausgeführt.
ESLint und die Prüfung des Quellstands auf bekannte Secret-Formate bestehen.
Live-Nachweise werden nach Abschluss ergänzt.
