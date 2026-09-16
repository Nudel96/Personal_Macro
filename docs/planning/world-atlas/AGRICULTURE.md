# Agrarbilder – FAOSTAT-Produktionsentwicklung

Stand: 9. September 2026. Implementiert in `apps/desktop`.

Der Atlas zeigt die langfristige Entwicklung von 196 Agrarerzeugnissen und
Quellengruppen als Bilder. Die kostenlose öffentliche FAOSTAT-Datei benötigt
keinen API-Schlüssel. Ein ausdrücklicher Abruf lädt alle verfügbaren Profile;
die Bilder bleiben danach im lokalen Atlas-Cache verfügbar.

## Bedienung

Unter **Weltatlas → Produktion & Ressourcen → Ernährung, Landwirtschaft & Wasser**
führen **Pflanzenbau**, **Tierhaltung** und **Ernährungssicherheit** zu den
FAO-Produktionsbildern. Vorhandene WDI-Perspektiven bleiben über ihre eigene
Quellenwahl und explizite Links erreichbar.

- Zwölf Gruppen ordnen die Auswahl: Überblick, Getreide, Gemüse, Obst und Nüsse,
  Ölpflanzen, Wurzeln und Knollen, Genussmittel und Gewürze, Hülsenfrüchte,
  Zuckerpflanzen, Fasern und weitere Pflanzen, tierische Erzeugnisse und Fleisch.
- Je Seite erscheinen höchstens sechs Bilder. Die Suche findet beispielsweise
  Reis, Weizen, Rohkaffee oder Milch auch außerhalb der gewählten Gruppe.
- Ein Bild lässt sich groß öffnen. Produktion insgesamt und Produktion je
  Einwohner sind getrennte, von der FAO veröffentlichte Indizes.
- Die Zeitfenster beginnen 1961, 1980 oder 2000. Zwei Länder teilen innerhalb
  eines Bildes Skala, Kalender und verfügbaren Quellenstand. Verschiedene
  Erzeugnisse behalten eigene Skalen. Lücken werden nicht verbunden.
- Zahlen sind zunächst verborgen; Tooltips und die Wertetabelle sind optional.
  Legenden und Zeitachsen bleiben auch im gespeicherten Diagrammbild enthalten.
- **Quelle, Bedeutung und Regionsauswahl** erläutert die Definition und führt
  ausdrücklich zu eigenen FAO-Regionen. **Daten & Quellen** enthält dieselben
  Erzeugnisse mit ihrer tatsächlichen lokalen Verfügbarkeit.

## Bedeutung und Grenzen

Die Datei enthält die Originalelemente `432` (Gross Production Index Number)
und `434` (Gross per capita Production Index Number), jeweils Basis
**2014–2016 = 100**. Der Atlas übernimmt diese Werte unverändert. Die Basislinie
bezeichnet diesen Bezugszeitraum; sie ist kein wirtschaftliches Gleichgewicht.

Ein höherer Index bedeutet mehr Produktion gegenüber der eigenen Basis.
Zwei Länderindizes zeigen deshalb relative Entwicklungen, keine absolute
Marktgröße. Auch der Index je Einwohner ist keine Menge oder Kalorienzahl pro
Person. Diese Bilder messen weder Aktienbewertung noch Gewinne, Preise,
Flächenerträge, Ernährungssicherheit oder die Attraktivität einer Anlage.
Die Nahrungsmittelgruppe schließt laut FAO unter anderem Kaffee und Tee aus.
Bei Fleisch aus heimischen Tieren berücksichtigt die FAO lebende Exporte und
schließt lebende Importe aus.

Die allgemeine Methodennotiz beschreibt auch Abzüge für Saat und Futter,
während beide Elemente der aktuellen Datei ausdrücklich **Gross** heißen.
Diese Unschärfe der Quellenbeschreibung wird benannt. Es wird kein eigener
Nettoindex aus den veröffentlichten Bruttoreihen berechnet.

Der geprüfte Gesamtzeitraum ist **1961–2024**, die Abdeckung unterscheidet sich
jedoch erheblich. Deutschlands Weizenreihe endet in diesem Quellenstand 2017,
obwohl die deutsche Gesamtlandwirtschaft 2024 erreicht. Ein Vergleich mit den
USA endet für Weizen entsprechend im gemeinsamen Zeitraum. Deutschlands
Rohkaffeereihe fehlt. Solche Lücken werden weder durch Null noch durch
Fortschreibung ersetzt. Alle 1.995.192 gelieferten Werte tragen das Kennzeichen
`E` (geschätzt); darunter sind 426 echte Nullwerte. Der aktuelle Download
enthält keine leeren numerischen Quellfelder, aber zahlreiche fehlende
Länder-/Erzeugnis-/Jahreskombinationen.

## Gebiete und Originalquellen

Es bestehen **234 tatsächliche Profile: 199 Länder/Gebiete und 35 eigene
FAO-Aggregate**. Elf der 196 Einträge sind veröffentlichte übergeordnete
Produktgruppen, 185 sind Erzeugnisse beziehungsweise Teilgruppen. Es gibt keine
eigene Ländergewichtung oder Summenbildung.

Chinas Festland (`41`, `m49:156`) bleibt vom umfassenderen FAO-China-Gebiet
(`351`, `fao:351`) getrennt. Taiwan behält sein vorhandenes Providergebiet.
FAO-Welt (`fao:5000`), Afrika (`fao:5100`) und weitere Regionen werden
ausdrücklich gewählt; UN-, Weltbank- oder andere Quellenregionen erhalten keine
stillschweigend ersetzten FAO-Daten. Die 35 zusätzlichen Quellengebiete erweitern
den Gesamtkatalog auf **349 Einträge**. Die Karte bleibt bei 177 zugeordneten
Flächen; 172 weitere Einträge sind über die Liste erreichbar.

