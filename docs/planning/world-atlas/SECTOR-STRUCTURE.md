# Beschäftigung und Industriestruktur

Stand: 9. September 2026. Acht zusätzliche Jahresreihen ergänzen die vorhandenen
WDI-Bilder. Insgesamt sind jetzt 74 Statistiken angebunden. Die Bilder zeigen,
wie sich wirtschaftliche Schwerpunkte verschieben; sie berechnen weder faire
Preise noch eine vorgegebene Zyklusperiode.

## Bedienung

In **Länderübersicht → Menschen → Arbeit & Einkommen** stehen drei weitere
Beschäftigungsperspektiven neben der bisherigen Beschäftigungsquote. In
**Produktion & Ressourcen → Industrie & Herstellung** liegen Chemie, Maschinen
und Transportausrüstung sowie Textilien. Nahrung, Getränke und Tabak stehen
unter **Ernährung, Landwirtschaft & Wasser**. Der veröffentlichte industrielle
Restbereich liegt beim Thema **Anteil verarbeitendes Gewerbe** im Bereich
Wirtschaftsstruktur. Dieselben Reihen sind im jeweiligen Einzelthema über
**Statistik auswählen** und in **Daten & Quellen** erreichbar.

Länderwahl, Vergleich, Zeitfenster, optionale Zahlen und gemerkte Ansichten
verwenden die bestehenden Bedienpfade. Die neuen Reihen ändern keine bisherige
Standardauswahl. Die gemeinsame Zeitachse umfasst auf Wunsch den Zeitraum seit 1960. Einzelpunkte und Lücken bleiben erhalten; der Vergleich verwendet nur
gemeinsame tatsächliche Jahre und denselben lokalen Quellenstand. Die
automatische Skala gilt pro Statistik, nicht als Rang über alle Bilder.

Der bewusste Einzel- oder Sammelabruf lädt die gewählten Statistiken weltweit.
Jede vollständig validierte Reihe wird atomar im öffentlichen Atlas-Cache
gespeichert. Teilerfolge bleiben erhalten; es gelten die bestehende gemeinsame
Abrufsperre und 24 Stunden Mindestabstand je erfolgreich geladener Reihe.
Keine zusätzliche API-Anmeldung, Bezahlquelle oder SQLite-Migration.

## Drei unterschiedliche Bezugsgrößen

| Perspektive                       | WDI-Kennung         | Bedeutung und geprüfter Umfang                                                                                                             |
| --------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Landwirtschaft: Beschäftigung     | `SL.AGR.EMPL.ZS`    | Anteil an allen Erwerbstätigen; einschließlich Jagd, Forstwirtschaft und Fischerei. 187 Gebiete einschließlich Welt, 1991–2024.            |
| Industrie: Beschäftigung          | `SL.IND.EMPL.ZS`    | Anteil an allen Erwerbstätigen; einschließlich Bau, Bergbau und Versorgern. Gleicher Gebiets- und Zeitausschnitt.                          |
| Dienstleistungen: Beschäftigung   | `SL.SRV.EMPL.ZS`    | Öffentliche und private Dienstleistungen zusammen. Gleicher Gebiets- und Zeitausschnitt; keine gesonderte Bildungs- oder Gesundheitsreihe. |
| Chemie                            | `NV.MNF.CHEM.ZS.UN` | Anteil an der Wertschöpfung des verarbeitenden Gewerbes; ISIC Rev. 3, Abteilung 24 einschließlich Pharma. 161 Gebiete mit Werten.          |
| Nahrung, Getränke und Tabak       | `NV.MNF.FBTO.ZS.UN` | Gleicher industrieller Nenner; Abteilungen 15–16. Tabak ist enthalten. 164 Gebiete mit Werten.                                             |
| Maschinen und Transportausrüstung | `NV.MNF.MTRN.ZS.UN` | Gleicher industrieller Nenner; Abteilungen 29–35, einschließlich Elektro-/Elektronikausrüstung und Fahrzeugen. 156 Gebiete mit Werten.     |
| Textilien und Bekleidung          | `NV.MNF.TXTL.ZS.UN` | Gleicher industrieller Nenner; Abteilungen 17–19 einschließlich Leder-/Pelzverarbeitung. 161 Gebiete mit Werten.                           |
| Übriges verarbeitendes Gewerbe    | `NV.MNF.OTHR.ZS.UN` | Veröffentlichter Rest einschließlich nicht zugeordneter Daten. 164 Gebiete mit Werten; kein weltweit identischer eigener Sektor.           |

