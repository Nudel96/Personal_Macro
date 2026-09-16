# Jahrhundertperspektiven – Daten, Darstellung und Prüfung

Stand: 8. September 2026. Implementiert sind historische Wirtschaftsleistung je
Einwohner, Gesamtwirtschaft und Anteile an der veröffentlichten Weltwirtschaft.
Dies schließt den gesamten Atlasauftrag oder alle Jahrhundertthemen noch nicht ab.

## Nutzung

**Marktkontext → Weltatlas → Lange Entwicklungen → Jahrhundertperspektiven**
enthält „Wohlstand über Jahrhunderte“ und „Wirtschaftsgröße über Jahrhunderte“.
Unter **Strukturwandel & Generationen → Verschiebung wirtschaftlicher Gewichte**
steht die Ansicht der Weltanteile. Ein expliziter Download von rund 1 MB lädt
beide Quellenreihen gemeinsam für die verfügbaren Gebiete und speichert sie
offline. Die Browser-Vorschau simuliert keinen erfolgreichen Download.

Zeiträume seit 1950, 1820, 1500 oder alle gemeinsamen Quellenjahre sind wählbar.
Zahlen, Tooltips und die Wertetabelle sind zunächst verborgen. Deutschland,
USA, Indien und China verwenden denselben Datenpfad wie alle anderen Gebiete.

## Tatsächlich verwendete Quelle

