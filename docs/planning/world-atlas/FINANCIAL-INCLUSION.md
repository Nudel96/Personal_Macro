# Finanzielle Teilhabe mit Global Findex

Stand: 9. September 2026. Der Atlas ergänzt 42 veröffentlichte
Befragungsperspektiven in sieben Gruppen für 174 Quellenprofile: 162 Länder
und Gebiete sowie zwölf Welt-, Regions- und Einkommensaggregate. Deutschland,
Vereinigte Staaten, Indien und China verwenden denselben Datenpfad. Die
Gebietszuordnung belegt keine vollständige Historie jeder Messgröße.

## Bedienung

**Wirtschaft & Kapital → Finanzsystem & Verschuldung → Finanzielle Teilhabe**
öffnet Konten und Karten. **Zahlungsverkehr** öffnet Geld empfangen und senden;
**Technologie & Wissen → Digitalisierung & Kommunikation → Digitale Zahlungen**
öffnet die entsprechende Zahlungsgruppe. Alle drei Einstiege führen in denselben
geprüften Findex-Bestand.

Die sieben Gruppen sind Konten und Karten, Zugangshürden, digitale Zahlungen,
Sparen und Leihen, finanzielle Reserven, Geld empfangen und senden sowie digitale
Teilhabe. Jede Übersicht enthält sechs auswählbare Bilder. Alle Karten verwenden
dieselbe vollständige Anteilsskala von niemandem bis zur gesamten gewählten
Bevölkerungsgruppe. Kreise bezeichnen das Hauptgebiet, Rauten den Vergleich.
Zahlen bleiben einschließlich der Punktbeschriftungen optional.

Fünf Bevölkerungsgruppen sind auswählbar: alle Erwachsenen ab 15 Jahren,
Frauen, Männer und Erwachsene aus den ärmeren 40 beziehungsweise wohlhabenderen
60 Prozent der Haushalte. Die Einkommensgruppen sind innerhalb der jeweiligen
Volkswirtschaft definiert. Sie sind keine weltweit gleichen Einkommensgrenzen.
Fehlende Untergruppen werden nicht durch alle Erwachsenen ersetzt.

**Findex-Erhebungen kostenlos laden** lädt einmalig den öffentlichen
Länderbestand. Danach bleiben die Bilder offline lesbar. Der Browseradapter
zeigt ausdrücklich den Desktop-Hinweis; er erzeugt keine persönlichen Notizen
oder vorgetäuschten Downloads. **Daten & Quellen** prüft jede Messgröße anhand
der tatsächlichen Gesamtbevölkerungswerte. Ein Suchtreffer wie „Online eingekauft“
öffnet genau dieses Maß und nicht irgendein verfügbares Zahlungsbild.

## Quelle und Bedeutung