Die bereits vorhandene Reihe `NV.IND.MANF.ZS` hat dagegen **das BIP** als Nenner.
Sie wird weder dupliziert noch mit den neuen Branchenanteilen gleichgesetzt.
Beschäftigungsanteile, Industrieanteile und BIP-Anteile bekommen getrennte
Einheiten im Diagramm und in der Übersicht.

Ein Anteil kann auch fallen, weil andere Bereiche schneller wachsen. Er sagt
allein nichts über absolute Arbeitsplätze, Produktionsvolumen, Löhne oder
Anlagerenditen aus. Der industrielle Rest kann laut WDI nicht verfügbare
Chemie-, Textil- oder Maschinenwerte enthalten. Die App berechnet deshalb keine
eigene Restgröße, normiert die fünf Reihen nicht auf hundert und ersetzt
fehlende Teilbereiche nicht durch null.

## Modelljahre und Quellenabgrenzung

Die Beschäftigungsreihen stammen aus ILOEST und sind als **Modellschätzungen**
gekennzeichnet. Der native WDI-Import liest die fest katalogisierte Obergrenze
`throughYear: 2024`. Ein späteres Kalenderjahr verlängert diese Freigabe nicht.
Auch das Lesen eines vorhandenen Caches beachtet die Grenze, ohne gespeicherte
Quellzeilen zu löschen. Die Oberfläche zeigt „Modellschätzungen · Ausschnitt
bis 2024“ bereits auf den kleinen Karten. Die Erläuterung nennt den bewusst
begrenzten Ausschnitt.

Das ist eine konservative Produktfreigabe, keine Behauptung, alle ILO-Indikatoren
würden ab demselben Jahr zu Projektionen. Die ILO-Methodik vom Januar 2026
unterscheidet Zeitfenster je Modell; etwa die Erwerbsbeteiligung enthält
Projektionen 2025–2027. WDI liefert für diese Beschäftigungsanteile keinen
ausreichenden Status je Zelle, um neuere Modelljahre pauschal zu Beobachtungen
zu erklären. Auch historische Schätzungen enthalten Anpassungen und Revisionen.

Der direkte ILOSTAT-Datensatz `EMP_2EMP_SEX_ECO_NB_A` ist inzwischen über den
aktuellen offiziellen CSV-Zugang angebunden. Die frühere 403-Prüfung beschrieb
den damaligen Zugriff, nicht den jetzigen Produktstand. Die neuen
[Beschäftigungsbilder](LABOR.md) ergänzen 14 Wirtschaftsbereiche für 190 Profile.
Die drei WDI-Anteile bleiben eigenständige veröffentlichte Prozentreihen;
beide Quellenstände werden weder vermischt noch gegenseitig ersetzt.

Die UNIDO/WDI-Branchenreihen reichen frühestens bis 1963, je Land jedoch
unterschiedlich weit und teilweise mit Lücken. Im geprüften Stand:

| Land        | Industrieanteile in diesen fünf Reihen              |
| ----------- | --------------------------------------------------- |
| Deutschland | 1998–2023                                           |
| USA         | 1963–2024                                           |
| Indien      | 1963–2023                                           |
| China       | 1980–2019                                           |
| Nigeria     | 1963–1996, mit Lücken                               |
| Südafrika   | 1963–2019, je Reihe mit unterschiedlicher Abdeckung |

Für Welt liefert WDI keine Werte in den fünf Branchenanteilen. Die App
errechnet keinen Welt- oder Afrikaanteil aus ausgewählten Ländern. Historische
Klassifikationen, nationale Erfassungsunterschiede und Revisionen begrenzen
Vergleiche. Die WDI-Metadaten nennen für `NV.IND.MANF.ZS` widersprüchlich
„ISIC Rev. 3, C“; die neuen Branchenmetadaten nennen Rev. 3, D. Daraus wird
keine eigene Neuzuordnung oder Umschlüsselung abgeleitet.

## Reproduzierbarer Nachweis

`evidence/audit_sector_structure.py` lädt unabhängig über Python sämtliche
öffentlichen Seiten der acht Reihen und die WDI-Gebietsliste. Es prüft
Quellenkennung, eindeutige Jahre, Seitenzahl, Titel, Zeitgrenzen und
Veröffentlichungsstand. Die Originalantworten bleiben im ignorierten
Prüfverzeichnis; das öffentliche Protokoll enthält URLs und SHA-256-Werte.
Der Quellenabgleich umfasst 47.292 numerische Werte, 66.633 fehlende Werte
und 113.925 Kennzeichen in den 217 zugeordneten WDI-Gebieten. Darunter sind
123 echte Nullen. Dies ist der tatsächlich zugeordnete weltweite Ausschnitt;
das nicht zugeordnete Sammelgebiet `CHI` bleibt ausgeschlossen.

