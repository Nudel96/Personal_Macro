# Einheitliche visuelle Überarbeitung des Desktop-Workspaces

Stand: 4. September 2026. Arbeitsgrundlage ist der vorhandene, bereits veränderte
Working Tree in `apps/desktop`, nicht der letzte Git-Commit.

Status: Bestandsaufnahme, Funktionsschutz, gemeinsame Gestaltung und Überarbeitung
aller 20 Routen sind umgesetzt. Die Frontend-Abnahme ist abgeschlossen.

## Auftrag und Vorgehen

Alle 20 aktiven Routen sowie Navigation, Dialoge, Formulare, Tabellen, Charts und
Statusanzeigen werden inventarisiert. Die bereits ausgebaute Macro Heatmap dient
als gestalterische Referenz: dunkles Navy, klar abgestufte Flächen, feine Borders,
kompakte Zahlen und funktionale Akzente. Bestehende spezialisierte Ansichten
werden auf dieser Grundlage integriert.

1. **Bestandsaufnahme:** Komponenten und Styles lesen; jede Route in einer
   isolierten Browser-Vorschau aufnehmen; Unteransichten und wichtige Dialoge
   erfassen; vorhandene Prüfungen als Ausgangspunkt ausführen.
2. **Funktionsschutz:** Datenzugriffe, Kontoauswahl, Query Keys, Formulare,
   native Aktionen und fachliche Invarianten je Bereich dokumentieren.
3. **Designsystem:** widersprüchliche globale Style-Schichten bereinigen;
   gemeinsame Tokens, Navigation, Seitenköpfe, Cards, Controls, Tabellen und
   Zustände vereinheitlichen.
4. **Seitenüberarbeitung:** Journal, Arbeitsprozess, Marktkontext und System
   abschnittsweise aktualisieren; Hierarchie und Bedienung konkret verbessern.
5. **Abnahme:** alle Routen bei 1440 px und 1024 px prüfen, wichtige Dialoge und
   Tastaturbedienung durchgehen, Typecheck, relevante Tests und Build ausführen.

## Verbindliche Invarianten

- Änderungen bleiben in Präsentation und Navigation. Datenverträge, Rust,
  SQL-Migrationen, Provider und Berechnungen sind kein Bestandteil des Redesigns.
- Kontoauswahl und kontogebundene Query Keys behalten ihre Semantik. Dialoge
  dürfen bei einem Kontowechsel keine Daten des alten Kontos übernehmen.
- Alle vorhandenen Aktionen, Validierungen, Filter, Ansichten, Exporte und
  Bestätigungsdialoge bleiben erreichbar.
- Fehlende Werte bleiben nicht verfügbar; Grün/Rot behalten ihre fachliche
  Bedeutung. Herkunft, Stichprobengröße, Unsicherheit und Coverage bleiben sichtbar.
- Importvorschau, Commit, Restore und Reset behalten ihre Sicherheitsabfolge.
- Persönliche Datenbanken, Medien, Verbindungen und Secrets werden nicht für
  die visuelle Prüfung verändert. Browser-Testdaten sind isoliert.
- Mindestbreite 1024 px, sichtbarer Tastaturfokus und Radix-Dialogverhalten bleiben
  erhalten; breite Datentabellen scrollen innerhalb ihrer eigenen Flächen.
- Bestehende Änderungen werden nicht zurückgesetzt. Ein lokaler Ausgangsstand
  unter dem ignorierten `apps/desktop/output/playwright/` erlaubt den Vergleich.

## Inventar und Abnahme

Die folgende Abnahme bezieht sich auf das Frontend und isolierte Browser-Kontexte.
Native Aktionen sind gesondert unter „Prüfgrenzen“ aufgeführt.

