# Weltatlas – gemeinsame Abschlussprüfung

Stand: 9. September 2026. **Die Implementierung und die dokumentierte native
Bedienabnahme sind abgeschlossen.** Maßstab sind R01–R18 aus dem
[Umsetzungsplan](IMPLEMENTATION-PLAN.md). Die Grenzen der Datenquellen und der
Prüfung bleiben ausdrücklich Bestandteil der Abnahme.

Dieser Bericht dokumentiert den Stand vom 9. September. Die nachfolgende
UN-SDG-Anbindung, der vollständige Abruf der fehlenden Quellenpakete und die
erneute Bedienprüfung stehen im [Erweiterungsbericht vom 10. September](EXPANSION-QA-2026-09-10.md).

## Produktumfang

Die produktive Route `/world-atlas` enthält 365 katalogisierte Gebiete und
255 Themen in 24 Gruppen und acht Themenfeldern. Der Routenaudit prüft jedes
Thema über alle Kataloggebiete: 183 Themen haben mindestens einen numerischen
Datenpfad, 14 einen Kontexteinstieg, 52 einen recherchierten Quelleneinstieg und
sechs eine eigene Theorieansicht. Kein Thema endet in einem allgemeinen
Platzhalter. Die 52 Quelleneinstiege haben weiterhin keine eigene numerische
Anbindung. Nicht jede Quelle besitzt Werte für jedes Land oder Thema.

Marktwellen, fundamentale Bewertung, wirtschaftliche Struktur, historische
Rekonstruktion und Modellbilder sind eigene Perspektiven. Ein Kursabstand wird
nicht zur fairen Bewertung erklärt; lange Entwicklungen werden nicht durch
einen vorgegebenen Sinus ersetzt. Für Statistiken ist keine neue bezahlte
Pflichtanbindung erforderlich. Marktpreise verwenden das vorhandene EODHD und
bleiben von dessen Schlüssel und Berechtigung abhängig.

Die reguläre Windows-Datei wurde erfolgreich gebaut:
`apps/desktop/src-tauri/target/release/personal-macro-desktop.exe`.
`START-MACROTOOL.cmd` verwendet diesen Pfad und berücksichtigt jetzt auch
Änderungen an `src-tauri/atlas-migrations`. Ein Installer wurde nicht erzeugt.
Der Releasebuild wurde nicht im persönlichen Produktivprofil gestartet.

## Anforderungsabgleich

Native Beobachtungen N01–N09, datierte Bildschirmbilder und der Neustartnachweis
stehen im [nativen Prüfprotokoll](evidence/native-acceptance.json).
Programmatische Quellen- und Berechnungsprüfungen ersetzen keine Klickprüfung;
die jetzige verbundene Prüfung ergänzt diese vorhandenen Einzelbelege.

