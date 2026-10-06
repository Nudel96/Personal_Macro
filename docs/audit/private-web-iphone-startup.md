# Privater Webeinstieg nach iPhone-Unterbrechung

Stand: 25.09.2026. Der Besitzer meldete die sichtbare Anzeige
„Private Verbindung wird geprüft“ im eingebetteten iPhone-Browser. Das Bild
zeigt einen laufenden React-Sitzungscheck. Es beweist weder eine verweigerte
Anmeldung noch, wie lange der Zustand schon bestand.

## Befund

Der bisherige Einstieg begrenzte sowohl HTTP-Header als auch Antwortkörper
bereits auf 30 Sekunden. Ein erledigter Fehler führte zum erneuten Prüfknopf.
Während der laufenden Prüfung fehlte jedoch jede weitere Bedienmöglichkeit.
Die Zeitgrenze beruhte allein auf einem JavaScript-Timer; eine Rückkehr nach
von iOS pausierten Timern wurde nicht ausdrücklich behandelt.

Drei aufeinanderfolgende geschützte Live-Sitzungsabrufe am 25.09.2026,
15:17:51–15:18:59 UTC, bestanden. Die vollständigen Antworten benötigten
19.571, 16.145 und 16.777 Millisekunden. Davon entfielen nur 1–7 Millisekunden
auf das Lesen des Antwortkörpers nach Erhalt der Header. Alle 46 erforderlichen
Capabilities, sichere Session-Cookies, `no-store`, unveränderte Journalrevision
und Marktgeneration wurden bestätigt. Bericht außerhalb der Quellen:
`apps/desktop/.vercel/iphone-session-report.json`.

Vercel-Protokolle aus demselben Zeitraum enthielten neben erfolgreichen
Anfragen einzelne HTTP-504-Antworten des Gateways. Ein Browserabbruch nach
30 Sekunden kann dort selbst `BACKEND_TIMEOUT` auslösen, obwohl das Backend
später HTTP 200 protokolliert. Aus den Protokollen allein lässt sich die Ursache
der langsamen Antwort nicht weiter eingrenzen. Der Sitzungsabruf lädt keine
Blob-Pakete und berechnet keine Marktanalyse.

Ein anschließender lokaler Rust-Benchmark mit genau dem veröffentlichten
555-Paket-Deskriptor reproduzierte die Verzögerung ohne Datenbank und Netzwerk:
`UploadDescriptor::parse` einschließlich Validierung benötigte 31.034 ms,
eine erneute Validierung 30.829 ms und `Manifest::parse` einschließlich
Validierung 15.279 ms im bestehenden Debug-Build. Das sind lokale Berechnungszeiten,
keine Vercel-Messungen. Beim einzelnen Durchlauf durch `Artifact::validate`
entfielen 12.545 ms auf 59 öffentliche Atlaspakete und 2.321 ms auf 180
Atlasreihen. Nachweis: `apps/desktop/.vercel/benchmark-manifest-before.jsonl`.

Ursache: `schema_family` ruft für jede Paketidentität die nativen Lookup-
Funktionen auf. Diese parsen jeweils erneut den gesamten eingebetteten
Katalog; allein `public-series-catalog.json` umfasst 3.953.828 Byte. Mehrere
vollständige Validierungsschritte multiplizieren diesen Aufwand. Die native
fachliche Aussage der Prüfung ist davon getrennt und darf nicht abgeschwächt
werden. Eine Änderung von Laufzeitlimits oder Authentifizierung behebt diesen
CPU-Aufwand nicht.

## Korrektur

Die Cloudprüfung verwendet getrennte, einmal initialisierte Mengen der gültigen
Identitäten aus den eingebetteten Reihen-, Markt-, Quellen- und Bewertungs-
Katalogen. Die bestehende native Katalogprüfung einschließlich der Prüfung von
Markt-Proxies bleibt Grundlage. Die Mengen wachsen nicht durch Benutzereingaben;
unbekannte Identitäten bleiben abgewiesen. Manifest, Generation, Journalrevision,
Hashes, Größen und SQLite-Inhalte werden weiterhin pro Zugriff geprüft.
Persönliche Daten und veränderliche Marktstände werden dadurch nicht gecacht.
Die nativen Desktop-Katalogfunktionen bleiben unverändert.

Der identische Benchmark mit der aktualisierten Cloud-Bibliothek benötigt
228 ms für den ersten Deskriptor-Parse, 8 ms für den Manifest-Parse und 21 ms
für eine erneute Deskriptorprüfung. Quelle und Eingabebytes sind identisch;
die Vorher-/Nachherprogramme wurden separat gegen die jeweilige Bibliothek
gebunden. Keine Datenbank- oder Netzwerkanfrage ist Bestandteil der Messung.
Hashes und Vergleich stehen außerhalb der Quellen unter
`apps/desktop/.vercel/benchmark-manifest-comparison.json`.

- Die 30-Sekunden-Frist wird zusätzlich absolut gemessen und bei `pageshow`,
  sichtbarer Rückkehr sowie vor Übernahme einer Antwort geprüft.
- Nach acht Sekunden erscheinen ein neutraler Wartehinweis und eine manuelle
  erneute Prüfung. Ein neuer Versuch bricht den bisherigen ab; verspätete
  Antworten dürfen keine Sitzung mehr aktivieren.
- HTTP 401/403 bietet ein vollständiges Neuladen für den erneuten
  Besitzer-Anmeldeablauf. Allgemeine Netzwerkfehler werden nicht als
  abgewiesene Anmeldung ausgegeben.
