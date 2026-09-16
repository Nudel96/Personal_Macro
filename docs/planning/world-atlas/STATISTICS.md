# Statistische Länderbilder

Die statistische Grundlage im Weltatlas umfasst 91 ausdrücklich zugeordnete
WDI-Reihen: zehn ursprüngliche Reihen und 81 zusätzliche, einzeln geprüfte
Perspektiven. Sie verwenden dieselbe kostenlose öffentliche World-Bank-API
ohne Schlüssel. Der Atlas lädt auf ausdrücklichen Wunsch eine Statistik oder
eine gewählte Themengruppe für die verfügbaren Länder gemeinsam und speichert
sie in seinem öffentlichen SQLite-Cache. Das Öffnen oder Filtern der Übersicht
löst keinen Download aus.

Die jüngste Erweiterung ergänzt drei [Migrationsbilder](MIGRATION.md):
historische jährliche Salden bis 2023 sowie getrennte Bestands- und
Anteilsbeobachtungen bis 2024. Alle 17.336 neuen numerischen Quellenwerte sind
weltweit gegen den nativen Cache geprüft.

Die vorherige Erweiterung ergänzte 14 Perspektiven zu Energiebedarf und
Energieimporten, Netzverlusten, Brennstoffen, Rohstoffen, Gründungen, Handel,
Logistik und Erwerbsbeteiligung bei tertiärer Bildung. Tatsächliche Länderjahre,
Quellendefinitionen und der vollständige native Abgleich stehen unter
[Energie und wirtschaftliche Rahmenbedingungen](ECONOMIC-CONTEXTS.md).

## Bildliche Länderübersicht

**Länderübersicht** zeigt die 91 angebundenen Statistiken in 17 Gruppen unter
sieben Themenfeldern. Die Reihenfolge folgt dem Themenkatalog, bei Bildung
beispielsweise von frühkindlicher Bildung über Grundschule und Sekundarstufe
bis zur Hochschule. Felder und Gruppen lassen sich eingrenzen. Weltbankreihen
ergänzen hier die anderen Datenfamilien; UN-Altersprofile, Ember-Strombilder,
Marktwellen und historische Perspektiven bleiben zusätzlich in **Länder & Themen**
erreichbar.

Die Zeitwahl umfasst 20 Jahre, 40 Jahre oder seit 1960 und endet beim Vorjahr.
Alle Karten teilen dieses Kalenderfenster. Innerhalb einer Statistik haben
beide Länder eine gemeinsame Skala mit null und gegebenenfalls negativen oder
über hundert liegenden Werten. Verschiedene Statistiken behalten ihren eigenen
Maßstab und ihre sichtbare Einheit. Die Höhe unterschiedlicher Karten ist
deshalb kein gemeinsamer Rang oder Bewertungswert.

Blau bezeichnet das gewählte Land, Violett mit gestrichelter Linie das
Vergleichsland. Lücken werden nicht verbunden, einzelne Beobachtungen bleiben
als Punkte sichtbar. Jede Karte nennt den tatsächlich gezeigten Zeitraum und
den jeweiligen letzten Quellenwert. Ein Vergleich ist nur bei gleicher
Statistik, Einheit, Abrufstand und mindestens einem gemeinsamen beobachteten
Jahr möglich. Zahlen sind zunächst verborgen; nach dem Einschalten zeigen
beide Länder den letzten gemeinsam verfügbaren Jahreswert. Ein Land mit
fehlenden Werten wird benannt und nicht durch einen anderen Indikator ersetzt.

Eine Karte öffnet die konkrete Statistik und erhält Land sowie Vergleich.
Die Rückkehr erhält Feld, Gruppe und Horizont über die URL-Parameter
`statDomain`, `statGroup` und `statHorizon`. Bei 1024 Pixeln werden zwei Spalten,
bei 1440 Pixeln drei Spalten verwendet. Tastaturfokus und deutsche Statusmeldungen
gehören zu den Bedienpfaden.

## Expliziter Sammelabruf