Elf Einträge des FAO-Gebietsverzeichnisses haben im geprüften Datensatz keine
Zeilen: darunter frühere Staaten und die heutigen Gebiete Französisch-Guayana,
Guadeloupe, Martinique und Réunion. Historische Staaten werden nicht auf ihre
Nachfolger und französische Gebiete nicht auf Frankreich umgeschlüsselt.

- [FAOSTAT Production Indices](https://www.fao.org/faostat/en/#data/QI)
- [Öffentliches Downloadverzeichnis](https://bulks-faostat.fao.org/production/datasets_E.json)
- [Originaldatei](https://bulks-faostat.fao.org/production/Production_Indices_E_All_Data_(Normalized).zip)
- [FAO-Methodennotiz](https://files-faostat.fao.org/production/QI/QI_e.pdf)
- [Offizieller Katalog und Lizenz CC BY 4.0](https://data.fao.org/catalog/dataset/c978f18c-7f11-4564-a47d-fd92f6353b11)

## Umsetzung und überprüfter Umfang

`agriculture_source.rs` lädt ausschließlich feste HTTPS-Quellen über Rustls,
ohne Weiterleitungen. Grenzen: 32 MiB ZIP, 420 MiB entpackte Hauptdatei,
3 Millionen Zeilen, begrenzte Verzeichnisse und Feldlängen. Der CSV-Parser liest
die Hauptdatei als Datenstrom. Das reale ZIP umfasst 16.167.197 Bytes; die
Hauptdatei 326.978.015 Bytes. Es werden keine Archive in Nutzerpfade entpackt.

Das öffentliche QI-Metadatum wird vor und nach dem Download geprüft.
Quellenidentität, Veröffentlichungsdatum, Zeilenzahl, Gebiete, Produktcodes,
Originalbezeichnungen, Basis, Elemente, Einheit und Schätzkennzeichen werden
validiert. Dubletten, nicht endliche oder negative Indizes, unzulässige Jahre
und unbekannte Definitionen verhindern die Übernahme. SHA-256, Abrufzeit und
HTTP-Dateistand bleiben erhalten. Neue oder geänderte Definitionen benötigen
eine geprüfte Katalogänderung.

Atlasmigration **0012** ergänzt zwei Tabellen im eigenständigen öffentlichen
Cache; die persönliche Journalmigration wird nicht erweitert. Alle Profile
werden in einer Transaktion ersetzt. Bei einem Fehler bleibt der vorherige
Stand erhalten. Der Abruf teilt die globale Atlas-Sperre und hält mindestens
24 Stunden Abstand. Browserbetrieb simuliert keinen erfolgreichen Download.
Sechs `agri*`-Darstellungsparameter und die `fao`-Quellenherkunft gehören
zum persönlichen Merkkontext.

Der reguläre Rust-Test prüft Originalwerte, Quellenidentitäten, Lücken/Null,
fehlerhafte Daten, Upgrade von Atlasmigration 0011, Erhalt von UIS-Daten,
Transaktionsrollback, Wiederöffnung, Abrufsperre und Mindestabstand. Der
ausdrücklich gestartete vollständige Quellentest prüft zusätzlich die gesamte
Datei und exportiert aus einem wieder geöffneten temporären Cache alle Profile.
Der unabhängige Python-Abgleich bestätigt alle 1.995.192 Werte und 426 Nullwerte
ohne Zahlenabweichung. Derselbe vollständige Abgleich besteht auch für den
echten Tauri-Download und dessen lokal gespeicherte Profile.

Ein echter Prozesswechsel vom ersten Prüflauf zum Neustart bestätigt die
Wiederverwendung aller 234 Profile: gleiche Prüfsumme, gleicher Quellenstand
und unveränderte Abrufzeit; kein neuer FAO-Job wurde gestartet.

Aktuelle Prüfungen: 144 Atlas-Frontendtests in 23 Dateien, 226 Rust-Librarytests
bei 20 bewusst ausgenommenen externen/manuellen Prüfungen, Typecheck,
Produktionsbuild, gezieltes ESLint/Prettier sowie Rustfmt und Clippy für alle
Targets mit `-D warnings`. Der vollständige FAO-Quellentest wurde zusätzlich
ausdrücklich ausgeführt.

Die Browser-Bedienprüfung verwendet diese öffentlichen nativen Daten. Echte
Tauri-Commands und gespeicherte Diagrammbilder sind gesondert geprüft. Das
ersetzt keine vollständige native Klickabnahme des gesamten Weltatlas.
Beim ersten Start des isolierten FAO-Prüfprofils wiederholte sich ein bereits
zuvor beobachteter `SQLITE_BUSY` beim Speichern der letzten Ansicht in der
Journal-Datenbank. Inzwischen ist die begrenzte Wiederholung dieses einzelnen
Präferenzschreibvorgangs mit echten Schreibsperren geprüft;
[Details](PREFERENCES-RECOVERY.md). Der FAO-Abruf und sein eigener Cache waren
erfolgreich. Die persönliche Produktionsdatenbank
wurde für diese Prüfungen nicht verwendet.

- [Vollständiger Quellen- und Gebietsabgleich](evidence/agriculture-source-audit.json)
- [Unabhängiger Parser-/Cache-Nachweis](evidence/agriculture-parser-readiness.json)
- [Nativer Nachweis](evidence/agriculture-native-readiness.json)
- [Reproduzierbares Prüfskript](evidence/audit_agriculture.py)

Diese Erweiterung verbreitert die Wirtschafts- und Sektorbilder. Die vollständige
Themenabdeckung, vertiefte Bewertung und Gesamtfreigabe R01–R18 bleiben offen.
