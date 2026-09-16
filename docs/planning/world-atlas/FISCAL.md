# Historische Staatsfinanzen · IMF

Stand: 9. September 2026. Acht Perspektiven für 151 Länder und Gebiete sind in
der Desktop-App implementiert. Die Quelle enthält unter anderem Deutschland,
USA, Indien und China. Sie erweitert die Länderabdeckung der gesonderten
[JST-Finanzgeschichte](MACROHISTORY.md), ohne deren Reihen zu verlängern oder
beide Quellen miteinander zu verkleben.

## Bedienung und Bedeutung

Unter **Weltverbindungen & Umwelt → Institutionen & Gesellschaft →
Staatsfinanzen** öffnen zunächst vier kleine Haushaltsbilder. Über
**Staatsfinanzen ordnen** sind drei Gruppen erreichbar. **Wirtschaft & Kapital
→ Finanzsystem & Verschuldung → Staatsverschuldung** führt zum selben
Quellenbestand mit der Schuldenansicht als Voreinstellung.

| Gruppe | Bilder | Veröffentlichte Einheit |
| --- | --- | --- |
| Haushalt & Staat | Einnahmen, Ausgaben, Ausgaben ohne Zinsen, primärer Haushaltssaldo | Anteil am BIP |
| Schulden & Zinsen | Öffentliche Bruttoschulden, Zinsausgaben | Anteil am BIP |
| Wirtschaftlicher Kontext | Langfristiger Realzins, reales Wirtschaftswachstum | Prozent beziehungsweise Prozent pro Jahr |

Zahlen und Tooltips sind zunächst verborgen. Klick oder Enter öffnet ein
Einzelbild. Der Zeitraum ist seit 1800, 1900, 1950, 1980 oder 2000 wählbar.
Die Ansicht erfindet dabei keine frühere Geschichte: Der erste verfügbare Wert
bestimmt den wirklichen Beginn. Höchstens vier Bilder erscheinen gleichzeitig.
Es gibt keine Animation und keine Glättung der veröffentlichten Jahreswerte.

Höhere Staatsausgaben, Schulden oder Zinsen bedeuten weder eine gute noch eine
schlechte Anlagebewertung. Die Größen beschreiben staatliche Finanzen und ihren
Kontext. Eine starke Veränderung einer BIP-Quote kann auch durch einen
Einbruch des Nenners entstehen. Vermögenswerte sind von den Bruttoschulden
nicht abgezogen. Zinsausgaben enthalten keine Tilgung. Der Primärsaldo folgt
der veröffentlichten IMF-Definition; die Behandlung von Zinseinnahmen kann
von anderen IMF-Produkten abweichen.

Für Saldo, Wachstum und Realzins ist die Null im großen Bild ausdrücklich
beschriftet. Das ist ein sachlicher Nullbezug und kein geschätzter fairer Wert.
Andere Messgrößen behalten ihre eigene Skala. Zwei Länder innerhalb eines
Bildes teilen Kalender und Maßstab. Optionale aktuelle Zahlen beziehen sich
auf dasselbe tatsächlich verfügbare Vergleichsjahr.

## Quellenstand und tatsächliche Geschichte

Verwendet wird **IMF Public Finances in Modern History, Dezember 2025**.
Der ursprüngliche IMF-Dateiabruf antwortete bei der Prüfung mit HTTP 403.
Der implementierte Weg lädt stattdessen die unveränderte Originalarbeitsmappe
aus dem öffentlichen, durch ihren Inhalt adressierten OWID-Archiv. Dieser
Archivstand wurde von OWID am 12. Juni 2026 gesichert. Er benötigt keinen
API-Schlüssel und kein neues Abonnement.

