# OECD-Wohnvergleiche: Kaufpreise, Einkommen und Mieten

Stand: 9. September 2026. Die native OECD-Grundlage ergänzt die BIS-Preisbilder
um veröffentlichte Verhältnisse. Die Gesamtumsetzung des Atlas bleibt offen.

## Bedienung und Bildsprache

Unter **Leben & Versorgung → Wohnen & Immobilien** öffnen **Bezahlbarkeit von
Wohnen** und **Kaufpreise im Mietvergleich** die beiden Vergleichsgrundlagen.
Der direkte Wechsel zu den BIS-Wohnimmobilienpreisen erhält Land und Vergleich.

- **Zu Einkommen**: nominaler Hauspreisindex im Verhältnis zum nominalen
  verfügbaren Einkommen je Einwohner.
- **Zu Mieten**: nominaler Hauspreisindex im Verhältnis zum Mietpreisindex.
- **Hoch & Tief**: veröffentlichter Abstand zum jeweiligen langfristigen
  OECD-Durchschnitt. Obere und untere Bildhälfte teilen denselben Maßstab.
- **Verhältnis im Verlauf**: veröffentlichter Index mit Bezugsjahr 2015.
  Länder teilen den Maßstab, haben aber jeweils ihre eigene Bezugsbasis.

Die gesamte verfügbare Geschichte ist voreingestellt. Alternativ sind Zeiträume
seit 2000 oder 2010 wählbar. Zahlen, Tooltips und Quartalstabellen sind zunächst
verborgen. Zwei Länder teilen Kalender und Skala; die zweite Linie ist zusätzlich
gestrichelt. Ein Quellenvergleich benötigt denselben Abrufstand und gemeinsame
Quartale. Fehlt der Vergleich, bleibt das verfügbare Hauptbild bestehen.

Ein fehlender Langfristvergleich wird nicht aus dem Index selbst berechnet.
Ist nur dieser vorhanden, führt ein ausdrücklicher Schalter zum Indexbild.
Der Wechsel des Katalogthemas setzt Einkommen beziehungsweise Mieten passend
zum gewählten Thema; ein Länderwechsel erhält die Darstellungsentscheidung.
`ratioBasis`, `ratioMode` und `ratioSince` gehören zum gemerkten Kontext;
die Quellenfamilie `oecd` samt Hash und Berechnungsrezept wird mitgespeichert.

## Quelle und Bedeutung

Der feste, öffentliche SDMX-CSV-Abruf verwendet
`OECD.ECO.MPD,DSD_AN_HOUSE_PRICES@DF_HOUSE_PRICES,1.0`. Die vier exakt geprüften
Messgrößen sind:

| Messgröße | Quellencode | Einheit | Darstellung |
| --- | --- | --- | --- |
| Kaufpreis zu Einkommen | HPI_YDH | IX, 2015 = 100 | Unveränderter Index |
| Kaufpreis zu Mieten | HPI_RPI | IX, 2015 = 100 | Unveränderter Index |
| Standardisierter Einkommensvergleich | HPI_YDH_AVG | PT_AVG_L_TERM | Quellenwert minus 100 |
| Standardisierter Mietvergleich | HPI_RPI_AVG | PT_AVG_L_TERM | Quellenwert minus 100 |

Alle aktuellen Reihen sind quartalsweise, saisonbereinigt und nicht
kalenderbereinigt; sie tragen `OBS_STATUS=A`. Werte werden unverändert gespeichert.
Die Umrechnung der relativen Darstellung legt lediglich den veröffentlichten
Durchschnitt auf die Mittellinie. Es wird kein eigener gleitender Durchschnitt,
Modelltrend, Rang oder Sinus geschätzt. Quellenwert 100 ist eine echte Null
in dieser Darstellung; fehlende Werte bleiben fehlend.

