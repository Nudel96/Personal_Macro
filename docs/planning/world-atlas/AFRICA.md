# Afrika: zusätzliche Entwicklungsdaten

Quellenprüfung: 15. September 2026. Die Erweiterung ergänzt **49 WDI-Reihen**
und **drei ausdrücklich benannte Weltbank-Regionen**. Der gemeinsame Atlas
enthält damit 180 Jahresstatistiken (142 WDI, 38 UN-SDG), 381 Gebiete und
260 Themen. Die vorhandenen eigenständigen Quellenpakete bleiben erhalten.

## Inhalt und Abdeckung

Die 49 Reihen liefern gemeinsam 79.751 zusätzliche historische Zahlen für
54 afrikanische Länder, verteilt auf 2.524 tatsächlich vorhandene
Land-Reihe-Kombinationen. Eine einzelne Reihe hat Werte für 24 bis 54 Länder.
Die sechs weiteren afrikanischen Atlasgebiete erhalten keine erfundenen
Länderwerte. Jahre mit fehlenden Daten bleiben leer.

Die lokalen Jahresstatistiken der afrikanischen Länder umfassen nach dem
Import 275.495 Zahlen gegenüber 195.744 zuvor (**+40,7 Prozent**). Diese Zählung
bezieht sich auf die gemeinsame WDI-/SDG-Jahresstatistik; sie zählt weder die
separaten Quellenpakete noch Kartenpunkte, Kursreihen oder Prognosen hinzu.

Beispiele der zusätzlichen Länderabdeckung:

| Land | Neue Reihen mit Zahlen | Zusätzliche Jahreswerte |
| --- | ---: | ---: |
| Ägypten | 48 | 1.714 |
| Äthiopien | 49 | 1.364 |
| Eritrea | 40 | 891 |
| Kenia | 49 | 1.658 |
| Kongo-Kinshasa | 48 | 1.396 |
| Marokko | 46 | 1.672 |
| Nigeria | 49 | 1.605 |
| Somalia | 43 | 1.316 |
| Südafrika | 49 | 1.553 |
| Südsudan | 41 | 638 |
| Tschad | 48 | 1.440 |
| Tunesien | 48 | 1.697 |

Westsahara, Mayotte, Réunion, St. Helena, das Britische Territorium im Indischen
Ozean sowie die Französischen Süd- und Antarktisgebiete haben für diese
WDI-Erweiterung keine eigene Quellenzuordnung. Vorhandene Daten anderer
Quellen bleiben unabhängig davon erhalten.

| Bereich | Zusätzliche Perspektiven |
| --- | --- |
| Strom und Kochen | Stromzugang in Stadt und Land; saubere Kochenergie insgesamt, städtisch und ländlich |
| Wasser und Hygiene | Grundlegende Sanitärversorgung insgesamt, Stadt und Land; grundlegendes Trinkwasser in Stadt und Land; Händewaschen; offene Defäkation |
| Ernährung und Gesundheit | Unterernährung, zwei FIES-Stufen, Wachstumsverzögerung und Auszehrung bei Kindern; Müttersterblichkeit, HIV, Malaria, Tuberkulose; Pflegepersonal |
| Landwirtschaft und Fischerei | Düngernährstoffe, Bewässerung, Ackerland je Einwohner, Nahrungsproduktionsindex; Fang, Aquakultur und Gesamtproduktion |
| Außenwirtschaft und Finanzierung | Nahrungs- und Brennstoffanteile an Warenimporten und -exporten; Netto-Entwicklungshilfe, Auslandsschulden und Auslandsschuldendienst; Währungsreserven, Leistungsbilanz |
| Beschäftigung, Armut und Wohnen | Drei Beschäftigungsformen, NEET-Anteil, Geburten bei Jugendlichen; Armut unter 4,20/8,30 internationalen Dollar, Einkommensanteil der unteren 20 Prozent; städtische Slumhaushalte |

