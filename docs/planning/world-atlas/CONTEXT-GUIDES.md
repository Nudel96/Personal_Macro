# Geordnete Themeneinstiege zu vorhandenen Bildern

Stand: 9. September 2026. Die hier beschriebenen vierzehn Themen führen über 29 Verknüpfungen zu
vorhandenen Datenperspektiven. Zehn Einstiege betreffen **Lange Entwicklungen**;
vier weitere erschließen Produktivität, Ungleichheit, digitale Verbreitung und
das historische Finanzumfeld. Die Änderung verwendet vorhandene
Atlasquellen und ihre lokalen Datenpfade; sie ergänzt keinen Anbieter, Download
oder numerischen Indikator. Der gesamte Weltatlas bleibt im Ausbau.

Weitere 52 [Themeneinstiege mit Quellenprüfung](TOPIC-RESEARCH.md) ergänzen
konkrete Recherchebefunde, darunter 18 Einstiege mit 21 weiteren WDI-Verknüpfungen.
Nach Anbindung der drei Findex-Themen beträgt der Umfang 66 Einstiege und
50 Verknüpfungen; Findex besitzt jetzt eigene numerische Bilder.
Die nachfolgenden nativen Prüfnachweise beziehen sich auf die ursprünglichen
vierzehn Einstiege; die spätere Quellen-Erweiterung hat einen eigenen Prüfbericht.

## Bedienung

Das Thema in seiner Gruppe wählen oder über die Themensuche finden.
Ein bis drei beschriftete Karten erklären das jeweilige Bild.
Quellenfamilie, zeitliche Grenzen und fehlende Länderprofile stehen direkt am
Einstieg. Ein zugeordnetes Profil garantiert keine Beobachtungen für jede
Messgröße; die Datenansicht zeigt verfügbare Jahre, Lücken und den lokalen Stand.

Land und Vergleichsland bleiben beim Öffnen erhalten. **Zum Themen-Einstieg
zurück** führt zum ursprünglichen Thema. Gemerkte Ansichten und letzte Auswahl
erhalten diesen Rückweg nach einem Neustart. Ein unabhängiger Themenwechsel
entfernt ihn; unbekannte oder unpassende Rücksprungziele erzeugen keinen Link.

| Einstieg                  | Verknüpfte Bilder                                                                         | Wesentliche Grenze                                                                            |
| ------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Gesamtproduktivität       | Leistung je Erwerbstätigen                                                                | Ergänzende Arbeitsproduktivität; Gesamtfaktor- und Stundenproduktivität sind nicht angebunden |
| Ungleichheit              | Gini-Index für Einkommen oder Konsum                                                      | Unterschiedliche Erhebungsgrundlagen; keine Vermögensungleichheit oder Armutsquote            |
| Technologieverbreitung    | Internetnutzung; feste Breitbandanschlüsse; Mobilfunkverträge                             | Digitale Teilperspektiven; Menschen und Verträge nicht gleichsetzen                           |
| Finanzielle Anspannung    | BIS-Kreditgap; JST-Wirtschaft mit Finanzkrisenanfängen                                    | Historisches Umfeld; kein gemessener aktueller Stressindex oder Krisenforecast                |
| Industrialisierung        | Industriebeschäftigung; Industriewertschöpfung einschließlich Bau; verarbeitendes Gewerbe | Unterschiedliche Nenner; ILO-Modellreihe bis 2024 begrenzt                                    |
| Dienstleistungswirtschaft | Beschäftigungsanteil; Wertschöpfungsanteil                                                | Breite öffentliche und private Dienstleistungen, keine einzelnen Branchen                     |
| Urbaner Wandel            | Städtischer Bevölkerungsanteil                                                            | Nationale Stadtdefinitionen, keine einzelnen Städte oder Wohnqualität                         |
| Historische Energiewenden | Strommix; Solarstromanteil; Kernenergieanteil                                             | Frühestens 2000; Strom ist nur ein Teil des Energiesystems                                    |
| Bildungsexpansion         | Grundschulbesuch; Abschluss der unteren Sekundarstufe; tertiärer Bildungsbesuch           | Bruttoeinschreibung und tatsächlich erhobene Abschlüsse bleiben getrennt                      |
| Produktivitätsphasen      | Leistung je Erwerbstätigen; historische Leistung je Einwohner                             | Verschiedene Bezugsgrößen, keine automatisch bestimmten Phasen                                |
| Langfristige Bevölkerung  | UN-Bevölkerungsgröße; Altersform                                                          | Historische Schätzungen 1950–2023; Projektionen zunächst ausgeschaltet                        |
| Historische Inflation     | Jährliche Verbraucherpreisinflation                                                       | Keine vollständige Jahrhundertrekonstruktion oder automatische Phasenklassifikation           |
| Historische Zinsen        | Kurzfristiger und langfristiger Nominalzins aus JST; IMF-Langfristrealzins                | JST nur 18 Länder bis 2020; nominal, real und Leitzins bleiben abgegrenzt                     |
| Krisen und Erholungen     | JST-Leistung je Einwohner mit Finanzkrisenanfängen; historisches IMF-Wachstum             | Markierungen nennen Anfänge, keine Dauer, universelle Krisenliste oder Vorhersage             |

