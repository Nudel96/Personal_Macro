# BIS-Immobilienbilder

Stand: 9. September 2026. Die Erweiterung zeigt langfristige Wohnimmobilienpreise
aus der öffentlichen BIS-Datei. Sie ergänzt die Kreditbilder und die historischen
Wirtschaftsbilder; die gesamte Weltatlas-Aufgabe bleibt offen.

## Bedienung

**Leben & Versorgung → Wohnen & Immobilien → Wohnimmobilienpreise** und
**Lange Entwicklungen → Jahrhundertperspektiven → Lange Immobiliengeschichte**
öffnen dieselben geprüften Profile. Das Finanzzyklusmodell besitzt einen
ausdrücklichen Link zur Immobiliengeschichte.

- **Preisentwicklung** zeigt den veröffentlichten Index. Zunächst wird der
  Einfluss allgemeiner Verbraucherpreisinflation herausgerechnet.
- **Mit Inflation** wechselt zur nominalen Reihe. Beide Reihen beziehen sich
  auf den jeweiligen Jahresdurchschnitt 2010, keine gemeinsamen Hauspreise.
- **Steigen & Fallen** zeigt die veröffentlichte Veränderung zum
  Vorjahresquartal. Die Mittellinie bedeutet unverändert, keine faire Bewertung.
- **Gesamte Geschichte**, **Seit 1970** und **Seit 2000** begrenzen den Kalender.
  Die Indexansicht bietet gleiche Indexabstände oder gleiche relative
  Veränderungen (logarithmisch). Veränderungen zum Vorjahr bleiben linear und
  symmetrisch um null.

Zwei Gebiete teilen Kalender und Skala. Einzelne frühere Quartale und fehlende
Zellen bleiben erhalten; eine Verbindung über Lücken wird nicht gezeichnet.
Vergleiche benötigen denselben Quellenstand und mindestens ein gemeinsames
nutzbares Quartal. Wenn der Vergleich fehlt, bleibt das Hauptbild sichtbar.
Jede Linie nennt ihren tatsächlichen Zeitraum. Zahlen, Tooltips und Quartalstabelle
sind zunächst verborgen. Farbe und Strichart unterscheiden die Gebiete.

`propertyMode`, `propertyBasis`, `propertySince` und `propertyScale` gehören zur
URL, letzten Auswahl und gemerkten Ansicht. Ungültige Auswahlen erhalten
definierte Standardwerte. Quellenhash und Rezept werden im Merkkontext
aufbewahrt. Die Bildbeschreibung nennt Preisbasis, Einheit und gegebenenfalls
logarithmischen Maßstab auch im festen Diagrammbild.

## Quelle, tatsächliche Abdeckung und Bedeutung

