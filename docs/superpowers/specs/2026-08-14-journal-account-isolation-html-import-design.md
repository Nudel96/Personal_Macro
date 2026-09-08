# Journal-Konto-Isolation, MT5-Abschaltung und HTML-Historienimport – Designspezifikation

## Ziel

Das Tradingjournal von Personal Macro arbeitet künftig immer im Kontext genau
eines ausdrücklich ausgewählten aktiven Journal-Kontos. Übersicht, Trades,
Kalender, Analytics, Reviews, Playbook-Statistiken und Fehleranalyse dürfen
weder kontoübergreifende noch kontolose Kennzahlen laden. Die bisherige lokale
MetaTrader-5-Laufzeitverbindung wird vollständig entfernt. Historische Trades
werden stattdessen kontrolliert aus klassischen MetaTrader-HTML-Berichten in
das ausgewählte Journal-Konto importiert.

Vor der Inbetriebnahme wird der bestehende Journal-Inhalt nach einem
verifizierten Backup gezielt zurückgesetzt. Macro-, EODHD-, COT-, Zins-,
Seasonality-, Put/Call- und sonstige Marktdaten bleiben unverändert erhalten.

## Bestätigte Produktentscheidungen

- Es gibt genau ein global ausgewähltes Journal-Konto, keine Mehrfachauswahl
  und keine Option „Alle Konten“.
- Die Kontoauswahl ist auf allen kontobezogenen Journal-Seiten sichtbar und
  kein versteckter Bestandteil eines Filterdialogs.
- Ohne aktives ausgewähltes Konto werden keine kontoabhängigen Queries
  ausgeführt und keine Null- oder Gesamtdaten als Ersatz angezeigt.
- Die automatische und manuelle MT5-Laufzeitverbindung wird vollständig
  deaktiviert. Dies umfasst Journal-Synchronisierung, Kontoverknüpfung,
  Scheduler, Live Chart und den lokalen Python-Connector.
- Der HTML-Import ist ein manueller, nativer Zwei-Phasen-Import. Er stellt
  keine Verbindung zu MetaTrader her.
- Der einmalige Reset entfernt Journal-Ereignisdaten, Konten und MT5-Daten,
  erhält aber wiederverwendbare Journal-Definitionen sowie alle Macro- und
  Marktdaten.

## Ursache des bisherigen Konto-Leaks

Der persistierte Frontend-State `globalAccountIds` ist eine additive
Mehrfachauswahl. Alte oder archivierte IDs können darin unsichtbar bestehen
bleiben. Nur ein Teil des Dashboards übergibt diese Liste an das Backend;
Recent Trades, Trades, Kalender, Analytics, Reviews, Playbook und
Fehleranalyse laden heute teilweise ohne Konto-ID. Leere oder fehlende
`accountIds` bedeuten in den nativen Abfragen absichtlich „alle Konten“.

Die bestehende MT5-Implementierung verknüpft ein erkanntes Brokerkonto zwar
explizit mit einem lokalen Konto, ihr Hintergrundjob läuft jedoch fortlaufend.
Ein archiviertes oder später nicht mehr sichtbares Konto kann deshalb weiter
als Datenquelle bestehen. Die Kombination aus persistierter Mehrfachauswahl,
fehlenden Filtern und laufendem Connector erklärt die beobachtete fremde P&L.

## Einheitliche Kontoauswahl

### Zustandsmodell

`globalAccountIds: string[]` wird durch genau einen Wert ersetzt:

```ts
selectedJournalAccountId: string | null
```

Die persistierte Zustandsspeicherung erhält eine Versionsmigration:

- genau eine alte ID wird als Kandidat übernommen,
- keine oder mehrere alte IDs werden zu `null`,
- eine nicht mehr aktive oder unbekannte ID wird nach dem Bootstrap gelöscht,
- ein neu angelegtes Konto wird als Ergebnis dieser bewussten Aktion direkt
  ausgewählt,
