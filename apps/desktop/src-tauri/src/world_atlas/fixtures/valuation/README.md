# Öffentliche NYU-Originaldateien

Diese unveränderten Tabellen sind kleine fachliche Testfixtures für den
Weltatlas. Quelle: Aswath Damodaran, NYU Stern, öffentliches Datenarchiv.
Sie enthalten Branchenaggregate und keine persönlichen Journalwerte.

- https://pages.stern.nyu.edu/~adamodar/pc/archives/peEurope11.xls – Europa 2012,
  ohne Tabellenstempel, ursprünglicher Tippfehler „Numebr of firms“.
- https://pages.stern.nyu.edu/~adamodar/pc/archives/pedata13.xls – USA 2014,
  ältere, nicht ausdrücklich nach Verlustfirmen abgegrenzte Aggregatquoten.
- https://pages.stern.nyu.edu/~adamodar/pc/archives/pedata17.xls – USA 2018,
  ausdrücklich bezeichnete Firmenauswahl in den Aggregatspalten.

Die geprüften SHA-256-Werte stehen im produktiven `valuation-catalog.json`.
Der Test prüft unveränderte Quellwerte, Definitionen und die Zurückweisung
nachträglich geänderter Archivbytes. Der vollständige unabhängige Quellenabgleich
verwendet zusätzlich die lokal abgerufenen Originaldateien und Python/xlrd.
