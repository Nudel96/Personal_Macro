# Gezielte Bundle-Optimierung vom 30.09.2026

Der gemeinsame Chartbaustein lädt ECharts über `echarts/core` und den Core-Wrapper
von `echarts-for-react`. Eine zentrale Registrierung enthält alle tatsächlich
verwendeten Diagrammtypen (Line, Bar, Scatter, Candlestick, Pie, Heatmap), Canvas,
Achsen, Tooltip, Legende, Zoom, Marker, Graphic, VisualMap und LabelLayout.
Unverwendete Diagramme, Koordinatensysteme und der SVG-Renderer entfallen aus dem
Produktionspaket. Die Darstellungsoptionen und Ereignisse der Seiten bleiben erhalten.

Der XLSX-Leser auf der Import-/Exportseite wird erst nach Auswahl einer XLSX-Datei
importiert. CSV und JSON sowie das Öffnen dieser Seite benötigen ihn nicht.
Die bereits verzögert geladenen PDF-/Dokumentexporte bleiben unverändert.

## Messung

Die Messung vergleicht zwei private Web-Produktionsbuilds desselben Arbeitsstands,
vor und nach diesen beiden Änderungen. Gezählt werden JavaScript-Dateien aus dem
Vite-Manifest. Für Seiten wird die vollständige statische Importmenge einschließlich
gemeinsamer Abhängigkeiten gezählt; dynamische Imports sind ausgeschlossen.
Gzip-Werte werden je Datei berechnet und addiert. Bereits im Browser gecachte
Abhängigkeiten reduzieren den tatsächlichen Folgetransfer zusätzlich.

| Umfang                                     | Vorher, Bytes | Nachher, Bytes | Vorher, Gzip-Bytes | Nachher, Gzip-Bytes |
| ------------------------------------------ | ------------: | -------------: | -----------------: | ------------------: |
| Gemeinsames Chart-Artefakt                 |     1.143.077 |        720.003 |            384.474 |             243.165 |
| Übersicht, statische Importmenge           |     1.903.047 |      1.488.146 |            627.575 |             488.770 |
| Import-/Exportseite, statische Importmenge |     1.222.858 |        801.905 |            394.664 |             254.273 |
| Einstieg vor der Workspace-Aktivierung     |       214.479 |        214.479 |             68.178 |              68.178 |

Das Chart-Artefakt ist komprimiert um 36,8 % kleiner. Die statische Importmenge der
Übersicht sinkt um 22,1 %, die der Import-/Exportseite um 35,6 %. Der XLSX-Chunk mit
142.940 Gzip-Bytes bleibt für tatsächliche XLSX-Importe verfügbar.
Diese Werte messen Transferumfang; sie belegen keine feste Verbesserung in Sekunden
auf dem iPhone oder am veröffentlichten Cloudhost. CSS, Atlasdaten und große
Dokumentexporte sind nicht Gegenstand dieser Änderung. Die vorhandenen Vite-Warnungen
zu großen Chunks sind damit nicht vollständig beseitigt.

## Reproduktion und Grenze

```powershell
cd D:\Macrotool\apps\desktop
pnpm bundle:check
```

Der Befehl prüft TypeScript, baut den privaten Webmodus mit Manifest und führt
`scripts/bundle-report.mjs` aus. Die Prüfung lehnt statische XLSX-/Dokumentexport-
Abhängigkeiten im Einstieg, in der Übersicht und auf der Importseite ab. Das einzelne
Chart-Artefakt ist auf 275.000 Gzip-Bytes begrenzt; weitere Chartfunktionen müssen
bewusst in der gemeinsamen Registrierung ergänzt werden.

Die detaillierten Messdateien liegen außerhalb der versionierten Quellen unter
`apps/desktop/.vercel/bundle-optimization-2026-09-30/`.

## Prüfung

- TypeScript und ESLint der betroffenen TypeScript-Dateien bestehen.
- Fünf gezielte Vitest-Dateien mit 27 Tests bestehen: echte SVG-Renderings aller sechs
  Charttypen, Zoom und Legendenumschaltung sowie bestehende Import-, COT- und
  Seasonality-Prüfungen. SVG ist ausschließlich im Test registriert.
- Der normale Frontend-Produktionsbuild und der private Webbuild bestehen.
- Eine lokale Browser-Fixture mit synthetischen Daten zeigt alle sechs Charttypen
  über den tatsächlichen React-/Canvas-Baustein. Zoom und Legendenereignisse werden
  bestätigt. Bei 390 px sind alle Charts gerendert und die Fixture hat keinen
  horizontalen Seitenüberlauf. Der abschließende frische Browserlauf enthält keine
  Konsolenfehler. Beim ersten Start des Vite-Entwicklungsservers gab es zwei temporäre
  `Outdated Optimize Dep`-Antworten; der erneute Lauf nach dem Prebundling bestand.

Browserartefakte liegen unter `apps/desktop/output/playwright/` und sind ignoriert.
Diese Prüfung ersetzt weder die native Tauri-Abnahme noch einen geschützten
Cloud-Livetest oder die physische iPhone-/Safari-Abnahme. Die Änderungen wurden im
Rahmen dieses Nachweises nicht bereitgestellt.