**Auswahl laden / aktualisieren** übergibt nur die sichtbaren Katalogreihen an
`sync_atlas_statistics_batch`. Jede Statistik wird weiterhin weltweit geladen.
Unbekannte, doppelte oder leere Auswahlen werden abgewiesen. Die globale
Atlas-Abrufsperre verhindert einen gleichzeitigen weiteren Atlasdownload.
Erfolgreich gespeicherte Datensätze der letzten 24 Stunden werden übersprungen,
auch wenn ein ausgewähltes Land darin keine Werte hat.

Jede vollständig validierte Statistik wird einzeln atomar übernommen. Der
gemeinsame Job zählt gespeicherte Statistiken und numerische Beobachtungen;
Providerseiten überschreiben diesen Fortschritt nicht. Die Oberfläche liest
bereits bei Teilerfolgen erneut aus dem lokalen Cache. Bei einem Fehler bleiben
vorherige Reihen und bereits abgeschlossene Downloads erhalten.
**Nach aktueller Statistik stoppen** betrifft nur den angegebenen aktiven Job
und stoppt vor der nächsten Statistik. Ein erneuter Sammelabruf überspringt
bereits erfolgreich geladene Reihen; es handelt sich nicht um eine Wiederaufnahme
innerhalb einer unvollständigen Providerantwort. Die Browser-Vorschau lehnt native
Download-Commands ausdrücklich ab. Der WDI-Sammelabruf benötigt keine eigene
Migration; der gemeinsame öffentliche Atlas-Cache umfasst inzwischen Migrationen
0001–0012 für die weiteren Datenfamilien.

## Bedeutung und Auswahl

Die Reihen ergänzen die Marktwellen, UN-Altersprofile, Maddison-Historie und
Ember-Stromwirtschaft. Sie messen reale statistische Entwicklungen. Keine
dieser Reihen liefert allein eine allgemeingültige Unter-/Überbewertung oder
eine natürliche Sinusperiode. Ein gestiegener Industrieanteil kann beispielsweise
auch dadurch entstehen, dass andere Teile der Wirtschaft schrumpfen.

Die [Erweiterung um Beschäftigung und Industriestruktur](SECTOR-STRUCTURE.md)
ergänzt acht Reihen. Drei ILO-Modellreihen haben eine feste Grenze bis 2024;
die fünf UNIDO-Industrieanteile verwenden einen eigenen Nenner. Modellstatus
und Zeitgrenze stehen bereits auf den kleinen Karten. Die bisherigen
Standardperspektiven bleiben erhalten.

Die Gruppen umfassen:

| Bereich                | Zusätzliche Perspektiven                                                                                                               |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Bildung                | Frühkindliche Bildung, Grundschule, letzte Schulklasse, tertiäre Bildung, Alphabetisierung, staatliche Ausgaben, Lernende je Lehrkraft |
| Gesundheit             | Ärztedichte, laufende Ausgaben, Krankenhausbetten, DPT-Impfquote                                                                       |
| Demografie             | Lebenserwartung, Sterblichkeit vor dem fünften Geburtstag, Bevölkerungswachstum                                                        |
| Arbeit                 | Beschäftigung, Anteile von Landwirtschaft/Industrie/Dienstleistungen, Jugendarbeitslosigkeit, Erwerbsbeteiligung, Leistung je Erwerbstätigen, Gini-Verteilung |
| Industrie              | Anteile von Chemie, Maschinen/Transportausrüstung und Textilien an der industriellen Wertschöpfung                                   |
| Wirtschaftsstruktur    | Reales BIP, Wachstum, Inflation, Investition, Konsum, Ersparnis, Industrie-, Dienstleistungs- und Agraranteile                         |
| Ernährung und Wasser   | Pflanzen- und Tierproduktion, Getreideertrag, Agrarflächen, Nahrung/Getränke/Tabak in der Industrie, zwei Trinkwasserkategorien, Sanitärversorgung, Wasserstress |
| Technologie und Wissen | Feste Breitbandanschlüsse, Mobilfunkverträge, Forschungsausgaben, Forschungspersonal, Patentanmeldungen                                |
| Außenwirtschaft        | Exporte, Importe, Außenbeitrag, Direktinvestitionszuflüsse, Rücküberweisungen, Handelsverflechtung                                     |
| Umwelt und Verkehr     | Waldfläche, PM2,5, CO₂ ohne Landnutzung, registrierte Fluggesellschaften, Hafenumschlag, Eisenbahnstrecken                             |
| Finanzierung           | Privatkredite und inländischer Börsenwert im Verhältnis zur Wirtschaftsleistung                                                        |

