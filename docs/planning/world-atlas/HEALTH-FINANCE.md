# Gesundheitsbilder · WHO GHED

## Produkt und Bedienung

Unter **Menschen → Gesundheit & Pflege → Gesundheitsausgaben** öffnet der Atlas die
Gesundheitsfinanzierung. Sieben Gruppen enthalten höchstens sechs kleine Bilder:
Umfang und Priorität, Herkunft der Mittel, Versicherungen und Systeme,
Grundversorgung und Vorsorge, Versorgung und Arzneimittel, Investitionen sowie
Gesundheitsbereiche. Ein Bild lässt sich vergrößern. Zahlen sind optional.
Krankenhäuser, Medizintechnik, Arzneimittel, Pflege, Krankenversicherung und
Vorsorge besitzen zusätzlich präzise Einstiege; die jeweilige Ausgabenabgrenzung
steht unmittelbar am Bild. Bestehende explizite WDI-Links bleiben gültig.

Die Auswahl umfasst 38 veröffentlichte Messgrößen für 195 Länder/Gebiete,
einschließlich Deutschland, USA, Indien und China. Jede Messgröße besitzt ihre
eigene Skala; dieselbe Messgröße teilt bei zwei Ländern Kalender, Einheit und
Maßstab. Vergleiche brauchen ein gemeinsames tatsächlich verfügbares Jahr und
denselben Quellenstand. Fehlt das Vergleichsbild, bleibt das Hauptland sichtbar.
Welt- oder Kontinentdurchschnitte werden nicht konstruiert.

Diese Bilder zeigen Ausgaben und Finanzierungsstrukturen. Sie messen weder
fairen Börsenwert noch Versorgungsqualität, Erkrankungshäufigkeit oder
Behandlungserfolg. Die WHO-Reihen beginnen frühestens 2000 und bilden hier
keinen Jahrhundertzyklus. Alle Jahreswerte werden als Punkte dargestellt:
Kreise für das Hauptland, Rauten für den Vergleich, hohle Zeichen für
vorläufige Werte. Es gibt keine Verbindung über Jahre, Glättung oder
Fortschreibung. Ein beobachteter Sprung kann durch die Erhebungsmethode entstehen.

## Quellenstand und Bedeutung

