# Zusätzliche Sektorbilder aus der UN Global SDG Database

Geprüfter Stand: 10.09.2026, Ausgabe **2026.Q2.G.02**.

Der Atlas ergänzt 33 Perspektiven für 17 Themen über die öffentliche
[UN-SDG-API](https://unstats.un.org/SDGAPI/swagger/). Die UN Statistics Division
veröffentlicht hier Daten der zuständigen internationalen und nationalen
Stellen. Die Originalquelle bleibt je Beobachtung erhalten. Es wird kein neuer
kostenpflichtiger Datenzugang benötigt.

## Inhalte

- Informelle Beschäftigung, getrennt nach 13. und 19. ICLS.
- Recycling von Elektroschrott und Siedlungsabfällen.
- Tourismusbeitrag und Beschäftigte in Tourismusbranchen.
- Ländlicher Straßenzugang sowie Güter- und Personenverkehr nach Verkehrsträger.
- Internationale und nationale Armutsquoten; Staatshaushalt und Steuerquote.
- CO₂-Intensität, Red List Index, Katastrophenvorsorge und Konfliktopfer.
- Öffentliche internationale Infrastrukturfinanzierung und private Projektzusagen.
- Zusagen zur Finanzierung erneuerbarer Energie, nach sechs Technologiegruppen.
- Erneuerbare am gesamten Endenergieverbrauch; sicher bewirtschaftete Trinkwasser-
  und Sanitärversorgung.

Der vollständige Katalog steht in `data/sdg-catalog.json`. Er enthält die
englische Providerdefinition, das freigegebene Einheitenkennzeichen, sämtliche
Dimensionen, den primären SDG-Indikator sowie die geprüften Zeilenumfänge.
249 Länder/Gebiete einschließlich des Weltcodes haben eine explizite
M49-Zuordnung. Das bedeutet keine gleichmäßige Werteabdeckung aller Reihen:
beispielsweise besitzt der geprüfte Straßen-/Schienen-Verkehrsleistungsausschnitt
nur fünf Jahre für ein Land. Eigene UN-WPP-, Ember-, BIS- oder IRENA-Regionen
werden nicht aus Länderwerten nachgebildet.

## Bedeutung und Darstellung

Die Ausgabe enthält **79.911 endliche numerische Länderjahre** und **278 als
`NaN` gelieferte Quellenmarker**, die ohne Zahlenwert erhalten bleiben. Echte
Null und negative Werte bleiben erhalten; unbekannte numerische Formate werden
abgewiesen. Keine statistische Veränderung wird in eine Marktunter- oder
Überbewertung umgedeutet.

Die internationale Armutsgrenze liegt in dieser Ausgabe bei 3 Dollar pro Tag
auf Kaufkraftbasis 2021. Landeserhebungen können Einkommen oder Konsum messen.
Nationale Armutsgrenzen werden nur für das Erstland dargestellt, da die Grenzen
nicht gleichartig sind. Die Vergleichsauswahl bleibt für andere Reihen erhalten.

Tourismus kann laut Originalfußnote touristische Bruttowertschöpfung als Proxy
enthalten. Beschäftigte in Tourismusbranchen sind nicht ausschließlich durch
Reisende ausgelöste Arbeitsplätze. Erneuerbaren-Finanzierung bezeichnet Zusagen
an Entwicklungsländer in konstanten Dollar 2023; sie ist weder tatsächliche
Auszahlung noch gesamte Energieinvestition. Die Infrastrukturreihen haben
andere Preisbasen und bleiben getrennt. Sendai-Indikatoren enthalten
Selbstberichte und sind keine Messung vermiedener Schäden.

Erhebungen erscheinen als einzelne Punkte, auch wenn aufeinanderfolgende Jahre
vorliegen. Nur ausdrücklich freigegebene Jahresreihen werden verbunden. Es wird
nicht interpoliert. Quelle, Datenart, Erhebungszeit, Basisperiode, Fußnoten und
Originalstatus stehen aufklappbar je Land und Jahr bereit. Originalwert und
Unsicherheitsgrenzen werden über „Zahlen anzeigen“ sichtbar. Zahlen bleiben
optional. Die Quellenart ist im Einzelbild und in der Übersicht unmittelbar
gekennzeichnet. Gemerkte Ansichten halten UN-SDG als UN-Quelle fest.

## Import und Speicherung

`sdg_source.rs` prüft Providerdefinition und Release vor und nach dem Download,
die vollständige Paginierung, Originaleinheit, Größenfaktor, Länderidentität,
Kalenderjahr und exakte Dimensionen. Datensätze mit mehreren SDG-Zuordnungen
werden nur über den explizit gewählten primären Indikator übernommen. Doppelte
Länderjahre werden abgewiesen und nicht gemittelt. Die Historie endet 2025.
Eine neue Ausgabe benötigt eine erneute Quellenprüfung.

Die API lieferte bei kombinierten Dimensions- oder Jahresfiltern teils falsche
leere Antworten. Der Adapter setzt deshalb höchstens einen serverseitigen
Dimensionsfilter und prüft alle übrigen Grenzen lokal. Feste HTTPS-Adresse,
Rustls, keine Redirects, begrenzte Antwortgröße und Timeout. Es werden keinerlei
Journal- oder Kontodaten übertragen.

Die generischen Atlas-Tabellen `atlas_datasets` und `atlas_observations` nehmen
einen vollständigen Stand atomar auf. Originalkennzeichen werden als JSON in
`source_flag` erhalten. Keine neue Cache- oder Journalmigration. Die gemeinsame
Atlas-Abrufsperre und mindestens 24 Stunden seit dem letzten erfolgreichen
Einzel-/Auswahlabruf gelten auch für SDG. Der Gesamtabruf ergänzt nur noch
fehlende Pakete und behält vorhandene Quellenstände bei.

## Nachweise und Grenzen

`evidence/sdg-expansion-audit.json` hält URLs, SHA-256, Einheiten, Mengen,
Gebietsabdeckung und Originalbeispiele fest. `audit_sdg_expansion.py` prüft die
vollständigen Rohseiten unabhängig; `build_sdg_expansion.py` erzeugt den Katalog.
Der native vollständige Release-Test überprüft dieselben Rohdateien, schreibt
eine temporäre SQLite-Datenbank und liest sie nach erneutem Öffnen wieder.
Reguläre Tests prüfen Null, fehlende Marker, Dimensionen, falsche Einheiten,
Gebiets-/Definitionswechsel, Duplikate und ungeprüfte Releases.

Zusätzlich geprüft, aber nicht als Länderstatistik eingebaut: SDG-Zugang zum
öffentlichen Verkehr enthält einzelne Städte und keinen freigegebenen
Landesgesamtwert. Durchschnittliche Stundenverdienste werden in jeweiliger
Landeswährung geliefert; lange Reihen benötigen zunächst eine Prüfung von
Währungswechseln und Denominationen. Ein Stadtwert oder ein nominaler
Währungsbruch wird nicht als einheitliches langfristiges Länderbild verwendet.
