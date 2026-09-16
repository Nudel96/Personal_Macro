# Quellen-Erweiterung: Abnahme vom 10. September 2026

## Beauftragtes Ergebnis

Viele bislang leere Länder- und Sektoransichten mit überprüften öffentlichen
Quellen und tatsächlich lokal gespeicherten Inhalten ergänzen. Keine neue
kostenpflichtige Pflichtanbindung. Vorhandene EODHD-Marktreihen dürfen den
bereits konfigurierten Zugang verwenden.

## Funktionelle und visuelle Abnahme

| Aussage / Bedienung | Funktionsprüfung | Sichtprüfung / Beleg |
| --- | --- | --- |
| Vorhandene Quellen tatsächlich lokal | Vollständiger Abruf durch native Adapter; Paketanzahl direkt aus öffentlichem Atlas-Cache | Native Länderbilder nach Neustart |
| 33 UN-SDG-Perspektiven für 17 Themen | Quellenstand, Dimensionen, M49-Gebiete, Originaleinheit, endliche Zahlen, Duplikate, 2025-Grenze; temporärer SQLite-Roundtrip | Recycling, Tourismus, Energiefinanzierung und Armutsansicht |
| Einzelne Erhebungen bleiben einzelne Punkte | SVG- und ECharts-Modelltests | Recycling in der Einzelansicht und Länderübersicht |
| Zahlen bleiben optional | Umschalten inklusive Quellenpunkt-Hinweisen | Ansicht ohne Zahlen und mit Zahlen/Einheiten |
| Nationale Armutsgrenzen werden nicht zwischen Ländern gleichgesetzt | Vergleich im Modell abgewiesen; Primärland bleibt sichtbar | Aktiver Vergleich, nationale Armutsgrenze |
| 65+ auch aus vorhandenem UN-Altersprofil | Summe aller Altersbänder ab 65; Schätzungen und Projektionen getrennt | Quellenwechsel im selben Gebiet; Szenario ausgeschaltet |
| Gesamtabruf fehlender Datenpakete | Bestehendes überspringen, globale Sperre, Fehlerfortsetzung, Stopp zwischen Paketen, Wiederaufnahme | Ladebutton, Fortschritt, Stopp und Ergebnis in isolierter nativer App |
| Ehrliche Quellenlücken | Kein Ersatzland, kein erfundener Nullwert | SDG ohne Länderwerte und fremde Quellenregion |
| Desktop-Darstellung | Native Tauri-WebView2, getrenntes Profil | Startgröße und Mindestbreite 1024; Diagramm, Navigation, Quellenangaben |

Explorative Fälle: Länderwechsel bei aktiver Vergleichsauswahl; Wechsel zwischen
einem verfügbaren und einem fehlenden SDG-Länderbild; wiederholter Gesamtabruf;
Stopp und erneuter Start. Journal-Tests verwenden ausschließlich das isolierte
Profil. Für die UI darf nur der öffentliche Atlas-Cache über SQLite-Backup in
dieses Profil übernommen werden, niemals die persönliche Journal-Datenbank.

## Tatsächlicher lokaler Datenbestand

Der öffentliche Atlas-Cache enthielt vorher neun Quellenpakete. Zwei native
Gesamtabrufe ergänzten **175 fehlende Pakete ohne fehlgeschlagenen Abruf**.
Jetzt sind **184 Pakete** gespeichert:

| Paketart | Anzahl | Inhalt |
| --- | ---: | --- |
| Statistiken | 124 | 91 WDI-Reihen und 33 neue UN-SDG-Perspektiven |
| Marktprofile | 26 | Bestehendes EODHD; Länder, US-Sektoren und globale Energiethemen |
| Veröffentlichte Bewertungen | 16 | Geprüfte NYU-Quellenpakete |
| Weitere Quellenpakete | 18 | UN-Demografie und Haushalte, Ember, IRENA, UNESCO, WHO, ILO, WIPO, FAO, Weltbank-Rohstoffe, Findex, Maddison, JST, IMF, BIS und OECD |

Die Abrufe wurden um 20:34 und 21:10 UTC abgeschlossen. Paketanzahlen und
native Job-Ergebnisse stehen in [library-fill-2026-09-10.json](evidence/library-fill-2026-09-10.json).
Das ist ein Nachweis tatsächlich gespeicherter öffentlicher Daten. Ein Paket
bedeutet weder ein Land noch eine vollständige Abdeckung jedes Themas.

Die SDG-Erweiterung liefert **79.911 endliche numerische Länderjahre** und erhält
278 originale `NaN`-Marker ohne Ersatzwert. Ihre 33 Perspektiven verteilen sich
auf 17 Themen; zwölf bislang ausschließlich recherchierte Themen besitzen damit
erstmals einen direkten Datenpfad. Release, Originalseiten und Quellenkennzeichen
sind im [SDG-Nachweis](SDG.md) und im unabhängigen
[Quellenaudit](evidence/sdg-expansion-audit.json) dokumentiert.

