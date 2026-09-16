# Historische Börsenkonzentration

Zwei Originalreihen aus dem Weltbank-GFDD-Archiv vom September 2022 ergänzen
`market_context:market_concentration`. Die zugrunde liegenden Angaben stammen
von der World Federation of Exchanges. Die 60 tatsächlich vorhandenen Länder
und Gebiete besitzen 120 Profile mit 1.829 Zahlen und 931 offenen Jahreszellen.
Die ausgewählten Reihen umfassen 1998–2020, obwohl die vollständige Datenbank
andere Indikatoren bis 2021 enthält.

- `GFDD.AM.02` / `am02`: Anteil der Marktkapitalisierung außerhalb der zehn
  größten Unternehmen am veröffentlichten Börsenmarktwert.
- `GFDD.AM.01` / `am01`: Anteil des gehandelten Aktienwerts außerhalb der zehn
  meistgehandelten Unternehmen. Bei mehreren Börsen eines Landes bildet die
  Quelle einen einfachen Mittelwert; dies ist kein nach Handelswert gewichteter
  Landesgesamtanteil.

Beide Werte bleiben in ihrer Originalrichtung. Ein niedriger Anteil außerhalb
der Top 10 bedeutet stärkere Konzentration auf diese Gruppe. Die Darstellung
verwendet die feste Skala 0–100 und rechnet keine eigene Top-10-Quote aus.
Marktkapitalisierung und Handelsaktivität sind unterschiedliche Perspektiven.
Für `am02` wird keine in den Metadaten unbelegte nationale Aggregationsmethode
unterstellt. Unterschiedliche Börsendeckung bleibt eine Vergleichsgrenze.

Es handelt sich weder um Gewichte eines bestimmten Fonds oder Index noch um
Wettbewerb in der gesamten Volkswirtschaft. Heutige Portfolios werden nicht
rückwirkend verwendet. Welt und Kontinente besitzen keine Ersatzaggregate.
China, Hongkong und Taiwan bleiben drei getrennte Originalprofile. Frankreich
hat in diesen Reihen keine Zahlen und wird nicht durch eine europäische Börse
ersetzt. Die letzten tatsächlichen Jahre unterscheiden sich nach Land: etwa
2016 für die USA und 2018 für Indien. Die Archivgrenze 2020 behauptet keine
bis dahin vollständige Landesgeschichte.

`evidence/build_public_gfdd.py` liest die Originalzahlen aus dem XLSX-XML und
gleicht jede ausgewählte Zelle mit OpenPyXL ab. `public_gfdd.rs` validiert sie
unabhängig mit Calamine, wobei originale Dezimaltexte erhalten bleiben. Lange
Nachkommastellen sind Dateidarstellung und keine zusätzliche Messgenauigkeit.
Geprüft werden Datei- und Metadatensatz, 214 ursprüngliche Länderidentitäten,
13.268 eindeutige Länderjahre, zwei Spalten und ihre numerische Wertebereiche.
Die ältere Tabelle vom November 2021 und sämtliche anderen Finanzindikatoren
werden nicht vermischt. ZIP- und XML-Größen sind begrenzt.

Der Import läuft im getrennten öffentlichen Atlas-Cache über die bestehende
Migration 0022, atomar und mit gemeinsamer Abrufsperre sowie 24 Stunden Abstand.
Quellenstand, Prüfsumme, Zeitraum und Perspektive bleiben im Merkkontext.
Die Browser-Vorschau zeigt die Abdeckung ohne erfundene Beobachtungen.

Originalquellen:

- [GFDD-Veröffentlichung und Download](https://www.worldbank.org/en/publication/gfdr/data/global-financial-development-database)
- [Definition Marktkapitalisierung außerhalb der Top 10](https://databank.worldbank.org/metadataglossary/global-financial-development/series/GFDD.AM.02)
- [Definition Handel außerhalb der Top 10](https://databank.worldbank.org/metadataglossary/global-financial-development/series/GFDD.AM.01)
- [Unveränderte Arbeitsmappe September 2022](https://thedocs.worldbank.org/en/doc/5882f2b2117b882d58a78f9c64ea3613-0050062022/original/20220909-global-financial-development-database.xlsx)

Weltbank und WFE bleiben als Quellen genannt. Die Anwendung speichert die
öffentlich angebotenen Originalanteile für den lokalen persönlichen Gebrauch;
eine Lizenz für WFE-Rohdaten wird daraus nicht abgeleitet.