- es wird niemals während eines Renderzyklus vorübergehend ohne Konto-ID eine
  kontoübergreifende Query ausgelöst.

### Gemeinsame Komponenten

- `JournalAccountProvider` lädt aktive Konten, validiert den persistierten
  Wert und liefert `loading`, `noAccounts`, `selectionRequired` oder `ready`.
- `JournalAccountSelector` ist ein zugängliches Radix-Select mit
  `aria-label="Tradingkonto"`, Kontoname, optional Broker/Basiswährung und
  sichtbarem Auswahlstatus. Es enthält keine Option für Gesamtdaten.
- `JournalPageHeader` setzt den Selector auf jeder Journal-Seite an derselben
  ersten Position der Header-Aktionen ein.
- `JournalAccountGate` zeigt ohne Konto einen deutschen Empty State mit Link
  zur Kontoverwaltung und verhindert alle kontoabhängigen Queries und
  Mutationen.

Der Selector erscheint auf:

- Übersicht,
- Trades einschließlich Papierkorb und Export,
- Kalender,
- Analytics,
- Reviews,
- Playbook,
- Fehleranalyse.

Der bestehende Dashboard-Filter bleibt für fachliche Filter wie Setup,
Richtung oder Zeitraum verfügbar. Konten werden daraus entfernt und zählen
nicht mehr als Filterchip.

### Verhalten ohne Konto

- Der Header und der sichtbare Selector bleiben vorhanden.
- Dashboard, Trades, Kalender, Analytics, Reviews und Fehleranalyse zeigen
  „Noch kein Tradingkonto“ und verlinken zur Kontoanlage.
- Trade-, Review-, Import- und Trade-Export-Aktionen sind deaktiviert.
- Playbook-Regeln und globale Kataloge dürfen weiter bearbeitet werden;
  kontoabhängige Zahlen werden als nicht verfügbar, niemals als `0`, gezeigt.
- Macro, COT, Rates, Seasonality und Research bleiben voll nutzbar.

Der aktuelle automatische Seed „Hauptkonto“ wird im nativen und im
Browser-Fallback entfernt. Ein Neustart mit null Konten bleibt bei null Konten.

## Verbindliche Konto-Isolation

Frontendfilter allein sind keine ausreichende Sicherheitsgrenze. Jeder
kontoabhängige native Command validiert eine nicht leere aktive Konto-ID. Eine
fehlende, unbekannte oder archivierte ID führt zu einem stabilen Fehlercode
`ACCOUNT_REQUIRED` beziehungsweise `ACCOUNT_NOT_FOUND`; sie bedeutet nie
„alle Konten“.

Die Query-Keys enthalten die Konto-ID:

```ts
["dashboard", accountId, filter]
["trades", accountId, filter]
["calendar", accountId, range]
["reviews", accountId]
["playbook", accountId]
["mistakes", accountId]
["deleted-trades", accountId]
```

Für die Bereiche gelten folgende Regeln:

- Dashboard-Metriken, P&L-Kurve, Performance-Kalender und Recent Trades
  verwenden dieselbe Konto-ID.
- Trades, Papierkorb, Restore, Direktlinks und Exporte sind kontogebunden.
- Kalender-Monats- und Jahresdaten sind kontogebunden.
- Analytics zeigt nur Startkapital, Kontostand und Trades des ausgewählten
  Kontos. Eine Gruppierung nach Konten entfällt.
- Reviews erhalten ein `account_id`. Liste, eingefrorener Snapshot,
  Eindeutigkeit und Zeitraum gelten je Konto.
- Playbook-/Setup-Definitionen bleiben global; `tradeCount` und weitere
  aus Trades abgeleitete Werte werden für das ausgewählte Konto berechnet.
- Fehlerdefinitionen bleiben global; Häufigkeit, Kosten und betroffene Trades
  werden für das ausgewählte Konto berechnet.
- Quick- und Guided-Trade übernehmen zwingend das global ausgewählte Konto.
  „Nicht zugeordnet“ und der Fallback auf `accounts[0]` entfallen.
