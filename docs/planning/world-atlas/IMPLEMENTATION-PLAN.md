# Weltatlas – Umsetzung, Architektur und Abnahme

Stand: 8. September 2026. Auftrag: weltweiter Atlas mit vielen geordneten
Wirtschaftsbereichen, bildlicher Orientierung, Demografie und langen historischen
Perspektiven. Die umfangreiche Planung ist der erste Meilenstein; die folgende
Produktimplementierung bleibt Teil des aktiven Ziels.

## 1. Geprüfter Ausgangspunkt

Source of Truth ist `apps/desktop`. Gelesene Integrationspunkte:

| Vorhanden | Relevanz |
| --- | --- |
| `src/App.tsx` | Lazy Routes; `/world-atlas` ist noch nicht vorhanden |
| `src/components/layout/market-context-navigation.tsx` | Marktkontext-Navigation mit aktuell acht Ansichten |
| `src/components/layout/app-shell.tsx` | Seitentitel, Navigation, Dichte und Tastaturbedienung |
| `src/features/economic-data/` | Vorhandene EODHD-Wirtschaftsdatenansicht |
| `src/features/regime-insights/` | Bisher spezielles China-CPI/AUDUSD-Regimemodul |
| `src/charts/base-chart.tsx` | ECharts-Integration für wiederverwendbare Grafiken |
| `src/services/commands.ts`, `src/types/domain.ts` | Öffentliche Fassade und Verträge |
| `src-tauri/src/commands/eodhd_prices.rs` | Bestehender Preisclient; Adjusted Close und ein ETF-Proxy sind implementiert |
| `src-tauri/src/database/mod.rs` | AppPaths, AppState, SQLite, Migrationen und Initialisierung |
| `src-tauri/src/commands/data_transfer.rs` | Sicherungsformat und kontrolliertes Restore |
| `src-tauri/migrations/0001…0046` | Beim Planungsbeginn vorhandene Migrationen |

Der Arbeitsbaum enthielt zu Beginn Änderungen zur Trade-Screenshot-Erfassung
und zugehörige Backend-/Frontend-Verträge. Sie werden weder zurückgesetzt noch
als Atlasänderung verbucht. Vor Änderungen an gemeinsam genutzten Dateien wird
ihr tatsächlicher neuer Stand erneut gelesen. `apps/api` und `apps/web` bleiben
außerhalb des Implementierungsauftrags.

## 2. Architekturentscheidungen

### ADR-A01: Eigener Bereich mit gemeinsamer Infrastruktur

Atlas ist ein eigener Produktbereich. EODHD-Preisclient, Fehlerbehandlung,
Designsystem, Charts und Query-Infrastruktur werden wiederverwendet. Die neue
Weltstatistik wird nicht in neun Currency-Slots oder die bestehende Pair-Heatmap
gepresst. Macro-/Rates-Signale behalten ihre bestehenden Regeln und Quellen.

Die ausdrücklich gewünschte neue Statistikfunktion erlaubt neue öffentliche
Quellen **innerhalb des Atlas**. Das ist eine Erweiterung des Produkts, kein
Wiedereinbau früherer Excel-/BIS-Fallbacks in die Fundamentals-Pipeline.

### ADR-A02: Öffentliche Daten als wiederaufbaubarer Atlas-Cache

Empfehlung: separate SQLite-Datei unter
`PersonalMacro/atlas/cache.sqlite` für öffentliche Beobachtungen,
Provider-Metadaten, Provenienz und abgeleitete Profile. Größere öffentliche
Quelldateien liegen begrenzt unter `PersonalMacro/atlas/raw/`.

Grund: weltweite Jahresreihen und spätere Langzeithistorien sollen Journal-
Backups und Journal-Abfragen nicht unnötig vergrößern. Der Atlas-Cache erhält
eigene additive Migrationen, eigenen Pool, Busy Timeout, WAL und klar
abgegrenzte Fehlerbehandlung. Ein kaputter oder fehlender Cache verhindert
keinen Journal-Start. Er wird nicht ungefragt gelöscht.

Favoriten, zuletzt genutzte Darstellung und persönliche Notizen sind echte
Benutzerdaten. Sie liegen in der bestehenden gesicherten Datenbank. Für neue
Tabellen wird beim Implementieren die dann nächste freie Hauptmigration
verwendet. Eine Notiz speichert die referenzierte Quelle/Rezeptversion und bei
Bedarf ein kleines selbsttragendes Abbild der betrachteten Datenpunkte. Sie
bleibt auch nach einem späteren öffentlichen Cache-Neuaufbau nachvollziehbar.