- [IMF-Datensatz](https://www.imf.org/external/datamapper/datasets/FPP)
- [Originaldatei des IMF](https://www.imf.org/external/datamapper/FPP/Public%20Finances%20in%20Modern%20History%20Dec%202025.xlsx)
- [Öffentlicher Archivnachweis](https://github.com/owid/etl/blob/master/snapshots/imf/2026-06-12/public_finances_modern_history.xlsx.dvc)
- [Archivierte Originaldatei](https://snapshots.owid.io/9a/89466f7445e0893ab49ddf530da3b1)
- [IMF-Quellendokumentation](https://www.imf.org/external/datamapper/FPP/Appendix%20of%20Data%20Sources.pdf)
- [IMF-Nutzungsbedingungen](https://www.imf.org/external/terms.htm)

Die Arbeitsmappe enthält 33.846 Jahreszeilen und 68.406 numerische Werte in
acht Feldern. Vollständig leere Jahreszeilen dienen in der Quelle teilweise
als Kalendergerüst. Sie werden nicht als Beobachtungen gezählt.

Beispiele für die **tatsächlich vorhandenen Staatsausgaben**:

| Land | Erster/letzter Wert | Verfügbare Jahre |
| --- | --- | ---: |
| Indien | 1861–2024 | 164 |
| China | 1982–2024 | 43 |
| Deutschland | 1880–2024, mit Lücken | 119 |
| Vereinigte Staaten | 1929–2024 | 96 |
| Südafrika | 1913–2024 | 112 |
| Nigeria | 1990–2024 | 35 |

Diese Zeiträume gelten nicht automatisch für die anderen sieben Messgrößen.
Die Datei besitzt keine Welt- oder Kontinentaggregate. Eine UN-Afrikaregion
wird deshalb nicht durch einen Ländermittelwert ersetzt. Fehlt nur das
Vergleichsgebiet, bleibt das vorhandene Hauptland sichtbar.

Die ältere IMF-Methodendokumentation vom Februar 2025 nennt 196 Länder und
1800–2023; die geprüfte DataMapper-Verzeichnisangabe nannte wiederum 144.
Maßgeblich für dieses Produkt ist der tatsächlich gelesene Dezemberstand mit
151 ISO-/IFS-Identitäten bis spätestens 2024. 153 Originalbezeichnungen ergeben
sich aus zwei historischen Namensvarianten für Bahamas und Kongo-Brazzaville.
Beide Varianten sind einzeln katalogisiert, ihre Jahresbereiche überlappen
nicht und ihre ISO-/IFS-Identitäten stimmen überein.

## Vergleichbarkeit und Linienbrüche

Die Originalkennzeichen `GG_budg` und `GG_debt` werden getrennt gespeichert:
`0` bezeichnet Zentralregierung, `1` Gesamtstaat. Die Haushaltsabgrenzung gilt
für Einnahmen, Ausgaben, Primärausgaben, Primärsaldo und Zinsausgaben; die
Schuldenabgrenzung nur für Bruttoschulden. Wachstum und Realzins übernehmen
keine dieser Haushaltsabgrenzungen.

Sind in einem Vergleichsjahr beide Zahlen vorhanden, aber ihre staatlichen
Abgrenzungen verschieden, werden beide Linien an diesem Jahr ausgesetzt.
Fehlende Gegenwerte bleiben als Lücken im jeweiligen Land sichtbar. Der
Zeitraum allein besagt daher nicht, dass alle enthaltenen Jahre vergleichbar
oder vollständig vorhanden sind.

Einzelansichten zeigen die vorhandenen historischen Abschnitte. Linien werden
an fehlenden Jahren, einem Wechsel der staatlichen Ebene und dokumentierten
Definitionsbrüchen getrennt. Beide vorhandenen Endpunkte bleiben erhalten.
Die in den OWID-Metadaten dokumentierte französische Definitionsänderung 1978
ist für Einnahmen, Ausgaben, Zinsausgaben und Primärausgaben zusätzlich
katalogisiert. Ihr Hinweis erscheint nur im tatsächlich betroffenen Bild.

Historische Gebietsstände, abweichende Haushaltsjahre, Rekonstruktionen und
nicht vollständig datierte Methodenwechsel begrenzen auch die übrigen
Ländervergleiche. Die staatlichen Kennzeichen sind keine vollständige
Harmonisierung. Diese Ansicht berechnet keine Zyklusperiode, Zukunftswelle,
Schuldentragfähigkeitsnote oder Unter-/Überbewertung.

## Native Datenhaltung

`fiscal_source.rs` lädt ausschließlich die feste öffentliche Archiv-URL.
Weiterleitungen sind deaktiviert; Verbindungs-, Laufzeit-, Dateigrößen- und
Entpackgrenzen sind gesetzt. SHA-256, Dateigröße, Tabellenblatt, alle 14
Spalten, Gebietsidentitäten und sämtliche erwarteten Kalenderzeilen werden
geprüft. Die acht numerischen Werte werden direkt übernommen. Negative
Salden, Realzinsen und Wachstumsraten, echte Nullen und hohe BIP-Quoten bleiben
unverändert; fehlende Werte werden nicht ergänzt.

Fester SHA-256:
`de8ae724dbf4aca064aef3bc49554c4d00221f6eef3762b29412450cb1c65e54`.
Rezept: `imf-dec2025-original-values-scopes-v1`.

Atlasmigration **0014** legt die eigenen Tabellen im öffentlichen Atlas-Cache
an. Ein vollständiger Abruf ersetzt alle Profile und die Herkunft gemeinsam
in einer Transaktion. Fehler erhalten den vorherigen Stand. Globale
Atlas-Abrufsperre und mindestens 24 Stunden zwischen erfolgreichen Abrufen
gelten auch hier. Ein neuer Quellenstand erfordert eine erneute Prüfung und
explizite Aktualisierung des Katalogs.

Die Command-Fassade bietet `atlasFiscal` und `syncAtlasFiscal`. Die normale
Browser-Vorschau liefert `desktop_required`, keine erfundenen Profile.
Die Quellenübersicht führt IMF als vierzehnte Familie und prüft alle acht
Messgrößen einzeln. `fiscalGroup`, `fiscalMetric`, `fiscalSince`, die
Quellenfamilie `imf`, Prüfsumme und Länderlegende gehören zum Merkkontext und
zum festen Diagrammbild. Journalwerte werden nicht an die Quelle übertragen.

## Tatsächliche Prüfung

Der unabhängige Python-Audit liest die Originaldatei mit `openpyxl` und
`Decimal`. Er vergleicht alle 68.406 Zahlen, 202.362 fehlenden Zellen und
67.692 Abgrenzungskennzeichen. Im echten Tauri-Cache stimmen sämtliche Zahlen
dezimal exakt überein, einschließlich drei Nullen und 7.040 negativer Werte.
Zusätzlich wurden alle 9.265 Ausgabenwerte gegen die separat veröffentlichte
OWID-CSV geprüft; deren Float32-Rundung ist ausdrücklich berücksichtigt.

Der Rust-Test für den tatsächlichen öffentlichen Download wurde explizit
ausgeführt. Ein eigenes Tauri-Prüfprofil lud anschließend die vollständige
Quelle über die produktiven Commands, speicherte eine Notiz samt PNG und las
alle 151 Profile sowie zwei ausdrücklich nicht unterstützte Aggregate. Ein
echter Prozessneustart lieferte exakt dieselben gespeicherten Antworten und
dieselbe Notiz, ohne neuen IMF-Abruf. Die produktive Benutzerdatenbank wurde
für diese Prüfung weder gelesen noch verändert.

Die UI-Prüfung verwendet genau diese öffentlichen nativen Snapshots im
Browser. Geprüft wurden Indien/China, Deutschland/USA, Indiens lange
Einzelgeschichte, Frankreichs Definitionsbruch, fehlende Welt-/Afrikawerte,
Gruppenwechsel, optionale Zahlen, Öffnen per Enter und die Quellenkarte.
1024 und 1440 Pixel Breite zeigten keinen zusätzlichen horizontalen Überlauf.
Die Browserkonsole blieb ohne Warnungen und Fehler.

167 Atlas-Frontendtests in 25 Dateien, 234 Rust-Library-Tests, Typecheck,
Produktionsbuild, gezieltes ESLint, Rustfmt und Clippy für alle Targets mit
`-D warnings` bestanden. 22 ausdrücklich externe/manuelle Rust-Tests bleiben
im Standardlauf ausgenommen; der neue echte IMF-HTTP-Test wurde separat
ausgeführt. Ein früherer unbeschränkt paralleler Frontendlauf traf den
bekannten zeitabhängigen Notiz-Snapshot-Test. Dessen gezielte Wiederholung
und die gesamte Suite mit zwei Workern bestanden. Daraus wird kein
behobener Produktfehler abgeleitet. Der Build meldet weiterhin die bekannten
großen ECharts-/Dokumentexport-Chunks.

Die native Windows-Bedienstruktur war lesbar. Der Bildschirm-/Klickhelfer
scheiterte jedoch an `SetIsBorderRequired` beziehungsweise fehlender
Klickgeometrie. Die Browserprüfung ist deshalb keine vollständige native
Klickabnahme. Der echte native Download, Cache, PNG, Notiz und Neustart sind
davon unabhängig geprüft. Im App-Hintergrund bestanden bekannte Warnungen
zu EODHD-Intraday und laufender Zentralbanksynchronisierung; außerdem trat
erneut die bereits bekannte `pdf-extract`-Panic außerhalb der Atlas-Pipeline
auf. Es gab keinen neuen Atlas-Initialisierungsfehler.

Nachweise: [unabhängiger Quellenabgleich](evidence/fiscal-source-audit.json),
[tatsächlicher nativer Cache](evidence/fiscal-native-cache.json),
[native Prüfung und Bediengrenzen](evidence/fiscal-native-readiness.json).
Der gemeinsame [Gebietsaudit](evidence/geography-crosswalk.json) wurde für
Katalogstand `2026-09-09.11` neu erzeugt.

Der vollständige Atlas-Ausbau bleibt offen. Diese Quelle erweitert die
historische Länderbreite, liefert aber keine fehlenden Sektorbewertungen.
