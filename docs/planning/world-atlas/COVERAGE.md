# Daten- und Gebietsabdeckung

**Daten & Quellen** ist eine eigene Atlasansicht (`view=coverage`). Sie verbindet
den aktuellen lokalen Datenstand mit den geprüften Gebietszuordnungen der
22 implementierten Quellenfamilien. Das Öffnen, Suchen oder Filtern liest
ausschließlich bestehende Atlas-Commands. Es gibt keinen automatischen
Providerdownload oder neue kostenpflichtige Anbindung. Die Übersicht verwendet
die jeweiligen lokalen Quellencaches.

## Was die Ansicht aussagt

Vierzehn Themen besitzen [geordnete Einstiege](CONTEXT-GUIDES.md)
in vorhandene Datenperspektiven. Weitere 40 Themen besitzen
[eigene Quellenbefunde](TOPIC-RESEARCH.md), davon 14 mit insgesamt 17 ergänzenden
Verknüpfungen. Die Übersicht erklärt diese Einstiege und ihre konkreten Grenzen,
zählt sie aber nicht als zusätzliche Messreihen oder lokale Datenbilder.
Die ursprünglich 40 offenen Quellen-Themen besitzen inzwischen Datenanbindungen;
[Abnahme](REMAINING-40.md) und [weltweite Erweiterung](GAP-EXPANSION.md)
dokumentieren den aktuellen Stand. Einzelne Länder und Messgrößen können weiterhin
fehlen. Ein Quellenlink allein wird nie als erfolgreiche Datenanbindung gezählt.

22 Quellenkarten führen zu Länderstatistiken, UN-Alters- und Haushaltsbildern,
Ember-Stromwirtschaft, Maddison-Jahrhundertperspektiven, Börsenwellen und
veröffentlichten NYU-Bewertungen sowie IRENA-Anlagenleistung, BIS-Kredit- und
Immobilienbildern, OECD-Wohnvergleichen, UNESCO-Bildungs-, FAOSTAT-Agrar- und
JST-Finanzbildern sowie historischen IMF-Staatsfinanzen, WHO-Gesundheitsausgaben,
WIPO-Technologiefeldern, ILO-Beschäftigungsbildern, internationalen Weltbank-Rohstoffpreisen
und Global-Findex-Befragungen zur finanziellen Teilhabe sowie den geprüften
Sektorbildern aus der UN Global SDG Database.
Die geordneten Themenbereiche darunter decken den vollständigen Katalog ab.
Ein Thema mit mindestens einer lokalen Perspektive wird als Bild verfügbar
gekennzeichnet. Fehlende weitere Perspektiven behalten ihren eigenen Status.

Die Balken zeigen ausschließlich **Datenabdeckung**: Blau bezeichnet lokale
Bilder, Schraffur noch zu prüfende/ladende Daten, Amber eine Einschränkung und
eine leere Umrandung fehlende Implementierung. Text und unterschiedliche Symbole
ergänzen die Farbe. Das sind keine wirtschaftlichen Bewertungen oder
Kauf-/Verkaufssignale. Zahlen sind zunächst verborgen; bei Bedarf lassen sich
Themenzahlen und nutzbare Jahre bewusst einschalten.

Verfügbarkeit wird anhand tatsächlicher Werte geprüft:

- UN-SDG: 33 ausdrücklich abgegrenzte Perspektiven verwenden 249 M49-Zuordnungen
  einschließlich Welt. Für jede Messgröße zählen nur tatsächlich vorhandene
  endliche Werte; Quellenmarker wie `NaN` ergeben kein lokales Zahlenbild.
  Eigene Regionen anderer Anbieter werden nicht ersetzt. Nationale Armutsgrenzen
  bilden keine länderübergreifend vergleichbare Skala. [Quelle und Grenzen](SDG.md).

