# COT Legacy Non-Commercial – Design

**Datum:** 2026-08-10
**Status:** Vom Benutzer im Gespräch freigegeben

## Ziel

Die primäre COT-Einzelbewertung, die langfristige COT-Bewertung und die daraus
abgeleiteten Währungspaare sollen dieselbe Methodik wie die bereitgestellte
Referenztabelle verwenden. Dafür wird die aktive Bewertungsgrundlage vollständig
auf den offiziellen CFTC-Bericht **Legacy Futures Only** und dessen
Teilnehmergruppe **Non-Commercial** umgestellt.

Die Referenztabelle wurde gegen den CFTC-Stand vom 4. August 2026 geprüft. Alle
16 sichtbaren Reihen stimmen mit den offiziellen Legacy-Non-Commercial-Feldern
überein. Die bisherige Anwendung verwendet dagegen für Finanzmärkte TFF
Leveraged Funds, für physische Rohstoffe Disaggregated Managed Money und für die
Wochenveränderung eine andere Normalisierung. Die Abweichung ist deshalb
methodisch und nicht durch veraltete Daten verursacht.

Dieses Design ersetzt für die aktive COT-Auswertung die entsprechenden
COT-v3-Aussagen in
`2026-08-10-economic-heatmap-institutional-activity-design.md`. EODHD,
Leitzinsen, Seasonality und die übrigen Heatmap-Faktoren bleiben unverändert.

## Verbindliche Datenquelle und Gruppe

- Quelle: CFTC Public Reporting Environment
- Report: Legacy Futures Only
- API-Datensatz: `6dca-aqww`
- Teilnehmergruppe: Non-Commercial
- Umfang: bestehende aktive COT-Kontrakte der Desktop-App
- Reportdatum: Dienstagsschluss; Veröffentlichung gewöhnlich am Freitag
- Freshness: bestehende Zehn-Tage-Grenze

Die aktiven Rohfelder sind:

```text
noncomm_positions_long_all
noncomm_positions_short_all
change_in_noncomm_long_all
change_in_noncomm_short_all
open_interest_all
change_in_open_interest_all
```

Futures-and-Options-Combined, TFF Leveraged Funds und Disaggregated Managed
Money dürfen nicht als stiller Fallback für die aktive Bewertung dienen.

Für DOW wird der Referenzkontrakt auf **DJIA x $5** mit CFTC-Code `124603`
umgestellt. Der bisherige konsolidierte Code `12460+` liefert andere Werte als
die Referenztabelle. Andere bestehende Kontraktcodes bleiben unverändert, sofern
die deterministischen Referenztests keine Abweichung nachweisen.

Neue Märkte wie Platinum werden in dieser Änderung nicht ergänzt.

## Berechnungsregeln

### Wochenwerte

Für jede vollständige Beobachtung gilt:

```text
long_share = long_positions / (long_positions + short_positions)
short_share = short_positions / (long_positions + short_positions)
weekly_long_share_change = long_share[t] - long_share[t - 1]
latest_change_signal = sign(weekly_long_share_change)
```

- positiver Wert: `+1` / Bullish
- negativer Wert: `-1` / Bearish
- exakt null: `0` / Neutral
- fehlende Vorwoche oder `long + short <= 0`: unavailable
- veralteter Report: unavailable

Der Anzeigenwert wird als Prozentpunktveränderung formatiert. Intern bleibt er
ein Dezimalanteil; `0.1564` wird beispielsweise als `+15,64 PP` angezeigt.

Die Bezeichnung „Net % Change“ der Referenztabelle wird in der Anwendung nicht
unkommentiert übernommen, weil sie fachlich missverständlich ist. Die deutsche
Anzeige lautet **„Long-Anteil Δ zur Vorwoche“**. Ein Tooltip erklärt die Formel.

`net_positions = long_positions - short_positions`, Open Interest und dessen
Veränderung bleiben als Rohkontext sichtbar. Sie bestimmen nicht das
Wochenveränderungssignal.

### Langfristige COT-v4-Bewertung

Die methodische Änderung erhält eine neue Versionskennung:

```text
cot-v4-legacy-noncommercial
```

Die drei bestätigenden Komponenten bleiben konzeptionell erhalten, verwenden
aber durchgängig die historische `long_share`-Reihe der Non-Commercial-Gruppe:

1. **Positionierung:** rollierendes Perzentil des aktuellen Long-Anteils.
2. **Kapitalfluss (4W):** `long_share[t] - long_share[t - 4]` und dessen
   rollierendes Perzentil.
3. **Persistenz (13W):** Theil-Sen-Trend des Long-Anteils über 13 Wochen und
   dessen rollierendes Perzentil.

Die bestehenden Regeln für Mindesthistorie, Perzentilschwellen, Bestätigung,
Crowding, Datenlücken, Qualität und Freshness bleiben erhalten. Geändert werden
nur Reportfamilie, Teilnehmergruppe und zugrunde liegende Positionsreihe.

Eine methodisch alte Auswertung darf nicht unter der neuen Versionskennung
erscheinen. Historische COT-v3-Evaluierungen bleiben anhand ihrer bisherigen
Versionskennung auditierbar.

### Währungen und Paare

Der aktive Currency-COT-Score übernimmt das bestätigte v4-Signal. Pair-Werte
folgen weiterhin der kanonischen Regel:

```text
component_score = base_signal - quote_signal
```

Fehlt ein Signal auf einer Seite, bleibt die Pair-Komponente unavailable. Die
Paarmatrix muss antisymmetrisch bleiben:

```text
score(A/B) = -score(B/A)
```

Der DXY-Kontrakt bleibt der ausdrücklich gekennzeichnete USD-Proxy. CNY bleibt
ohne CFTC-Kontrakt unavailable.

## Persistenz und Migration

Eine neue SQLite-Migration erweitert die COT-Persistenz um eine explizite
Methodik- beziehungsweise Serienherkunft. Vorhandene TFF-Leveraged- und
Disaggregated-Managed-Money-Beobachtungen werden mit ihrer bisherigen Herkunft
markiert und nicht als Legacy Non-Commercial umgedeutet.

Die Eindeutigkeit von Beobachtungen muss mindestens folgende Dimensionen
berücksichtigen:

```text
contract + report_date + report_family + participant_group
```

Für neue Legacy-Beobachtungen werden zusätzlich Long-Anteil und dessen
Wochenveränderung nachvollziehbar gespeichert oder deterministisch aus den
gespeicherten Rohwerten berechnet. Raw Source Rows behalten CFTC-URL,
Abrufzeitpunkt, Fingerprint und Payload.

Die Migration muss:

- auf einer leeren Datenbank funktionieren;
- eine bestehende Datenbank ohne Verlust persönlicher Journal-Daten erweitern;
- alte COT-Providerdaten korrekt kennzeichnen;
- alte und neue Scoring-Versionen auseinanderhalten;
- einen Zustand ohne bereits erfolgten Legacy-Sync ehrlich als unavailable
  darstellen.

Ein fehlgeschlagener erster Legacy-Abruf darf vorhandene Providerdaten nicht
löschen. Die UI darf diese alten Daten jedoch nicht als aktive
Legacy-Non-Commercial-Bewertung ausgeben.

## Datenfluss

```text
CFTC Legacy Futures Only API
  → noncomm_* Felder validieren
  → versionierte Source Rows und Beobachtungen
  → Long-Anteil-Zeitreihe
  → COT-v4-Komponenten und bestätigtes Signal
  → Currency-Signal
  → Base-minus-Quote-Paarmatrix
  → COT-Seite und Institutional Activity der Macro-Seite
```

Die öffentliche TypeScript-Fassade bleibt `services/commands.ts`. Direkte
`invoke()`-Aufrufe werden nicht in React-Komponenten ergänzt. Nach erfolgreichem
Sync werden die bestehenden COT- und Macro-Caches invalidiert.

Die Browser-Vorschau führt keinen simulierten CFTC-Abruf aus und zeigt
Legacy-COT weiterhin als unavailable.

## Benutzeroberfläche

Die COT-Übersicht und das Institutional-Activity-Panel zeigen ausdrücklich:

- `Legacy Futures Only · Non-Commercial`;
- Reportdatum und letzten Sync-Zeitpunkt;
- Long Contracts und Short Contracts;
- Long- und Short-Veränderung;
- Long- und Short-Anteil;
- Long-Anteil Δ zur Vorwoche;
- Netto-Position und Open Interest als Kontext;
- aktives Scoring-Modell `cot-v4-legacy-noncommercial`.

Die Cross-Market-Rangliste wird nach `weekly_long_share_change` sortiert. Damit
muss der geprüfte CFTC-Stand vom 4. August 2026 unter anderem folgende Reihenfolge
und Werte ergeben:

| Symbol | Long-Anteil Δ |
|---|---:|
| JPY | `+15,64 PP` |
| USD | `+7,36 PP` |
| GOLD | `+3,14 PP` |
| AUD | `+2,26 PP` |
| ETH | ungefähr `0,00 PP` |
| BTC | `-1,18 PP` |

Platinum gehört nicht zum aktuellen Produktscope und wird daher trotz seines
Referenzwerts nicht in die App aufgenommen.

Positive, negative, neutrale und nicht verfügbare Zustände bleiben zusätzlich
zur Farbe textlich beziehungsweise numerisch erkennbar.

## Fehler- und Verfügbarkeitsverhalten

- Unvollständige CFTC-Zeilen werden nicht bewertet.
- Ohne Vorwoche ist die Wochenveränderung unavailable.
- `long + short <= 0` ist unavailable, nicht neutral.
- Ein veralteter Report liefert kein aktives Wochen- oder v4-Signal.
- Ein CFTC-Fehler blockiert Journal und EODHD-Fundamentaldaten nicht.
- Eine fehlgeschlagene Aktualisierung erhält den letzten vollständigen
  Legacy-Datenstand.
- Existieren nur alte TFF-/Disaggregated-Daten, zeigt die aktive Bewertung
  unavailable statt eines fachlich falschen Fallbacks.
- Providerfehler und Raw Payloads werden begrenzt; Secrets und persönliche Daten
  gelangen weder in Logs noch in Antworten.

## Teststrategie

Die Implementierung erfolgt testgetrieben.

### Parser und Referenzvektoren

- Legacy-Felder werden vollständig ausgewählt und korrekt geparst.
- Exakte CFTC-Fixtures vom 4. August 2026 reproduzieren JPY `+15,64 PP`, USD
  `+7,36 PP`, AUD `+2,26 PP`, ETH ungefähr `0,00 PP` und BTC `-1,18 PP`.
- DOW verwendet `124603` und reproduziert `-0,21 PP`.
- Das frühere TFF-Ergebnis ETH/USD/JPY/AUD darf den neuen Referenztest nicht
  bestehen.
- Gleichheit ergibt neutral; fehlende Vorwoche und Nullnenner ergeben
  unavailable.

### Langfristiges Scoring

- Positionierungsperzentil verwendet Long-Anteil statt Netto-%-OI.
- 4-Wochen-Flow verwendet die Long-Anteil-Differenz über vier Wochen.
- 13-Wochen-Persistenz verwendet den Theil-Sen-Trend des Long-Anteils.
- Mindesthistorie, Datenlücken, Freshness und Bestätigungsregeln bleiben
  deterministisch.
- `cot-v3` und `cot-v4-legacy-noncommercial` werden nicht vermischt.

### Paare und Oberfläche

- Base-minus-Quote deckt `+2`, gleiche Signale, fehlende Gegenstücke und
  Antisymmetrie ab.
- Rangliste und Detailpanel verwenden die neuen Response-Felder.
- Datenquelle, Gruppe, Formel, Einheit und Reportdatum sind sichtbar.
- Browser-Fallback behauptet keine Live-Daten.

### Migration und Qualitätsgates

- Migration gegen leere und bestehende temporäre SQLite-Datenbank;
- relevante Rust- und Repository-Tests im Red-Green-Zyklus;
- relevante Vitest-Tests im Red-Green-Zyklus;
- `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm format:check`, `pnpm build`;
- `cargo fmt --all -- --check`, `cargo test`,
  `cargo clippy --all-targets -- -D warnings`;
- realer Tauri-Start ohne neue Initialisierungs-, Migrations- oder COT-Warnung;
- abschließende Diff-Prüfung auf Secrets, persönliche Daten, generierte Dateien
  und unbeabsichtigte Änderungen.

## Nicht-Ziele

- keine Broker- oder Orderfunktion;
- keine Änderung der EODHD-Fundamentalmethodik;
- keine Änderung der Leitzins- oder Seasonality-Methodik;
- keine neuen COT-Märkte;
- kein Futures-and-Options-Combined-Report;
- kein stiller Fallback auf TFF oder Disaggregated;
- keine rückwirkende Umbenennung alter COT-v3-Ergebnisse;
- keine Änderung persönlicher Journal-, Trade- oder Kontodaten.