| Bereich | Routen / Objekte | Status |
| --- | --- | --- |
| Rahmen | Sidebar, Marktkontext-Navigation, Topbar, Suche, Lade- und Fehlerzustände | Umgesetzt; Route, Sidebar und Befehlssuche geprüft |
| Journal | Übersicht, Trades, Kalender, Analytics | Alle Routen sowie sechs Analytics-Reiter geprüft |
| Arbeitsprozess | Reviews, Playbook, Fehleranalyse, Medien, Ziele | Sammlungen, Suche, Dialoge und Fokus-Rückkehr geprüft |
| Marktkontext | Macro, Regime Insights, Wirtschaftsdaten, Wirtschaftskalender, COT, Seasonality, Leitzinsen, Zentralbank-Briefings | Browserzustände und zusätzliche Provider-Testfixtures geprüft |
| Research | Put/Call Ratio | Leere Ansicht und Verlauf mit synthetischen Prüfdaten geprüft |
| System | Import/Export, Einstellungen, Kontoverbindungen | Oberfläche und acht Einstellungen geprüft; native Abläufe unverändert |
| Dialoge | Trade-Erfassung, geführte Erfassung, Detail, Papierkorb, Positionsgröße, Medien, Import/Reset | Hauptdialoge bei 1440/1024 px geprüft; native Import-/Reset-Ausführung nicht erfolgt |

## Erste Codebefunde

- `globals.css` enthält mehrere konkurrierende globale Design-Schichten:
  ursprüngliches Navy, mehrfaches pauschales „brutalist“-Styling, kompakte
  Anpassungen und zuletzt spezialisierte Navy-Styles für die Macro Heatmap.
  Diese Kaskade erzeugt die beobachtbaren Brüche zwischen alten und neuen Seiten.
- Es existieren 20 aktive Routen; die Übersicht in älteren Dokumenten ist nicht
  vollständig. Die Route-Registrierung in `App.tsx` ist maßgeblich.
- Gemeinsame Bausteine (`PageHeader`, `JournalPageHeader`, `Card`, `Button`,
  `EmptyState`, `PageLoading`) ermöglichen eine konsistente Überarbeitung ohne
  Eingriff in Datenzugriff und Bewertungslogik.

## Prüfergebnisse

- `pnpm typecheck`: bestanden; zusätzlich im Produktionsbuild ausgeführt.
- `pnpm test --maxWorkers=2`: **31 Produkt-Testdateien, 130 Tests bestanden**.
  Der im Ausgangsstand beobachtete Macro-Timeout tritt bei begrenzter
  Parallelität nicht auf. Drei neue Tests sichern fehlenden Zielfortschritt,
  Such-/Leerzustand und Tastaturöffnung/Fokusrückkehr/neues Ziel ab.
- `pnpm lint`: bestanden, keine Fehler oder Warnungen.
- `pnpm format:check`: gesamtes `src` bestanden.
- `pnpm build`: bestanden. Vite meldet Pakete über 500 kB, unter anderem ECharts
  und Dokumentexport. Diese Bundle-Größen sind keine Laufzeitfehler; Aufteilung
  der Abhängigkeiten war kein Bestandteil der visuellen Überarbeitung.
- 20 Routen bei **1440 × 1000** und **1024 × 900** aufgenommen und geprüft.
  Keine horizontale Überbreite der Seiten und keine JavaScript-Seitenfehler.
  Breite Tabellen und Matrizen scrollen innerhalb ihrer Flächen.
- Neun Marktdatenansichten zusätzlich mit isolierten Testfixtures geprüft.
  Native Erreichbarkeit wurde ausschließlich im Prüfkontext simuliert.
- Sechs Analytics-Reiter und acht Einstellungsbereiche geprüft.
- Quick Trade, vier Schritte der geführten Erfassung, Trade-Detail, Saved View,
  Papierkorb, Setup, Review, Ziel/Fortschritt, Annotation und Seasonality-Vollbild
  geöffnet. Die geprüften Dialoge bleiben bei beiden Bildschirmgrößen im Viewport.
- Medien im Browser importiert, Bereich/Pfeil eingefügt und Undo/Redo ausgeführt.
  Seasonality-Diagnosen und Kohortensteuerung durchgesehen.
