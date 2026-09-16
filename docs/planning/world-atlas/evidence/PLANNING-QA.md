# Prüfung des Planungsmeilensteins

Stand: 8. September 2026. Diese Prüfung betrifft Planung, Kataloge und die
interaktive Gesprächsvorschau. Sie ersetzt keine Abnahme der späteren App.

## Planung und Daten

- Sechs JSON-Dateien einschließlich Quellenprotokoll und Katalogen erfolgreich
  eingelesen.
- Lokale Markdown-Verweise im Planungsverzeichnis auf vorhandene Ziele geprüft.
- IDs, Themenzuordnung, Quellenreferenzen und Startreihen durch
  `build_planning_evidence.py` validiert; Ergebnis in `planning-validation.json`.
- Alle vier Codezellen von `source-readiness.ipynb` in einer gemeinsamen,
  isolierten Python-Namensumgebung ausgeführt. Die bereits gespeicherten
  120 Land-Reihe-Stichproben wurden geladen. Die optionale Netzwerkwiederholung
  blieb auskommentiert. Das Notebook enthält weiterhin einen unbefüllten
  Ausführungszustand für die eigene interaktive Nutzung.
- Die tatsächlichen, vorher durchgeführten öffentlichen Abrufe und ihre Grenzen
  stehen in `source-readiness.json` und `READINESS.md`.

## Interaktive Gesprächsvorschau

Die Vorschau zeigt ausschließlich gekennzeichnete Darstellungsschemata. Die
Gebiets- und Themenauswahl verwendet die Planungskataloge; ihre Kurven und
Altersprofile sind keine Daten des ausgewählten Landes.

Geprüft wurden:

- Region Asien → Indien → Bildung: Länderfilter, Themengruppe und Auswahlpfad
  aktualisieren sich.
- Region Afrika → Energie → Solarenergie: vorherige Indienauswahl wird bei
  unpassender Region aufgehoben; afrikanische Gebiete und Gesamtauswahl bleiben
  auswählbar.
- Lange Entwicklungen → Jahrhundertperspektiven: historische Bildsprache wird
  angezeigt.
- Lange Entwicklungen → Zyklusthesen untersuchen: gestrichelte Modellkurve und
  ausdrückliche Kennzeichnung als These ohne Vorhersage.
- Wirtschaft & Kapital → Marktlage & Bewertung: langfristiges Wellenbeispiel
  mit getrennt angekündigter Kurslage und Bewertung.
- Helle und dunkle Darstellung bei normaler und schmaler Breite; responsive
  SVG-Abmessungen und kein horizontaler Überlauf in den geprüften Zuständen.
- Zusätzliche Prüfung der historischen Beschriftungen bei 320 px Breite:
  kein Überlauf und kein Überlappen der benachbarten Phasenbezeichnungen.
- Browserprotokolle der geprüften hellen und dunklen Vorschau ohne Warnungen
  oder Laufzeitfehler.

## Offene Produktprüfung

Die produktive Atlas-Implementierung hat noch nicht begonnen. Deshalb wurden
für diesen reinen Planungsmeilenstein keine Frontend-, Rust-, Datenbank- oder
Tauri-Abnahme behauptet. Die erforderlichen Prüfungen je Arbeitspaket stehen im
[Umsetzungsplan](../IMPLEMENTATION-PLAN.md).