Der aktuelle [Routentest](evidence/topic-route-audit.json) zählt 195 Themen mit
mindestens einem numerischen Datenpfad, 14 Kontexteinstiege, 40 verbleibende
Quelleneinstiege und sechs Theorieansichten. Alle 255 Themen sind erreichbar.
**Die 40 Quelleneinstiege haben weiterhin keine eigene numerische Anbindung.**
Auch bei angebundenen Themen kann die ausgewählte Quelle ein Land oder bestimmte
Jahre nicht enthalten. Es wird keine Vollabdeckung behauptet.

## Automatisierte Prüfung

- Atlas-Frontend: **276 Tests in 40 Dateien bestanden**, vollständiger Lauf am
  10.09.2026 um 23:18 Ortszeit. Darunter Quellenidentität, Darstellungsmaßstäbe,
  einzelne Erhebungen, fehlende Länderwerte, 65+, Merkkontext und Gesamtabruf.
- UN-SDG in Rust: zwei reguläre Prüfungen und der vollständige lokale Release-
  Roundtrip bestanden. Alle 33 Ausschnitte wurden erneut aus den Originalseiten
  verarbeitet, in temporärer SQLite gespeichert und nach erneutem Öffnen geprüft.
  Abgewiesen werden unter anderem geänderte Gebiets-/Quellennamen, Einheiten,
  Dimensionen, doppelte Länderjahre, unzulässige Formate und ungeprüfte Releases.
- Native Gesamtabrufe: zwei Tests bestanden für vorhandene Pakete, globale
  Abrufsperre, ausdrückliche Marktfreigabe, Fehlerfortsetzung, Paketgrenzen beim
  Abbruch und Wiederaufnahme nach erneutem Öffnen.
- Gezieltes ESLint, Rust-Clippy und Formatprüfung der geänderten Atlas-Rustdateien
  bestanden. Die globale Rust-Formatprüfung betraf zusätzlich unformatierte
  Dateien der parallel bearbeiteten Kontofunktion; diese wurden hier nicht umformatiert.
- Der vollständige Routentest vom 10.09.2026 findet keine unaufgelösten Themen
  und keinen Quellen-Einstieg, der eine bereits angebundene numerische Route verdeckt.
- Vollständiger TypeScript-Check und Vite-Produktionsbuild bestanden. Der
  bekannte Vite-Hinweis auf größere JavaScript-Chunks bleibt bestehen.

## Native Bedienung und Sichtprüfung

Die Prüfung lief in einer echten Tauri-WebView2-App mit eigenem Identifier
`com.personal-macro.atlas-expansion-20260910`. Nur der öffentliche Atlas-Cache
wurde über SQLite-Backup übernommen. Die persönliche Journal-Datenbank wurde
für diese Arbeit weder geöffnet, kopiert noch verändert.

Erfolgreich durch normale UI-Bedienung geprüft:

1. **Afrika · UN-Region, Anteil 65+:** Der nicht unterstützte WDI-Gebietsaufruf
   bietet das vorhandene UN-Altersprofil desselben Gebiets an. Der bewusste
   Wechsel zeigt die 65+-Entwicklung 1950–2023, ohne eingeschaltetes Szenario und
   ohne Ersatzland. [Sichtbeleg](../../../output/atlas-expansion-2026-09-10/qa-africa-65-un.jpg).
2. **Deutschland, Recycling:** Erhebungsjahre erscheinen als Punkte. Bei einem
   Vergleich ohne indische Werte bleibt Deutschland sichtbar und der fehlende
   Vergleich wird erklärt. Der Zahlenmodus zeigt Einheiten und originale
   Eurostat-Angaben je Jahr. [Quellenhinweise](../../../output/atlas-expansion-2026-09-10/qa-source-notes.jpg).
3. **Indien, nationale Armutsquote:** Bei aktivem China-Vergleich wird nur das
   Erstland gezeichnet. Unterschiedliche Armutsgrenzen werden erklärt; es bleibt
   keine dauerhafte Ladeanzeige zurück. Bei 1024 px Fensterbreite kein horizontaler
   Überlauf nach Größenanpassung des Diagramms: Client- und Inhaltsbreite 1015 px.
   [Mindestbreite](../../../output/atlas-expansion-2026-09-10/qa-poverty-1024-final.jpg).
4. **Deutschland/Indien, Tourismus:** Beide verfügbaren Länderbilder teilen
   Zeitraum und Maßstab. Schnelle aufeinanderfolgende Länder-, Vergleichs- und
   Themenwechsel behalten die neueste Auswahl in URL und Bild. Der Hinweis auf
   mögliche touristische Bruttowertschöpfung als Proxy bleibt sichtbar.
