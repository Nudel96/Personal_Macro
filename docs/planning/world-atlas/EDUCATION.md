# Bildungsbilder · UNESCO UIS

Stand: 9. September 2026. Dieser Abschnitt ist implementiert; der gesamte
Weltatlas bleibt im Ausbau.

Unter **Menschen → Bildung** ergänzen 40 UIS-Perspektiven die bestehenden
WDI-Reihen und die getrennten NYU-Bewertungen privater Bildungsunternehmen.
Elf Bildungsgruppen erhalten Zugang, Abschlüsse, Alphabetisierung,
Hochschulbeteiligung, berufliche Bildung, Weiterbildung, Lernstandstests,
Lehrkräfte, öffentliche Ausgaben und Schulausstattung. Private Bildungswirtschaft
wird nicht aus öffentlichen Schulstatistiken bewertet.

## Bedienung und Bildbedeutung

Die Auswahl „Bildungsperspektive“ wechselt zwischen ausdrücklich benannten
Messgrößen. Der gesamte verfügbare Zeitraum ist voreingestellt; alternativ
lassen sich Jahre seit 2000 oder 2010 betrachten. Zahlen und Erhebungsdetails
sind optional. Höher bedeutet mehr von der jeweiligen Größe. Bei Kindern ohne
Schulbesuch bedeutet höher beispielsweise mehr Ausschluss, keine Verbesserung.

- Haushaltserhebungen und Lernstandstests bleiben einzelne Punkte, auch in
  unmittelbar aufeinanderfolgenden Jahren. Es entsteht keine künstliche Jahreslinie.
- Administrative Statistiken verbinden nur aufeinanderfolgende vorhandene
  Jahre mit gleichen Quellenkennzeichen. Lücken bleiben offen.
- Drei ausdrücklich bezeichnete Abschlussreihen verwenden das veröffentlichte
  UIS-Modell. Sie sind separat von den beobachteten Abschlussreihen auswählbar.
  Es gibt keinen automatischen Ersatz einer fehlenden Erhebung durch ein Modell.
- Rauten kennzeichnen Modellwerte oder ausgewiesene Schätzungen. Geringe
  Zuverlässigkeit laut Quelle wird mit offenen Zeichen sichtbar.
- Prozentanteile teilen beim Vergleich den Maßstab von null bis hundert.
  Die Bruttoquote der Hochschulbeteiligung darf über hundert liegen und wird
  nicht beschnitten. Die BIP-Ausgabenquote besitzt ihren eigenen Maßstab.
- Ein Vergleich benötigt denselben Quellenhash, dasselbe Rezept und gemeinsame
  tatsächliche Erhebungsjahre. Die sichtbare Zeitachse ist der gemeinsame Zeitraum.
  Verschiedene Lernstandstests werden ohne belegte Testgleichheit nicht überlagert.
- Quellenhinweise bleiben pro Erhebung erhalten. Nationale Bildungsstufen,
  Mindestqualifikationen für Lehrer und Erhebungsmethoden können abweichen.

Die Indien-Grundschulabschlussreihe enthält in diesem Stand fünf Erhebungen
zwischen 2005 und 2019. Die letzte zugrunde liegende NFHS-Erhebung umfasst
2019–2021; ein Veröffentlichungsstand von 2026 macht daraus keinen Messwert
für 2026. Die getrennte UIS-Modellreihe liefert jährliche Werte von 1981 bis 2025.

Explizite bestehende `series`-Links zur Weltbank bleiben gültig. Der Quellenwechsel
ist im Bild sichtbar. `educationMetric` und `educationSince` werden zusammen mit
der UIS-Herkunft in gemerkten Ansichten gespeichert. Beim Themenwechsel wird eine
unpassende Bildungsauswahl verworfen.

## Öffentliche Quelle und Abdeckung

