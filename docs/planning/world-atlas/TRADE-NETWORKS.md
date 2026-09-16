# Handelspartner und internationale Wertschöpfung

Geprüft am 11. September 2026. Zwei kostenlose OECD-TiVA-Pakete binden die
ursprünglichen Themen `trade:trade_partners` und `trade:supply_chains` an.
Sie beschreiben modellierte Absatz- und Produktionsverflechtungen der gesamten
Wirtschaft einschließlich Waren und Dienstleistungen.

| Paket | Auswahl | Länder | Profile | Werte | Geschichte |
| --- | --- | ---: | ---: | ---: | --- |
| `oecd-tiva-supply` | EXGR_FVA / EXGR_DVA, Partner W | 80 | 160 | 4.480 | 1995–2022 |
| `oecd-tiva-partners` | EXGR_PSH, einzelne Partner und WXD | 80 | 6.400 | 179.200 | 1995–2022 |

Die Quelle ist **TiVA Ausgabe 2025, Revision Januar 2026**, Datenstruktur 1.1.
Die versionierte OECD-Struktur nennt diese Revision ausdrücklich. Der
Veröffentlichungsstand bleibt als Monat gespeichert; ein nicht belegter Tag
wird nicht ergänzt. Ältere OECD-Webtexte zur Oktober-Revision sind nicht der
Stand dieser Dateien. Die Jahre 2023–2026 sind keine fehlenden Nullen.

## Bedeutung

Der [OECD-Leitfaden zur Ausgabe 2025](https://stats.oecd.org/wbos/fileview2.aspx?IDFile=2143f34e-6feb-41a9-abaf-cb52132608c4)
definiert Exportpartner als Anteil am gesamten Bruttoexportwert. Die beiden
anderen Größen sind der veröffentlichte ausländische und inländische
Wertschöpfungsanteil an Bruttoexporten. Keine Größe ist ein Wertpapierkurs,
eine faire Bewertung oder die Wahrscheinlichkeit eines Lieferausfalls.

Die OECD harmonisiert nationale Input-Output-Tabellen, Handelsstatistiken und
Volkswirtschaftliche Gesamtrechnungen. Sie ergänzt Lücken und gleicht
Asymmetrien aus; jüngste Jahre können fortgeschriebene Produktionsstrukturen
enthalten. Deshalb heißen alle Punkte **Modellschätzungen**, auch bei einer
lückenlosen jährlichen Linie. Die App ergänzt weder Schätzwerte noch eine
Sinusfunktion. Quelle und Einschränkungen stehen in der Ansicht.

## Gebiete und Vergleich

Die 80 einzeln modellierten Länder werden anhand der originalen Codes und
Gebietsnamen zugeordnet. Die 18 überlappenden OECD-Gruppen bleiben als
Ursprungsgebiete ausgeschlossen. Hongkong und Taiwan bleiben eigenständige
Quellenwirtschaften; Zypern bezeichnet das regierungskontrollierte Gebiet.
Die territorialen Quellenhinweise für Israel bleiben erhalten.

`WXD` ist der OECD-Rest der Welt mit rund 120 weiteren Volkswirtschaften.
Er bleibt als solcher benannter Partner erhalten. `W_O` ist eine andere,
überlappende Gruppe und wird nicht mit WXD verwechselt. `W` ist nur in den
beiden Wertschöpfungsquoten der globale Partnerbezug, kein Welt-Länderprofil.

Die 2.240 numerischen Nullzellen auf der Eigenland-Diagonale sind kein
Auslandshandel. Die eigene Partnerauswahl zeigt deshalb einen ausdrücklichen
Hinweis statt einer scheinbaren Nullgeschichte. Kein fremdes Land füllt diesen
Platz. Die übrigen originalen Nullen bleiben dagegen erhalten.

Die sechs größten Absatzmärkte werden aus den Anteilen desselben letzten
verfügbaren Jahres ausgewählt. Ältere Einzelwerte dürfen nicht in die Rangfolge
rutschen. Die Balken teilen einen Maßstab; ihr Zahlenwert bleibt der originale
Exportanteil. Ein Klick öffnet die Geschichte. Zahlen sind optional. Die
Zeitbilder teilen die natürliche Prozentskala 0–100, auch im Ländervergleich.

## Technische Prüfung und Speicherung

`build_public_tiva.py` prüft die Originale unabhängig mit Dezimalrechnung und
erzeugt Metadaten, Gebietskontrakt und vollständige Testprofile. Der native
Adapter `public_tiva.rs` prüft feste URL, Hash, Datenfluss, Spalten, Dimensions-
und Gebietscodes, Gesamtaktivität `_T`, Einheit `PT_EXGR`, Jahresfrequenz und
Skalierung null. Unbekannte Codes oder neue Jahre stoppen die Übernahme bis
zur Quellenprüfung. Alle Zahlenstrings einschließlich drei Nachkommastellen
bleiben erhalten.

Die vollständigen Matrizen müssen genau vorhanden sein. Partneranteile ergeben
je Land/Jahr unter Berücksichtigung der veröffentlichten Rundung 100 Prozent;
in- und ausländische Wertschöpfungsanteile ebenfalls. Die App normalisiert oder
berechnet fehlende Gegenstücke nicht selbst. Tests verändern gezielt Einheit,
Gebiet, Aktivität, Jahre, Werte, Paarabdeckung und doppelte Zellen. Alle 6.560
Profile müssen nach einem temporären SQLite-Neustart exakt dem unabhängigen
Originalaudit entsprechen.

Die zwei CSV-Dateien sind zusammen rund 24,4 MB groß. Der bestehende begrenzte
Downloader nutzt die öffentliche OECD-Adresse mit der transparenten App-Kennung.
Die gemeinsame Abrufsperre, 24-Stunden-Grenze und atomarer Austausch je Paket
gelten; Speicherung in der öffentlichen Atlas-Datenbank über Migration 0022.
Die [OECD-Nutzungsbedingungen](https://www.oecd.org/en/about/terms-conditions.html)
und die Originalquelle sind verlinkt. Kein zusätzlicher API-Schlüssel.

Der tatsächliche lokale Import wird in
`evidence/public-tiva-local-fill-2026-09-11.json` gegen jedes Originalprofil
geprüft. Native Bedienung und regulärer Windows-Build werden im 40-Themen-Ledger
erst nach erfolgreicher Prüfung abgenommen.
