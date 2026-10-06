# Prüfung der Macro-Snapshot-Frische

Die unabhängige Prüfung des privaten Snapshot-Lesepfads hat zwei Abweichungen
gefunden: Gespeicherte Fundamentals-Bewertungen blieben nach Ablauf ihrer
Gültigkeit weiterhin im Paarvergleich aktiv, und der Feed meldete unabhängig
von gespeicherten Mapping-Kandidaten immer null offene Prüfungen.

Der Cloudreader prüft die Frische jetzt vor Currency- und Paaraggregation.
Desktop-Rebuild und Cloud-Lesepfad verwenden denselben reinen Vergleich:
`released_at < now - freshness_days`. Genau an der Grenze bleibt die Beobachtung
verfügbar. Nach Ablauf erhält sie entsprechend der bestehenden Desktop-Methodik
Score `0`, Status `unmapped` und den Grund `stale_release`. Damit ist die
Beobachtung im Paarvergleich ausdrücklich nicht verfügbar. Die Formel für
Überraschung und Paarbildung wurde nicht geändert.

Die Cloudkorrektur verändert keine gespeicherte Zeile. Actual, Forecast,
Previous, Surprise, Veröffentlichungsdatum und Quelle bleiben zur Prüfung
sichtbar. `asOf` bleibt der ursprüngliche Snapshotzeitpunkt. Dashboard und
Indikatorhistorie nutzen dieselbe explizite aktuelle Zeitquelle im Cloudreader.
Die Desktop-Schreib- und Aktualisierungspfade bleiben erhalten.

`pendingMappingReviews` wird aus den tatsächlichen Kandidaten mit
`status='pending'` gezählt. Das schaltet keine Mapping-Mutation oder
Provider-Aktualisierung in der Cloud frei.

Gezielte Regressionen in `cloud_public::macro_readers::tests`:

- `macro_cloud_freshness_expires_before_aggregation_without_losing_raw_data`
  prüft die exakte Frischegrenze, das Verfallen positiver und neutraler
  Eigenbewertungen, die unveränderte native Aggregation in beiden
  Paar-Richtungen, erhaltene Rohdaten, die Zeit der Historienabfrage und
  unveränderte gespeicherte Bewertungen.
- `macro_cloud_feed_counts_only_pending_mapping_reviews` prüft offene gegenüber
  abgeschlossenen Kandidaten sowie unverändert deaktivierte Cloud-Scheduler.

Beide Fixtures verwenden ausschließlich neu angelegte In-Memory-Datenbanken
mit dem freigegebenen Paket-Schema; die Abfragen laufen unter `query_only`.
Die Ausführung der Rust-Tests erfolgt im zentralen Prüfungsdurchlauf.

## Bestehender fachlicher Widerspruch im Desktop-Paarvergleich

Die Prüfung hat zusätzlich einen bereits vor dem Cloudrollout bestehenden
Widerspruch gefunden. AGENTS.md §10.4 verlangt, dass eine Komponente ohne
verfügbares Gegenstück nicht zum Paar-Rohscore beiträgt. Der tatsächlich
implementierte Desktopvertrag in `eodhd_fundamentals.rs::pair_component`
ersetzt dagegen fehlende Seiten numerisch durch `0`; die Dashboard-Aggregation
summiert auch Zellen mit `available=false`. Die bestehenden Fachtests verlangen
ausdrücklich `pair_component(Some(1), None) == 1` und
`pair_component(None, Some(-1)) == 1`. Auch
`docs/planning/eodhd-fundamentals-workflow.md` dokumentiert dieses Verhalten.

Diese Abweichung wurde im Cloudrollout bewusst nicht verändert. Wenn EUR von
`+1` auf nicht verfügbar verfällt und USD frisch bei `-1` bleibt, ändert sich
EUR/USD deshalb von `+2` auf `+1`; USD/EUR entsprechend von `-2` auf `-1`.
Beide Zellen bleiben dabei `available=false`, und die abgelaufene EUR-Seite
hat selbst Score `0`. Die neue Regression prüft diesen tatsächlichen
Desktopvertrag. Ihre ursprüngliche Erwartung `0` wurde nach dem fehlgeschlagenen
Test und dem Abgleich mit Code, bestehenden Fachtests und Dokumentation
korrigiert. Eine Umstellung auf ausschließlich gemeinsame verfügbare
Komponenten ist eine separate fachliche Korrektur und kein Teil dieser Arbeit.
