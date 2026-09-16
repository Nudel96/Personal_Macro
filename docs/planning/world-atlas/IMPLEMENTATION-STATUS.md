# Weltatlas – aktueller Umsetzungsstand

Stand: 9. September 2026. **Implementierung und dokumentierte native
Bedienabnahme sind abgeschlossen.** Maßgeblich ist die aktuelle
[gemeinsame Abschlussprüfung](COMPLETION-AUDIT.md) mit R01–R18.
420 Frontendtests und 251 Rust-Library-Tests sowie Typecheck, Frontend- und
Windows-Releasebuild, ESLint, Prettier, Rustfmt und Clippy bestehen.
Nach erneuter Freigabe des Nutzers wurde die echte Tauri-WebView bedient:
Länder, Märkte, Bewertung, Bildung, Demografie, Energie, Historie, Modelle,
Notizen, PNG-Wiederaufnahme nach Prozessneustart und Netzfehler sind dokumentiert.
Die reguläre Desktop-Datei liegt am bestehenden Startpfad bereit.

Die folgenden Erweiterungsabschnitte bewahren die zeitliche Entwicklung.
Ältere Aussagen „native Abnahme offen“ beschreiben damalige Zwischenstände;
der aktuelle Abschluss und verbleibende Quellen-/Prüfgrenzen stehen im
verlinkten Abschlussbericht und [nativen Protokoll](evidence/native-acceptance.json).

Dieser Stand beschreibt den implementierten Datenkern, breitere
statistische Länderansichten mit geordneter Übersicht und Sammelabruf,
eine Quellen- und Themenabdeckung mit geprüften Gebietszuordnungen,
langfristige Marktwellen, weltweite UN-Demografie und UN-Haushaltsbilder,
Maddison-Jahrhundertperspektiven, Ember-Stromwirtschaft, IRENA-Anlagenbilder,
BIS-Kredit- und Immobilienbilder, OECD-Wohnvergleiche, UNESCO-Bildungsbilder,
FAOSTAT-Agrarbilder, JST-Finanzgeschichte seit 1870, historische IMF-Staatsfinanzen, sechs erklärende
Zyklusmodelle, veröffentlichte NYU-Bewertungen für Länder und Branchen sowie
eine optionale Weltkarte mit vollständiger Länderliste sowie gemerkte Ansichten,
Favoriten, persönliche Notizen und feste Diagrammstände im Journal-Backup.
Maßstab für das Endziel bleibt die vollständige
Abnahmematrix R01–R18 im [Umsetzungsplan](IMPLEMENTATION-PLAN.md).

## Jetzt implementiert

- **Finanzielle Teilhabe · Global Findex:** 42 Erhebungsperspektiven in sieben
  Gruppen für 162 Länder/Gebiete und zwölf veröffentlichte Aggregate. Konten,
  Zahlungen, Sparen, Zugangshürden und finanzielle Reserven sind für fünf
  Bevölkerungsgruppen bildlich vergleichbar. Alle Karten teilen dieselbe
  Anteilsskala; Zahlen bleiben optional. Einzelne Quellenjahre von 2011 bis
  2024 einschließlich nachgeholter 2022-Erhebungen werden nicht interpoliert.
  59.471 Quellzahlen, 98.701 Fehlwerte und alle 174 Profile stimmen exakt mit
  dem nativen Cache überein. Nach echtem Prozessneustart bleiben die Profile,
  gemerkte Ansicht, Notiz und das ursprüngliche PNG ohne neuen Download erhalten.
  268 Atlas-Frontendtests in 38 Dateien, drei Findex-Rustprüfungen, Typecheck,
  gezieltes ESLint, Rustfmt, Clippy und Build bestehen. Der Katalog enthält
  jetzt 365 Gebiete und 183 numerische Themenpfade; 52 Quellen-Einstiege bleiben
  numerisch unangebunden. [Quellenabgleich und Prüfgrenzen](FINANCIAL-INCLUSION.md).

- **Vorheriger Ausbau der Quellen-Einstiege (vor Findex):** 55 bisher
  allgemein erklärte Themen besitzen jetzt Bedeutung, recherchierte Quellen
  und konkrete Datengrenzen. 18 dieser Einstiege führen über 21 Verknüpfungen
  zu ergänzenden WDI-Bildern. Der vollständige Routentest findet bei 255 Themen
  in 24 Gruppen keine allgemeinen Platzhalter mehr: 180 Themen mit numerischem
  Datenpfad, 14 bisherige Kontext-Einstiege, 55 Quellen-Einstiege und sechs
  Theorieansichten. Das bestätigt keine vollständige lokale Länderabdeckung.
  Die Quellen-Themen bleiben numerisch nicht angebunden. 261 Atlas-Frontendtests,
  Typecheck, gezieltes ESLint, Browserprüfung und Build bestehen.
  [Quellenbefunde und Prüfgrenzen](TOPIC-RESEARCH.md).

- **Internationale Rohstoffpreise:** 85 Jahresreihen in elf Gruppen, nominal
  und mit MUV preisbereinigt, frühestens 1960–2025. Gemeinsamer Bildmaßstab zu
  2010, sechs Karten pro Seite, optionaler Rohstoffvergleich und Zahlenmodus.
  Die internationale Abgrenzung bleibt unabhängig von Ländern erhalten.
  10.310 Originalzahlen und 910 Fehlwerte sind über Rust, SQLite und JSON exakt
  geprüft. Quellenwechsel und eine publizierte Realindex-Abweichung bleiben
  markiert; Eisenerz wird erst ab 2009 vergleichbar gezeichnet.
  Echter kostenloser Download, unabhängiger Abgleich jeder Zelle und erneute
  Öffnung nach nachgewiesenem Desktop-Prozesswechsel bestehen. Quellenstand,
  Notiz, PNG und letzte Ansicht bleiben ohne weiteren Rohstoffabruf erhalten.
  [Quelle und Prüfgrenzen](COMMODITIES.md).

- **Beschäftigungsbilder:** 14 Wirtschaftsbereiche in drei Gruppen für 188
  Länder und Gebiete, Welt und die eigene ILO-Afrika-Modellregion. Der aktuelle
  kostenlose CSV-Zugang funktioniert und erschließt 1991–2024. Bildung,
  Gesundheit, Bau, Herstellung, Versorgung und Dienste bleiben klar abgegrenzt;
  keine faire Bewertung oder erfundene Zykluskurve. 96.765 Zahlen, 135 fehlende
  Kalenderzellen und alle Originalkennzeichen sind unabhängig exakt geprüft.
  192 echte Tauri-Antworten, Notiz und Bild bleiben nach Prozessneustart ohne
  neuen Download erhalten. [Details](LABOR.md).

- **Technologiebilder:** 35 WIPO-Fachgebiete und nicht zugeordnete
  Patentveröffentlichungen in sieben Gruppen für 199 heutige Länder und Gebiete,
  einschließlich Deutschland, USA, Indien und China. Quellenjahre ab 1980,
  Standard bis 2023, Randjahr 2024 optional. Alle 108.696 Integer und 213.684
  Fehlwerte stimmen exakt mit den Originaldaten überein. 201 Tauri-Antworten,
  Notiz und Diagrammbild bleiben nach echtem Prozessneustart ohne neuen Download
  unverändert. Kein weiterer API-Schlüssel. [Details](INNOVATION.md).

- **Gesundheitsbilder:** 38 WHO-Perspektiven in sieben Gruppen für 195 Länder
  und Gebiete seit frühestens 2000, einschließlich Deutschland, USA, Indien und
  China. Finanzierung, Versorgung, Pflege, Arzneimittel und Investitionen sind
  getrennt. Jahrespunkte erhalten Lücken und Methodenhinweise; 2024 bleibt
  vorläufig. Alle 81.762 Zahlen des echten Tauri-Caches sind unabhängig exakt
  mit den Originaldateien abgeglichen. 197 Antworten, Notiz und PNG bleiben
  nach Prozessneustart ohne Download erhalten. [Details](HEALTH-FINANCE.md).

- **Haushalte als demografisches Bild:** 39 Perspektiven in sieben Gruppen
  für 200 Länder/Gebiete. Die kostenlose UN-Datei enthält 1.129 einzelne
  Erhebungen von 1959 bis 2025; Quellenwahl, Größen, Wohnformen und Generationen
  bleiben bildlich vergleichbar. Alle 36.142 Zahlen stimmen exakt mit dem
  nativen Cache überein. 202 Antworten, Notiz und ursprüngliches PNG bleiben
  nach echtem Prozessneustart unverändert. [Details und Grenzen](HOUSEHOLDS.md).

- **Migration als demografisches Bild:** Drei WDI-Perspektiven trennen
  jährlichen Saldo, Migrantenbestand und Bevölkerungsanteil. Salden bleiben
  historische Modellschätzungen bis 2023, Bestandsjahre einzelne Punkte bis
  2024. Alle 17.336 neuen Zahlen stimmen weltweit exakt mit dem nativen Cache
  überein. 27 Antworten und das PNG bleiben nach echtem Prozessneustart
  erhalten. Die statistische Basis umfasst nun 91 Reihen. [Details](MIGRATION.md).

- **Lange Entwicklungen besser erschließen:** Zehn bisher leere Themen öffnen
  geordnete Einstiege in 22 bestehende Datenperspektiven. Industrialisierung,
  Dienstleistungen, Urbanisierung, Energie, Bildung, Produktivität, Bevölkerung,
  Inflation, Zinsen und Krisenkontext besitzen konkrete Bildziele mit
  Gebiets-/Zeitgrenzen. Land, Vergleich und Rückweg bleiben erhalten; 32 gemerkte
  Kontexte überstehen einen echten nativen Prozessneustart. Die numerische
  Datenabdeckung wird dadurch nicht künstlich erhöht. [Details](CONTEXT-GUIDES.md).

- **Energie und wirtschaftliche Rahmenbedingungen:** 14 zusätzliche WDI-
  Perspektiven ergänzen Brennstoffe, Energieimporte und Netzverluste, Rohstoffe,
  Gründungen, Handel, Logistik sowie Erwerbsbeteiligung bei tertiärer Bildung.
  Diese Erweiterung führte zu 88 Reihen in 17 Gruppen. Alle 80.438 neuen
  Werte stimmen weltweit exakt mit dem nativen Cache überein; 126 Antworten und
  das PNG bleiben nach einem echten Prozessneustart erhalten. Ältere Stände,
  unterschiedliche Bezugsgrößen und Erhebungslücken bleiben sichtbar.
  [Details und Grenzen](ECONOMIC-CONTEXTS.md).

- **Historische Staatsfinanzen:** Acht IMF-Perspektiven in drei Gruppen für
  151 Länder/Gebiete einschließlich Deutschland, USA, Indien und China. Ein
  kostenloser Abruf lädt die unveränderte Dezember-2025-Arbeitsmappe aus dem
  öffentlichen OWID-Archiv. Tatsächliche Reihen reichen je Land bis 1800
  zurück und enden spätestens 2024; alle 68.406 Zahlen sind unabhängig gegen
  den echten Tauri-Cache geprüft. Staatliche Ebenen, Lücken und datierte
  Definitionsbrüche bleiben getrennt. Notiz, PNG und alle Profile überstehen
  einen echten Prozessneustart unverändert. [Details und Grenzen](FISCAL.md).

