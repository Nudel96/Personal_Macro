# Fossile Synthesekraftstoffe · originale Anlagenberichte

Vier Perspektiven ergänzen `fuels:synthetic_fuels` aus sechs öffentlichen
Sasol-Betriebsberichten. 36 Originalfakten decken einzelne Anlagen in Südafrika
und Katar ab. Die Angaben beziehen sich auf Geschäftsjahre, die am 30. Juni
enden: 2024 bedeutet Juli 2023 bis Juni 2024. Ein wiederkehrender Jahreszyklus
wird daraus nicht berechnet.

| Perspektive | Tatsächlicher Zeitraum | Abgrenzung |
|---|---|---|
| Secunda · raffinierte Syntheseprodukte gesamt | 2020–2026 | Originalfeld Total Refined |
| Secunda · White Product | 2014–2019 | Engere historische Produktgruppe, getrennte Archivreihe |
| ORYX GTL · von Sasol berichtete Produktion | 2014–2026 | Veröffentlichte Beteiligungsberichterstattung, keine Hochrechnung auf die Gesamtanlage |
| ORYX GTL · Auslastung | 2014–2023 | Originale Prozentangabe zur Nennkapazität |

Secunda nutzt Kohle und Erdgas zur Fischer-Tropsch-Synthese; ORYX in Ras Laffan
wandelt Erdgas in flüssige Produkte um. Das sind fossile Synthesewege, keine
erneuerbaren E-Fuels. Sasols ORYX-Beteiligung beträgt 49 Prozent. Angezeigt wird
die unveränderte Betreiberangabe, keine daraus berechnete Gesamtproduktion.
Die geografische Zuordnung bezeichnet den Anlagenstandort, keine Landesmenge.
Produktionsmengen und Auslastungen werden nicht zu einem Länderwert addiert.

Die Berichte 2016 (PDF-Seite 20) und 2019 (PDF-Seite 41) liefern frühere Jahre.
Die originalen Fuels-Tabellen in den XLSX-Ausgaben 2022, 2023, 2025 und 2026
ergänzen die jüngeren Geschäftsjahre. Zwölf überlappende Zahlenzellen sind
unabhängig gegengeprüft. Quartalszahlen, Verkäufe, externe Käufe, Natref als
Rohölraffinerie, Chemikalien enthaltende Gesamterzeugung und Forecasts bleiben
ausgeschlossen. Auch die anders abgegrenzte ölähnliche Reserveproduktion aus
Form 20-F wird nicht beigemischt.

`public_synfuels.rs` lädt ausschließlich diese sechs festen Originaladressen.
Einzeldateigröße, SHA-256 und die Reihenfolge des Gesamtpakets werden geprüft.
PDF-Extraktion und Calamine lesen Tabellenbeschriftungen, Einheiten und volle
Geschäftsjahres-Spalten. Native XML-Dezimalwerte bleiben erhalten; so bleibt
auch die Excel-Repräsentation 4.0999999999999996 im Datensatz unverändert, während
die optionale Anzeige 4,1 zeigt. Der unabhängige Audit verwendet PyPDF und
OpenPyXL. Atlasmigration 0022 speichert alle Perspektiven gemeinsam und atomar,
mit globaler Abrufsperre und mindestens 24 Stunden Abstand.

Die Type1-Schrift des PDFs 2016 verwendet benannte Ziffernglyphen, die die
allgemeine Textextraktion nicht korrekt auflöst. Der native Adapter liest für
die fest geprüfte Tabellenseite deshalb die 95 originalen ToUnicode-Zuordnungen
und decodiert die ursprünglichen Textoperatoren darüber. Schriftidentität,
Zeichenumfang und Tabellenspalten werden geprüft. Die Originaldatei bleibt
unverändert; Ziffern werden weder per OCR noch anhand erwarteter Werte ergänzt.

Die Oberfläche zeigt die jeweilige Definition, Geschäftsjahresbasis,
Originalbericht je Punkt und die Beschränkung auf einzelne Anlagen. Explizit
gewählte, am Standort fehlende Perspektiven bleiben leer. Quellenhinweise und
fester Stand bleiben in gemerkten Ansichten erhalten.

Quellen: [Sasol-Betriebsberichte](https://www.sasol.com/investor-centre/financial-results),
[Anlagenbeschreibung in Form 20-F 2025](https://www.sec.gov/Archives/edgar/data/314590/000141057825001910/ssl-20250630x20f.htm).
Die Berichte sind öffentlich abrufbar; eine offene Weiterverbreitungslizenz wird
nicht behauptet. Die persönliche lokale Auswertung speichert die geprüften
Tabellenfakten mit Herkunft. Belege: `evidence/public-synfuels-*`.
