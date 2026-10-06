# Wetter & Rohstoffe

Auftrag und Quellenprüfung: 05.10.2026. Ziel ist das Verständnis von Wetter,
Produktionsregionen und möglichen Belastungen, ohne Handelssignale.

## Fachlicher Vertrag

- Ein Asset öffnet die relevanten Produktionsgebiete, nicht das Wetter einer
  Hauptstadt. Arabica/Robusta und Winter-/Sommerweizen bleiben getrennt.
- Regionsauswahl und typische Saison sind redaktionell. Es werden keine
  Produktionsanteile, exakten Anbaugrenzen oder aktuelle Pflanzenstadien erfunden.
  Drei benannte Wetterpunkte zeigen die räumliche Streuung innerhalb eines Gebiets.
- Aktuelle Bedingungen sind Modellwerte. Die vorherigen sieben Tage sind
  archivierte Wettermodellwerte, keine Stationsmessungen. Vorhersagen umfassen
  heute und die folgenden 13 Tage. Alle Tagesfenster verwenden ausdrücklich UTC.
- Ein Kalender verschiebt die Interpretation desselben Wetters: Wachstum,
  Blüte/Kornfüllung, Reife, Ernte, Ruhe beziehungsweise überlappende Dauerkultur.
  Eine manuelle Phasenauswahl dient der eigenen Einordnung; sie ändert keine Quelle.
- P minus ET₀ ist ein atmosphärischer Wasserbilanzhinweis für eine Grasreferenz,
  kein gemessener Bodenwasservorrat, keine Dürrediagnose und kein Wasserbedarf
  der konkreten Kultur. Bewässerung, Böden und bereits vorhandene Defizite fehlen.
- Wärme-, Frost- und Nassschwellen sind bewusst grobe redaktionelle Warnregeln.
  Sie quantifizieren weder Ertragsverluste noch Preise oder deren Wahrscheinlichkeit.
  Auch günstige Bedingungen garantieren keinen Ertrag. Einzelne Wetterpunkte
  dürfen nicht zu flächen- oder produktionsgewichteten Weltbewertungen werden.
- Fehlwerte bleiben fehlend. Ein fehlgeschlagener Abruf ersetzt keine Werte durch
  Demo, null oder eine positive Einschätzung. Alte Stände bleiben als alt sichtbar.
- Tage ab dem achten Vorhersagetag sind ein unsicherer Ausblick. Es gibt keine
  erfundene Ensemblewahrscheinlichkeit oder verlässliche Monatswetterprognose.

## Oberfläche

Eigenständige Route `/weather`, im Marktkontext als **Wetter & Rohstoffe**.
Assetwahl mit Gruppen/Suche, Produktionskarte mit Punktlayern für Niederschlag,
Temperatur, P−ET₀ und Wirkungsregeln; Tagesregler und Abspielen der Vorhersage.
Regionsliste, typische Saison, einzelne Warnursachen und eine 7-Tage-Vorschau
ergänzen das Bild. Eine Tabelle/Diagramm zeigen alle Tageswerte, einschließlich
der getrennt bezeichneten Vorgeschichte. Quelle, Abrufzeit, UTC und räumliche
Abdeckung bleiben sichtbar. Die Liste funktioniert unabhängig von Kartenfarben.

Die grafische Erweiterung vom 05.10.2026 ergänzt den standardmäßig gewählten
Layer **Wetterbild**: ein benannter Wetterpunkt je Region mit WMO-Symbol und
Tagesmaximum. Drei Orte je Region bleiben einzeln auswählbar. Das größere
Wetterbild zeigt den ausgewählten Ort als schematische SVG-Landschaft mit
Wolken, Sonne, Regen, Schnee, Nebel oder Gewitter und den konkreten Tageswerten
daneben. Ein Symbolstreifen für heute bis +13 ist anklickbar und steuert dieselbe
Tagesauswahl wie Regler und Karte. Bewegung lässt sich abschalten und respektiert
`prefers-reduced-motion`; Kartensymbole sind statisch.