Der Produktionskatalog ist
`apps/desktop/src/features/world-atlas/data/statistics-catalog.json`.
Er enthält deutsche Bedeutung, Geltungsgrenze, genaue Einheit und geprüfte
Providerbezeichnung je Reihe. Der Generator übernimmt diese Zuordnungen in
den gemeinsamen Frontend-/Rust-Katalog. Die ursprüngliche Planungsprobe wird
nicht nachträglich als neue Quellenprüfung umgeschrieben.

Bei mehreren Reihen zeigt **Statistik auswählen** die getrennten Perspektiven.
Die URL hält die konkrete `series`-Auswahl fest; ein Wechsel des Themas entfernt
eine dazu nicht mehr passende Auswahl. Länder und Vergleich bleiben beim
Statistikwechsel erhalten. Fehlende sichere Trinkwasserversorgung in China
wird beispielsweise nicht stillschweigend durch grundlegende Versorgung ersetzt.

## Fachliche Grenzen

- Bruttoeinschulungsquoten zählen Lernende unabhängig vom Alter und können
  über hundert liegen. Die WDI-Abschlussreihen messen tatsächlich den
  Bruttozugang zur letzten Klasse: Daher benennt die Oberfläche diese Größe
  als **Zugang zur Abschlussklasse**, nicht als beobachtete Abschlussquote.
- Laufende Gesundheitsausgaben schließen Kapitalinvestitionen aus. Ärztedichte
  und Bettenzahl beschreiben nur jeweils einen Aspekt der Versorgung.
- ILO-Reihen sind Modellschätzungen. Die Jugendarbeitslosigkeit hat junge
  Erwerbspersonen im Nenner, die Beschäftigungsquote dagegen die gesamte
  Bevölkerung ab fünfzehn Jahren.
- Reales BIP verwendet konstante US-Dollar von 2015; Wirtschaftsleistung je
  Erwerbstätigen internationale Dollar mit Kaufkraftbasis 2021. Diese Einheiten
  werden nicht vermischt. Forschungspersonal ist in Vollzeitäquivalenten erfasst.
- Produktionsindizes verwenden 2014–2016 als rechnerische Basis. Dieser
  Referenzwert ist kein Gleichgewichts- oder Fair-Value-Niveau.
- Mobilfunk- und Breitbandverträge zählen Anschlüsse, keine eindeutig
  identifizierten Menschen. Brutto-, Handels-, Kredit- und weitere BIP-Quoten
  dürfen hundert überschreiten; Außenbeitrag und Nettoinvestitionszuflüsse
  können negativ sein.
- Gini-Werte stammen aus verschiedenen Einkommens- oder Konsumerhebungen.
  Einzeljahre bleiben sichtbar, fehlende Jahre werden nicht interpoliert.
- Luftverkehr folgt dem Sitz der Fluggesellschaft, Containerumschlag kann
  Umladungen mehrfach zählen, Eisenbahnlänge bezeichnet Strecken statt Gleise.
- CO₂ umfasst die angegebene Emissionskategorie ohne Landnutzungsänderungen
  und Forstwirtschaft; es ist kein Gesamttreibhausgas- oder Konsumfußabdruck.

Die untersuchte UHC-Kennung `SH.UHC.SRVS.CV.XD` war in der aktuellen
Metadatenantwort nicht eindeutig WDI-Quelle 2 zugeordnet und wurde nicht
angebunden. Die zuvor zurückgestellte Nettozuwanderung `SM.POP.NETM` ist nach
Prüfung der WPP-Grenze nun als jährliche historische Modellreihe bis 2023
angebunden. Jahre ab 2024 bleiben ausgeschlossen. Die beiden Migranten-
Bestandsreihen verwenden eine eigene Quelle und Zeitgrenze. Ältere
Veröffentlichungen desselben Codes mit anderen Periodendefinitionen werden
nicht angehängt. [Quellenprüfung und Unterschiede](MIGRATION.md).