- **Finanzgeschichte seit 1870:** 20 kostenlose JST-Perspektiven in sechs Gruppen
  für 18 Länder, Quellenstand bis 2020. Kredit, Banken, Wirtschaft, Preise,
  Zinsen und Erträge sind als Bildübersicht und Einzelbild vergleichbar.
  Zahlen, Nominal-/Realrenditen und Krisenanfänge bleiben gezielt wählbar.
  Alle 166.218 numerischen Roh-/Anzeigezellen sind unabhängig geprüft; fehlende
  Jahre, Quelleninterpolation und Extremwerte bleiben erhalten. Indien, China
  und Welt besitzen kein JST-Profil. [Details und Grenzen](MACROHISTORY.md).

- **Beschäftigung und Industriestruktur:** Acht zusätzliche WDI-Jahresreihen
  zeigen drei große Beschäftigungsbereiche und fünf Industrieanteile. Die
  ILO-Modellreihen sind fest auf 1991–2024 begrenzt; UNIDO-Industrieanteile
  reichen je Land frühestens bis 1963 zurück. Getrennte Bezugsgrößen, breite
  Branchendefinitionen, fehlende Weltwerte und ältere Länderstände bleiben
  sichtbar. 47.292 Werte sind weltweit exakt gegen die Originalantworten
  geprüft; der echte Tauri-Abruf und Prozessneustart bestehen.
  [Details und Grenzen](SECTOR-STRUCTURE.md).

- **Zuverlässige Wiederaufnahme bei Schreibsperren:** Nur der idempotente
  Präferenz-Upsert wird bei SQLite BUSY begrenzt wiederholt. Überholte Auswahlen
  werden übersprungen; eine schnelle Wiederkehr liest nach der vorherigen
  Speicherung. Drei reale native Sperrfälle und ein Prozessneustart sind
  unabhängig anhand von Zeitpunkten, Aufrufen und SQLite geprüft.
  [Details und Grenzen](PREFERENCES-RECOVERY.md).

- **FAOSTAT-Agrarbilder:** 196 Erzeugnisse und Produktgruppen in zwölf Gruppen,
  234 tatsächliche Profile (199 Länder/Gebiete und 35 eigene Quellenaggregate).
  Gesamtproduktion und Produktion je Einwohner bleiben getrennte veröffentlichte
  Indizes mit Basis 2014–2016. Sechs Bilder pro Seite, Suche, Einzelbild und
  Vergleich zeigen frühestens 1961–2024 mit tatsächlichen Lücken. Der kostenlose
  native Gesamtabruf und alle 1.995.192 Werte einschließlich 426 echter Nullwerte
  sind unabhängig gegen die Originaldatei geprüft. [Details](AGRICULTURE.md).

- **Lange Branchen-Gewinnbewertungen:** 83 zusätzliche NYU-Archivdateien
  erweitern die USA auf 1999–2026 sowie Europa, Japan, Schwellenländer und Global
  auf 2012–2026. Die fünf Pakete enthalten 41.877 unabhängig geprüfte Quellzellen.
  Ältere unpräzise Aggregatspalten bleiben eigene Definitionen; Archivprüfsummen
  schützen auch Dateien ohne Datumsstempel. Der falsche Japan-2025-Link wurde
  über die separat geprüfte Japan-Originaldatei aufgelöst. [Details](VALUATION.md).

- **UNESCO-Bildungsbilder:** 40 Perspektiven in elf Bildungsgruppen, 245 tatsächliche
  Profile (223 Länder/Gebiete und 22 eigene SDG-Regionen). Erhebungen, Lernstandstests
  und veröffentlichte Abschlussmodelle bleiben getrennt. Alle 103.593 Werte und
  124.541 Quellenhinweise sind gegen die Originaldatei geprüft. Zahlen optional,
  thematische Auswahl, Quellenkarte und Merkkontext integriert. [Details](EDUCATION.md).

- Neue lazy geladene Route `/world-atlas`, Eintrag im Marktkontext,
  Befehlspalette und Seitentitel.
- Gemeinsamer, von Rust und TypeScript verwendeter Katalog: 248 UN-M49-Gebiete,
  die separat bezeichneten Providergebiete Taiwan/Kosovo und das offizielle
  Weltbank-Weltaggregat. Fünf offizielle UN-Großregionen ergänzen diese Auswahl,
  zusammen mit acht eigenen Maddison-Regionsgruppen und zwölf eigenen
  Ember-Regions-/Ländergruppen, neun eigenen IRENA-Regionen, vier eigenen
  BIS-Aggregaten, drei eigenen OECD-Gruppen, 22 UIS-SDG-Regionen und 35 eigenen
  FAO-Quellengebieten, vier eigenen BIS-Schuldengruppen, ILO-Afrika und elf
  eigenen Findex-Aggregaten insgesamt 365 Einträge.
  Regionale Demografie verwendet die tatsächlichen
  UN-Aggregate; es werden keine Länderanteile ungewichtet gemittelt.
- Acht Hauptfelder, 24 Gruppen und 255 Themen mit Suche (233 Planungsthemen
  plus elf ausdrücklich bezeichnete Börsensektoren, historische Wirtschaftsgröße
  und sechs zusätzliche klar abgegrenzte Stromthemen sowie Kaufpreise im
  Mietvergleich und Finanzgeschichte seit 1870). Länder und Themen
  werden über URL-Parameter gewählt; schnelle aufeinanderfolgende Änderungen
  erhalten die vorherige Auswahl. Deutschland, USA, Indien und China haben
  denselben Datenpfad wie andere Länder.
- Eigener SQLite-Cache `PersonalMacro/atlas/cache.sqlite`, eigene additive
  Migrationen unter `src-tauri/atlas-migrations`. Persönliche Ansichten liegen
  gesondert seit Hauptmigration 0047 in der Journal-Datenbank.
  Fehler des öffentlichen Atlas-Caches verhindern den Journalstart nicht.
- Nativer WDI-Adapter für 91 explizit zugeordnete Reihen: die ursprünglichen
  zehn plus 81 Länderperspektiven zu Migration, Bildung, Gesundheit, Arbeit, Wirtschaftsstruktur,
  Versorgung, Forschung, Außenwirtschaft, Umwelt und Verkehr. Der Produktionskatalog
  enthält geprüfte Einheiten und deutsche Bedeutungstexte. Ähnliche Statistiken
  bleiben bewusst auswählbar; die Auswahl ist über die URL erreichbar.
  [Bedeutung und Grenzen](STATISTICS.md).
- Länderübersicht über diese 91 Statistiken: 17 Gruppen in sieben Feldern,
  Reihenfolge nach Katalogthema, optionaler Ländervergleich und Zahlen zunächst
  verborgen. Alle SVG-Karten teilen den Kalender; unterschiedliche Statistiken
  behalten eigene Skalen, zwei Länder derselben Karte teilen den Maßstab.
  Tatsächlich gezeigte gemeinsame Jahre, Einzelpunkte, ältere Stände und Lücken
  sind sichtbar. Der Klick öffnet die konkrete Statistik; Feld, Gruppe,
  20-/40-Jahresfenster beziehungsweise seit 1960 und Länder bleiben erhalten.
- Expliziter Statistik-Sammelabruf für die sichtbare Auswahl. Er teilt die
  globale Atlas-Abrufsperre, überspringt erfolgreiche Downloads der letzten
  24 Stunden und übernimmt jede Statistik weltweit einzeln atomar. Der Job zählt
  fertige Statistiken statt Providerseiten. Stoppen nach der laufenden Statistik,
  Teilerfolge bei späterem Fehler und Weiterladen sind implementiert.
  Die Oberfläche liest den Cache bereits bei Fortschritt und in allen
  Abschlusszuständen neu. Der Browser simuliert keinen Download-Erfolg.
- **Daten & Quellen** als eigene Ansicht mit 21 Quellenkarten und allen
  24 Themengruppen. Bildliche Abdeckungsbalken, ergänzende Symbole/Statuswörter,
  optionale Zahlen, Suche nach konkreten Messgrößen und erhaltene URL-Filter.
  Die tatsächlichen Bildgrundlagen werden geprüft; eine zu kurze Fondsserie
  zählt nicht als lange Welle. Andere Quellengebiete werden ausdrücklich gewählt,
  globale Fonds bleiben global, Themen ohne Anbindung bleiben sichtbar.
  Alle Zugriffe verwenden vorhandene lesende Commands. [Bedienung und Grenzen](COVERAGE.md).
- Geschlossene Quellengruppen erzeugen ihre Auswahl erst beim Öffnen. Suche
  öffnet passende Gruppen weiterhin direkt; Tastaturbedienung bleibt erhalten.
  Das vermeidet unnötige Darstellungsarbeit durch die 392 neuen FAO-Optionen.
- Datierte Gebietsprüfung für alle 365 Katalogeinträge: 217 WDI-Zuordnungen,
  243 UN-Profile, 174 Maddison-Profile, 227 Ember-Profile und elf Gebiete mit
  expliziten Börsen-Stellvertretern; ergänzende IRENA-, BIS-, OECD-, UIS- und
  FAO-Zuordnungen stehen in den jeweiligen Quellenprotokollen; die JST-Prüfung
  ergänzt 18 eigene Länderzuordnungen. Findex ergänzt 174 geprüfte Profile.
  Diese Zahlen bezeichnen unterschiedliche
  Länder-/Regionsdefinitionen, keine lückenlose Statistikabdeckung.
  Das WDI-Sammelgebiet `CHI` bleibt bewusst unzugeordnet und wird bei Jersey/
  Guernsey erläutert. [Vollständiges Zuordnungsprotokoll](evidence/geography-crosswalk.json).
- Ein gewählter Statistikabruf lädt alle vom Anbieter gelieferten Gebiete,
  prüft Metadaten und Seitenfolge und speichert nur die explizit zugeordneten
  Atlasgebiete sowie das Weltaggregat. Andere Anbieteraggregate werden nicht
  als Länder summiert. Nicht zuordenbare Gebiete werden nicht erfunden.
- Begrenzte HTTPS-Abfragen ausschließlich an `api.worldbank.org`, keine
  Weiterleitungen, Antwortgrößenlimits, Timeouts und begrenzte Wiederholungen.
  Die Payload enthält Statistikcode und Zeitraum, keine Journal-/Kontowerte.
- Atomare Übernahme nach vollständigem Abruf; vorherige Daten bleiben bei
  Fehlern erhalten. Abrufprotokoll, SHA-256 je Antwort, Metadaten,
  Quellenstand und Abrufzeit werden gespeichert. Ein unterbrochener früherer
  Abruf wird nach Neustart kenntlich gemacht und kann neu gestartet werden.
- Jahreslinien mit offenen Lücken, gemeinsamen Jahren/Einheiten/Datenständen
  im Vergleich und einer Beschreibung der Richtung im tatsächlich gezeigten
  Fenster. Zahlen sind zunächst verborgen; Werte, Tabelle und Quellen sind
  bewusst zugänglich. Die zweite Vergleichslinie hat zusätzlich eine andere
  Strichart. Es gibt keine Interpolation über Lücken oder geglättete Scheindaten.
- Kennzeichnung fehlender, noch nicht geladener und nicht zuordenbarer Daten,
  älterer Datenstände und Modellschätzungen. Statistische Entwicklung wird
  ausdrücklich nicht als Markt- oder Anlagebewertung ausgegeben.
- Browseradapter liefert Katalognavigation und den Status `desktop_required`,
  ohne native Downloads oder echte Länderwerte zu simulieren.
- Marktwellen für 26 ausdrücklich zugeordnete Fonds: zehn Länder, ein
  Weltmarkt, elf US-Sektoren und vier globale Energiethemen. Eigenes
  Monatsmodell, abgeschlossene Monate, bereinigte Kurse ohne Rohkurs-Ersatz,
  historische Grenzen und keine falsche Umbenennung globaler Themen zu Ländern.