- Findex: 42 Messgrößen prüfen jeweils die veröffentlichten Werte aller
  Erwachsenen ab 15 Jahren. Eine vorhandene Untergruppe ersetzt keine fehlende
  Gesamtgruppe. 174 eigene Quellenprofile einschließlich zwölf ausdrücklich
  benannter Aggregate sind zugeordnet. Suchtreffer öffnen Gruppe, Messgröße
  und Gesamtpopulation präzise; einzelne Erhebungsjahre zählen als Punkte,
  nicht als vollständige Jahreskurve. [Quelle und Grenzen](FINANCIAL-INCLUSION.md).

- Rohstoffpreise: 85 internationale Reihen mit eigener positiver Referenz von 2010.
  Die Weltansicht führt diese Referenzpreise; Länder erhalten ausdrücklich den
  Hinweis auf ein anderes Quellengebiet. Dreizehn Themen haben passende
  Teilansichten. [Quelle und Grenzen](COMMODITIES.md).

- BIS-Schulden: Haushalts- und Unternehmensquote sowie ihre Vorjahresänderung
  besitzen vier getrennte Einträge. 48 Profile und vier eigene zusätzliche
  BIS-Aggregate sind überprüft; Welt und Afrika werden nicht dafür eingesetzt.
  [Quellenabgleich](evidence/debt-source-audit.json).
- UN-Haushalte: jede der 39 Perspektiven wird anhand ihrer tatsächlichen
  Erhebungswerte geprüft. 200 Länder/Gebiete besitzen eigene Profile, Welt
  und Kontinente keine Mittelwerte. Mehrere Quellen desselben Jahres bleiben
  einzelne Beobachtungen; die Abdeckung zählt das Jahr nur einmal. Suchtreffer
  öffnen die passende Gruppe und das genaue Maß. [Quelle und Grenzen](HOUSEHOLDS.md).
- IMF: alle acht Messgrößen werden einzeln geprüft. 151 Länder/Gebiete besitzen
  eigene Profile, darunter Deutschland, USA, Indien und China. Kalenderzeilen
  ohne Werte zählen nicht als Beobachtungen. Die Datei endet spätestens 2024
  und enthält keine Welt-/Kontinentaggregate. Im großen Vergleich bleiben
  Zentralregierung und Gesamtstaat sowie ihre zeitlichen Wechsel getrennt.
- WDI: numerische Jahreswerte, einschließlich echter Null und negativer Werte.
  Fehlende Alphabetisierung bleibt beispielsweise leer.
- JST: jede der 20 historischen Messgrößen wird getrennt geprüft. Eine
  Nominalrendite ersetzt keine fehlende Realrendite. Nur 18 ausdrücklich
  katalogisierte Länder besitzen Profile; es gibt kein Weltaggregat und keine
  Indien-/China-Reihe. Die Quellenjahre enden 2020.
- UN: vollständige Altersstruktur beziehungsweise gültige Nenner für das
  jeweilige Bild; eine fehlende Geschlechterverteilung ergibt keine Pyramide.
  Schätzungsende und Beginn der mittleren Projektion werden genannt.
- Maddison: tatsächliche Werte des jeweiligen historischen Maßes und die
  gemeinsame Darstellungslogik. Vorhandenes Pro-Kopf-BIP ersetzt kein fehlendes
  Gesamt-BIP oder keinen fehlenden Weltnenner.
- Ember: die Startansicht der konkreten Stromgröße. Ein vollständiger Strommix
  benötigt alle Komponenten; installierte Leistung ersetzt keinen fehlenden
  Erzeugungsanteil. Weitere Messgrößen sind im großen Strombild wählbar.
- IRENA: eigene Technologie und Netzart; fehlende Photovoltaikwerte werden nicht durch Solar-Gesamtwerte ersetzt.
- BIS: tatsächlich verfügbare Quartale der Kreditquote oder Welle. Der Euroraum bleibt ein eigenes Aggregat; eine vorhandene Quote ersetzt keinen fehlenden Trendabstand.
- BIS-Immobilien: reale und nominale Preise sowie Vorjahresänderungen werden einzeln geprüft. Eine nominale Vorgeschichte ersetzt keine fehlende reale Reihe. Drei eigene BIS-Immobiliengruppen und der Euroraum bleiben von anderen Quellenregionen getrennt.
- OECD-Wohnvergleiche: Einkommen und Mieten werden getrennt geprüft, ebenso
  Indexverlauf und veröffentlichter Langfristvergleich. Ein vorhandener Index
  macht ein fehlendes Hoch-/Tiefbild nicht verfügbar. Die Quellenkarte erhält
  das gewählte Land; drei eigene OECD-Gruppen ersetzen keine Weltregionen.
