# Weltweite Demografie – UN-Altersprofile und Szenarien

Stand: 8. September 2026. Produktcode: `src/features/world-atlas/atlas-demography*`
und `src-tauri/src/world_atlas/demography_*`.

## Sichtbare Ansichten

Unter **Menschen → Demografie** stehen Altersstruktur, Bevölkerung im Erwerbsalter,
Jugend-/Altenquotient und Bevölkerungsszenarien zur Verfügung. **Lange Entwicklungen
→ Strukturwandel & Generationen → Demografischer Übergang** zeigt den Wandel der
Altersanteile. Der bisherige WDI-Bevölkerungsverlauf bleibt eine eigene Reihe;
WDI und WPP werden nicht zu einer längeren Linie zusammengefügt.
Bei der Altersstruktur lässt sich ausdrücklich zwischen dem UN-Altersprofil
und dem separaten Weltbank-Verlauf zum Anteil 65+ wechseln.

Die Altersansicht startet bei der letzten historischen UN-Schätzung 2023.
Ein Jahresregler bewegt die Darstellung nur durch Benutzereingabe. Die Projektion
wird ausdrücklich eingeblendet; beim Thema Bevölkerungsszenarien ist sie bereits
ausgewählt. Auch 2024/2025 bleiben in dieser Ausgabe **Projektionsjahre**, obwohl
sie am heutigen Datum bereits vergangen sind.

Zwei Länder oder UN-Regionen verwenden denselben Zeitpunkt und Maßstab.
Pyramiden zeigen männlich links und weiblich rechts, jeweils als Anteil an der
gesamten Bevölkerung. Die Linienansichten verwenden absolute Bevölkerung,
Altersanteile oder Quotienten je nach Thema. Zahlen, Tooltipwerte und Tabellen
sind zunächst ausgeblendet. Die Form enthält keine Hoch-/Tiefbewertung von Menschen.

## Tatsächlich geladene Quelle

