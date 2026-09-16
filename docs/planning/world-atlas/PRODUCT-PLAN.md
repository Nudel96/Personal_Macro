# Weltatlas – Produkt, Ordnung und visuelle Verständlichkeit

Stand: 8. September 2026. Vorgeschlagener Produktname: **Weltatlas**.
Route: `/world-atlas`. Dieses Dokument ist eine Implementierungsgrundlage,
keine Behauptung bereits vorhandener Funktionalität.

## 1. Zweck und Leitbild

Die Oberfläche soll Zusammenhänge zwischen Ländern, Sektoren, Menschen,
Ressourcen und langfristigen Veränderungen leicht erkennbar machen. Ein Blick
beantwortet zunächst: Was verändert sich? In welche Richtung? Wie verläuft das
im Vergleich zu früher oder zu einer anderen Region?

Die persönliche Vorstellung von Gleichgewicht und Gegenpolen wird als
Bildsprache respektiert. Gegensätze wie Aufbau/Abbau, Beschleunigung/Abbremsung
und historisch hoch/niedrig können die Orientierung unterstützen. Aus dieser
Bildsprache wird kein wissenschaftliches Gesetz abgeleitet. Nicht jede
Entwicklung hat eine natürliche Mitte oder kehrt regelmäßig dorthin zurück.

Ein niedriger Marktpreis, eine niedrige Geburtenrate und ein niedriger
Schuldendienst bedeuten Unterschiedliches. Das Produkt behandelt sie daher
nicht als dieselbe Art von Minus. Auch Länder, Altersgruppen und Menschen
bekommen keine pauschalen Gut-/Schlecht-Bewertungen.

## 2. Weltabdeckung und Ordnung

### Regionen sind eine eigene Dimension