- Nativer rückblickender Logtrend mit zwölf Monaten Glättung. Lücken,
  Mindesthistorie und dokumentierte Strukturbrüche bleiben sichtbar.
  Eine Empfindlichkeitsprüfung macht widersprüchliche lange Fenster kenntlich.
  Die Kurve beschreibt historische Marktlage, keine fundamentale Bewertung.
- Marktübersicht mit kleinen SVG-Wellen, Gruppenfiltern, gemeinsamen Kalender-
  und Wertachsen, sichtbaren Leer-/Fehlerzuständen und direkter Fondsauswahl.
  Ein expliziter Sammelabruf überspringt aktuelle lokale Reihen. Stoppen nach
  dem laufenden Fonds, Teilerfolge bei Fehlern und erneutes Laden der ausstehenden
  Märkte sind implementiert. Die Query-Daten werden während des Fortschritts
  und bei abgeschlossenem, gestopptem oder fehlgeschlagenem Job aktualisiert.
- Getrennter Marktcache durch Atlasmigration 0002; atomare Lese-/Schreibsnapshots,
  Abrufjobs, vorheriger Stand bei Fehlern, eigener Quellenhash ohne API-Token.
  Ein expliziter Abruf pro Fonds, frühestens nach 24 Stunden erneut, keine
  automatische Abfrage aller Fonds. [Methodik und Abdeckung](MARKET-WAVES.md).
- UN-Demografie für 237 Länder/Gebiete sowie Welt und fünf Großregionen:
  21 Altersgruppen für 1950–2100. Historische Schätzungen bis 2023 und die mittlere
  Projektion ab 2024 bleiben auch bei bereits vergangenen Projektionsjahren getrennt.
  Pyramiden, Bevölkerungsverlauf, Altersanteile und Jugend-/Altenquotienten,
  Jahresregler, zwei Profile im gleichen Maßstab und optionale Zahlen.
- Begrenzter Download der offiziellen WPP-Datei plus Togo-Korrektur und
  Gebietsnoten, insgesamt rund 31 MB. Gzip-Mitglieder und Prüfsummen werden
  vollständig gelesen. Atomare lokale Übernahme in Atlasmigration 0003,
  Hashes/Release/Quellenstatus, vorheriger Stand bei Fehlern und getrennte
  Browserzustände. [UN-Methodik und Quellenprüfung](DEMOGRAPHY.md).
- Historische Wirtschaftsleistung je Einwohner, Gesamtwirtschaft und Weltanteile
  für 165 Länder/Gebiete, Welt und acht Maddison-Regionen. Kostenloser gemeinsamer
  OWID-Download, eigener atomarer Cache in Atlasmigration 0004, Metadaten- und
  Umfangsprüfung. Einzelne frühe Schätzpunkte und fehlende Jahre bleiben sichtbar;
  lineare und proportionale Skalen, gemeinsame Vergleiche und optionale Zahlen.
  Frühere Staaten werden heutigen Ländern nicht zugeschlagen. Der Quellenstand
  endet 2022; keine Sinusperiode oder Zukunftskurve. [Methodik](HISTORY.md).
- Ember-Stromwirtschaft: 214 Länder/Wirtschaftsgebiete und 13 veröffentlichte
  Aggregate einschließlich Welt. Jahresdaten 2000–2025 für neun Erzeugungsarten,
  Strommix, gesamte Erzeugung, installierte Leistung, Nachfrage und Nettoimporte.
  Quellenstatistik mit Schätzungen, echte Lücken/Nullwerte und getrennte Einheiten.
  Begrenzter kostenloser Download ohne Schlüssel, gemeinsamer atomarer Cache in
  Atlasmigration 0005. Vergleich nach gemeinsamen Jahren und Quellenstand,
  optionale Zahlen/Tabelle, ausdrücklicher Quellenregionswechsel und eigener
  Schalter zur bestehenden Börsenperspektive. [Methodik und Prüfung](ENERGY.md).

- Sechs eigenständige Theorieansichten unter **Lange Entwicklungen →
  Zyklusthesen untersuchen**. Konjunktur, Finanzen, Investitionen, Innovation,
  Kondratjew und säkulare Zyklen besitzen je vier wählbare Lernschritte und
  frei gezeichnete, ausdrücklich bezeichnete Modellbilder. Der Einstieg ist
  geschlossen; es gibt keine automatisch laufende Bewegung und keine heutige
  Länderphase. Quellenbefunde, Gegenargumente und Geltungsbereiche sind getrennt.
  Zwei konkrete Datenlinks je Modell erhalten Gebiet und Vergleich, der
  Rücksprung zusätzlich den Lernschritt. In der Datenabdeckung bleiben
  numerische Zyklusreihen unangebunden. [Modelle, Quellen und Grenzen](CYCLES.md).

- Eigene **Bewertungsbilder** aus den öffentlichen NYU-/Damodaran-Jahrestabellen:
  16 getrennt abrufbare Pakete, 195 geprüfte Originaldateien, Länderkennzahlen
  sowie 94 aktuelle Branchen. Die Branchen sind in zehn Felder sortiert;
  höchstens sechs Bilder teilen Kalender und Skala. Ein Klick öffnet die
  Einzelansicht mit optionalem Branchenvergleich oder derselben Branche in
  zwei Quellenregionen. Länder behalten ihre eigene
  Auswahl und den Vergleich. Zahlen sind zunächst verborgen.
- Kurs/Buchwert-Archive beginnen für US-Branchen 1999, für Europa, Japan,
  Schwellenländer und Global 2012. Die Indien-/China-Buchwertstände
  bleiben bislang Momentaufnahmen. Die Gewinnbewertungen
  besitzen nun dieselben langen US-/Regionalarchive; Indien und China bleiben
  bei ihren einzelnen Gewinnständen. Der chinesische
  Gewinnstand ist ausdrücklich 2025. Länder-Mittelwerte bis 2020 und Mediane
  ab 2021 bleiben getrennt; Einzelpunkte und fehlende Jahre erhalten keine Welle.
- Historische Hoch-/Tieflage nur mit mindestens zehn früheren nutzbaren Ständen
  derselben Definition und ausreichender Unternehmensstichprobe. Fehlende und
  nicht positive Bewertungsverhältnisse sind kein Günstigkeitssignal. Eigene
  Atlasmigration 0006, atomare Paketübernahme, begrenzte Downloads und gezielter
  Abbruch erhalten den vorherigen lokalen Stand. Keine weitere kostenpflichtige
  API und keine Verbindung mit den bestehenden Macro-/Rates-Scores.
  [Quellen, Methodik und Abnahme](VALUATION.md).

- Optionaler geografischer Einstieg **Weltkarte & Länderliste** mit 177
  zugeordneten Kartenflächen und allen 365 Kataloggebieten in der Liste.
  Gebündelte Natural-Earth-Map-Units 5.1.1, Equal-Earth-Projektion, eigener
  Quell-/Gebietsaudit und kein Kartendienst. Land-/Vergleichswahl erhält Thema
  und Ansicht. Suche, Regionsfilter, Pfeiltasten, Enter/Leertaste sowie
  Listenbuttons funktionieren auch für Gebiete ohne eigene Fläche. Der
  Bereich startet geschlossen und wird lazy geladen. [Details](MAP.md).

## Tatsächlich geprüft

### Rust und reale Quellen

`cargo test world_atlas --lib`: 36 deterministische Tests bestanden,
zehn explizite Quellenprüfungen regulär übersprungen. Geprüft werden Katalogidentitäten,
unerwartete Quellen-/Seitenantworten, Null/Nullwert, Bruttoquoten über hundert,
Schätzungskennzeichen, doppelte Werte, atomarer Rollback, Revision,
Cache-Neustart und unterbrochene Abrufe.
Die Marktprüfungen ergänzen Vorlaufzeiten, fehlende bereinigte Werte,
Duplikate, Zukunftsdaten, nur abgeschlossene Monate, Strukturbrüche,
unveränderte frühere Wellenpunkte und Zeitfensterempfindlichkeit.
Ein befüllter v1-Atlas-Cache wurde auf Migration 0002 aktualisiert;
vorhandene Statistikdaten blieben erhalten.
Demografieprüfungen ergänzen vollständige Altersgruppen, Einheitenumrechnung,
den Schätzungs-/Projektionswechsel, fehlende Geschlechterwerte, Null-Nenner,
Quellenrundung, CSV-Duplikate, mehrere Gzip-Mitglieder, beschädigte Prüfsummen,
atomaren Rollback und Offline-Neustart.

`cargo test world_atlas_live_worldbank_roundtrip --lib -- --ignored --nocapture`:
explizit mit dem echten nativen Adapter durchgeführt. Alle zehn angebundenen
Statistiken über jeweils vier Datenseiten erfolgreich geladen. Je Statistik
wurden 14.322 Jahreszeilen für die zugeordneten Gebiete im isolierten Cache
gespeichert. **Diese Zahl enthält auch fehlende Werte und belegt keine
lückenlose Abdeckung.** Für Deutschland, USA, Indien und China wurden je Reihe
nutzbare Werte aus SQLite zurückgelesen. Die ursprüngliche Planungsprobe enthält
die genaueren historischen Lücken; sie wird dadurch nicht aufgehoben.

Der Netzwerktest benötigt keinen API-Schlüssel, verwendet `tempfile` und greift
auf keine persönliche Datenbank zu. Er bleibt in normalen Testläufen ignoriert.

`world_atlas_live_statistics_expansion_roundtrip` prüfte danach alle 66
produktiven Statistikreihen über den realen globalen Adapter. 505.412 echte
Zahlenwerte unter 945.252 Jahreszeilen einschließlich Nullfeldern wurden im
temporären Cache gespeichert. 594 Antworten für Deutschland, USA, Indien,
China, Brasilien, Nigeria, Südafrika, Japan und Welt blieben nach Offline-Neustart
vollständig gleich. Die unabhängige Python-/Decimal-Prüfung der 56 neuen
Reihen bestätigte 20.464 Zahlenwerte exakt und 12.800 fehlende Werte sowie
die Quellkennzeichen. Das noch unzugeordnete WDI-Sammelgebiet `CHI` wird im
Abdeckungsprotokoll benannt; daraus werden keine Werte für einzelne Inseln
erfunden. [Statistikprüfung](STATISTICS.md),
[unabhängiger Abgleich](evidence/statistics-independent-check.json),
[weltweite Abdeckung](evidence/statistics-coverage.json).

`world_atlas_live_statistics_batch_roundtrip` lud anschließend Gesundheitsausgaben
und Grundschulbesuch über den tatsächlichen asynchronen Statistik-Sammeldienst.
Beide globalen Datensätze wurden unter einem einzigen Job atomar gespeichert;
Providerseiten veränderten weder Jobidentität noch die Zahl von zwei Statistiken.
Der Fortschritt blieb monoton. Deutschland und Indien lieferten jeweils über
zwanzig numerische Jahre. Alle vier Antworten blieben nach Offline-Neustart
vollständig gleich, und ein sofortiger erneuter Abruf wurde abgewiesen. Der
explizite Netzwerktest bestand in 3,83 Sekunden. Drei deterministische Tests
ergänzen Auswahlvalidierung, 24-Stunden-Grenze, gemeinsame Abrufsperre, gezielten
Abbruch, Fehler nach Teilerfolg, unveränderte ältere Fehlerdaten und Weiterladen.

