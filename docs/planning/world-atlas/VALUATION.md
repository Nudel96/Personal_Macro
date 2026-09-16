# Veröffentlichte Bewertungsbilder

Stand: 9. September 2026. In der Desktop-App unter **Weltatlas →
Bewertungsbilder** implementiert. Diese Perspektive ergänzt die bestehenden
Kurswellen um tatsächlich veröffentlichte aggregierte Unternehmenskennzahlen.
Sie benötigt kein weiteres kostenpflichtiges Abonnement.

## Quelle und überprüfter Umfang

Die Daten stammen aus den öffentlichen Jahrestabellen von Aswath Damodaran,
NYU Stern: [aktuelle Tabellen](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datacurrent.html),
[Archiv](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/dataarchived.html),
[Methodik und Nutzung](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datahistory.html).
Die App nennt Quelle und Veröffentlichungsstand und verlinkt jede verwendete
Originaldatei. Einzelne Unternehmen werden weder geladen noch dargestellt.

| Grundlage | Tatsächlich geprüfte Veröffentlichungen | Geltungsbereich |
| --- | --- | --- |
| Länderkennzahlen | 2013–2026 | 157 zugeordnete Gebiete über die Geschichte einschließlich Welt; 127 Zeilen im neuesten Stand |
| Branchen: Kurs/Buchwert und Eigenkapitalrendite | USA 1999–2026 | US-Unternehmensstichprobe |
| Dieselben Branchenkennzahlen | Europa, Japan, Schwellenländer und Global jeweils 2012–2026 | Eigenständige NYU-Quellenregionen |
| Dieselben Branchenkennzahlen | China, Indien und Australien/Neuseeland/Kanada: 2026 | Jeweils eine Momentaufnahme |
| Branchen: Gewinnbewertungen | USA 1999–2026; Europa, Japan, Schwellenländer und Global 2012–2026 | Historien mit getrennten Spaltendefinitionen und Branchengrenze |
| Branchen: Gewinnbewertungen | Indien 2026; China 2025 | Weiterhin jeweils eine Momentaufnahme |
| Anteil der Verlustfirmen | USA, Europa, Japan, Schwellenländer und Global 2023–2026; Indien 2026; China 2025 | Eigene Kontextgröße; frühere fehlende Anteile werden nicht erfunden |

Insgesamt sind 16 einzeln abrufbare Pakete mit 195 XLS-Dateien angebunden.
Die aktuellen Tabellen enthalten je 94 Branchen und zwei Aggregatzeilen.
Über alle Regionen gibt es 97 aktuelle Quellenbezeichnungen, weil das
europäische Gesamtaggregat „Grand Total“ statt „Total Market“ heißt. Diese
Quellenzeilen bleiben explizit getrennt. Ältere Archive enthalten insgesamt
226 verschiedene Branchen-/Aggregatbezeichnungen; wechselnde Branchen werden
nicht per unscharfer Namensähnlichkeit zusammengeführt.

Die Quelle liefert keine separate Wasserstoff-, Kernenergie- oder
Afrika-Solarbewertung. Die breitere erneuerbare Energiebranche darf deshalb
nicht als eine dieser engeren Kombinationen beschriftet werden. Private
Bildungsunternehmen sind eine Unternehmensstichprobe, keine Bewertung des
gesamten Bildungssystems.

### Erweiterte Gewinnhistorien

83 zusätzliche Originaldateien erweitern die fünf großen Branchenregionen.
Die fünf Gewinnpakete enthalten jetzt 41.877 Quellzellen in 88 Jahresdateien.
Alle Werte, fehlenden Angaben, Excel-Fehler, Firmenzahlen und Dateizuordnungen
werden unabhängig über Python/xlrd und die nativen Rust-/SQLite-Antworten
abgeglichen. Die vollständige Bewertungssammlung umfasst 71.741 geprüfte Zellen.
Rundungsunterschiede durch die JSON-Darstellung bleiben unter 5 × 10⁻¹³.

