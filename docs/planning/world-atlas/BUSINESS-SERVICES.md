# Unternehmens- und persönliche Dienstleistungen

Geprüft am 11. September 2026. Zwei kostenlose Eurostat-JSON-stat-Pakete ergänzen
sechs Perspektiven in den ursprünglichen Themen `consumer_services:professional_services`
und `consumer_services:personal_services`. Sie beschreiben Unternehmen und
Erwerbstätige, keine Marktpreise oder faire Bewertung.

| Quelle | Ausschnitt | Jahre | Gebiete | Profile | Zahlen | offene Zellen |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| `sbs_ovw_act`, Stand 01.09.2026 | NACE Rev. 2 M und S96, ENT_NR / EMP_NR | 2021–2024 | 36 | 142 | 558 | 10 |
| `sbs_na_1a_se_r2`, Stand 01.03.2024 | NACE Rev. 2 M, V11110 / V16110 | 2005–2020 | 37 | 74 | 924 | 260 |

Die Gebiete enthalten jeweils das veröffentlichte EU27-Aggregat mit eigener
Atlas-ID. EU28 und EU27_2007 bleiben ausgeschlossen. Indien, Welt und andere
Gebiete werden nicht mit EU-Werten aufgefüllt. Zwei vollständig leere aktuelle
Gebiets-/Messgrößenkombinationen bilden kein Profil; Vertraulichkeitsmarker
bleiben dagegen auch ohne Zahl erhalten.

## Bedeutung und Quellenentscheidung

Die aktuelle [Eurostat-SBS-Methodik](https://ec.europa.eu/eurostat/cache/metadata/en/sbs_esms.htm)
beschreibt marktproduzierende statistische Unternehmen aller Größenklassen.
Sie werden nach ihrer Haupttätigkeit eingeordnet. Ein Unternehmen kann mehrere
rechtliche Einheiten umfassen. Die Erhebung kombiniert nationale Register,
Verwaltungsangaben, Befragungen und Schätzungen. Die Datenart heißt deshalb
„Quellenstatistik mit Schätzungen“.

M umfasst freiberufliche, wissenschaftliche und technische Tätigkeiten
(Recht, Buchführung, Beratung, Ingenieurwesen, Forschung, Werbung und Veterinärwesen).
S96 umfasst sonstige persönliche Dienstleistungen, unter anderem Wäscherei,
Friseur- und Bestattungsdienste. Die
[NACE-Rev.-2-Klassifikation](https://ec.europa.eu/competition/mergers/cases/index/nace_all.html)
grenzt diese von Gesundheitsversorgung, Bildung und privaten Haushalten ab.
„Erwerbstätige“ sind Kopfzahlen einschließlich tätiger Inhaber und mithelfender
Familienangehöriger, keine Vollzeitäquivalente oder reine Arbeitnehmerzahl.
Die statistische Einheit entspricht auch keiner Zählung aller Niederlassungen.

## Zeitgrenzen, Brüche und Lücken

Die EBS-Umstellung 2021 verändert Umfang und Definitionen. Deshalb bleiben die
beiden Quellen getrennt auswählbar. Das historische Paket enthält S96 nicht;
eine erfolglose S96-Abfrage wird nicht als langjährige Nullproduktion dargestellt.
Die [historischen SBS-Metadaten](https://ec.europa.eu/eurostat/cache/metadata/en/sbs_h_esms.htm)
warnen zusätzlich vor der Klassifikationsgrenze 2008. Ein ausdrücklich
redaktioneller Bruch trennt die vorhandenen früheren Punkte von 2008. Es wird
kein originales Quellenkennzeichen dafür erfunden.

Originale `b`, `bd` und `be` segmentieren Linien ebenfalls. `d`, `e`, `p`, `u`
und Kombinationen bleiben sichtbar. Historische EU-Aggregate mit `d` erhalten
den dokumentierten Hinweis auf gerundete Schätzungen; Teilaggregate müssen
deshalb nicht exakt aufsummieren. `|C` ist vertraulich und immer ohne Zahl.
Unbekannte Flags oder eine Zahl an einer vertraulichen Zelle verhindern den Import.
Eine echte numerische Null wäre zulässig, ist in den geprüften Originalen aber
nicht vorhanden. Es gelten weder die Null-Mehrdeutigkeit der Energiebilanzen
noch die Größenbeschränkungen der IT-Unternehmensbefragungen.

## Umsetzung und Prüfung

`public_sbs.rs` verbindet Branche und Indikator explizit zu einer Kennung.
Hash, Quellenversion, vollständige Dimensionen, Anbieterbezeichnungen,
Jahresgrenzen, Gebietsnamen, Einheiten und Integer-Zahlen werden vor der
atomaren Übernahme geprüft. Dezimalstrings bewahren die exakten Kopfzahlen.
Die gemeinsame Abrufsperre und 24-Stunden-Grenze gelten. Keine neue Migration,
kein Zugriff auf das Journal. Windows nutzt den vorhandenen Schannel-Client
mit aktiver Zertifikatsprüfung für Eurostat.

`evidence/build_public_sbs.py` zählt alle Originalzellen unabhängig als
kartesisches Produkt auf. Der native Decoder und ein temporärer SQLite-
Neustart müssen alle 216 Profile einschließlich fehlender Zellen, Markierungen
und Notizen exakt reproduzieren. Mutationstests prüfen falsche Tätigkeit,
Einheit, Jahresgrenze, Gebiet, Positionsindex, unbekannte Flags, negative oder
nicht ganzzahlige Werte und Zahlen in vertraulichen Zellen. Frontend-Prüfungen
sichern getrennte Quellenwahl, Klassifikationsbruch, offene Jahre und den
Browser ohne erfundene Daten.

Quellen dürfen laut [Eurostat-Wiederverwendungshinweis](https://ec.europa.eu/eurostat/help/copyright-notice)
mit Herkunft verwendet werden; Auswahl und deutsche Erläuterung durch die App
sind ausdrücklich gekennzeichnet. Die persönliche lokale Nutzung benötigt
keinen kostenpflichtigen Zugang.

Native Prüfung, tatsächlicher lokaler Import und regulärer Windows-Build werden
im 40-Themen-Ledger erst nach den jeweiligen erfolgreichen Nachweisen abgenommen.