- Fokus-Rückkehr nach Escape für Ziel, Zielfortschritt, Review, Setup,
  Setup-Erstellung und Annotation im echten Browser bestätigt.
- Informationsdichte gespeichert, Seite neu geladen und tatsächliche Änderung
  der Kartenabstände von 18 px auf 24 px bestätigt.
- Positionsrechner durch das Formular bedient: EUR-Konto, EURUSD, Entry 1,10,
  Stop 1,09, Umrechnung 1,10; Anzeige 0,11 Lots und effektives Risiko 100,00 EUR.
  Berechnungsfunktionen wurden nicht geändert.

### Prüfgrenzen

Die Abnahme umfasst die Oberfläche, Browser-Adapter und vorhandene Frontendtests.
Eine native Tauri-Sitzung gegen persönliche Daten wurde nicht gestartet. SQLite,
Migrationen, Brokerverbindungen, echte EODHD-Abrufe, native Dateiimporte,
Backup/Restore und Journal-Reset wurden nicht ausgeführt oder verändert.
Provider-Testfixtures und Screenshots sind keine aktuellen Marktdaten.

Die Desktop-Anwendung lief während der Arbeit bereits. Ihre laufende Instanz
wurde nicht beendet. `START-MACROTOOL.cmd` erkennt neuere Quelldateien und baut
die Windows-Anwendung beim nächsten Start nach dem Schließen dieser Instanz neu.

## Seiteninventar und Funktionsschutz

| Seite | Beobachteter Stand / Maßnahme | Unverändert zu erhalten |
| --- | --- | --- |
| Übersicht | gedrängte Kopfaktionen; KPI-, Chart- und Kalenderflächen vereinheitlichen | Konto + Zeitraum + globale Filter, KPI-Reihenfolge, Onboarding, Metrik-Availability |
| Trades | dichte Filterleiste, kleine Tabellenlabels; klare Toolbar und Fokusziele | Sortierung, Spaltenbreite/-reihenfolge, Saved Views, Mehrfachauswahl, Papierkorb, Kontoübergang |
| Kalender | fehlende Namen der Monatspfeile; Jahresraster über Mindestbreite | lokaler Monat, Abschlussdatum, Jahresabfrage, Tages-P&L und R |
| Analytics | sechs Reiter, Kapital, KPI und Charts; einheitliche Hierarchie | Kontoabfrage, sechs Gruppierungen, n und Mindeststichprobe |
| Reviews | nur per Maus öffnende Karten; strukturierte Sammlung und Öffnen-Schaltflächen | Kontobindung, Tages-/Wochen-/Monatsfilter, eingefrorener Snapshot, Entwurf/Abschluss |
| Playbook | starre Dreierspalten und kleine Texte; Suche und zugängliche Karten | globale Setups, kontobezogene Trade-Zahl, Versionierung, Regeln und Checklisten |
| Fehleranalyse | kleine KPI- und Katalogtexte; klare Kennzahlen und Zeilen | Fehlerzuordnungen, geschätzte Kosten getrennt von realisiertem P&L |
| Medien | Galerie ohne Suche, nur Mausnavigation; Bildfläche und Metadaten verbessern | Import, Dateityp/-größe, Original, Konva, Undo/Redo, Annotation-Speicherung |
| Ziele | technische Status-/Metriknamen; gegliederte Karten und Suche | Zielwerte, Zeitraum, bestehende Fortschrittseingabe; fehlenden Fortschritt kenntlich machen |
| Macro | fortgeschrittene Referenzgestaltung; Shell anschließen und Kopfaktionen prüfen | vollständige Signal-/Farbsemantik, Tooltip, Pair-Matrix, technische Trends, Feed und Mappings |
| Regime Insights | ausgebaute Statistikansicht; gemeinsame Controls/Headers integrieren | CPI-Zustände, OHLC, D1/W1, Horizonte, Stichproben und Validierung |
| Wirtschaftsdaten | moderne Kategorien in altem Rahmen; Controls und Tabellen anpassen | Währung, Kategorie, Indikator, Originalwerte, Release-Historie und Aktualisierung |
| Wirtschaftskalender | gemischte Flächen; Filter, Status und Tabelle angleichen | kommende/historische Termine, 7/30/90 Tage, Land, Asset, Kategorie, Sortierung |
| COT | Seitenkopf fehlt; Matrix/Detail und Datenherkunft strukturieren | Legacy Non-Commercial, Position/Change/Trend, Paarwahl, Coverage |
| Seasonality | spezialisiertes Workspace-Layout; gemeinsame Flächen/Typografie integrieren | Marktauswahl, Kohorte, bewusste Übernahme, Fenster, Evidenzreiter, Vollbild, Herkunft |
| Leitzinsen | redundante Aktualisierungsaktion und dekorativer 70%-Ring | absolute/relative USD-Werte, Basispunkte, Zentralbankabdeckung, fehlende Erwartungen |
| Zentralbank-Briefings | zweispaltige Ansicht läuft bei 1024 px über | Bank-/Typ-/Lesefilter, Detail, Original, Quellen, Lesestatus |
| Put/Call Ratio | eigene Research-Fläche; in globale Hierarchie integrieren | Symbol, MA5, Extremzonen, Kalibrierung, Historie und CME-Import |
| Import/Export | sehr lange lineare Arbeitsfläche; Abschnitte und Sprungnavigation | Konto, CSV/XLSX, cTrader/MT5-Vorschau, Zeitzone, Exporte, Backup/Restore und Reset-Schutz |
| Einstellungen | acht Abschnitte, ohne klar benannten Navigationsbereich | gespeicherte Darstellung/Analytics/Backup-Werte, Konten, Cashflows, OAuth/MT5, Tags, Felder |