Keine Gesundheitsdiagnose oder spirituelle Profilklassifikation ist für diese
Funktionen notwendig. Die Präferenz heißt schlicht `presentation: visual`.

### ADR-A03: Codebasierte Kataloge, überprüfte Providerzuordnung

Die Planungskataloge werden vor Übernahme validiert und in kompakte
Produktressourcen übersetzt. Regionen und Themen sind schon ohne Netz browsebar.
Jede Datenzuordnung besitzt einen überprüfbaren Provider-/Serienschlüssel.
Fuzzy-Treffer erzeugen Kandidaten; sie erzeugen keine freigegebene Sektorwertung.

Der M49-Snapshot kann kontrolliert aktualisiert werden. Providergebiete,
historische Länder und alternative Gruppierungen erhalten versionierte
Crosswalks. Vollständige Weltabdeckung bedeutet nicht, dass jede Quelle exakt
denselben Gebietskatalog hat.

### ADR-A04: Eine klar bezeichnete Ansicht je Aussageart

`structure`, `development`, `market_cycle`, `valuation`, `projection`, `history`
und `hypothesis` sind eigenständige Verträge. Ein fehlender Bewertungswert
wird nicht mit einer Kurszykluszahl aufgefüllt. Falls ein Thema beide bietet,
kann der Nutzer bewusst zwischen den Perspektiven wechseln.

### ADR-A05: Kein zusätzlicher bezahlter Dienst erforderlich

Startbasis sind öffentliche Downloads/APIs und das vorhandene EODHD.
Erklärtexte werden deterministisch aus geprüften Datenmerkmalen und
redaktionellen Vorlagen erzeugt. Ein LLM-Abonnement oder zusätzliche
Brokerverbindung ist keine Voraussetzung. Ein nicht passendes kostenloses
Angebot wird nicht aus Bequemlichkeit als passendes ausgegeben.

## 3. Geplante Komponenten

```text
apps/desktop/src/features/world-atlas/
  world-atlas-page.tsx          Region/Thema, Bildansicht, Zustand
  atlas-navigation.tsx         Breadcrumb, Themen, Suche, Vergleich
  atlas-detail.tsx             Hauptbild, Kurzerklärung, Quellen-Details
  atlas-map.tsx                Optionale Regionsauswahl mit Listenzugang
  atlas-wave-chart.tsx         Markt- und separat markierte Bewertungswelle
  atlas-structure-chart.tsx    Anteile, Altersstruktur, Größenvergleich
  atlas-history-chart.tsx      Lange Zeitleiste, Lücken, Ereignisse
  atlas-projection-chart.tsx   Varianten und Quellenunsicherheit
  atlas-explanations.ts        Nachvollziehbare deutsche Textvorlagen
  atlas-catalog.ts             Geprüfte statische Katalogressourcen
  atlas-types.ts               Feature-Verträge, in domain.ts eingebunden
  world-atlas.css              Bestehende Tokens, lokal begrenzte Darstellung

apps/desktop/src-tauri/src/
  commands/world_atlas.rs      Dünne validierende Command-Schicht
  world_atlas/catalog.rs       Geografie, Taxonomie, explizite Zuordnungen
  world_atlas/store.rs         Separater Cache und Provenienz
  world_atlas/providers/       WDI, WPP, IRENA, UIS, EODHD, weitere Quellen
  world_atlas/sync.rs          Quotas, Wiederaufnahme, Korrekturen
  world_atlas/metrics.rs       Regeln und versionierte Transformationen
  world_atlas/quality.rs       Coverage, Freshness, Vergleichbarkeit
```

Die konkrete Aufteilung darf beim Implementieren vereinfacht werden, wenn sie
gleichwertige fachliche Grenzen erhält. Neue schwere Bibliotheken werden nicht
vorausgesetzt. Rust besitzt Reqwest, Serde, SQLx, CSV, Calamine und ZIP; das
Frontend besitzt ECharts und zugängliche UI-Primitiven.

## 4. Metadaten und Tabellenentwurf

