# Haushaltsbilder · UN DESA 2026

Der Einstieg **Menschen → Demografie → Haushalte und Haushaltsgrößen** verbindet 39
Perspektiven in sieben Gruppen. Quelle ist die kostenlose UN-Veröffentlichung
*Database on Household Size and Composition 2026*, veröffentlicht im August
2026, verarbeitet bis 30. Juni 2026.

## Umfang und Bedeutung

| Gruppe | Perspektiven | Aussage |
| --- | ---: | --- |
| Haushaltsgröße | 5 | Durchschnitt und vier veröffentlichte Größenklassen |
| Formen des Zusammenlebens | 9 | Sieben Grundtypen sowie Mutter-/Vater-Teilgruppen |
| Generationen unter einem Dach | 4 | Kernfamilien, mehrere erwachsene Generationen, drei Generationen, Großeltern mit Enkeln ohne Eltern |
| Altersgruppen im Haushalt | 5 | Mindestens ein Mitglied in der jeweiligen Altersgruppe |
| Jüngere und Ältere zusammen | 6 | Zwei Altersgruppen im selben Haushalt, ohne unterstellte Verwandtschaft |
| Menschen nach Altersgruppen | 5 | Durchschnittliche Mitgliederzahl mit ausdrücklich verschiedenen Bezugsgruppen |
| Haushaltsbezugsperson | 5 | Geschlecht und Alter der erfassten Bezugsperson |

Die Originaldatei enthält **1.129 Erhebungen für 200 Länder/Gebiete** mit
Referenzjahren von 1959 bis 2025. Das ist die Gesamtabdeckung, keine
durchgängige Jahresgeschichte jedes Landes. 36.142 numerische Zellen,
darunter 462 veröffentlichte Nullwerte, werden erhalten. 7.889 fehlende
Angaben bleiben leer. Es werden keine Welt- oder Kontinentmittel berechnet.

Alle 200 ISO3-Zuordnungen sind zusätzlich gegen die UN Location ID geprüft.
Kosovo bleibt ausdrücklich `provider:XKX` bei UN Location ID 412; die
Location ID wird nicht als erfundene M49-Katalogkennung übernommen.

Ein Erhebungspunkt ist eine Schätzung aus einer Volkszählung oder
Haushaltsbefragung. Keine Linie überbrückt fehlende Jahre oder wechselnde
Quellen. Beide Länder teilen den tatsächlichen Zeitmaßstab und die Skala;
unterschiedliche Referenzjahre bleiben sichtbar. Prozentbilder beginnen bei
null und enden bei hundert. Mitgliederzahlen beginnen bei null und teilen
je Vergleich denselben Höchstwert. Höhen bedeuten keine Bewertung, Qualität,
Normalität oder Prognose und begründen keine feste Sinusperiode.

Bei **76 Land-Jahr-Kombinationen** liegen mehrere Quellen vor. Alle werden
erhalten. Die interne Kennung bindet eine Erhebung an ihre Originalzeile der
mit SHA-256 festgelegten Datei. Quelle, Katalog-ID und Quellenbeschreibung
werden daneben unverändert gespeichert. Selbst gleiche Katalog-IDs können
unter DYB und IPUMS verschiedene verarbeitete Quellen bezeichnen.

Die Vorauswahl nimmt je Perspektive die jüngste Erhebung mit verfügbarem
Wert; bei gleichem Jahr die erste Zeile der UN-Datei. Dieser Gleichstand wird
angezeigt und ist keine Qualitätsrangfolge. Eine ausdrücklich gewählte
Erhebung bleibt erhalten, auch wenn ihr Wert fehlt. Ausdrückliche Auswahlen
stehen in der URL. Automatische Vorauswahlen ändern die Navigation nicht;
beim Merken werden die tatsächlich gezeigten Erhebungskennungen in den
gespeicherten Kontext aufgenommen. Größentypen werden niemals aus anderen
Quellen ergänzt, auch wenn die Begriffe ähnlich sind.