- Der Positionsgrößenrechner verwendet ausschließlich das ausgewählte Konto.
- Browser-Fallback und native Implementierung besitzen dieselbe Semantik.

Die Datenbankmigration für Reviews bleibt upgrade-sicher: bestehende Reviews
werden nicht still gelöscht. `account_id` darf für den Migrationsbestand
vorübergehend null sein; neue Writes erfordern eine aktive ID. Die bisherige
globale UNIQUE-Regel wird durch eine Konto-, Typ- und Perioden-Eindeutigkeit
ersetzt.

## Vollständige MT5-Abschaltung

Folgende Laufzeitbestandteile werden entfernt:

- der automatische MT5-Scheduler,
- Erkennung, Kontoverknüpfung, Trennen und manueller Sync,
- der Einstellungsbereich „MetaTrader 5“,
- Broker-Balance, Equity, Login und Server in Journal-Kontoverträgen,
- Route und Navigation „Live Chart“,
- Market-/MT5-Frontend-Services und Browser-Fallbacks,
- native Market-/MT5-Commands,
- der eingebettete Python-Connector sowie ausschließlich dafür vorhandene
  Abhängigkeiten und Konfigurationshinweise.

Historische Migrationen werden nicht umgeschrieben. Die bestehenden
MT5-Tabellen dürfen als inaktive Upgrade-Historie im Schema verbleiben, sind
nach dem Reset leer und werden von keinem Laufzeitpfad mehr gelesen oder
beschrieben.

## Klassischer MetaTrader-HTML-Import

### Unterstützter Bericht

Die bereitgestellte Datei `ReportHistory-…html` ist ein statischer klassischer
MT5-Bericht in UTF-16LE. Sie enthält getrennte Tabellen für geschlossene
Positionen, Orders, Trades/Deals und offene Positionen. Die geschlossenen
Positionen besitzen eindeutige Positionsnummern sowie Öffnungs-/Schließzeit,
Symbol, Richtung, Volumen, Preise, Stop, Target, Kommission, Swap und Gewinn.

Die ebenfalls bereitgestellte moderne interaktive MT5-Grafikdatei enthält nur
Aggregate und keine einzelnen Trades. Sie wird mit
`UNSUPPORTED_AGGREGATE_REPORT` und einer verständlichen Exportanleitung
abgelehnt.

Version 1 importiert ausschließlich abgeschlossene Zeilen aus der klassischen
Tabelle `Positionen`. Orders und Deals dienen nur der Strukturvalidierung.
Offene Positionen und Balance-Buchungen werden in der Vorschau gezählt, aber
nicht als geschlossene Journal-Trades oder Cashflows erfunden. Teilfills und
Teilcloses werden nicht aus mehrdeutigen Deal-Reihen rekonstruiert.

### Nativer Zwei-Phasen-Ablauf

1. Der Benutzer wählt eine `.html`- oder `.htm`-Datei im nativen Dateidialog.
2. Zielkonto und IANA-Broker-Server-Zeitzone sind verpflichtend.
3. `preview_metatrader_html` liest und validiert die Datei, legt einen
   Preview-Run sowie normalisierte Zeilen an und liefert nur typisierte Daten.
4. Die UI zeigt gültige, ungültige, ignorierte, doppelte und konfliktbehaftete
   Zeilen sowie die verwendete Zeit- und P&L-Semantik.
5. `commit_metatrader_html` prüft erneut Run, unverändertes Zielkonto,
   Kontoaktivität und Konfliktfreiheit und schreibt alle Trades in genau einer
   SQLite-Transaktion.
6. Ein Fehler rollt den gesamten Commit zurück. Ein erneuter Import desselben
   oder eines überlappenden Reports erzeugt keine Duplikate.

Der Browser-Fallback meldet `DESKTOP_REQUIRED`; er liest oder simuliert keine
lokalen HTML-Importe.

### Parser- und Sicherheitsregeln