| ID | Umsetzung und Nachweis | Verbleibende fachliche oder technische Grenze |
| --- | --- | --- |
| R01 | 365 Gebiete, 177 Kartenflächen, vollständige Liste; Crosswalks und native Tuvalu-Auswahl mit Tastatur (N01). | Kleine Gebiete besitzen teils keine eigene Kartenfläche; Quelle und Gebiet bleiben getrennt. |
| R02 | Deutschland und USA in Markt-, Bewertungs- und historischen Ansichten; Indien und China in Demografie und Bildung nativ bedient (N01–N06). | Quellenabdeckung ist unterschiedlich; JST umfasst beispielsweise Indien und China nicht. |
| R03 | 255 Themen, 24 Gruppen, null unaufgelöste Themenrouten; native Quellen- und Länderübersicht (N08). | 52 recherchierte Themen bleiben ohne eigenen Zahlenadapter. |
| R04 | Region, Land, Vergleich, Themen, Karte/Liste, Übersichten und gespeicherte Wiederaufnahme bedient (N01, N06–N08). | Die Prüfung umfasst die beschriebenen Bedienwege, nicht jede mögliche Auswahlkombination. |
| R05 | Wellen, Jahresbilder, Vergleichslinien, Pyramiden und Übersichten ohne erforderliche Zahlentabellen visuell geprüft (N02–N08). | Quellen benötigen bei der ersten Verwendung einen bewussten Download. |
| R06 | Kausale Marktwelle mit Referenz-, Vorlauf-, Lücken- und Sensitivitätstests; echte EODHD-Übersicht und große Länderwellen (N02). | Gleiche Wellenhöhe bedeutet keine gleiche absolute Bewertung oder sichere Umkehr. |
| R07 | NYU-Länderabruf und DE/USA-Vergleich; globale Branchenbilder auf Gewinnbasis (N03). | Zu kurze vergleichbare Vorgeschichte bleibt markiert; enge Länder-Sektor-Bewertungen sind nicht flächendeckend vorhanden. |
| R08 | UN-WPP-Profile, Migration und Haushaltsdaten mit Quellenprüfungen; Indien/China-Pyramiden nativ verglichen (N04). | Gebietsabdeckung, Erhebungen und Quellenjahre unterscheiden sich. |
| R09 | UIS-Bildung für Indien/China; Ember-Solarstrom und IRENA-Solarleistung für Südafrika/Kenia nativ geprüft (N04–N05). | Anlagenleistung, erzeugter Strom und finanzielle Bewertung sind unterschiedliche Aussagen. |
| R10 | Wasserstoff, globale Energieunternehmen, Kernenergie und US-Healthcare nativ geöffnet (N02, N05). | Wasserstoffhistorie ist aktuell zu kurz; globale Fonds ersetzen keine lokalen Sektoren. |
| R11 | Maddison-Download, lange DE/USA-Geschichte mit Lücken und eigene säkulare Modellansicht samt Datenverweis geprüft (N06). | Keine empirisch bewiesene regelmäßige Jahrhundertperiode oder aktuelle Länderphase behauptet. |
| R12 | Historisches UN-Bild, mittleres Szenario 2100, Tastatur-Jahresregler und Rückkehr zu 2023 geprüft (N04). | WPP 2024 behandelt Jahre ab 2024 als Projektion; das mittlere Szenario ist kein Unsicherheitsband. |
| R13 | Kostenlose Statistikdownloads nativ bedient; Marktpreise nutzen vorhandenes EODHD (N02–N06). | Keine Zusage kostenloser Börsendaten für beliebige Märkte. |
| R14 | Ruhige Darstellung, stabile Sortierung, optionale Zahlen, Fokus, Tastatur und 1024/1442-Pixel-Ansichten geprüft (N01, N04, N07–N08). | Vorhandene globale Mindestbreite verursacht bei exakt 1024 Pixeln eine schmale horizontale Scrollleiste; Details unten. |
| R15 | Separater öffentlicher Cache, gesicherte persönliche Notizen; echte native Speicherung, Prozessneustart, identisches PNG und Papierkorb-Restore (N07, N09). | Nur das isolierte Testprofil wurde benutzt. Frühere Backup-/Restore- und Cacheverlust-Tests bleiben eigene Nachweise. |
| R16 | Fehlende Vergleichsjahre, unpassende Gebiete, kurze Historie, echte Nullen, Lücken und Netzfehler bleiben unterscheidbar (N02–N09). | Verfügbare Daten sind nicht automatisch aktuell, vollständig oder prognosefähig. |
| R17 | 420 Frontendtests, 251 Rust-Library-Tests, Qualitätsgates und Releasebuild erfolgreich; verbundene native UI-Prüfung ergänzt (N01–N09). | 29 Rust-Netzwerktests in diesem Lauf ausgelassen; datierte Einzelprüfungen und fremde Hintergrundfehler siehe unten. |
| R18 | Gemeinsamer Abgleich von Umfang, Code, Quellenbelegen, Gesamttests, Windows-Build und verbundener nativer Bedienprüfung abgeschlossen. | Ausbaukandidaten und Quellenlücken bleiben dokumentiert; sie sind keine erfundenen Daten oder zugesagten automatischen Bewertungen. |

