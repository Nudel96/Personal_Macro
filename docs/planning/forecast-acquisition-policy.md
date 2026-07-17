# Forecast-Beschaffung und Aktualitätsgarantie

## Entscheidung

Ein HTML-/JSON-Scraper für ForexFactory wird nicht implementiert. Die Website
stellt zwar Kalender-Exporte bereit, untersagt aber ausdrücklich das Kopieren,
Veröffentlichen oder Weiterverteilen ihrer Kalenderdaten und den Zugriff über
andere Methoden als die bereitgestellte Oberfläche bzw. Anweisungen. Das gilt
für die Kalenderdatenbank selbst und schließt einen robusten Produktadapter aus.

Ein Scraper kann außerdem nie eine 100-prozentige Aktualitätsgarantie geben:
HTML, Zugriffsregeln, Rate Limits, Releasezeiten und der Datenanbieter können
sich jederzeit ändern. Das Tool macht deshalb weder aus einem Scraper noch aus
einem einzelnen Datenanbieter eine zwingende Abhängigkeit.

## Unterstützte Forecast-Kette

1. **Offizielle Quellen:** Kalender, Releasedatum, Actual und Revisionen werden
   möglichst direkt von Statistikämtern und Zentralbanken importiert.
2. **Optionaler Consensus-Provider:** Ein lizenzierter Provideradapter liefert
   Forecast, stabile Event-ID und Last-Update-Zeit. Trading Economics ist der
   zuerst vorgesehene Adapter, weil die dokumentierte Kalenderantwort Actual,
   Previous, Revised, Forecast, Event-ID, Einheit, Source und Updatezeit enthält.
3. **Manueller Forecast-Import:** Eine CSV/XLSX-Datei mit Quellenname und
   Abrufzeit ist der kostenfreie, dauerhafte Fallback.
4. **Zweiter freigegebener Provider:** Kann nach Contract-Test und
   Lizenzprüfung zusätzlich aktiviert werden. Er dient als Ausfall- und
   Plausibilitätsvergleich, nicht als stiller Datenmix.

Drittanbieter bleiben optional: Ohne sie muss das Tool mit offiziellen Actuals,
COT, Seasonality und manuell importierten Forecasts lokal nutzbar sein.

## Aktualitätsmodell

- Die Anwendung speichert jeden Forecast als zeitgestempelten Snapshot.
- Der letzte Snapshot **vor** der Veröffentlichung ist der verbindliche
  Vergleichswert für den späteren Surprise-Score.
- Forecasts werden mindestens täglich und im Zeitfenster vor hochrelevanten
  Events nach dem erlaubten Providerlimit verdichtet aktualisiert. Ein
  Streaming-Adapter darf Updates abonnieren, wenn der Provider ihn lizenziert.
- Ein Scheduler prüft erwartete, aber ausgebliebene Updates; der Status wird als
  fresh, stale, failed, conflict oder unavailable angezeigt.
- Stimmen zwei aktivierte Provider für dieselbe Event-/Referenzperiode nicht
  überein, gibt es keinen automatisch gemischten Wert. Die UI zeigt einen
  Konflikt, bis eine Providerpriorität oder ein manueller Wert festgelegt wurde.
- Actual und Revisionen der offiziellen Stelle bleiben die maßgebliche
  Referenz. Ein Drittanbieter aktualisiert nie still den offiziellen Wert.

Damit wird eine sehr hohe, messbare Aktualität erreicht, aber keine fachlich
unhaltbare 100-Prozent-Garantie behauptet.

## Adapter-Vertrag

Jeder Forecast-Adapter muss mindestens liefern:

| Feld | Pflicht |
|---|---|
| stabile Provider-Event-ID | ja |
| Land/Währung, Indikator und Referenzperiode | ja |
| Forecast mit Einheit | ja |
| Forecast-Abrufzeit und Provider-Last-Update | ja |
| Quellen-/Lizenz-/Terms-Link | ja |
| Raw Payload oder rechtlich zulässigen Hash/Extrakt | ja |
| Rate Limit, Fehlerklassifikation und Retry-Hinweis | ja |

Ein Adapter wird nur aktiviert, wenn sein Lizenzstatus geprüft und in
data_source dokumentiert ist. Scraping bleibt ausschließlich für Quellen
möglich, deren Terms und robots.txt dies ausdrücklich zulassen; dann nur als
klar markierter Fallback mit niedriger Rate und separatem Qualitätsstatus.

## Quellen

- [ForexFactory Notices](https://www.forexfactory.com/notices)
- [Trading Economics Calendar API](https://tradingeconomics.com/api/calendar.aspx)
- [Trading Economics Calendar Schema](https://docs.tradingeconomics.com/economic_calendar/schema/)
- [Trading Economics Streaming](https://docs.tradingeconomics.com/economic_calendar/streaming/)