- HTML wird niemals im Browser/WebView gerendert, nie an `innerHTML` übergeben
  und kein Script wird ausgewertet.
- Es werden nur lokale Bytes gelesen. Pfad, Extension, Dateityp, Größe,
  Encoding und Parsergrenzen werden geprüft.
- Unterstützte Encodings sind mindestens UTF-16LE mit BOM und UTF-8.
- Der Parser extrahiert ausschließlich Text aus erlaubten Tabellenstrukturen.
- Externe Ressourcen, Scripts und Eventhandler werden weder geladen noch
  ausgeführt.
- Dateiinhalte, Kontoangaben und Handelswerte gelangen nicht in Logs oder
  Providerfehlermeldungen.
- Berichtskonto und Basiswährung werden gegen das gewählte aktive Journal-
  Konto beziehungsweise dessen bisherige Importquelle validiert.
- Zeitstempel `YYYY.MM.DD HH:mm:ss` besitzen keinen Offset. Eine explizite
  IANA-Zeitzone wird mit DST-Regeln in UTC umgewandelt; mehrdeutige oder nicht
  existierende lokale Zeitpunkte werden als ungültig markiert, nicht geraten.

### Fachliche Zuordnung

Für jede geschlossene Position entsteht genau ein Trade:

```text
source              = "metatrader_html"
source trade key    = provider/platform + report account + position id
status              = "closed"
direction           = buy -> long, sell -> short
opened_at            = report open time converted to UTC
closed_at            = report close time converted to UTC
gross_pnl_minor     = report profit
commission_minor    = report commission
swap_minor          = report swap
fees_minor          = 0 only because the closed-position table has no fee field
net_pnl_minor       = gross + commission + swap + fees
```

Dezimalwerte werden mit `rust_decimal` gelesen. Fehlende monetäre Felder werden
nicht still als neutral interpretiert; nur das nachgewiesen nicht vorhandene
Fee-Feld der unterstützten Tabelle besitzt den dokumentierten Wert null.

Eine neue Source-Link-Tabelle erzwingt pro Zielkonto und Quellidentität eine
Eindeutigkeit. Gleicher Schlüssel und gleicher Payload-Hash ist ein Duplikat;
gleicher Schlüssel mit verändertem Payload ist ein Konflikt und blockiert den
Commit. Die normalisierten Preview-Zeilen enthalten kein ausführbares HTML.

## Sicherer Journal-Reset

Der Reset ist ein expliziter nativer Vorgang und keine datenlöschende
Migration. Vor jeder Mutation wird über den bestehenden Backup-Pfad ein
vollständiges ZIP-Backup nach WAL-Checkpoint erstellt. Anschließend werden
Manifest, Entry-Größen, SHA-256-Werte, SQLite-Header und `PRAGMA quick_check`
geprüft. Erst ein vollständig validiertes Backup erlaubt den Reset.

Der Reset läuft in `BEGIN IMMEDIATE` und löscht in FK-sicherer Reihenfolge:

1. `mt5_sync_runs`, danach `mt5_accounts` mit allen MT5-Kindtabellen,
2. polymorphe Trade-Custom-Field-Werte und Trade-Tombstones,
3. `trades` mit Legs, Tags, Checklisten, Emotionen, Fehlern, Medien- und
   Macro-Kontextlinks,
4. `accounts` mit Cashflows,
5. Reviews, Ziele/Fortschritte, Metrik-Snapshots und Journal-Importläufe,
6. neue HTML-Source-Bindings und Source-Links.

Erhalten bleiben:

- Strategien, Setups, Setup-Versionen, Tags, Checklist-Vorlagen, Emotionen,
  Fehlerkatalog, Custom-Field-Definitionen und Layouts,
- Medien-Originale und Annotationen; nur Trade-Verknüpfungen verschwinden,
- Exporte und Backups,
- sämtliche Macro-, EODHD-, COT-, Zins-, Seasonality-, Market- und
  Put/Call-Tabellen.

