# Weltatlas – lange Zyklen als erklärende Modelle

Stand: 9. September 2026. Die sechs Theorieansichten sind implementiert.
Sie ergänzen die gemessenen beziehungsweise geschätzten Länderreihen; sie
berechnen weder heutige Länderphasen noch eine Unter-/Überbewertung. Die
Gesamtaufgabe bleibt offen, siehe [Umsetzungsstand](IMPLEMENTATION-STATUS.md).

## Bedienung und Bedeutung

Unter **Länder & Themen → Lange Entwicklungen → Zyklusthesen untersuchen**
stehen Konjunktur-, Finanz-, Investitions- und Innovationswellen sowie
Kondratjew-Hypothesen und säkulare Zyklen zur Auswahl. Die Themensuche und
**Daten & Quellen** führen ebenfalls zu diesen Ansichten.

Ein Modell startet geschlossen. **Modellbild erkunden** öffnet eine ruhige
Zeichnung mit vier wählbaren Lernschritten. Es gibt keine Animation, Zahlenachse,
Kalenderachse oder automatisch ermittelte aktuelle Phase. Die Beschriftung
**Modellvorstellung · frei gezeichnet** bleibt am Bild sichtbar. Die Breite
eines Abschnitts bedeutet keine feste Dauer. Das säkulare Modell zeigt am
letzten Schritt drei mögliche Entwicklungen statt eines einzigen Endpunkts.

Unter dem Bild stehen Befund und Grenze nebeneinander. Quellen, Geltungsbereich
und Gegenargumente lassen sich zusätzlich öffnen. Die redaktionellen
Erläuterungen und mögliche weitere Prüfungen sind von Quellenbefunden getrennt.
Links öffnen die jeweilige Primärquelle erst durch einen bewussten Klick.

Zwei Kontextlinks je Modell führen zu bestehenden Länderbildern. Gewähltes
Gebiet und Vergleichsgebiet bleiben erhalten; konkrete WDI-Statistikcodes
verhindern den versehentlichen Wechsel zu einer ähnlich benannten Messgröße.
**Zur Zyklusthese zurück** erhält den vorherigen Lernschritt. Der Wechsel des
Landes verändert die Modellzeichnung nicht. Ein Kontextbild bestätigt oder
widerlegt die vorgestellte These nicht automatisch.

## Quellen und Grenzen der sechs Modelle