`cargo test world_atlas_live_eodhd_proxies_roundtrip --lib -- --ignored --nocapture`:
alle 26 ETF-Symbole mit der vorhandenen Konfiguration tatsächlich geladen und
über einen temporären SQLite-Cache gelesen. HYDR hat 62 Monatsbeobachtungen und
erhält derzeit keine Welle. Alle abgerufenen Reihen enthalten August 2026.
Eine zusätzliche, lokale Sichtprüfungsstichprobe mit SPY/EWG/XLV/TAN/HYDR
verwendet echte native Berechnungsergebnisse. Lokale Rohkurshistorien und der
Schlüssel werden nicht im Repository veröffentlicht. Die öffentliche
Sensitivitätsnotiz speichert nur Prüfmetadaten und Methodenvergleiche.

Der neue explizite Test `world_atlas_live_market_batch_roundtrip` lud SPY und
TAN über den tatsächlichen asynchronen Sammeldienst in einen temporären Cache.
Beide wurden vollständig übernommen; ein anschließender erneuter Sammelabruf
wurde durch die 24-Stunden-Regel abgewiesen. Deterministische Tests prüfen
Abbruch nach Abschluss des laufenden Fonds, Fehler nach Teilerfolg, Erhalt der
vorherigen fehlerbetroffenen Reihe, Wiederaufnahme und Offline-Neustart.

`cargo test world_atlas_live_demography_roundtrip --lib -- --ignored --nocapture`:
die echten drei UN-Dateien wurden geladen, vollständig validiert und in einem
temporären Cache gespeichert. 243 Profile mit jeweils 151 Jahren und 21
Altersgruppen; darunter alle 237 Quellländer/-gebiete. 14 Profile einschließlich
Deutschland, USA, Indien, China, Togo, Taiwan/Kosovo und allen Großregionen wurden
gezielt zurückgelesen; erneutes Öffnen funktionierte offline. Gesamtdauer dieser
Debug-Probe rund 26 Sekunden. Eine unabhängige Python-/Decimal-Nachrechnung von
133.182 Werten aus den Original-CSV-Dateien stimmte mit der nativen Ausgabe bis
auf weniger als 0,00001 Menschen numerischer Darstellung überein.
[Prüfprotokoll](evidence/demography-readiness.json),
[unabhängiger Abgleich](evidence/demography-independent-check.json).

Der explizite historische Netzwerktest lud beide veröffentlichten OWID/Maddison-
Dateien und übernahm 174 Profile atomar. Zwölf Profile wurden gezielt gelesen
und nach Offline-Neustart erneut verfügbar. Eine unabhängige Python-/Decimal-
Prüfung bestätigte 4.274 Quellenwerte, 235 abgeleitete Weltanteile und 4.425
fehlende Zellen/Anteile. [Historische Prüfung](HISTORY.md).
Der v3→v4-Migrationstest bewahrte bestehende Demografiezeilen.

Der explizite Ember-Netzwerktest lud die gesamte öffentliche Jahresdatei und
speicherte 227 Profile in einem temporären Cache. 15 Länder/Regionen wurden
gezielt zurückgelesen und nach Offline-Neustart erneut verfügbar. Der
unabhängige CSV-/Decimal-Abgleich bestätigte 11.338 Werte exakt, 404 leere
Zellen und 348 fehlende Schlüssel. Negative Nettoimporte und echte Nullwerte
blieben erhalten. Der v4→v5-Test bewahrte die bestehenden historischen Daten.
[Energieprüfung und Abdeckung](ENERGY.md).

`cargo clippy --all-targets -- -D warnings` und `cargo fmt --all -- --check`
bestanden. Beim Windows-Linken meldet Rust die Erstellung von `.lib`/`.exp`
als Linker-Ausgabe; dies ist getrennt von Laufzeitwarnungen zu betrachten.

### Frontend und Bedienung

Gezielte Vitest-Prüfung für Atlas und bestehende Marktnavigation: 83 Tests
bestanden. Sie deckt gemeinsame Vergleichsfenster, fehlende Werte, passende
Einheiten, die sichtbare Trendbeschreibung, Browsergrenzen, Länderfilter,
Themensuche, optionale Zahlen und Query-Invalidierung ab. Marktprüfungen
ergänzen explizite Gebietswechsel, Markt-Downloads, passende Vergleichsreihen
und unverfälschte Lücken.
Die neue Statistikprüfung ergänzt bewusst getrennte Trinkwasserkategorien,
direkte Statistik-URLs, Reset beim Themenwechsel, fehlende Alphabetisierung,
Preis-/Kaufkraftbasen, negative Werte, Bruttoquoten über hundert, einzelne
Erhebungsjahre und zunächst verborgene Zahlen-Tooltips.
Die Länderübersicht ergänzt gemeinsame Kalenderkoordinaten, getrennte
Statistikskalen mit echten Nullen/negativen Werten, einzelne Punkte, keine
zukünftigen Jahreswerte, fehlende Vergleichsgrundlagen und gleiche Zahlenjahre.
Bedienprüfungen sichern Themenreihenfolge, konkrete Statistik beim Öffnen,
erhaltene Länder und Filter bei Rückkehr, ehrliche Leer-/Gebietszustände,
explizite Sammelauswahl und Invalidierung nach Fortschritt, Fehler und Abbruch.
Die Quellenübersicht ergänzt acht Modell-/Bedienprüfungen zu datierten
Gebietsidentitäten, Null-/Fehlwerten, tatsächlicher Bildgrundlage, zu kurzen
Wellen und globalen Fonds. Suchen nach einer Messgröße verwenden deren eigenen
Status. Konkrete Statistikauswahl, erhaltene Vergleiche/Filter, explizite
Quellengebietswechsel und ausschließlich lesende Zugriffe sind geprüft.
Die fünf ergänzenden Modell-/Bedienprüfungen sichern alle sechs Katalogthemen,
Quellen und tatsächlich gebundene Kontextlinks. Geschlossener Einstieg,
ungültige URL-Parameter, bewusstes Öffnen, landesunabhängige Zeichnung,
erhaltene Länder/Schritte beim Rückweg und unveränderte numerische
Nichtverfügbarkeit der Theorieansichten sind geprüft.
Die Marktübersicht ergänzt gemeinsame SVG-Koordinaten, echte Kalendermonats-
lücken, keine zukünftigen Punkte, korrekte Gruppenwahl und direkte Öffnung des
konkreten Fonds, Batch-Auswahl, Abbruch und Invalidierung bei Teilerfolgen/Fehlern.
Demografieprüfungen ergänzen gemeinsame Nenner/Jahre/Datenstände, bewusste
Szenarienauswahl, fehlende Alterswerte und globale Query-Invalidierung.
Der ECharts-Wrapper
ist im Komponententest ersetzt; das ist keine vollständige visuelle
Abnahme echter nativer Diagramme.

Typecheck, Frontendbuild und gezieltes ESLint bestanden. Der Build meldet
weiterhin die bereits bekannte Größe der ECharts-/Dokumentexport-Chunks.
Nach den letzten Modellbild- und Fokuskorrekturen erneut geprüft:
68 Tests in zwölf Dateien, Typecheck, gezieltes ESLint und Produktionsbuild
bestanden; keine zusätzlichen Abhängigkeiten. Der Atlas-Chunk umfasst rund
148 kB beziehungsweise 44 kB gzip. Dieser Abschnitt ändert keine nativen
Commands, Datenbanktabellen oder Cachemigrationen.

Reale Browser-Vorschau auf eigenem Port: Weltatlas-Route, Suchpfad zu
Solarenergie, Indien/Bildung, USA/Wirtschaft, schnelle Auswahlwechsel sowie
Layout bei normaler Breite und 1024 px geprüft. Keine neuen Browserwarnungen
oder Laufzeitfehler; kein zusätzlicher horizontaler Überlauf im Atlas.
Die Sichtprüfung betrifft Navigation und Browserzustände, keine native
Endabnahme von Datencharts.

Zusätzlich wurde eine klar gekennzeichnete, ignorierte lokale Prüfansicht mit
echten Rust-/EODHD-Snapshots verwendet. Deutschland/USA-Wellen, Solarwelle,
symmetrische Mitte, optionale Zahlen und gemeinsame Monatstabelle wurden
visuell geprüft. Bei 1024 px entstand kein horizontaler Seitenüberlauf.
Die echte UN-Stichprobe ergänzte Deutschland/Indien-Pyramiden,
China/Indien-Bevölkerungsszenarien und Afrika/Deutschland bei 1024 px. Der
Jahresregler ließ sich per Tastatur bewegen, Zahlen und Tabelle bewusst öffnen;
die Browserkonsole blieb fehlerfrei. Projizierte und geschätzte Jahre wurden
im sichtbaren Status korrekt unterschieden.

Historische Diagramme wurden zusätzlich für Deutschland/Indien und China/USA
sowie Subsahara-Afrika/Westeuropa mit echten nativen Daten geprüft. Frühe
Einzelpunkte, Kalenderlücken, verschiedene Zeitfenster und die gemeinsame
Anteilsdarstellung waren sichtbar. Bei 1024 px blieb die Seite innerhalb der
Fensterbreite; optionale Zahlen und Tabelle funktionierten. Keine Browserfehler
oder Warnungen erschienen.

Die Marktübersicht wurde mit frisch erzeugten nativen SPY-/EWG-/XLV-/TAN-/HYDR-
Snapshots geprüft. Die übrigen Karten behielten ihren ehrlichen Browser-
Leerzustand. Gemeinsame Wellen, Empfindlichkeit bei EWG/XLV, die zu kurze HYDR-
Historie, Gruppen-/Zeitraumwahl und optionale Zahlen waren sichtbar. Bei
1024 px entstanden zwei Spalten ohne horizontalen Seitenüberlauf; bei 1440 px
drei Spalten. Enter auf der Uran-Karte öffnete genau URA im globalen Kontext.
Die Browserkonsole zeigte keine Warnungen oder Fehler.

Die sechs Zyklusmodelle wurden zusätzlich in derselben App-Shell visuell
geprüft: Öffnen und Quellen per Tastatur, alle Modelle und exemplarische Schrittwechsel,
Kontextwechsel vom Kondratjew-Modell zur echten Indien-/China-Historie und
Rückkehr zum vorherigen Schritt. Bei 1024 × 720 px stehen die Schritte in zwei,
bei 1440 × 900 px in vier Spalten. Kein horizontaler Überlauf; der Rückweg
positioniert das Modell unter dem festen Seitenkopf. Das säkulare Endbild
zeigt drei mögliche Ausgänge. Quellenübersicht und Statusfilter zählen diese
Modelle weiterhin nicht als vorhandene numerische Zeitreihen. Die Konsole
blieb ohne Warnungen oder Fehler.

### Reale Desktop-Initialisierung

Tauri wurde mit einer separaten Testkennung
`com.personal-macro.atlas-validation` und einer unveränderten produktiven
Quellkonfiguration gestartet. Die zusätzliche Testkonfiguration lag unter
`.tmp/atlas-validation/tauri-config.json`. Die App verwendete dadurch eine
eigene AppData-Umgebung. Der native Prozess meldete:

```text
INFO Lokaler Atlas-Speicher initialisiert
```

Die separate Cachedatei wurde im Test-AppData-Verzeichnis nachgewiesen.
Der Testprozess wurde danach gezielt beendet; sein Exitcode beim erzwungenen
Beenden ist kein Initialisierungsfehler. Der persönliche Journalpfad wurde
für diesen Test nicht verwendet.

