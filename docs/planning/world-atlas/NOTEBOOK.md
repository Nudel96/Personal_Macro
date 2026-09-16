# Gemerkte Atlasansichten und eigene Notizen

Stand: 9. September 2026. Dieser Arbeitsabschnitt ist implementiert; die
vollständige Weltatlas-Aufgabe bleibt im Ausbau.

## Bedienung

**Ansicht merken** hält das gewählte Land, Vergleichsland, Thema und die
Diagrammeinstellungen fest. Ein Name, eine eigene Notiz und eine Favoritenmarkierung
können ergänzt werden. **Gemerkte Ansichten** öffnet die zunächst geschlossene
Sammlung mit Suche, Favoritenfilter und Papierkorb.

Der optionale **Diagrammstand** ist ein festes PNG der gerade dargestellten
Atlasdiagramme. Die Vorschau zeigt vor dem Speichern, welche Bilder enthalten
sind. Beschriftungen, außerhalb der Diagramme angeordnete Länder-/Stromlegenden
und die Einheiten der Übersichtskarten werden mitgeführt. Tabellen, aufgeklappte
Methodiktexte, Maus-Tooltips und die übrige Programmoberfläche gehören nicht zum
Bild. Eine Ansicht ohne Diagramm kann trotzdem mit Notiz gemerkt werden. Ein
fehlgeschlagener Bildstand muss vor dem Speichern ausdrücklich abgewählt werden.

**Ansicht mit aktuellem Datenstand öffnen** stellt die gespeicherte Auswahl mit
den aktuell lokal vorliegenden öffentlichen Daten wieder her. Das gespeicherte
PNG bleibt davon unabhängig. Beim Bearbeiten ändern sich nur Name, Notiz und
Favoritenmarkierung. Bild, Aufnahmezeitpunkt, Auswahl und Quellenstand bleiben
unverändert. Für einen neuen Datenstand eine neue Ansicht merken.

Ungespeicherte Änderungen bleiben bei Hintergrundabfragen erhalten. Schließen,
Escape und Klick außerhalb des Dialogs weisen auf einen offenen Entwurf hin.
Eine zwischenzeitlich anderweitig geänderte Notiz erzeugt einen Versionskonflikt;
der eigene Entwurf bleibt zum Übernehmen oder Kopieren sichtbar. Löschen ist
ausschließlich ein Verschieben in den Papierkorb mit Wiederherstellung.

Beim nächsten Aufruf des Atlas ohne ausdrückliche URL-Auswahl wird die letzte
Ansicht wieder geöffnet. Ausdrückliche Links und Änderungen während des Ladens
haben Vorrang. Das Nachführen der letzten Auswahl erfolgt nach kurzer Ruhezeit
und beim regulären Verlassen der Seite. Ein erzwungener Prozessabbruch unmittelbar
nach einer Änderung kann dem letzten Schreibvorgang zuvorkommen. Lesefehler
verhindern das automatische Überschreiben des bisherigen Stands.

Eine vorübergehende SQLite-Schreibsperre wird inzwischen begrenzt überbrückt.
Die geordnete Speicherung übernimmt die neueste Auswahl und überspringt
überholte Zwischenstände; beim schnellen Wiederöffnen wird eine noch laufende
Speicherung zuerst abgewartet. Andere Datenbankfehler und anhaltende Sperren
bleiben sichtbar. [Verhalten und native Prüfung](PREFERENCES-RECOVERY.md).

## Speicherung und Grenzen

Der lokale Parameter `fromGuide` erhält außerdem den Rückweg aus einem
Datenbild zum [Einstieg in eine lange Entwicklung](CONTEXT-GUIDES.md).
32 solcher Einstiegs-/Zielkontexte wurden in einem separaten nativen Testprofil
gespeichert und nach Prozessneustart unverändert gelesen.

Die additive Hauptmigration **0047** ergänzt `atlas_notebook_entries` und
`atlas_personal_preferences` in der gesicherten Journal-Datenbank. Das PNG liegt
als BLOB mit SHA-256 vor. Persönliche Notizen werden niemals in den öffentlichen
Atlas-Cache oder an Datenanbieter geschrieben. Der Browsermodus bietet hierfür
keine scheinbar erfolgreiche Ersatzspeicherung.

Ein Eintrag enthält einen versionierten, auf lokale Atlasparameter begrenzten
Kontext. Externe URLs, Dateipfade und Commands können damit nicht geöffnet werden.
Die Frontend-Fassade stellt sieben Tauri-Commands für Liste, Detail, Erstellen,
Bearbeiten, Papierkorb/Wiederherstellung und letzte Ansicht bereit. Alle
persönlichen Abfragen verwenden eigene Query Keys außerhalb des öffentlichen
`atlas`-Caches. Gleichzeitige Änderungen werden über eine Revisionsnummer geprüft.

