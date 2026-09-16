# Quellenbereitschaft – tatsächliche Planungsevidenz

Erzeugt aus den Abrufen vom 2026-09-08T18:04:40.161331+00:00. Keine Produktionsadapter wurden hiermit abgenommen.

## Umfang und Ergebnis

- 8 Hauptfelder, 24 Gruppen und 233 Themen sind im Planungskatalog enthalten.
- 20 Quellen-/Quellenfamilieneinträge; generische Kandidaten sind ausdrücklich so markiert.
- 248 UN-M49-Gebiete eingelesen; IDs und ISO3 eindeutig, die vier ausdrücklich genannten Länder vorhanden.
- Bevölkerung 2023: 217 von 217 nicht aggregierten World-Bank-Gebieten mit Wert.
- 10 Reihenfamilien, 120 Land-Reihe-Stichproben; jede mit Beginn, Ende und internen Lücken.
- JSON-Struktur, IDs, Eltern, Quellenreferenzen und Verweise der Startreihen lokal validiert.
- Keine Aussage über allgemeine weltweite Themenvollständigkeit, aktuelle native Funktion oder verlässliche Anlageprognosen.

## Länderstichprobe

| Reihe | Deutschland | USA | Indien | China | Länder mit internen Lücken (von zwölf) |
| --- | --- | --- | --- | --- | --- |
| Zugang zu Elektrizität | 1990–2024 | 1990–2024 | 1993–2024 | 2000–2024 | 0 |
| Internetnutzung | 1990–2024 | 1990–2024 | 1990–2025 | 1990–2025 | 6 |
| Anteil verarbeitendes Gewerbe | 1991–2025 | 1997–2021 | 1960–2025 | 2004–2025 | 0 |
| Reales BIP je Einwohner | 1960–2025 | 1960–2025 | 1960–2025 | 1960–2025 | 0 |
| Bruttoeinschulungsquote Sekundarstufe | 2001–2024 | 1971–2022 | 1971–2025 | 1970–2012 | 8 |
| Arbeitslosigkeit, ILO-Modellschätzung | 1991–2025 | 1991–2025 | 1991–2025 | 1991–2025 | 0 |
| Fertilität | 1960–2024 | 1960–2024 | 1960–2024 | 1960–2024 | 0 |
| Anteil ab 65 Jahren | 1960–2025 | 1960–2025 | 1960–2025 | 1960–2025 | 0 |
| Bevölkerung | 1960–2025 | 1960–2025 | 1960–2025 | 1960–2025 | 0 |
| Urbanisierung | 1960–2025 | 1960–2025 | 1960–2025 | 1960–2025 | 0 |

Ein Zeitbereich in der Tabelle belegt nicht automatisch eine lückenlose Reihe. Die letzten Spalten und die JSON-Details zeigen interne Lücken.

## Auswirkung auf die Planung

- **Hohe Relevanz:** Chinas geprüfte Bildungsreihe endet 2012. Deshalb UNESCO prüfen und keine aktuelle Bildungswelle aus dieser WDI-Reihe konstruieren.
- **Hohe Relevanz:** Die US-Reihe zum verarbeitenden Gewerbe endet 2021. Ein heutiger Vergleich braucht einen gemeinsamen historischen Zeitpunkt oder eine getrennt geprüfte Aktualisierung.
- **Hohe Relevanz:** Die Arbeitslosenreihe ist ausdrücklich modellgeschätzt; die UI muss diesen Ursprung erhalten.
- **Mittlere Relevanz:** Unterschiedliche Gebietskataloge brauchen explizite Crosswalks. World-Bank-Gruppen dürfen nicht als zusätzliche Länder summiert werden.
- **Mittlere Relevanz:** Unterschiedliche Start-/Endjahre und Lücken begrenzen mögliche gemeinsame Fenster. Glättung darf sie nicht verdecken.
- Die vermuteten Ursachen sind unterschiedliche Erhebungen, Methodik und Veröffentlichungspraxis; die konkrete Ursache einzelner Lücken wurde nicht unabhängig nachgewiesen.

## Reproduzierbarkeit

`probe_sources.py` führt die begrenzten öffentlichen Abrufe aus. `build_planning_evidence.py` validiert Kataloge und erstellt Startreihen/Notiz aus vorhandenen Ergebnissen ohne Netzwerk.
Das Notebook `source-readiness.ipynb` enthält den lesbaren Prüfpfad. Vollständige URLs, Abrufzeitpunkte, Antwort-Hashes, Metadaten und Länderdiagnostik stehen in `source-readiness.json`.

Die Planung hat keine produktiven App-Dateien, persönliche Datenbanken oder Secrets für diese Prüfung verändert.
