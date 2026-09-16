# Weltatlas – Anlagen und Technologien mit IRENA

Stand: 9. September 2026. Eigenständige Perspektive im Atlas für installierte
elektrische Leistung. Sie erweitert die vorhandene Ember-Stromwirtschaft.

## Quelle und Abgrenzung

- [Offizielle IRENASTAT-Tabellenauswahl](https://pxweb.irena.org/pxweb/en/IRENASTAT/IRENASTAT__Power%20Capacity%20and%20Generation/)
- [Länder: Capacity 2026 H1](https://pxweb.irena.org/pxweb/en/IRENASTAT/IRENASTAT__Power%20Capacity%20and%20Generation/Country_ELECCAP_2026_H1_v-PX%201.px/)
- [Regionen: Capacity 2026 H1](https://pxweb.irena.org/pxweb/en/IRENASTAT/IRENASTAT__Power%20Capacity%20and%20Generation/Region_ELECCAP_2026_H1_v-PX%201.px/)
- [IRENA-Nutzungsbedingungen](https://www.irena.org/terms-and-conditions)

Attribution: **IRENA (2026), Renewable Capacity Statistics 2026 · © IRENA 2026**.
Kostenloser öffentlicher Abruf ohne Schlüssel oder zusätzliches Abonnement für
den persönlichen lokalen Atlas. Die Quelle wird in der Ansicht genannt. Daraus
wird keine allgemeine Erlaubnis für kommerzielle Weiterveröffentlichung abgeleitet.

Die API ist unter `https://pxweb.irena.org/api/v1/en/IRENASTAT/` erreichbar.
Die Webseiten besitzen zusätzlich `/pxweb/` im Pfad; die API besitzt dieses
Präfix nicht. Es wurden keine Zugangssperren umgangen.

Der geprüfte Stand vom **16. April 2026, 08:00 Quellenzeit** umfasst 2000–2025.
Die Quelle nennt keine Zeitzone. Es gibt 226 Zeilen in der Ländertabelle;
darunter sind zwei Regionalzeilen (`REA` Eurasien und `OCA` Ozeanien).
Diese werden ausdrücklich ausgelassen. 224 Länder/Wirtschaftsgebiete werden
über eigene ISO-Kennungen zugeordnet, einschließlich Taiwan und Kosovo.
Die zehn unveränderten Zeilen der Regionstabelle ergeben mit ihnen **234 Profile**.
Welt bleibt `world`; neun zusätzliche `irena:*`-Identitäten trennen IRENA- von
UN-, Ember- und Maddison-Regionsabgrenzungen. Der Gesamtkatalog hat damit 285 Gebiete.

## Bildliche Nutzung

Unter Energie → Strom & Erzeugung wird bei passenden Themen **Anlagen &
Technologien** angeboten. Solar besitzt die Unteransichten Gesamt, Photovoltaik
und solarthermische Stromerzeugung. Weitere Perspektiven betreffen Wind an Land
und auf See, Geothermie, Wasserkraft, Bioenergie, Kernenergie, fossile Kraftwerke
und Pumpspeicher. Letzterer ist auch unter Langzeitspeicher erreichbar.

Die Landesdatei hat 26, die Regionsdatei 13 Technologiepositionen. Die
Regionaldatei enthält zum Beispiel Solar insgesamt, aber keine eigene PV-Reihe.
Ein Solar-Gesamtwert ersetzt keine PV-Reihe. Übergeordnete Summen werden nicht
mit ihren Komponenten addiert. Pumpspeicherleistung wird nicht als zusätzliche
Primärenergie ausgegeben. Solarthermie meint elektrische Kraftwerke, keine
Heizkollektoren. Nationale AC-/DC-Meldegrundlagen können bei Solar abweichen.

Mit und ohne Netzanschluss sind ausdrücklich getrennte Bilder. Die Einheit ist
MW installierter elektrischer Leistung, meist am Jahresende; sie beschreibt
weder jährlich erzeugten Strom noch einen Unternehmenswert. Es gibt keine
Unter-/Überbewertung, künstliche Sinuskurve oder Kaufempfehlung aus Anlagenzahlen.

Das Bild beginnt ohne Zahlen und Animation. Vergleiche teilen Kalender, Einheit
und Maßstab. Lücken bleiben offen und einzelne Werte als Punkte sichtbar.
Der Originalmarker `"-"` wird ohne belegte Zahl als `null` gespeichert; er wird
nicht in null MW umgewandelt. Explizite numerische Nullen bleiben echte Nullen.
Unterschiedliche lokale Quellenstände dürfen nicht in ein Vergleichsbild.

`capacityTech`, `capacityGrid` und `capacitySince` stehen in der URL und im
Merkkontext. Quellenhashes werden auch in persönlichen Bildständen festgehalten.
Die Quellenübersicht unterscheidet jede Technologie und beide Netzarten.

## Nativer Datenweg

Atlasmigration **0007** ergänzt ausschließlich den öffentlichen Cache. Die
Journal-Migrationen bleiben unverändert. Zwei Metadatenabrufe, fünf begrenzte
PX-Datenabrufe und erneute Metadatenkontrollen bilden einen Quellenstand.
Länder werden in Gruppen zu höchstens 60 abgefragt; damit bleibt jede Anfrage
unter der dokumentierten Grenze von 100.000 Zellen.

PX statt JSON-stat ist bewusst gewählt: Der JSON-stat-Abruf lieferte
`9999-12-31T23:59:59Z` als Update und keine Einheit. PX enthält hingegen MW,
den echten Quellenstand, Gebietskennungen und die genaue Achsenreihenfolge.
Windows-1252 wird ohne verlustbehaftete Zeichenersetzung gelesen.

Der Parser prüft Quelle, Einheit, Matrix, Titel, Achsen, Technologiebezeichnungen,
Grid-Reihenfolge, Länderlabels/-codes, Jahre, vollständige Zellenzahl,
Duplikate und Zahlenbereiche. Unbekannte Marker oder widersprüchliche
Metadaten stoppen den gesamten Austausch. Alle Profile und Quellenmetadaten
werden gemeinsam in einer SQLite-Transaktion gespeichert. Ein Fehler erhält
den vorigen Stand. Es gelten die gemeinsame Atlas-Abrufsperre und 24 Stunden
Abstand nach Erfolg. Der Browser meldet ausdrücklich `desktop_required`.

Der öffentliche IIS-Endpunkt verhandelte bei der Quellenprüfung
`TLSv1.2 / ECDHE-RSA-AES256-SHA384`. Der Rustls-Verbindungsweg wurde vor einer
HTTP-Antwort zurückgesetzt. Der IRENA-Client verwendet auf Windows deshalb
Schannel über Reqwest, mindestens TLS 1.2, mit aktiver Zertifikats- und
Hostnameprüfung. Alle anderen vorhandenen Clients behalten ausdrücklich
Rustls. Keine TLS-Prüfung wird deaktiviert; URLs und Redirect-Verbot bleiben
fest. Nicht-Windows-Plattformen sind für diesen neuen Abruf nicht abgenommen.

## Nachweise

Die öffentlichen Originaldateien ergeben 312.312 Quellenzellen, davon 77.831
numerisch. Die beiden ausgeschlossenen Länder-Regionalzeilen bleiben im Audit
benannt. Rohdateien und API-Metadaten werden mit SHA-256 belegt; kein persönliches
Journal wird für Prüfungen gelesen oder kopiert.

Die kleinen originalen Länderfixtures unter `world_atlas/fixtures` enthalten
nur öffentliche Deutschland-/Nigeria-Daten und die öffentlichen API-Metadaten.
Sie dienen als Referenz für Einheiten, Netzart, PV/Solarthermie, Zahlenwerte und
Marker. Weitere Tests prüfen beschädigte Daten, Migration von Cacheversion 6,
atomaren Rollback, gemeinsamen Abrufschutz und erneutes Offline-Lesen.

`evidence/audit_irena.py` vergleicht alle Zellen der Originaldateien mit dem
ausdrücklich isolierten nativen Prüfprofil. Der [native Nachweis](evidence/capacity-native-readiness.json)
belegt den vollständigen echten Desktop-Abruf, 234 Profile und den Neustart.
Alle 76.355 zugeordneten numerischen und 233.253 nicht numerischen Zellen
stimmen mit den Originaldateien überein. Die Abweichung zur gesamten
Quellenzellenzahl betrifft ausschließlich die zwei ausgeschlossenen
Regionalzeilen der Länderdatei. Das native Diagramm wurde als PNG geprüft;
Quelle, Einheit, Netzart, Jahresachse und Legende sind erhalten. Beide Starts
initialisierten den lokalen Atlas-Speicher ohne neue Warnungen.

Die Sichtprüfung mit nativen öffentlichen Snapshots bei 1024 und 1440 Pixeln
umfasst Afrika-Solar mit/ohne Netzanschluss, PV Indien/China, regionale PV-Lücken,
optionale Zahlen und die Vergleichslegende. Kein horizontaler Seitenüberlauf
und keine Konsolenfehler. Das ist keine vollständige native Klickabnahme aller
Atlasansichten. Die gesamte Abnahme R01–R18 bleibt weiterhin offen.

Abschließende Codeprüfungen: 103 Atlas-Frontendtests, 207 Rust-Library-Tests,
Typecheck, ESLint, Rustfmt und Clippy `--all-targets -- -D warnings` bestanden.
Die 15 im Standardlauf ausgenommenen Rust-Prüfungen benötigen ausdrücklich
externe oder manuelle Eingaben; der neue IRENA-HTTP-Test wurde zusätzlich
ausgeführt. Der Produktionsbuild bleibt bei der bereits bekannten Meldung
über große ECharts-/Dokumentexport-Chunks.