Quelle und Lizenz: United Nations, Department of Economic and Social Affairs,
Population Division (2024), [World Population Prospects 2024, Online Edition](https://population.un.org/wpp/),
[CC BY 3.0 IGO](https://creativecommons.org/licenses/by/3.0/igo/).
Die Originalpfade werden aus dem offiziellen Downloadverzeichnis überprüft;
im produktiven Adapter stehen ausschließlich drei feste UN-Dateien.

- [Altersgruppen nach Geschlecht, mittlere Variante](https://population.un.org/wpp/assets/Excel%20Files/1_Indicator%20(Standard)/CSV_FILES/WPP2024_PopulationByAge5GroupSex_Medium.csv.gz),
  tatsächlich 29.948.947 Bytes komprimiert, 1.759.905 CSV-Zeilen.
- [Zwischenkorrektur](https://population.un.org/wpp/assets/Excel%20Files/1_Indicator%20(Standard)/WPP2024_CSV_files_update.zip),
  tatsächlich 943.827 Bytes; ausschließlich das benannte Altersgruppen-CSV wird
  im Speicher gelesen, ohne Dateien aus dem Archiv zu extrahieren.
- [UN-Gebietsnoten](https://population.un.org/wpp/assets/Excel%20Files/1_Indicator%20(Standard)/CSV_FILES/WPP2024_Locations_notes.csv),
  deren Originaltexte beim jeweiligen Gebiet sichtbar sind.

Die [UN-Mitteilung vom 19. Januar 2026](https://population.un.org/wpp/assets/Files/WPP2024_Release-Note-rev1.pdf)
korrigiert Togo. Der Atlas ersetzt dessen vollständige Altersreihe durch die
veröffentlichte Korrektur. Andere Länder und die offiziellen Aggregate bleiben
unverändert; die UN hat die Korrektur nicht in ihre Welt-/Regionssummen eingearbeitet.
Ein Vergleich mit einem solchen Aggregat macht diesen Unterschied sichtbar.

Der geprüfte Katalog enthält 237 Länder/Gebiete sowie Welt und fünf Großregionen,
insgesamt 243 Profile. Die zusätzlichen Aggregate haben explizite UN-Identitäten:
Afrika 903, Asien 935, Europa 908, Amerika 5505, Ozeanien 909; Welt ist 900.
Sie werden nicht aus ungeprüft gemittelten Länderanteilen berechnet.
Diese Regionskennungen werden nicht als erfundene ISO3-Ländercodes ausgegeben.
Alle 237 ISO3-Gebiete passen zum Atlas-Katalog; Taiwan und Kosovo behalten ihre
eigenen Provideridentitäten. Chinas gesonderte Gebietsdefinition bleibt mit den
UN-Fußnoten erhalten, Hongkong/Macau werden nicht dazuaddiert.

13 Atlasgebiete besitzt die WPP-Datei nicht als eigenständige Altersreihe:
IOT, ATF, BVT, SGS, ATA, ALA, SJM, CXR, CCK, HMD, NFK, UMI und PCN.
Sie bleiben auswählbar und zeigen nach dem vollständigen Download den geprüften
Status `unsupported_area`. Das ist keine Behauptung, diese Gebiete hätten keine
Bevölkerung oder seien in anderen Quellen nicht enthalten.

## Datenbedeutung und Berechnung

Die Quelle beschreibt die Bevölkerung zur Jahresmitte, 1. Juli, in Tausend
Menschen. Der native Adapter multipliziert einmalig mit 1.000. Jede Profilzeile
enthält die 21 Gruppen 0–4, 5–9, …, 95–99 und 100+. Die offene letzte Altersgruppe
wird nicht zu einer fünfjährigen Gruppe umgedeutet.

1950–2023 sind UN-Schätzungen, 2024–2100 die mittlere Projektion. Der Status stammt
aus der dokumentierten Ausgabe und wird nicht aus dem aktuellen Kalenderdatum
abgeleitet. Das mittlere Szenario ist kein Konfidenzintervall. Die Oberfläche
erfindet keine Unsicherheitsbänder und verlängert keine Beobachtung als festen Sinus.

Bevölkerungsanteile verwenden die Summe der veröffentlichten Gesamtwerte aller
Altersgruppen desselben Jahres. Männlich plus weiblich kann aufgrund der
Quellenrundung pro Altersgruppe bis zu etwa einer Person vom Gesamtwert abweichen.
Diese Rundung wird validiert, nicht durch Korrekturen an den Quellenwerten kaschiert.

- Unter 15: Summe der Gruppen 0–4, 5–9 und 10–14.
- Erwerbsalter: 15–64, eine Altersdefinition, keine Zahl tatsächlich Erwerbstätiger.
- Ältere Bevölkerung: 65+.
- Jugendquotient: unter 15 / 15–64 × 100.
- Altenquotient: 65+ / 15–64 × 100.

Ein fehlender Bestandteil ergibt keine vollständig berechenbare Summe oder
Pyramide. Ein Nenner null erzeugt keinen Quotienten. Die Pyramiden werden auf
derselben symmetrischen Skala gezeichnet, Linien auf derselben Einheit und Skala.
Die beiden Länder bleiben getrennt beschriftet. Der Vergleich setzt denselben
atomar geladenen Quellenstand und gemeinsame Jahre voraus.

## Speicherung, Grenzen und Prüfungen

Atlasmigration 0003 ergänzt zwei Tabellen in der separaten `atlas/cache.sqlite`.
Der gesamte Quellenstand und alle Profile werden zusammen atomar ersetzt;
Lesezugriffe erhalten ebenfalls einen konsistenten Snapshot. Der vorherige Stand
bleibt bei Download-, Dekompressions-, CSV-, Korrektur- oder Speicherfehlern erhalten.
Der bestehende gemeinsame Atlas-Lock verhindert parallele Atlas-Downloads.
Erneutes Laden ist frühestens 24 Stunden nach einem erfolgreichen Abruf möglich.

Der Download akzeptiert ausschließlich die festen HTTPS-Dateien auf
`population.un.org`, keine Weiterleitungen. Grenzen: 48 MB Basisdatei, 4 MB
Korrekturarchiv, 256 KB Noten, maximal 512 MB entpackter CSV-Inhalt und maximal
zwei Millionen CSV-Zeilen. Der CPU-intensive CSV-Teil läuft in `spawn_blocking`.
Das vorhandene transitive `flate2` 1.1.9 wird dafür als direkte Abhängigkeit
verwendet; es wurde keine neue Bibliotheksversion in den Baum eingeführt.

Die offizielle Gzip-Datei besteht aus mehreren hintereinanderliegenden Gzip-
Mitgliedern. Ein einzelner Decoder würde nach der Kopfzeile stoppen. Ein echter
nativer Quellentest deckte dies auf; der Adapter verwendet `MultiGzDecoder`, und
ein Regressionstest prüft genau diesen Fall sowie beschädigte Prüfsummen.

Der explizite Netzwerktest
`cargo test world_atlas_live_demography_roundtrip --lib -- --ignored --nocapture`
hat alle drei Originaldateien geladen, 243 Profile gespeichert und nach erneuter
Öffnung offline gelesen. Download, Prüfung, Speicherung und erneutes Öffnen
dauerten in der gemessenen Debug-Ausführung rund 26 Sekunden. Alle Profile
enthalten 151 Jahre und 21 Altersgruppen; im geprüften Release fehlen keine
Alters-/Geschlechterzellen. Das macht Modellschätzungen nicht zu Messungen.
Das [Prüfprotokoll](evidence/demography-readiness.json) enthält Gebietscodes,
Umfang und Quellenhashes.

Mit `ATLAS_WRITE_DEMOGRAPHY_REVIEW=1` schreibt allein der ignorierte Netzwerktest
zusätzliche öffentliche Snapshots nach `apps/desktop/.tmp/atlas-validation`.
Die [unabhängige Nachrechnung](evidence/check_demography.py) vergleicht diese
mit den Original-CSV-Dateien mittels Python/Decimal. Diese Prüfvariable ist
kein produktiver Konfigurationsvertrag und benötigt keinen API-Schlüssel.

Die Browser-Sichtprüfung mit echten nativen Snapshots umfasste Deutschland/Indien,
China/Indien und Afrika/Deutschland, den Jahresregler per Tastatur, bewusste
Szenarienauswahl, gemeinsame Skalen und optionale Werte. Bei 1024 px entstand kein
horizontaler Überlauf; die Browserkonsole enthielt keine Fehler/Warnungen.
Die echte Tauri-App initialisierte mit separater Testkennung bis Atlasmigration
0003. Die vollständige native Sicht-/Klickabnahme bleibt wegen der dokumentierten
Gerätegrenze des Aufnahmewerkzeugs offen; bestehende Technicals-/PDF-Hintergrundfehler
werden im allgemeinen Umsetzungsstand getrennt ausgewiesen.

Eine historische Jahrhundertreihe folgt daraus noch nicht: WPP enthält 74
historische Schätzungsjahre und 77 Projektionsjahre. Die inzwischen angebundene
[Maddison-Wirtschaftsgeschichte](HISTORY.md) ist ein eigener Bereich mit eigener
Quellenmethodik; JST und weitere historische Datenfamilien bleiben ergänzbar.
