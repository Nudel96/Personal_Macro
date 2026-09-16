# BIS-Kreditbilder

Stand: 9. September 2026. Implementiert für den eigenständigen Weltatlas.

## Bild und Zugang

Unter **Lange Entwicklungen → Jahrhundertperspektiven → Lange Kredit- und
Schuldenentwicklung** zeigt der Atlas eine reale langfristige Kreditwelle.
Die zweite Perspektive **Schulden & Trend** zeichnet die Schuldenquote und den
veröffentlichten BIS-Trend. Bei **Wirtschaft & Kapital → Finanzsystem & Verschuldung → Kreditvergabe**
bleibt die bisherige Weltbankstatistik auswählbar; **Kreditwelle · BIS** öffnet
die neue, anders abgegrenzte Grundlage. Auch die Finanzzyklusthese verlinkt sie.

Die Welle liegt oberhalb oder unterhalb ihres statistischen Trends. Ihre
Mittellinie ist keine faire Bewertung, kein Zielwert der Verschuldung und kein
Nachweis eines spirituellen Gleichgewichts. Die Daten besitzen keine feste
Zyklusdauer. Die App erfindet keine Sinusform, Wendepunkte oder Zukunftswerte.

Zahlen und Tooltips starten verborgen. Ganze Geschichte, seit 1980 und seit
2000 sind wählbar. Zwei Gebiete teilen Kalender und Maßstab; die Welle hat
symmetrische Bildhälften. Lücken werden nicht verbunden, vorhandene Nullwerte
bleiben Nullwerte. Trend und Quote werden nicht miteinander verwechselt.
Fehlt der Vergleich, bleibt das Hauptbild mit einem ausdrücklichen Hinweis
sichtbar. `creditMode` und `creditSince` bleiben über die URL, letzte Auswahl
und gemerkte Ansichten erhalten. Quellenhash und Berechnungsbezeichnung werden
mit dem festen Bildstand dokumentiert.

## Quelle und Abgrenzung