- UNESCO-Bildung: Erhebungen und Abschlussmodelle bleiben eigene Perspektiven.
  Quellenkennzeichen und tatsächliche Werte entscheiden über die Verfügbarkeit;
  ein fehlender Lernstandstest wird nicht durch eine andere Erhebung ersetzt.
- FAO-Agrarbilder: jedes der 196 Erzeugnisse beziehungsweise jede Produktgruppe
  wird für Gesamtproduktion und Produktion je Einwohner getrennt geprüft.
  Beide sind Indizes gegenüber der eigenen Basis, keine Marktgrößen oder
  Anlagebewertungen. 35 eigene FAO-Aggregate werden ausdrücklich gewählt.
- Börsen: tatsächlich berechnete Wellenpunkte. Gespeicherte Kurse mit noch zu
  kurzer Historie werden gesondert benannt. Globale Fonds machen ein Thema nicht
  automatisch für Indien, Deutschland oder ein anderes einzelnes Land verfügbar.
- NYU-Bewertungen: nutzbare Werte der jeweiligen Definition und tatsächlichen
  Länder- oder Branchenstichprobe. Mittelwerte und Mediane bleiben getrennt.
  Ein einzelner Jahresstand ist als Momentaufnahme verfügbar und wird nicht
  als lange Hoch-/Tiefwelle gezählt. Engere Themen wie Wasserstoff, Kernenergie
  oder Solarenergie erhalten keine erfundene Bewertungszuordnung.
  47 Themen sind ausdrücklich mit 90 vorhandenen Quellenbranchen verknüpft.
  Die 169 Verknüpfungen öffnen genau die gewählte Branche innerhalb ihrer
  Themenauswahl; die Rückkehr zeigt beispielsweise nur die drei Chemiebranchen.
  Die Suche und alte Seitenstände werden beim Einstieg zurückgesetzt.

Die Übersicht bewertet die vorhandene Historie, nicht ein gemeinsames
Vergleichsfenster mehrerer Quellen. Das große Bild behält seine eigenen
Zeitraum-, Einheiten- und Vergleichsprüfungen. Ältere Reihen können weiterhin
ein lokales historisches Bild liefern. Eine Quellenzuordnung allein beweist
keine lückenlose oder aktuelle Datenreihe.

## Navigation

Themenfeld, Statusfilter und Suche sind über `coverageDomain`, `coverageStatus`
und `coverageSearch` in der URL erhalten. Die Suche findet auch genaue
Statistikbezeichnungen. Wenn nur eine konkrete Messgröße passt, richtet sich
deren Status nach dieser Messgröße: eine andere verfügbare Trinkwasserkategorie
macht die gesuchte fehlende Kategorie nicht zum verfügbaren Treffer.

Geschlossene Themengruppen bauen ihre Auswahl erst beim Öffnen auf. Die Suche
öffnet passende Gruppen direkt. Auf- und Zuklappen bleibt per Tastatur möglich;
die übrigen Gruppen benötigen trotz der großen Auswahl keine unsichtbaren
Auswahllisten im Browser.

Eine Perspektive öffnet die genaue Statistik oder den konkreten Fonds. Ein
vorheriger Ländervergleich bleibt bei gleichem Gebiet erhalten. Bei einem
ausdrücklich gewählten anderen Quellengebiet werden Gebiet und Region gewechselt
und der alte Vergleich aufgehoben. Beispielsweise bietet **Afrika · UN-Region**
für Stromdaten einen gesonderten Zugang zu **Afrika · Ember-Region**. Das
Aufklappen des Hinweises allein verändert die Auswahl nicht.

