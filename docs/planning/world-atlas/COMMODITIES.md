# Internationale Rohstoffpreise

Der Atlas zeigt 85 Preis- und Indexreihen aus der kostenlosen **World Bank Pink
Sheet**, Ausgabe September 2026. Die Jahresmittel reichen je Reihe frühestens
von 1960 bis 2025. Elf Gruppen ordnen Energie, Industrie- und Edelmetalle,
Düngemittel, Getreide, Öle, Getränke, weitere Lebensmittel, Holz und weitere
Agrarrohstoffe; sechs Bilder pro Galerieseite halten die Ansicht übersichtlich.

Einstieg: **Produktion & Ressourcen → Rohstoffe & Kreislaufwirtschaft →
Internationale Rohstoffpreise**. Dreizehn Atlas-Themen einschließlich Öl, Gas,
Kohle, Kupfer, Aluminium, Nickel, Edelmetallen, Düngemitteln und Forstwirtschaft
bieten passende Teilansichten. Die explizite Quellenwahl erhält vorhandene
WDI- und Börsenperspektiven.

## Bedeutung der Bilder

Es handelt sich um internationale Referenznotierungen mit bestimmten Sorten,
Handelsplätzen und Lieferbedingungen. Eine Länderwahl verändert diese Preise
nicht. Quellenübersicht und Merkkontext benennen diese internationale Abgrenzung;
für einzelne Länder wird kein eigenes Rohstoffprofil behauptet.

Die Standardansicht verwendet die **veröffentlichten realen Preise**. Die
Weltbank bereinigt mit dem Manufactures Unit Value Index (MUV) auf die Preisbasis
2010. Dieser Index misst Exportpreise verarbeiteter Güter und ist kein nationaler
Verbraucherpreisindex. Die nominale Perspektive bleibt separat auswählbar.

Für die Darstellung wird jede Reihe durch ihren eigenen Quellwert von 2010
geteilt und mit 100 multipliziert. Alle 85 Reihen besitzen in beiden Preisbasen
einen positiven Referenzwert. Kalender und Skala sind für die sichtbaren Karten
gleich; beim Wechsel der Galerieseite wird die gemeinsame Skala neu bestimmt.
Im Einzelbild lässt sich ein zweiter Rohstoff auf derselben Skala ergänzen.
Die gestrichelte Linie ist der Preisstand von 2010, keine faire Bewertung,
ökonomische Gleichgewichtslage oder Prognose.

Zahlen sind einschließlich Punkt-Tooltips optional. Die Werte werden nicht
geglättet oder sinusförmig modelliert. Nur benachbarte vorhandene Jahre werden
verbunden. Jahresmittel können Bewegungen innerhalb eines Jahres verdecken.

## Quellenprüfung und Grenzen

- 69 einzelne Preisreihen einschließlich des veröffentlichten Gasindex sowie
  16 breite Indizes, jeweils nominal und real: 10.310 numerische und 910 fehlende
  Kalenderzellen. `…`, `..` und echte Leerzellen bleiben fehlend.
- Jede Originalzahl besitzt höchstens zwei Dezimalstellen. Speicherung als
  Integer-Hundertstel verhindert Veränderungen durch SQLite-/JSON-Rundung.
- Preise enthalten nach Quellenbeschreibung auch Schätzungen; die Datei liefert
  keinen Messstatus je Zelle. Die Oberfläche bezeichnet sie als Quellenstatistik
  mit Schätzungen. Historische Daten werden nicht aus dem Sternchen für
  separat verfügbare Prognosereihen zu Zukunftsmodellen umgedeutet.
- Quellen- und Spezifikationswechsel werden durch unverbundene hohle Punkte
  markiert. Das gesamte Übergangsjahr wird vorsichtig beidseitig getrennt.
- Eisenerz ist im Bild erst ab 2009 vergleichbar freigegeben: Die ältere
  Quellenbeschreibung mischt Einheiten sowie Vertrags- und Spotgrundlagen.
  Die Originalwerte früherer Jahre bleiben im Cache, ohne ihre Skalierung zu
  erfinden.
- 5.155 reale Werte wurden mit Nominalpreis und MUV innerhalb der veröffentlichten
  Rundungsintervalle abgeglichen. **Eine Quellenabweichung** verbleibt beim realen
  Öle-/Schroteindex 2014: veröffentlicht 98,3. Der originale Wert bleibt erhalten
  und wird gesondert unverbunden gekennzeichnet.
- Übergeordnete Indizes und Teilindizes überlappen. Sie werden weder addiert
  noch neu gewichtet. Die breiten Indizes verwenden die veröffentlichten festen
  Exportgewichte; MUV ist kein zusätzliches Rohstoffbild.
