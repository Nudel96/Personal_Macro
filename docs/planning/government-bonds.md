# Staatsanleihen & Yields

Eigenständiger Bereich unter `/government-bonds`, erreichbar über Marktkontext.
Er verändert weder Leitzinsen, Macro-Scoring, Seasonality noch Regime Insights.

## Umfang und tatsächliche Quelle

Am 10.09.2026 wurde der authentifizierte EODHD-Katalog
`https://eodhd.com/api/exchange-symbol-list/GBOND` geprüft: 267 Einträge,
davon 266 staatliche Renditereihen für 60 Länder/Gebiete und ein ausgeschlossener
Zinsswap (`USDSB3L1Y`). Die allgemeine Dokumentation nennt einen kleineren,
älteren Umfang. Maßgeblich sind die einzeln geprüften Instrumente.

Das Verzeichnis enthält 250 Länder/Gebiete aus dem vorhandenen Atlas-Katalog,
ohne Quellenaggregate. Fehlende Anbindung bedeutet keine Aussage darüber,
ob ein Staat Anleihen ausgibt. Es gibt keine erfundenen Ersatzreihen und
keinen Anspruch auf Renditedaten für sämtliche Länder.

Der gemeinsame Katalog liegt in
`apps/desktop/src/features/government-bonds/data/catalog.json` und wird von
Rust und TypeScript gelesen. `scripts/audit-government-bonds.mjs` erzeugt die
Metadaten aus einer zuvor geprüften öffentlichen EODHD-Instrumentliste.
Länderkennungen sind explizit: `CH` bedeutet Chile, `SW` Schweiz, `UK`
Vereinigtes Königreich. Fehlende Currency-/Country-Felder werden nicht erfunden.
Bei Kroatien bleibt die historische Quellenbezeichnung HRK sichtbar.

Beim erneuten Katalogabruf müssen Symbol, Typ, Exchange, Originalname, Land und
Währungsmetadaten zum geprüften Stand passen. Neue oder geänderte Einträge
bleiben ausgeschlossen und werden ausgewiesen. Früher geladene Historien
bleiben als Archiv erhalten. Erweiterungen benötigen eine erneute Zuordnungsprüfung.

## Fachlicher Vertrag

- Quelle: EODHD GBOND über den bestehenden lokalen EODHD-Zugang.
- `close` ist hier eine nominale Benchmark-Rendite in Prozent pro Jahr.
  Kein Anleihekurs, Kupon, Anlageertrag, Swap oder einzelnes ISIN-Inventar.
- GBOND umfasst auch kurzfristige staatliche Geldmarktpapiere.
- `adjusted_close`, OHLC-Preisrenditen und Handelsvolumen fließen nicht ein.
- Dezimalstrings bleiben im Cache exakt; Differenzen werden mit `rust_decimal`
  berechnet. Basispunkte = (Rendite A − Rendite B) × 100.
- Negative Werte und Null bleiben gültig, fehlende Werte bleiben leer.
- Nur abgeschlossene Kalendertage; keine Annahme eines weltweit gleichen
  Handelstags oder Ausschluss nichtwestlicher Wochenenden.
- Übersicht: individueller Quellenstand je Land/Laufzeit; älter als sieben
  Kalendertage wird markiert. Eine höhere Rendite erhält keine bullish-Farbe.
- Kurven: neuester Beobachtungstag des Landes beziehungsweise neuester
  gemeinsamer Tag zweier Länder. Jede Laufzeit benötigt genau diesen Tag.
  Keine Zusammenstellung aus unterschiedlich alten letzten Werten.
- Kurvenabstand 10 J minus 2 J benötigt gleiche bekannte Währungsmetadaten.
- Länderabstand benötigt dieselbe Laufzeit und dasselbe tatsächliche Datum.
  Währungsübergreifende Unterschiede sind kein reiner Kreditrisikoaufschlag.
- Eigene Historien bleiben auch außerhalb des gemeinsamen Zeitraums sichtbar.
  Explizite Null-Lücken und Abstände über sieben Tage werden nicht verbunden.
  Die Kurvenachse verwendet numerische Laufzeitabstände und keine Glättung.

## Abruf und Persistenz

Öffentliche Marktwerte liegen separat unter
`PersonalMacro/government-bonds/cache.sqlite`. Eigene Migrationen in
`src-tauri/bond-migrations`; keine Änderung an der Journal-Datenbank oder
den Journal-Backups. Der Speicher wird erst bei Bedarf geöffnet.

