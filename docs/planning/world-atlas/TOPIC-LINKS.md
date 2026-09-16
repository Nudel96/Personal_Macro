# Weitere Themen mit vorhandenen Bildern erschlossen

Stand: 9. September 2026. Sieben bisher leere Themeneinstiege öffnen jetzt
passende vorhandene Perspektiven. Dafür ist keine weitere API, Datenquelle
oder kostenpflichtige Verbindung nötig. Daten und Berechnungen bleiben in den
bisherigen lokalen Atlaspfaden.

## Bewertungsbilder

- **Versorgungsunternehmen** unter Strom & Erzeugung öffnet Stromunternehmen,
  allgemeine Versorger und Wasserversorger als drei getrennte NYU-Branchen.
- **Luft- und Raumfahrt** und **Verteidigungsindustrie** öffnen beide die
  gemeinsame Quellenbranche `Aerospace/Defense`. Eine Aufteilung in zivile
  Luftfahrt, Raumfahrt und Rüstung ist darin nicht enthalten.
- Die fachliche Abgrenzung steht bereits auf der Themenseite und bleibt in
  der Bewertungsansicht sichtbar. Quellenregionen und vorhandene Historie
  werden unverändert übernommen. Deutschland öffnet ausdrücklich die globale
  Stichprobe; Indiens Buchwertpaket bleibt eine Momentaufnahme für 2026.

Der Katalog enthält damit **47 Themenzuordnungen und 169 Verknüpfungen zu
90 unterschiedlichen bestehenden Branchen**. Die zusätzlichen Wege erzeugen
keine neuen Branchen oder Zahlen. Alle Namen sind gegen die bereits geprüften
Originalarbeitsmappen abgeglichen. Die aktuelle
[NYU-Primärtabelle](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/pbvdata.html)
bestätigt die drei Versorgerbranchen und die gemeinsame Luftfahrt-/Verteidigungsbranche.
[Maschineller Quellenabgleich](evidence/valuation-topic-audit.json).

## Wirtschaftliche Entwicklung

Vier zusätzliche Themen verwenden die vorhandenen Kontextkarten:

| Thema                  | Bildzugang                                                    | Grenze                                                                                            |
| ---------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Gesamtproduktivität    | Wirtschaftsleistung je erwerbstätiger Person                  | Ergänzende Arbeitsproduktivität; eine eigene Gesamtfaktorproduktivität ist noch nicht angebunden  |
| Ungleichheit           | Gini-Index für Einkommen oder Konsum                          | Unterschiedliche Erhebungsgrundlagen; keine Vermögensungleichheit oder Armutsquote                |
| Technologieverbreitung | Internetnutzung, feste Breitbandanschlüsse, Mobilfunkverträge | Digitale Teilperspektiven, unterschiedliche Nenner; keine vollständige Messung aller Technologien |
| Finanzielle Anspannung | BIS-Kreditabstand und JST-Wirtschaft mit Krisenanfängen       | Historischer Kontext; kein aktueller Stressindex oder berechneter Krisentermin                    |

Die vorhandene WDI-Reihe misst
[BIP je Erwerbstätigen auf Kaufkraftbasis](https://data.worldbank.org/indicator/SL.GDP.PCAP.EM.KD).
Die [Gini-Metadaten](https://databank.worldbank.org/metadataglossary/world-development-indicators/series/SI.POV.GINI)
erläutern Einkommen/Konsum und die Grenzen der Vergleichbarkeit.
[Internetnutzung](https://data.worldbank.org/indicator/IT.NET.USER.ZS) zählt
Menschen; [Mobilfunkanschlüsse](https://databank.worldbank.org/metadataglossary/world-development-indicators/series/IT.CEL.SETS.P2)
zählen Verträge einschließlich aktiver Prepaid-Anschlüsse.
Der [BIS-Kreditabstand](https://data.bis.org/topics/CREDIT_GAPS) ist ein
veröffentlichter Modellindikator für mögliche Verwundbarkeit;
[JST](https://www.macrohistory.net/database/) liefert den getrennten historischen
Länderkontext. Im Atlas bleibt die geprüfte Ausgabe R6 maßgeblich.

Insgesamt bestehen jetzt **14 Kontextseiten mit 29 Verknüpfungen**. Land und
Vergleich bleiben beim Wechsel zum Bild und beim Rückweg erhalten. Die
Quellenübersicht zählt diese Seiten weiterhin nicht als zusätzliche Messreihen.

## Nachweise

- 247 Atlas-Vitestfälle in 35 Dateien bestehen. Neue Fälle prüfen exakte
  Digitalreihen, Länder und Rückwege, die vollständige Kreditgeschichte sowie
  drei Bewertungswege mit zurückgesetzten fremden Filtern.
- Typecheck, gezieltes ESLint, Formatprüfung und Produktionsbuild bestehen.
  Der bekannte Hinweis auf große Vite-Chunks bleibt.
- Im isolierten nativen Profil bleiben **46 Notizkontexte und die letzte
  Ansicht** nach echtem Prozessneustart unverändert. Die Prüfung liest
  ausschließlich das Testprofil. Sie speichert keine erfundenen Quellenstände
  oder Bilder. [Prüfbericht](evidence/topic-links-readiness.json),
  [Prüfer](evidence/check_topic_links_native.py).
- Browserprüfung mit dem echten Produktfrontend und öffentlichen Antworten
  früherer nativer Quellenabrufe: digitale Bilder für Indien/China,
  Tastaturbedienung und Rückweg; Kreditgap mit vollständiger Geschichte;
  gemeinsame Luftfahrt-/Verteidigungsbranche und fehlende indische Langhistorie.
  Deutschlands Versorgerweg öffnet drei getrennte globale Branchenbilder.
  Bei 1024 Pixeln bleiben Karten und Bildbeschriftungen ohne Seitenüberlauf lesbar.
  Die Browserkonsole meldete während dieser Prüfung keine Warnungen oder Fehler.

Der native Atlas-Speicher initialisiert erfolgreich. Die bekannte automatische
EODHD-Technicals-Aktualisierung außerhalb des Atlas meldete einen abgelehnten
Providerzugriff. Die Navigationsprüfung ist davon unabhängig.

Diese Erweiterung schließt Navigationslücken. Die noch nicht angebundene
Gesamtfaktorproduktivität, ein eigener Stressindex sowie weitere offene
Sektor-/Länderquellen sind dadurch nicht implementiert. Eine vollständige native
Klickabnahme des Atlas bleibt offen.