Ursprung ist die [Maddison Project Database 2023](https://www.rug.nl/ggdc/historicaldevelopment/maddison/releases/maddison-project-database-2023),
Bolt, Jutta und Jan Luiten van Zanden (2024), „Maddison style estimates of the
evolution of the world economy: A new 2023 update“, Journal of Economic Surveys,
[DOI 10.1111/joes.12618](https://doi.org/10.1111/joes.12618), CC BY 4.0.
Die Datenbank verweist auf die länderspezifischen Originalarbeiten im
Quellenblatt ihrer Arbeitsmappe. Die Oberfläche führt diese Referenz und den
Link zum vollständigen Originalquellenverzeichnis bei jedem Bild mit.

Die Originalarbeitsmappe auf Dataverse war bei dieser Prüfung durch eine
Zugriffskontrolle geschützt; der öffentliche OWID-Rohsnapshot war ebenfalls
nicht zugänglich. Diese Zugänge werden nicht umgangen. Die produktive Anbindung
verwendet stattdessen **ausdrücklich die von Our World in Data öffentlich
angebotenen CSV-Dateien und Metadaten**. Es gibt keinen stillen Quellenwechsel:

- [Wirtschaftsleistung je Einwohner](https://ourworldindata.org/grapher/gdp-per-capita-maddison-project-database),
  OWID-Indikator `900793`, `gdp_per_capita`; vom Anbieter als kleinere Aufbereitung
  der MPD-Daten beschrieben.
- [Gesamtwirtschaft](https://ourworldindata.org/grapher/gdp-maddison-project-database),
  OWID-Indikator `900795`, `gdp`; OWID berechnet diese Größe aus BIP je Einwohner
  mal Bevölkerung und bezeichnet dies als umfangreichere Aufbereitung.

Die festen Endpunkte bestehen aus dem jeweiligen Chartnamen plus `.csv` bzw.
`.metadata.json` und `?v=1&csvType=full&useColumnShortNames=false`. Der Adapter
verwendet den von der OWID-API-Dokumentation gezeigten Datenabruf-User-Agent.
Der Dateiformatparameter `v=1` ist **keine** Zusicherung einer Datenrevision;
die Revision wird separat geprüft und jede Antwort gehasht.

Beide Reihen haben den veröffentlichten Stand 26.04.2024 und den Gesamtzeitraum
1–2022. Sie sind in internationalen Dollar mit Preisbasis 2011 angegeben;
Kaufkraftbenchmarks und historische Rekonstruktionen sind Teil der
Quellenmethodik. Die App fügt keine Weltbankwerte in anderer Preisbasis an.

## Gebiete und tatsächliche Abdeckung

Die beiden CSVs enthalten 21.586 bzw. 16.143 Zeilen für jeweils 178 Quellgebiete.
Der Atlas übernimmt **165 heutige Länder/Gebiete, Welt und acht separat benannte
Maddison-Regionen**, insgesamt 174 Profile. Die acht Regionen erweitern den
allgemeinen Gebietskatalog auf 264 Einträge. Sie erhalten eigene IDs und keine
erfundenen ISO-Codes. UN- und Maddison-Regionen werden nicht gleichgesetzt.

Die vier historischen Quellgebiete Tschechoslowakei, Sowjetunion, Jugoslawien
und früherer Sudan bleiben in der Provenienz als ausgeschlossen dokumentiert.
Ihre Rekonstruktionen werden keinem heutigen Nachfolgestaat zugeschlagen.
Ein Katalogland ohne eigenes Profil erhält nach vollständiger Quellenprüfung
`unsupported_area`; fehlende Jahre werden nicht als null angenommen.

Die Abdeckung ist je Maß unterschiedlich. Beispielsweise reichen die
BIP-je-Einwohner-Schätzpunkte Deutschlands bis 1500, Indiens bis 1600 und Chinas
bis 1000 zurück. Daraus folgt **keine** lückenlose Geschichte dieser Länder.
Gesamtwirtschaft benötigt zusätzliche Bevölkerungsdaten und kann kürzer sein.
Weltwerte liegen nur in 21 Quellenjahren vor, regionale Werte ebenfalls meist
in weit auseinanderliegenden Schätzpunkten. Der vollständige Umfang steht im
[nativen Prüfprotokoll](evidence/history-readiness.json).

## Verbindliche Darstellung

- Jahresabstände sind echte Kalenderabstände. Fehlende Jahre bleiben offen.
  Einzelne historische Punkte werden mit sichtbaren Symbolen gezeichnet;
  ausschließlich benachbarte vorhandene Jahreswerte werden verbunden.
- Es gibt keine zusätzliche Interpolation, Glättung, Trendbereinigung,
  Sinusperiode, Gleichgewichtsmitte oder Zukunftsprojektion. Kontinuierliche
  Quellenreihen können trotzdem Rekonstruktionen des Anbieters enthalten.
- Der voreingestellte proportionale Maßstab ist eine logarithmische Achse.
  Gleiche vertikale Abstände bedeuten gleiche relative Veränderungen. Die
  lineare Alternative beginnt bei null. Beide Vergleichsgebiete teilen Skala,
  Betrachtungsfenster und Datenstand. Die zweite Reihe ist zusätzlich gestrichelt.
- Weltanteile verwenden ausschließlich `Gebiets-BIP / Welt-BIP × 100` mit
  derselben Quellenrevision und demselben Jahr. Fehlender Nenner erzeugt keinen
  Wert. Der Atlas bildet keine ungewichteten Mittelwerte von Ländern und summiert
  keine möglicherweise überlappenden Regionen zu einer neuen Welt.
- Die Oberfläche benennt historische Rekonstruktion und den Datenstand 2022.
  Kurvenposition ist keine Anlagebewertung. BIP je Einwohner beschreibt weder
  Einkommensverteilung noch sämtliche Lebensbedingungen.
- Historische Gebietsdefinitionen bleiben begrenzt vergleichbar. Die Hinweise
  nennen insbesondere England vor 1700, Holland vor 1807 sowie Einschränkungen
  früher US-Kolonialschätzungen, wie sie die Quellenmethodik beschreibt.
  Die App behauptet keinen vollständig harmonisierten Verlauf heutiger Grenzen.

## Technische Verträge

`history_source.rs` lädt ausschließlich zwei fest definierte öffentliche Charts
von `ourworldindata.org`. Keine Schlüssel, Benutzer-URLs, Journalwerte oder
Redirects. Limits: 4 MB je CSV, 128 KB je Metadatenantwort, 45 Sekunden pro
Anfrage, höchstens 50.000 Zeilen und 8 KB pro Datensatz. Die begrenzte Menge
bleibt im Speicher; es gibt keine XLSX-Ausführung oder Dateiextraktion.

Vor und nach jeder CSV werden die Metadaten gelesen und verglichen. Kennung,
Statistikname, Preisbasis, Veröffentlichungsstand, Quellenzitation und
Gesamtzeitraum müssen zur geprüften Ausgabe passen. Die bekannten Zeilen- und
Gebietszahlen verhindern eine stille Übernahme eines abweichenden oder
unvollständigen Releases. Ein solcher Wechsel benötigt eine neue fachliche
Quellenprüfung. Doppelte identische Werte werden zusammengeführt; widersprüchliche
Duplikate, nicht endliche oder nicht positive BIP-Werte und unerwartete Jahre
werden abgelehnt.

Atlasmigration `0004_history.sql` ergänzt zwei Tabellen im separaten öffentlichen
Cache. Beide Reihen und die daraus berechneten Anteile werden gemeinsam atomar
ersetzt und gelesen. Ein Fehler erhält den vorherigen Stand. Der gemeinsame
Atlas-Abrufschutz und ein 24-Stunden-Abstand begrenzen explizite Aktualisierungen.
Commands: `get_atlas_history`, `sync_atlas_history`; Browserstatus:
`desktop_required`. Ein abgeschlossener Job invalidiert sämtliche historischen
Länderansichten im Query-Cache.

## Durchgeführte Prüfungen

- Native Unit-Tests: Kalenderlücken, null, ungültige Zahlen/Jahre, doppelte
  Werte, Quellen-/Einheitenwechsel, Gebietsidentitäten, echte Weltnenner,
  atomarer Rollback und Offline-Neustart. Ein befüllter v3-Testcache wurde auf
  v4 aktualisiert; seine Demografiezeilen blieben erhalten.
- Expliziter Netzwerktest `world_atlas_live_history_roundtrip`: beide echten
  OWID-Dateien über den produktiven Rust-Adapter geladen, 174 Profile in einem
  temporären Cache gespeichert, zwölf Länder-/Regionsprofile zurückgelesen und
  offline wieder geöffnet. Die Netzwerkprobe dauerte rund zwei Sekunden.
- [Unabhängige Python-/Decimal-Nachrechnung](evidence/check_history.py): 4.274
  Originalwerte ohne Abweichung, 235 Weltanteile innerhalb von 1e-10
  Prozentpunkten sowie 4.425 fehlende Werte/Anteile geprüft.
  [Ergebnis](evidence/history-independent-check.json). Dies validiert den
  OWID-Veröffentlichungsstand, keinen separaten Abruf der Originalarbeitsmappe.
- Gesamte Atlasprüfung: 18 Rust-Tests bestanden, vier explizite Netzwerktests
  regulär ignoriert; 25 gezielte Frontendtests bestanden. Clippy, Formatierung,
  gezieltes ESLint, Typecheck und Frontendbuild erfolgreich. Bekannte große
  ECharts-/Dokument-Chunks bleiben bestehen.
- CUA-Browserprüfung mit klar gekennzeichneten echten nativen Snapshots:
  Deutschland/Indien, China/USA einschließlich früher Einzelpunkte sowie
  Subsahara-Afrika/Westeuropa mit Weltanteilen. Gemeinsame Jahre, auswählbare
  Zeiträume, optionale Zahlen/Tabelle und keine Überbreite bei 1024 px geprüft.
  Keine Browserfehler oder Warnungen, nur Entwicklungsprotokolle.
- Reale Tauri-Initialisierung mit separater Kennung
  `com.personal-macro.atlas-validation`: Atlas erfolgreich gestartet;
  Migrationen 1–4 als erfolgreich nachgewiesen. Das Testfenster blieb verborgen.
  Erneut trat die bekannte Technicals-Zugriffsablehnung im Hintergrund auf.
  Die vollständige native visuelle Bedienprüfung bleibt wegen der bereits
  dokumentierten Einschränkung des Aufnahmewerkzeugs offen.

`ATLAS_WRITE_HISTORY_REVIEW=1` schreibt ausschließlich im ignorierten Netzwerktest
öffentliche Prüfsnapshots nach `.tmp/atlas-validation` und das Quellenprotokoll.
Das ist kein produktiver Konfigurationsschalter. Rohdaten, persönliche Daten und
Testkonfigurationen werden nicht ausgeliefert oder ins Repository übernommen.

Die [JST-Finanzgeschichte](MACROHISTORY.md) ergänzt inzwischen 20 Perspektiven
für 18 Länder seit 1870, mit Quellenstand bis 2020. Weitere historische Maße,
belegte Ereigniskontexte und empirische Zyklusprüfungen bleiben offen. Diese Ansicht liefert
keinen empirischen Beweis für eine überall wiederkehrende Jahrhundertwelle.
