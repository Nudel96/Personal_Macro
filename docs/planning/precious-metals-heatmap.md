# Gold und Silber in der Macro-Heatmap

Stand: 07.10.2026. Implementierung in `apps/desktop`; eine neue Veröffentlichung
des privaten Cloud-Workspaces ist damit nicht bestätigt.

## Fachlicher Vertrag

Unter **Macro → Gold & Silber** stehen XAU/USD und XAG/USD in einer eigenen
Heatmap. Der **USD-Einfluss Score** beschreibt ausschließlich den angenommenen
USD-Kanal aus den vorhandenen 17 kanonischen US-Releases:

```text
usd_signal = sign((actual - forecast) * usd_direction)
metal_usd_signal = -usd_signal
metal_usd_score = sum(available metal_usd_signals)
```

Der native EODHD-Reader liefert die bereits geprüften US-Signale. Das gemeinsame
Frontend-Modell `precious-metals.ts` invertiert ausschließlich `scored` und
`neutral`, genau einmal. Die Summen werden aus den verfügbaren Komponenten
gebildet, nicht durch Übernahme eines möglicherweise anders zusammengesetzten
USD-Gesamtscores. Positive und negative Signale heben sich auf; echte Gleichheit
bleibt neutral. Ohne ein verfügbares Signal ist der angezeigte Score `null`/„—“.
Die feste Skala ist −17 bis +17; Coverage nennt die tatsächlich verfügbaren
Komponenten. Jede Datenzelle hat die Spanne −1 bis +1, nicht −2 bis +2 wie ein
vollständiger Fiat-Paarvergleich.

Fehlende, veraltete, zukünftige oder ungeprüfte Releases bleiben nicht verfügbar.
Status, Gründe, Actual, Forecast, Previous, Überraschungsbetrag, Quelle,
Frequenz und Release-Datum werden aus dem US-Reader erhalten. Die Detailansicht
kennzeichnet die Zahlen als US-Daten und den Status als Wirkung auf das Metall.
Das Modell schreibt weder Providerwerte noch einen neuen Snapshot in SQLite.
Die bestehenden Fiat-Scores und deren Paarvertrag werden nicht verändert.

Gold und Silber haben denselben USD-Einfluss Score, weil dieselben US-Releases
verwendet werden. Das ist keine empirisch geschätzte Korrelation, keine
Gesamtbewertung des Metalls und keine kalibrierte Renditeprognose. Insbesondere
eine Inflationsüberraschung wird nur über ihren vorhandenen USD-/Zinskanal
interpretiert; ein eigener Inflationsschutz-Effekt wird nicht damit gemessen.

## Eigenständige Metall-Evidenz

- **COT:** `buildInstitutionalAssetActivity` liest die bestehenden Symbole
  `GOLD` und `SILVER` direkt, auch bei `currency: null`. Latest Buys/Sells und
  die bestehende COT-Pipeline bleiben in ihrer eigenen Richtung. Sie werden
  weder aus USD-COT abgeleitet noch nochmals gegen USD subtrahiert. Fehlende
  Komponenten reduzieren Coverage; fehlen beide, bleibt der Score leer.
- **4H/Daily:** Die vorhandene technische Methodik verwendet eigene
  abgeschlossene Metallkerzen. Das MT5-Universum umfasst weiterhin die
  bisherigen 36 Fiat-Paare plus genau XAU/USD und XAG/USD. Gold-/Silber-Metadaten
  und Forex-/CFD-Berechnungsmodi müssen passen; Terminkontrakte, fremde Quotes
  und unklare Broker-Suffixe werden nicht geraten. Die Metadaten-Aliase GOLD und
  SILVER sind explizit. Meldet ein CFD-Broker auch als Basiswährung USD, benötigt
  die Zuordnung zusätzlich den kanonischen XAUUSD-/XAGUSD-Namen (optional ein
  begrenzter, durch Punkt/Strich/Unterstrich getrennter Broker-Suffix) und einen
  ausdrücklich benannten Metals-Pfad. Ablaufdaten sowie Future-/Forward-/Option-
  und Perpetual-Kennzeichnungen schließen beide Zuordnungswege aus. Metallkerzen
  werden nicht als inverse USD-Kerzen bewertet.