| Entität | Wesentliche Felder |
| --- | --- |
| `atlas_geographies` | stabile ID, Gebietstyp, M49/ISO, Namen, Eltern, Gültigkeitsbereich |
| `atlas_geo_crosswalks` | Provider, Providergebiet, Atlasgebiet, Version, Passungsgrund |
| `atlas_topics` | Hauptfeld, Gruppe, Thema, deutsche Synonyme, mögliche Perspektiven |
| `atlas_sources` | Provider/Datensatz, URL, Abrufmethode, Lizenz, Quota, Schema-/Releaseversion |
| `atlas_series` | Quellenkennung, Thema, Gebiet, Population/Branche, Einheit, Nenner, Währung, Preisbasis, Frequenz, Methodik |
| `atlas_observations` | Reihe, Bezugsperiode, Wert oder fehlend, Originalflag, Beobachtungsart, Szenario, Jahrgang/Version |
| `atlas_ingest_runs` | Start/Ende, Quelle, Seiten, Cursor, Status, Anzahl, begrenzter Fehlercode |
| `atlas_source_objects` | Quelle, Hash, Dateityp, Revision, Abrufdatum, erlaubter Cachepfad |
| `atlas_profiles` | Reihe, Perspektive, Rezeptversion, Eingabeversion, Datenstand, Kurvenpunkte, Qualitätsmerkmale |
| `atlas_coverage` | Gebiet/Thema/Ansicht, Prüfstatus, passender Datensatz, erster/letzter Zeitraum, Lücken/Grund |
| `atlas_context_events` | Ereignis, exakter Zeitraum/Unsicherheit, Gebietsbezug, Quelle, Aussageart |
| Benutzerdaten | gespeicherte Ansichten, Favoriten, lokale Notizen mit stabilen Quellenreferenzen |

Mehrdimensionale Quellen dürfen nicht in einen unvollständigen
`country + indicator + year`-Schlüssel gepresst werden. Alter, Geschlecht,
Einheit, statistische Variante und Szenario gehören gegebenenfalls zur
Serienidentität. Der eindeutige Wertschlüssel enthält Serie, Periode und
Quellenjahrgang. Publikations- und Abrufdatum sind getrennt.

Indizes sichern Quelle/Gebiet/Thema/Periode, den Zugriff auf neueste Daten und
aktive Profile ab. Beobachtungen werden atomar gestaged/übernommen. Änderungen
an Mapping oder Rezept invalidieren ausschließlich davon abhängige Profile.

## 5. Command-Fassade und UI-Zustände

Vorgeschlagene native Befehle:

- `get_atlas_catalog`: Geografie, Themen, gespeicherte Auswahl und Quellenstatus.
- `get_atlas_overview`: begrenzte Themenübersicht für eine Region oder ein Thema.
- `get_atlas_series`: eine geprüfte Serie mit Metadaten und gewünschter Perspektive.
- `compare_atlas_series`: gemeinsamer Zeitraum, Einheiten und Vergleichbarkeitsprüfung.
- `sync_atlas_sources`: explizite Quellen/Serien, begrenzter Job, sofortige Job-ID.
- `get_atlas_sync_status`: Fortschritt, Datenstand, wiederholbare Fehler.
- `save_atlas_view` und `save_atlas_note`: ausschließlich lokale Benutzerdaten.

Einbindung wie im Repository vorgeschrieben: Rust-Command, Registrierung,
TypeScript-Vertrag und `api`-Fassade. Komponenten rufen nicht selbst `invoke`
oder Anbieter-URLs auf. Query Keys verwenden `atlas`, Region/Thema/Ansicht,
Rezeptversion und Zeitraum. Mutationen invalidieren passende Katalog-/Profil-
und Benutzerdaten-Keys.

Zustände: initial, lädt, verfügbar, veraltet, teilweise, noch nicht geprüft,
keine passende Reihe, Historie zu kurz, Vergleich nicht möglich,
Quelle fehlgeschlagen und Native-Funktion erforderlich. Ein Datenfehler bleibt
vom Status einer persönlichen Notiz getrennt.

Browser-Vorschau: echte Katalognavigation und ausdrücklich bezeichnete
Darstellungsbeispiele sind möglich. Kein scheinbar erfolgreicher nativer
Download, SQLite-Schreibvorgang oder personalisierter Live-Datensatz wird
simuliert. Die native Produktabnahme bleibt zwingend.

## 6. Berechnungsrezepte vor der Freigabe

### Marktwelle

Ein Kandidat für das erste validierte Rezept verwendet Monatswerte aus
Adjusted Close beziehungsweise einem geeigneten Total-Return-Index,
logarithmische Preise, einen einseitigen mehrjährigen Trend und eine
zurückblickende Glättung des Trendabstands. Die Darstellungsposition wird aus
der eigenen historischen Verteilung ermittelt. Referenz- und Glättungsfenster
werden als Rezeptparameter gespeichert, nicht im Chart versteckt.

