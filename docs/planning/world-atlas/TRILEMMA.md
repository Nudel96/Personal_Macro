# Wirtschaftspolitischer Rahmen · Aizenman / Chinn / Ito

Das Atlas-Thema `institutions:economic_policy_regimes` zeigt drei getrennte
Forschungsdimensionen aus dem öffentlich angebotenen Original-XLSX der Autoren.
Es umfasst 532 Profile für 183 Quellenländer, 24.641 numerische Werte und 7.803
fehlende Beobachtungen. Das ist ein Blick auf internationale Geld- und
Kapitalverkehrspolitik, keine vollständige Typologie aller Wirtschaftspolitik.

Quelle und feste Ausgabe:

- [Autoren und Datenangebot](https://web.pdx.edu/~ito/trilemma_indexes.htm), Stand 31.08.2021.
- [Original-XLSX](https://web.pdx.edu/~ito/trilemma_indexes_update2020.xlsx).
- [Methodenbeschreibung](https://web.pdx.edu/~ito/ReadMe_trilemma_indexes2014.pdf).
- Aizenman, Joshua, Menzie D. Chinn und Hiro Ito (2010): *The Emerging Global
  Financial Architecture: Tracing and Evaluating the New Patterns of the
  Trilemma’s Configurations*, Journal of International Money and Finance 29(4), 615–641.

Die Quellenwerte werden unverändert auf ihrer Skala 0–1 dargestellt. ERS misst
Wechselkursstabilität gegenüber einer Bezugswährung mit Schwellenregeln. MI
verwendet die Zinskorrelation zum Bezugsland und enthält bereits eine Glättung
mit Vorjahr, aktuellem Jahr und Folgejahr. Konstante Zinsen können die
Modellkonvention 0,5 auslösen; dieser Wert ist keine politische Neutralität.
KAOPEN beschreibt gemeldete rechtliche Kapitalverkehrsregeln, keine Menge
beobachteter Kapitalströme. ERS und MI reichen bis 2020, KAOPEN bis 2019.
Spätere eigenständige KAOPEN-Ausgaben werden nicht in diesen Stand eingefügt.
Aus den drei Achsen wird keine Gesamtnote oder erzwungene Summe berechnet.

Der Quellenvertrag prüft alle 199 Originalidentitäten, 12.077 Länderjahre und
24.761 Originalzahlen. Namen plus IMF-/Weltbank-Code wurden gegen die expliziten
ISO3-Zuordnungen des GFDD-Originals geprüft; Schreibweisen und beschädigte
Originalnamen sind einzeln freigegeben. Taiwan, Hongkong und China bleiben
getrennt. 120 Werte der früheren Niederländischen Antillen werden keinem
Nachfolgegebiet zugeordnet. Vollständig leere Gebiete erzeugen kein Datenbild.
USA, Welt, Kontinente und Serbien haben in dieser Ausgabe keine eigenen Werte.

Historische Abgrenzungen folgen der Quelle und werden nicht auf heutige Grenzen
zurückgerechnet. Bei Deutschland, Bangladesch, Pakistan, Eritrea, Äthiopien,
Namibia, Sudan und Jemen sind relevante Gebietsübergänge zusätzlich als
Darstellungsunterbrechung gekennzeichnet; dies sind ausdrücklich Atlasgrenzen
und keine vom Anbieter gelieferten Statusflags. Alle Originalwerte bleiben
erhalten. Keine Verbindung über fehlende Jahre oder über markierte Übergänge.

`public_trilemma.rs` prüft ZIP-Grenzen, Blatt, Kopfzeile, jede Identität,
Einheit, Bereich, Quellenzahl und Originaldezimaltext. Ein unabhängiger
OpenPyXL-/XML-Audit erzeugt die Referenz; der native Volltest vergleicht alle
Profile und öffnet eine temporäre SQLite erneut. Migration `0022_public_series`
wird unverändert wiederverwendet. Import ist atomar, explizit und durch die
gemeinsame Atlas-Abrufsperre sowie 24 Stunden Mindestabstand begrenzt.

Die Oberfläche bietet drei Perspektiven, Länder, Vergleich, Zeitfilter,
optionale Zahlen und gemerkte Ansichten mit Quellenrezept. Beide Länder teilen
den Kalender und dieselbe Skala. Ohne explizite Perspektive wird eine vorhandene
Landesdimension geöffnet; eine ausdrücklich gewählte fehlende Dimension bleibt
leer. Der Browser erfindet keine Werte.

Nachweise: `evidence/public-trilemma-audit.json`,
`evidence/public-trilemma-local-fill-2026-09-11.json`,
`evidence/public-trilemma-native-qa-2026-09-11.json` und
`evidence/public-trilemma-windows-release-2026-09-11.json`.