Die einzige neue Laufzeitquelle ist die frei zugängliche
[BIS-Gesamtdatei](https://data.bis.org/static/bulk/WS_CREDIT_GAP_csv_flat.zip),
verlinkt auf der offiziellen [Downloadseite](https://data.bis.org/bulkdownload).
Ein weiterer API-Schlüssel oder bezahlter Dienst ist nicht nötig.
Die [BIS-Nutzungsbedingungen](https://data.bis.org/help/legal) verlangen unter
anderem Quellenangabe und Kennzeichnung eigener Übersetzungen. Beides steht
in der Oberfläche. Die deutschen Erläuterungen sind keine offizielle BIS-Übersetzung.

Der Abruf umfasst 43 Länder und den Euroraum als eigenes BIS-Aggregat.
`data/credit-catalog.json` ordnet jeden Providercode und seine geprüfte
Quellenbezeichnung explizit zu. `bis:euro_area` ist weder EU noch UN-Europa.
Hongkong bleibt separat; für Welt, Afrika insgesamt und viele weitere Gebiete
gibt es keine eigene Reihe in dieser Datei. Es werden keine Regionalwerte
durch Mittelung erfunden. Der allgemeine Atlaskatalog enthält nach der Immobilienerweiterung 289 Gebiete.

Die Quote umfasst Haushalte und nicht finanzielle Unternehmen zusammen,
finanziert durch in- und ausländische Banken und andere Kreditgeber. Ihr Nenner
ist das nominale BIP der letzten vier Quartale, ihr Zähler der Schuldenbestand
am Quartalsende. Staatsschulden und jährliches Kreditwachstum sind andere Größen.
[Definition](https://data.bis.org/topics/CREDIT_GAPS).

Die drei veröffentlichten Datentypen bleiben getrennt:

| BIS-Code | Gespeicherter Wert | Einheit |
| --- | --- | --- |
| A | Kreditquote (`ratio`) | Prozent des BIP |
| B | Quellenmodelltrend (`trend`) | Prozent des BIP |
| C | Abstand A minus B (`gap`) | Prozentpunkte |

Der BIS-Trend verwendet einen einseitigen HP-Filter mit Glättungsparameter
400.000 und mindestens zehn Jahren Vorgeschichte. Die App übernimmt B und C
unverändert; sie berechnet keinen eigenen Filter. Quellenrevisionen können
auch die Vergangenheit verändern. Dieser heutige Download enthält keine
historischen Echtzeit-Datenstände.
[BIS-Methodik](https://www.bis.org/publications/qr-201609/recent-enhancements-bis-statistics).

## Tatsächlich geprüfte Geschichte

Die Originaldatei vom 9. September 2026 enthält 24.488 numerische Zellen in
9.336 Länder-/Quartalspunkten. In den Profilen bleiben weitere 3.520 Felder
vor allem während der Modellvorgeschichte ohne Wert. Alle Reihen enden im
geprüften Stand bei 2025-Q4. Der HTTP-Dateizeitpunkt ist kein ökonomisches
Beobachtungsdatum und wird nicht als Veröffentlichungsdatum ausgegeben.

| Gebiet | Beginn Quote | Beginn Welle |
| --- | --- | --- |
| Deutschland | 1960-Q4 | 1970-Q4 |
| USA | 1947-Q4 | 1957-Q4 |
| Indien | 1951-Q2 | 1961-Q2 |
| China | 1985-Q4 | 1995-Q4 |

Die aktuelle USA-Datei reicht weiter zurück als der ältere Einleitungstext
der BIS-Webseite. Maßgeblich für die gezeichneten Punkte ist die tatsächlich
geprüfte Originaldatei. Dies ist noch keine weltweite Kreditgeschichte seit
dem 19. Jahrhundert. Der Themenname verspricht deshalb kein solches Startdatum.

## Technische Grenzen und Nachweis

`credit_source.rs` nutzt einen festen HTTPS-Download mit Rustls, Zeitlimit,
vier MiB ZIP-Grenze und 32 MiB entpackter CSV-Grenze. Das Archiv wird nur im
Speicher gelesen; ein fremder Dateiname oder zusätzliche Einträge werden
abgelehnt. Geprüft werden Schema, Quartalsfrequenz, Gebiet, Sektor,
Finanzierungsquelle, Einheit, Multiplikator, Vertraulichkeit, Status,
Datumsgrenzen, numerische Werte, Duplikate und die Beziehung der drei Reihen.
Die Originalrundung von B und C erlaubt höchstens 0,000101 Prozentpunkte
Abweichung von A minus B minus C. Es wird kein Quellwert neu gerundet.

Der geprüfte Stand führt ausschließlich normale, frei veröffentlichte Werte.
Andere Status-/Metadaten werden bis zur ausdrücklichen Prüfung abgelehnt.
Leere numerische Felder bleiben leer; `NaN`, Unendlich, unbekannte Gebiete,
geänderte Einheiten und widersprüchliche Reihen brechen die Übernahme ab.
Die Datei enthält keine ausführliche historische Bruchbeschreibung je Land;
das wird im Methodikbereich der Oberfläche genannt.

Atlasmigration **0008** speichert das vollständige Paket in einer Transaktion
im öffentlichen Cache. Fehler behalten den alten Stand. Die gemeinsame
Abrufsperre und 24 Stunden Mindestabstand nach erfolgreichem Download gelten
auch hier. Es gibt keinen Hintergrundabruf und keinen Zugriff auf private
Journaldaten durch die BIS. Browsermodus liefert `desktop_required`.

Vier neue Rusttests prüfen Originalwerte, Vorlauf, Rundung, veränderte
Dimensionen/Status, Lücken, Nullwerte, ZIP-Grenzen, Migration von Version 7,
atomaren Rollback, Neustart, Abrufsperre und Cooldown. Sieben Frontendtests
prüfen Darstellung, Vergleich, Quellenidentität, Abdeckung, gespeicherte
Parameter, optionale Zahlen und Browsergrenzen. Der echte HTTP-Test wurde
zusätzlich ausdrücklich ausgeführt.

Der [unabhängige Auditor](evidence/audit_bis_credit.py) vergleicht jede
Quellenzelle mit dem über echte Tauri-Commands geladenen Cache im eigenen
Prüfprofil `com.personal-macro.atlas-credit-validation`. Er liest keine
produktive Benutzerdatenbank. Der [native Nachweis](evidence/credit-native-readiness.json)
enthält Herkunft, Länderzeiträume, Zellvergleich, Migration und das tatsächlich
gerenderte PNG. Die Browserprüfung verwendet dieselben echten öffentlichen
Snapshots; sie ersetzt keine vollständige native Klickabnahme.

## Weiterhin offen

Die BIS-Wohnimmobilien-Gesamtdatei ist ebenfalls öffentlich zugänglich. Ihr
Abruf wurde überprüft; sie ist noch nicht als Produktadapter eingebaut.
Historische Gebiets- und Methodenwechsel benötigen eigene Darstellung.
Die aktuelle ausgewählte Dokumentations-PDF lieferte HTTP 404; das ältere
Langseriendokument von 2019 allein reicht nicht als aktuelle Metadatenbasis.
JST-Finanzgeschichte, getrennte Haushalts-/Unternehmens-/Staatsschulden und
empirische gemeinsame Kredit-/Immobilienzyklen bleiben eigenständige Arbeiten.

Die abschließende Suite besteht mit **112 Frontendtests**, **211 Rusttests**,
Typecheck, ESLint, Clippy für alle Targets und Build. 16 externe/manuelle
Rusttests sind im Standardlauf ausgenommen; der neue BIS-HTTP-Test wurde separat
bestanden. Der Neustart liest denselben Quellenstand ohne erneuten BIS-Download.
Die Atlasinitialisierung meldet Erfolg. Im Hintergrund bleiben die bereits
zuvor dokumentierten fremden Warnungen zum abgelehnten EODHD-Intraday-Zugriff
und zu einem laufenden Zentralbankbericht-Job sichtbar. Sie stammen nicht aus
der Kreditpipeline und werden nicht als erfolgreicher Gesamt-App-Test gewertet.

Die Bildprüfung umfasst 1024 Pixel nutzbare Inhaltsbreite und 1440 Pixel
Fensterbreite. Bei exakt 1024 Pixel Fensterbreite plus klassischer Scrollleiste
entsteht der bestehende neun Pixel breite Überlauf durch die globale
App-Mindestbreite. Nach abgeschlossener Diagrammgrößenanpassung entsteht bei
1024 Pixel nutzbarer Breite kein zusätzlicher Überlauf. Die Browserkonsole ist
frei von Fehlern und Warnungen; die bestehenden großen Build-Chunks bleiben.
