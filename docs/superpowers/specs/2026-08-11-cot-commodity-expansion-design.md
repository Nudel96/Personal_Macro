# COT Commodity Expansion – Design

**Datum:** 2026-08-11  
**Status:** Vom Benutzer im Gespräch freigegeben

## Ziel

Die produktive COT-Seite der Desktop-Anwendung wird um 14 liquide und für das
Trading relevante Commodity-Futures erweitert. Die neuen Märkte verwenden
dieselbe offizielle Datenquelle und dieselbe aktive Bewertungsmethodik wie die
bereits vorhandenen COT-Kontrakte.

Die Erweiterung betrifft ausschließlich `apps/desktop`. Die älteren Referenz-
projekte unter `apps/api` und `apps/web` werden nicht geändert.

## Verbindliche Märkte

| Symbol | Anzeigename | Assetklasse | CFTC-Code |
|---|---|---|---|
| `NATGAS` | Natural Gas | Energie | `023651` |
| `RBOB` | RBOB Gasoline | Energie | `111659` |
| `PLATINUM` | Platin | Metalle | `076651` |
| `PALLADIUM` | Palladium | Metalle | `075651` |
| `CORN` | Mais | Getreide | `002602` |
| `WHEAT` | Weizen (SRW) | Getreide | `001602` |
| `SOYBEANS` | Sojabohnen | Getreide | `005602` |
| `COFFEE` | Kaffee | Soft Commodities | `083731` |
| `COCOA` | Kakao | Soft Commodities | `073732` |
| `SUGAR` | Zucker No. 11 | Soft Commodities | `080732` |
| `COTTON` | Baumwolle No. 2 | Soft Commodities | `033661` |
| `LIVE_CATTLE` | Live Cattle | Vieh | `057642` |
| `LEAN_HOGS` | Lean Hogs | Vieh | `054642` |
| `FEEDER_CATTLE` | Feeder Cattle | Vieh | `061641` |

Die Symbolnamen sind stabile interne COT-Identifikatoren. Broker- oder
Seasonality-Symbole werden weiterhin über die vorhandene explizite Verknüpfung
zugeordnet und nicht aus dem CFTC-Symbol abgeleitet.

## Datenquelle und Methodik

Für alle neuen Kontrakte gelten unverändert:

- Quelle: CFTC Public Reporting Environment
- Dataset: Legacy Futures Only (`6dca-aqww`)
- Teilnehmergruppe: Non-Commercial
- Reportumfang: Futures Only
- Historienfenster: 15 Jahre
- Freshness-Grenze: 10 Tage
- Scoring-Version: `cot-v4-legacy-noncommercial`

Die aktiven Rohfelder, Long-Share-Berechnung, Wochenveränderung, langfristigen
Perzentilkomponenten, Persistenzbewertung, Crowding-Regeln und Qualitätsgrenzen
werden nicht verändert. Futures-and-Options-Combined, TFF Leveraged Funds und
Disaggregated Managed Money sind keine Fallbacks.

Jeder ausgewählte CFTC-Code besitzt mindestens 784 vollständige Wochenberichte
zwischen dem 2. August 2011 und dem 4. August 2026. Damit überschreiten alle
neuen Märkte die bestehenden Grenzen von 104 Wochen Mindesthistorie und 156
Wochen gültiger Historie.

## Architektur und Datenfluss

Die neuen Märkte werden in der bestehenden `CONTRACTS`-Definition unter
`apps/desktop/src-tauri/src/commands/cot.rs` ergänzt. `seed_contracts` schreibt
sie über den vorhandenen Upsert-Pfad in `cot_contracts`.

```text
CFTC Legacy Futures Only
  → gemeinsamer Abruf aller aktiven Contract-Codes
  → Parser für Non-Commercial Long/Short
  → cot_legacy_source_rows
  → cot_legacy_observations
  → unveränderte COT-v4-Bewertung
  → COT-Dashboard und Asset-Detailansicht
```

Es ist keine neue SQLite-Migration erforderlich, weil keine Tabellen, Spalten,
Constraints oder persistierten Verträge geändert werden. Die vorhandene Seed-
Routine fügt neue Symbole kontrolliert hinzu und aktualisiert deren Metadaten.

Nach der Erweiterung umfasst der Abruf ungefähr 29.000 Wochenzeilen und bleibt
damit unter dem bestehenden CFTC-Limit von 50.000 Zeilen. Pagination ist für
diesen kuratierten Umfang nicht erforderlich. Der Umfang darf später nicht
ungeprüft so weit erhöht werden, dass das Limit erreicht werden kann.

## Assetklassen und Oberfläche

Die vorhandene COT-Oberfläche erzeugt die Assetklassenfilter dynamisch. Durch
die neuen Seeds erscheinen zusätzlich beziehungsweise erweitert:

- Energie
- Metalle
- Getreide
- Soft Commodities
- Vieh

Detailauswahl, Cross-Market-Rangliste, Long-/Short-Darstellung, historische
Charts, Reportdatum, Datenqualität und Broker-Symbol-Verknüpfung verwenden die
vorhandenen Komponenten. Es wird keine parallele Commodity-Seite eingeführt.

Die zusätzlichen Märkte erhalten dieselben Loading-, Empty-, Error- und Stale-
Zustände wie bestehende COT-Kontrakte. Fehlende Beobachtungen werden als nicht
verfügbar dargestellt und niemals als neutral oder null interpretiert.

## Abgrenzung zur Währungsmatrix

Alle neuen Commodity-Seeds verwenden `currency: None`. Dadurch:

- entstehen keine künstlichen Commodity-/FX-Paare;
- bleiben Currency-COT-Signale unverändert;
- bleibt die Base-minus-Quote-Matrix unverändert und antisymmetrisch;
- ändern sich Macro-Currency-Scores nicht allein durch diese Erweiterung.

Die Erweiterung beeinflusst nur die Cross-Market- und Einzelasset-Auswertung.

## Fehler- und Sicherheitsverhalten

- Ein unvollständiger CFTC-Datensatz wird weiterhin verworfen.
- Ein fehlgeschlagener Sync erhält den letzten vollständigen Datenstand.
- Journal, Trades und EODHD-Fundamentaldaten werden durch CFTC-Fehler nicht
  blockiert.
- Persönliche Journal- und Kontodaten werden nicht migriert oder verändert.
- Raw Payloads, Providerfehler und Logs behalten die bestehenden Grenzen.
- Browser-Fallbacks dürfen keine simulierten Live-CFTC-Daten ausgeben.

## Teststrategie

Die Implementierung erfolgt testgetrieben.

### Contract-Seeds

- Alle 14 Symbole sind eindeutig.
- Jeder Markt besitzt den freigegebenen CFTC-Code, Anzeigenamen, Assetklasse,
  `currency: None` und eine stabile Sortierreihenfolge.
- Die neuen Codes sind im gemeinsamen Legacy-Abruf enthalten.
- Der geschätzte maximale 15-Jahres-Abruf bleibt unter 50.000 Zeilen.

### Scoring und Datenfluss

- Natural Gas wird aus Code `023651` geparst und bewertet.
- Mindestens ein deterministischer Fixture-Test pro neuer Assetklasse prüft
  Long Share und Wochenveränderung.
- Unvollständige Zeilen, Nullnenner und veraltete Reports bleiben unavailable.
- Die Scoring-Version bleibt `cot-v4-legacy-noncommercial`.

### Währungsschutz

- Kein neues Commodity-Symbol erscheint in `CotCurrencySignal`.
- Anzahl und Inhalt der bestehenden Currency-Paare bleiben unverändert.
- Die bestehende Antisymmetrieprüfung bleibt grün.

### Oberfläche und Qualitätsgates

- Die neuen Assetklassen erscheinen in den dynamischen Filtern.
- Die Detailauswahl kann jeden neuen Markt öffnen.
- Fehlende und veraltete Daten werden korrekt dargestellt.
- Relevante Vitest- und Rust-Tests werden ergänzt.
- `pnpm typecheck`, relevante Frontendtests und `pnpm build` bestehen.
- `cargo fmt --all -- --check`, relevante Rust-Tests und
  `cargo clippy --all-targets -- -D warnings` bestehen.
- Die echte Tauri-App startet ohne neue COT-, Migrations- oder
  Initialisierungswarnungen.

## Nicht-Ziele

- keine Änderung der COT-v4-Formeln oder Schwellenwerte;
- keine neue Reportfamilie oder Teilnehmergruppe;
- keine Aufnahme aller 359 aktuell gemeldeten CFTC-Märkte;
- keine regionalen Gas-, Strom-, Emissions-, Crack- oder Basis-Spreads;
- keine Emerging-Market-Währungen oder VIX in diesem Paket;
- keine Änderungen an Seasonality-, Rates- oder EODHD-Methodik;
- keine neue Datenbankmigration;
- keine Änderungen an persönlichen Journal-, Trade- oder Kontodaten.

## Abnahmekriterien

Die Erweiterung ist abgeschlossen, wenn alle 14 Märkte nach einem erfolgreichen
CFTC-Sync mit Historie, Detailansicht und korrekter Assetklasse verfügbar sind,
Natural Gas über Code `023651` geladen wird, die Währungsmatrix unverändert
bleibt und alle risikoadäquaten Frontend-, Rust- und Tauri-Prüfungen bestehen.