Der optionale Cache-Abgleich öffnet ausschließlich das ausdrücklich benannte
isolierte Prüfprofil `com.personal-macro.atlas-sector-structure-20260909`
read-only. Er vergleicht alle gespeicherten Jahreszeilen über Python Decimal,
nicht nur eine Länderstichprobe. Produktionsprofile werden vom Prüfskript
abgewiesen. [Quellenprotokoll](evidence/sector-structure-source-audit.json) und
[vollständiger Cache-Abgleich](evidence/sector-structure-native-cache.json)
bestätigen 47.292 exakte Dezimalübereinstimmungen ohne Abweichung sowie alle
fehlenden Werte, Kennzeichen und Quellenprüfsummen.

Der echte Tauri-Sammelabruf speicherte alle acht Reihen unter einem Job. Nach
einem tatsächlichen Prozessneustart waren 72 Antworten für neun ausgewählte
Länder-/Weltprofile einschließlich Herkunft und Abrufzeit vollständig gleich;
es entstand kein neuer Downloadjob. Das native Diagrammbild wurde erfolgreich
erzeugt und visuell geprüft. Die produktiven React-Ansichten wurden zusätzlich
mit diesen öffentlichen nativen Antworten bei 1024 und 1440 Pixeln bedient:
Indien/China, Deutschland/USA, leere Weltwerte, Tastaturöffnung, Quellenbedeutung,
Zahlenschalter, Rückweg und Modellgrenze. Die 1024-Pixel-Mindestbreite behält
mit der vertikalen Bildlaufleiste den bereits vorhandenen neun Pixel breiten
horizontalen Scrollbereich; die neuen Karten erzeugen keinen zusätzlichen
Überstand. Dies ersetzt keine vollständige native Klickregression.

151 Atlas-Frontendtests in 23 Dateien und 229 Rust-Library-Tests bestehen;
20 ausdrücklich externe/manuelle Rust-Tests sind im Standardlauf ausgenommen.
Typecheck, Produktionsbuild, gezieltes ESLint sowie Clippy mit `-D warnings`
bestehen. Die bekannte Build-Warnung zu großen Paketen und die bisherigen
EODHD-/Zentralbank-Hintergrundwarnungen bleiben dokumentiert. Im ersten
Prüfprozess trat außerdem die bereits bekannte `pdf-extract`-Worker-Panic
`Parse(InvalidContentStream)` außerhalb der Atlas-Pipeline auf. Der Atlas-Abruf
und die anschließende Neustartprüfung waren erfolgreich; ein fehlerfreier
Gesamtlauf wird nicht behauptet. Der Atlas initialisiert ohne neuen Fehler.
[Zusammengefasster Nachweis](evidence/sector-structure-readiness.json).

## Primärquellen

- [WDI: Landwirtschaft und Beschäftigung](https://databank.worldbank.org/metadataglossary/world-development-indicators/series/SL.AGR.EMPL.ZS)
- [WDI: Chemieanteil und industrieller Nenner](https://databank.worldbank.org/metadataglossary/world-development-indicators/series/NV.MNF.CHEM.ZS.UN)
- [WDI: Restbereich einschließlich nicht zugeordneter Werte](https://databank.worldbank.org/metadataglossary/world-development-indicators/series/NV.MNF.OTHR.ZS.UN)
- [UN: ISIC-Rev.-3-Zuordnung einschließlich Pharma, Maschinen und Fahrzeugen](https://digitallibrary.un.org/record/467089/files/%5BE_ECE_%5DCES_AC.68_2002_21-EN.pdf)
- [ILO: Methodenübersicht, Januar 2026](https://webapps.ilo.org/ilostat-files/Documents/TEM.pdf)
- [ILO: öffentliche Bulk-Dokumentation](https://ilostat.ilo.org/data/bulk/)
- [ILO: aktueller offizieller R-Client und Metadatenzugang](https://github.com/ilostat/Rilostat/blob/master/R/get_ilostat_toc.R)

WDI bleibt der tatsächliche Laufzeittransport dieser acht Reihen. Die jeweils
genannten Ursprungsquellen, Definitionen, Abrufzeitpunkte und Antwortprüfsummen
werden mitgespeichert; keine Verbindung zur Macro-Scoring-Pipeline.