Die kostenlosen Originaldateien kommen direkt aus dem
[WHO Documentation Centre](https://apps.who.int/nha/database/DocumentationCentre/en).
Der Download „GHED all data (March 2026).xlsx“ enthält laut eigenem Versionsblatt
eine **Korrektur vom 1. April 2026**. Die zusätzliche Länderhinweisdatei trägt den
Stand Dezember 2025. Beide Dateien werden gemeinsam geprüft und gespeichert.

| Datei | SHA-256 | Größe |
| --- | --- | --- |
| GHED Data | `729c4d978178fe82e14bb57319837df0d7309e01b0b469462537ef2d73969594` | 38.922.209 Bytes |
| Country notes | `04a919b6a588219ffe037b7a280a7e3f98e404531ef7d39a0fb77a91f3acfe59` | 96.454 Bytes |

Der Datenstand umfasst 4.612 Länderjahre, 81.762 Zahlen und 93.494 fehlende
Zellen der gewählten 38 Messgrößen. 32.667 ursprüngliche Methodenzeilen sowie
die Länderhinweise bleiben erhalten. Die Metadaten gelten für Ausgangsgrößen
und Zeiträume; daraus wird kein vermeintlich exakter Mess-/Schätzstatus je
Zelle abgeleitet. Der allgemeine Status lautet **WHO-Statistik mit Schätzungen**.
2024 bleibt ausdrücklich vorläufig, auch wenn dieses Kalenderjahr vergangen ist.

Die [WHO-Methodik](https://apps.who.int/nha/database/DocumentationCentre/GetFile/64181221/en)
begrenzt die Interpretation:

- Laufende US-Dollar enthalten Preis- und Wechselkursveränderungen. Sie sind
  weder reale Wachstumsraten noch kaufkraftbereinigte Versorgungsmengen.
- Finanzierungsquellen (FS) unterscheiden sich von Finanzierungssystemen (HF).
  Direkte Haushaltszahlungen enthalten keine Versicherungsbeiträge. Mehrere
  gezeigte Untergruppen überschneiden sich und dürfen nicht addiert werden.
- Die WHO-Grundversorgung enthält unter anderem ambulante Leistungen,
  gesundheitliche Langzeitpflege und Prävention sowie jeweils 80 Prozent der
  Ausgaben für medizinische Güter außerhalb von Leistungen und für Verwaltung.
- Arzneimittelausgaben insgesamt (HC.RI.1) sind ein zusätzlicher Merkposten über
  Versorgungswege hinweg. Krankenhausanbieter (HP.1) umfassen öffentliche und
  private Träger und überschneiden sich mit den Versorgungszwecken (HC).
- Investitionen (HK) stehen getrennt von laufenden Ausgaben. Fehlende HK-Werte
  werden von der WHO nicht geschätzt. Ausstattung meint Investitionen der
  Gesundheitsanbieter, keine Umsätze der gesamten Medizintechnikbranche.
- Krankheitsgruppen zeigen zugeordnete Ausgaben, keine Belastung durch
  Krankheiten. Die WHO verteilt manche nicht spezifischen Ausgaben auf Gruppen.
- Kleine Überschreitungen von hundert in veröffentlichten Inlandsquoten
  bleiben erhalten. Weder gekappte Werte noch auf hundert normierte Ersatzbilder.

Bekannte Hinweise stehen für die vier ausdrücklich gewünschten Länder direkt
in der Ansicht: Deutschlands Versicherungsbruch 2010 und eingeschränkte
Vergleichbarkeit der privaten Funktionszuordnung um 2015; Indiens Haushaltsjahr
April–März und aktuelle Schätzungen; Chinas fehlende neue Meldung und WHO-Schätzung;
US-Abweichungen von SHA 2011 und veränderte Versicherungszuordnung seit 2014.
Alle anderen Ländertexte bleiben im Quellenabschnitt vollständig zugänglich.
Die Punkte behaupten keine lückenlos vergleichbare nationale Messgeschichte.

## Umsetzung und Prüfung

`health_source.rs` prüft beide unveränderten Dateien, Metadaten, Codebook,
Einheiten, Landesidentitäten, doppelte Jahre und den vollständigen Umfang.
Die 4.120 Spalten des Datenblatts werden mit dem vorhandenen Calamine-Zellleser
gestreamt; im Speicher liegt nur eine ausgewählte Datenzeile statt einer
rechteckigen Tabelle mit 19 Millionen Zellen. Keine neue Bibliothek oder API.
Die nur formatierte Schlusszeile der Länderhinweise erzeugt kein Zusatzland.

Atlasmigration `0017_health_finance.sql` ergänzt einen separaten öffentlichen
Gesamtstand und Länderprofile. Übernahme und Austausch sind atomar, vorherige
Daten bleiben bei Fehlern erhalten. Der Download teilt die globale Atlas-Sperre
und den Mindestabstand von 24 Stunden. Öffnen und Ländervergleich lesen nur den
lokalen Cache. Der Browser simuliert weder Download noch persönliche Speicherung.

`healthGroup`, `healthMetric` und `healthSince` gehören zur URL, letzten Ansicht
und Notiz. Der ausdrückliche Wert `overview` erhält auch die Übersicht eines
engen Themeneinstiegs. Quelle `who` bewahrt beide Dateihashes in der Notiz;
die SVG-Bildbeschreibung enthält Einheit, Länder, Zeitspanne, Schätzstatus und
vorläufige Markierungen. Persönliche Daten gehen nicht an WHO.

Unabhängige Prüfer:

- [Originaldatei-Audit](evidence/audit_health_source.py),
  [Quellennachweis](evidence/health-source-audit.json)
- [Gebietsprüfung](evidence/audit_geographies.py)
- [Native Prüfung](evidence/check_health_native.py)

Der JSON-Commandpfad verwendet den vorhandenen `serde_json`-Leser: Nach dessen
erneutem Lesen unterscheiden sich 8.949 Werte im Vergleich zum Python-Original
um genau eine binäre Rundungseinheit (ULP). Fehlwerte und Texte stimmen exakt.
Diese numerisch winzigen Protokollabweichungen werden im unabhängigen Prüfer
ausdrücklich gezählt; sie gelten nicht als exakt identische Zahlen. Für den
persistierten Cache gilt weiterhin der separate exakte Originalvergleich.

Die echte App-Prüfung hat beide Originaldateien ohne zusätzliche API direkt von
der WHO geladen. Alle 195 gespeicherten Profile stimmen mit dem unabhängigen
Originalvergleich überein: 81.762 Zahlen, 93.494 Fehlwerte, 32.667 Methodenzeilen
und 195 Länderhinweise. Der echte Prozessneustart erhält alle 197 Antworten
(einschließlich zweier unversorgter Aggregate), Notiz und PNG ohne neuen Download.
Die 8.949 Protokollrundungen betreffen das erneute JSON-Lesen, nicht die exakt
geprüften Zahlen des gespeicherten Caches.

Der öffentliche PNG-Prüfstand hat SHA-256
`4080298a9754df9994aa21b2b47151c6900375ee8e7b5ec690a61778ebc37a4e`.
Die spätere kleine Layoutänderung zieht die Bilder vor die allgemeinen
Länderhinweise und füllt die Länderzeichen der Legende passend zu den
historischen Punkten; das vorher gespeicherte Bild bleibt unverändert.

Die Browser-Sichtprüfung verwendet ausschließlich diese öffentlichen nativen
Snapshots: DE/USA, Indien/China, Einzelbild per Tastatur, Gruppen-/Zeitwechsel,
optionale Zahlen, fehlende Untergruppen, ein fehlendes Weltprofil,
Österreichs hohler 2024-Punkt, genauer Quellenlink und WDI-Rückweg.
Bei 1024/1440 px entsteht kein zusätzlicher horizontaler Überlauf gegenüber der
vorhandenen App-Mindestbreite. Die echten nativen Befehle und die Speicherung
sind geprüft; eine native Klickabnahme bleibt offen, da die verfügbare
UI-Steuerung nur den Browser erreicht.

Im ersten und zweiten isolierten App-Lauf initialisiert der Atlas ohne neue
Warnungen. Die bereits bekannte fremde EODHD-Intraday-Warnung tritt in beiden
Läufen auf; beim Neustart zusätzlich der bekannte Zentralbankbericht-Konflikt.
Es wird deshalb kein vollständig warnungsfreier App-Hintergrundlauf behauptet.
Der [Bereitschaftsnachweis](evidence/health-readiness.json) hält die Ergebnisse fest.
