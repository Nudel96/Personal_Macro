# Relative Marktstärke · monatliche Fondsvergleiche

`market_context:relative_strength` vergleicht 58 vorhandene Marktstellvertreter
aus dem lokalen Atlas-Cache. Es werden keine zusätzlichen Datenanbieter,
Abonnements oder API-Abrufe für die Berechnung benötigt. Die bereits
angebundenen EODHD-Fondshistorien liefern die bereinigten Monatskurse.

Elf US-Sektorfonds verwenden SPY (S&P 500) als Referenz. 43 Länderfonds,
einschließlich SPY als US-Länderbild, und vier globale Themenfonds verwenden
ACWI (MSCI ACWI). ACWI wird nicht mit sich selbst verglichen. Wasserstoff,
Solar, Kernenergie und Uran bleiben globale Fondsbilder; Länder ohne passend
zugeordneten Fonds erhalten keinen stellvertretenden Weltwert.

Die [Erweiterung vom 15. September 2026](GAP-EXPANSION.md) ergänzt 33 Länderfonds
aus den geprüften EODHD-Historien. Quellen- und Indexwechsel bleiben sichtbar.

## Berechnung und Grenzen

Für jeden gemeinsamen Kalendermonat gilt:

`relative = (market_month / market_base) / (benchmark_month / benchmark_base) × 100`

Die Basis ist der erste gemeinsam gültige Monat im gewählten Zeitraum.
10 Jahre umfassen höchstens 120 abgeschlossene Monatsbeobachtungen, 20 Jahre
höchstens 240. Die gesamte gemeinsame Geschichte beginnt spätestens mit dem
jüngeren Fonds. Zwei Länderkurven erhalten dieselbe Basis und Referenz. Ein
Wechsel des Zeitfensters oder Vergleichslandes kann deshalb die Basis ändern.
Zwei echte Beobachtungen je Kurve sind mindestens nötig. Die separate
Marktwellen-Berechnung und deren Vorlaufzeit werden nicht verwendet.

Steigende relative Werte bedeuten stärkere Entwicklung als die Referenz,
auch wenn beide Kurse fallen. Die Linie beschreibt keine absolute Rendite,
keinen fairen Wert und keinen RSI. Die Mittellinie ist lediglich der Beginn
des Vergleichs. Es werden keine Sinusphasen oder Rückkehr zur Mitte erzwungen.

Alle Fonds werden in USD und mit identischer EODHD-adjusted-close-Definition
verglichen. Diese Kurse berücksichtigen Splits und Ausschüttungen. Der
bestehende Import speichert den letzten gelieferten Handelstagskurs je
abgeschlossenem Monat. Taggenaue Zeitstempel je Beobachtung fehlen im älteren
Monatscache; die neue Ansicht behauptet daher keine Synchronität desselben
Handelstags. Sie ist ausdrücklich ein grober Monatsvergleich.

Nullkurse, negative oder nicht endliche Werte, doppelte oder unsortierte
Monate, falsche Referenzen und abweichende Kursbereinigungen werden abgewiesen.
Fehlende Monate bleiben leer. Nach einem dokumentierten Katalogbruch beginnt
die vergleichbare Geschichte mit dem ersten vollständigen Folgemonat neu.
Das betrifft unter anderem Finanz-, Technologie- und Konsumsektoren sowie
veränderte Nuklearfondsdefinitionen. Andere Abrufdaten und ältere oder fehlende
Endbeobachtungen bleiben sichtbar. Fondskosten, Zusammensetzung und
Wechselkurseinflüsse gehören zur Interpretation.

## Oberfläche und Abdeckung

`atlas-relative.ts` berechnet ausschließlich aus Antworten des vorhandenen
lesenden `api.atlasMarket`-Commands. `atlas-relative-panel.tsx` zeigt den
ausgewählten Fonds, die benannte Referenz, die gemeinsame Geschichte und
optionale Zahlen. Der globale Ländervergleich ergänzt eine zweite Kurve nur
bei gleicher Referenz. Aktualisierung verwendet die vorhandenen expliziten
nativen Abrufe mit globaler Sperre und 24-Stunden-Abstand.

Die Abdeckungsübersicht liest auch die nötigen Referenzfonds aus dem Cache und
zählt nur tatsächlich berechenbare Paare als lokale Bilder. Fehlende
Referenzkurse gelten nicht als neutral. Gemerkte Ansichten speichern Fonds,
Referenz, Zeitfenster, beide Quellenstände, Hashes und Berechnungskennung
`atlas-relative-monthly-adjusted-ratio-common-base-v1`.

## Quellen und Nachweise

Methodische Grundlage: [Fidelity · Relative Strength Comparison](https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/relative-strength-comparison).
Kursdefinition: [EODHD · End-of-Day Historical Data](https://eodhd.com/financial-apis/api-for-historical-data-and-volumes).
Fondsidentitäten und Änderungen: bestehender geprüfter
`data/market-proxies.json`, jeweils mit originalem Anbieterlink.

`evidence/audit_relative_strength.py` liest ausschließlich den öffentlichen
Atlas-Cache im Nur-Lese-Modus. Eine unabhängige Decimal-Berechnung prüft alle
25 Paare in drei Zeitfenstern; am 11.09.2026 sind das 12.692 Monatspunkte aus
26 real gespeicherten Fondshistorien. Keine Journal-Datenbank wird gelesen
oder verändert. Weitere Nachweise: `evidence/relative-strength-*-2026-09-11.json`.
