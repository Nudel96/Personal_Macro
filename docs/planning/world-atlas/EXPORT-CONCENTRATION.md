# Exportkonzentration aus WITS-Spiegeldaten

Geprüft am 11. September 2026. `trade:export_concentration` verwendet den
veröffentlichten Herfindahl-Hirschman-Produktindex aus dem ausdrücklich als
**Mirrored Export** bezeichneten Weltbank-Datensatz **0064719**. 7.739 originale
Indexwerte und zwei leere Quellenzellen bilden 239 Profile: 238 Länder/Gebiete
und der veröffentlichte Weltindex. Die Geschichte reicht je Gebiet
unterschiedlich weit, insgesamt von 1988 bis 2022. Stand der Originale ist
**11. März 2023**, nicht das spätere Änderungsdatum der Katalogwebseite.

## Quellenentscheidung und Bedeutung

Der [WITS-Bulk-Katalog](https://wits.worldbank.org/bulkdownload.aspx) verlinkt
getrennte normale und gespiegelte Exportdateien. Die Beschreibung der normalen
Variante 0064718 nennt widersprüchlich ebenfalls Spiegeldaten. Auch ihr
Downloadverzeichnis enthält Links zu einem anderen Indikator. Deshalb wird
ausschließlich die konsistent bezeichnete
[gespiegelte Variante 0064719](https://datacatalog.worldbank.org/search/dataset/0064719/herfindahl-hirschman-product-concentration-index-mirrored-export)
mit ihrem eigenen, überprüften Verzeichnis genutzt. Keine gemischten Reihen.

Spiegelexporte verwenden die Importmeldungen der Handelspartner. Sie sind kein
unveränderter Bericht der Exporteure und können wegen Transit, Preisen,
Ursprungsangaben und Meldeumfang abweichen. Der originale WITS-Index beschreibt
die Verteilung des Warenwerts über sechsstellige HS-Produktpositionen. Die
Basis ist HS 1988/92 (`H0`), der volle Produktausschnitt `Tier3`, der Partner
`WLD`. Nach der [WITS-Definition](https://wits.worldbank.org/WITS/WITS/TradeIndicatorsHelp/TradeOutcomes_Help.htm)
bedeutet ein höherer Index eine stärkere Konzentration. Der Index ist weder
eine Prozentquote noch eine Wertpapierbewertung. Dienstleistungen und die
Konzentration auf Absatzländer sind andere Größen. Die App übernimmt den
Quellenindex und berechnet keine alternative Herfindahl-Formel oder Schwelle.

## Jahres- und Gebietsgrenzen

Das [Originalverzeichnis](https://datacatalogfiles.worldbank.org/ddh-published/0064719/DR0092974/bulk_files_Herfindahl-Hirschman_Product_Concentration_Index_Mirrored_Export.xlsx)
enthält 35 Archive und nennt für alle den Stand 11.03.2023. Der Datenrand 2022
enthält nur 32 berichtende Partnerfelder, gegenüber 141 im Jahr 2021 und 155
im Jahr 2020. Auch frühere Meldeabdeckung variiert. Deshalb bekommt 2022 einen
ausdrücklich redaktionellen Hinweis und einen Linienbruch; die Quelle
veröffentlicht selbst kein entsprechendes Statusfeld. Der originale Wert bleibt
sichtbar. Eine allein dadurch ausgelöste Änderung wird nicht als Markttrend
oder Werturteil ausgegeben. Es gibt keine aufgefüllten Jahre bis 2025.

Die [WITS-Gebietsmetadaten](https://wits.worldbank.org/API/V1/wits/datasource/tradestats-trade/country/ALL)
ordnen die originalen Kürzel ausdrücklich Zahlengebieten zu. Besonders wichtig:
`SDN` ist hier **ehemaliger Sudan 736**, `SUD` ist **Sudan 729**. Ebenso sind
`ROM`, `MNT`, `ZAR` und `TMP` überprüfte alte Quellkürzel für Rumänien,
Montenegro, Kongo-Kinshasa und Osttimor. ISO-Kürzel werden nicht blind interpretiert.

19 historische Gebiete oder Sonderkategorien bleiben ausgeschlossen; dazu
gehören Antillen, Belgien/Luxemburg gemeinsam, DDR, Sowjetunion, Bunker und
„Other Asia, nes“. Letzteres wird nicht Taiwan zugeschlagen. Das Archivkürzel
SRB reicht bis 1992 zurück, ist aber in den herangezogenen aktuellen
WITS-Metadaten nicht eindeutig aufgelöst. Es wird nicht mit der heutigen
serbischen Landesgeschichte gleichgesetzt.

Fünf weitere Archivzeilen vor den sicheren Gebietsgrenzen bleiben außerhalb
der Profile: Sudan wird ab dem ersten vollen Jahr nach der
[Teilung 2011](https://www.un.org/en/node/122910) gezeigt, Jemen ab dem ersten
vollen Jahr nach der [Vereinigung 1990](https://yemen.un.org/en/about/about-the-un).
Die Originale bleiben im Audit nachvollziehbar. Ein eigener Weltmittelwert oder
eine Zusammensetzung von Vorgänger- und Nachfolgestaaten findet nicht statt.

## Speicherung und Prüfung

`build_public_wits.py` liest alle 716.648 Originalzeilen unabhängig und prüft
die exakten Dimensionen, Länderfelder, Jahre und Dezimalwerte. Unter den
ausgewählten Weltpartner-Zeilen fehlen zwei Indizes, weil die Quelle jeweils
nur ein Produkt berücksichtigt: Anguilla 1988 und Westsahara 1989. Sie bleiben
leer. Vier winzig negative Rundungsartefakte liegen ausschließlich in nicht
ausgewählten bilateralen Teilindizes; diese werden weder importiert noch auf
null gesetzt. Wissenschaftliche Schreibweise bleibt unverändert erhalten.

`public_wits.rs` lädt die 35 fest freigegebenen ZIP-Adressen mit begrenzter
Dateigröße. Jedes Archiv wird anhand von Größe, SHA-256 und genau einem
erwarteten CSV-Namen geprüft. Die Paketkennung ist SHA-256 über die unveränderten
Original-ZIP-Bytes in aufsteigender Jahresfolge; die Grenzen stehen im Kontrakt.
Das ist kein neu erzeugter Datenbestand und keine selbst berechnete CSV.
Alle Teilimporte bleiben bis zur vollständigen Prüfung im Speicher. Die
bestehende Atlas-Sperre, 24-Stunden-Regel und atomare Migration-0022-Speicherung
gelten für das gesamte Paket. Ein Fehler lässt den vorherigen Stand erhalten.

Native Tests müssen alle 239 Profile vor und nach einem temporären SQLite-
Neustart exakt mit dem unabhängigen Audit vergleichen. Negative oder zu große
Indizes, falsche Klassifikation, Jahre, Gebiete, Produkte, Duplikate und
unvollständige Archive werden abgelehnt. UI-Prüfungen sichern die gemeinsame
Skala 0–1, sichtbare Lücken, den getrennten Endpunkt, optionale Zahlen und
eine ausreichende Präzision für kleine Werte. Der Browser erfindet keine Daten.

Die Quelle ist kostenlos unter CC BY 4.0 mit Herkunftsnennung verfügbar.
Lokaler Originalabgleich, native Bedienung und regulärer Windows-Build werden
im 40-Themen-Ledger erst nach erfolgreicher Prüfung als abgeschlossen markiert.