- Das Deckblatt der veröffentlichten Arbeitsmappe erwähnt Vergleichsblätter,
  die nicht enthalten sind. Es wird nicht als numerische Metadatenquelle genutzt.

## Lokaler Datenweg

`get_atlas_commodities` liest ausschließlich den globalen Cache.
`sync_atlas_commodities` lädt die feste öffentliche XLSX-Datei nach ausdrücklicher
Anforderung ohne Schlüssel oder neues Abo. Dateigröße, SHA-256, ZIP-Grenzen,
Tabellen, Überschriften, Kalender, Zahlengenauigkeit und Gesamtumfang werden vor
einem atomaren Austausch geprüft. Ein geänderter Veröffentlichungsstand benötigt
eine neue Quellenprüfung. Fehler erhalten den bisherigen Stand.

Atlasmigration `0020` ergänzt zwei Tabellen im getrennten öffentlichen Cache.
Die gemeinsame Abrufsperre und 24 Stunden Mindestabstand gelten. Der Browser
meldet `desktop_required` und täuscht weder Download noch Speicherung vor.
Der globale Query-Key ist `['atlas', 'commodities']`; Abschluss invalidiert ihn.

Sieben `commodity*`-Parameter erhalten Gruppe, Einzelbild, Rohstoffvergleich,
Preisbasis, Zeitraum, Suche und Galerieseite. Implizite Themenfilter bleiben
implizit, damit etwa Fischmehl und Garnelen über ihre verschiedenen Gruppen
hinweg unverändert wieder geöffnet werden. Herkunft, Ausgabe, Rezept und Hash
werden mit dem persönlichen Diagrammstand gespeichert.

## Nachweise

- [Offizielle Weltbank-Downloads](https://www.worldbank.org/en/research/commodity-markets)
- [Metadaten und Lizenz CC BY 4.0](https://datacatalog.worldbank.org/search/dataset/0038238/commodity-prices-history-and-projections)
- [Reproduzierbare Quellenprüfung](evidence/audit_commodity_source.py)
- [Quellenbefund einschließlich Rundungsabgleich](evidence/commodity-source-audit.json)
- [Nativer Abgleich aller Originalzellen und des isolierten Prüfprofils](evidence/check_commodity_native.py)
- [Sicht- und Bedienprüfung mit echten Quellwerten](evidence/commodity-ui-readiness.json)
- [Echter Download und erneute Öffnung nach Prozessneustart](evidence/commodity-native-readiness.json)

Die Rustprüfungen umfassen Upgrade von Atlasmigration 0019, atomaren Rollback,
Abrufsperre, Cooldown, Offline-Wiederöffnung sowie alle Originalzellen über
Parse-, SQLite- und JSON-Durchlauf. 254 Atlas-Frontendtests in 36 Dateien,
Typecheck, ESLint, Clippy und Produktionsbuild bestehen. Nach der letzten
Erweiterung der Themenabdeckung bestehen die zwölf betroffenen Tests erneut.
Der Kataloggenerator erhält jetzt auch die bereits vorhandene ILO-Afrika-Region
und den Beschäftigungsbereich aus seiner Eingabegrundlage. Der Regressionscheck
verhindert, dass diese Einträge bei einer erneuten Katalogerzeugung verschwinden.

Die Sichtprüfung bei 1024 Pixeln umfasst Vergleich, Galerie, Seitenwechsel,
Tastatur, Zahlenmodus, Nominal-/Realwechsel, Quellenabweichung, Länderwechsel,
genauen Quellen-Suchtreffer und WDI-Rückkehr für Indien/China. Das native PNG
enthält Rohstoffnamen, Legende, Kalender, Preisbasis und Bezugsjahr.
Native Klicksteuerung ist in der verfügbaren Computer-Use-Oberfläche nicht
freigeschaltet; Browserbedienung und echte Tauri-Datenprüfungen sind deshalb
ausdrücklich getrennte Nachweise.

Der echte Download im isolierten Profil `com.personal-macro.atlas-commodities-20260909`
und der nachgewiesene Wechsel des Desktop-Prozesses sind bestanden. Alle 10.310
Zahlen, 910 Fehlwerte, Quellenmetadaten, Notiz, fester PNG-Stand und letzte Ansicht
bleiben unverändert; der zweite Prozess führt keinen Rohstoffdownload aus.
Die Atlasinitialisierung meldet Erfolg. Im ersten Prüflauf protokollierten
andere Hintergrunddienste eine EODHD-Zugriffsablehnung und einen PDF-Parser-Panic;
eine Notiztransaktion benötigte rund 3,4 Sekunden und wurde erfolgreich gespeichert.
Diese Meldungen stammen außerhalb des Rohstoffpfads und werden nicht als
fehlerfreier Gesamtbetrieb aller bestehenden Dienste ausgegeben.
