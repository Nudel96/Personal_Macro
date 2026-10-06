# Zentralbankbriefings: Qualität, Kosten und privater Cloudbetrieb

Stand: Implementierung und Prüfung vom 30.09.2026. Der Bereitstellungsnachweis wird
nach der tatsächlichen Cloud-Abnahme ergänzt. Desktop und Cloud bleiben getrennte
Datenspeicher; persönliche Journal-Daten werden nicht an OpenAI übertragen.

## Qualität der neuen Briefings

Version 3 verwendet die Responses API mit einem strikten JSON-Schema. Jeder
Stichpunkt enthält ein bis drei kurze Originalzitate mit exakt vorhandenen
Quellenmarken. Vergleiche benötigen Belege aus dem aktuellen und dem vorherigen
Dokument. Normale Abschnitte dürfen bei einem Vergleich nur den aktuellen Bericht
beschreiben. Das Backend prüft die Quellenmarken, die Zitate als wortgetreue
Textstellen, Zahlen, Zentralbankzuordnung, erlaubte Abschnitte und den Umfang vor
dem Speichern. Eine fremde Bank darf nur genannt werden, wenn sie auch im
Originalzitat steht; der Bankname wird aus der geprüften Quelle vorgegeben.

Dezimalkomma und die üblichen Viertelbruch-Schreibweisen der Fed werden numerisch
gleichgesetzt. Einheiten werden bewusst nicht umgerechnet. Kleine zusätzliche
Prüfregeln erkennen bestimmte umgekehrte Zinsentscheidungen, verneinte Festlegungen
und als sicher dargestellte Möglichkeiten. Diese Regeln sind keine vollständige
semantische Faktenprüfung. Deutsche Formulierungen und die inhaltliche Einordnung
müssen bei der Qualitätsabnahme weiterhin gelesen werden.

Maximal zwölf Stichpunkte und eine Übersicht mit höchstens 700 Zeichen halten das
Briefing überschaubar. Die Übersicht darf keine Zahlen einführen, die nicht in
belegten Stichpunkten vorkommen. Unvollständige API-Ausgaben werden abgewiesen.
Historische Briefings ohne die neuen Qualitätsdaten bleiben lesbar und erhalten
keine nachträgliche Prüfbehauptung.

Der Quelltext ist auf insgesamt 80.000 Zeichen begrenzt. Bei langen Dokumenten
werden bis zu 100 über das Dokument verteilte Abschnitte verwendet, einschließlich
des Anfangs und Endes. Ein Vergleich teilt das Budget zwischen beiden Dokumenten.
Auch einzelne Abschnitte können gekürzt werden. Die Oberfläche nennt die Zahl der
verwendeten und vorhandenen Abschnitte und kennzeichnet begrenzte Auszüge. Das ist
keine Zusammenfassung aller Seiten eines langen Berichts.

Die Referenzsammlung `src-tauri/fixtures/report-quality-goldens.json` enthält fünf
kurze historische Fed-/EZB-Quellstellen und drei synthetische Grenzfälle. Sie prüft
falsche Zahlen, erfundene Belege, Negationen, Unsicherheit und Einheiten. Ein
separater, ausdrücklich aktivierter Modelltest ergänzt einen Vergleich zwischen
zwei Berichten. Diese kleinen Beispiele sind keine repräsentative Bewertung aller
Zentralbanken, Sprachen, PDF-Extraktionen oder langen Projektionen.

## Dauerhafte Kostenbegrenzung

SQLite-Migration 0051 und PostgreSQL-Migration 0011 ergänzen einen privaten
Kostenbeleg. Vor dem Netzwerkaufruf wird dessen konservativer Höchstbetrag atomar
reserviert. Im Desktop erfolgt die Reservierung als bedingte SQLite-Anweisung;
in der Cloud serialisiert eine PostgreSQL-Zeilensperre den Monatsbereich. Kein
Netzwerkabruf hält eine PostgreSQL-Transaktion offen.

Das feste Teilbudget beträgt jeweils **0,50 USD je UTC-Monat und Datenspeicher**.
Desktop und Cloud haben unabhängige Grenzen. Ein isolierter Modelltest verwendet
einen eigenen dauerhaften Evaluationsbeleg außerhalb des Repository und zählt
nicht als Produktivverbrauch. Er wird nur ausdrücklich gestartet.