Grundlage ist zusätzlich Open-Meteos täglicher `weather_code` mit Einheit
`wmo code`: die **schwerwiegendste modellierte Wetterart des Tages**, keine
dominante Wetterart, aktuelle Wolkenaufnahme oder Stundenfolge. Die Animation
stellt keine Regenrate, Windrichtung oder gemessene Pflanzen-/Bodenentwicklung
dar. Niederschlagsmengen umfassen Regen und Schnee als Wasseräquivalent;
die dargestellte Wahrscheinlichkeit ist das höchste stündliche Modellniveau
des Tages. Codes müssen als 21 Ganzzahlen zwischen 0 und 99 oder null vorliegen.
Nicht zugeordnete Codes bleiben unbekannt. Ältere Backendantworten ohne diese
Variable behalten ihre übrigen gültigen Werte; es wird kein Wettertyp aus
Regenmenge oder Temperatur abgeleitet. Der Frontend-Query-Key enthält eine
eigene Vertragsversion, um vorherige geparste Datenstände abzugrenzen.

## Daten und Architektur

Gemeinsamer versionierter JSON-Katalog unter
`apps/desktop/src/features/weather/data/catalog.json`. Native Abrufe akzeptieren
nur eine bekannte Asset-ID; Koordinaten und Variablen stammen aus diesem Katalog.
Keine Standortfreigabe, Journalinformationen oder Kontodaten gehen an den Anbieter.
Feste Open-Meteo-HTTPS-Adresse, geprüfte Einheiten, vollständige Zeitachsen,
Antwortgrößengrenze, Frist und Abrufcache. Kein API-Schlüssel notwendig.
Alle Produktzugriffe laufen über `services/commands.ts`. Die lokale Browser-
Vorschau verwendet echte öffentliche Abrufe; im privaten Webmodus bestimmen
bestätigte Backend-Capabilities die Verfügbarkeit, ohne Demo-Fallback.
Die Interpretation liegt einmalig in einem reinen TypeScript-Modul, das native
und Browserantworten gleich verarbeitet. Wetterdaten berühren keine Journal-
oder Macro-Scores und benötigen keine Journaldatenbankmigration.

## Primärquellen und Grenzen

