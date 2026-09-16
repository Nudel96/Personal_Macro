# Zement, Lithiumprodukte und Seltene Erden

Geprüfter Stand: 11. September 2026. Originalquelle ist die öffentliche
World-Mineral-Statistics-Schnittstelle des British Geological Survey. Der
aktuelle Begleitband ist [World Mineral Production 2020–24](https://nora.nerc.ac.uk/id/eprint/541620/),
veröffentlicht am 20. Mai 2026. Die [BGS-Quellenbeschreibung](https://www.bgs.ac.uk/mineralsuk/statistics/world-mineral-statistics/)
grenzt die Zementtabellen ausdrücklich auf europäische Länder ein.

| Paket | Perspektiven | Tatsächlich gespeicherte Gebiete | Beobachtungen |
|---|---:|---:|---|
| Zement | 2 | 33 | 1.434 Zahlen und 8 Fehlwerte, 61 Profile ab 1990 |
| Lithiumprodukte | 10 | 14 | 532 Zahlen und 1 Fehlwert, 38 Profile ab 1974 |
| Seltene Erden | 1 | 15 | 272 Zahlen und 1 Fehlwert, 15 Profile ab 1992 |

Die einzelnen Profile haben unterschiedliche Anfangs- und Endjahre. Keine
eigene Welt- oder Afrika-Summe wird hergestellt. Gebiete ohne numerische
Beobachtung, etwa Kanada in der gewählten Oxidtabelle, bekommen kein scheinbar
verfügbares Profil. Alle Pakete enden spätestens 2024.

Fertigzement und Klinker bleiben verschiedene Produktionsstufen. Manche
Länderzeilen betreffen Verkäufe, Portlandzement, Großbritannien allein oder die
Schweiz einschließlich Liechtensteins. Diese Grenzen werden unmittelbar im
Geltungstext genannt und als Originalnotiz an den betroffenen Punkten erhalten.

Bei Lithium bleiben sechs Produktmassen (Spodumen, Carbonat, Hydroxid, Chlorid,
Lepidolith, Petalit) von vier ausdrücklich bezeichneten Gehaltsreihen getrennt.
Es gibt keine pauschale chemische Umrechnung oder Addition zu einer
Gesamtproduktion. Der allgemeine Gehaltscode `20300` bedeutet je Land etwas
anderes: in Chile beispielsweise nur Hydroxid, in Nigeria Petalit. Er wird
deshalb ebenso wie die unbestimmte historische Mineralreihe `892` ausgelassen.
Die expliziten Gehaltscodes `20309`–`20312` behalten ihre Quellendefinition.
Nicht jedes Land besitzt beide Ansichten derselben Produktionsstufe.

Seltene Erden verwenden ausschließlich Code `20238`: gemeldete Oxide oder von
BGS berechnetes Oxidäquivalent. Alte Monazit-, Xenotim- und andere Mineralmengen
werden nicht angehängt. Indien und Australien können abweichende Berichtsjahre
verwenden. Die historischen Tabellenhinweise, auch zu Lagerbeständen, bleiben
erhalten. Die Bilder heißen Quellenstatistik mit Schätzungen.

Die BGS-Zeichen werden fachlich getrennt: `…` ist fehlend, der Strich bedeutet
keine Produktion, `*` eine Schätzung. Ein gedrucktes `0` würde weniger als eine
halbe Einheit bedeuten und wäre keine gemessene Null. Die gewählte Ausgabe
enthält solche gerundeten Nullzeichen nicht; der Parser weist eine ungeprüfte
Änderung dieser Kennzeichnung ab. Fußnoten mit Reihenbruch unterbrechen die
Linie. Andere Lücken bleiben offen.

`evidence/build_public_bgs.py` prüft die CSV gegen den vollständigen
ursprünglichen JSON-Download einschließlich `numberMatched`/`numberReturned`.
Zwei unabhängige Abrufe derselben CSV waren bytegleich; der JSON-Zeitstempel
wird nicht als Datensatzversion verwendet. Feste CSV-Hashes, Header,
Gebietsidentitäten, Materialcodes, Einheiten und Jahresgrenzen werden im
nativen Import geprüft. `public_bgs.rs` übernimmt Dezimalstrings ohne eigene
Rundung. Der bisherige lokale Stand bleibt bei einer veränderten Quelle erhalten.

Der vollständige Originaltest vergleicht alle 114 Profile mit einer unabhängig
erzeugten Rekonstruktion und mit dem erneut geöffneten temporären SQLite-Cache.
Zusätzliche Anker wurden im Begleitband auf den Druckseiten 44, 58, 84 und 85
geprüft. Andere Einheiten, Gebiete, Zukunftsjahre, Nullkennzeichnungen und
veränderte Dateien werden zurückgewiesen. Native Bedienung und Windows-Build
werden nach tatsächlicher Prüfung im ursprünglichen 40-Themen-Ledger belegt.

Die [BGS-Nutzungsbedingungen](https://www.bgs.ac.uk/mineralsuk/statistics/world-mineral-statistics/bgs-mineral-statistics-terms-and-conditions-ipr/)
gestatten nichtkommerzielle wissenschaftliche Recherche und verlangen die
Quellenangabe. Die Originaldateien bleiben im ignorierten Rechercheverzeichnis;
der Produktimport schreibt ausschließlich in den öffentlichen lokalen Atlas-Cache.

World Mineral Statistics contributed by permission of the British Geological Survey.