Ein expliziter Abruf lädt alle Länder oder alle Laufzeiten eines Landes.
Die globale Modulsperre verhindert Doppelabrufe. Erfolgreiche Reihen werden
für 24 Stunden übersprungen. Erster Abruf: gesamte vom Anbieter gelieferte
Historie ab frühestens 1900. Folgeabrufe ersetzen atomar das Fenster ab dem
letzten Quellenwert minus 35 Kalendertage. Frühere Revisionen sind damit nicht
vollständig nachgeführt. Keine automatischen kostenpflichtigen Hintergrundabrufe.

Quellenprüfung, Antwortgröße, Datum, Dezimalwerte und Duplikate werden vor der
Übernahme validiert. HTTP-Fehler und Ausnahmen geben weder Schlüssel noch
Anfrage-URLs oder Provider-Antworttexte aus. Nur die feste EODHD-Domain und
geprüfte Symbole sind erlaubt; keine Redirects.

Fortschritt und Fehlerstatus werden lokal gespeichert. Abbruch beendet die
laufende Reihe atomar und stoppt vor der nächsten. Bei App-Neustart wird ein
unbeendeter Job als unterbrochen erkannt. Bereits gespeicherte Reihen bleiben
bei Abbruch, Fehler und Neustart erhalten. 401/403/429 stoppen weitere Abrufe.
Die Oberfläche invalidiert ihre Daten bei Fortschritt und allen Endzuständen.

## Browser und Bedienung

Der Browser zeigt das echte Metadatenverzeichnis mit leeren Renditewerten und
einem Hinweis auf die Desktop-App. Er erzeugt keine Live-Mocks und startet
keine Providerzugriffe. Länder, Vergleich, Laufzeit und Zeitraum stehen in
der URL. Suche, Regions-/Abdeckungsfilter und Renditesortierung erschließen
auch Länder ohne Daten. Quellenwerte sind zusätzlich als Tabelle zugänglich.

## Validierung

Native Tests prüfen Zuordnung (insbesondere Chile/Schweiz), Swap-Ausschluss,
geänderte Metadaten, negative/fehlende/null Renditen, Dezimal-Basispunkte,
Duplikate, atomaren Rollback, Erst-/Wiederöffnung, Datumsabgleich, inverse
Länderdifferenzen, Datenlücken, Abbruchidentität und Neustart-Erkennung.
Ein separat ignorierter Live-Test prüft authentifizierte EODHD-Antworten in
einem temporären Cache, ohne die Benutzer-Datenbank anzufassen.

Frontendtests prüfen das weltweite Verzeichnis, fehlende Länder, persistierende
Anzeige bei Providerfehlern, Update-/Abbruchscope, URL-Kontext, Browsergrenzen,
Einheiten, negative/fehlende Werte sowie Laufzeit- und Zeitachsen.

Abnahme am 10.09.2026: Typecheck, ESLint, Vite-Produktionsbuild, Rust-Build,
Clippy und Formatprüfung erfolgreich; neun native Modultests und acht
Frontendtests bestanden. Der echte Tauri-Start verwendete eine eigene
App-Kennung und damit ein separates Journal-/Cacheprofil. Der vollständige
GBOND-Abruf speicherte 266 Reihen für 60 Länder/Gebiete ohne Fehler,
insgesamt 1.335.120 Beobachtungen (1979–2026; Zeiträume je Reihe verschieden).
114.032 negative Renditewerte blieben erhalten. 265 Reihen besaßen einen
Wert der letzten sieben Tage; `CI3Y.GBOND` endete am 02.09.2026 und wurde
als älterer Stand markiert. Nach kontrolliertem Stopp und Neustart wurden
164 vorhandene Reihen übersprungen und die übrigen 102 ergänzt.
Die Desktop-Bedienprüfung und Browserprüfung bei 1024 px erzeugten keine
Konsolenfehler. Der geprüfte öffentliche Cache wurde anschließend separat
für die reguläre App bereitgestellt; persönliche Journaldaten wurden dabei
weder gelesen noch verändert. Der datierte Abrufnachweis liegt unter
`output/playwright/government-bonds-live-audit.json`.

Methodik des Anbieters:
https://eodhd.com/financial-apis/macroeconomic-data-api