Der Start wurde nach den Marktänderungen wiederholt. Der Atlas initialisierte
erfolgreich. Die vollständige native Sicht-/Klickprüfung blieb technisch offen:
die Windows-Aufnahme meldete `SetIsBorderRequired … 0x80004002`, und der
zugängliche WebView-Baum lieferte nur leere Regionsknoten. Die Bildprüfung fand
deshalb mit echten nativen Datensnapshots im Browser statt. Im nativen Log
erschienen außerdem Meldungen aus vorhandenen anderen Bereichen: abgelehnter
EODHD-Intraday-Zugriff für Technicals, ein Zentralbankbericht-Jobkonflikt und
beim ersten Lauf ein PDF-Parser-Panic eines Hintergrundworkers. Sie werden
nicht als Atlas-Abnahmeerfolg verschwiegen; sie wurden in diesem Atlas-Schritt
nicht verändert. Testkennungen und Test-Journal bleiben vom persönlichen
AppData-Verzeichnis getrennt.
Nach der Demografieintegration wurde Tauri erneut unter derselben Testkennung
gestartet. Die Initialisierung gelang; der separate Cache weist erfolgreiche
Atlasmigrationen 1, 2 und 3 aus. Das Testfenster blieb für diese reine Startprüfung
verborgen. Im bestehenden Hintergrundworkflow traten erneut die dokumentierte
Technicals-Ablehnung und der PDF-Parser-Panic auf. Der Atlas meldete keinen
Initialisierungsfehler. Der Testprozess wurde gezielt beendet.

Nach der historischen Erweiterung erfolgte ein weiterer realer Tauri-Start mit
separater Testkennung und verborgenem Testfenster. Der Atlas initialisierte
erfolgreich; Migrationen 1–4 und die beiden historischen Tabellen wurden im
Testcache nachgewiesen. Die bekannte Technicals-Ablehnung trat erneut auf,
kein neuer Atlas-Initialisierungsfehler. Der Testprozess wurde gezielt beendet.

Auch nach der Sammelabruf-Erweiterung wurde die echte Tauri-App mit derselben
separaten Testkennung gestartet. Der Atlas initialisierte; im Log stand erneut
die bekannte Technicals-/EODHD-Intraday-Ablehnung. Keine neue Atlas-Warnung wurde
beobachtet. Dies belegt den nativen Start, nicht die weiterhin ausstehende
vollständige native Sicht-/Klickabnahme.

Nach der Ember-Erweiterung initialisierte die echte Tauri-App erneut mit
separater Testkennung. Atlasmigrationen 1–5 und beide Energietabellen wurden
im Testcache nachgewiesen. Die bekannte Technicals-/EODHD-Intraday-Warnung
und später PDF-Schriftwarnungen aus dem Hintergrundworkflow erschienen;
keine neue Atlas-Warnung wurde beobachtet. Die ergänzende
CUA-Bildprüfung verwendete 15 echte native öffentliche Energiesnapshots,
auch im vollständigen originalen App-Rahmen. Bei 1.024 Pixeln und geöffneter
Sidebar passen Charts, Legende und Schalter innerhalb der Karte; die
optionale breite Tabelle scrollt in ihrem eigenen Container. Geprüft wurden
Solar/Strommix Afrika und Deutschland, Kapazität sowie Indien/China.
Fehlende regionale Nettoimporte werden größen- und gebietsbezogen benannt;
Themenwechsel aus langen Listen bringen eine zuvor oberhalb des Bildschirms
liegende neue Überschrift sichtbar in den Tastaturfokus.
Der native Start und diese Browserprüfung ersetzen keine vollständige native
Sicht-/Klickabnahme.

Nach der Statistik-Erweiterung initialisierte die echte Tauri-App erneut mit
separater Testkennung und Atlasmigrationen 1–5. Die bekannte Technicals-Warnung
erschien; eine neue Atlas-Warnung wurde nicht beobachtet. CUA prüfte die
Statistikansichten mit realen nativen Daten im originalen App-Rahmen bei
1.024 Pixeln: Deutschland/USA-Grundbildung und Gesundheitsausgaben,
Indien/China-Hochschulbildung, fehlende deutsche Alphabetisierung,
Chinas Trinkwasserperspektiven sowie Nigerias vereinzelte Gini-Erhebungen.
Diagramme, bewusste Zahlenwahl und Tabelle funktionierten ohne neue
Browserwarnungen oder -fehler. Die vollständige native Klickprüfung bleibt offen.

Die neue Länderübersicht wurde mit 330 echten nativen öffentlichen Antworten
für alle 66 Statistiken und Deutschland, USA, Indien, China und Nigeria in
derselben gekennzeichneten Browser-Prüfansicht geprüft. Bildung Indien/China
behält die tatsächlichen gemeinsamen Zeiträume und identischen Zahlenjahre.
Fehlende Alphabetisierung Deutschland/USA bleibt leer. Alle 66 Karten in 13
Gruppen, Feld-/Gruppen-/Zeitraumfilter, optionale Zahlen, Enter zum Einzelbild
und Rückkehr mit erhaltener Auswahl wurden geprüft. Bei 1024 Pixeln entstehen
zwei, bei 1440 Pixeln drei Spalten ohne horizontalen Seitenüberlauf. Die
Browserkonsole blieb ohne Warnungen und Fehler.
Die reale Tauri-App initialisierte nach den Statistik-Sammel-Commands erneut
unter separater Testkennung mit erfolgreichen Migrationen 1–5. Die bekannte
Technicals-/EODHD-Intraday-Warnung erschien; keine neue Atlas-Warnung wurde
beobachtet. Der Testprozess wurde gezielt beendet. Dies ist weiterhin keine
vollständige native Sicht-/Klickabnahme.

Die Quellenübersicht wurde anschließend mit denselben echten nativen öffentlichen
Prüfsnapshots visuell geprüft. Indien/Deutschland, globale Wasserstoffgeschichte,
UN-Afrika mit ausdrücklich gewähltem Ember-Strommix und der Jersey-Hinweis
funktionierten. Alle 24 Gruppen, konkrete Messgrößensuche, optionale Zahlen und
Aufklappen per Enter waren erreichbar. Bei 1024 und 1440 Pixeln entstand kein
zusätzlicher horizontaler Seitenüberlauf; die Browserkonsole blieb fehlerfrei.
Der Quellenabgleich wurde tatsächlich ausgeführt: aktuelles World-Bank-
Gebietsverzeichnis, vollständige native UN-/Maddison-Gebietsnachweise, komplette
Ember-CSV mit passendem SHA-256 und expliziter Fondskatalog. Keine nativen
Commands oder Datenbanken wurden in diesem Abschnitt verändert.

### Öffentliche Bewertungen

Der Bewertungsabschnitt wurde zusätzlich mit allen 112 öffentlichen XLS-Dateien
geprüft. 32.744 Quellenzellen, darunter 31.247 numerische Werte, stimmen zwischen
den unabhängigen Lesern xlrd und calamine überein. Alle 16 Pakete durchliefen
Übernahme, Rücklesen und Offline-Neustart in temporärem SQLite. Ein separater
echter Netzwerktest lud Länder-, US-/Global-Buchwert- und Indien-/China-Gewinndaten.
Die bekannte doppelte Simbabwe-Zeile wird ausdrücklich ausgelassen.
Native Tests sichern außerdem Methodenwechsel, Rangreferenz, Abbruch und Rollback.

Die Tauri-App initialisierte unter der separaten Kennung
`com.personal-macro.atlas-valuation-validation` mit Migrationen 1–6 und neuer
Bewertungstabelle. Eine bekannte Technicals-/Intraday-Warnung blieb bestehen;
keine neue Atlas-Initialisierungswarnung wurde beobachtet. CUA prüfte mit echten
nativen öffentlichen Snapshots unter anderem Indien/China und Deutschland/USA,
globale Energiehistorie, kurze Indien-Stände, Chinas älteren Gewinnstand,
fehlende Nordkorea-Daten, Quellenverweise und Themenwechsel. Details und
genaue Grenzen stehen in [VALUATION.md](VALUATION.md).

### Weltkarte und vollständige Länderliste

Die Karte ergänzt fünf Modell-/Bedienprüfungen einschließlich Landwechsel,
Vergleich und erhaltener Suche nach Wiederöffnung. Die gezielte Suite umfasst
danach 83 bestandene Tests in 15 Dateien. Typecheck, ESLint, Formatprüfung und
Produktionsbuild bestanden. Der neue Kartenabschnitt wird erst beim Öffnen
geladen (rund 169 kB, 65 kB komprimiert); der Atlas-Hauptabschnitt liegt bei
rund 154 kB. Die bekannten großen ECharts-/Dokumentexport-Chunks bleiben.
Diese Erweiterung verändert keine nativen Commands oder Datenbanken.

CUA prüfte mit der echten App-Shell die Deutschland-/USA-Auswahl, getrennte
Indien-/China-Flächen, Vatikanstadt über die Liste, Pfeilnavigation zu Indonesien
mit Enter sowie Quellenaggregate. Bei 1024 Pixeln stehen Karte und Liste
untereinander, bei 1440 nebeneinander, jeweils ohne horizontalen Seitenüberlauf.
Die gebündelte Kartengeometrie ist dieselbe wie im Desktop-Build; die vollständige
native Klickabnahme bleibt unabhängig davon offen.

## Verbleibende Umsetzung und Abnahme

Der aktuelle Notizabschnitt ergänzt die unter [NOTEBOOK.md](NOTEBOOK.md)
beschriebenen persönlichen Ansichten. Die gezielte Frontendsuite umfasst
96 bestandene Tests in 17 Dateien. Die vollständige Rust-Library-Suite bestand
mit 204 Tests; 14 ausdrücklich externe beziehungsweise manuelle Prüfungen bleiben
ignoriert. Native Notiz-/Backup-Tests, tatsächliche Tauri-Commands und Neustart
im eigenen Prüfprofil sowie die unabhängige Archivprüfung bestanden. Die
vollständige native Sichtabnahme des Weltatlas bleibt offen.

- WDI-Basis erweitern und die im Zuordnungsprotokoll benannten Lücken bearbeiten,
  insbesondere ein eigenes Kanalinseln-Sammelgebiet mit korrekter Behandlung
  früherer Cache-Stände. Eigene Regionalaggregate benötigen fachlich passende
  Nenner/Gewichte; neue Quellenfamilien brauchen eigene Crosswalk-Audits.
- Native Bedienpfade einschließlich tatsächlichem Datenladen, Diagramm,
  Tooltip, Offline-Neustart und Vergleich vollständig visuell abnehmen.
- Abbruch/Wiederaufnahme und HTTP-Fehler-/Revisionsfälle vertiefen; unabhängige
  Qualitätsmerkmale systematisch erweitern und die implementierte Quellenübersicht
  bei jeder neuen Datenfamilie fortführen.
- Weitere demografische Maße und Szenariovarianten ergänzen, sofern sie für
  die jeweilige Frage sinnvoll sind. Die WPP-Altersprofile und die mittlere
  Projektion sind implementiert; historische MPD-Wirtschaftsreihen sind inzwischen
  als eigener Bereich angebunden.
- Länder-/Sektorzuordnungen und die Marktabdeckung erweitern.
  Die NYU-Bewertungen sind inzwischen separat angebunden; längere Länderreihen
  und engere Länder-/Themenkombinationen weiter ausbauen.
- Zusätzliche IRENA-Daten jenseits der installierten Leistung sowie
  weitere UIS-/FAO-Reihen, engere ILO-Erhebungen, vertiefende WHO-/WIPO-Perspektiven und regionale Ergänzungen für die übrigen
  Themenfamilien prüfen und anbinden. Ein navigierbares Thema ist keine
  erledigte Datenanbindung.
