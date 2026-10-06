# Saisonaler Jahresgraph: Darstellung und Tagesdetails

Die Einzelanalyse unter `/seasonality` zeigt standardmäßig den **ungeglätteten
Durchschnitt** der ausgewählten vollständigen Kalenderjahre. Die zuvor fest
verwendete 15-Tage-Glättung ist für die Darstellung nicht mehr vorgegeben.

## Bedienung

- Glättung aus oder ein zentriertes Mittel von 3 bis 31 Kalendertagen in
  Zweierschritten. Direktwahl: aus, 5, 15 oder 31 Tage.
- Index 100 oder prozentuale Veränderung zur jeweiligen Jahresanfangsbasis.
- Freier Zeitraum über den Zoomgriff, Rückkehr zum ganzen Jahr und
  90 Kalendertage um den Start des Analysefensters.
- Optionale Trendphasen; diese verwenden weiterhin die bestehende native
  15-Tage-Auswertung und reagieren nicht auf den Darstellungsregler.
- Tagesauswahl durch Klick auf die Kurve oder einen per Tastatur bedienbaren
  Regler. Angezeigt werden ungeglätteter Mittelwert, gegebenenfalls geglätteter
  Anzeigewert, Median und die tatsächlich vorhandene Stichprobe am Tag.
- Tooltips ergänzen die mittleren 50 Prozent der Einzeljahreswerte. Das ist
  eine Streuungsangabe, kein Konfidenzintervall des Mittelwerts.
- Vollbild teilt alle Einstellungen mit der normalen Ansicht. Darstellung
  zurücksetzen stellt ungeglättet, Index 100 und das ganze Jahr wieder her.

Die Einstellungen liegen im lokalen Seitenzustand. Sie bleiben bei Asset-,
Kohorten- und Fensterwechseln erhalten, lösen keinen Anbieterabruf aus und
werden nicht in Journal oder Cloud gespeichert. Nach Verlassen der Seite
gelten beim nächsten Öffnen wieder die Vorgaben.

## Datenvertrag

`seasonality-annual-chart.ts` liest ausschließlich `annualCurve[].mean` und
die unveränderten Metadaten der bestehenden `SeasonalityAnalysis`-Antwort.
`smoothedMean` wird für die Darstellung bewusst nicht als Fallback verwendet.
Der Rust-Vertrag, Quellenzuordnung, Jahresfilter, Normalisierung, Tagesmapping,
Fensterberechnung und Rankings bleiben unverändert. Derselbe Renderer wird
im Desktop und im angebundenen privaten Webmodus verwendet. Die unverbundene
Browser-Vorschau erhält dadurch keine erfundenen Analysedaten.

Der Anzeigeglätter mittelt benachbarte Kalendertage der aggregierten Kurve.
An Jahresrändern und Lücken wird das Fenster verkürzt. Fehlende oder nicht
endliche Werte und Punkte ohne Stichprobe bleiben leer; es wird nicht über
Lücken oder Jahresgrenzen hinweg geglättet. Die Kurve wird danach nicht erneut
auf 100 umgerechnet. Deshalb kann der erste geglättete Anzeigewert von 100
abweichen; ungeglättet bleibt die ursprüngliche Basis erhalten. In Prozent
wird exakt `Index - 100` angezeigt.

Der Hauptgraph markiert den Fensterstart. Die aktuelle Analyseantwort enthält
keine historischen Ein-/Ausstiegsdaten je Jahresfenster; deshalb wird kein
präzises Kalenderende aus der Haltedauer in Handelstagen erfunden. Der
90-Tage-Zoom ist ausdrücklich ein Kalenderumfeld innerhalb desselben Jahres.
Die ältere Fahrplanleiste zeigt ihre Fensterlage weiterhin nur näherungsweise.

## Prüfung

Deterministische Tests schützen Rohwerte, Glättung, verkürzte Ränder, Lücken,
echte Null, unveränderte Kennzahlen, Prozentdarstellung und Jahresgrenzen.
Komponententests prüfen Einstellungen, Tagesauswahl, Vollbild mit Escape und
Fokusrückgabe, Kohortenwechsel, leere Daten und explorative Stichproben.
Visuelle Abnahme verwendet isolierte, ausdrücklich synthetische Testdaten;
dies ist keine neue Provider- oder native Datenbankabnahme.

Prüfstand 26.09.2026: 39 Seasonality-Tests erfolgreich (einschließlich des
zusätzlichen Regressionstests für Monatsbeschriftungen nach Zoom). Der reguläre
Frontend-Build einschließlich TypeScript, ESLint der geänderten Dateien und
Prettier bestehen. Die bestehenden Hinweise zu großen Build-Chunks bleiben.
Chromium prüfte 320, 390, 768, 1024 und 1440 Pixel ohne horizontalen Überlauf,
auch die tatsächliche Lage des Vollbilddialogs innerhalb des Viewports.
Glättungs- und Tagesregler funktionieren per Tastatur; Escape gibt den Fokus
an den Vollbild-Auslöser zurück. Echte Canvas-Klicks wählten sowohl im ganzen
Jahr als auch im Zoom den korrekten Kalendertag. Im abgeschlossenen
Bedienungslauf gab es keine Laufzeit-/Konsolenfehler.
Vorschau und Prüfskripte liegen ausschließlich im ignorierten Verzeichnis
`apps/desktop/output/playwright/`. Eine Veröffentlichung ist kein Teil dieser
lokalen UI-Änderung.
