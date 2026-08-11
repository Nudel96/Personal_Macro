# EODHD Fundamentals Workflow

## Verbindliche Quelle

Economic Overview, fundamentale Forex-Heatmap und Leitzinsansicht verwenden
ausschließlich EODHD Economic Events. Providerantworten werden direkt in
SQLite gespeichert; es gibt keine Excel-, OpenAI-, BIS- oder öffentliche
Fallback-Pipeline.

## Synchronisierung

- Beim ersten Start und anschließend mindestens alle 24 Stunden werden AUD,
  CAD, CHF, CNY, EUR, GBP, JPY, NZD und USD vollständig abgeglichen.
- Große Zeiträume werden in 90-Tage-Fenster geteilt. Pro Fenster wird bis zur
  zulässigen EODHD-Offsetgrenze paginiert.
- Für bekannte Releases werden Nachprüfungen nach 2, 10, 30 und 120 Minuten
  eingeplant. Ein nachträglich entdeckter unvollständiger Release der letzten
  sieben Tage erhält dieselben Retry-Abstände.
- Netzwerkfehler verändern den letzten gültigen Snapshot nicht.

## Mapping und Datenqualität

Jedes Providerereignis wird gegen ein länderspezifisches Indikatorprofil
bewertet. Eine automatische Zuordnung braucht ausreichende Konfidenz und einen
klaren Abstand zur zweitbesten Zuordnung. Mehrdeutige Bezeichnungen landen in
`eodhd_mapping_candidates` und bleiben bis zur Freigabe nicht verfügbar.
Country-spezifische Reihen wie ISM/NBS, Core CPI, Median CPI, Trimmed Mean CPI,
Loan Prime Rate und Initial Jobless Claims dürfen nicht mit ähnlich benannten
Reihen vermischt werden.

## Releaseauswahl und Scoring

- Ein Indikator wird nur mit vorhandenem Actual und Forecast bewertet.
- Der neueste vollständige Release bleibt aktiv, solange ein neuerer Release
  noch unvollständig ist. Der wartende Releasezeitpunkt wird separat angezeigt.
- Previous ist Kontext, nicht Scoring-Ersatz.
- NZD-Quartalsreleases bleiben quartalsweise; andere Monats-, Quartals-,
  Wochen- oder Meeting-Releases werden nicht künstlich auf dieselbe Frequenz
  gebracht.
- Im Paarvergleich gilt weiterhin `BaseSignal - QuoteSignal`. Eine fehlende
  Seite bleibt diagnostisch unavailable, geht numerisch aber als `0` ein.
- Der Paarrohscore ist die Summe aller 14 fundamentalen Zellen. Die Matrix muss
  antisymmetrisch bleiben.

## Betrieb und Prüfung

Die Oberfläche zeigt letzten Lauf, Anzahl geprüfter Releases, offene
releasegebundene Jobs und manuell zu prüfende Mappings. Ein Live-Abnahmelauf
muss einen Fundamentals-Snapshot mit 9 Währungen, 72 gerichteten Paaren und 14
Zellen je Paar erzeugen. Der API-Schlüssel bleibt ausschließlich in
`.env.local` oder der lokalen Prozessumgebung und darf nie geloggt werden.