Vor Festlegung der Standardparameter werden lange Aktiensektoren,
Länderindizes, ein stark wachsendes Thema, ein strukturell fallendes Thema,
eine flache Reihe, eine Krise und Reihen mit Ausschüttungen/Splits verglichen.
Ziel ist geringe kurzfristige Unruhe bei sichtbarer langfristiger Veränderung.
Eine Glättung mit schöner Optik allein ist kein fachlicher Nachweis.

Pflichten: nur damalige oder ausdrücklich als rückblickend revidiert
gekennzeichnete Daten, ausreichender Vorlauf, sichtbare Aufbauphase, kein
Normwert bei fehlender Streuung, keine Regression/Glättung über große Datenlücken.
Mehrere gleich hohe Wellen bedeuten ähnliche historische Positionen und keine
identische absolute Bewertung. Relative Stärke zu einem Marktbenchmark ist eine
separate, explizite Ansicht mit gleicher Währungsbasis.

### Bewertung

Verhältniszahlen pro geeigneter Branche historisch vergleichen. Verlust-KGVs,
Methodenwechsel, wechselnde Firmenzahl und sektorübliche Kapitalintensität
werden berücksichtigt. Die Vergleichsbasis steht im Profil. Kein universelles
KGV und kein beliebig gewichteter Mischscore. Nur historische Momentaufnahmen
erlauben keine monatlichen Zwischenwerte; Verbindungslinien sind visuelle
Hilfen, keine erfundenen Beobachtungen.

### Demografie, Struktur und Projektion

Größen/Anteile und Altersklassen erhalten ihre eigentliche Bedeutung.
Projektionsvarianten und Wahrscheinlichkeitsbänder werden nur aus Quellen
übernommen, die genau diese Bedeutung dokumentieren. Niedrig-/Hochvarianten
sind nicht automatisch ein Konfidenzintervall. Szenariobeginn ist quellen- und
releaseabhängig, nicht automatisch das heutige Kalenderjahr.

### Jahrhundertperspektive und Thesen

Lange Rekonstruktionen und belegte Ereignisse werden zunächst deskriptiv
dargestellt. Statistische Periodensuche ist eine eigenständige Analyse mit
Sensitivitätsprüfung, Nullmodellen, Mehrfachtestkontrolle und Prüfung außerhalb
der zur Auswahl verwendeten Daten. Ein fixes theoretisches Sinusschema ist
niemals der Standard für reale Länderwerte. Die These bleibt sichtbar eine
These, auch wenn eine anschauliche Kurve danebensteht.

## 7. Umsetzungsreihenfolge mit fortbestehendem Gesamtumfang

| Paket | Ergebnis | Fertig, wenn |
| --- | --- | --- |
| A0 Planung | Umfang, Quellen, UX, Datenmodell, erste reale Proben | Alle Planungsartefakte konsistent, Quellen/Unsicherheiten dokumentiert |
| A1 Weltverzeichnis und Datenkern | Alle Kataloggebiete, Themen, Suche, Crosswalks, lokaler Cache, Metadatenverträge | Kein Hardcoding auf Beispielstaaten; native Initialisierung und Katalog funktionieren |
| A2 Weltweiter statistischer Grundbestand | WDI-Daten über alle verfügbaren Gebiete, Coverage und Datenstände | Pagination, Revisionen, Fehler und Lücken geprüft; Weltkarten und Linien zeigen echte Werte |
| A3 Demografie und Struktur | WPP-Alter/Kohorten, Pyramiden, gemeinsame Vergleichszeiträume, Projektionen | Historie/Szenarien getrennt und alle verfügbaren Gebiete ansteuerbar |
| A4 Sektoren, Märkte und Bewertung | Geprüfte EODHD-Vertreter, Marktzyklen, geeignete Bewertungsdaten | Kein Proxy-Mismatch, keine Bewertung aus Kurs allein, kurze Historien korrekt behandelt |
| A5 Thematische Tiefe | Energie/IRENA, Bildung/UIS, Arbeit/ILO, Landwirtschaft/FAO, Gesundheit, Technik und regionale Ergänzungen | Alle Kataloggruppen bearbeitet; zugeordnet oder nach echter Prüfung begründet unverfügbar |
| A6 Jahrhundertperspektiven | Maddison/JST, Grenzen/Brüche, Ereignisse, getrennte Thesenkarten | Rohdaten-/Länderabdeckung geprüft, keine künstlichen Jahrhunderthistorien oder Zukunftsgewissheit |
| A7 Visuelle Nutzbarkeit und eigener Arbeitsfluss | Bildansicht, Karten/Liste, Vergleiche, Favoriten, Notizen, Wiederaufnahme | Tastatur, Fokus, geringe Informationslast, sichere Benutzerdaten und Offline-Nutzung geprüft |
| A8 Weltweite Abnahme | Vollständiger Anforderungsabgleich und native Endprüfung | Alle untenstehenden Anforderungen belegt; offene Implementierung wird nicht durch grünes Basistesting ersetzt |