Der geprüfte Standardtarif für `gpt-5-mini` ist 0,25 USD für Eingabe, 0,025 USD für
gecachte Eingabe und 2,00 USD für Ausgabe je Million Tokens. Reasoning-Tokens sind
bereits in den Ausgabe-Tokens enthalten und werden nicht doppelt berechnet.
Andere Modelle werden ohne geprüften Tarif abgewiesen. Quelle und Tarifstand:
[OpenAI-Modellreferenz, geprüft am 30.09.2026](https://developers.openai.com/api/docs/models/gpt-5-mini).

Der Höchstbetrag nutzt eine konservative UTF-8-Bytegrenze einschließlich zusätzlichem
Rahmen sowie maximal 8.000 Ausgabe-Tokens. Bekannte Nutzung wird auch dann verbucht,
wenn die Antwort die Qualitätsprüfung verfehlt. Bei Timeout, Abbruch oder fehlenden
Nutzungsdaten bleibt der Höchstbetrag reserviert. Ein identischer Auftrag mit
ungeklärtem Ausgang darf nicht erneut kostenpflichtig starten. Ein Prozessneustart
setzt diese Belege nicht zurück. Ein erfolgreich geprüftes identisches Ergebnis
wird aus dem Beleg wiederverwendet, auch nach einem Veröffentlichungs-Konflikt.

Die Oberfläche zeigt Verbrauch, Reservierungen, Monatsgrenze und Tokenarten. Diese
Rechnung gilt für die eingebauten Briefing-Aufrufe nach dem datierten Tarif. Sie
ist keine anbieterseitige Kontosperre, keine Kontrolle anderer Programme oder
älterer laufender App-Versionen und keine Grenze für Steuern, Wechselkurse,
Hosting oder Marketplace. Der vereinbarte Gesamtbetrag von höchstens 10 EUR im
Monat bleibt die Betriebsgrenze; eine kostenpflichtige Anbieterumstellung gehört
nicht zu dieser Erweiterung.

## Cloudjobs und Veröffentlichung

`MACRO_REPORT_AUTOMATION=1` aktiviert zwölf fest hinterlegte Quellen aus neun
Zentralbanken. Der vorhandene tägliche Provider-Cron plant deduplizierte Aufträge;
der bestehende Provider-Queue-Dienst führt sie aus. Vorschau-Deployments führen
keine automatische Providerarbeit aus. Es entsteht kein zusätzlicher Cron oder
kostenpflichtiger Dienst. Die tägliche Planung hat keine garantierte sekundengenaue
Ausführung; die [Hobby-Cron-Dokumentation](https://vercel.com/docs/cron-jobs/usage-and-pricing)
beschreibt die zeitlichen Grenzen.

Ein Erfassungsschritt prüft höchstens die zwei neuesten Kandidaten einer Quelle
und übernimmt höchstens einen neuen Bericht. Ein erfolgreicher erster Schritt
kann einen zweiten nach fünf Minuten einplanen. Die Modellerstellung läuft danach
in einem getrennten Auftrag. Nur das neueste Dokument je Bank und Dokumentfamilie
wird automatisch auf Version 3 ergänzt; das Archiv wird nicht vollständig neu
kostenpflichtig zusammengefasst. Bei einem Monatswechsel kann fehlende Arbeit
erneut eingeplant werden; ungeklärte Modellanfragen bleiben gesperrt.

Neue Quellen müssen HTTPS-Adressen der jeweiligen Bank sein. Freie URLs und
Dateipfade sind kein Auftragseingang. Weiterleitungen bleiben bankgebunden.
Antwortdaten werden während des Lesens auf fünf MiB begrenzt. PDF-Extraktion hält
einen eigenen Permit bis zum tatsächlichen Ende der Blocking-Arbeit. Der
Cloud-Modellaufruf endet spätestens nach 60 Sekunden, der bestehende Auftrag hat
zusätzlich seine Gesamtfrist. Original-PDFs werden in diesem Cloudpfad nicht
dauerhaft archiviert: gespeichert werden die offizielle Adresse, extrahierter
öffentlicher Text und das Briefing. Die native PDF-Archivierung bleibt erhalten.

Die Arbeit erfolgt auf einer Kopie des geprüften, unveränderlichen Berichtspakets.
Ein neuer SQLite-Exporter übernimmt ausschließlich die freigegebenen Spalten.
Kostenbelege, persönliche Lesemarker, Zugangsdaten, lokale Pfade und Quellenstatus
gelangen nicht in das öffentliche Marktpaket. Der private Blob wird vor Freigabe
mit dem produktiven Loader auf Hash, Größe, Schema und Lesbarkeit geprüft.

Die neue Generation wird durch Vergleich des vorherigen aktiven Zeigers
veröffentlicht. Alle anderen Marktobjekte werden an ihrer bisherigen geprüften
Adresse wiederverwendet. Quellenstatus, Folgeaufträge und Abschlussbeleg werden
mit der Veröffentlichung in derselben PostgreSQL-Transaktion bestätigt. Ein
veralteter Lease oder ein fremder Generationswechsel hinterlässt keine halbe
Veröffentlichung. Bestehende referenzsichere Objektaufbewahrung und privater
Besitzer-/SSO-Schutz gelten weiter. Die Journalrevision wird nicht geändert.

## Bisherige Prüfungen

- Quellen-, Schema-, Vergleichs-, Zahlen- und Exporttests bestehen.
- SQLite-Reservierungen bestehen bei parallelen Aufträgen, unvollständigen
  Ergebnissen und erneutem Öffnen der Datei.
- Drei echte PostgreSQL-Tests bestehen in anschließend entfernten Testschemata:
  parallele Kostenreservierungen und Cache; zwölf deduplizierte Quellenaufträge;
  Veröffentlichung mit produktivem SQLite-Loader, abgelaufenem/fremdem Lease,
  konkurrierender Generation, Wiederholung und unveränderter Journalrevision.
- Die betroffenen Frontendtests und ESLint bestehen. Die Browsertests starten
  keinen Provider-Refresh; Quellenbelege und Teilbudget sind sichtbar.
- Die gezielte Bundle-Optimierung hat einen eigenen
  [Messnachweis](../audit/bundle-optimization-2026-09-30.md).

Der abschließende gezielte Rust-Lauf besteht mit 37 Tests; sechs Tests benötigen
eine ausdrücklich gestartete Integration oder API-Evaluation und bleiben in
diesem Lauf ausgeschlossen. Der separate echte Modelllauf vom 30.09.2026,
abgeschlossen um 17:17:24 UTC, besteht alle neun kurzen Referenzfälle. Die
anschließende manuelle Prüfung bestätigt Bankzuordnung, Zinswerte, Einheiten,
Verneinungen, Unsicherheit und den Vergleich zum Vorbericht. Die Formulierungen
enthalten noch einzelne sprachliche Unebenheiten; die Prüfung belegt keine
allgemeine fehlerfreie Modellqualität. Ein zunächst trotz Zahlenprüfung
übersehener Bankzuordnungsfehler ist durch eine zusätzliche Regression und die
bankgebundene Prüfung abgesichert.

Alle 37 kostenpflichtigen Evaluationsaufrufe einschließlich der vorherigen
Entwicklungsversuche sind im isolierten Beleg verbucht: 0,051802 USD, keine
ungeklärten Reservierungen. Nachweise liegen unter
`apps/desktop/.vercel/report-quality-live-eval.json` und
`report-quality-manual-review.json`; der dauerhafte Kostenbeleg liegt außerhalb
des Repository unter `%LOCALAPPDATA%/PersonalMacroAiEvaluation/report-eval.sqlite`.

PostgreSQL-Migration 0011 wurde am 30.09.2026 nach privater Sicherung außerhalb des
Repository und Prüfung der Workspace-Identität angewendet. Alle bestehenden
Tabellen und persönlichen Daten sowie Journalrevision 8 blieben unverändert.
Der neue OpenAI-Schlüssel wurde auf ausdrücklichen Wunsch in `.env.local`
gespeichert und als sensible, ausschließlich serverseitige Produktionsvariable
im bestehenden Cloudprojekt eingerichtet. Die Hobby-Einstufung und der
Besitzer-/SSO-Schutz für alle Deployments sind bestätigt. Der Schlüssel wird nicht
in Buildquellen, Ausgaben oder Browservariablen übernommen.

Der aktuelle Windows-Debug-Build besteht mit dem getrennten QA-Identifier
`com.personal-macro.report-qa`. Der reale Prozess- und Fensterstart ist bestätigt,
die ausschließlich für diesen Lauf angelegte SQLite-Datei enthält Migration 0051
und keine Trades oder KI-Aufträge. Beobachtete Startausgaben enthalten keine neue
Warnung. Eine vollständige DOM-Abnahme gelang über die WebView-CDP-Anbindung nicht;
die native UI-Abnahme ist daher begrenzt. Der bestehende Release-Prozess und seine
persönliche Datenbank wurden für diesen Test nicht verwendet. Nachweise:
`apps/desktop/.vercel/report-native-ui-start-report.json` und
`report-native-qa-state.json`.

Cloud-Live-Nachweise werden nach Abschluss ergänzt. Die physische
iPhone-/Safari-Bedienung mit Besitzeranmeldung bleibt eine eigene Geräteprüfung.