- Weitere belegte historische Perspektiven über die nun angebundene JST-Finanzgeschichte hinaus. Die sechs
  quellengebundenen Theorieansichten sind implementiert; empirische Tests dieser
  Hypothesen an passenden langen Reihen bleiben eine gesonderte offene Arbeit.
- Persönliche Ansichten sind mit Favoriten, Notizen, festen Bildständen,
  Journal-Backup und Wiederaufnahme implementiert. Den vollständigen nativen
  Bedienfluss gemeinsam mit den übrigen Atlasansichten abschließend abnehmen.
- Vollständige Abnahme aller Anforderungen R01–R18. Aktuelle Basistests
  beweisen ausdrücklich nicht die vollständige Nutzeranforderung.

## Nächster Arbeitsabschnitt

Länderübersicht, Sammelabruf, Quellenabdeckung, sechs Theorieansichten und
NYU-Bewertungsbilder sowie Weltkarte/Länderliste sind implementiert und in den
genannten Pfaden geprüft.
Die lange Finanzgeschichte ist durch BIS-Kredit- und Immobilienbilder über
Jahrzehnte erweitert. OECD-Kaufpreisverhältnisse ergänzen jetzt veröffentlichte
Vergleiche mit Einkommen und Mieten sowie deren langfristiger Referenz.
Die kostenlose JST-R6-Datei war bei der erneuten Prüfung zugänglich und ist
inzwischen mit 20 Perspektiven für 18 Länder angebunden. Die vorherige
Zugriffslücke gilt nicht mehr für diesen fest geprüften Stand; Quellenjahre,
Einheiten, Lücken und Gebietsgrenzen bleiben ausdrücklich dokumentiert.
[Finanzgeschichte und Prüfungen](MACROHISTORY.md).

Historische IMF-Staatsfinanzen sind nun für 151 Länder/Gebiete angebunden;
auch Indien und China erhalten damit diese eigene historische Perspektive.
Weitere Länder-Sektoren, Daten zu Strukturwandel,
weitere Bewertungsgeschichten und die vollständige native Abnahme bleiben
Bestandteil des Plans. Persönliche Ansichten sind inzwischen implementiert.

## Zielprüfung nach diesem Arbeitsabschnitt

Der vorangegangene Abschnitt ergänzte **IRENA-Anlagen & Technologien**. 224 Länder-
und zehn Regionsprofile wurden über echte Tauri-Commands geladen; 76.355
numerische und 233.253 nicht numerische gespeicherte Zellen stimmen mit den
unabhängig gelesenen Originaldateien überein. Der gesamte Quellenabruf umfasst
312.312 Zellen einschließlich der zwei explizit ausgeschlossenen Regionalzeilen
in der Ländertabelle. Cachemigration 0007, nativer Start und Neustart sowie das
tatsächliche Afrika-Solar-Diagramm sind belegt. Details und Grenzen stehen in
[CAPACITY.md](CAPACITY.md) und im [nativen Nachweis](evidence/capacity-native-readiness.json).
Die Karte enthält weiterhin 177 Flächen; 112 weitere Kataloggebiete sind über
die Liste zugänglich. Vorhandene Anbieter behalten nach der ergänzten
Windows-TLS-Unterstützung für IRENA ausdrücklich Rustls.

Die vorige Erweiterung ergänzte **BIS-Kreditbilder** für 43 Länder und den
separaten Euroraum. Quote, veröffentlichter einseitiger HP-Trend und Welle
wurden aus dem echten kostenlosen Gesamt-Download übernommen. 24.488 numerische
Zellen und 3.520 leere Vorlauffelder stimmen mit der unabhängig gelesenen
Originaldatei überein. Cachemigration 0008 und reale Tauri-Commands sind belegt;
[Quelle und Grenzen](CREDIT.md), [nativer Nachweis](evidence/credit-native-readiness.json).
Die Anzeige vergleicht Gebiete mit gemeinsamer Zeitachse und Skala. Die
Mittellinie ist keine faire Bewertung, keine automatisch bestimmte Zyklusphase
und keine Zukunftsprognose. Die aktuelle Geschichte beginnt je Gebiet unterschiedlich;
USA-Quote ab 1947, Indien ab 1951, Deutschland ab 1960 und China ab 1985.

Die vorherige Erweiterung ergänzte **BIS-Immobilienbilder** für 57 Länder/
Wirtschaftsgebiete und vier ausdrücklich bezeichnete BIS-Aggregate. Der native
Gesamtabruf wurde unabhängig gegen alle 35.652 Quellwerte und 856 fehlenden
Zellen abgeglichen; alle Zahlen stimmen exakt überein. Atlasmigration 0009,
Tauri-Job und tatsächlicher Diagramm-PNG-Nachweis sind belegt. Reale/nominale
Preise und Vorjahresänderungen teilen beim Ländervergleich Kalender und Skala.
Historische Quellenwechsel bleiben sichtbar benannt; die CSV liefert keine
vollständigen datierten Bruchinformationen. Quellenkarte, Themenwege,
Finanzzykluslink und vier gemerkte Darstellungsparameter sind verbunden.
[Bedienung und Grenzen](PROPERTY.md), [unabhängiger Nachweis](evidence/property-native-readiness.json).

Die vorherige Erweiterung ergänzt **OECD-Wohnvergleiche** für 42 Länder und drei
eigene Quellenaggregate. Der kostenlose Abruf liefert Kaufpreise zu Einkommen
und Mieten als Indexverläufe und, soweit vorhanden, Prozent ihres jeweiligen
Langfristdurchschnitts. Die Hoch-/Tiefansicht verschiebt nur diese veröffentlichte
Referenz auf die Mittellinie. Sie erfindet keine faire Bewertung und keinen
fehlenden Referenzzeitraum. Historische Skalierungswechsel sind geprüft und
bleiben als getrennte Linienabschnitte sichtbar. Indien/China bleiben ohne
Profil, Südafrikas fehlender Miet-Langfristvergleich wird nicht berechnet.

Alle 23.535 numerischen Quellenwerte sowie 4.381 nicht gelieferte Einzelwerte
wurden unabhängig gegen die nativen Antworten geprüft; Zahlenabweichung null.
Atlasmigration 0010 erhält den bisherigen BIS-Cache. Der echte Tauri-Abruf,
alle 45 gespeicherten Profile und der Neustart mit unveränderter Herkunft
ohne neuen OECD-Download sind belegt. Die Quellenkarte, Themen- und BIS-Rückwege,
optionale Zahlen und drei gemerkte Darstellungsparameter sind verbunden.
[Bedienung und Grenzen](HOUSING-RATIOS.md),
[unabhängiger und nativer Nachweis](evidence/housing-ratios-native-readiness.json).

Eine vorherige Erweiterung ergänzt **UNESCO-Bildungsbilder**. Der echte Download
über Tauri übernimmt 103.593 Werte und 124.541 Quellenhinweise für 245 Profile.
Alle Werte und Hinweise stimmen mit dem unabhängig gelesenen öffentlichen ZIP
überein. 496 Indien-Werte samt Kennzeichen wurden zusätzlich über die versionierte
UIS-API geprüft. Fehlende Reihen bleiben sichtbar; Lernstandstests werden ohne
Testgleichheit nicht überlagert, Abschlussmodelle bleiben getrennt. Atlasmigration
0011 erhält bestehende Daten; ein gescheiterter Profilwechsel rollt vollständig
zurück. [Quelle und Grenzen](EDUCATION.md), [nativer Nachweis](evidence/education-native-readiness.json).

Die anschließende Erweiterung ergänzt **lange Branchen-Gewinnbewertungen**.
Alle 195 angebundenen Originaltabellen wurden mit dem nativen Parser gegen die
unabhängige xlrd-Referenz geprüft (71.741 Zellen). Die fünf erweiterten
Gewinnpakete enthalten 41.877 Zellen; Werte, Verfügbarkeitszustände, Firmenzahlen
und Quellenidentitäten stimmen überein. Alle fünf Pakete wurden über echte
Tauri-Jobs heruntergeladen. Ein echter Prozessneustart liest dieselbe Provenienz
und dieselben Abrufzeitpunkte ohne neuen Download. Die Browser-Sichtprüfung
verwendet diese nativen öffentlichen Daten: sechs Branchenkarten, Einzelbild,
Vergleich, optionale Zahlen und getrennte Archivdefinitionen bei 1024/1440 px.
[Erweiterter Nachweis](evidence/valuation-earnings-readiness.json).

Die jüngste Erweiterung ergänzt **FAOSTAT-Agrarbilder**. Der vollständige
öffentliche Download liefert 196 Erzeugnisse und Gruppen für 234 Profile.
Alle 1.995.192 Werte und 426 echten Nullwerte stimmen sowohl im wieder
geöffneten Testcache als auch im echten Tauri-Cache mit der unabhängig
gelesenen Originaldatei überein. Atlasmigration 0012 erhält UIS-Daten;
Rollback, Definitionen, Herkunft, Zeitlücken und die globale Abrufsperre
sind geprüft. Suche, sechs Karten pro Seite, Einzelbild, Produktionsbasis,
Ländervergleich und optionale Zahlen wurden mit den nativen öffentlichen
Snapshots bedient. Ein echter Prozessneustart liest alle 234 Profile mit
identischer Prüfsumme, Quelle und Abrufzeit ohne neuen FAO-Download.
Die FAO-Quellenkarte und 35 eigene Quellengebiete sind
integriert. [Quelle und Grenzen](AGRICULTURE.md),
[vollständiger nativer Nachweis](evidence/agriculture-native-readiness.json).

Beim allerersten Start des Gewinnhistorien-Prüfprofils trat während des
Speicherns der letzten Ansicht `SQLITE_BUSY` auf. Im ersten Start des separaten
FAO-Prüfprofils wurde derselbe Fehler erneut beobachtet. Beim folgenden
FAO-Neustart gelang der Schreibvorgang nach etwa 1,35 Sekunden, mit einer
Warnung für eine langsame Abfrage. Die COT-Zeilenschreibphase im ursprünglichen
FAO-Profil erstreckte sich über mehr als elf Sekunden innerhalb einer
Transaktion und überschritt damit die fünf Sekunden lange SQLite-Wartezeit.
Die neu ergänzte Präferenzbehandlung fängt solche vorübergehenden Sperren
begrenzt ab und bewahrt die neueste Auswahl. Drei absichtlich erzeugte
neunsekündige Sperren sind mit dem produktiven Hook und echten Tauri-Commands
erfolgreich geprüft; der anschließende Prozessneustart stellt dieselbe Auswahl
wieder her. Lang laufende Hintergrundtransaktionen selbst bleiben unverändert,
ebenso der sichtbare Fehler nach dauerhaft erfolglosen Versuchen.
[Nativer Nachweis](evidence/preferences-recovery-readiness.json).
Die NYU- und FAO-Datenübernahmen waren erfolgreich.
Es wurde keine persönliche Produktionsdatenbank untersucht oder verändert.

Die acht zusätzlichen Beschäftigungs- und Industrieanteile wurden unter einem
echten Tauri-Sammeljob global geladen. Der unabhängige Python-Abgleich bestätigt
47.292 exakte numerische Werte, 66.633 fehlende Werte und alle 113.925 Kennzeichen
sowie Quellenprüfsummen im isolierten Cache. Nach einem echten Prozessneustart
bleiben 72 ausgewählte Antworten einschließlich Herkunft unverändert, ohne
neuen Downloadjob. Modellfenster und Cache-Lesebegrenzung besitzen eigene Tests;
Industrien behalten ihren ausdrücklich engeren Nenner. Die ergänzende
Sichtprüfung behandelt Vergleiche, leere Weltwerte und Quellenbedeutung bei
1024/1440 Pixeln. [Nativer Nachweis](evidence/sector-structure-readiness.json).