Die Nutzerbeispiele sind frühe vertikale Prüffälle in dieser Reihenfolge,
keine Begrenzung des geografischen oder thematischen Endumfangs. Weitere
Regionen werden schon in A1/A2 systematisch einbezogen, nicht erst am Ende
nachträglich ergänzt.

## 8. Abnahmematrix für das vollständige Ziel

Alle Produktanforderungen sind beim Planungsabschluss noch **offen**. Die
zugehörige Evidenz muss an der tatsächlich laufenden Anwendung erhoben werden.

| ID | Anforderung | Notwendiger Nachweis |
| --- | --- | --- |
| R01 | Alle Weltregionen und katalogisierten Gebiete erreichbar | Vollständiger Katalogtest, Provider-Crosswalk-Audit, UI-Suche inklusive kleiner Gebiete |
| R02 | Deutschland, USA, Indien, China vollständig im selben System | Native Nutzerpfade in allen vier Ländern, geeignete echte Reihen, eindeutige Datenstände |
| R03 | Sehr breite geordnete Wirtschaftsthemen | Alle Themen-IDs validiert; jede Gruppe in Navigation; Zuordnung/Recherchegrund statt pauschalem Platzhalter |
| R04 | Region → Thema und Thema → Regionen funktionieren | UI-Integrationstest inklusive Zurück, persistierter Auswahl und Vergleich |
| R05 | Bildorientierung ohne erforderliche Zahlentabellen | Sichtprüfung der Kernaufgaben in Bildansicht; Bedeutung/Quelle trotzdem verständlich |
| R06 | Langfristige Marktwellen | Referenzdatensätze, native Rezeptberechnung, Chart-/Wertübereinstimmung, keine Zukunftslecks |
| R07 | Bewertung von Kurslage unterscheidbar | Verlust-/Fehlwert-/Historienfälle, klare Ansichtskennzeichnung, keine Ersatzwertung |
| R08 | Demografie und Altersstruktur weltweit nach Verfügbarkeit | WPP/WDI-Abdeckungsprüfung, Altersklassen, Nenner, Quellenstatus, Pyramidenvergleich |
| R09 | Bildung Indien und Solar/Energie Afrika fachlich korrekt | UIS/IRENA-Reihen oder nachvollziehbarer geprüfter Fehlgrund; keine falsch umbenannten globalen Proxies |
| R10 | Wasserstoff, Kernenergie, Healthcare und weitere Sektoren | Geprüfte Vertretung/Definition, Historie, Kosten/Tarif; aktive UI-Pfade |
| R11 | Jahrhundertperspektiven und Zyklusthesen | Tatsächlich geprüfte Langreihen, historische Brüche, eigene Theorieansicht, keine Zyklusuhr |
| R12 | Prognosen als bedingte Szenarien erkennbar | Getrennte Quelle/Variante/Zeichenart, korrekter quellspezifischer Projektionsbeginn |
| R13 | Keine zusätzliche teure API notwendig | Funktionierende kostenlose Grundquellen; vorhandenes EODHD soweit berechtigt; keine bezahlte Pflichtabhängigkeit |
| R14 | Ruhe und schrittweise Information | Keine automatische Bewegung/Umordnung, wenige gleichzeitige Bilder, sichtbarer Pfad, Fokus-/Kontrastprüfung |
| R15 | Local-first, keine Journalübermittlung | Host- und Payload-Prüfung, Secrets-Redaction, Offline-Lesetest, native Speicherkontrolle |
| R16 | Fehlend/unklar/alt wird ehrlich gezeigt | Deterministische Fälle für alle Status, keine Null-Imputation und keine geglätteten Lücken |
| R17 | Bestehende Produktfunktionen und Daten bleiben korrekt | Relevante Regressionstests, Migrations-/Backup-/Restore-Proben mit Testdaten, echter Tauri-Start |
| R18 | Gesamtumfang tatsächlich umgesetzt | Dateistand, native Pfade, Quellenadapter und Evidenz jeder Anforderung gemeinsam auditieren |