| Ansicht               | Verwendete Grundlage                                                                                                                                                                                                 | Aussagegrenze                                                                                                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Konjunkturzyklen      | Das NBER datiert US-Wendepunkte rückblickend anhand mehrerer Aktivitätsindikatoren. [NBER-Verfahren](https://www.nber.org/research/business-cycle-dating/business-cycle-dating-procedure-frequently-asked-questions) | Die Zeichnung ist keine Datierung. Schwächeres Jahreswachstum allein bestimmt keine Rezession.                                                                                        |
| Finanzzyklen          | Die BIS-Untersuchung betrachtet insbesondere Kredit und Immobilien in sieben fortgeschrittenen Volkswirtschaften, 1960–2011. [Drehmann, Borio und Tsatsaronis, 2012](https://www.bis.org/publ/work380.pdf)           | Acht bis dreißig Jahre sind dort ein gewähltes Filterband. Daraus folgt kein fester globaler Rhythmus. Der Atlas berechnet noch keine gemeinsame historische Kredit-/Immobilienwelle. |
| Investitionswellen    | Ein theoretisches Modell beschreibt, wie Unsicherheit und irreversible Ausgaben Investitionsentscheidungen verzögern können. [Bernanke, Working Paper 502](https://www.nber.org/papers/w0502)                        | Keine geschätzte universelle Infrastrukturperiode. Das Bild erklärt einen möglichen Ablauf.                                                                                           |
| Innovationswellen     | Ein Literaturüberblick behandelt unterschiedliche Verbreitungsprozesse und S-förmige Modelle der Technologienutzung. [Hall und Khan, 2003](https://www.nber.org/papers/w9730)                                        | Verbreitung, Unternehmensgewinn und Börsenbewertung sind verschiedene Größen. Es gibt keine zugesicherte Wiederholung.                                                                |
| Kondratjew-Hypothesen | Der historische Aufsatz untersucht lange Bewegungen verschiedener Preis- und Wirtschaftsreihen. [Kondratieff, 1935](https://www.jstor.org/stable/1928486)                                                            | Begrenzte historische Daten und Trendbereinigung; keine belastbare Uhr für heutige Länder oder Sektoren.                                                                              |
| Säkulare Zyklen       | Das Modell diskutiert Rückkopplungen historischer Agrargesellschaften, Gegenargumente und unterschiedliche Verläufe. [Turchin und Nefedov, Kapitel 1](https://assets.press.princeton.edu/chapters/s8904.pdf)         | Die Autoren beschreiben ausdrücklich keine strikte Periodizität. Die Zeichnung lässt mehrere Ausgänge offen und gibt keine heutige Länderprognose ab.                                 |

Die methodische Gegenperspektive zur Filterung stützt sich auf
[Hamiltons Untersuchung zum HP-Filter](https://www.nber.org/papers/w23429).
Sie betrifft mögliche künstliche Dynamik und Probleme an Reihenenden. Sie ist
kein direkter empirischer Gegenbeweis gegen jedes hier vorgestellte Modell.

Gelesene Fundstellen und Zugriffsumfang stehen im
[Quellenprotokoll](evidence/cycle-source-review.json). Bei Hall/Khan wurde
zusätzlich die öffentlich bereitgestellte
[Autorenfassung an der UC Berkeley](https://eml.berkeley.edu/~bhhall/papers/HallKhan03%20diffusion.pdf),
Abschnitt II, Seiten 4–7, gelesen. Diese Fassung trägt den Stand November 2002;
die NBER-Veröffentlichung stammt aus Mai 2003. Bei Kondratieff wurden die
Originalseiten 105–106 und 115 im Scan tatsächlich visuell gelesen. Es wurden
keine historischen Diagramme als neue Atlasdaten digitalisiert.

## Technische Invarianten

- `atlas-cycle-hypotheses.ts` enthält sechs redaktionelle Modelle mit stabilen
  Katalog-IDs, vier Lernschritten, Quellen und zwei geprüften Kontextzielen.
- `atlas-cycle-panel.tsx` zeichnet eigenständige SVG-Schemata. Pfadkoordinaten
  sind Bildschirmkoordinaten, keine Messwerte. Die Zeichnung hängt nicht vom
  ausgewählten Land, Kalenderjahr oder einem API-Ergebnis ab.
- `hypothesis` öffnet nur das gerade gewählte, bekannte Modell. `cycleStep`
  nimmt nur bekannte Schritt-IDs an; ungültige Werte wählen den ersten Schritt.
  `fromCycle` wird gegen die vorhandenen Modelle geprüft. Ein neuer Themenwechsel
  räumt einen veralteten Rücksprung auf.
- Das aufklappbare Feld besitzt ein dauerhaftes Ziel für `aria-controls`.
  Schritte verwenden `aria-pressed`, die Erklärung einen Live-Status. Beim
  Öffnen oder Zurückkehren bleibt das Bild unterhalb des festen Seitenkopfs
  sichtbar. Bei 1024 px werden die Schritte zweispaltig angeordnet.
- Die Modellansicht löst keinen Datenabruf aus. In der Quellenübersicht bleiben
  diese Themen ohne angebundene numerische Zyklusreihe. Der neue Modelllink
  ändert weder Quellenfamilien noch statistische Verfügbarkeitszahlen.
- Keine neue Abhängigkeit, kein nativer Command und keine Migration in diesem
  Arbeitsabschnitt. Persönliche Daten und der öffentliche Atlas-Cache bleiben
  getrennt.

## Ergänzte JST-Finanzgeschichte

Die offizielle [JST-Datenbank](https://www.macrohistory.net/database/) bietet
Release 6 mit jährlichen historischen Reihen für 18 fortgeschrittene
Volkswirtschaften seit 1870. Die angegebenen
[Lizenzbedingungen](https://www.macrohistory.net/database/licence-terms/)
nennen CC BY-NC-SA 4.0. Ein kostenloser Abruf hebt diese Bedingungen nicht auf.

Bei der ursprünglichen Prüfung antwortete der direkte offizielle XLSX-Download mit
HTTP 403 und Cloudflare-Fehler 1010. Die normale Browserseite war erreichbar;
der Klick auf **EXCEL** erzeugte ein Download-Ereignis, aber keine über die
verfügbaren Werkzeuge zugängliche und überprüfbare Datei. Deshalb wurden weder
Werte eingelesen noch ein Adapter oder eine lokale Verfügbarkeit behauptet.
Dieser damalige Befund bleibt als Prüfverlauf dokumentiert.

Die erneute Prüfung am 9. September 2026 erhielt die Originaldatei erfolgreich
über die dokumentierte Weiterleitung des offiziellen Downloads. Die
[JST-Finanzgeschichte](MACROHISTORY.md) ist nun separat angebunden: 20 Bilder in
sechs Gruppen, 18 Länder und Quellenjahre 1870–2020. Alle Rohwerte und
Ableitungen sind unabhängig gegen die Arbeitsmappe geprüft. Die Finanzzyklus-
These verlinkt den Bereich; sie erhält dadurch keine automatische aktuelle
Länderphase. Indien, China und Welt bekommen keine stellvertretenden JST-Werte.

## Prüfung dieses Arbeitsabschnitts

Die gezielten Atlas-/Navigationsprüfungen sichern den geschlossenen Einstieg,
gültige Modell-/Schritt-URLs, landesunabhängige Zeichnungen, erhaltene
Vergleichsländer, genaue Statistikziele, Rücksprünge und ausschließlich lesende
Quellenübersichten. Die sechs Modelle müssen exakt den vorhandenen sechs
Katalogthemen entsprechen. Jeder Kontextlink muss eine wirklich angebundene
Perspektive und bei WDI die passende Statistik-ID treffen.

Die tatsächliche Browser-Sichtprüfung verwendete die vollständige App-Shell
und vorhandene native öffentliche Daten-Snapshots in einer ignorierten lokalen
Prüfansicht. Geprüft wurden alle sechs Modelle, Tastaturöffnung, Quellen,
Schrittwechsel und der Weg vom Kondratjew-Modell zum historischen
Indien-/China-Vergleich und zurück. Der Lernschritt blieb erhalten.
Bei 1024 × 720 und 1440 × 900 px entstand kein horizontaler Überlauf;
die Jahrhundertansicht zeigte mehrere mögliche Ausgänge. Die Browserkonsole
blieb ohne Warnungen oder Fehler. Dies ist keine neue native Gesamt-Abnahme.

Die Ergebnisse der abschließenden automatisierten Prüfungen sind im
[Umsetzungsstand](IMPLEMENTATION-STATUS.md#frontend-und-bedienung) zusammengeführt.

## Ergänzte empirische Kreditperspektive

Die Finanzzyklusthese verlinkt inzwischen auch die [BIS-Kreditbilder](CREDIT.md).
Ihre veröffentlichten Modellabstände sind echte Quellenreihen für konkrete
Gebiete. Sie ordnen dem frei gezeichneten Lernmodell weiterhin keine heutige
Phase zu und bilden noch keinen gemeinsamen Kredit-/Immobilienzyklus.

Das Finanzzyklusmodell verlinkt inzwischen auch die [BIS-Immobilienbilder](PROPERTY.md). Reale Preisverläufe und veröffentlichte Vorjahresänderungen bestimmen keine heutige Modellphase; historische Quellenwechsel bleiben als Grenze sichtbar.