## Fachliche Grenzen

- Übliche Bewohner zählen, Besucher nicht. IPUMS schließt Gemeinschaftsunterkünfte aus.
- Kinder in Familienformen können erwachsen sein. Die Ansicht behauptet keine Minderjährigkeit.
- Altersgruppen überlappen, ebenso die vier Generationenperspektiven. Mutter-/Vater-Haushalte sind Teilgruppen der Haushalte mit einem Elternteil.
- „Kernfamilie“ ist nicht gleichbedeutend mit einer einzelnen Generation.
- Der Anteil „Verwandtschaft unklar“ ist ein veröffentlichter Wert, kein Ersatz für eine fehlende Zelle.
- Fünf Mitgliederdurchschnitte verwenden teils alle Haushalte, teils nur Haushalte mit einer bestimmten Altersgruppe. Die Nenner bleiben in der Beschriftung sichtbar.
- Die Haushaltsbezugsperson ist eine statistische Erhebungsrolle, keine Aussage über Entscheidungsmacht.
- DYB-Tabellen und manche Mikrodaten bieten keine ausreichenden Verwandtschaftsangaben. Ausfälle werden nicht nachgerechnet oder als Null behandelt.
- Acht MICS-Erhebungen besitzen keine Stichprobengewichte: AZE 2000, BIH 2000, BDI 2000, LSO 2000, SSD 1999, TJK 2000, TTO 2000 und UZB 2000. Offene Rauten und Hinweise markieren diese Erhebungen. Andere Quelletypen erhalten dadurch keine pauschale Qualitätsbewertung.

Das Excel-Definitionsblatt nennt bei durchschnittlicher Haushaltsgröße und
weiblicher Bezugsperson irrtümlich ältere Personen als Bezugsgruppe. Der
offizielle Methodenbericht, gedruckte Seiten 2–3 (PDF-Seiten 6–7), definiert
beide für **alle Haushalte**. Die Haupttabellenüberschriften stimmen mit dem
Bericht überein. Seine Definitionen sind für die Darstellung maßgeblich.
Die LFS-Beschreibung nennt 2001/2011, die Originalzeilen enthalten auch
Deutschland 2005; die Originaljahre bleiben erhalten. Gemischte
DYB-/IPUMS-Quellen erklären abweichende Summen einzelner Anbietergruppen und
werden nicht als Duplikate entfernt.

## Quelle und lokale Umsetzung