Quelle ist die öffentliche [Global-Findex-2025-Länderdatei der Weltbank](https://www.worldbank.org/en/publication/globalfindex/download-data).
Der feste CSV-Download benötigt keinen API-Schlüssel. Die Definitionen stammen
aus dem separat geprüften [offiziellen Glossar](https://thedocs.worldbank.org/en/doc/be6615202d1f08a25855c8ac2d615122-0050012025/related/GlobalFindex2025-glossary.xlsx).
CSV- und Glossarhash, Ausgabe, Abrufzeit und tatsächliche Gebietskennung bleiben
mit der Ansicht nachvollziehbar. Der öffentliche Rohdatenbestand wird nicht
ins Repository kopiert.

Die ausgewählten Reihen sind gewichtete Befragungsanteile. Die vorhandenen
Quellenjahre sind 2011, 2014, 2017, 2021, 2022 und 2024. In 16 Ländern wurde die
Runde 2021 erst 2022 durchgeführt; diese [nachgeholten Erhebungen](https://microdata.worldbank.org/index.php/catalog/4607)
behalten ihre tatsächliche Quellenzuordnung. Es entstehen keine jährlichen
Zwischenwerte. Neue Fragen können nur einen einzigen Datenpunkt besitzen.

Zwischen Erhebungspunkten werden keine Linien gezeichnet. Kleine Unterschiede
sind kein Nachweis statistischer Signifikanz. Fragen, Erhebungsarten,
Gebietsausschlüsse und Stichproben können sich unterscheiden; die App erfindet
keine Konfidenzintervalle. Zwei Gebiete werden nur bei gleichem Quellenstand,
gleicher Bevölkerungsgruppe und mindestens einem gemeinsamen Erhebungsjahr
überlagert. Fehlt der Vergleich, bleibt das Hauptgebiet sichtbar. Optionale
Zahlen beziehen sich auf das jüngste tatsächlich gemeinsame Jahr.

Die ausgewählten Messgrößen verwenden die gesamte gewählte Erwachsenengruppe
als Nenner. Bedingte Untergruppenfelder werden nicht vermischt. Zugangshürden
und weitere Mehrfachantworten dürfen nicht zu einer Gesamtsumme addiert werden.
„Nicht als möglich angegeben“ enthält auch unbekannte oder verweigerte
Antworten. Die Notgeldfrage bezieht sich auf einen fragebogenspezifischen
Betrag, ohne daraus eine weltweit gleiche Geldsumme zu machen. Onlinekäufe
beschreiben die Verbreitung unter Menschen und keine Handelsumsätze.

Zwölf veröffentlichte Aggregate bleiben explizit benannt. Elf erhalten eigene
`findex:*`-Kennungen; nur das Weltaggregat verwendet `world`. Die regionalen
Gruppen schließen überwiegend hohe Einkommen aus und sind keine vollständigen
Kontinentalstatistiken. Es gibt keine eigenen Ländergewichte, Regionsmittel,
Zyklusmodelle oder Anlagebewertungen aus diesen Anteilen.

## Speicherung und unabhängiger Quellenabgleich

Atlasmigration `0021` speichert den gesamten Stand atomar im separaten
öffentlichen Atlas-Cache. Die gemeinsame Abrufsperre und mindestens 24 Stunden
zwischen erfolgreichen Abrufen gelten. Fehler erhalten den letzten Stand.
`findexGroup`, `findexMetric`, `findexPopulation` und `findexSince` gehören zur
letzten Auswahl und zum Merkkontext; das feste PNG benennt seine Bevölkerung.
Persönliche Notizen verbleiben in der Journal-Datenbank und ihrem Backup.

Der Import validiert 17.643.094 Bytes, SHA-256, alle 438 Spalten, 8.577
demografische Quellenzeilen, Gebietsidentitäten, Populationen und Erhebungsjahre.
3.766 ausgewählte Zeilen enthalten 59.471 veröffentlichte Zahlen und 98.701
fehlende Zellen. 273 Zahlen sind echte Nullwerte. Zehn kleine Anteile stehen
in wissenschaftlicher Schreibweise. Sämtliche numerischen Quellstrings bleiben
unverändert gespeichert; erst die Anzeige rechnet den Anteil in Prozent um.

Der unabhängige Python-/Decimal-Abgleich prüft CSV, Glossar und Zuordnungen
gegen alle Rust-/SQLite-Antworten. Alle 174 Profile stimmen einschließlich
sämtlicher Zahlen, Fehlwerte und Populationen exakt überein, auch nach erneutem
Öffnen des temporären Caches. [Quellennachweis](evidence/findex-source-audit.json).

## Verifizierte Prüfungen und Grenzen

- Drei Rust-Prüfungen bestehen, einschließlich Originaldatei-Roundtrip,
  Dezimal-/Fehlwertfällen, Migration aus dem vorherigen Cache, atomarem Rollback,
  gemeinsamer Abrufsperre und Offline-Wiederöffnung.
- 268 Atlas-Frontendtests in 38 Dateien bestehen. Die sechs Findex-Tests wurden
  nach Ergänzung der wissenschaftlichen Schreibweise und der Bevölkerungsangabe
  im Bild erneut bestanden. Typecheck, gezieltes ESLint, Rustfmt, Clippy mit
  `-D warnings` und Produktionsbuild bestehen.
- Im isolierten Profil `com.personal-macro.atlas-findex-20260909` wurden der echte
  kostenlose Download, alle 174 Profile und ein nicht unterstütztes Gebiet über
  echte Tauri-Commands geprüft. Nach nachgewiesenem Prozesswechsel bleiben
  Quellenstand, alle Profile, Indien-/China-Kontext für Frauen, Notiz und
  ursprüngliches PNG unverändert. Es wurde kein erneuter Findex-Abruf gestartet.
  [Nativer Nachweis](evidence/findex-native-readiness.json).
- Die Browser-Sichtprüfung verwendet die unveränderte Produktkomponente mit
  den öffentlich belegten Rust-/SQLite-Antworten. Sie prüft Länderwechsel,
  Bevölkerungswahl, Einzelbild/Übersicht, tatsächliche Vergleichsjahre,
  fehlende Gegenstücke, Findex-Regionen, genaue Quellensuche und Tastaturwege
  bei 1024 und 1440 Pixeln. Das ersetzt keine native Klickabnahme.

Während einer früheren HMR-Aktualisierung meldete die temporäre Prüfhülle einen
doppelten React-Root. Nach frischem Laden trat keine neue Browserwarnung oder
kein neuer Browserfehler auf. Die Prüfhülle gehört nicht zum Produkt-Build.

Die bekannten Technicals-/Zentralbank-Hintergrundwarnungen traten beim
isolierten App-Start erneut auf. Im ersten Prozess trat auch die bereits
dokumentierte `pdf-extract`-Panic außerhalb der Atlas-Pipeline auf. Der Atlas
initialisierte und bestand seine Speicherprüfung. Ein insgesamt fehlerfreier
App-Hintergrundlauf und die vollständige native Bedienabnahme werden damit
nicht behauptet. Der bekannte Vite-Hinweis auf große Chunks bleibt bestehen.

[Prüfprotokoll](evidence/findex-readiness.json), [Datenabdeckung](COVERAGE.md),
[Gesamtstand](IMPLEMENTATION-STATUS.md).