Die aktuelle Atlas-Frontend-Suite besteht mit **151 Tests in 23 Dateien**.
Die gesamte Rust-Library-Suite besteht mit **229 Tests**; 20 ausdrücklich
externe/manuelle Prüfungen sind im Standardlauf ausgenommen. Der neue reale
OECD-HTTP-Test wurde zusätzlich ausdrücklich ausgeführt und bestanden.
Clippy für alle Targets mit `-D warnings` besteht. Die Sichtprüfung nutzt
öffentliche native Snapshots bei 1024 und 1440
Pixeln Fensterbreite. Sie ersetzt keine vollständige native Klickabnahme.
Die Kredit- und Immobilien-Cache-Neustartprüfungen sind bestanden. Die neue
Immobilienprüfung liest nach einem echten Prozessneustart denselben gespeicherten
Quellenstand ohne erneuten BIS-Download; auch das feste Diagrammbild benennt
die inflationsbereinigte Preisbasis. Typecheck, Produktionsbuild, gezielte
ESLint-/Prettier-Prüfungen und Rustfmt bestehen. Der vollständige
App-Hintergrundlauf zeigt weiterhin die bereits dokumentierten Technicals-/
Synchronisierungswarnungen. Im längeren OECD-Prüflauf trat außerdem außerhalb
der Atlas-Pipeline eine Panic von `pdf-extract` mit `Parse(InvalidContentStream)`
auf. Dieser bekannte Hintergrundfehler trat auch im ersten isolierten
Prüfprozess der acht WDI-Strukturreihen auf. Die Atlas-Übernahmen und die
jeweiligen Neustartprüfungen waren erfolgreich; ein
vollständig fehlerfreier App-Hintergrundlauf wird damit nicht behauptet.
Die Atlas-Pipelines melden keine neuen Initialisierungsfehler.

Der JST-Abschnitt ist mit **159 Atlas-Frontendtests in 24 Dateien**, 232
bestandenen Rust-Library-Tests (21 explizite/gesonderte Tests ignoriert),
Clippy, Rustfmt, Typecheck, Produktionsbuild sowie gezieltem ESLint/Prettier
geprüft. Nach der letzten Text-/Layoutpräzisierung bestanden zusätzlich alle
22 betroffenen Frontendprüfungen und der Produktionsbuild erneut.
Der echte Tauri-Download liest alle 18 Länderprofile; Indien, China und Welt
bleiben ausdrücklich ohne eigenes Profil. Nach dem Prozessneustart sind alle
21 gespeicherten Command-Antworten, die Notiz und ihr PNG unverändert; es wurde
kein neuer Quellenabruf gestartet. Alle 166.218 Zahlen des tatsächlichen
Caches sind unabhängig gegen die Originaldatei geprüft. Die Browser-Sichtprüfung
mit diesen öffentlichen Snapshots bestätigt Kredit-/Renditebilder, Tastatur,
Nominal-/Realwechsel, optionale Zahlen, fehlende Ländervergleiche und Quellenkarte
ohne horizontalen Überlauf bei 1024/1440 px. Die Browserkonsole meldete keine
Warnungen/Fehler; die bekannten nativen EODHD-/Zentralbank-Hintergrundwarnungen
bleiben getrennt dokumentiert. [Prüfbericht](evidence/macrohistory-native-readiness.json).

Der IMF-Abschnitt ergänzt **acht Perspektiven für 151 Länder/Gebiete**. Alle
68.406 numerischen Werte, 202.362 fehlenden Zellen und 67.692 staatlichen
Abgrenzungskennzeichen des echten nativen Caches stimmen mit der unabhängig
gelesenen Originaldatei überein. Die 153 Tauri-Antworten einschließlich zweier
nicht unterstützter Aggregate, die Notiz und ihr PNG sind nach echtem
Prozessneustart exakt erhalten; kein erneuter IMF-Abruf war nötig.
Die Standardtests bestehen mit **167 Atlas-Frontendtests in 25 Dateien** und
234 Rust-Library-Tests; 22 explizite/externe Tests sind im Standardlauf
ignoriert. Der neue echte IMF-HTTP-Test wurde zusätzlich ausgeführt und
bestanden. Die UI-Prüfung nutzt diese öffentlichen nativen Snapshots im Browser
und bestätigt Länder-/Gruppenwechsel, Zahlenwahl, Tastatur, historische
Abgrenzungen und fehlende Aggregate bei 1024/1440 px ohne zusätzlichen
horizontalen Überlauf. Der Windows-Helfer konnte die native Bedienstruktur
lesen, aber wegen Aufnahme-/Geometriefehlern keine native Klickprüfung
ausführen. Diese Grenze bleibt offen; sie ersetzt die erfolgreichen nativen
Speicher-/Neustartnachweise nicht. Die bekannten EODHD-/Zentralbankwarnungen
und die `pdf-extract`-Panic außerhalb des Atlas traten erneut auf.
[Vollständiger IMF-Nachweis](FISCAL.md).

Die anschließende Erweiterung verbindet die vorhandenen NYU-Daten mit
**44 direkten Themeneinstiegen** statt bisher elf. 90 verschiedene Branchen
liegen hinter 164 ausdrücklich geprüften Verknüpfungen. Chemie, Maschinenbau,
Stahl, Versicherungen, Software, Halbleiter, Einzelhandel und die breiten
Sektorthemen erhalten begrenzte Bilderauswahlen. Es entstehen keine zusätzlichen
numerischen Daten, Sektormittelwerte oder kostenpflichtigen Anbindungen.
Alle Namen wurden gegen die unabhängig gelesenen Originaltabellen der 15
Branchenpakete abgeglichen. Quellenregionen, Einzelstände und tatsächliche
Branchengrenzen bleiben sichtbar. Thema, Suche, Rückwege und gespeicherte
Ansichten verwenden einen ausdrücklichen Themenfilter.

**172 Atlas-Frontendtests in 25 Dateien**, die fünf relevanten nativen Notiztests,
Clippy, Typecheck, ESLint und Build bestehen. Die Browserprüfung bestätigt
Chemie und Banken, Suchgrenzen, Detail-/Quellenwechsel, die beschriftete globale
Alternative für Deutschland und 1024-/1440-px-Layouts. Im isolierten Profil
`com.personal-macro.atlas-sector-links-20260909` wurden Notiz, Quellen, Filter
und festes PNG nach echtem Prozessneustart identisch gelesen. Ein erster
automatischer Schreibversuch unmittelbar nach dem frischen Start traf auf eine
vorübergehende SQLite-Sperre anderer Startjobs; nach deren Abschluss bestanden
Speicherung und Neustart. Die native Klickabnahme bleibt getrennt offen.
[Themenzuordnung und Nachweise](VALUATION.md).

Die zehn neuen Einstiege zu **Langen Entwicklungen** verbinden 22 präzise
Datenperspektiven. **180 Atlas-Frontendtests in 27 Dateien** bestehen; die
native Notizprüfung erhält alle 32 Einstiegs-/Zielkontexte nach Prozessneustart.
Eine unabhängige SQLite-Leseprüfung bestätigt die Identität. Die Browserprüfung
deckt 1024/1440 px, Tastatur, Deutschland/USA und den Indien/China-Zinsweg ab.
Geld-/Währungssysteme und weitere historische Rekonstruktionen bleiben offen.
[Kontext-Einstiege und Grenzen](CONTEXT-GUIDES.md).

Die Migrations-Erweiterung ergänzt drei Reihen ohne neue Anbieterfamilie. **184 Atlas-Frontendtests in 28 Dateien** bestehen. Alle 17.336 Zahlen des nativen Caches stimmen exakt mit den vollständigen Originalseiten überein; 24.762 fehlende Jahreswerte bleiben fehlend. Nach echtem Prozessneustart sind 27 Antworten ohne erneuten Download und das feste PNG bytegleich. WPP-Salden enden historisch 2023; Bestand und Anteil verwenden acht Quellenjahre bis 2024. Die vier deterministischen WDI-Tests, der native Katalogtest, Typecheck, ESLint, Clippy und Build werden im zugehörigen Prüfbericht festgehalten. [Migration und Grenzen](MIGRATION.md).

Die Haushalts-Erweiterung ergänzt 39 Perspektiven und Atlasmigration 0015.
**193 Atlas-Frontendtests in 30 Dateien** sowie drei neue Rust-Prüfungen
einschließlich echtem UN-Download bestehen. Ein unabhängiger Decimal-Abgleich
bestätigt alle 36.142 Zahlen, 7.889 Fehlwerte und Originalquellen; ein echter
Tauri-Prozessneustart erhält 202 Antworten, Notiz und ursprüngliches PNG ohne
weiteren Download. Die Browserprüfung deckt schnelle Länderwechsel,
Quellensuche, fehlende und ungewichtete Erhebungen sowie 1024/1440 px ab.
TypeScript, gezieltes ESLint, Clippy und Build bestehen. Bekannte fremde
Hintergrundmeldungen bleiben dokumentiert; native Klickabnahme bleibt offen.
[Haushaltsbilder und Nachweise](HOUSEHOLDS.md).

Die BIS-Schulden-Erweiterung bindet Haushalte und nichtfinanzielle Unternehmen
getrennt an: Schuldenquote und Veränderung zum Vorjahresquartal für 48 Profile.
Vier neue Aggregate erhalten eigene Namen; der Gesamtkatalog umfasst 353 Gebiete.
Alle 14.118 Zahlen sind unabhängig mit Originaldatei und echtem nativen Cache
abgeglichen. Drei Rust-Prüfungen einschließlich Live-Download, 202 Atlas-
Frontendtests in 31 Dateien, Typecheck, ESLint, Clippy und Build bestehen.
50 native Antworten, Notiz und Originalbild bleiben nach Prozessneustart ohne
Download unverändert. Nach Korrektur der gestrichelten Vergleichslinie wurden
55 relevante Frontendtests und Build erneut bestanden. Browserprüfung bei
1024/1440 px: DE/USA, Indien/China, getrennte Themen, optionale Zahlen,
Afrika/Südafrika und benannte BIS-Gruppe. Die erste Notizprüfung scheiterte
an einer kurzen SQLite-Startsperre; nach Startabschluss gelang sie. Bestehende
fremde Startmeldungen und offene native Klickabnahme sind im
[BIS-Prüfbericht](evidence/debt-readiness.json) dokumentiert.
[Bedeutung und Bedienung](DEBT.md).

Der regionale Branchenvergleich ergänzt die bestehenden NYU-Quellen ohne neue
Datenanbindung: gleiche Branche, gleiche Kennzahl, gemeinsame sinnvolle Jahre
und eindeutige regionale Herkunft. 41.710 Kombinationen aus den geprüften
Originalständen sind klassifiziert; unpassende Jahre oder Definitionen werden
nicht überlagert. Die native Notiz und ihr PNG erhalten beide Quellenpakete
nach einem echten Prozessneustart. Ein zusätzlich geprüfter schneller Wechsel
von Region und Bewertungsgrundlage verliert keine Auswahl.
[Nachweis und Grenzen](evidence/valuation-regions-readiness.json).

Sieben weitere Themeneinstiege sind über vorhandene Quellen erschlossen: drei
Bewertungswege für Versorger und die gemeinsame Luftfahrt-/Verteidigungsbranche
sowie vier Kontextseiten für Produktivität, Ungleichheit, digitale Verbreitung
und das historische Finanzumfeld. Neue Quellen oder Kennzahlen entstehen dadurch
nicht; die Abgrenzung steht bereits am Einstieg. [Details und aktuelle Prüfungen](TOPIC-LINKS.md).