Grenzen pro Eintrag: Name 160 Zeichen, Notiz 12.000 Zeichen, Bild 2 MiB und
höchstens 16 Millionen Pixel. Die Aufnahme erzeugt nur ein inaktives PNG aus
Atlas-SVG-/Canvas-Flächen; sie fotografiert weder Desktop noch Journal.
Bei beschädigter Bildprüfsumme bleiben Notiz und Kontext lesbar. Einträge mit
einer künftig unbekannten Kontextversion lassen sich weiterhin als Notiz/Bild
lesen, aber nicht automatisch als laufende Ansicht öffnen.

Quellenreferenzen enthalten Familie, Gebiet beziehungsweise Fonds-/Quellenbereich,
Datensatz, Veröffentlichungsstand, Abrufzeit, Rezept/Katalogversion und
Dateiprüfsummen aus den aktiven öffentlichen Atlasabfragen. Zyklusmodelle werden
ausdrücklich als erklärende Modelle mit Quellenautor und Modellversion markiert.
Die Quellenreferenzen sind kein vollständiger zweiter numerischer Datensatz.
Der feste Diagrammstand macht die Notiz auch ohne öffentlichen Cache nachvollziehbar.

## Backup und Wiederherstellung

Die persönliche Sammlung wird mit dem regulären Journal-Backup gesichert.
Der öffentliche Atlas-Cache bleibt separat und gehört weiterhin nicht zum
Journal-Backup. Das Merken selbst erzeugt nicht bei jedem Klick ein neues ZIP.

Backups verwenden jetzt eine durch SQLite mit `VACUUM INTO` erzeugte konsistente
Datenbankkopie. Damit können Notiz- und Präferenzschreibvorgänge nicht zwischen
Prüfsummenbildung und dem Lesen der aktiven Datenbank in das Archiv geraten.
Der Archivvertrag bleibt `database/journal.sqlite` mit Manifest und Prüfsummen.
Die temporäre Kopie wird nach Erfolg oder Fehler entfernt. Auch die Sicherheitskopie
vor einem Restore entsteht als konsistenter SQLite-Stand. Prüfung, Staging und
Sicherheitskopie bleiben Voraussetzungen für den Austausch beim Neustart.

## Prüfung

- Drei native Tests: CRUD/Revisionskonflikt/Papierkorb und tatsächlicher
  Backup-/Staging-/Restore-Durchlauf ohne öffentlichen Cache; Upgrade einer
  temporären Hauptdatenbank von 0046 auf 0047; drei konsistente Backups während
  fortlaufender atomarer Schreibvorgänge. Beschädigte Bilder und ungültige
  Eingaben werden gesondert geprüft.
- Fünfzehn neue Frontendtests: vollständige Auswahl, Aufnahmefehler,
  Entwurfserhaltung, Konflikt, Wiederherstellung, Lesefehler, expliziter
  Browserzustand, Quellenherkunft sowie verzögerte und geordnete Präferenzschreibvorgänge.
  Der Seitenintegrationstest prüft zusätzlich zwei tatsächlich gerenderte
  Altersprofile im wiederhergestellten Projektionsjahr.
- Echte Tauri-App im ausschließlich hierfür angelegten Profil
  `com.personal-macro.atlas-notebook-validation`: Hauptmigration 0047,
  Atlasmigration 0006; native CRUD-Commands einschließlich Konflikt/Papierkorb;
  ein aus den öffentlichen Länderdiagrammen erzeugtes 960×2170-PNG mit 18
  Quellenreferenzen; vollständiger Prozessneustart mit erhaltenem Bild/Notiz.
  Das tatsächliche ZIP wurde unabhängig mit Python/SQLite/Pillow auf
  Manifest, SHA-256, Integrität, Bild und Präferenz geprüft.
  [Nativer Nachweis](evidence/notebook-native-readiness.json).
- Browser-Sichtprüfung mit ausdrücklich gekennzeichneten öffentlichen
  Originalsnapshots und persönlichen Testnotizen nur im Arbeitsspeicher:
  Formular, Favorit, Entwurfsschutz, Wiederöffnen, SVG-Übersicht,
  ECharts-Einzelbild und Bewertungsbild bei 1024 beziehungsweise 1440 Pixeln.
  Keine Browser-Konsolefehler in diesen Abläufen.

Die native Command-Prüfung ersetzt nicht die noch offene vollständige native
Klickabnahme des gesamten Atlas. Beide echten Starts initialisierten den Atlas
ohne Atlaswarnung. Die bekannten Scheduler-Meldungen zu EODHD-Intradayzugriff und
Zentralbankberichten traten unabhängig davon im Prüfprofil auf.

Abschließender Stand: 96 Atlas-Frontendtests in 17 Dateien, 204 bestandene
Rust-Library-Tests und die erneut ausgeführten drei Notiz-/Backup-Tests.
Typecheck, ESLint, Prettier, Produktionsbuild, Rust-Fmt und Clippy mit
`-D warnings` bestanden. Die bekannten großen ECharts-/Dokumentexport-Chunks
bleiben eine bestehende Build-Meldung. Prüfprozesse und temporärer Browsertab
wurden geschlossen; die persönliche Datenbank des Nutzers wurde nicht verwendet.