- **Seasonality:** Der Reader verwendet die bereits vorhandenen EODHD-Profile
  XAUUSD.FOREX bzw. XAGUSD.FOREX. Die bestehende rohe 20-Handelstage-Methodik und
  ihre Mindestgeschichte bleiben erhalten. Neue Providerabrufe entstehen durch
  die Anzeige nicht.

Ältere MT5-Snapshots mit 36 gespeicherten Paaren bleiben lesbar. Die beiden
neuen Metall-Trends stehen bis zum nächsten täglichen Abruf oder **MT5-Trends**
auf „nicht geladen“. Das Schema benötigt keine neue Migration. Ein neuer
vollständiger Connector-Snapshot muss genau die 38 erlaubten Märkte enthalten.

Desktop und private Weboberfläche verwenden dasselbe USD-Anzeigemodell.
Die lokale Browser-Vorschau erfindet weiterhin keine Fundamentals- oder
Metallhistorien. Der öffentliche Technicals-Exporter ergänzt ausschließlich
die zwei expliziten EODHD-USD-Spots in zukünftigen geprüften Paketen. Alte
Cloudpakete ohne Metallhistorie bleiben ausdrücklich ohne diese technischen
Signale; MT5-Daten werden nicht in die Cloud übertragen. Bestehende
Zugriffsschutz-, Generations- und Hashprüfungen bleiben erhalten.

## Geltung und Quellen

Die inverse USD-Wirkung ist eine ausdrücklich beschriftete Modellannahme.
Realzinsen, Risiko-/Krisennachfrage und Zentralbanknachfrage können Gold anders
bewegen. Bei Silber sind zusätzlich Industrienachfrage und Angebot wichtig.
Diese Gegenkräfte werden in der Oberfläche erläutert, aber nicht automatisch
in einem zusätzlichen Score geschätzt.

Primärquellen, geprüft am 07.10.2026:

- [World Gold Council: What drives gold?](https://www.gold.org/goldhub/research/what-drives-gold)
  benennt mehrere zusammenhängende Treiber einschließlich Währungen, Inflation,
  Zinsen, Wachstum, Risiken, Investmentflüssen und Angebot.
- [Silver Institute: Global Silver Market Forecast to Remain in a Sizeable Deficit in 2025](https://silverinstitute.org/global-silver-market-forecast-to-remain-in-a-sizeable-deficit-in-2025/)
  beschreibt Dollar-/Renditegegenwind und getrennte Nachfrage-/Angebotseffekte.
  Die historischen Marktaussagen werden nicht als aktuelle Prognose übernommen.
- [MetaQuotes: Symbol Properties](https://www.mql5.com/en/docs/constants/environment_state/marketinfoconstants)
  definiert Währungsmetadaten und Forex-/CFD-/Futures-Berechnungsmodi.

## Prüfung

Deterministische Frontend-Vektoren schützen einfache Inversion, echte Null,
Antisymmetrie, Teildaten, fehlendes USD, veraltete/zukünftige Releases,
unveränderte Quellbeobachtungen und die direkte Metall-COT-Zuordnung.
UI-Tests prüfen beide Zeilen, Coverage, eigene COT-/Kurs-/Seasonality-Signale,
Detailauswahl und unveränderte US-Werte. Native Tests prüfen das feste
38-Märkte-Universum, eigene Gold-/Silberkerzen, die Lesbarkeit alter Caches und
getrennte saisonale Profile. Connector-Tests prüfen Metadaten, CFD-Zulassung,
Futures-/Quote-Ausschluss und Mehrdeutigkeit. Exporttests prüfen die genaue
Zwei-Metalle-Freigabeliste und die Erhaltung ihrer eigenen Profile.

Nachweise vom 07.10.2026:

- 41 relevante Vitest-Tests bestehen; nach der letzten UI-Beschriftungskorrektur
  bestehen die 18 Macro-Seitentests erneut.
- 20 native Tests bestehen einschließlich des ausdrücklich gestarteten
  MT5-Integrationstests in einem isolierten Workspace auf D:.
- 12 Python-Connector-Tests und 10 Node-Exporttests bestehen.
- Typecheck, relevanter ESLint-Lauf, Prettier, Rust-Formatierung und
  `cargo clippy --all-targets -- -D warnings` bestehen.
- Der echte MT5-Lauf liest 38 erlaubte Märkte, davon 30 mit beiden auswertbaren
  Zeitrahmen. XAUUSD und XAGUSD liefern jeweils 300 abgeschlossene H4- und
  D1-Kerzen. Native Speicherung, Auswertung und tägliche Deduplizierung bestehen;
  die Journalzeilen im isolierten Testworkspace bleiben unverändert. Dies ist
  kein persönlicher Journal-Schreibtest.
- Playwright prüft die lokale UI mit ausdrücklich synthetischen Fixtures bei
  1440, 1024 und 390 px, ohne Seitenüberlauf. Die neue Tabelle scrollt innerhalb
  ihres eigenen Containers. Goldauswahl, USD-Messskala und beide Metallzeilen
  sind nachgewiesen. Screenshots und lokale Nachweise liegen unter
  `apps/desktop/output/playwright/precious-metals` auf D:, außerhalb der
  versionierten Produktquellen.
- Der reguläre Windows-Release-Build ohne Installationspaket besteht. Die
  ausführbare Datei unter `src-tauri/target/release/personal-macro-desktop.exe`
  wurde am 07.10.2026 um 18:51 Uhr Europe/Berlin erstellt. Der vorher separat
  geprüfte aktuelle Frontend-Build wurde dafür wiederverwendet. Die bereits
  laufende bisherige EXE im anderen Windows-Startpfad wurde nicht beendet.
  `START-MACROTOOL.cmd` wählt nach dem Schließen der alten Instanz den neueren
  Build. Ein zusätzlicher vollständiger UI-Lauf der neuen Release-EXE ist damit
  noch nicht nachgewiesen; der echte native Fachtest und die Browser-Fixtures
  sind separat geprüft.

Der erstmalige breite Frontend-Testaufruf wurde wegen unbeabsichtigter
Argumentweitergabe und Zeitlimits abgebrochen. Die hier genannten Nachweise
betreffen die anschließend gezielt geprüften relevanten Tests. Beim vollständigen
Clippy-Lauf fiel außerdem ein bestehender Desktop-/Headless-State-Widerspruch im
Wartungsbeispiel `refresh_cot` auf. Es verwendet jetzt denselben unveränderten
COT-Kern direkt; weder Scoring noch HTTP-Freigabelisten werden dadurch erweitert.

## Repository und mobiler Live-Stand

Am 07.10.2026 wurden alle 19 Quell- und Dokumentationsänderungen als Commit
`0952769091936c15dc670ef25ae35e6de9d536b3` auf `origin/main` gepusht. Der private
Web-Build und `cargo check --no-default-features --features postgres --lib`
bestehen zusätzlich. Persönliche Daten, lokale Nachweise und Build-Artefakte
wurden nicht mitgepusht.

Die Vercel-Prüfung bestätigt das richtige Besitzerprojekt und SSO für alle
Deployments. Es gibt keine automatische Git-Verknüpfung. Am stabilen Handy-Link
ist weiterhin Deployment `dpl_B71ECJTeL2jxTpMSqMBbzEc5kyuD` vom 06.10.2026 mit
dem damaligen Code-Commit `e732d61` aktiv. Der tatsächliche WebKit-Seitenlauf
bei 390 px vom 07.10.2026, abgeschlossen um 17:13:34 UTC, lädt die Macro-Seite
ohne Seitenüberlauf und weist ausdrücklich **null Gold-/Silber-Zeilen** nach.
Die Erweiterung ist damit im Repository, aber noch nicht am Handy-Link aktiviert.

Der Test führte keine persönlichen Schreibbefehle aus; die Journalrevision
blieb unverändert. Der temporäre Testzugang wurde widerrufen, seine Sperre und
HTTP 401 für anonyme Anfragen wurden bestätigt. Lokaler Nachweis außerhalb der
versionierten Quellen: `apps/desktop/.vercel/metals-mobile-before-report.json`.
Eine physische iPhone-Abnahme ist dies nicht. Die gesonderte manuelle
Live-Aktivierung wurde als Rückfrage vorgelegt und ist durch diesen Prüfbericht
nicht ausgeführt oder bestätigt.