## Diagramm und Datenvertrag

Die Jahreslinie bleibt ungesmoothet und verbindet keine Lücken. Seltene
Einzelerhebungen haben sichtbare Symbole. Im Vergleich haben die beiden
Länder verschiedene Farben, Linienarten und Symbole sowie eine gemeinsame
Zeit- und Wertachse. Die Skala umfasst null und tatsächliche negative Werte;
Bruttoquoten werden nicht auf hundert begrenzt. Eine Nulllinie ist eine
rechnerische Orientierung, keine Anlagebewertung. Zahlenachsen, numerische
Tooltips und Tabelle erscheinen erst mit **Zahlen anzeigen**.

Der vorhandene native WDI-Adapter prüft vor dem Download zusätzlich die genaue
Providerbezeichnung gegen den freigegebenen Katalog. Eine geänderte Preisbasis,
umbenannte Statistik oder mehrdeutige Quellenantwort wird vor dem Ersetzen des
lokalen Stands abgelehnt. Diese Prüfung entdeckt nicht jede methodische Änderung
bei unverändertem Titel; Quellenbeschreibung, Zeitstand und Antwort-Hashes
bleiben deshalb mitgespeichert. Länder ohne passende Quellkennung bleiben
`unsupported_area`, vorhandene Quellgebiete ohne Zahlen `empty`.

Die neuen Bedeutungstexte sind optionale Felder des TypeScript-Vertrags und
mit `serde(default)` kompatibel zum ursprünglichen Rust-Katalog. Dafür ist
keine SQLite-Migration erforderlich. WDI verwendet weiterhin die ursprünglichen
Cachetabellen; Journal- und Kontodaten werden nicht verwendet.

## Quellen und Wiederholbarkeit

