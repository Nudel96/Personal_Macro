# Geografischer Einstieg mit Karte und Liste

Stand: 9. September 2026. **Weltkarte & Länderliste öffnen** ergänzt die
bestehenden Länderansichten. Der Bereich ist zunächst geschlossen und wird
erst beim Öffnen geladen. Die Karte wählt Gebiete für dieselben Themenbilder;
sie enthält keine Wirtschaftswerte oder automatische Farbbewertung.

## Umfang und Herkunft

Die Geometrie stammt aus **Natural Earth 1:110m Admin 0 Map Units 5.1.1**.
[Quellenbeschreibung](https://www.naturalearthdata.com/downloads/110m-cultural-vectors/110m-admin-0-details/),
[Public-domain-Bedingungen](https://www.naturalearthdata.com/about/terms-of-use/).
Die Quelldateien wurden aus dem offiziellen
[Natural-Earth-Repository](https://github.com/nvkelso/natural-earth-vector/tree/ca96624a56bd078437bca8184e78163e5039ad19/110m_cultural)
geladen und mit Hashes protokolliert. Die historische Downloadverknüpfung auf
der Projektseite war nicht lesbar; die Originaldateien im öffentlichen
Repository waren zugänglich.

183 Quellenumrisse werden 177 bestehenden Atlasgebieten zugeordnet.
Die vier britischen Map Units werden anhand ihrer expliziten ISO-A3-EH-Kennung
dem Vereinigten Königreich zugeordnet. Frankreich und Französisch-Guayana
bleiben getrennt. Dasselbe gilt für Taiwan und Kosovo anhand der bestehenden
Provideridentitäten. Für Nordzypern und Somaliland gibt es im Atlas keine eigene
Gebietskennung; die beiden Quellumrisse bleiben ohne Auswahllink sichtbar und
werden keiner anderen Länderstatistik zugeschlagen.

Alle **353 Atlasgebiete** bleiben über die alphabetische Liste erreichbar.
172 Einträge haben keine eigene Fläche in dieser vereinfachten Karte; darunter
kleine Gebiete sowie Welt- und Quellenaggregate. Die Oberfläche benennt den
Unterschied. Kartenumrisse sind Orientierung; Datengebiete und Zeitstände der
einzelnen Quellen bleiben für die Bilder maßgeblich.

Die Darstellung verwendet die sphärische **Equal-Earth-Projektion** mit den
veröffentlichten Koeffizienten von Savric, Patterson und Jenny (2018).
Der veröffentlichte Kontrollpunkt aus der
[PROJ-Dokumentation](https://proj.org/en/stable/operations/projections/eqearth.html)
wird beim Erzeugen geprüft. Die Kugelnäherung erhält relative Flächen; das
ist keine Aussage über wirtschaftliche Bedeutung. Es werden keine Gebietsgrenzen
neu berechnet oder Ansprüche aus der Darstellung abgeleitet.

## Bedienung

- Ein Klick auf Karte oder Listenbutton wählt dasselbe Atlasgebiet. Thema,
  Perspektive und Übersicht bleiben erhalten. Ein bestehender Vergleich bleibt
  erhalten, soweit dadurch nicht dasselbe Gebiet zweimal ausgewählt wird.
- **Vergleich wählen** setzt ausdrücklich die zweite Seite. Hauptauswahl und
  Vergleich erscheinen mit eigener Beschriftung; der Vergleich erhält zusätzlich
  eine gestrichelte Kontur. In Ansichten ohne Ländervergleich entfällt diese Wahl.
- Suche nach Name/ISO-Code und Regionsfilter begrenzen die Liste. Auf der Karte
  werden andere Gebiete zurückgenommen, bleiben aber per Maus auswählbar.
- Die Karte hat einen einzelnen Tastatureinstieg. Pfeiltasten wechseln
  alphabetisch durch die gefilterten Kartenländer; Home/End springen an deren
  Anfang/Ende. Enter oder Leertaste wählt aus. Die Liste bietet normale Buttons.
- Öffnen, Suchtext und Listenregion stehen in `map`, `mapSearch` und `mapRegion`
  der URL. Sie bleiben beim Schließen und erneuten Öffnen erhalten. Der Suchtext
  verändert keine Auswahl, bis ein Gebiet gewählt wird.

## Technische Prüfung

`scripts/build-atlas-map.py` liest ausschließlich die öffentlichen SHP/SHX/DBF-
Dateien. Version, WGS84-Koordinatensystem, Ringabschlüsse, Koordinatenbereiche,
Datumsgrenzenübergänge, Quellanzahl und Gebietsidentitäten werden geprüft.
Die einzige Ringkante über die gesamte Längengradspanne liegt am Südpol.
`pyshp 2.3.1` dient nur als Entwicklungswerkzeug; die App erhält keine neue
Abhängigkeit. `map-geometry.json` enthält vorprojizierte SVG-Pfade, keine
personenbezogenen Daten. Es gibt keinen Kartendienst, Laufzeitdownload oder
zusätzlichen Datenbankzugriff.

[Vollständiger Karten-/Gebietsaudit](evidence/map-geography-audit.json) enthält
alle Quellenzuordnungen und alle ausschließlich per Liste erreichbaren Gebiete.
Vier Komponentenprüfungen sichern Gebietsidentität, vollständigen Listenzugang,
Maus-/Vergleichsauswahl, Tastatur und leere Filter. Ein Integrationstest prüft
Landwechsel bei erhaltener Länderübersicht, Vergleich und Suche nach Wiederöffnung.
Die gezielte Atlas-/Navigationssuite umfasst danach **83 bestandene Tests**.

Die CUA-Prüfung bestätigte Deutschland/USA, die getrennte Indien-/China-Auswahl,
Vatikanstadt per Listenbutton/Enter, Pfeilnavigation von Indien nach Indonesien
und anschließende Auswahl, sowie das UN-Afrika-Aggregat ohne erfundene Fläche.
Bei 1024 Pixeln stehen Karte und Liste untereinander, bei 1440 nebeneinander;
kein horizontaler Seitenüberlauf. Die Browserkonsole blieb ohne neue Warnungen
oder Fehler. Typecheck, ESLint, Formatprüfung und Produktionsbuild bestanden;
bekannte große ECharts-/Dokumentexport-Chunks bleiben unverändert.

Die Prüfung verwendet die gekennzeichnete Browser-Prüfansicht im originalen
App-Rahmen. Die Karte selbst verwendet dieselben gebündelten Geometrien wie die
Desktop-App. Wirtschaftsbilder in der Prüfansicht stammen aus echten nativen
öffentlichen Snapshots. Eine vollständige native Klickabnahme bleibt separat offen.