Gespeicherte Konto-IDs in UI-State und Saved Filters/Views werden gelöscht
oder konto-neutralisiert. Nach der Transaktion müssen alle Reset-Tabellen null
Zeilen besitzen, `PRAGMA foreign_key_check` leer und `PRAGMA quick_check` `ok`
sein. Fingerprints der erhaltenen Macro-/Markttabellen werden vor und nach dem
Reset verglichen. Nach einem realen Neustart existiert weiterhin kein Konto.

## Fehler- und Ladezustände

- Konto fehlt: kontospezifischer Empty State, keine Query.
- Konto wurde archiviert: Auswahl löschen, Empty State zeigen, kein Fallback.
- Konto-Query scheitert: bestehende Daten nicht als kontoübergreifende
  Ersatzdaten anzeigen.
- HTML-Vorschau scheitert: keine Importzeilen committen.
- HTML-Commit scheitert: vollständiger Rollback, Preview bleibt prüfbar.
- Reset-Backup scheitert: keine Daten löschen.
- Reset-Verifikation scheitert: Transaktion zurückrollen beziehungsweise vor
  Mutation abbrechen und deutschen Fehler anzeigen.

## Tests und Abnahme

### Frontend

- Store-Migration für null, eine, mehrere und veraltete Konto-IDs.
- Selector und Gate für kein Konto, Auswahlpflicht, Kontoanlage, Wechsel und
  Archivierung.
- Jede Journal-Seite führt ohne Konto keinen kontoabhängigen Request aus.
- Wechsel von Konto A zu B zeigt ausschließlich B-Daten und verwendet getrennte
  Query-Keys.
- Quick-/Guided-Trade, Review und Import akzeptieren kein fehlendes Konto.
- Playbook-/Fehlerdefinitionen bleiben global, Aggregate sind kontospezifisch.
- Browser-Fallback besitzt dieselben Filterregeln und keinen Fake-HTML-Import.
- MT5-Einstellungen, Live-Chart-Route und Navigation sind nicht mehr vorhanden.

### Rust und SQLite

- Dashboard, Kalender, Trades, Reviews, Playbook und Fehleranalyse mit zwei
  Konten und gegensätzlichen P&L-Daten.
- Fehlende oder archivierte Konto-ID wird abgelehnt.
- Review-Eindeutigkeit gilt je Konto und Zeitraum.
- Migration funktioniert auf leerer und bestehender Testdatenbank.
- Synthetische UTF-16LE- und UTF-8-Berichte, deutsches Header-Mapping,
  Money-/Zeit-Konvertierung, DST-Fehler, moderne Reportablehnung,
  Duplikate, Konflikte und transaktionaler Rollback.
- Reset auf einer temporären Datenbank: alle Zieltabellen leer, alle
  Preserve-Fingerprints identisch, keine FK-Verletzung, Neustart ohne Seed.

### Reale Abnahme

- Typecheck, Vitest, Lint, Formatcheck und Frontend-Build.
- Rust-Tests, Formatcheck und Clippy ohne Warnungen.
- Native Tauri-App startet ohne MT5-Connector oder neue Warnungen.
- Die bereitgestellte klassische Datei wird ausschließlich als lokale
  Testeingabe verwendet und niemals ins Repository kopiert.
- Vor dem produktiven Reset wird ein verifiziertes Backup erstellt.
- Nach dem Reset: null Journal-Konten und null Journal-Ereignisdaten; Macro-,
  COT-, EODHD-, Rates-, Seasonality- und Put/Call-Fingerprints unverändert.

## Abgrenzung

Nicht Bestandteil dieser Ausbaustufe sind:

- automatische Broker- oder Terminal-Verbindungen,
- Orderausführung,
- Import offener Positionen,
- Rekonstruktion mehrdeutiger MT5-Teilausführungen als Legs,
- automatischer Import von Balance-Buchungen als Cashflows,
- Rendering oder interaktive Ausführung hochgeladener HTML-Dateien,
- kontoübergreifende Journal-Auswertungen.