Quelle ist der feste [UIS-SDG-Gesamtdownload Februar 2026](https://download.uis.unesco.org/bdds/202602/SDG.zip),
verlinkt auf der [offiziellen Downloadseite](https://databrowser.uis.unesco.org/resources/bulk).
Die [offiziellen Definitionen](https://www.uis.unesco.org/en/methods-and-tools/sdg4-indicators)
sind aus der Oberfläche erreichbar. Die ZIP-README benennt **CC BY-SA 3.0 IGO**;
Quelle und Abrufdatum werden angezeigt. Die abweichende Lizenzangabe der aktuellen
Webseite wird nicht stillschweigend auf diese Datei übertragen.

Der feste Stand enthält für die gewählten Messgrößen **103.593 Werte** und
**124.541 Quellenhinweise**. Tatsächlich vorhanden sind **245 Profile**:
223 Länder/Wirtschaftsgebiete und 22 separat benannte `uis:*`-SDG-Regionen.
Die Messgrößen decken unterschiedliche Gebiete und Jahre zwischen 1970 und
2025 ab. 260 Quellengebiete sind zugeordnet; 15 davon haben in diesen 40 Reihen
keine Werte. Der Gesamtkatalog enthält jetzt 314 Gebiete, von denen 177 eine
Kartenfläche haben. Die übrigen 137 bleiben per Liste erreichbar.

Die nationale Ländertabelle enthält zusätzlich die historischen Niederländischen
Antillen, Sudan vor der Teilung und die gemeinsam geführten Kanalinseln.
Diese werden keinem heutigen Nachfolger beziehungsweise einzelnen Inseln
zugeschlagen; für die ausgewählten Reihen liefern sie derzeit keine Beobachtungen.
UIS-Welt und SDG-Regionen bleiben von WDI-, UN-WPP-, IRENA- und anderen Regionen
getrennt. Die veröffentlichten Regionalwerte werden unverändert übernommen;
es werden keine eigenen ungewichteten Ländermittel berechnet.

## Native Datenhaltung

`education_source.rs` lädt nur die freigegebene HTTPS-Adresse ohne Redirects
oder API-Schlüssel. Die Datei wird mit 48 MiB Downloadlimit, 400 MiB Gesamtlänge
der ZIP-Inhalte und 270 MiB je Eintrag begrenzt. CSV-Dateien werden gestreamt,
nicht im Dateisystem entpackt. Parsing läuft außerhalb der asynchronen
Netzwerk-Threads. Dateinamen, Header, Definitionen, Gebietsnamen, regionale
Mitgliedschaften, Jahre, Wertbereiche, Quellenkennzeichen und Duplikate werden
geprüft. Eine ungeprüfte Änderung verhindert die Übernahme.

`NA` mit rohem Nullwert bleibt nicht anwendbar; `NIL` bleibt eine echte Null.
`SUPP` und `INCLUDED` bleiben ohne Zahlenwert. `LOWREL`, `INCLUDES`, `NAT_EST`
und `UIS_EST` bleiben unterscheidbar. Mehrere unterschiedliche Quellenhinweise
derselben Art werden vollständig erhalten. Ein fehlendes Kennzeichen bedeutet
keine Garantie für reine Messdaten oder identische Methoden.

Atlasmigration **0011** speichert den gemeinsamen Stand im öffentlichen Cache.
Eine Transaktion ersetzt sämtliche Bildungsprofile atomar. Die globale
Atlas-Abrufsperre und 24 Stunden Mindestabstand gelten. Ein Fehler erhält den
bisherigen Stand. Der Browser simuliert keinen Abruf und keine Bildungswerte.
Die Produktionsintegration verwendet den Gesamtdownload; die öffentliche API
wurde zusätzlich für den unabhängigen Indien-Abgleich verwendet.

## Nachweise

- [Nativer Abruf und unabhängiger Gesamtabgleich](evidence/education-native-readiness.json):
  alle 103.593 Werte und 124.541 Hinweise stimmen exakt mit den unabhängig
  eingelesenen ZIP-Dateien überein; maximale numerische Abweichung null.
- 496 Indien-Werte samt Magnitude/Qualifier stimmen zusätzlich mit der UIS-API
  in der festgelegten Version `20260507-91260335` überein. Der API-Abgleich betrifft
  Zahlen und Kennzeichen; Fußnoten werden gegen die vollständige Bulkdatei geprüft.
- [Gebietsprüfung](evidence/education-geography-audit.json): alle 314 Kataloggebiete,
  tatsächliche Profile, fehlende Werte und andere Quellengebiete getrennt.
- [Reproduzierbarer Prüfer](evidence/audit_education.py): liest ausschließlich
  öffentliche Dateien und das eigene Profil `com.personal-macro.atlas-education-validation`.
- Echte Tauri-Commands, atomarer Cachewechsel, Upgrade einer bestehenden
  Testdatenbank, Erhalt des OECD-Caches und Zurückrollen eines ungültigen
  Ersetzungsversuchs sind geprüft. Die Testfixture enthält ausschließlich
  öffentliche Originalzeilen samt Quellen-README.
- Ein echter Prozessneustart liest denselben Quellenhash und denselben Abrufzeitpunkt
  ohne erneuten Download. Das eigene Prüfprofil wurde danach beendet.
- Sichtprüfung bei 1024 und 1440 Pixeln: Erhebungsbild, separate Modellreihe,
  Indien-/China-Vergleich der Hochschulbeteiligung und optionale Zahlen.
  Kein zusätzlicher horizontaler Überlauf. Diese Sichtprüfung verwendet die
  öffentlichen Snapshots des nativen Abrufs.

Eine vollständige native Bedienabnahme aller bisherigen Atlasbereiche und
weitere Bildungsperspektiven bleiben Teil des Gesamtplans.