Die [BIS-Übersicht](https://data.bis.org/topics/RPP) beschreibt vier ausgewählte
Quartalsreihen: nominaler und realer Index sowie deren Vorjahresänderungen.
Die realen Reihen sind mit Verbraucherpreisen bereinigt. Die ausgewählte Reihe
soll dem jeweiligen nationalen Markt möglichst nahe kommen; Erhebungsgebiete,
Häusertypen und Methoden unterscheiden sich trotzdem.

Der feste [Gesamt-Download](https://data.bis.org/static/bulk/WS_SPP_csv_flat.zip)
enthält beim Audit 57 Länder/Wirtschaftsgebiete und vier veröffentlichte Aggregate.
Alle **61 Profile** werden übernommen, mit **35.652 ursprünglichen Zahlenwerten**.
Die vollständige Abdeckung steht im [unabhängigen Nachweis](evidence/property-native-readiness.json).

| Gebiet | Nominaler Index ab | Realer Index ab | Letztes Quartal |
| --- | --- | --- | --- |
| Deutschland | 1970-Q1 | 1970-Q1 | 2026-Q1 |
| USA | 1970-Q1 | 1970-Q1 | 2026-Q1 |
| Indien | 2009-Q1 | 2009-Q1 | 2026-Q1 |
| China | 2005-Q2 | 2005-Q2 | 2026-Q1 |
| Italien | 1927-Q1 | 1947-Q1 | 2026-Q1 |
| Südafrika | 1966-Q1 | 1966-Q1 | 2026-Q1 |

Vorjahresreihen können später beginnen. Der reale Index ist kein Preis/Miete-
oder Preis/Einkommen-Verhältnis und bestimmt weder Bezahlbarkeit noch
Unter-/Überbewertung. Es gibt keine prognostizierte Welle oder feste Zyklusdauer.

Die BIS-Aggregate werden unverändert verwendet: `bis:euro_area`,
`bis:property_world`, `bis:advanced_economies`, `bis:emerging_economies`.
Sie sind ausdrücklich von UN-/anderen Quellenregionen getrennt. Das BIS-Weltbild
umfasst ausgewählte Volkswirtschaften, keine vollständige Welterhebung.
Fehlende Afrika- oder andere Regionswerte werden nicht aus Ländern gemittelt.
Der gemeinsame Atlaskatalog umfasst damit 289 Gebiete.

Die [nationalen Ausgangsquellen](https://www.bis.org/statistics/pp/disclaimer.htm)
wurden im Dokumentstand vom **31. Juli 2026** geprüft und je Gebiet im
Produktkatalog hinterlegt. Quelle und nationale Institute werden in der
Detailansicht genannt; die Erläuterungen sind ausdrücklich keine offizielle
BIS-Übersetzung. Es gelten die [BIS-Nutzungsbedingungen](https://data.bis.org/help/legal).

Die [Methodendokumentation](https://www.bis.org/statistics/pp_selected_documentation.pdf)
ist mit Stand 29. Januar 2026 im Suchindex erreichbar; der direkte Download
lieferte bei der Prüfung HTTP 404. Die ebenfalls verlinkten Dateien
`pp_sources.pdf`, `pp_changes.pdf` und `pp_long_documentation.pdf` waren direkt
nicht abrufbar. Die alternative offizielle Quellenadresse oben lieferte die
aktuelle dreiseitige Quellenliste. Diese Zugriffsgrenze wird nicht als geprüfte
vollständige Länder-Bruchdokumentation ausgegeben.

Die 23 von der BIS historisch zurückgerechneten Länder tragen einen sichtbaren
Hinweis: lange Reihen verbinden verschiedene Quellen; frühe Quartale können
aus Jahreswerten interpoliert sein. Die importierte CSV besitzt zwar Spalten
für Brüche und Abdeckung, lässt diese aber vollständig leer. Es werden deshalb
keine präzisen Bruchdaten, homogenen Erhebungsabschnitte oder aktuellen
Länderabgrenzungen erfunden. Die heutige Veröffentlichung kann vergangene Werte
revidieren und ist keine Sammlung damals verfügbarer Datenstände.

## Native Übernahme und Integrität

`property_source.rs` verwendet ausschließlich die feste HTTPS-ZIP-Adresse:
Rustls, keine Weiterleitung, begrenzte Antwortzeit, höchstens 4 MiB ZIP und
32 MiB entpackter CSV. Genau ein erwartetes Mitglied wird im Speicher gelesen;
keine Dateipfade werden extrahiert. Identität, 16 Spalten, Quartalsfrequenz,
Preisart, Einheit/Indexbasis, Gebietskennungen, Status, Vertraulichkeit,
Datumsgrenzen und eindeutige Beobachtungen werden geprüft. Unbekannte
Quellenänderungen stoppen die Übernahme und erhalten den alten Stand.

Indexwerte müssen positiv sein; negative Vorjahresänderungen und echte
Nulländerungen sind zulässig. Nicht endliche Werte und unbekannte Tokens
werden abgewiesen. Die vier veröffentlichten Reihen werden unverändert
gespeichert. Wo beide Vergleichsindizes vorhanden sind, wird die
Vorjahresänderung gegen deren **Rundungsintervalle** geprüft. Das vermeidet
falsche Fehler bei sehr kleinen historischen Indizes. Diese Prüfung passte
zu sämtlichen verfügbaren Originaltripeln.

Atlasmigration **0009** ergänzt eigene Tabellen im öffentlichen Cache.
Ein vollständiger Stand wird atomar ersetzt; Lesen verbindet Metadaten und
Profil in einer Transaktion. Gemeinsame Atlas-Abrufsperre und 24 Stunden
Mindestabstand nach Erfolg gelten. Fehler verändern keine bisherigen
Quellendaten. Der Browser simuliert keinen nativen Abruf oder Speichererfolg.

## Erhobene Nachweise

- Echte Originalfixture: alle 2.580 Quellzeilen für Deutschland, Indien und
  Italien. Vier neue deterministische Rusttests prüfen Preise/Änderungen,
  unterschiedliche historische Anfänge, Null/fehlend, Quellenänderungen,
  Rundungswidersprüche, ZIP-Grenzen, Migration 8→9 mit bestehender Kreditzeile,
  atomaren Rollback, Offline-Wiederöffnung, Abrufsperre und Mindestabstand.
- Der ausdrücklich ausgeführte native BIS-HTTP-Test lädt den gesamten Datensatz
  in einen temporären Cache und liest die vier Nutzerländer, Italien,
  Südafrika, vier BIS-Aggregate und die ungebundene Welt zurück.
- Die reale Tauri-App verwendet ausschließlich das eigene Prüfprofil
  `com.personal-macro.atlas-property-validation`. Der tatsächliche asynchrone
  Command lud 61 Profile und beendete den Job erfolgreich. Nach einem echten
  Prozessneustart wurden die Profile mit unverändertem Quellenhash und
  Abrufzeitpunkt aus dem Cache gelesen; ein erneuter BIS-Download war nicht nötig.
- `audit_bis_property.py` liest Original-ZIP und ausschließlich dieses Prüfprofil
  unabhängig vom Rust-Parser. Alle 35.652 numerischen Werte stimmen exakt
  überein; 856 ergänzte fehlende Zellen bleiben leer. 9.127 Profilquartale,
  Gebietsidentitäten, Quellenhash und SQLite-Integrität sind bestätigt.
- Die Browserprüfung verwendet tatsächliche native öffentliche Antworten.
  Deutschland/USA, Indien/China, Italien und Südafrika wurden in den
  verschiedenen Darstellungen geprüft. Die BIS-Weltgruppe zeigt ihr eigenes
  Quellenaggregat und den Hinweis zur begrenzten Länderabdeckung. Bei 1024 Pixeln
  nutzbarer Breite und 1440 Pixeln Fensterbreite entsteht kein horizontaler
  Überlauf; die Browserkonsole bleibt ohne Fehler. Diese Prüfung ersetzt keine
  vollständige native Klickabnahme. Der native ECharts-PNG-Nachweis stammt aus
  der realen WebView nach dem Neustart und nennt die inflationsbereinigte Preisbasis.

120 Atlas-Frontendtests in 20 Dateien und 215 Rust-Library-Tests bestehen;
17 externe/manuelle Rustprüfungen sind im Standardlauf ausgenommen. Der neue
echte BIS-HTTP-Test wurde zusätzlich erfolgreich ausgeführt. Typecheck,
Produktionsbuild, gezielte ESLint-/Prettier-Prüfungen, Rustfmt und Clippy für
alle Targets mit `-D warnings` bestehen. Die Ergebnisse sind im
[Umsetzungsstand](IMPLEMENTATION-STATUS.md) und in der Nachweisdatei festgehalten.
Die bereits bekannte automatische EODHD-Technicals-Abfrage meldet im Prüfprofil
einen fehlenden Intraday-Datenzugriff; beim Neustart erscheint zusätzlich die
bereits dokumentierte Warnung über eine laufende Zentralbankbericht-Aktualisierung.
Der Immobilienadapter und die Atlasinitialisierung laufen erfolgreich.