## Tatsächlich bediente Desktop-App

Nach der ausdrücklichen Antwort „Ja, Desktopprüfung fortsetzen“ wurde die
vollständige Tauri-App im getrennten Profil
`com.personal-macro.atlas-completion-20260909` geöffnet. Normales `App.tsx`,
normale Commands und echte SQLite-Speicherung; keine Testseite und keine
simulierten Providerantworten. Der vorhandene öffentliche Testcache wurde um
die per Oberfläche geladenen EODHD-, NYU-Länder-, UN-, Ember- und Maddison-Daten
ergänzt. Persönliche Produktivdaten wurden weder kopiert noch verändert.

Der Windows-Aufnahmehelfer hatte zuvor mit `SetIsBorderRequired ... 0x80004002`
und fehlender Eingabegeometrie versagt; nach dem Escape-Stopp war pausiert
worden. Nach erneuter Freigabe ermöglichte Playwright eine direkte Verbindung
zur tatsächlichen WebView2 über einen nur lokalen Prüfport. Das entspricht dem
[dokumentierten WebView2-Verfahren](https://playwright.dev/docs/webview2).
Aufnahmen zeigen den echten App-Inhalt, nicht die Betriebssystem-Titelleiste.

Die zwei überprüften App-Prozesse starteten um 20:25:49 Uhr (PID 16996) und
20:43:04 Uhr (PID 24480). Die Anfangsfläche betrug 1442 × 1008 CSS-Pixel bei
DPR 1, Position 40/63. Zusätzlich wurde derselbe native Renderer bei
1024 × 900 CSS-Pixeln betrachtet. Das ist ein Inhaltsbreitentest, keine
Betriebssystem-Fenstervermessung. Alle eigenen Prozesse und die Prüfverbindung
wurden nach Abgleich von PID, Pfad und Startzeit beendet; Ports 5188 und 9236
sind geschlossen. Die Prüfvariablen galten nur für diese Prozesse.

Die Oberflächenprüfung umfasste außerdem Zeitfensterwechsel, Zahlen ein/aus,
Abbruch und Wiederaufnahme des Marktimports, Quellenwechsel, unpassende
Land-Sektor-Kombinationen, kurze Wasserstoffhistorie und fehlende Bildungsjahre.
Die zusätzliche Erkundung umfasste kleine Gebiete, verfügbare und ungeladene
Übersichtskarten, deren Detaileinstieg, Favoriten sowie Papierkorb und Restore.
Frühe Skriptversuche mit unpassenden Selektoren, alten Handles oder noch nicht
gerenderten Auswahlzuständen werden nicht als erfolgreiche Wege gezählt.
Der Neustartvergleich normalisiert nur die Reihenfolge der URL-Parameter.

## Speicherung und Netzfehler

Eine eigene synthetische Testnotiz wurde mit Länderpaar, Zeitraum, Favorit und
festem Diagrammstand gespeichert. Nach dem echten Prozesswechsel stimmen
die Auswahlparameter, Notiz und Favorit. Das ursprüngliche PNG und das aus
dem gespeicherten Dialog gelesene PNG sind bytegleich: 72.481 Bytes,
960 × 732 Pixel, SHA-256
`f6388124e5c7c5f13807186368ee58cf3dfddc4c9994d9d7db173174eedc177c`.

Der zweite Prozess verwendete einen unerreichbaren lokalen HTTP-/HTTPS-Proxy.
Ein neuer Weltbankabruf zeigte den erwarteten verständlichen Netzfehler;
vorhandene Bilder und Notizen blieben nutzbar. Anschließend wurde ausschließlich
die eigene Testnotiz in den Papierkorb gelegt, wiederhergestellt und ihr
historisches Bild erneut geöffnet. Kein Systemnetzwerk wurde umgestellt.

## Gemeinsame Qualitätsgates

| Prüfung | Ergebnis |
| --- | --- |
| `pnpm exec vitest run --maxWorkers=1` | 420/420 Tests in 74 Dateien; davon 268 Atlas-Tests in 38 Dateien. |
| `cargo test --lib` | 251 erfolgreich, 29 ausdrücklich ausgelassen, kein Fehler. |
| `pnpm build` | TypeScript Strict und Vite-Produktionsbuild erfolgreich. |
| `pnpm exec eslint src` / `scripts` | 214 Frontenddateien und zwei Node-Skripte, keine Fehler oder Warnungen. |
| `pnpm exec prettier --check src` | Erfolgreich; generierter Coverage-Katalog lediglich formatiert, JSON-Inhalt unverändert. |
| Rustfmt / Clippy | `cargo fmt --all -- --check` und `cargo clippy --all-targets -- -D warnings` erfolgreich. |
| Themen-/Gebietsaudits | Aktueller Katalog erneut geprüft, null unaufgelöste Themenrouten; WDI-Sammelkennung `CHI` bewusst unzugeordnet. |
| `pnpm exec tauri build --no-bundle` | Optimierte Windows-Datei mit unveränderter Produktkennung `com.personal-macro.app` erstellt. |
| Native UI | Dokumentierte Kernwege N01–N09 mit realen Eingaben und gesichteten Bildern; keine Renderer-`pageerror` in den verbundenen Sitzungen. |

Die zuerst parallel ausgeführten Frontendtests enthielten Zeitüberschreitungen
und einen nicht reproduzierten Notiz-Assertionsfehler. Alle sieben Notiztests
bestanden danach einzeln, anschließend die unveränderte Gesamtsuite seriell.
Kein Testlimit oder Assertion wurde abgeschwächt; die Ursache des einzelnen
Assertionsfehlers ist nicht bewiesen. Ein echter Fehler in beschädigten
Umlauten der Atlas-Abrufmeldungen wurde behoben und durch den vorhandenen
Rust-Energietest mitgeprüft.

## Grenzen der Abnahme

- Die Quellenprüfungen und Klickwege decken den dokumentierten Umfang ab;
  dies ist keine erneute manuelle Prüfung jeder Kombination aus 365 Gebieten
  und 255 Themen. Quellenbelege stehen in den jeweiligen Fachberichten.
- Bei exakt 1024 Pixeln Außenbreite bleiben durch den klassischen Scrollbalken
  1015 Pixel Innenbreite. Die unveränderte globale `body`-Mindestbreite von
  1024 Pixeln erzeugt deshalb neun Pixel horizontalen Scrollbereich. Die
  geprüften Atlas-Bedienelemente und Diagramme bleiben erreichbar. Es wurde
  kein neuer Atlas-spezifischer Text- oder Diagrammüberlauf beobachtet.
- Dies ist keine standardisierte Laufzeitmessung. Vite meldet weiterhin große
  Atlas-, ECharts- und Dokumentexport-Chunks. Ein früherer paralleler Start
  protokollierte eine 1,86 Sekunden dauernde SQLite-Präferenzabfrage.
- Bekannte Atlas-fremde Meldungen zur EODHD-Technicals-Berechtigung und ein
  `pdf-extract`-Fehler beim Zentralbankabruf traten im ersten Prüfprozess auf.
  Im absichtlich gestörten zweiten Prozess sind Netzwerkfehler erwartet.
  Daraus wird kein vollständig warnungsfreier Gesamtstart behauptet.
- Der vorhandene `.app`-Identifierhinweis von Tauri betrifft macOS. Der
  Windows-Identifier bleibt zum Erhalt des persönlichen AppData-Pfads bestehen.

Die [maschinenlesbare Gesamtprüfung](evidence/completion-audit.json) verbindet
Dateiprüfsummen, Testberichte, Build und native Evidenz. Quellenabdeckung:
[COVERAGE.md](COVERAGE.md), [TOPIC-RESEARCH.md](TOPIC-RESEARCH.md),
[Themenrouten](evidence/topic-route-audit.json),
[Gebietszuordnungen](evidence/geography-crosswalk.json).