Ein historischer Durchschnitt bestimmt keinen fairen Preis. Diese Indexverhältnisse
sind keine Anzahl benötigter Jahresgehälter, Mietrendite oder individuelle
Bezahlbarkeit. Finanzierungskosten, Steuern und Unterschiede zwischen Haushalten
sind darin nicht enthalten. Die OECD nennt im aktuellen CSV keinen gemeinsamen
Zeitraum für den Langfristdurchschnitt. Dieser wird nicht erfunden; spätere
Veröffentlichungen können Referenz und Vergangenheit revidieren. Das Bild ist
kein damaliger Informationsstand und keine Vorhersage einer Rückkehr zur Mitte.

Die Definitionen stammen von der [OECD-Indikatorseite](https://www.oecd.org/en/data/indicators/housing-prices.html).
Die [OECD-API-Dokumentation](https://www.oecd.org/en/data/insights/data-explainers/2024/09/api.html)
beschreibt den kostenlosen Zugang. Es ist kein weiterer API-Schlüssel nötig.
Die Oberfläche nennt OECD, Datensatz, Abrufdatum und eigene deutsche Erläuterungen;
die [Nutzungsbedingungen](https://www.oecd.org/en/about/terms-conditions.html)
werden verlinkt. Herkunft und Definitionsunterschiede zur BIS bleiben getrennt;
es gibt keinen gemeinsamen Preisindex aus beiden Anbietern.

## Gebiete und historische Grenzen

Die geprüfte Quelle enthält **42 Länder und drei eigene Quellenaggregate**:
`oecd:housing_members`, `oecd:housing_euro_area` und
`oecd:housing_euro_area_17`. Sie ersetzen weder Welt noch UN-/BIS-/Ember-Regionen.
Indien und China haben in dieser Quelle kein eigenes Profil. In Afrika ist
Südafrika enthalten; daraus entsteht kein Afrika-Aggregat. Nicht jedes Land
besitzt jede der vier Messgrößen.

Beispiele des aktuellen Stands:

| Gebiet | Einkommen | Mieten | Besonderheit |
| --- | --- | --- | --- |
| Deutschland | 1980-Q1–2026-Q1 | 1970-Q1–2026-Q1 | Beide Darstellungen vorhanden |
| Vereinigte Staaten | 1970-Q1–2026-Q2 | 1970-Q1–2024-Q4 | Unterschiedliche letzte Quartale |
| Südafrika | 1995-Q1–2025-Q4 | 2002-Q1–2025-Q4 | Kein standardisierter Mietvergleich |
| Japan | 1960-Q1–2025-Q4 | Eigener Quellzeitraum | Frühe lange Einkommensgeschichte |

Der Vergleich von Index und standardisierter Reihe zeigt historische Änderungen
ihres Skalierungsverhältnisses: Spanien/Einkommen 1985-Q1, Euroraum mit 17
Ländern/Einkommen 1980-Q1 und OECD-Gruppe/Einkommen 1977-Q4 sowie 1978-Q1.
Beide Darstellungen bleiben an diesen Grenzen getrennt, ohne Randwerte zu löschen.
Das sind **beobachtete Skalierungswechsel**, keine behaupteten offiziell
datierten Methodenwechsel. Andere Quellenänderungen können unmarkiert bleiben,
weil vollständige Länderhinweise im CSV fehlen. Eine ungeprüfte neue Grenze
verhindert die Übernahme, statt unbemerkt eine durchgehende Welle zu erzeugen.

## Native Speicherung und Prüfungen

`ratio_source.rs` begrenzt den Gesamt-CSV-Abruf auf 16 MiB, deaktiviert
Weiterleitungen und prüft die 26 Spalten, Dataflow-Identität, Frequenz,
Status, Maße, Einheiten, Bezugsbasis, Gebietskennungen, Quartale, endliche
positive Werte und Duplikate. Neue Definitionen und nicht geprüfte historische
Abgrenzungen werden abgelehnt. HTTP 429 führt zu einer verständlichen Meldung;
es gibt keine automatische Abrufschleife.

Atlasmigration **0010** ergänzt `atlas_housing_ratio_dataset` und
`atlas_housing_ratio_areas` im separaten öffentlichen Cache. Ein vollständiger
Stand wird atomar ersetzt; lesende Commands erhalten Profil und Herkunft aus
derselben Transaktion. Der gemeinsame Atlas-Job und 24 Stunden Mindestabstand
gelten. Ein Fehler lässt den vorherigen Stand bestehen. Die Hauptdatenbank
benötigt keine neue Migration.

Der tatsächliche Download wurde unabhängig mit Python/Decimal gegen sämtliche
nativen Rust-/SQLite-Antworten verglichen: **23.535 numerische Quellenwerte**,
**4.381 nicht gelieferte Einzelwerte** in den gespeicherten Quartalen, **45 Profile**,
maximale Zahlenabweichung **null**. Alle historischen Grenzen wurden unabhängig
neu bestimmt. Der originale CSV-Hash ist
`bb8bbbbcdc70520ab065cc012db61711bd00a35eebfdbea8263b4db3883b2622`.
Das HTTP-Last-Modified-Feld wird nicht als fachliches Veröffentlichungsdatum
ausgegeben. Strukturdatei und CSV sind getrennt im Audit belegt.

Deterministische Tests prüfen Originalwerte, fehlende Reihen, echte Mitte,
historische Grenzen, neue Definitionen, Forecaststatus, Duplikate, ungültige
Quartale, Größenlimits, Migration vom bestehenden BIS-Cache, Rollback,
Offline-Lesen, Sperre und Abrufabstand. UI-Prüfungen decken gemeinsame Skalen,
fehlende Vergleichsgebiete, ausdrücklichen Indexwechsel, Themenwege,
Aktualisierung beider Länder und gemerkte Parameter/Herkunft ab.

Die echte Tauri-Prüfung nutzt ausschließlich das eigene Profil
`com.personal-macro.atlas-housing-ratios-validation`. Sie lädt über die
Produktcommands, liest alle Profile aus dem öffentlichen Cache und erzeugt
das tatsächliche Diagrammbild. Der aktuelle Prüfstand und Neustartnachweis
stehen im [nativen Nachweis](evidence/housing-ratios-native-readiness.json).
Die Browserprüfung verwendet ausschließlich diese öffentlichen nativen Antworten;
sie simuliert keinen erfolgreichen Download.

Nach den letzten UI-Korrekturen bestehen 129 Atlas-Frontendtests in 21 Dateien
sowie 218 Rust-Library-Tests; 18 externe/manuelle Tests sind im Standardlauf
ausgenommen. Der neue OECD-HTTP-Test wurde zusätzlich ausgeführt. Typecheck,
Produktionsbuild, ESLint, Prettier, Rustfmt und Clippy mit `-D warnings` bestehen.
Der Neustart liest dieselbe gespeicherte Herkunft ohne erneuten OECD-Abruf.
Die Sichtprüfung bei 1024 und 1440 Pixeln umfasst Deutschland/USA, Südafrikas
ausdrücklichen Indexwechsel, fehlendes Indien/China, Spaniens getrennte
Quellenabschnitte, die eigene OECD-17er-Gruppe, optionale Zahlen, Tastaturzugang
zur Quartalstabelle und den Rückweg aus der Quellenkarte. Es gab keinen
bleibenden horizontalen Seitenüberlauf oder Browser-Konsolenfehler.

Im längeren nativen Hintergrundlauf traten die bestehenden EODHD-/Technicals-
Synchronisierungswarnungen und zusätzlich eine `pdf-extract`-Panic
(`Parse(InvalidContentStream)`) außerhalb der Atlas-Pipeline auf. Der Prozess
und der OECD-Cache blieben verfügbar. Der neue Atlasabschnitt initialisierte
ohne eigenen Fehler; eine vollständige native Bedienabnahme aller Atlasbereiche
oder ein fehlerfreier Gesamthintergrundlauf ist damit nicht nachgewiesen.

[Quellen- und Gebietsprüfung](evidence/housing-ratios-source-audit.json) ·
[Nativer Wertevergleich und Prüfstand](evidence/housing-ratios-native-readiness.json)