- [UN-Datensatz und Download](https://population.un.org/household/)
- [Offizieller Methodenbericht 2026](https://www.un.org/development/desa/pd/sites/www.un.org.development.desa.pd/files/undesa_pd_2026_methodology-report_hh-size-composition.pdf)
- [CC BY 3.0 IGO](https://creativecommons.org/licenses/by/3.0/igo/)

© United Nations 2026. Deutsche Beschriftungen und Diagramme: Personal Macro.
Die Kennzahlen bleiben unverändert. Die Darstellung impliziert keine
Unterstützung durch die UN.

Originaldatei: `UNDESA_PD_2026_hh-size-composition.xlsx`, 399.250 Bytes,
SHA-256 `fde0eedd2d3e7f32ad5d8bd8f9ba694dae7f4046190e9adb12175adcce0fb63c`.
Methodenbericht: 363.258 Bytes,
SHA-256 `a0235739117d56a37aa0daf57ed206b89590d4db3c854038044a168577e993d2`.

Die fünf Tabellenblätter, alle 49 Datenspalten, Identitäten, Jahresabdeckung,
Zellgrenzen und Zeilenzahlen werden vor dem atomaren Speichern geprüft. Die
39 numerischen Spalten akzeptieren den ursprünglichen Fehlwert `..`;
ungültige Zahlen und veränderte Veröffentlichungen werden abgelehnt. Es
gibt keine alternative Datenquelle und keine laufenden API-Kosten. Ein
manueller Abruf lädt die vollständige Datei und wird über die gemeinsame
Atlas-Abrufsperre und die 24-Stunden-Regel begrenzt.

Die neue Atlasmigration `0015_households.sql` betrifft ausschließlich den
öffentlichen Cache. Haushaltsnotizen, Quellenbelege, konkrete Erhebungen und
PNG-Bilder verwenden die vorhandene Journal-/Backup-Logik. Der Browseradapter
meldet `desktop_required` und erfindet keine erfolgreichen Downloads.

## Nachweise

Der unabhängige Openpyxl-/Decimal-Abgleich bestätigt sämtliche Originalwerte,
Fehlwerte, Quellennamen, Quellengruppen, Katalog-IDs, Erhebungsjahre,
ungewichteten Stichproben und Zuordnungen gegen den nativen Parser und
SQLite-Rundlauf. [Abdeckungs- und Werteprüfung](evidence/households-audit.json).

Die drei Rust-Prüfungen umfassen auch den echten HTTPS-Download sowie
Migration einer bestehenden temporären Datenbank, atomaren Rollback,
Offline-Neuöffnung und gemeinsame Abrufsperre. Die Frontendprüfungen decken
Mehrfachquellen, fehlende Werte, Nullwerte, überlappende Definitionen,
unterschiedliche Nenner, Quellenstand, Karte-/Katalogziele und gemerkte
Erhebungen ab. Ein zusätzlicher Navigationstest prüft schnelle Länder- und
Gruppenwechsel bei verzögerten Vergleichsdaten. Er sichert die behobene
Rückkopplung durch URL-Aktualisierungen bei automatischer Erhebungsauswahl ab.
**193 Atlas-Frontendtests in 30 Dateien** bestehen. TypeScript, gezieltes
ESLint, Rust-Clippy und der Produktionsbuild bestehen ebenfalls; der Build
meldet weiterhin die vorhandenen großen allgemeinen Anwendungspakete.

Die reale Tauri-Prüfung verwendete ausschließlich das isolierte Profil
`com.personal-macro.atlas-households-20260909`. Sie las alle 200 Länderprofile
sowie die ausdrücklich nicht verfügbaren Antworten für Welt und Afrika.
Nach einem echten Prozessneustart bleiben alle **202 Antworten**, die Notiz,
die ausgewählten Erhebungen, Quellenbelege und das ursprüngliche PNG bytegleich.
Der Neustart benötigt keinen erneuten Download. Das neu gerenderte Vorschaubild
enthält zusätzlich die abschließend verbesserte Anordnung: Verlauf oben über
die gesamte Breite, beide gewählten Erhebungen darunter nebeneinander. Es wird
nicht mit dem unverändert bewahrten ursprünglichen Notizbild gleichgesetzt.

Die Browserprüfung verwendet ausschließlich die zuvor nativ geladenen
öffentlichen Originaldaten. Sie umfasst Deutschland/USA, Indien/China,
explizite fehlende Werte, ungewichtete MICS-Erhebungen, Quellenwahl,
Quellensuche und 1024-/1440-px-Darstellung. Im frischen abschließenden Tab
bleiben schnelle Wechsel stabil und die Warn-/Fehlerkonsole leer. Der
1024-px-Modus behält die vorhandene Mindestbreite der Anwendung; ein schmaler
Scrollbalken kann deshalb wenigen Pixeln horizontalem Überstand entsprechen.

Die native Bedienung per Klick bleibt ungeprüft, weil die verfügbare CUA-Fläche
nur Browser unterstützt. Beim isolierten Start traten außerdem bestehende
Technicals-/Zentralbank-Hintergrundmeldungen und im ersten Lauf ein
`pdf-extract`-Fehler außerhalb der Haushaltsdatenpipeline auf. Erfolgreiche,
langsame SQL-Schreibvorgänge wurden protokolliert. Das ist kein Nachweis eines
vollständig warnungsfreien Anwendungsstarts und kein Abschluss des Gesamtauftrags.
[Kompakter Prüfbericht](evidence/households-readiness.json).
