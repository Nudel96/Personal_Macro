# Historische Geld- und Währungssysteme · JST R6

`long_history:monetary_systems` zeigt zwei historische Einordnungen aus der
Jordà-Schularick-Taylor Macrohistory Database: weite und strenge
Wechselkursbindung. Die Quellenwerte `peg` und `peg_strict` sind binäre
Jahresklassen. Sie werden als datierte Farbbänder mit benannter Bedeutung
dargestellt; es gibt keine numerische Bewertungswelle oder automatische
Gleichsetzung von Bindung und Golddeckung.

[Originalangebot und Zitierung](https://www.macrohistory.net/database/),
[Dokumentation R6](https://sfff5b3ac9317c4be.jimcontent.com/download/version/1676279836/module/9834516169/name/JST_documentationR6.pdf),
[fester Originaldownload](https://sfff5b3ac9317c4be.jimcontent.com/download/version/1763503850/module/9834512569/name/JSTdatasetR6.xlsx).
Release 6, Juli 2022, Quellenjahre 1870–2020, hier geprüft am 11.09.2026.
JST steht unter CC BY-NC-SA 4.0; persönliche nichtkommerzielle Verwendung.
Zitierung: Òscar Jordà, Moritz Schularick und Alan M. Taylor (2017),
*Macrofinancial History and the New Business Cycle Facts*, NBER Macroeconomics
Annual 2016, Band 31, herausgegeben von Martin Eichenbaum und Jonathan A. Parker.

Die weite Bindungsdefinition umfasst gleitende Bindungen, die strenge
schließt diese aus. Beispielsweise ist Australien 1975 in der weiten Definition
gebunden, in der strengen nicht. Eine Null ist eine echte Quellenklasse und
keine fehlende Angabe. Die Quelle kombiniert historische Forschung und spätere
Regimeklassifikationen; Praxis und formelle Ankündigung sind nicht automatisch
identisch. Die genauen Definitionen bleiben über die Originaldokumentation
nachvollziehbar.

18 Länder erhalten 36 lokale Profile, 5.336 klassifizierte Länderjahre und
100 explizite Lücken. Irland hat vor 1920 keine eigene Klassifikation. Es
entstehen keine Welt-, Indien- oder Afrikabilder aus diesen Industrieländern.
Historische Quellengebiete werden nicht auf heutige Grenzen zurückgerechnet.

Die Zusatzfelder `peg_type` und `peg_base` bleiben je Jahr im Tooltip als
Modellrolle und Modell-Bezugsbasis erhalten. Ein schwankendes Land kann dort
trotzdem ein Bezugsland haben; dieses ist keine nachträglich behauptete feste
Währungsbindung. `BASE` kann in der ursprünglichen Bindungsvariable 0 oder 1
tragen. `NA` ist ein Originalkategorienlabel und bleibt von einer leeren Zelle
unterschieden. Der Atlas erfindet weder Gold-, Silber- oder Fiat-Epochen noch
eine genaue unterjährige Ereignischronologie aus Jahresklassen.

`public_regimes.rs` prüft Hash, begrenzte ZIP-Größe, Blatt, 59 Kopfspalten,
alle 2.718 Länderjahre, Gebietsnamen, ISO3, IFS-Code, beide binären Felder und
beide Textklassifikationen. Alle 36 Profile werden unabhängig aus OpenPyXL
erzeugt und im nativen Test einschließlich SQLite-Wiederöffnung verglichen.
Bestehende JST-Finanzreihen bleiben unverändert. Das eigene öffentliche Paket
verwendet unverändert Atlasmigration 0022, atomaren Austausch, Abrufsperre
und mindestens 24 Stunden zwischen erfolgreichen Abrufen.

Die Oberfläche bietet beide Definitionen, Landesvergleich mit gemeinsamem
Kalender, Zeitfilter, explizite Quellenlücken und gemerkte Ansichten mit
Originalrezept. Der Zahlenmodus verwandelt Kategorien nicht in Scores.
Nachweise stehen unter `evidence/public-regimes-*-2026-09-11.json` und
`evidence/public-regimes-audit.json`.