Grundlage ist das [UN-M49-Verzeichnis](https://unstats.un.org/unsd/methodology/m49/overview/).
Der echte Snapshot steht in `catalogs/geographies.json`. Welt → Großregion →
Unterregion → statistisches Gebiet ist die hierarchische Navigation. Europa,
Amerika, Asien, Afrika und Ozeanien werden vollständig geführt; Antarktis wird
als geografischer Sonderfall ohne erfundene Volkswirtschaft eingeordnet.

Alle im Quellverzeichnis enthaltenen Gebiete erscheinen im Katalog, auch wenn
ein Thema dort keine Daten besitzt. Deutschland, USA, Indien und China sind
gleichberechtigte Einträge desselben Systems, keine fest programmierten
Sonderseiten. Die deutsche Suche versteht außerdem gängige Namensvarianten.
Bei „Amerika“ werden die Region und „USA“ getrennt angeboten.

EU, Eurozone, OECD, BRICS, Einkommensgruppen und frei angelegte Vergleiche sind
zusätzliche Gruppen mit versionierter Mitgliedschaft. Sie ersetzen die
Geografie nicht und werden niemals gleichzeitig mit ihren Mitgliedsländern
in eine Summe aufgenommen. Anbietergebiete ohne M49-Entsprechung erhalten
explizite eigene Identitäten und neutrale Bezeichnungen. Dazu gehören auch
Sonderfälle historischer Grenzen und abweichender statistischer Gebiete.

China, Hongkong und Macau dürfen nicht ungeprüft zusammengeführt werden.
Historische Reihen zu Deutschland müssen ihren Gebietsstand erklären.
Taiwan- oder Kosovo-Reihen eines Providers werden mit dokumentierter
Provideridentität erhalten, unabhängig davon, ob der M49-Snapshot sie separat
führt. Kartenumrisse sind Orientierung, keine Aussage über staatliche Ansprüche.

### Themen sind die zweite Dimension

Der maschinenlesbare Katalog enthält acht Hauptfelder. Untergruppen bleiben
alphabetisch geordnet; Favoriten verändern diese Ordnung nicht automatisch.

| Hauptfeld | Enthaltene Bereiche |
| --- | --- |
| Menschen | Demografie, Bildung, Gesundheit/Pflege, Arbeit/Einkommen |
| Wirtschaft & Kapital | Wohlstand, Produktion/Konsum/Investitionen, Finanzsystem, Schulden, Marktlage/Bewertung |
| Energie | Stromerzeugung, Solar/Wind/Kernenergie, Öl/Gas/Wasserstoff, Netze/Speicher/Effizienz |
| Produktion & Ressourcen | Industrie, Materialien/Bergbau, Kreislaufwirtschaft, Landwirtschaft, Ernährung/Wasser |
| Technologie & Wissen | Kommunikation, Software/Halbleiter, Forschung, KI/Robotik, Patente und Verbreitung |
| Leben & Versorgung | Wohnen/Immobilien, Konsum/Dienstleistungen, Mobilität/Infrastruktur |
| Weltverbindungen & Umwelt | Handel/Lieferketten, Institutionen/Gesellschaft, Klima und Ressourcenbelastung |
| Lange Entwicklungen | Strukturwandel, Generationen, historische Jahrhundertperspektiven, separat gekennzeichnete Zyklusthesen |

Die eigene Taxonomie beschreibt sowohl börsennotierte Branchen als auch
Realwirtschaft. Standardsektoren wie Finanzen, Versorger, Kommunikation,
Gesundheit, Industrie, Materialien, Energie, Konsum, Immobilien und Technologie
sind darin enthalten. Themen wie Wasserstoff können quer zu mehreren Branchen
liegen. Explizite, versionierte Querverweise vermeiden doppelte Summen.

Der Katalog ist offen erweiterbar. Erzeugt wird jedoch kein vermeintlich
abgedecktes kartesisches Produkt aus allen Gebieten und Themen. Erst eine
konkret geprüfte Reihe begründet Verfügbarkeit.

## 3. Zwei gleichwertige Einstiege

1. **Region erkunden:** Welt → Asien → Indien → Bildung → Entwicklung oder
   Marktlage. „Bildungszugang“ und „Bewertung privater Bildungsunternehmen“
   bleiben zwei erkennbare Fragen innerhalb desselben Themenbereichs.
2. **Thema vergleichen:** Energie → Solar → mehrere afrikanische Länder.
   Anfangs erscheinen gleiche physische Maße, etwa Kapazität oder Erzeugungsanteil.
   Ein Wechsel zur Börsenperspektive zeigt nur tatsächlich passende Marktmaße.

Eine Karte ergänzt die sortierte Liste. Kleine Staaten und Gebiete bleiben
über Suche/Liste erreichbar. Die Flächengröße eines Landes wird nicht als
wirtschaftliche Bedeutung verwendet. Eine ausgewählte Kartenkennzahl nutzt
eine gemeinsame Skala und kennzeichnet fehlende Daten durch Muster plus Text.

## 4. Bildsprache passend zur Frage

| Frage | Hauptdarstellung | Bedeutung der Mitte |
| --- | --- | --- |
| Wo liegt ein Sektormarkt im eigenen langfristigen Verlauf? | Ruhige Welle mit aktuellem Punkt und Richtung | Dokumentierter eigener Trend beziehungsweise historische Referenz |
| Ist ein Sektor historisch teuer oder günstig bewertet? | Bewertungsband und geglätteter Verlauf | Eigene vergleichbare Bewertungsverteilung, kein bewiesener fairer Wert |
| Wie verändert sich eine Bevölkerung? | Entwicklungslinie und Altersstruktur | Keine künstliche Gleichgewichtsmitte |
| Welche Generationen rücken nach? | Kohortenbild oder Altersprofil mit frei wählbarem Zeitpunkt | Gemeinsame Altersgruppen; Absolut- und Anteilsansicht getrennt |
| Wie setzt sich die Energieversorgung zusammen? | Gestapelte Anteile und zeitlicher Übergang | Vollständiger gemeinsamer Nenner, expliziter Rest/Unbekannt |
| Wie verteilt sich wirtschaftliche Aktivität? | Vergleichbare Flächen/Balken und Verlauf | Gleiche Einheit, Kaufkraftbasis und Bezugsgröße |
| Wie stark sind Länder miteinander verbunden? | Wenige ausgewählte Verbindungen mit gerichteten Flüssen | Flussart und -richtung, keine Gesamtbewertung |
| Was änderte sich über ein Jahrhundert? | Lange Zeitleiste mit Beobachtungen, Datenlücken und belegten Ereignissen | Keine automatisch wiederkehrende Periode |
| Was könnte künftig geschehen? | Optionaler Szenariobereich mit Band oder Varianten | Bedingte Projektion, keine beobachtete Zukunft |

Einheitliche visuelle Grammatik: durchgezogen = veröffentlichte Vergangenheit;
eine zusätzliche Kennzeichnung erklärt, ob gemessen, geschätzt oder rekonstruiert.
Projektionen erscheinen nach einer klaren Grenzmarke gestrichelt; belegte
Unsicherheitsbereiche dürfen als Band hinzukommen. Unsicherheit wird nie aus
ästhetischen Gründen erfunden. Eine leere Kurve bedeutet fehlende Grundlage.

Richtung, Höhe und Verlässlichkeit bleiben drei getrennte Eigenschaften.
Historisch niedrig/steigend ist ein anderer Zustand als niedrig/fallend.
Mehrere Länder mit unterschiedlichen Datenständen bekommen keine gemeinsame
„heute“-Marke, wenn tatsächlich verschiedene Jahre verglichen werden.

## 5. Bedienung mit wenig Zahlen und wenig Ablenkung

Die Grundeinstellung heißt **Bildansicht**. Es gibt keine diagnosebezogenen
Einstellungen oder gespeicherten medizinischen Angaben. Die Präferenz wird als
normale Darstellungseinstellung umgesetzt.

- Zuerst eine Hauptgrafik und eine kurze Erklärung mit höchstens zwei Sätzen.
- Acht Themenfelder auf der Übersicht, anschließend schrittweise Untergruppen.
  Keine Wand aus allen Katalogthemen und Kurven gleichzeitig.
- Pro Vergleich zunächst zwei, höchstens vier bewusst ausgewählte Reihen.
  Mehr Auswahl ist im geordneten Verzeichnis möglich.
- Zahlenwerte sind standardmäßig zurückhaltend. Zeitbezug, Gegenstand,
  Datenstatus und Bedeutung bleiben immer sichtbar. „Details“ öffnet Werte,
  Einheiten, Quelle, Zeitraum und Berechnung.
- Icons stehen neben verständlichen Wörtern. Farbe allein trägt keine Aussage.
- Stabile Anordnung, nachvollziehbare Zurück-Navigation, sichtbarer Pfad,
  gespeicherte letzte Ansicht und freiwillige Favoriten.
- Keine automatisch wechselnden Rankings, blinkenden Meldungen, laufenden
  Animationen, Zeitlimits oder gamifizierten Dringlichkeitssignale.
- Ein Datumsschieber für Altersstruktur/Szenarien bewegt sich nur durch eigene
  Eingabe. Keine automatische Zeitreise.
- Tastaturbedienung, gut sichtbarer Fokus, ausreichende Kontraste,
  `prefers-reduced-motion` und textliche Bildalternativen sind Pflicht.

Diese Entscheidungen orientieren sich unter anderem an den W3C-Hinweisen
[Fokus unterstützen](https://www.w3.org/WAI/WCAG2/supplemental/objectives/o5-user-focus/)
und [Informationsmenge begrenzen](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o5p03-manageable-quantity/).
Sie sind Gestaltungsvorgaben für diesen Nutzerwunsch, keine medizinische
Wirksamkeitsbehauptung.

Die App behält ihre Desktop-Mindestbreite. Der Atlas erhält innerhalb des
vorhandenen Navy-Designsystems eine ruhigere Bildansicht, ohne die Dichte der
Journal-, Handels- oder Heatmap-Seiten global zu ändern.

## 6. Lange Zeiträume und Jahrhundertzyklen

Es gibt die Horizonte **Marktphase**, **Langfristig**, **Generationen** und
**Jahrhundertperspektive**. Die tatsächliche Historie bleibt der Maßstab; eine
Auswahl verlängert keine vorhandene Reihe künstlich. Im Detail sind konkrete
Jahre wählbar. Eine Serie kann länger als ein Jahrhundert sein, ohne zyklisch zu sein.

### Historisch beobachtbare Entwicklung

Bevölkerungsübergänge, Urbanisierung, Produktivität, Energie- und
Wirtschaftsstruktur lassen sich über Jahrzehnte beschreiben. WPP liefert
demografische Schätzungen ab 1950 und Projektionen bis 2100; beide Teile bleiben
getrennt. Jahrhundertperspektiven stützen sich unter anderem auf Maddison und
die JST-Makrohistorie. JST deckt ausdrücklich ausgewählte entwickelte
Volkswirtschaften ab und darf nicht auf den Rest der Welt übertragen werden.

### Empirisch untersuchbare Schwankungen

Kredit- und Immobilienzyklen können über längere Perioden untersucht werden.
Die BIS diskutiert Unterschiede zwischen Konjunktur- und Finanzzyklen; daraus
folgt kein überall gleich langer Takt. Das Atlasmodell zeigt reale Verläufe und
kennt die Abhängigkeit des Ergebnisses von Daten und Glättung.

### Historische Zyklusthesen

Kondratjew-, Innovations-, Infrastruktur- und säkulare Zyklusthesen erhalten
einen optionalen, standardmäßig geschlossenen Bereich. Jede Karte nennt These,
Autor/Quelle, betrachtete Länder und Zeitspanne, Gegenargumente und Evidenzgrenzen.
Ein theoretisches Schema ist als **Modellvorstellung** beschriftet.

Es gibt keine automatische Anzeige „wir befinden uns in Jahr X eines
Jahrhundertzyklus“, keine auslaufende Krisenuhr und keinen vorhergesagten
unvermeidlichen Umschwung. Politische oder demografische Entwicklungen werden
nicht als zwangsläufiges Schicksal dargestellt.

Eine spätere statistische Zyklusanalyse benötigt mehrere beobachtete
Wiederholungen, Sensitivitätsanalysen gegenüber Fenster/Trendfilter,
Vergleiche mit nichtzyklischen Referenzprozessen und Korrektur für viele
gleichzeitig geprüfte Perioden. Drei vermeintliche Wiederholungen allein
beweisen keinen Zyklus. Ist die Geschichte zu kurz oder lückenhaft, bleibt es
bei einer historischen Darstellung oder gekennzeichneten Hypothese.

## 7. Die ausdrücklich genannten Beispiele

**Bildung in Indien:** Bildungsbeteiligung, Bevölkerung im Schulalter,
Ausgaben, Lehrkräfte und Ergebnisse bilden das realwirtschaftliche Bild.
Private Bildungsunternehmen sind eine eigene Marktperspektive. Die geprüfte
WDI-Reihe allein hat Lücken; UNESCO-Daten müssen vor einer aktuellen
Länderübersicht überprüft werden.

**Solar in Afrika:** Länderweise Kapazität, tatsächliche Erzeugung, Ausbau und
Stromzugang. Kapazität ist keine Erzeugung und Ausbau keine Unterbewertung.
Ein Gesamtbild Afrika braucht ein korrekt gewichtetes Aggregat samt Abdeckung.
Ein globaler Solar-ETF wird niemals als afrikanischer Solarmarkt umbenannt.

**Wasserstoff:** Eigene Marktthemen neben physischen Indikatoren, soweit
verlässlich vorhanden. Junge Fonds und wechselnde Begriffe/Technologien
begrenzen die Historie. Fehlende alte Daten werden nicht rückwirkend erfunden.

**Kernenergie:** Erzeugung, Kapazität, Neubau/Stilllegung, Betreiber,
Ausrüster und Uran werden unterscheidbar. Ein Uranpreis oder Uranminenfonds
ist kein vollständiger Kernenergie-Sektor.

**Deutschland, USA, Indien, China:** Gemeinsam auswählbare Länder mit
vergleichbarer Demografie, Wirtschaftsstruktur und passenden Marktansichten.
Bei unterschiedlichen statistischen Definitionen wird Vergleichbarkeit erklärt
oder der direkte Vergleich begrenzt, statt Einheiten still anzugleichen.

## 8. Zusammenhänge und eigene Notizen

Eine spätere Zusammenhangsansicht darf beispielsweise Demografie, Bildung und
Arbeitsmarkt gemeinsam zeigen. Verbindungspfeile sind entweder beschreibende
Verknüpfungen oder belegte Wirkmechanismen und entsprechend bezeichnet.
Korrelation oder zeitliche Nähe begründen keine Kausalität.

Eigene Beobachtungen können lokal an eine Ansicht angeheftet werden. Sie bleiben
als persönliche Notiz kenntlich und verändern weder Messwerte noch die
Berechnung. Die Spiritualität des Nutzers muss dafür nicht in einem Profil oder
an einen externen Dienst übermittelt werden.

## 9. Grenzen des Endprodukts

Weltweite Navigation, zahlreiche Wirtschaftsbereiche und die verfügbare
Ländervielfalt gehören zum Endziel. Eine nicht verfügbare Zahl darf trotzdem
nicht erfunden werden. Dokumentierte echte Datenlücken sind ein zulässiger
Produktzustand; nicht untersuchte Länder oder Themen werden nicht als
„datenlos“ abgehakt.

Das Produkt führt keine Orders aus, kauft keine Datenabos und erzeugt keine
automatischen Anlageempfehlungen. Es übersetzt eine überprüfbare Datenbasis in
ein einfaches Bild, in dem der Nutzer selbst Zusammenhänge erkunden kann.