Die öffentliche
[WDI-API](https://datahelpdesk.worldbank.org/knowledgebase/articles/889392)
liefert die Originalzahlen und Metadaten. Die Armutsreihen verwenden
[Kaufkraftparitäten 2021 und die revidierten Armutsgrenzen](https://www.worldbank.org/en/news/factsheet/2025/06/05/june-2025-update-to-global-poverty-lines).
Die Produktion übernimmt sämtliche von WDI bereitgestellten Länder; Afrika
ist der Schwerpunkt der zusätzlichen Quellen- und Zahlenprüfung.

## Regionen bleiben ausdrücklich getrennt

| Atlas-ID | Originalcode und Providerbezeichnung |
| --- | --- |
| `worldbank:SSF` | `SSF` · Sub-Saharan Africa |
| `worldbank:AFE` | `AFE` · Africa Eastern and Southern |
| `worldbank:AFW` | `AFW` · Africa Western and Central |

Dies sind veröffentlichte Originalaggregate nach der
[Weltbank-API-Systematik](https://datahelpdesk.worldbank.org/knowledgebase/articles/898614-aggregate-api-queries).
Sie sind keine von der App gebildeten Länder-Durchschnitte und keine vollständige
Darstellung des gesamten Kontinents. Nordafrika wird weiterhin über seine Länder
und vorhandene passende Quellenregionen erschlossen. `AFR` und `NAF` stehen zwar
im allgemeinen Weltbank-Gebietsverzeichnis, lieferten in der hier geprüften
WDI-Abfrage keine Reihen. Daher werden sie nicht als Datenprofile angeboten.

UN-WPP-, ILO-, FAO-, Ember-, IRENA- und WDI-Regionen behalten unterschiedliche
IDs. Die neuen WDI-Aggregate erhalten keinen fiktiven ISO-Ländercode.
`worldbank.rs` prüft ihren Providercode, den Originalnamen und den Status als
Aggregat bei jedem Download. Ein geänderter Name oder eine doppelte Identität
stoppt die Übernahme. Die vorhandene Behandlung der gemeinsamen Kanalinseln
bleibt erhalten.

## Fachliche Grenzen

- Alle neuen Reihen haben ein festes historisches Endjahr 2024; der tatsächlich
  letzte vorhandene Wert kann deutlich älter sein. Das Fenster wird nicht
  automatisch mit dem Kalender erweitert.
- Modellschätzungen bleiben gekennzeichnet. Vergangene Jahreszahlen allein
  beweisen keine direkt beobachteten Daten; insbesondere demografische Modelle
  können Projektionsanteile enthalten.
- Armuts-, Verteilungs-, Ernährungs- und andere Erhebungsreihen bleiben auch
  bei benachbarten Jahren einzelne Punkte. Mehrjährige Bezugsfenster werden
  nicht in scheinbare jährliche Messungen umgedeutet.
- Unterernährung mit Quellenwert 2,5 kann „unter 2,5 Prozent“ bedeuten. Dieser
  Hinweis steht unmittelbar in der Bedeutung der Reihe. Es entsteht kein
  erfundener genauerer Wert.
- Gesamt-, Stadt-, Land-, Alters- und Risikobevölkerung bleiben verschiedene
  Nenner. Malaria verwendet Risikobevölkerung, Müttersterblichkeit Lebendgeburten.
- Auslandsschulden umfassen öffentliche und private Verbindlichkeiten.
  Sie bekommen ein eigenes Thema und ersetzen weder reine Staatsschulden
  noch BIS-Haushalts-/Unternehmensquoten.
- Nettohilfe und Leistungsbilanz dürfen negativ sein; Schuldenquoten dürfen
  hundert überschreiten. Null und fehlende Werte werden getrennt gespeichert.
- Nahrungs-Warenhandel umfasst nach SITC auch Getränke und Tabak. Fischerei
  wird in Tonnen dargestellt, nicht als Wertschöpfung oder Nachhaltigkeitsnote.
- Slumhaushalte sind keine vollständige Messung von Wohnraumbezahlbarkeit
  und ersetzen keine fehlenden OECD-Wohnungsbestände.

## Implementierung und Zugriff

`data/africa-development-catalog.json` enthält die geprüften Originaltitel,
deutschen Bedeutungen, Einheiten, Zeitgrenzen und Regionsidentitäten.
`scripts/build-atlas-catalog.mjs` übernimmt diese in den gemeinsamen Katalog.
Eine bei der Regeneration gefundene bisher fehlende Generator-Zuordnung des
bestehenden EU-Patentgebiets ist im ursprünglichen Quellenverzeichnis ergänzt.

Die vorhandenen nativen WDI-Downloads validieren Metadaten, vollständige
Paginierung und unveränderten Quellenstand. Speicherung erfolgt atomar je Reihe
im **öffentlichen** Atlas-Cache. Es gibt keine neue Datenbankmigration, keine
Journalreparatur und keinen zusätzlichen Schlüssel. Die Browser-Vorschau zeigt
weiterhin offen an, dass lokale Daten in der Desktop-App geladen werden müssen.

In **Weltatlas → Länderübersicht** sind die zusätzlichen Reihen innerhalb ihrer
Themen auswählbar und lassen sich als Einzelbild öffnen. Die Region **Afrika** begrenzt die Gebietsauswahl; die drei
Weltbank-Regionen sind dort separat benannt. **Daten & Quellen** verlinkt jede
Messgröße direkt. Explizite WDI-Links werden gegenüber einem ergänzenden
Themen-Einstieg oder einer anderen Quellenansicht respektiert. Bei Themen mit
mehreren Quellen kann zwischen den getrennten Perspektiven gewechselt werden.

## Reproduzierbare Prüfung

- [Quellen- und Cacheprüfung](evidence/audit_africa_expansion.py) vergleicht einen
  unabhängigen öffentlichen API-Abruf mit den nativ importierten Werten und
  fehlenden Kalenderzellen. Sie öffnet ausschließlich `atlas/cache.sqlite`
  mit SQLite `mode=ro` und `query_only`.
- `--fetch-sources` lädt die öffentlichen Kontrollantworten in das ignorierte
  Verzeichnis `apps/desktop/.tmp/atlas-africa`, ohne eine Datenbank zu öffnen.
  Vorhandene Antworten werden mit ihrer ursprünglichen URL und Prüfsumme
  wiederverwendet. Sechs gebündelte Quellenabfragen prüfen zusätzlich die drei
  Regionen für alle 142 WDI-Reihen. Der Vergleich berücksichtigt je Reihe das
  eigene historische Endjahr. Bei einem veränderten Providerstand müssen die
  Antworten und der native Import erneut gemeinsam geprüft werden.
- [Ausgangsabdeckung](evidence/africa-baseline-2026-09-15.json) enthält die
  Länderabdeckung vor dem Import, ohne persönliche Daten.
- [Ergebnis und Originalprovenienz](evidence/africa-expansion-2026-09-15.json)
  enthalten Landeszahlen, Quellen-URLs, SHA-256-Prüfsummen und Vergleiche. Etwaige
  Abweichungen durch binäre Dezimalkonvertierung werden gezählt und auf
  `rel_tol=1e-14`, `abs_tol=1e-12` begrenzt.
- `atlas-africa.test.ts` prüft Nenner, Armutsbasis, Erhebungspunkte, Modellgrenzen,
  fehlende Werte, negative Zahlen und Regionsabgrenzungen. Die Seitenprüfung
  testet den Quellenwechsel mit erhaltenem Land und Vergleich.
- Native Tests prüfen Identitätswechsel, Duplikate, regionale Originalwerte,
  Null, fehlende Werte und die getrennte UN-/WDI-/Kanalinselzuordnung.

Die unabhängige Prüfung der 49 neuen Reihen vergleicht 83.717 Zahlen und
97.828 fehlende Kalenderzellen aus den afrikanischen Ländern und drei Regionen.
Alle Zahlen stimmen exakt überein; die erlaubte Rundungstoleranz wurde nicht
benötigt. Die regionalen Vergleiche über alle WDI-Reihen sind im Ergebnisbericht
separat ausgewiesen, weil sich ihre neuen Reihen mit dieser Prüfung überschneiden.

Der abschließende regionale Vergleich über **alle 142 WDI-Reihen** ist ebenfalls
erfolgreich: **13.328 Zahlen und 14.611 fehlende Kalenderzellen** stimmen mit
den veröffentlichten Quellen überein. Die 49 neuen Reihen wurden in einem
vollständigen Sammelabruf gespeichert. Von den 93 vorhandenen WDI-Reihen
aktualisierte ein weiterer Sammelabruf 92; die bereits am selben Tag geladene
Verbraucherpreisinflation wurde danach über den vorhandenen Einzelabruf neu
geladen. Damit haben alle 142 Reihen die geprüften Regionszuordnungen. Reihen
ohne veröffentlichte Regionalzahlen bleiben trotzdem ausdrücklich leer.

Die CLI `fill_atlas_statistics` unterstützt dafür `--single <series-id>` und
verwendet unverändert den nativen Einzelabruf. Die 24-Stunden-Regel des
Sammelabrufs und die eigene UN-SDG-Abrufsperre bleiben erhalten. Es wurden
keine Abrufzeitstempel manipuliert und keine Zahlen durch direkte SQL-Eingriffe
ergänzt. Abschluss der vollständigen Cacheprüfung: 15.09.2026, 18:19 Uhr MESZ.

Verifikation der Implementierung: 323 Atlas-Frontendtests und 110 native
Atlas-Tests erfolgreich; 47 bewusst deaktivierte externe Rust-Livetests wurden
nicht als bestanden gezählt. Clippy mit `-D warnings`, gezieltes ESLint,
TypeScript und der Windows-Release-Build sind erfolgreich. Die Browserprüfung
verwendet gekennzeichnete, ausschließlich lesende Ausschnitte des öffentlichen
Caches: Nigeria/Kenia, das Originalaggregat südlich der Sahara, Zeitlücken und
Quellenwechsel. Die neue native Windows-App wurde gestartet und ihre
Initialisierung mit „Lokal verbunden“ bestätigt. Die weitere native
Bedienprüfung wurde bei Nutzereingaben beendet; ein vollständiger visueller
Durchgang in der nativen App wird daher nicht behauptet.

Der normale Start über `START-MACROTOOL.cmd` wählt die neue Release-Datei unter
`src-tauri/target/x86_64-pc-windows-msvc/release` aus. Der letzte Build enthält
auch die abschließend korrigierten deutschen Bedeutungstexte.

Weiter offen bleiben echte Quellenlücken, insbesondere detaillierte
Immobilien-, Firmenbewertungs- und Industrieserien für viele afrikanische Länder.
Eine große Zahl zusätzlicher Beobachtungen bedeutet keine vollständige
Abdeckung jedes Atlas-Themas.