Die Quellen-Erweiterung schließt 55 allgemeine Themenplatzhalter mit eigenen
Befunden aus 38 benannten Primärquellen. 69 Kontext-/Quellen-Einstiege besitzen
insgesamt 50 ergänzende Verknüpfungen; 37 neue Einstiege haben bewusst kein
Ersatzbild. Der unabhängige Routentest untersucht alle 255 Katalogthemen über
354 Gebiete, ohne recherchierte Themen als Messreihen aufzuwerten. 261 Tests in
37 Dateien, Typecheck, gezieltes ESLint und Build bestehen. Die Browserprüfung
bestätigt 1024/1440 Pixel, Tastaturbedienung, Deutschland/USA, Indien/China und
den Robotik-Einstieg aus **Daten & Quellen**. Native Datenpfade wurden in dieser
Erweiterung nicht verändert. [Umfang und Nachweise](TOPIC-RESEARCH.md).

Die folgende Matrix hält den Zwischenstand vor der verbundenen nativen
Bedienprüfung fest. Sie wird durch die aktuelle R01–R18-Matrix in
[COMPLETION-AUDIT.md](COMPLETION-AUDIT.md) ersetzt; die Einzelbelege bleiben
als Entstehungsnachweis erhalten.

| Anforderung | Aktueller Nachweis und verbleibende Grenze |
| --- | --- |
| R01 Weltregionen | Alle 365 Kataloggebiete per Liste erreichbar, davon 177 mit eigener Kartenfläche; datierte Daten- und Karten-Crosswalks einschließlich IRENA, BIS, OECD, UIS und FAO mit offenen Fällen vorhanden. Neue Quellen brauchen eigene Zuordnungsprüfungen. |
| R02 DE/USA/Indien/China | Gleiche native Datenpfade und echte Quellenstichproben vorhanden; vollständige native Bedienabnahme aller vier Länder offen. |
| R03 Themenbreite | Alle 255 Themen in 24 Gruppen besitzen eine konkrete Route: 183 numerische Perspektivzuordnungen, 14 bisherige Kontext-Einstiege, 52 recherchierte Quellen-Einstiege und sechs Theorieansichten. Der Routentest berücksichtigt alle 365 Kataloggebiete. Quellenbefunde ersetzen keine Werte; alle 52 bleiben numerisch nicht angebunden. Bestehende Quellen umfassen unter anderem 91 WDI-Reihen, 94 Bewertungsbranchen, 40 UIS-, 196 FAO-, 20 JST-, acht IMF-, 39 UN-Haushalts-, 38 WHO-, 36 WIPO-, 14 ILO-, 85 Rohstoff- und 42 Findex-Perspektiven. Vollständige Länder-/Sektordaten werden dadurch nicht behauptet. |
| R04 Navigationswege | Vergleiche und Rückwege, Modell-/Themenlinks, Karte/Liste sowie gemerkte Ansichten und letzte Auswahl implementiert. 47 direkte Branchen-Themeneinstiege sowie insgesamt 66 Kontext-/Quellen-Einstiege mit 50 Verknüpfungen zu vorhandenen Bildern. Die bisherigen 46 Navigationskontexte bleiben nach isoliertem Tauri-Neustart unverändert; dieser Nachweis wird nicht auf die 55 neuen Einstiege ausgedehnt. Neue Browser- und Navigationstests erhalten Deutschland/USA, Indien/China und präzise Messgrößen beim Quellen-/Kontextwechsel. |
| R05 Bilder zuerst | Kernansichten und neue Modelle ohne erforderliche Zahlentabellen bedienbar; weitere native Sichtprüfung bleibt nötig. |
| R06 Marktwellen | Native kausale Berechnung, Referenz-/Lückentests und echte Snapshots vorhanden; vollständige native Diagrammabnahme offen. |
| R07 Bewertung | Eigene NYU-Jahresbewertungen für Länder und 94 Branchen; Gewinn- und Buchwertgeschichten für die USA ab 1999 sowie vier Quellenregionen ab 2012, mit getrennten Definitionen und nativer Prüfung. Dieselbe Quellenbranche ist jetzt zwischen expliziten Regionen vergleichbar, sofern gemeinsame sinnvolle Veröffentlichungsjahre vorliegen. Lange vergleichbare Länderreferenzen und engere Länder-/Sektorkombinationen bleiben offen. |
| R08 Demografie | WPP-Altersprofile, drei Migrationsperspektiven und 39 Haushaltsmaße in sieben Gruppen mit echter Abdeckungs-/Nennerprüfung und Ländervergleich vorhanden. Migration trennt jährliche Salden bis 2023 von acht Bestands-/Anteilsjahren bis 2024. 200 Haushaltsprofile erhalten einzelne Quellenjahre, überlappende Gruppen und acht ungewichtete Erhebungen. Weitere sinnvolle demografische Maße bleiben im Ausbau. |
| R09 Bildung/Energie | WDI-Bildungsdefinitionen, Ember-Länderstrom, NYU-Bildungsunternehmen für Indien und IRENA-Anlagenleistung für 234 Profile geprüft. 40 UIS-Perspektiven für 245 Profile mit vollständigem Quellenabgleich ergänzt; weitere Bildungstiefe, Energiewirtschaft jenseits der installierten Leistung und eine eigene Afrika-Solarbewertung bleiben offen. |
| R10 Sektoren | Geprüfte Börsen-Stellvertreter, Strom-/Gesundheitsdaten, 94 Bewertungsbranchen, 196 FAO-Agrarerzeugnisse/-gruppen sowie drei Beschäftigungs- und fünf UNIDO-Industrieanteile vorhanden. Strukturanteile und FAO-Produktion sind keine finanzielle Bewertung. WHO GHED ergänzt 38 Ausgabenperspektiven zu Finanzierung, Versorgung, Pflege und Investitionen für 195 Länder; Jahrespunkte, Schätzungen und vorläufige Werte bleiben getrennt. Der aktuelle direkte ILOSTAT-Zugang ergänzt 14 Beschäftigungsbereiche für 188 Länder/Gebiete, Welt und eigene ILO-Afrika-Region. Anteile, Modellstatus und Sammelbereiche bleiben ausdrücklich benannt; engere Länder-/Sektortiefe weiter ausbauen. |
| R11 Jahrhunderte/Thesen | MPD-Langreihen, BIS-Kredit- und Immobilienbilder über Jahrzehnte (Italien nominal seit 1927), 20 JST-Finanzperspektiven für 18 Länder von 1870–2020, acht IMF-Perspektiven für 151 Länder/Gebiete bis 2024 und sechs quellengebundene Theorieansichten vorhanden. Früheste IMF-Werte je Reihe bis 1800, Indiens Staatsausgaben ab 1861, Chinas ab 1982. Gebiets- und Definitionswechsel bleiben sichtbar. Eine statistische Prüfung von Zyklusthesen wäre eine gesonderte Analyse; diese Ansicht behauptet keine gemessene Zyklusperiode. |
| R12 Szenarien | WPP-Projektionen ab 2024 getrennt; Theoriezeichnungen sind keine Szenarioprognosen. Zusätzliche sinnvolle Varianten offen. |
| R13 Kosten | Kostenlose Grundquellen und NYU-Jahrestabellen sowie bestehendes EODHD; keine zusätzliche Bezahlabhängigkeit. |
| R14 Ruhe | Geschlossene Modelle, vier bewusst wählbare Schritte, keine Animation; Tastatur/Fokus und 1024-/1440-px-Layout geprüft. |
| R15 Local-first | Separater öffentlicher Cache bis Atlasmigration 0021; persönliche Notizen, Favoriten und begrenzte Diagramm-PNGs in Hauptmigration 0047 im Journal-Backup. Keine Übertragung an Anbieter. Vorübergehendes SQLite BUSY bei der letzten Auswahl wird begrenzt überbrückt; neueste Auswahl, schnelle Wiederkehr und Prozessneustart sind mit echten Schreibsperren geprüft. Dauerhafte Sperren und andere Fehler bleiben sichtbar. |
| R16 Verfügbarkeit | Fehlwert-/Lückentests einschließlich nicht positiver Bewertungen, getrennten Mittelwerten/Medianen und Quellenregionen; Modelle gelten weiterhin nicht als numerische Zyklusreihe. |
| R17 Regression | Aktuell 268 Atlas-Frontendtests in 38 Dateien bestanden, einschließlich Regionsvergleich und schneller Auswahlwechsel; zuvor 234 Rust-Library-Tests und weitere gezielte native Prüfungen für spätere Erweiterungen. Darunter Migration-, Notiz-, Backup-/Restore-, IRENA-, BIS-, OECD-, UIS-, FAO-, JST-, IMF-, Haushalts-, Präferenz-Sperr- und Modellfenstertests. Echte Tauri-Commands und Neustarts mit Quellenabgleich für die dokumentierten Datenpakete, zuletzt 48 BIS-Schuldenprofile mit 14.118 exakt abgeglichenen Zahlen, 50 Antworten und unverändertem Notizbild. Die erste Notizprüfung traf eine kurzzeitige Startsperre; nach Startabschluss und weiterem Prozessneustart bestanden Speichern und Wiederöffnung. Ein neuer Regressionstest sichert schnelle Länderwechsel mit verzögerten Vergleichsdaten und konkreten Erhebungen im Merkkontext. Der zusätzliche Regionsvergleich wurde gegen 41.710 Kombinationen vorhandener NYU-Snapshots geprüft; beide Quellenpakete, Notiz und PNG bleiben nach isoliertem Tauri-Prozessneustart unverändert. Drei neue WHO-Rustprüfungen und der echte Download bestehen. 81.762 Cachewerte, 93.494 Fehlwerte und 32.667 Methodenzeilen sind unabhängig gegen die Originaldateien geprüft; alle 197 Antworten und das Notizbild bleiben nach Prozessneustart unverändert. Typecheck, ESLint, Clippy und Build bestehen. Vier WIPO-Rustprüfungen einschließlich Originaldateitest bestehen; echter Download, 201 Antworten, alle 108.696 Integer und 213.684 Fehlwerte sowie Notiz und PNG sind nach Prozessneustart exakt geprüft. Sichtprüfung bei 1024/1440 Pixeln, WDI-/WHO-Rückkehr und präziser Quellen-Detaileinstieg bestehen. ILO-Originaldateitest, drei gezielte Rustprüfungen insgesamt und der kostenlose echte Download bestehen. 96.765 Integer, 135 Fehlwerte sowie Flags sind exakt geprüft; 192 Antworten, Notiz und Bild bleiben nach Prozessneustart unverändert. Sichtprüfung bei 1280/1024 Pixeln umfasst DE/USA, Indien/China, Afrika/Welt, Quellenwechsel und genaue Suchtreffer. Findex ergänzt drei bestandene Rustprüfungen, 174 exakt erhaltene Länder-/Aggregatprofile, 59.471 Quellzahlen und 98.701 Fehlwerte. Nach echtem Prozesswechsel bleiben Notiz, Originalbild, Bevölkerungswahl und beide Quellenhashes unverändert; kein neuer Download. Vollständige native Klickregression bleibt offen. |
| R18 Gesamtumfang | Noch nicht erfüllt: Der gemeinsame Abschlussabgleich aller Anforderungen und die vollständige native Bedienabnahme sind offen. Zusätzliche Datenfamilien und engere Bewertungsabdeckung bleiben dokumentierte Ausbaukandidaten; neue Kandidaten allein erweitern den verbindlichen Abschlussumfang nicht automatisch. |

Der vollständige Auftrag bleibt aktiv.