5. **Kenia, Solarfinanzierung:** 25 Originalbeobachtungen von 2000 bis 2024;
   konstante Dollar 2023 und Finanzierungszusagen bleiben erklärt. Einzelbild und
   Länderübersicht stimmen überein; in der Übersicht werden 25 unverbundene
   Punkte gezeichnet. Der Kartenklick öffnet genau dieselbe Reihe und dasselbe Land.
   [Einzelbild](../../../output/atlas-expansion-2026-09-10/qa-kenya-solar-finance.jpg),
   [Übersicht](../../../output/atlas-expansion-2026-09-10/qa-energy-overview.jpg).
6. **Gesamtabruf:** Ein echter Testlauf mit 21 fehlenden Paketen wurde direkt
   nach Beginn gestoppt. Das erste Paket wurde atomar gespeichert; danach endete
   der Lauf mit 1/21. Status und Teilerfolg blieben nach Neustart erhalten.
   Beim späteren vollständigen Cache zeigt ein erneuter Start korrekt, dass alle
   angebundenen Pakete bereits lokal vorhanden sind.
7. **Daten & Quellen, Kenia:** 22 Quellenfamilien werden anhand der lokalen
   Werte angezeigt. Fehlende BIS-/OECD-Landesprofile behalten ihren tatsächlichen
   Status, obwohl andere Familien bereits Daten liefern.
8. **Marktübersicht:** Alle 26 geladenen Fondsprofile werden lokal gelesen.
   Im Filter für globale Energiethemen besitzen drei Profile ein Wellenbild;
   Wasserstoff bleibt wegen zu kurzer Historie ausdrücklich ohne nutzbare Welle.
   [Sichtbeleg](../../../output/atlas-expansion-2026-09-10/qa-energy-markets-final.jpg).

Startgröße und Mindestbreite wurden getrennt geprüft. In den geprüften Ansichten
keine abgeschnittenen Titel, überdeckten Bedienelemente oder dauerhaft überlaufenden
Diagramme. Zahlen lassen sich ausblenden; Einheiten und Bedeutungen bleiben
erreichbar. Im abschließenden nativen Durchgang keine JavaScript-Seitenfehler.

Die eigens gestartete Prüfapp und der Entwicklungsserver wurden anschließend
beendet; Ports 5188 und 9236 sind frei. Die vorher bereits laufende persönliche
App blieb geöffnet.

## Windows-Artefakt

Der reguläre Tauri-Build mit dem produktiven Identifier `com.personal-macro.app`
und eingebettetem Frontend ist erfolgreich abgeschlossen:

```powershell
pnpm exec tauri build --target x86_64-pc-windows-msvc --no-bundle
```

- Artefakt: `apps/desktop/src-tauri/target/x86_64-pc-windows-msvc/release/personal-macro-desktop.exe`.
- Größe: 48.599.552 Bytes; Dateistand 10.09.2026, 23:50 Ortszeit.
- SHA-256: `3534225a0798d8229d7974cb9301339862418641c075dc0f80b703065f5dc79c`.
- Regulärer optimierter Windows-Build; kein neues Installationspaket.
- Die gemeldeten Linkerhinweise betreffen erzeugte Bibliotheks-/Exportdateien;
  kein Kompilierungsfehler. Der bestehende Identifier-Hinweis betrifft macOS.

Das separate Target-Verzeichnis lässt die bereits geöffnete persönliche App
weiterlaufen. `START-MACROTOOL.cmd` wählt die neuere vorhandene Release-Datei;
diese Auswahl wurde ohne App-Start geprüft. Die bestehende Prüfung auf neuere
Quelldateien bleibt aktiv. Parallel fortgesetzte Konto-/Dashboardänderungen
können deshalb beim nächsten Start einen weiteren Build auslösen. Die beim
Zwischenstand aufgetretenen TypeScript-Fehler waren beim erfolgreichen regulären
Build bereits behoben. Der eigene Atlas-Stand wurde danach nicht mehr geändert.

## Verbleibende Grenzen

Die vollständige Quellenbibliothek ist geladen; das schließt keine bislang
unimplementierten Datenadapter ein. Für die 40 übrigen Quellen-Themen sind
teilweise bereits öffentliche Kandidaten bekannt, beispielsweise BIS-
Schuldendienst und historische IEA-Elektromobilität. Deren genaue Definitionen,
Gebiete und Langzeithistorien benötigen noch einen eigenen validierten Import.

249 SDG-Gebietszuordnungen bedeuten keine 249 vollständigen Länderbilder je
Messgröße. Einige Verkehrsreihen enthalten im geprüften Ausschnitt nur fünf
Jahre eines Landes. Quellenregionen und globale Fonds sind keine Ersatzwerte für
einzelne Länder. Statistischer Aufschwung, Kurslage, fundamentale Bewertung und
theoretische Zyklen bleiben getrennte Aussagen.