- [Weltbank: API ohne Authentifizierung](https://datahelpdesk.worldbank.org/knowledgebase/articles/889392)
- [Weltbank: API-Struktur, Quellen und Pagination](https://datahelpdesk.worldbank.org/knowledgebase/articles/898581-api-basic-call-structures)
- [WDI-Definition der laufenden Gesundheitsausgaben](https://databank.worldbank.org/metadataglossary/world-development-indicators/series/SH.XPD.CHEX.GD.ZS)
- [WDI-Definition des Forschungspersonals einschließlich Vollzeitäquivalenten](https://databank.worldbank.org/metadataglossary/world-development-indicators/series/SP.POP.SCIE.RD.P6)
- [WDI-Definition und Einschränkungen der Nettozuwanderung](https://databank.worldbank.org/metadataglossary/world-development-indicators/series/SM.POP.NETM)

Metadaten und Zahlen wurden zunächst für Deutschland, USA, Indien, China,
Brasilien, Nigeria, Südafrika, Japan und Welt unabhängig über öffentliche
HTTPS-Abfragen geprüft. Die Originalantworten liegen nur im ignorierten
Prüfverzeichnis. URLs und SHA-256-Werte sind Teil des Prüfprotokolls.

Der explizite Rust-Test `world_atlas_live_statistics_expansion_roundtrip`
prüft alle jeweils katalogisierten Reihen über den produktiven globalen Adapter und eine temporäre
Datenbank. `ATLAS_WRITE_STATISTICS_REVIEW=1` schreibt ausschließlich öffentliche
Prüfsnapshots unter `apps/desktop/.tmp/atlas-validation`. Für jedes zugeordnete
Gebiet werden nutzbare Jahre, erster/letzter Wert und Quellenzuordnung erfasst.
Nach dem Schließen wird derselbe Testcache erneut geöffnet und jede der neun
Länder-/Weltantworten pro Statistik vollständig auf Gleichheit geprüft.

`evidence/check_statistics.py` vergleicht die ergänzenden Reihen mit den unabhängig
abgefragten Originalwerten über Python `Decimal`, einschließlich Nullwerten,
fehlenden Jahren, Quellkennzeichen und Quellenstand. Darstellungstoleranzen
erlauben nur die binäre Float-Repräsentation, keine fachlichen Abweichungen.
Die neun Gebiete sind eine unabhängige numerische Stichprobe, keine Bestätigung
aller weltweiten Quellenwerte. Fehlende Werte zählen nicht als Coverage.

## Frühere Prüfung der ersten 66 Reihen vom 9. September 2026

Die folgenden Zahlen dokumentieren den früheren Umfang. Die späteren acht
Reihen wurden separat über den echten Tauri-Sammelabruf und alle zugeordneten
weltweiten Quellenwerte geprüft, einschließlich Prozessneustart:
[zusätzlicher nativer Nachweis](evidence/sector-structure-readiness.json).

Alle 66 nativen globalen Downloads und 594 anschließende Offline-Antworten
bestanden. Der Cache enthielt 505.412 numerische Werte; die insgesamt 945.252
gespeicherten Jahreszeilen enthalten auch fehlende Werte. Mindestens eine
Statistik hat Werte für 217 zugeordnete Gebiete einschließlich Welt. Das ist
keine vollständige Abdeckung aller Reihen oder aller Atlasgebiete.

| Gebiet      | Reihen mit mindestens einem Wert | Davon letzter Wert 2023 oder neuer |
| ----------- | -------------------------------: | ---------------------------------: |
| Deutschland |                               65 |                                 55 |
| USA         |                               65 |                                 45 |
| Indien      |                               66 |                                 53 |
| China       |                               65 |                                 52 |
| Nigeria     |                               63 |                                 44 |

Für Deutschland und USA fehlen Alphabetisierungswerte; für China fehlt die
sicher bewirtschaftete Trinkwasserversorgung. Die alten chinesischen
Sekundarstufenreihen werden durch die Erweiterung nicht automatisch aktuell.
Das WDI-Sammelgebiet `CHI` ist noch nicht zugeordnet: Werte der Kanalinseln
dürfen weder Jersey noch Guernsey allein zugeschlagen werden. Dieser Fall ist
im [weltweiten Abdeckungsprotokoll](evidence/statistics-coverage.json) ausdrücklich
festgehalten. Quellaggregate anderer Geografien werden nicht selbst summiert.

Der [unabhängige Abgleich](evidence/statistics-independent-check.json) bestätigte
20.464 numerische Werte exakt, 12.800 fehlende Werte und alle 33.264
Quellkennzeichen. Darunter sind 192 echte Nullen und 397 negative Werte.
`probe_statistics.py` kann die öffentliche Stichprobe erneut herunterladen;
`check_statistics.py` vergleicht sie mit den nativen Prüfsnapshots. Ein neuer
Abruf kann wegen Quellenrevisionen einen erneuten passenden nativen Stand benötigen.

55 gezielte Frontendtests, 31 deterministische Rust-Tests, Typecheck, Build,
ESLint, Clippy und Rust-Formatprüfung bestanden. Die echte Tauri-App
initialisierte unter separater Testkennung mit Atlasmigrationen 1–5.
Die bekannte Technicals-/EODHD-Intraday-Warnung erschien erneut; keine neue
Atlas-Initialisierungswarnung wurde beobachtet. Der Testprozess wurde beendet.

Die CUA-Browserprüfung nutzte echte native öffentliche Snapshots im originalen
App-Rahmen: Grundbildung Deutschland/USA, Hochschulbildung Indien/China,
deutsche Alphabetisierung ohne Werte, Gesundheitsausgaben samt Tabelle,
Chinas getrennte Trinkwasserkategorien und vereinzelte Gini-Erhebungen in Nigeria.
Bei 1.024 Pixeln mit offener Sidebar blieb das Diagramm innerhalb seiner Karte.
Die Konsole blieb ohne Warnungen und Fehler. Diese Prüfung ersetzt keine
vollständige native Sicht-/Klickabnahme.

Die Länderübersicht wurde ergänzend mit 330 echten nativen Antworten für die
66 Statistiken und Deutschland, USA, Indien, China und Nigeria geprüft.
Indien/China-Bildung zeigte korrekte gemeinsame Zeiträume und Zahlenjahre,
Deutschland/USA-Alphabetisierung blieb ausdrücklich leer. Alle 66 Karten waren
nach 13 Gruppen geordnet erreichbar. Themen-/Gruppenfilter, 20-/40-Jahreswahl,
optionale Zahlen sowie Öffnen per Enter und Rückkehr erhielten die Auswahl.
Bei 1024 und 1440 Pixeln entstand kein horizontaler Seitenüberlauf; die
Browserkonsole blieb ohne Warnungen oder Fehler. Die Prüfansicht verwendete
den originalen App-Rahmen und war als Browser-Vorschau mit nativen öffentlichen
Snapshots gekennzeichnet.

Der explizite Netzwerktest `world_atlas_live_statistics_batch_roundtrip` lud
Gesundheitsausgaben (`SH.XPD.CHEX.GD.ZS`) und Grundschule (`SE.PRM.ENRR`)
über den tatsächlichen asynchronen Sammeldienst weltweit in einen temporären
SQLite-Cache. Beide Statistiken wurden unter einem einzigen Job vollständig
gespeichert; der Fortschritt blieb monoton bei insgesamt zwei Statistiken.
Deutschland und Indien lieferten jeweils mehr als zwanzig numerische Jahre.
Ein erneuter sofortiger Abruf wurde abgewiesen. Nach Offline-Neustart waren
alle vier Antworten einschließlich Quellenmetadaten unverändert. Der Test
bestand in 3,83 Sekunden. Drei deterministische Sammeltests prüfen zusätzlich
Auswahlvalidierung, 24-Stunden-Grenze, gemeinsame Abrufsperre, gezielten Abbruch,
Teilerfolg mit anschließendem Fehler, Erhalt alter Daten und Weiterladen.

Nach dem neuen Sammel-Command initialisierte die reale Tauri-App erneut unter
separater Testkennung; Migrationen 1–5 waren erfolgreich. Die bereits bekannte
Technicals-/EODHD-Intraday-Warnung erschien, keine neue Atlas-Initialisierungswarnung.
Der Testprozess wurde gezielt beendet. Die vollständige native Sicht-/Klickabnahme
und die weiteren Themenfamilien des Gesamtplans bleiben offen.

## Ergänzung vom 11.09.2026: Preisniveau und Kaufkraftvergleiche

Zwei neue WDI-Reihen erweitern die statistische Grundlage auf 93 WDI-Reihen
und den gemeinsamen Katalog einschließlich UN SDG auf 126 Reihen. Der
ergänzende Produktionskatalog enthält jetzt 83 Zuordnungen.

- `PA.NUS.GDP.PLI`: Preisniveau der Gesamtwirtschaft; 204 Länder/Gebiete,
  7.023 Jahreswerte von 1990 bis 2025.
- `PA.NUS.PRVT.PLI`: Preisniveau des privaten Konsums einschließlich NPISH;
  208 Länder/Gebiete, 6.323 Jahreswerte von 1990 bis 2025.

Die USA sind in jedem Jahr die Referenz 100. Die WDI-Revision April 2026
ersetzt die nur noch archivierte Reihe `PA.NUS.PPPC.RF` mit USA = 1. ICP-
Benchmarkwerte werden mithilfe von BIP-Deflatoren beziehungsweise privaten
Verbraucherpreisindizes fortgeschrieben; das sind Modellschätzungen, keine
jährlich neu erhobenen Weltpreisvergleiche. Preisebene, verfügbares Einkommen
und eine vermeintlich faire Wechselkursbewertung bleiben getrennte Aussagen.

Welt besitzt in diesen Originalreihen keine nutzbaren Beobachtungen. Der
Atlas erzeugt keinen Ersatzdurchschnitt. Herkunft und vollständiger Abgleich
stehen in `evidence/purchasing-power-audit.json`; der native Test importiert
beide paginierten Originalreihen und prüft alle 13.346 Zahlen nach erneutem
Öffnen einer temporären SQLite-Datenbank.
