# Energie, Rohstoffe und wirtschaftliche Rahmenbedingungen

Stand: 9. September 2026. Vierzehn zusätzliche WDI-Reihen ergänzen die
Länderübersicht und die Einzelbilder. Die statistische Basis umfasst damit
88 Reihen in 17 Gruppen unter sieben Themenfeldern. Der bestehende kostenlose
Weltbank-Adapter, die ausdrückliche Auswahl zum Laden und der getrennte lokale
Cache werden weiterverwendet. Es gibt keine zusätzliche API-Familie, keinen
neuen Schlüssel und keine Änderung der Journal-Datenbank.

Die Bilder zeigen wirtschaftliche Größen und ihre Veränderung. Sie berechnen
weder faire Marktwerte noch einen regelmäßigen natürlichen Zyklus. Insbesondere
sind Ressourcenüberschüsse relativ zum BIP keine Gewinnbewertung von Unternehmen.

## Geprüfte Perspektiven

Die Zeiträume und Gebietsanzahlen beziehen sich auf den vollständigen geprüften
Quellenstand, nicht auf eine lückenlose Historie jedes Landes. „Gebiete“ umfasst
zugeordnete Länder/Wirtschaftsgebiete und gegebenenfalls den veröffentlichten
Weltwert. Andere WDI-Aggregate werden nicht auf Atlas-Regionen umgedeutet.

| Bild                                     | WDI-Code            | Gebiete mit Werten | Tatsächlicher Zeitraum | Bedeutung und Grenze                                                                                                  |
| ---------------------------------------- | ------------------- | -----------------: | ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Energiebedarf je Wirtschaftsleistung     | `EG.EGY.PRIM.PP.KD` |                202 | 2000–2022              | Megajoule Primärenergie je internationalem Dollar BIP, Kaufkraftbasis 2021; Wirtschaftsstruktur und Klima wirken mit. |
| Energieimporte nach Exporten             | `EG.IMP.CONS.ZS`    |                146 | 1990–2023              | Anteil am Primärenergieverbrauch; negative Werte bedeuten Nettoexporte.                                               |
| Stromverluste im Netz                    | `EG.ELC.LOSS.ZS`    |                151 | 1960–2024              | Anteil an der Stromproduktion; einschließlich nichttechnischer Verluste und Diebstahl.                                |
| Ölüberschuss                             | `NY.GDP.PETR.RT.ZS` |                201 | 1970–2021              | Geschätzte Ressourcenrente aus Rohölförderung relativ zum BIP.                                                        |
| Gasüberschuss                            | `NY.GDP.NGAS.RT.ZS` |                202 | 1970–2021              | Erdgas; keine getrennte LNG-Bewertung.                                                                                |
| Kohleüberschuss                          | `NY.GDP.COAL.RT.ZS` |                201 | 1970–2021              | Stein- und Braunkohle.                                                                                                |
| Mineralienüberschuss                     | `NY.GDP.MINR.RT.ZS` |                214 | 1970–2021              | Veröffentlichte Gruppe aus zehn Mineralien; keine Einzelmetalle oder Lithiumreihe.                                    |
| Holzüberschuss                           | `NY.GDP.FRST.RT.ZS` |                214 | 1970–2021              | Rundholzernte; keine Waldfläche oder Papierindustrie.                                                                 |
| Ressourcenüberschuss insgesamt           | `NY.GDP.TOTL.RT.ZS` |                214 | 1970–2021              | Veröffentlichte Gesamtreihe; keine eigene Addition unvollständiger Komponenten.                                       |
| Unternehmensgründungen                   | `IC.BUS.NDNS.ZS`    |                184 | 2006–2024              | Neue Gesellschaften mit beschränkter Haftung je 1.000 Menschen von 15–64 Jahren.                                      |
| Export- zu Importpreisen                 | `TT.PRI.MRCH.XD.WD` |                207 | 2000–2024              | Terms of Trade, eigene Länderbasis 2015 = 100; kein absolutes Preisniveau oder Handelsvolumen.                        |
| Logistikbefragungen                      | `LP.LPI.OVRL.XQ`    |                170 | 2007–2022              | Historischer LPI von 1 bis 5, sieben mögliche Erhebungsjahre mit offenen Zwischenräumen.                              |
| Container-Linienanbindung                | `IS.SHP.GCNW.XQ`    |                169 | 2006–2021              | Historischer Index, höchster Länderwert 2004 = 100; spätere Werte dürfen höher liegen.                                |
| Erwerbsbeteiligung bei tertiärer Bildung | `SL.TLF.ADVN.ZS`    |                183 | 1970–2025              | Nenner sind Menschen im Erwerbsalter mit tertiärer Bildung; kein Hochschulanteil an allen Erwerbstätigen.             |