Katalogthemen ohne implementierte Quelle bleiben als solche sichtbar. Genannte
Recherchequellen in den ursprünglichen Planungsdateien zählen nicht als Anbindung.

Die Bewertungslinks öffnen eine bestimmte Kennzahl oder Branche. Für USA,
Japan, Indien, China und Welt gibt es eigene Branchenquellen. Bei Deutschland
und anderen Ländern wird eine verfügbare globale Branchenperspektive ausdrücklich
als anderes Quellengebiet benannt. Die ursprüngliche Länderauswahl bleibt für
die Rückkehr erhalten; das Branchenbild trägt sichtbar seine eigene Quellenregion.

## Gebietsprüfung vom 9. September 2026

`evidence/audit_geographies.py` erzeugt den kompakten Produktionskatalog
`data/coverage-catalog.json` und den vollständigen Nachweis
[geography-crosswalk.json](evidence/geography-crosswalk.json).
Das öffentliche Weltbank-Verzeichnis wurde zunächst mit `--refresh-worldbank`
geladen. Nach Ergänzung der Findex-Gebiete wurde der gesamte Crosswalk aus den
vorliegenden Originaldateien und separat geprüften Quellenkatalogen erneut erzeugt.

| Datenfamilie                    | Zugeordnete Atlasgebiete | Nicht zugeordnet |
| ------------------------------- | -----------------------: | ---------------: |
| WDI-Länderstatistiken | 217 | 148 |
| UN-Altersprofile | 243 | 122 |
| Maddison-Historie | 174 | 191 |
| Ember-Stromwirtschaft | 227 | 138 |
| Explizite Börsen-Stellvertreter | 11 | 354 |
| NYU-Länderkennzahlen über alle Archive | 157 | 208 |
| IRENA-Anlagenleistung | 234 | 131 |
| BIS-Kreditbilder | 44 | 321 |
| BIS-Haushalts-/Unternehmensschulden | 48 | 317 |
| BIS-Immobilienbilder | 61 | 304 |
| OECD-Wohnvergleiche | 45 | 320 |
| UNESCO-Bildungsgebiete | 260 | 105 |
| FAOSTAT-Produktionsgebiete | 234 | 131 |
| JST-Finanzgeschichte | 18 | 347 |
| IMF-Staatsfinanzen | 151 | 214 |
| UN-Haushaltsbilder | 200 | 165 |
| WHO-Gesundheitsausgaben | 195 | 170 |
| WIPO-Technologiefelder | 199 | 166 |
| ILO-Beschäftigungsbilder | 190 | 175 |
| Findex-Erhebungen | 174 | 191 |

Der Nenner umfasst alle 365 Atlasgebiete einschließlich unterschiedlicher
Quellenregionen und Welt. Die elf Börsengebiete enthalten zehn Länder und Welt;
26 Fonds sind diesen Gebieten zugeordnet. Die Tabelle ist deshalb keine
Gleichsetzung von Länderanzahl und Beobachtungsabdeckung. Die 21. Quellenfamilie,
internationale Rohstoffpreise, besitzt keine Länderprofile und steht daher
außerhalb dieser Gebietsvergleichstabelle; ihr Einstieg bleibt die Weltansicht.
Der gemeinsame Audit prüft inzwischen 13 Familien direkt: WDI, UN, Maddison,
Ember, Börsengebiete, FAO, JST, IMF, BIS-Schulden, WHO, WIPO, ILO und Findex.
Die übrigen Familien ergänzen ihn aus
eigenen geprüften Produktionskatalogen und separaten nativen Nachweisen.
Die Haushaltszuordnungen werden über den vollständigen
[Originaldatei-/Cache-Abgleich](evidence/households-audit.json) gesondert geprüft.
IMF-Identitäten, Namensvarianten und Kalender stimmen mit dem vollständigen
Originaldatei-Audit überein. Die NYU-Zeile folgt dem
geprüften Vertrag `valuation-catalog.json`. Sie zählt die gesamte Geschichte;
der aktuelle Länderstand enthält 127 zugeordnete Quellenzeilen einschließlich
Welt. [Eigener NYU-Audit](evidence/valuation-source-audit.json),
[native Abdeckung](evidence/valuation-native-readiness.json).