- [Open-Meteo Forecast API](https://open-meteo.com/en/docs): öffentliche
  Wettermodelle, aktuelle Modellbedingungen, Tagesvorhersage und ET₀ nach FAO-56.
- [Open-Meteo Nutzungsbedingungen](https://open-meteo.com/en/terms): private Apps
  ohne Werbung/Abos sind als nichtkommerzielles Beispiel genannt; freie API mit
  weniger als 10.000 Aufrufen/Tag, 5.000/Stunde und 600/Minute. Variablen,
  Zeitspanne und Anzahl der Orte zählen zum Volumen. Attribution bleibt sichtbar.
- [USDA Crop Explorer](https://ipad.fas.usda.gov/cropexplorer/): Produktionsgebiete,
  Kulturen und Kalender. Ältere SPAM-Gewichte werden nicht als aktuelle Anteile
  ausgegeben. Der Katalog ist eine redaktionelle Auswahl, kein Live-Produktionsranking.
- [USDA Normal Crop Calendar](https://ipad.fas.usda.gov/pdfs/crop_cal.pdf): typische
  saisonale Abläufe, keine Messung des diesjährigen Wachstumsstadiums.
- [ICCO: Growing Cocoa](https://www.icco.org/growing-cocoa/),
  [ICCO FAQ](https://www.icco.org/faq/): Wasserempfindlichkeit und überlappende
  Haupt-/Zwischenernten. Jahresklima wird nicht in Tages-Schadenschwellen umgerechnet.
- [FAO: Einfluss von Wassermangel](https://www.fao.org/4/t7202e/t7202e05.htm):
  unterschiedliche Empfindlichkeit nach Kultur und Entwicklungsphase.
- [FAO: Kaffee](https://www.fao.org/4/x6939e/X6939e01.htm): Bedeutung des Wechsels
  von trockenen und feuchten Abschnitten. Ein Schauer allein beweist keine Blüte.
- [FAO: Tee](https://www.fao.org/markets-and-trade/commodities-overview/beverages/tea/3/en),
  [FAO: Produktionsmethodik](https://files-faostat.fao.org/production/QCL/QCL_methodology_e.pdf):
  zusätzliche Dauerkulturen und unterschiedliche Erntekalender.
- [Natural Earth](https://www.naturalearthdata.com/downloads/110m-cultural-vectors/110m-admin-0-details/):
  vorhandene öffentliche Kartengeometrie, keine Online-Tiles und keine Kartenlizenzkosten.

## Spätere Erweiterungen

Eine belastbare Anomalieansicht braucht einen ausdrücklich festgelegten
mehrjährigen, zum Kalender passenden Referenzzeitraum (zum Beispiel ERA5/CHIRPS).
Eine Flächenbewertung braucht geprüfte Produktionsmasken und deren Bezugsjahr.
Ensemblemodelle können Prognosestreuung ergänzen, ohne Wetterwahrscheinlichkeit
mit Ertrags-/Preiswahrscheinlichkeit zu verwechseln. Energiebedarf,
Wasserkraft, Wind-/Solarproduktion und wetterempfindliche Logistik benötigen
eigene Wirkungsmodelle und werden nicht mit Landwirtschaftsschwellen bewertet.

## Prüfnachweise

Lokale Basisabnahme am 05.10.2026 vor der grafischen Erweiterung:

- 42 relevante Vitest-Prüfungen bestehen: Katalog/Geometrie und Wettervertrag,
  fehlende Werte und echte Null, Wachstums-/Ernteunterschiede, Einzelpunktextreme,
  vollständige Siebentagesfolgen, parallele Browserabrufe/Cache/Abruflimit,
  Assetwechsel, Ausblick und veraltete Daten sowie Navigation und private
  Capability-Abgrenzung. Synthetische Daten sind ausschließlich Testfixtures.
- TypeScript, gezieltes ESLint, Prettier und `pnpm build` bestehen. Vite meldet
  die vorhandenen großen gemeinsamen Bundles und den gemischten Import des
  privaten Webclients; der Wetterseiten-Chunk beträgt etwa 25,6 kB vor Gzip.
- Zwei native Wettertests bestehen. `cargo clippy --lib --no-default-features
  --features postgres -- -D warnings` besteht und kompiliert auch den getrennten
  Cloud-/Serverpfad. Der Windows-Debug-Build besteht; MSVC gibt beim Linken
  die Erstellung von Bibliothek-/Exportdateien als Linkermeldung aus.
- `target/debug/examples/weather_live.exe` hat um 13:19:53 UTC die echten
  Open-Meteo-Antworten für Arabica (12 Punkte), Kakao (18) und Winterweizen
  (21) erfolgreich abgerufen und vor der Rückgabe validiert. Der explizite
  Prüfeinstieg öffnet keine Journaldatenbank.
- Die neu gebaute Desktop-App wurde separat gestartet: Prozess und echtes
  Fenster **Personal Macro**, initialisierter Atlas-Speicher, keine Warnungen,
  Fehler oder Stderr bei der Startprüfung. Die Testinstanz wurde anschließend
  regulär geschlossen; die zuvor laufende Release-Instanz blieb bestehen.
- Der echte Chromium-Browserlauf prüfte Kaffee/Kakao, Kartenlayer, Tagesregler
  bis +13, Regionsfokus, automatische Wiedergabe und manuelle Entwicklungsphase.
  Bei 1536 px und 390 px bestand kein horizontaler Seitenüberlauf. Für Kakao
  wechselte derselbe reale Regen bei manueller Erntephase von möglicher
  Wasserzufuhr zu möglicher Ernte-/Trocknungsbelastung.
  Die Regionsnummern benachbarter brasilianischer Kaffeegebiete werden getrennt
  platziert; ihre tatsächlich gerenderten Textflächen überlappen nicht.

Screenshots und native Startnachweise liegen unter
`D:\Macrotool\apps\desktop\output\playwright`; zusätzliche CLI-Snapshots
unter `D:\Macrotool\apps\desktop\.playwright-cli`. Alle Medien-/Prüfpfade
liegen auf D: und sind nicht versioniert.
Der private Wetterpfad ist implementiert und kompiliert, aber noch nicht auf
dem bestehenden Cloudhost bereitgestellt. Der Browsertest ist keine physische
iPhone-/Safari-Abnahme; Prozess-/Fensterstart und separater echter Rust-Abruf
sind keine vollständige native UI-Abnahme. Ältere Release-Builds enthalten
die neue Route noch nicht.

Prüfung der grafischen Erweiterung am selben Tag:

- 41 erneut ausgeführte Vitest-Prüfungen bestehen (23 Wettermodell/-vertrag,
  vier Seitenprüfungen, drei Browsertransportprüfungen und elf Capability-Prüfungen).
  Sie ergänzen insbesondere Klarhimmel-Code 0 versus fehlende Codes, alte
  Backendantworten, unbekannte Codes, ungültige Codes/Einheiten/Längen sowie
  den gemeinsamen Wechsel von Ort, SVG-Wetterbild, Karte und Vorhersagetag.
- Zwei native Wettertests bestehen einschließlich WMO-Validierung. Der echte
  Rust-Abruf um 16:21:50–16:21:51 UTC liefert für Arabica (12 Punkte), Kakao (18)
  und Winterweizen (21) an jedem Punkt 21 tägliche Wettercodes. Dieser explizite
  Prüfeinstieg öffnet keine Journaldatenbank.
- TypeScript und gezieltes ESLint bestehen. Der Frontend-Build besteht; der
  Wetterseiten-Chunk beträgt etwa 37,2 kB vor Gzip. Die bestehenden Hinweise
  zu großen gemeinsamen Chunks und privatem Webclient bleiben unverändert.
- Der echte Chromium-Lauf zeigt Gewitter in Varginha am 07.10. und überwiegend
  klare Bedingungen am 09.10.; der Klick auf die Symbolvorschau ändert Karte
  und Wetterbild auf denselben Tag und entfernt die Regenanimation bei klaren
  Bedingungen. 14 Vorhersagebilder sind verfügbar, kein Seitenüberlauf bei 1536 px.
- Die 390-px-Ansicht für Kakao besteht ohne Seitenüberlauf. Alle sechs
  Wetterbadges sind vollständig sichtbar und überlappen sich nicht. Ihre
  Platzierung wird im Kartenausschnitt begrenzt; Linien verbinden sie mit den
  tatsächlichen Wetterpunkten. Das große Wetterbild und der horizontal
  scrollbare Vorhersagestreifen bleiben bedienbar.
- Im echten Browserlauf setzen sowohl der manuelle Bewegungsschalter als auch
  emuliertes `prefers-reduced-motion: reduce` die Partikelanimation auf `none`.
  Der Browser meldet keine Laufzeitfehler oder Warnungen.
- Der aktualisierte Windows-Debug-Build besteht. Die zuvor für den Nutzer
  gestartete Instanz wurde regulär geschlossen und durch den neuen Build
  ersetzt (Prozess 37460, Fenster **Personal Macro**). Die vorhandene automatische
  Startsicherung blockierte die Fensterbedienung vorübergehend; `VACUUM INTO` meldete
  58,8 Sekunden als langsame SQL-Anweisung. Nach Abschluss der Sicherung um
  16:32:52 UTC reagiert das Fenster wieder, Stderr bleibt leer. Es wurden keine
  persönlichen Einstellungen, Datensätze oder Sicherungsregeln verändert.
  Der Debug-Build verwendet die bestehende lokale Vite-Laufzeit auf Port 5198.