Die sechs Ressourcenrenten sind als Modellschätzungen gekennzeichnet. Ihre
deutschen Bedeutungstexte erläutern Kostenabzug und BIP-Nenner. Die angezeigte
Höhe hängt auch von Rohstoffpreisen und der übrigen Wirtschaftsleistung ab.
Eine niedrige Quote bedeutet keine günstige Anlagemöglichkeit.

Die Logistikausgabe 2023 stammt aus einer Befragung 2022. Die geprüfte WDI-Datei
führt diese Werte unter 2022; dieses Quellenjahr bleibt unverändert. Der Katalog
begrenzt die Reihe mit `throughYear: 2022`. Die inzwischen grundsätzlich anders
aufgebauten LPI-2.0-Daten werden nicht angehängt. Quellen:
[WDI-Metadaten](https://databank.worldbank.org/metadataglossary/world-development-indicators/series/LP.LPI.OVRL.XQ),
[Weltbank: LPI und Methodenumstellung](https://lpi.worldbank.org/en/home).

Die Energieintensität verwendet ausdrücklich die aktuelle Kaufkraftbasis 2021,
nicht die noch auf älteren Seiten genannte Basis 2017. Das Verhältnis ist nur
ein eingeschränkter Hinweis auf Effizienz. Die Quellenorganisation nennt für
IEA-Daten CC BY-NC 3.0 IGO; die Oberfläche verweist deshalb auf die jeweiligen
Ursprungsbedingungen, ohne pauschal jede WDI-Reihe als CC BY 4.0 auszugeben.
[Aktuelle WDI-Definition](https://databank.worldbank.org/metadataglossary/world-development-indicators/series/EG.EGY.PRIM.PP.KD).

Deutschland, USA, Indien und China bleiben gleichberechtigte Länderoptionen.
Tatsächliche Datenunterschiede bleiben sichtbar: Energieintensität endet in
Deutschland/USA 2022, in Indien/China 2021. Chinas Erwerbsbeteiligung bei
tertiärer Bildung hat in diesem Stand nur einen Punkt. Nigeria und Südafrika
besitzen Energieimporthistorien bis 2022 beziehungsweise 2023. Die gemeinsame
Ansicht vergleicht nur ihren gemeinsamen Zeitraum.

## Geprüfte, noch nicht angebundene Kandidaten

Drei weitere Codes lieferten Metadaten und echte Zahlen. Sie wurden bewusst
noch nicht in den universellen Länder-Vergleich aufgenommen:

| Kandidat            | Konkreter Befund                                                                                                                           | Noch nötige Arbeit                                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SI.POV.DDAY`       | Aktuell 3,00 internationale Dollar pro Tag, Kaufkraftbasis 2021; unterschiedliche Einkommens-/Konsumerhebungen und methodische Revisionen. | PIP-Erhebungsarten und Vergleichbarkeitsabschnitte je Land prüfen und im Diagramm berücksichtigen. Keine Verbindung mit alten Armutsgrenzen/Preisbasisständen. |
| `SI.DST.10TH.10`    | Das oberste Zehntel bezieht sich je Erhebung auf Einkommen **oder Konsum**, nicht auf Vermögen.                                            | Erhebungsgegenstand und Zeitbrüche je Land übernehmen; gemeinsame Linien nur bei passender Abgrenzung.                                                         |
| `GC.TAX.GSRV.RV.ZS` | Güter-/Dienstleistungssteuern relativ zu Einnahmen; konsolidierte Zentralregierung und reine Haushaltskonten sind nicht gleich abgegrenzt. | Staatliche Ebene und Abgrenzungswechsel aus Länder-/GFS-Metadaten prüfen; keine vermeintlich gleichartigen Staatsquoten überlagern.                            |

Diese Entscheidungen beruhen auf den
[Weltbank-Grenzen internationaler Verteilungsdaten](https://datahelpdesk.worldbank.org/knowledgebase/articles/114953-do-you-have-global-income-distribution-data)
und den [WDI-Grenzen der Staatseinnahmenstatistik](https://databank.worldbank.org/metadataglossary/world-development-indicators/series/GC.TAX.GSRV.RV.ZS).
Sie sind keine Behauptung, weltweit existierten keine geeigneten Daten.

Die geprüften Source-2-Metadatenanfragen für `SH.UHC.SRVS.CV.XD` und
`SL.ISV.IFRM.ZS` bestanden die erwartete Quellenidentitätsprüfung nicht. Diese
Codes wurden nicht übernommen. Daraus folgt keine Aussage über andere
WHO-/ILO-Veröffentlichungen oder alternative Kennungen.

## Native und visuelle Prüfung

Der echte Tauri-Prozess mit Identifier
`com.personal-macro.atlas-economic-contexts-20260909` hat die 14 Reihen unter
einem Statistikjob weltweit heruntergeladen. Das dauerte rund 26 Sekunden auf
dem Prüfgerät. Die unabhängige Python-Prüfung gleicht alle Originalseiten mit
dem ausschließlich lesend geöffneten separaten SQLite-Cache ab:

- 80.438 numerische Werte stimmen als Dezimalwerte exakt überein.
- 119.419 fehlende Jahreswerte und alle 199.857 Quellenkennzeichen bleiben erhalten.
- 19.520 echte Nullen, 1.532 negative Werte und 2.302 Werte über hundert werden nicht abgeschnitten.
- Die SHA-256-Werte aller Daten-, Metadaten- und Gebietsantworten stimmen mit der nativen Provenienz überein.

Ein zweiter Prozess las alle 126 Antworten für neun ausgewählte Länder-/
Weltgebiete ohne erneuten Statistikdownload. Beide Antwortgruppen wurden gegen
die Datenbank geprüft, insgesamt 16.578 Jahreszellen. Der feste PNG-Stand blieb
identisch (96.115 Bytes). Belege:
[Vollständiger Quellen-/Cacheabgleich](evidence/economic-contexts-audit.json),
[Neustart und Command-Antworten](evidence/economic-contexts-readiness.json).

Die Browserprüfung verwendet die Originalkomponenten und die vorher real
abgerufenen öffentlichen Daten, keine erfundenen Kurven. CUA bestätigt:

- 1024 px: Brennstoffkarten für Deutschland/USA; Energiebilder für Nigeria/
  Südafrika, lesbare lange Einheiten, erkennbarer Tastaturfokus und keine
  horizontale Seitenüberbreite.
- 1440 px: Indien/China im Logistikeinzelbild, sieben getrennte Erhebungspunkte,
  sichtbare Erklärung zum Quellenjahr und zu LPI 2.0; Zahlen standardmäßig verborgen.

Typecheck, Build, gezieltes ESLint und Prettier bestehen. Die 175 Atlas-
Vitest-Fälle bestehen nach Anpassung der Innovationsgruppe von drei auf vier
Reihen (174 zunächst erfolgreich, betroffene Bedienprüfung plus neue Tests
anschließend erneut erfolgreich). Die vier deterministischen WDI-Tests und
der native Katalogtest bestehen; zwei separat markierte Live-Tests wurden
nicht erneut ausgeführt, da der reale globale Tauri-Abruf separat geprüft ist.
Rust-Fmt und Clippy mit `-D warnings` bestehen. Die bekannten großen Vite-Chunks
und MSVC-Linkerhinweise bleiben.

Der Atlas-Speicher initialisierte in beiden Prozessen. Im übrigen Hintergrund
meldeten sich weiterhin der abgelehnte EODHD-Technicals-Abruf und der
Zentralbankbericht-Job; im ersten Lauf trat dort zudem ein
`pdf-extract`-Worker-Panic auf. Diese Meldungen wurden durch diese
Katalogerweiterung nicht behoben. Die vollständige native Fensterbedienung ist
weiterhin nicht abgenommen, weil die native CUA-Oberfläche nicht verfügbar ist.

## Dateiverträge

`statistics-catalog.json` enthält jetzt 78 ergänzende Zuordnungen neben den zehn
ursprünglichen Reihen. `catalog.json` und `coverage-catalog.json` verwenden
Version `2026-09-09.12`; der Statistikteil hat Version `2026-09-09.3`.
Bestehende Geografien und alle vorherigen 74 Reihen bleiben unverändert.
Der Kataloggenerator erhält nun auch die zuvor nur im erzeugten Katalog
ergänzte IMF-Quellenzuordnung. Seine erneute Ausführung entfernt diese
Staatsfinanzquelle nicht mehr. Bestehende Einstiegsreihen bleiben zuerst.

Das Gesamtziel ist weiterhin offen. Diese Erweiterung bearbeitet insbesondere
R03, R14 und R16 und liefert weitere Nachweise zu R17; sie ersetzt nicht die
vollständige Abnahmematrix R01–R18.
