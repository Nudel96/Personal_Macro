# Langfristige Marktwellen – implementiertes Rezept

Stand: 9. September 2026. Diese Ansicht beschreibt historische Marktbewegungen.
Sie ist keine fundamentale Unter-/Überbewertung und enthält keine Prognose.

**Katalogerweiterung vom 15. September 2026:** Jetzt 59 Fonds für 43 Länder,
die Welt, elf US-Sektoren und vier globale Themen. Die 33 zusätzlichen Länderfonds
liefern 8.618 abgeschlossene Monatsbeobachtungen. Emittenten, Auflegung und
Indexwechsel wurden separat geprüft; GREK beginnt nach März 2016, VNM nach März
2023 eine neue Definition. Siehe [weltweite Ergänzungen](GAP-EXPANSION.md).
Der folgende Abrufnachweis vom 8. September beschreibt den damaligen Katalog.

## Quellen und tatsächlich geprüfte Abdeckung

Der Atlas verwendet den vorhandenen EODHD-Schlüssel und den
[Historical-Endpoint](https://eodhd.com/financial-apis/api-for-historical-data-and-volumes).
EODHD beschreibt `adjusted_close` als um Splits und Ausschüttungen bereinigten
Schlusskurs. Der Atlas fordert tägliche Daten an und übernimmt je abgeschlossenem
Kalendermonat den letzten gelieferten Handelstag. Fehlt dort `adjusted_close`,
bleibt der Monat fehlend. Unbereinigte Schlusskurse werden nicht eingesetzt.

Am 8. September 2026 wurden alle 26 Katalogsymbole mit dem echten Rust-Adapter
geladen, in einer temporären SQLite-Datei gespeichert und wieder gelesen.
Alle lieferten bereinigte Monatsbeobachtungen bis August 2026. Dies belegt die
aktuelle technische Freigabe im vorhandenen Paket; es garantiert keine
dauerhafte Providerfreigabe oder vollständige Länder-Sektor-Abdeckung.

| Bereich | Tatsächlich zugeordnete Fonds | Reichweite |
| --- | --- | --- |
| Länder | SPY, EWG, INDA, MCHI, EZA, EWJ, EWA, EWC, EWU, EWZ | USA, Deutschland, Indien, China, Südafrika, Japan, Australien, Kanada, Vereinigtes Königreich, Brasilien |
| Welt | ACWI | Börsenaktien aus Industrie- und Schwellenländern |
| US-Sektoren | XLB, XLC, XLE, XLF, XLI, XLK, XLP, XLRE, XLU, XLV, XLY | Elf S&P-500-Sektoren, keine weltweiten Sektorindizes |
| Weltweite Themen | TAN, NLR, URA, HYDR | Solarunternehmen, Kernenergie, Uran/Nuklearkomponenten, Wasserstoffunternehmen |

Die Fondsauswahl ist eine explizite Zuordnung für das Bild, keine Produktempfehlung.
Länderfonds stehen für ihren börsennotierten Aktienkorb, nicht für alle Unternehmen
oder die gesamte Wirtschaftsleistung des Landes. Alle zugeordneten Notierungen
sind in USD; Fremdwährungseffekte sind Bestandteil dieser Perspektive. Ein
globaler Solarfonds wird nicht als südafrikanischer oder afrikanischer Solarsektor
beschriftet. Ein Wechsel zum globalen Kontext erfolgt durch eine sichtbare Auswahl.

Primäre Produktbeschreibungen: [iShares-Fondskatalog](https://www.ishares.com/us/products/etf-investments),
[S&P-500-Sektoren bei State Street](https://www.ssga.com/us/en/intermediary/capabilities/equities/sector-investing/select-sector-etfs),
[SPY](https://www.ssga.com/us/en/intermediary/etfs/state-street-spdr-sp-500-etf-trust-spy),
[ACWI](https://www.ishares.com/us/products/239600/ishares-msci-acwi-etf),
[TAN-Factsheet](https://www.invesco.com/content/dam/invesco/us/en/product-documents/etf/fact-sheet/tan-invesco-solar-etf-fact-sheet.pdf),
[NLR](https://www.vaneck.com/us/en/investments/uranium-nuclear-energy-etf-nlr/performance/),
[URA](https://www.globalxetfs.com/funds/ura),
[HYDR](https://www.globalxetfs.com/funds/hydr).

Der Produktkatalog `market-proxies.json` enthält Symbol, Themenzuordnung,
Gebiet, Reichweite, Auflagedatum, Währung, Quellenlink, Grenzen und bekannte
Bruchmonate. Es gibt keine rückgerechnete Vorauflage-Historie. Dokumentierte
Brüche starten die Vorlaufzeit neu: Immobilienausgliederung XLF 2016-09,
Kommunikationssektor-Umschichtung XLK/XLY 2018-09, NLR-Benchmarkwechsel 2014-03
und die beiden URA-Strategieumstellungen 2018-05/2018-08. Der TAN-Fondsübergang
2018 ist als Fortführung des Vorgängerfonds in der Beschreibung kenntlich.
Die Sektorbrüche folgen den veröffentlichten Indexänderungen:
[Immobilienausgliederung 2016](https://press.spglobal.com/2016-06-07-S-P-Dow-Jones-Indices-Announces-Changes-to-the-Financial-Services-Select-Sector-Real-Estate-Select-Sector-and-Financial-Select-Sector-Indices)
und [GICS-Umschichtung 2018](https://www.spglobal.com/spdji/en/documents/indexnews/announcements/20180111-646149/646149_gicspressreleasejan2018.pdf).

## Berechnung

Version: `log-ols60-trailing12-rank120-min60-v1`, kanonisch in Rust.

1. Die jeweils letzten 60 lückenlosen Monatswerte werden logarithmiert.
2. Eine lineare Regression mit Zeitindex 0…59 liefert den Trend am letzten
   Beobachtungspunkt. Der logarithmische Abstand zu diesem Trend ist das Residuum.
3. Die letzten zwölf zeitlich zusammenhängenden Residuen werden gemittelt.
4. Die sichtbare Welle ist `100 × expm1(gemitteltes Residuum)`.
5. Die Mittellinie bedeutet Abstand null zum beweglichen historischen Trend.
   Die Skala wird im Vergleich gemeinsam und symmetrisch um null aufgebaut.
6. Optional wird der aktuelle Abstand gegenüber höchstens 120 vorangegangenen
   Wellenwerten eingeordnet; mindestens 60 vorherige Werte sind nötig. Exakte
   Bindungen zählen mit halbem Gewicht. Bei konstanter Referenz gibt es keinen Rang.

Der erste Wellenpunkt benötigt 71 zusammenhängende abgeschlossene Monate.
Nullwerte, übersprungene Monate und dokumentierte Strukturbrüche unterbrechen
Trend, Glättung und Rangreferenz. Es gibt keine beidseitige Glättung, ergänzten
fehlenden Kurse oder sinusförmige Zukunftsfortschreibung. Neue Beobachtungen
verändern die zuvor berechneten Punkte nicht. Providerrevisionen können dagegen
die gesamte historische Quelle und damit auch die neue Berechnung verändern.

Die Vorlaufzeit ist eine transparente Modellentscheidung, kein Naturgesetz.
HYDR liefert aktuell 62 Monatsbeobachtungen und erhält deshalb noch keine
langfristige Welle. Ein kürzeres Fenster wird nicht gewählt, um doch ein
Signal produzieren zu können. Kleinere/neuere Branchen können andere Quellen
und zunächst eine Strukturansicht benötigen.

## Empfindlichkeit und Validierung

Zusätzlich werden 48-/84-Monatstrends sowie Glättungen über sechs/18 Monate
geprüft. Wenn eine vollständige Variante am aktuellen Punkt die andere Seite
der Mittellinie ergibt, meldet die Oberfläche eine zeitfensterabhängige Lage.
Fehlen genügend Daten für diese Prüfung, bleibt das Merkmal unverfügbar.
Gleiche Richtungen beweisen keine Prognosefähigkeit und keine faire Bewertung.

Die [lokale Sensitivitätsprobe](evidence/market-wave-sensitivity.json) verwendet
echte Historien von SPY, EWG, XLV, TAN und HYDR. Eine unabhängige Offline-
Nachrechnung reproduzierte die Rust-Welle mit einer maximalen Abweichung unter
`1e-8` Prozentpunkten. Zwischen den untersuchten Fensteralternativen lag die
historische Übereinstimmung der Seite der Mitte ungefähr zwischen 74 und 92
Prozent, je nach Reihe und Variante. Am letzten geprüften Punkt widersprachen
sich Varianten für EWG und XLV. Deshalb ist die Empfindlichkeit nun Teil der
nativen Antwort und des sichtbaren Bildes. Diese Probe ist keine ökonomische
Validierung einer Handelsstrategie.

Die [Offline-Nachrechnung](evidence/market-wave-sensitivity.mjs) ist ausführbar
mit `node docs/planning/world-atlas/evidence/market-wave-sensitivity.mjs`.
Sie liest standardmäßig die ignorierte lokale Datei
`apps/desktop/.tmp/atlas-validation/market-review.json`; alternativ wird ihr ein
Dateipfad als erstes Argument übergeben. Der ignorierte Rust-Netzwerktest
erzeugt diese lokale Fünf-Fonds-Stichprobe bei explizit gesetztem
`ATLAS_WRITE_REVIEW=1`. Ohne diese Variable prüft er den gesamten Marktkatalog.

Deterministische Tests prüfen konstantes logarithmisches Wachstum ohne
erzwungene Welle, positive/negative Ausschläge, Preismaßstabsinvarianz, fehlende
Monate, Brüche, Mindesthistorie, geschlossene Monate, fehlende bereinigte Kurse,
widersprüchliche Duplikate, Zukunftsdaten und unveränderte frühere Ergebnisse.
SQLite-Tests prüfen Erstinstallation, Upgrade eines befüllten Atlas-v1-Caches,
Rollback bei fehlerhafter Übernahme und erneutes Öffnen.

## Abruf und lokale Speicherung

Ein expliziter Einzelabruf lädt genau ein Katalogsymbol. Die Marktübersicht kann
zusätzlich eine ausdrücklich ausgewählte Gruppe gesammelt laden. Im Atlas läuft
höchstens ein Abruf zugleich, gemeinsam mit Statistik- und Historienjobs gesperrt.
Ein erfolgreich geladener Fonds
kann frühestens nach 24 Stunden erneut geladen werden. Es gibt keine automatische
Hintergrundaktualisierung aller Fonds, keine automatische Quota-Wiederholung und
keinen zusätzlichen Anbieter. 401/403, 404, 429, Netzwerkfehler, übergroße Antworten
und ungültige Daten behalten den vorherigen lokalen Stand. Die eigene Begrenzung
ersetzt noch keinen zentralen, anbieterübergreifenden Quota-Scheduler.

Metadaten und Kurse werden gemeinsam in einer Transaktion ersetzt und gelesen.
Der Cache speichert Abrufzeit, Originalzeitraum, Token-freie Quellenadresse und
SHA-256 der Antwort. Der Schlüssel verbleibt ausschließlich im nativen
Anfragepfad. Tests und Sichtprüfungen verwenden keine persönliche Datenbank.

## Kleine Wellen in der Marktübersicht

`/world-atlas?view=markets` ordnet dieselben 26 Fonds in Länder/Welt,
US-Börsensektoren und globale Energiethemen. Die Auswahl kann nach diesen Gruppen
gefiltert werden. Es gibt kein wertbasiertes Ranking und keine automatisch
wechselnde Kartenreihenfolge. Ein Klick oder Enter auf einer Karte öffnet den
konkreten Fonds; dessen Kennung bleibt in der URL erhalten.

Alle sichtbaren Karten teilen den letzten abgeschlossenen UTC-Monat, den
gewählten Zeitraum (zehn oder zwanzig Jahre beziehungsweise alle verfügbaren
Wellenjahre) und einen symmetrischen Maßstab. Der Maßstab umfasst die größte
absolute Abweichung im sichtbaren Fenster, mit Rand und mindestens zehn
Prozentpunkten je Seite. Ein Wechsel der Gruppe oder des Fensters kann ihn
ändern; innerhalb der Auswahl bleibt er gemeinsam. Berechnungsrezept und
USD-Perspektive müssen übereinstimmen. Werte aus dem laufenden oder zukünftigen
Monat werden nicht eingezeichnet. Fehlende Monate unterbrechen den SVG-Pfad;
einzelne Punkte werden gezeigt, eine künstliche Sinuskurve wird nicht ergänzt.

Jede Karte benennt die Reichweite des Fonds. Alte Daten, unzureichende Historie,
Zeitfensterempfindlichkeit und lokale Lesefehler erhalten eigene Texte. Zahlen
sind zunächst ausgeblendet. Ohne nutzbare Welle bleibt die Karte ein sichtbarer
Leerzustand. Die Browser-Vorschau erzeugt weiterhin keine Ersatzmarktdaten.

Der neue Sammelabruf verwendet ausschließlich den bestehenden EODHD-Adapter und
die gemeinsame Atlas-Sperre. Doppelte, leere oder unbekannte Auswahlen werden
abgelehnt. Schon innerhalb der letzten 24 Stunden erfolgreich geladene Fonds
werden übersprungen, auch wenn sie noch zu jung für eine Welle sind. Jede
abgeschlossene Marktgeschichte wird atomar gespeichert und sofort für die
Oberfläche freigegeben. Der Fortschritt zählt abgeschlossene Fonds.

**Nach aktuellem Fonds stoppen** gilt nur für die konkrete aktive Abrufkennung.
Der laufende Abruf und seine atomare Speicherung werden abgeschlossen, danach
wird vor dem nächsten Fonds gestoppt. Bei einem Providerfehler stoppt die Folge
ebenfalls; frühere Erfolge und der vorherige Stand des betroffenen Fonds bleiben
erhalten. Erneutes Laden derselben Auswahl setzt bei den noch ausstehenden
beziehungsweise nicht mehr aktuellen Fonds an. Es gibt keinen automatischen
Wiederholungsabruf nach einem Fehler.

Die Erweiterung wurde mit deterministischen Geometrie-/Bedientests sowie
temporären SQLite-Tests für Fehler nach Teilerfolg, Stoppen während eines Abrufs,
Wiederaufnahme, Offline-Neustart und die gemeinsame Sperre geprüft. Der explizite
Test `world_atlas_live_market_batch_roundtrip` lud SPY und TAN tatsächlich über
den asynchronen Sammeldienst; beide wurden gespeichert, ein erneuter Abruf
innerhalb von 24 Stunden wurde abgelehnt. Die Fünf-Fonds-Sichtstichprobe wurde
mit der aktuellen nativen Empfindlichkeitsprüfung neu erstellt.
Die unabhängige Nachrechnung und die Browser-Sichtprüfung sind weiterhin von
einer vollständigen nativen Klickabnahme zu unterscheiden.

## Weiter offen

Weitere Länder und landesspezifische Sektoren sowie fundamentale Bewertungsreihen
gehören weiterhin zum vollständigen Atlas-Auftrag. Der vorhandene Themenkatalog
ist keine Behauptung, dass jeder Länder-Sektor bereits angebunden wäre.
Die [weltweiten UN-Altersprofile](DEMOGRAPHY.md) und
[historischen Wirtschaftsperspektiven](HISTORY.md) sind inzwischen als eigene
Bausteine implementiert.