### Dialoge und gemeinsame UI

Quick Trade, geführte Erfassung, Trade-Details, Positionsrechner, Saved View,
Papierkorb, Review, Setup, Ziel/Fortschritt, Annotation und Journal-Reset nutzen
gemeinsame Dialogklassen. Aktualisiert werden Fläche, Abstände, Titel,
Formularlesbarkeit, Fokus und Footer. Radix-Portale, Feldnamen, Submit-Handler,
Validierung, Konto-Guards und Mutation-Reihenfolge bleiben bestehen.

### Gestaltungsentscheidung

Ein einziges globales Token-System definiert Navy-Flächen, Blau/Violett-Akzent,
14–18 px Kartenradien, 9–10 px Controls, mindestens 11–12 px für normalen
Hilfstext und tabellarische Zahlen. Seitenköpfe erhalten einen erkennbaren
Bereichsmarker, eine klare Titel-/Beschreibungshierarchie und getrennte
Konto-/Aktionsbereiche. Cards werden über gemeinsame Komponenten modernisiert;
fachliche Heatmaps behalten ihre eigenen semantischen Farben. Starre
Mehrspaltenlayouts werden über benannte Klassen bei 1024 px angepasst.

### Abnahmefälle

- Jede Route bei 1440 × 1000 und 1024 × 900; lokales Scrollen breiter Matrizen.
- Geladene Journal-Testdaten und leerer Workspace; native Provider bleiben in
  normaler Browser-Vorschau ehrlich nicht verfügbar. Bestehende Testfixtures
  dienen zusätzlich zur visuellen Prüfung komplexer Provideransichten.
- Sechs Analytics-Reiter und acht Einstellungsabschnitte.
- Quick Trade, Guided Trade, Detail und Positionsrechner; Escape und Fokus.
- Sammlungen filtern und per Tastatur öffnen; Review, Setup, Ziel/Fortschritt.
- Kontoauswahl, Kalenderpfeile, Spaltenmenü, Befehlssuche und eingeklappte Sidebar.
- Typecheck, Vitest, Lint, Formatierung geänderter Dateien, Produktionsbuild.

### Ausgangstests und Testinventar