- Listener und Timer werden bei Erfolg, Fehler und Abbruch entfernt.
  Der Workspace wird weiterhin erst nach vollständiger Sitzungs- und
  Capability-Prüfung geladen.

## Nachweise und Grenzen

41 Handshake-/Transporttests und 45 angrenzende Frontendtests bestanden,
einschließlich zehn neuer Fälle. Typecheck, gezielter ESLint-Lauf und die
regulären sowie privaten Frontend-Builds bestanden. Die letzte Textanpassung
des Wartehinweises wurde nochmals mit den 41 gezielten Tests geprüft.

Die Cloudänderung besteht 29 `cloud_public`-Tests, einschließlich zweier neuer
Tests für die vollständigen Katalogidentitäten und die unveränderte Ablehnung
unbekannter oder veränderter Kennungen. Zwei bestehende PostgreSQL-Integrationstests
wurden in diesem Lauf nicht ausgeführt. Bibliotheksbuild, gezielte Formatprüfung
und Cloud-Clippy für Bibliothek und Server mit `-D warnings` bestehen.

WebKit 26.5 bestand zwölf synthetische Prüfungen bei 320 und 390 Pixel Breite:
Wartezustand, erneute Prüfung, Ablauf der Frist, Rückkehr bei pausierten Timern
und abgewiesene Anmeldung. Kein privates Workspace-Modul wurde vor bestätigter
Sitzung angefordert, keine Cloudanfrage oder persönlichen Daten verwendet.
Bericht: `apps/desktop/.vercel/webkit-handshake-report.json`.

Ein zusätzlicher WebKit-Vorabtest der lokal kompilierten Oberfläche mit dem
echten Backend bestand um 15:21:00 UTC: Übersicht und Trade-Navigation bei
390 Pixel, keine Laufzeit-/API-Fehler und kein Seitenüberlauf. Die Sitzung
benötigte 16.693 Millisekunden, Settings und Bootstrap danach 162 und 193
Millisekunden. Journalrevision unverändert. Dieser Vorabtest bestätigt noch
nicht den danach bereitgestellten Frontend-Build. Bericht:
`apps/desktop/.vercel/iphone-webkit-local-report.json`.

Die temporären Testzugänge dieser Live-Läufe wurden jeweils widerrufen und
ihre Sperre geprüft; widerrufene und anonyme Anfragen lieferten HTTP 401.
Besitzerschutz für alle Deployments blieb unverändert. Keine persönlichen
Schreibvorgänge wurden ausgeführt. Automatisierte Tests verwenden einen
kurzlebigen technischen Testzugang und ersetzen weder den Besitzer-SSO-Ablauf
noch eine physische iPhone-/Safari-Abnahme.

## Abschließende Bereitstellung und Live-Abnahme

Deployment `dpl_FJHF6sZthr7w9GiyA4USpDvSnGnp` ist `READY`, `public: false`,
Region `fra1`, mit Web-, Gateway- und Rust-Service. Der stabile private Link
`https://personal-macro-nudel96s-projects.vercel.app` zeigt nach geprüftem
Aliaswechsel auf `personal-macro-qi1zlug2a-nudel96s-projects.vercel.app`.
Zwei laufende Zwischenbuilds wurden vor Freigabe beendet; der stabile Link
zeigte bis zum fertigen Korrekturbuild auf die vorherige Analyseversion.

Der vollständige Live-Lauf endete am `2026-09-25T15:51:25.087Z` erfolgreich:
`apps/desktop/.vercel/iphone-final-live-report.json` meldet `ok: true`,
`validationSucceeded: true`, `cleanupVerified: true`, WebKit, tatsächlich
bereitgestellte UI und keine lokal ersetzten Frontenddateien.

- Alle 22 Analyse-Leseprüfungen bestanden, zusätzlich Journal-, Medien-,
  Leitzins- und Seasonality-Prüfungen.
- Der erste vollständige Sitzungsaufbau benötigte 4.406 ms; der folgende
  Browser-Sitzungsaufruf 175 ms. Zuvor benötigten drei aufeinanderfolgende
  Aufrufe derselben Schnittstelle 16.145–19.571 ms. Das sind Einzelmessungen,
  keine allgemeine Verfügbarkeits- oder Latenzgarantie.
- Übersicht, Trades, Macro, COT, Wirtschaftsdaten, Wirtschaftskalender,
  Zentralbankberichte und Staatsanleihen bestanden bei 390 Pixel Breite ohne
  Seitenüberlauf, Laufzeitfehler, API-Fehler oder blockierte Schreibversuche.
  Alle zehn Analyse-Navigationslinks waren sichtbar. Atlas wurde wegen seiner
  normalen Ansichts-Persistenz nicht als Seite geöffnet; seine geprüften
  API-Lesepfade bestanden.
- Die Journalrevision blieb unverändert, persönliche Schreibbefehle wurden
  nicht ausgeführt. Der exakte temporäre Testschlüssel wurde widerrufen;
  anonyme und widerrufene JSON-Testanfragen lieferten HTTP 401.
- Startseite, Macro und drei API-Pfade wurden am stabilen und am direkten
  Deploymenthost zusätzlich anonym geprüft. Alle zehn Anfragen wurden zur
  vertrauenswürdigen Vercel-SSO-Anmeldung umgeleitet. Nachweis:
  `apps/desktop/.vercel/iphone-final-anonymous-report.json`.

Besitzeridentität und SSO-Schutz für alle Deployments sind unverändert geprüft.
Keine dauerhaften Testzugänge, neue Providerintegration oder kostenpflichtige
Tarifumstellung wurden eingerichtet. Die physische Besitzerbedienung am iPhone
bleibt von dieser automatisierten WebKit-Abnahme getrennt.
