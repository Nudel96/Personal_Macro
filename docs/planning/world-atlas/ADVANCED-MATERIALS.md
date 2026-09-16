# Neue Materialien · veröffentlichte Patent-Zeitraumwerte

Die EU-Studie *Patent landscape analysis in the field of advanced materials*
(2026, DOI 10.2777/0610738) ergänzt zwölf Perspektiven zum Thema
`innovation:advanced_materials`. Tabelle 1, PDF-Seite 17, enthält 36 Fakten für
EU-Patentämter einschließlich EPA, USPTO und CNIPA im gesamten Zeitraum
2010–2024. Die Studie erschien am 1. September 2026; das Manuskript wurde im
Juli 2026 abgeschlossen. Sie steht unter CC BY 4.0, Europäische Union 2026.

## Bedeutung und Grenzen

Die Quelle verwendet ausgewählte Patentklassen für fortgeschrittene Werkstoffe
und fünf prioritäre Sektoren. Angezeigt werden DOCDB-Patentfamilien mit mindestens
einem Unternehmensanmelder und ihr veröffentlichter Triadenanteil. Bau,
Elektronik, Energie, Medizintechnik und Mobilität überschneiden sich. Deshalb
wird die getrennt veröffentlichte eindeutige Gesamtsumme unverändert übernommen;
die fünf Sektoren werden nicht addiert. Das Medizintechnik-Tabellenlabel NACE
3250 bleibt als solches bezeichnet, ohne aus einem breiteren Anhang eigene
Zahlen abzuleiten.

Prioritätszuständigkeit bedeutet das Amt der frühesten Anmeldung, keinen
Unternehmenssitz oder Erfinderwohnort. Die EU-Gruppe umfasst EU27-Ämter **und**
das Europäische Patentamt und hat deshalb das eigene Gebiet `eu:am_priority`.
Sie ersetzt weder einen nationalen Wert noch `eurostat:eu27_2020`. Mehrdeutige
Prioritätsregionen bleiben entsprechend der Tabelle ausgeschlossen. Triadische
Familien wurden bei EPA, USPTO und JPO angemeldet. Dieser Anteil beschreibt
internationale Schutzstrategien; er ist keine allgemeine Qualitäts- oder
Bewertungsnote. Tabellen zu Universitäten oder Unternehmensstandorten werden
wegen anderer Grundgesamtheiten nicht beigemischt.

## Darstellung und Import

`frequency=period_total`, `kind=period_snapshot` und die Originalperiode
`2010/2024` speichern genau einen Wert je Profil. Es gibt keine Jahresaufteilung,
Interpolation oder Zeitfilter, die Teile dieses Gesamtwerts vortäuschen.
Horizontale Balken vergleichen das gesamte Fenster. Zählwerte verwenden für
alle Quellengebiete 0–200.000; Anteile 0–100 Prozent. Zahlen und Zahlen-Tooltips
bleiben optional. Die Abdeckung nennt ausdrücklich „Zeitraumwert 2010–2024“.

Der native Adapter `public_materials.rs` lädt die fest geprüfte öffentliche PDF,
prüft SHA-256, Seitenzahl, DOI, Tabellenüberschrift, Spalten und Gebietssystem.
`pdf-extract` liest die Originaltabelle; PyPDF und die visuelle Prüfung der
Originalseiten bilden den unabhängigen Kontrollweg. Ganzzahlige Zählwerte und
Quellendezimalstellen bleiben erhalten. Atlasmigration 0022 speichert das Paket
atomar unter der gemeinsamen Abrufsperre mit mindestens 24 Stunden Abstand.

Quelle: [EU-Publikationsportal](https://op.europa.eu/en/publication-detail/-/publication/18eaba28-a5ac-11f1-b25c-01aa75ed71a1/language-en).
Nachweise: `evidence/public-materials-audit.json`, ergänzende Import-, native
Bedien- und Windows-Build-Nachweise unter `evidence/public-materials-*`.