Der Japan-Link für Januar 2025 im offiziellen Archiv verweist versehentlich auf
die Europadatei. Die öffentliche [Japan-Originaldatei](https://pages.stern.nyu.edu/~adamodar/pc/archives/peJapan24.xls)
ist erreichbar und anhand ihres Stempels **2025-01-05**, ihrer Region **Japan**
und ihrer Prüfsumme bestätigt. Sie wird ausdrücklich zugeordnet; die falsche
Europadatei wird nicht als Japan eingelesen. Der Quelldateiaudit dokumentiert
diese Korrektur einschließlich des ursprünglichen Linkziels.

Ältere aggregierte Spalten nennen den Umgang mit Verlustfirmen nicht ausdrücklich.
Diese Jahres- und Zwölfmonatsquoten besitzen deshalb eigene Archivkennungen,
ebenso die frühe US-Spalte `Price/Forward PE`. Sie erhalten keine historische
Bewertungslage. Die gewöhnlichen Current-/Trailing-KGV-Reihen behalten die
sichtbare Branchengrenze 2014; frühe Tabellen erläutern ihre Aggregation nicht
vollständig. Der Verlustfirmenanteil wird erst ab dem tatsächlich gelieferten
Jahr 2023 angeboten. Fehlende historische Spalten erhalten keine Nullwerte.

Alle Archivdateien sind an die geprüften SHA-256-Werte gebunden. Eine nachträglich
geänderte Datei benötigt eine erneute Quellenprüfung, bevor sie frühere lokale
Daten ersetzt. Der neue Katalogstand ist `2026-09-09.3`; ältere lokale Pakete
bleiben als früherer Quellenstand lesbar und können vollständig aktualisiert
werden. Es ist keine Cachemigration erforderlich.

## Bedeutung der Bilder

Januarveröffentlichungen enthalten überwiegend Börsenwerte nahe dem Ende des
Vorjahres sowie zeitlich verzögerte Unternehmensabschlüsse. Der Dateiname
nennt häufig das Vorjahr; maßgeblich sind der geprüfte Tabellenstempel oder,
bei zwei frühen Länderdateien ohne Stempel, die dokumentierte Archivbeschriftung.

- Länder-Mittelwerte bis 2020 und Mediane ab 2021 besitzen unterschiedliche
  Kennzahlkennungen und getrennte Bilder. Die Start-/Endjahre des Diagramms
  folgen der ausgewählten Definition.
- Das Branchen-Kurs/Buchwert-Verhältnis und die Eigenkapitalrendite sind
  aggregierte Verhältnisse. Die KGV-Mittelwerte profitabler Firmen sind von
  Gesamtbörsenwert/Gesamtgewinn einschließlich Verlustfirmen getrennt.
- Gewinnschätzungen bleiben als Erwartung gekennzeichnet; Eigenkapitalrendite
  und Verlustfirmenanteil sind Kontextgrößen. Diese erhalten keine historische
  Hoch-/Tiefeinordnung.
- Nicht positive Bewertungsverhältnisse, Excel-Fehler und fehlende Angaben
  ergeben keine günstige Bewertung. Der Originalwert bleibt, soweit vorhanden,
  in der optionalen Tabelle erhalten.
- Simbabwe ist in `countrystats22.xls` (Veröffentlichung 2023) doppelt mit
  verschiedenen Werten enthalten. Beide Zeilen werden ausgelassen und in der
  Provenienz genannt. Der restliche Länderstand wird verwendet. Neue,
  ungeprüfte Mehrdeutigkeiten stoppen die Übernahme.

Die Historieneinordnung ist eine beschreibende Rangposition gegenüber früheren
sinnvollen Werten derselben Definition. Sie verwendet mindestens zehn frühere
Jahresstände, mindestens zwanzig Firmen je verwendetem Quellenstand und eine
nicht konstante Vergleichsverteilung. Der aktuelle Punkt gehört nicht zu seiner
eigenen Referenz. Unteres/oberes Fünftel und der Bereich dazwischen werden in
Worten angezeigt. Das ist eine UI-Konvention, keine Schätzung eines fairen Werts.
Die gestrichelte Linie im Einzelbild ist der Median der vorherigen Stände.

Der Atlas setzt vorsichtig eine sichtbare Grenze zwischen der Branchengliederung
vor und ab 2014. Das bedeutet nicht, dass danach Zusammensetzung und Methodik
unverändert wären. Ein starker Wechsel der gesamten Firmenzahl wird zusätzlich
angezeigt. Die gesamte Firmenzahl ist kein sicherer Nenner für jede einzelne
Kennzahl. Für die Länderreihen entsteht wegen des Mittelwert-/Medianwechsels
derzeit keine ausreichend lange vergleichbare Referenz für eine Hoch-/Tieflage.

## Bedienung und Darstellung

Zahlen sind standardmäßig verborgen. Länder und Vergleichsland verwenden
denselben Kalender, dieselbe Definition und dieselbe Skala. Branchen sind in
zehn redaktionellen Feldern sortiert; diese Gruppierung berechnet keine eigenen
Sektormittelwerte. Höchstens sechs kleine Bilder erscheinen gleichzeitig,
mit gemeinsamer Skala. Eine Karte öffnet das große Bild und einen optionalen
Branchenvergleich innerhalb derselben Quellenregion. Alternativ lässt sich
dieselbe Branche zwischen zwei ausdrücklich gewählten Quellenregionen vergleichen.

47 Themen öffnen zusätzlich eine begrenzte Auswahl der passenden Quellenbranchen.
Sie umfassen 90 verschiedene Branchen und 169 ausdrückliche Verknüpfungen, unter
anderem Chemie, Maschinenbau, Stahl, Versicherungen, Software, Halbleiter,
Einzelhandel und die elf breiten Sektorthemen. Banken öffnen nur Großbanken und
Regionalbanken, Chemie nur Grund-, diversifizierte und Spezialchemie. Diese
redaktionelle Navigation ist keine GICS-Klassifikation und kein neu berechneter
Sektorindex. Die [Branchengliederung der Quelle](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/databreakdown.html)
bleibt maßgeblich. Zusammengefasste Quellenbranchen werden erläutert, etwa
Hotelunternehmen gemeinsam mit Glücksspiel oder Papier gemeinsam mit Forstprodukten.

Die Suche bleibt auf das gewählte Thema begrenzt; **Alle Branchenfelder** hebt
diesen Filter bewusst auf. Themenwechsel entfernen frühere Such- und
Seitenstände. Der Themenfilter bleibt beim Öffnen, beim Wechsel der Kennzahl
oder Quellenregion, bei der Rückkehr und in gemerkten Ansichten erhalten.
Fehlende Reihen innerhalb einer Themenauswahl bleiben als leere Karten sichtbar.
Ein alter Detail-Link auf eine andere Branche öffnet die passende Themenübersicht.
Gespeicherte Branchenbilder nennen die tatsächliche Quellenregion im Titel.
Einzelstände werden auch in der Auswahl der Bewertungsgrundlage als Momentaufnahme
bezeichnet.

### Dieselbe Branche zwischen Regionen

Die Auswahl **Dieselbe Branche in einer anderen Region** öffnet etwa
Bildungsunternehmen in Indien und den USA. Sie liest ein zweites bereits
vorhandenes Quellenpaket; fehlende Pakete werden nur über den eigenen Ladebutton
abgerufen. Es entsteht keine weitere API-Anbindung. Beide Reihen verwenden
denselben Kalender, dieselbe Kennzahl und dieselbe Skala. Die historischen
Einordnungen bleiben je Region getrennt.

Der Vergleich verlangt dieselbe aktive Quellenbranche, genaue Kennzahlkennung,
aktuelle Katalogversion und nachvollziehbare Dateiprovenienz. Die Datei muss zu
Jahr, URL, Stempel und Kennzahl ihres eigenen Pakets passen; Archivhashes werden
erneut zugeordnet. Mindestens ein gemeinsames sinnvolles Veröffentlichungsjahr
desselben Methodenabschnitts ist erforderlich. Ohne dieses Jahr bleibt die
Hauptreihe mit einer verständlichen Begründung sichtbar. Indien-Gewinne 2026
und China-Gewinne 2025 werden deshalb nicht überlagert. Indien-Buchwerte 2026
können dagegen als einzelner Punkt neben der US-Geschichte erscheinen.

Die gemeinsame Geschichte wird mit ihren tatsächlichen Jahreslücken benannt.
Frühere eigene Punkte bleiben unverändert. Unterschiedliche Firmenstichproben
verhindern, dass eine höhere Linie allein als Überbewertung interpretiert wird.
Eine fehlende Region wird nicht durch Global ersetzt. Australien/Neuseeland/
Kanada ist nur für die vorhandene Buchwertgrundlage auswählbar.

`valCompareScope` erhält die zweite Region in URL, letzter Ansicht und Notiz.
Eine Auswahl anderer Branchen löscht den Regionsvergleich und umgekehrt.
Quellen-/Grundlagenwechsel prüfen die neueste Auswahl gemeinsam, damit schnelle
Änderungen keine vorherige Region zurückbringen. Das Notizbild nennt beide
Regionen; die gespeicherten Quellen behalten ihre eigenen Abrufzeiten und Hashes.

Die Linien verbinden nur benachbarte verfügbare Jahresstände desselben
Methodenabschnitts. Lücken bleiben offen, einzelne Punkte bleiben einzelne
Punkte. Es gibt weder eine erzwungene Sinusperiode noch eine Fortschreibung in
die Zukunft. Verschiedene Branchen haben unterschiedliche typische
Kennzahlenniveaus; ihre Höhe allein ist kein vergleichbares Günstigkeitsurteil.

Die Quellenübersicht liest diese Daten über dieselben Commands. Länderkennzahlen
sowie ausdrücklich zugeordnete Branchen (unter anderem Bildung, Pharma,
Biotechnologie, Banken, Energie, Versorger, Technologie und Immobilien) sind
verlinkt. Eigene Branchenregionen stehen für USA, Japan, Indien, China und Welt
zur Verfügung. Für Deutschland öffnet ein entsprechend gekennzeichneter Link
die globale Stichprobe; Europa wird nicht als Deutschland ausgegeben.

## Native Umsetzung

`valuation-catalog.json` ist der gemeinsame Quellenvertrag für Rust und
TypeScript. Er enthält Links, Tabellenblätter, Header, Veröffentlichungsstände,
Regionen, Zeilenzahlen, geprüfte Mehrdeutigkeiten und Kennzahlzuordnungen. Der
Generator `scripts/build-atlas-valuation-catalog.py` liest ausschließlich den
unabhängigen Quelldateiaudit; Beobachtungswerte gelangen nicht in das App-Bundle.

`valuation_source.rs` lädt nur die katalogisierten HTTPS-XLS-Dateien des
NYU-Hosts, ohne Weiterleitungen, mit Zeit- und Größenlimits. Tabellenstruktur,
Datum, Regionen, Firmenzahlen, Duplikate und Werttypen werden geprüft.
`valuation_metrics.rs` berechnet die historische Einordnung.

Atlasmigration **0006** ergänzt `atlas_valuation_datasets` im getrennten
öffentlichen Cache. Ein kompletter Download ersetzt genau ein Paket atomar.
Bei Fehler oder Abbruch bleibt dessen vorheriger lokaler Stand erhalten.
Die globale Atlas-Abrufsperre, Fortschritt und mindestens 24 Stunden Abstand
zwischen erfolgreichen Wiederholungen gelten auch hier. Ein Abbruch wartet
höchstens bis nach der aktuellen begrenzten Datei; der unvollständige neue
Gesamtstand wird nicht gespeichert.

Commands: `get_atlas_valuation`, `sync_atlas_valuation`,
`cancel_atlas_valuation`. Der Browser-Fallback meldet `desktop_required`.
Die Journal-Datenbank, Backups und bestehenden Macro-/Rates-Berechnungen
werden durch diese Atlas-Erweiterung nicht verändert.

## Nachweise und verbleibende Grenzen

- [Regionaler Vergleich und Wiederöffnung](evidence/valuation-regions-readiness.json):
  41.710 gerichtete Regions-/Branchen-/Kennzahlkombinationen der bereits unabhängig
  geprüften öffentlichen Snapshots kontrolliert. 36.114 sind vergleichbar,
  2.616 haben keine gemeinsame Kennzahldefinition, 226 keine identische
  Quellenbranche und 2.754 keine gemeinsamen sinnvollen Jahre. Das zählt
  Vergleichskombinationen einschließlich Aggregaten, keine neuen Datenreihen.
  Die native Notiz behält beide Quellenpakete, Kontext und PNG nach echtem
  Prozessneustart exakt. Browserprüfung umfasst schnelle Regionswechsel,
  fehlendes gemeinsames Jahr, lange Historien, optionale Zahlen und Quellenlinks.
  Die Prüfung verwendet vorhandene echte native NYU-Snapshots, keinen neuen
  Providerabruf. Vollständige native Klickabnahme bleibt offen.

- [Themenzuordnungsprüfung](evidence/valuation-topic-audit.json): 47 Themen und
  90 Branchen gegen die unabhängig eingelesenen aktuellen Originaltabellen aller
  15 Branchenpakete geprüft. Die Zuordnung ergänzt keine numerischen Beobachtungen.
- [Themen-, Browser- und Speicherprüfung](evidence/valuation-topic-readiness.json):
  begrenzte Auswahl, Suche, echte Quellenregion, fehlende Reihen, Rückwege und
  Erhalt der Notiz samt PNG nach echtem Prozessneustart im isolierten Prüfprofil.
  Die erste automatische Prüfnotiz traf beim Erststart auf eine vorübergehende
  SQLite-Schreibsperre der Startjobs und wurde nicht gespeichert; nach deren
  Abschluss funktionierten Speicherung und Neustart. Das Protokoll behauptet
  keine vollständige native Klickabnahme.
- [Quelldateiaudit](evidence/valuation-source-audit.json): 195 originale Dateien
  mit Hashes, Umfang, Stempel und exakt geprüften Headern.
- [Ursprüngliche native Quellen- und Startprüfung](evidence/valuation-native-readiness.json), vor der Erweiterung:
  32.744 geprüfte Zellen, davon 31.247 numerische Angaben; calamine stimmt mit
  der unabhängig gelesenen xlrd-Referenz überein. Nicht verfügbare Angaben
  wurden ebenfalls abgeglichen.
- Alle 16 Pakete wurden zusätzlich in temporärem SQLite gespeichert, vollständig
  zurückgelesen und nach erneutem Öffnen geprüft. Numerische JSON-Rundungen
  werden mit einer auf die Gleitkommadarstellung begrenzten Toleranz verglichen;
  Identitäten, Jahre, Definitionen und Verfügbarkeitszustände müssen exakt bleiben.
- Ein realer nativer Download-/SQLite-Test lädt Länder, US- und globale
  Buchwerthistorien sowie Indien-/China-Gewinnstände. Der anschließende
  Offline-Neustart prüft unter anderem Deutschland, USA, Indien und China.
- Temporäre Datenbanken prüfen Upgrade von Atlasmigration 0005, Erhalt eines
  früheren Datensatzes bei ungültigen Ersatzdaten, Abbruch, Offline-Lesen und
  die gemeinsame Abrufsperre. Persönliche Datenbanken werden dafür nicht benutzt.
- Die echte Tauri-App initialisierte unter
  `com.personal-macro.atlas-valuation-validation` mit Migrationen 1–6 und neuer
  Bewertungstabelle. Die bekannte Technicals-/Intraday-Warnung aus einem anderen
  Modul erschien einmal; keine neue Atlas-Initialisierungswarnung wurde gefunden.

Die Browser-Sichtprüfung verwendet ausdrücklich gekennzeichnete echte native
öffentliche Snapshots im originalen App-Rahmen. Geprüft wurden Indien/China-
und Deutschland/USA-Länderbilder, der Mittelwert-/Medianwechsel, die globale
Energiehistorie, indische Einzelpunkte und Chinas älterer Gewinnstand. Die
Quellenübersicht und der Themenlink führen zur indischen Bildungsstichprobe;
Deutschlands Branchenlink ist ausdrücklich global. Nordkorea bleibt ohne eigene
Länderreihe. Für Australien/Neuseeland/Kanada ist die nicht angebundene
Gewinnperspektive gesperrt. Bei 1024 und 1440 Pixeln entstand kein zusätzlicher
horizontaler Seitenüberlauf.

78 gezielte Frontendtests bestanden; Typecheck, ESLint, 36 deterministische
Atlas-Rust-Tests und Clippy bestanden ebenfalls. Die Quellen- und Netzwerktests
werden zusätzlich bewusst ausgeführt und sind in der normalen Suite ignoriert.
Diese Prüfung ersetzt keine vollständige native Klickabnahme.
Die ergänzende [Prüfung der Gewinnhistorien](evidence/valuation-earnings-readiness.json)
und das [reproduzierbare Prüfskript](evidence/audit_valuation_earnings.py) dokumentieren
die erweiterte Sammlung. Der Quellenaudit ist über
`scripts/audit-atlas-valuation-sources.py --output <Prüfordner> --download --inspect`
wiederholbar; der Kataloggenerator übernimmt ausschließlich die geprüften Metadaten.
Längere Länderbewertungsgeschichten und engere
Länder-/Themenkombinationen bleiben Ausbauarbeit. Der Gesamtauftrag R01–R18
bleibt offen.

Die finale Erweiterungsprüfung besteht mit 137 Atlas-Frontendtests, 223 Rust-
Library-Tests, Typecheck, Build, gezieltem ESLint/Prettier, Rustfmt und Clippy
für alle Targets. Alle fünf erweiterten Pakete wurden mit echten Tauri-Jobs
geladen und nach echtem Prozessneustart ohne neuen Download gelesen. Einmaliges
SQLite-Busy beim Speichern der letzten Ansicht im frisch angelegten Prüfprofil
trat bei drei anschließenden Starts nicht erneut auf; die Ursachenprüfung bleibt
offen. Bekannte Technicals-/Berichts-Synchronisierungswarnungen bestehen außerhalb
der Bewertungsdatenübernahme weiter.