Die Weltbankprüfung lädt ausschließlich das feste öffentliche
[Gebietsverzeichnis](https://api.worldbank.org/v2/country?format=json&per_page=500)
mit deaktivierten Weiterleitungen, Zeit- und Größenlimit. Sie vergleicht dessen
Identitäten mit dem vorhandenen vollständigen Statistiknachweis. Die
[Dokumentation der Weltbank](https://datahelpdesk.worldbank.org/knowledgebase/articles/898590-country-api-queries)
beschreibt auch die getrennten Gebiets- und Aggregatkennungen.
Das unzugeordnete Sammelgebiet `CHI` wird ausdrücklich dokumentiert. Seine Werte
werden Jersey und Guernsey nicht einzeln zugeschlagen. Beide Inseln erhalten in
der Oberfläche den entsprechenden Hinweis. Die spätere Anbindung eines eigenen
Sammelgebiets muss auch ältere Cache-Stände berücksichtigen, die diese Zeilen
noch nicht gespeichert haben.

UN und Maddison werden gegen ihre vollständigen, zuvor tatsächlich erzeugten
nativen Gebietsnachweise geprüft. Deren Quellenstände und Hashes werden im neuen
Protokoll weitergeführt. Ember wird zusätzlich anhand der kompletten öffentlichen
CSV-Datei zugeordnet; ihr SHA-256 muss dem nativen Prüfsnapshot entsprechen.
Quellregionen werden niemals in andere Regionsdefinitionen umgedeutet. Frühere
Staaten bleiben bei Maddison wie bisher als ausgeschlossene Quellgebiete benannt.
Die Börsenzuordnung stammt ausschließlich aus dem expliziten Fondskatalog.

Das Skript liest nur öffentliche Prüfdateien. Die Originaldateien liegen im
ignorierten Verzeichnis `apps/desktop/.tmp/atlas-validation`; persönliche
Datenbanken, Konten oder Zugangsdaten werden nicht gelesen. Ohne
`--refresh-worldbank` verwendet es das bereits gespeicherte Gebietsverzeichnis.
Bei neuen oder geänderten Katalogzuordnungen muss die Prüfung erneut erfolgen.

## Verifikation und Grenzen

Im ursprünglichen Abdeckungsabschnitt bestanden 63 gezielte Frontendtests,
einschließlich acht neuer Modell- und
Bedienprüfungen für Abdeckung, konkrete Suchtreffer, Null/Fehlwerte, zu kurze
Wellen, tatsächliche Bildgrundlagen und bewusste Quellengebietswechsel.
Typecheck, gezieltes ESLint, Formatprüfung und Produktionsbuild bestanden.
Die bekannte Buildmeldung zu großen bestehenden ECharts-/Dokumentexport-Chunks
bleibt bestehen. Die damalige Quellenübersicht änderte keine nativen Commands
oder Datenbanken; die spätere NYU-Erweiterung verwendet ihre eigene Atlasmigration 0006.

Nach Ergänzung der Bewertungsperspektiven bestanden 78 gezielte Frontendtests.
Sie prüfen unter anderem die echte indische Bildungsstichprobe, den ausdrücklich
globalen deutschen Branchenlink, nicht zugeordnete enge Energiethemen und den
Wechsel von einem Katalogthema zum Bewertungsbild. Der ursprüngliche
Fünf-Quellen-Gebietsaudit bleibt unverändert nachvollziehbar; neue NYU-Zuordnungen
werden aus ihrem eigenen geprüften Katalog gelesen.

Die CUA-Prüfung verwendete die gekennzeichnete Browser-Prüfansicht im originalen
App-Rahmen mit echten nativen öffentlichen Snapshots. Geprüft wurden Indien,
Deutschland, globale Wasserstoffgeschichte, UN-Afrika und der ausdrückliche
Wechsel zum tatsächlichen Ember-Strommix sowie der Jersey-Hinweis.
Alle 24 Gruppen waren erreichbar; Suche, optionale Zahlen und Aufklappen per
Enter funktionierten. Bei 1024 und 1440 Pixeln gab es keinen zusätzlichen
horizontalen Seitenüberlauf. Die Browserkonsole blieb ohne Warnungen oder Fehler.

Dies ist eine Prüfung der implementierten Zuordnung und der lokalen Darstellung,
keine neue unabhängige Prüfung sämtlicher Zahlen aller Länder. Die vollständige
native Sicht-/Klickabnahme und die fehlenden Quellenfamilien des Gesamtplans
bleiben offen. Jahrhundert-Finanzgeschichte, weitere Sektoren und tiefere
Länder-/Branchenbewertungen sind weiterhin Teil des Auftrags. Die sechs
Theorieansichten und die NYU-Bewertungsbilder sind inzwischen implementiert;
ihre jeweiligen Grenzen stehen in [CYCLES.md](CYCLES.md) und [VALUATION.md](VALUATION.md).

UNESCO ergänzt 40 Perspektiven mit eigener Prüfung jeder Messgröße. 260 Gebiete
sind zugeordnet; 245 haben tatsächliche Werte, 15 bleiben in den gewählten Reihen
leer. Die 22 SDG-Regionen sind eigene Gebiete. Modellreihen und Erhebungen zählen
getrennt; eine verfügbare Reihe verdeckt keine fehlende andere Perspektive.
[Eigenständiger Gebietsabgleich](evidence/education-geography-audit.json),
[Bedeutung und Quellen](EDUCATION.md).

## WHO-Gesundheitsausgaben

Die siebzehnte Quellenkarte ergänzt 38 direkte Messgrößen für 195 Länder und
Gebiete. Der Gebietsprüfer gleicht alle ISO3-IDs und Quellennamen mit beiden
geprüften WHO-Dateien ab. Jede Messgröße besitzt ihren eigenen Verfügbarkeitsstatus;
vorhandene Gesamtausgaben ersetzen keine fehlenden Pflege- oder Kapitalwerte.
Ein genauer Suchtreffer öffnet `healthGroup` und `healthMetric` mit expliziter
WHO-Perspektive. Welt und Kontinente erhalten keine konstruierten Durchschnitte.
[Quelle und Grenzen](HEALTH-FINANCE.md).


## WIPO-Technologiebilder

Die achtzehnte Quellenkarte ergänzt 35 Technikfelder und einen eigenen Bereich
für nicht zugeordnete Patentveröffentlichungen. 199 heutige Herkunftsländer
und Gebiete sind unabhängig geprüft; sechs historische Ursprünge und zwei im
Export fehlende aktuelle Ursprünge werden nicht durch Ersatzprofile verdeckt.
Jedes Feld prüft seine tatsächlichen Werte bis zum Standard-Endjahr 2023.
Ein ausschließlich für das optionale Randjahr 2024 vorhandener Wert zählt
nicht als verfügbare Standardansicht. Präzise Suchtreffer öffnen
`innovationGroup`, `innovationMetric` und den festgelegten Zeitraum mit
`perspective=innovation`. Ein Medizintechnik-Treffer landet dadurch bei
Patentaktivität, während die WHO-Ausgabenperspektive separat erreichbar bleibt.
[Quelle, Definitionen und vollständiger Abgleich](INNOVATION.md).


## ILO-Beschäftigungsbilder

Die zwanzigte Quellenkarte erschließt 14 Wirtschaftsbereiche und berechnet
für jeden Bereich den Beschäftigungsanteil aus dem gleichjährigen Total.
188 Länder und Gebiete sowie Welt und die eigene ILO-Afrika-Modellregion
besitzen Profile. Jeder Treffer öffnet den genauen Bereich mit `laborGroup`,
`laborMetric`, `laborSince` und `perspective=labor`. Die Quelle wird nie durch
andere Regionalmittel ersetzt. Fehlende Nenner und Länderjahre ergeben keine
scheinbar verfügbare Kurve. [Quelle und vollständiger Abgleich](LABOR.md).