Stromkarten öffnen Erzeugungsanteile ab 2000, UN-Karten beginnen mit
`demoProjection=0` und dem letzten historischen Jahr 2023. Die UIS-Karte wählt
`CR.2` (Erhebungen) statt einer Modellreihe. JST-/IMF-Karten setzen Messgröße,
Gruppe und längsten unterstützten Auswahlzeitraum gemeinsam. Tatsächliche
Länderreihen können wesentlich kürzer sein.

## Integration und Grenzen

`atlas-context-guides.ts` enthält kuratierte Ziele und Geltungstexte;
`atlas-context-panel.tsx` zeigt zugängliche Karten mit vorhandener Gebietsprüfung.
Die Ziele öffnen die bestehenden Statistik-, UN-, Ember-, UIS-, Maddison-, JST-,
BIS-Kredit- und IMF-Komponenten. Es werden keine Reihen unter neuen Themen-IDs kopiert.

`fromGuide` ergänzt die Frontend- und Rust-Freigabelisten für Darstellungsparameter.
Keine neue Migration. Die Einstiege selbst enthalten keine Diagramme oder
geladenen Quellenstände; Symbole werden nicht als Diagrammaufnahme gespeichert.
**Daten & Quellen** erläutert die Einstiege, ohne sie als zusätzliche Messreihen
oder lokal verfügbare Datenbilder zu zählen.

**Geld- und Währungssysteme** besitzt jetzt einen Quellen-Einstieg; eine eigene
numerische Geschichte bleibt offen. Energiewenden vor 2000,
Bevölkerungsrekonstruktionen vor 1950 und vollständige globale Inflationsgeschichte
benötigen ebenfalls eigene Quellenarbeit. Keine Sinus-, Gleichgewichts- oder
automatische Phasenaussage wird aus diesen Verknüpfungen abgeleitet.

## Prüfungen

Die Erweiterung auf vierzehn Einstiege besteht mit **247 Atlas-Frontendtests in
35 Dateien**, Typecheck, gezieltem ESLint und Produktionsbuild. Die zusätzlichen
Navigationstests prüfen konkrete Digitalreihen, Indien/China, Rückwege und den
Wechsel von einer alten Kreditdarstellung zum vollständigen BIS-Gap-Verlauf.
Im neuen isolierten Profil `com.personal-macro.atlas-topic-links-20260909` bleiben
vierzehn Einstiege, 29 Ziele und drei zusätzliche Bewertungsziele nach echtem
Prozessneustart unverändert: **46 Notizkontexte** plus letzte Ansicht. Dieser
Nachweis betrifft Navigation, keine neuen Datenwerte oder PNGs.
[Prüfbericht](evidence/topic-links-readiness.json),
[Prüfer](evidence/check_topic_links_native.py).

Die nachfolgenden Prüfungen dokumentieren den vorherigen Umfang von zehn Einstiegen:

- **180 Atlas-Vitestfälle in 27 Dateien bestanden**: Katalogziele, präzise
  Navigation, Gebietsgrenzen, Rückwege und unveränderte Abdeckungszählung.
  Typecheck, gezieltes ESLint, Formatprüfung, Clippy und Produktionsbuild bestehen.
  Der bekannte Vite-Hinweis auf große Chunks bleibt.
- Neuer Rust-Test: Kontext mit `fromGuide` in temporärer SQLite-Datei speichern,
  schließen, erneut öffnen; Notiz und letzte Ansicht bleiben erhalten.
- Echte Tauri-Commands im isolierten Profil
  `com.personal-macro.atlas-context-guides-20260909`: zehn Einstiege und 22 Ziele
  als **32 Notizkontexte** gespeichert und nach echtem Prozessneustart unverändert
  gelesen; auch die letzte Auswahl bleibt erhalten. Keine Quellenstände oder
  PNGs wurden dafür erfunden. Der unabhängige Prüfer liest ausschließlich dieses
  Profil mit `mode=ro`, niemals die persönliche Datenbank.
- Browser-Sichtprüfung mit dem Produkt-Frontend und ausdrücklich bezeichneten
  öffentlichen Antworten aus früheren nativen Testabrufen: Industrialisierung
  bei 1024/1440 px ohne horizontalen Überlauf, sichtbarer Tastaturfokus und Enter,
  Deutschland/USA-Beschäftigung 1991–2024 und Rückweg. Indien/China zeigen die
  JST-Profillücke am Einstieg; IMF öffnet ihr tatsächliches Realzinsbild 2002–2018.
  Keine Browserwarnungen oder -fehler während dieser Prüfung.

Beide native Starts initialisierten ohne Atlasfehler. Bekannte Hintergrundwarnungen
außerhalb des Atlas bleiben: abgelehnener EODHD-Technicals-Zugriff und eine bereits
laufende Zentralbankbericht-Aktualisierung. Native Klickabnahme bleibt separat
offen; Browser-Sichtprüfung und native Command-Prüfung werden nicht gleichgesetzt.

Nachweis: [Native Prüfung](evidence/context-guides-readiness.json) und
[reproduzierbarer Prüfer](evidence/check_context_guides_native.py).
Messgrößen: [Statistiken](STATISTICS.md), [Industriestruktur](SECTOR-STRUCTURE.md),
[UN](DEMOGRAPHY.md), [Bildung](EDUCATION.md), [Strom](ENERGY.md),
[Maddison](HISTORY.md), [JST](MACROHISTORY.md), [IMF](FISCAL.md).
