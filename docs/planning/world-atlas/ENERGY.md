# Weltatlas – Stromwirtschaft nach Ländern und Regionen

Stand: 9. September 2026. Der Energieadapter ist implementiert und mit dem
öffentlichen Ember-Datensatz geprüft. Er erweitert die wirtschaftlichen
Länderbilder; die gesamte Atlas-Abnahme R01–R18 bleibt offen.

## Quelle und nachgewiesene Abdeckung

- [Ember: Yearly Electricity Data](https://ember-energy.org/data/yearly-electricity-data/)
- [Öffentliche jährliche CSV-Datei](https://files.ember-energy.org/public-downloads/yearly_full_release_long_format.csv)
- [Methodik und Länderhinweise, Version 1.5](https://files.ember-energy.org/public-downloads/ember_electricity_data_methodology.pdf)
- [OWID-Quellenmetadaten zur Ember-Veröffentlichung und CC BY 4.0](https://github.com/owid/etl/blob/master/snapshots/ember/2026-04-24/yearly_electricity__global.csv.dvc)

Der tatsächlich geladene Stand hat 370.784 Originalzeilen und 227 Gebiete:
214 Länder/Wirtschaftsgebiete sowie Welt und zwölf weitere Regions-/Ländergruppen.
Der Zeitraum ist 2000–2025. Das ist eine Mengenangabe der Veröffentlichung,
keine Behauptung vollständiger Werte für jede Kombination.

Die CSV war ohne Schlüssel erreichbar und umfasst 49.079.981 Bytes.
`Last-Modified`: 23. Juni 2026. SHA-256:
`259e1095ee8ffeaf0aff37ad557916ae1823a2da13312da50ba4cec6b4574c3b`.
Die allgemeinen Ember-Webseiten waren während der Recherche teilweise mit 403
nicht abrufbar; der ausdrücklich öffentliche Datei-Download und das
Methodik-PDF waren erreichbar. Es wurde keine Zugangssperre umgangen.

Länder werden ausschließlich über die vorhandenen ISO-3-Zuordnungen des
Atlas identifiziert. Alle 214 Codes des geprüften Stands waren zuordenbar,
einschließlich Taiwan und Kosovo. Eigene Kennungen `ember:*` bezeichnen die
veröffentlichten Ember-Aggregate. UN- und Maddison-Regionsgrenzen werden nicht
ersetzt oder als identisch angenommen. Die Auswahl eines anderen
Quellenaggregats erfolgt ausdrücklich in der Oberfläche.

## Verfügbare Bilder

Unter **Energie → Strom & Erzeugung** stehen neun Erzeugungsarten bereit:
Kohle, Erdgas, weitere fossile Quellen, Kernenergie, Wasserkraft, Bioenergie,
weitere erneuerbare Quellen, Wind insgesamt und Solarenergie.

| Perspektive | Quellgröße | Darstellung |
| --- | --- | --- |
| Strommix | neun veröffentlichte Anteile in Prozent | gestapelte Jahresbalken, fester gemeinsamer Prozentmaßstab |
| Einzelne Erzeugungsart | Anteil in Prozent | Jahreslinien, gemeinsame Skala von null bis hundert |
| Stromerzeugung | TWh pro Jahr | Jahreslinien, gemeinsame absolute Skala |
| Installierte Leistung | GW | Jahreslinien, eigene Einheit und Erklärung |
| Gesamte Stromerzeugung | TWh pro Jahr | eigene Jahresreihe |
| Stromnachfrage | TWh insgesamt oder veröffentlichte MWh je Einwohner | umschaltbare Jahresreihe |
| Strom-Nettoimporte | TWh, mit Vorzeichen | Linie mit Nullbezug; negativ bedeutet Exportüberschuss |

Zahlen und Tabellen sind anfangs ausgeblendet. Vergleichsgebiete teilen
Zeitraum, Einheit und Quellenstand. Eine zweite Linie ist zusätzlich
gestrichelt. Die Farblegende der Strommixe steht direkt vor den Bildern.
Bei Solar und Kernenergie führt ein eigener Schalter zur bestehenden
Börsenperspektive. Ein globaler Themenfonds wird dabei weiterhin ausdrücklich
als global bezeichnet und nicht zu „Solar Afrika“ umbenannt.

Fehlende Einzelgrößen werden je Gebiet benannt: Ein vorhandenes Länder- oder
Regionsprofil bedeutet nicht, dass auch Nettoimporte oder jede Kapazität
veröffentlicht sind. Bei einem Themenwechsel aus dem unteren Teil der langen
Liste wird eine oberhalb des sichtbaren Bereichs liegende neue Überschrift
wieder ins Blickfeld gebracht und erhält den Tastaturfokus.

## Fachliche Grenzen

Ember verbindet nationale Daten mit Schätzungen. Die CSV unterscheidet diese
nicht je Zelle, daher lautet die sichtbare Einordnung **Quellenstatistik mit
Schätzungen**. Der letzte Abruf ist ein revidierbarer Veröffentlichungsstand,
kein historisch zeitpunktgetreuer Datenbestand.

Stromanteile beziehen sich auf heimische Erzeugung, nicht auf Verbrauch
einschließlich Importen. Bedarf folgt der Quellendefinition Erzeugung plus
Nettoimporte. Solar umfasst Photovoltaik und Solarthermie; Wind ist gemeinsam
für Land und See veröffentlicht. Weitere erneuerbare Quellen bündeln unter
anderem Geothermie und Meeresenergie. Kapazitätsangaben haben je Quelle
unterschiedliche AC-/DC-Grundlagen. Deshalb werden keine nicht vorhandenen
Einzeltechnologien oder direkte Auslastungskennzahlen abgeleitet.

Ein Strommix braucht alle neun verfügbaren Komponenten. Ihre auf zwei
Dezimalstellen gerundete Summe darf höchstens 0,051 Prozentpunkte von hundert
abweichen. Leere Zellen und fehlende Zeilen werden weder auf null gesetzt
noch umgewichtet. Ein vollständig mit null veröffentlichter Mix ergibt kein
Zusammensetzungsbild. Einzelne echte Nullwerte bleiben in den anderen
Ansichten sichtbar. Fehlende Zwischenjahre erhalten keine Verbindung.

Die Kurven sind keine geglätteten Marktzyklen, Wertprognosen oder
Unter-/Überbewertungen. Diese Energiegrundlage beantwortet die Frage nach
der Entwicklung und Zusammensetzung der Stromwirtschaft.

## Lokaler Datenpfad

`energy_source.rs` lädt ausschließlich die feste HTTPS-CSV, ohne Redirects,
mit 10 Sekunden Verbindungs- und 90 Sekunden Gesamttimeout. Grenzen sind
60 MiB, 600.000 Zeilen und 8.192 Bytes pro Datensatzzeile. Der Parser prüft
Spalten, Einheiten, Jahre, Gebietsidentitäten, Zahlenbereiche und Duplikate.
Eine unerwartete Einheit oder widersprüchliche Doppelzeile bricht die
Übernahme ab. Der alte Stand bleibt erhalten.

Der vollständige globale Stand wird mit Quellenhash, HTTP-Quellenstand,
ETag und Abrufzeit atomar in Atlasmigration **0005** gespeichert. Der
öffentliche Cache bleibt getrennt vom Journal. `get_atlas_energy` liest
Profil und Metadaten gemeinsam in einer Transaktion. `sync_atlas_energy`
nutzt die vorhandene globale Atlas-Abrufsperre und eine Sperrfrist von
24 Stunden nach erfolgreicher Übernahme. Kein automatischer Hintergrundabruf.
Der Browseradapter meldet `desktop_required`.

## Prüfungen

- Fünf deterministische Rust-Tests: Einheiten, Länder/Regionen, Null/fehlend,
  Vorzeichen, Konflikte, Rundung, globale Abrufsperre, Aktualität,
  v4→v5-Upgrade, atomarer Rollback und Offline-Lesen.
- Expliziter Live-Test `world_atlas_live_energy_roundtrip`: vollständiger
  öffentlicher Download, temporärer Cache, 15 zurückgelesene Gebiete und
  Wiederöffnung ohne erneuten Download; rund 13 Sekunden in der Debug-Probe.
- [Unabhängiger Python-/Decimal-Abgleich](evidence/energy-independent-check.json):
  11.338 numerische Werte exakt identisch, 404 explizite Nullzellen und 348
  fehlende Schlüssel unverändert; darunter 1.024 echte Nullwerte und 96
  negative Nettoimportwerte. Der Quellhash wurde vor dem Vergleich geprüft.
- Frontendprüfungen: richtige Themenzuordnung, getrennte Einheiten,
  gemeinsame Jahre und Dateistände, vollständige Strommixe, echte Nullwerte,
  Vorzeichen, lokale Browsergrenzen, Quellenregionswechsel und Abrufinvalidierung.
- CUA-Bedienprüfung mit echten nativen Snapshots: Solar Afrika/Deutschland,
  Strommix beider Gebiete, Kapazität, optionale Tabelle und Indien/China.
  Auch der unveränderte vollständige App-Rahmen wurde bei 1.024 Pixeln mit
  geöffneter Sidebar verwendet. Die Diagramm- und Legendencontainer passen
  innerhalb der Karte. Die vorhandene globale Mindestbreite bleibt 1.024 Pixel.
- Reale Tauri-Initialisierung mit separater Testkennung: Atlasmigrationen
  1–5 erfolgreich. Die bekannte Technicals-/EODHD-Intraday-Warnung und später
  PDF-Schriftwarnungen aus dem Hintergrundworkflow traten auf;
  keine neue Atlas-Initialisierungswarnung wurde beobachtet. Die vollständige native
  Sicht-/Klickabnahme bleibt technisch offen.

Der unabhängige Vergleich kann mit
`python docs/planning/world-atlas/evidence/check_energy.py` erneut laufen,
wenn Originaldatei und native Prüfsnapshots im ignorierten Prüfverzeichnis
liegen. Er enthält keinen Zugriff auf persönliche Daten oder das Netzwerk.