Im ersten Orientierungslauf erreichte ein Macro-Test unter voller Parallelität
das 5-Sekunden-Limit. Die Abschlussprüfung verwendet zwei Worker.
Frühere Gesamtsummen zählten auch 30 Sicherungskopien der Tests mit.
Diese sind jetzt als `.snapshot` gesichert und werden nicht mehr ausgeführt;
die Abnahme zählt ausschließlich die 31 Produkt-Testdateien.

## Umgesetzte Gestaltung und Bedienung

- Ein gemeinsames Token- und Komponentensystem in
  `apps/desktop/src/styles/workspace.css`, importiert durch `globals.css`.
  Die konkurrierenden globalen Schwarz-/Weiß-/Eckig-Schichten wurden entfernt.
  Spezialisierte Heatmap-, Regime- und Seasonality-Styles bleiben erhalten.
- Navy-Flächen, abgestufte Kontraste, konsistente Abstände, Radien, Typografie,
  Zahlen, Buttons, Badges, Tabellen und Formularfelder.
- Einheitliche Seitenköpfe mit Bereichsicon, Beschreibung, Kontoauswahl und
  Aktionen; beständige Shell während des Ladens, Seitentitel und Sprunglink.
- Gemeinsame Lade-, Fehler- und Leerzustände. COT erhält einen eigenen
  Seitenkopf und eine Erklärung für die leere Übersicht.
- Playbook, Medien und Ziele mit Suche, Ergebnisanzahl und kompakter Übersicht.
  Kartenaktionen sind echte Schaltflächen; kontrollierte Sammlungsdialoge
  führen den Fokus nach dem Schließen zum Auslöser zurück.
- Zielfortschritt ohne Beobachtung erscheint als fehlend. Ein gemessener
  Nullwert bleibt davon unterscheidbar. Metriken und Status sind deutsch benannt.
- Größere Tabellen scrollen lokal. Kalender und Zentralbank-Briefings wurden
  an die Mindestbreite angepasst; Regime-Karten haben verlässliche Abstände.
- Die USD-Relativwirkung zeigt den tatsächlichen Basispunktwert statt eines
  dekorativen, fest gefüllten Rings. Die Mindestabdeckung ist ausdrücklich benannt.
- Import/Export besitzt eine Abschnittsnavigation für Dateien, Brokerhistorien,
  Backups und Migration. Bestehende Bestätigungen und Guardrails bleiben bestehen.
- Informationsdichte wird tatsächlich auf die gemeinsamen Karten und Tabellen
  angewendet; Speichern aktualisiert den Settings-Cache und meldet Fehler.
- Chart-Schrift, Tooltip-Kontrast und Legenden wurden angeglichen;
  reduzierte Bewegung wird berücksichtigt. Chart-Daten und Berechnungen bleiben
  unverändert.

## Review-Artefakte

Die ignorierten Artefakte unter
`apps/desktop/output/playwright/ui-refresh/` enthalten:

- `review.html`: Galerie aller 20 Seiten, Ausgangsstand/Ergebnis,
  1440/1024 px und zusätzliche Provider-Testansichten; Links auf Dialoge.
- `baseline/src`: Quellstand zu Beginn dieses Auftrags für einen sicheren
  Vergleich trotz vorher bestehender Änderungen; Testdateien tragen zusätzlich
  `.snapshot`, damit Vitest sie nicht doppelt ausführt.
- `before/`, `after/`, `provider/`, `flows/`, `flows-extra/`: Screenshots,
  zugängliche DOM-Snapshots und strukturierte Prüfergebnisse.
- `focused-checks.json`: geprüfte Fokus-Rückkehr, Dichte und Positionsrechner.
- `changed-files.json`: 37 Frontend-Dateien gegenüber dem Auftragsbeginn.
- `tests-final.log`, `build.log`, `lint-final.log`, `format-final.log`:
  Abschlussprotokolle.

Die Tests verwenden eigene Browser-Kontexte. Persönliche Daten, bestehende
Quelländerungen und native Dateien wurden nicht als Testmaterial verändert.