## 9. Tests nach fachlichem Risiko

**Kataloge:** eindeutige IDs, gültige Eltern, keine Zyklen, Quellenreferenzen,
deutsche Labels, US/Region-Amerika-Unterscheidung, Sondergebiete, stabile
Sortierung, Crosswalk-Multiplikation und überschneidende Gruppen.

**Provider:** Pagination auch jenseits einer Seite, Timeouts/429/5xx,
Antwortgrößen, Abbruch/Wiederaufnahme, Metadatendrift, Deduplizierung,
Revisionen, verschobene Jahresstände, Quellenflags, legitime Werte über 100,
fehlende/malformed Werte und explizite Quellenidentität.

**Berechnung:** Splits/Dividenden, längere Auf-/Abwärtstrends, konstant/zu kurz,
fehlende Streuung, historische Lücken, einseitige Filter, gemeinsame Währung,
Gewinne negativ/fehlend, Vergleichsgruppenwechsel, Anteilsnenner und
unterschiedliche Projektionsvarianten. Wissenschaftliche Rezeptprüfung nicht
durch Tests ersetzen, die nur die eigene Implementierung nachrechnen.

**UX:** zentrale Nutzerpfade in Deutschland/USA/Indien/China, zwei afrikanische
Solarbeispiele und kleine Datengebiete; tastaturbedienbare Karte plus Liste;
Bild/Details; veraltete/fehlende Daten; lange Beschriftungen; Farbe plus Text;
reduzierte Bewegung; Quellenhinweise bleiben auch ohne Hover erreichbar.

**Native Datenhaltung:** leere und bestehende temporäre Journal-Testdatenbank,
leerer/aktualisierter Atlas-Cache, sicherer Neustart, separate Fehlerpfade,
gesicherte Favoriten/Notizen, Restore mit fehlendem öffentlichen Cache,
Offline-Neustart. Keine persönliche Datenbank für Entwicklung ändern.

**Qualitätsgates:** Typecheck, relevante Vitest-Tests, Build; Rust-Fmt,
relevante Unit-/Repository-Tests und Clippy mit `-D warnings`. Bei Cache,
Migrationen und nativen Quellen echter Tauri-Start ohne neue
Initialisierungswarnungen. Browser-Vorschau allein genügt nicht.

## 10. Praktische Leistung und Betrieb

Katalogsuche lokal; Diagramme laden nur sichtbare Reihen und aggregieren
dichte Historien. Jahresdaten werden nicht auf Tagesraster aufgebläht.
Anfangs ein kleiner begrenzter globaler Grundbestand, anschließend ausgewählte
Vertiefungen und ein vollständig durchsuchbarer Quellen-/Themenkatalog.
Dieser Ladeplan begrenzt Bandbreite, nicht die angebotenen Weltregionen.

Performancebudgets sind beim Implementieren auf dem vorhandenen Rechner zu
messen: schnelle lokale Navigation, kein blockierter UI-Thread beim Einlesen,
begrenzte Diagrammpunkte, abbruchsicherer Import und mehrere parallele
Journalaktionen während eines Downloads. Budgets werden erst nach Messung als
erreicht gemeldet.

Quellenaktualisierungen sind unabhängig von Benutzeransichten. Ein Download
ändert nicht plötzlich die Sortierung oder Auswahl. Letzter erfolgreicher
Stand bleibt mit Datum sichtbar, auch bei Netzfehlern. Begrenzte Retries
erzeugen keine dauernden Toasts; ein zentraler Quellenstatus genügt.

## 11. Planungsstand und nächster Schritt

A0 ist abgeschlossen. Die Produktumsetzung hat mit Weltverzeichnis,
Themennavigation, Cache und WDI-Adapter begonnen. Der aktuelle Umfang sowie
verifizierte und noch offene Anforderungen stehen in
[IMPLEMENTATION-STATUS.md](IMPLEMENTATION-STATUS.md). Die Abnahmematrix oben
bleibt der Maßstab für das vollständige Ziel; die erste statistische Basis
ersetzt nicht die übrigen Arbeitspakete.
