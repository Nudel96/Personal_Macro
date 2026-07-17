# Personal_Macro

Lokales persönliches Macro-, Seasonality-, COT-, Heatmap- und Tradingjournal-Tool.

Der Branch `research/source-system-audit` enthält das Audit des privaten
Referenzsystems und die Zielarchitektur. Produktcode entsteht getrennt in
Implementierungs-Branches.

## Lokaler MVP

Der Branch `codex/phase-1-policy-rates` enthält eine zusammenhängende lokale
Arbeitsoberfläche mit Übersicht, Macro-Heatmap, Pair-Vergleich, Saisonality,
Leitzinsen und einem dauerhaft in SQLite gespeicherten Tradingjournal.

Heatmap, Saisonality und Zinsen verwenden klar gekennzeichnete synthetische
Beispieldaten, bis manuelle Importe oder erlaubte Provideradapter eingerichtet
sind. Journal-Einträge sind echte lokale Nutzerdaten und werden nicht in Git
aufgenommen.

Backend lokal starten:

```powershell
cd apps/api
uv sync --python 3.12
uv run uvicorn app.main:app --reload --port 8000
```

Frontend in einem zweiten Terminal starten:

```powershell
cd apps/web
pnpm install
pnpm dev
```

Danach ist der gesamte Workspace unter `http://localhost:5173` erreichbar.

Die Journal-Datenbank liegt standardmäßig unter
`apps/api/data/personal_macro.sqlite3`. Mit der Umgebungsvariable
`PERSONAL_MACRO_JOURNAL_DB` kann ein anderer lokaler Speicherort gesetzt werden.

## Audit-Dokumente

- [`docs/audit/source-codebase-overview.md`](docs/audit/source-codebase-overview.md)
- [`docs/audit/relevant-feature-map.md`](docs/audit/relevant-feature-map.md)
- [`docs/audit/excluded-product-features.md`](docs/audit/excluded-product-features.md)
- [`docs/audit/data-source-audit.md`](docs/audit/data-source-audit.md)
- [`docs/audit/calculation-audit.md`](docs/audit/calculation-audit.md)
- [`docs/architecture/target-architecture.md`](docs/architecture/target-architecture.md)
- [`docs/architecture/database-schema.md`](docs/architecture/database-schema.md)
- [`docs/planning/implementation-roadmap.md`](docs/planning/implementation-roadmap.md)
- [`docs/planning/free-data-strategy.md`](docs/planning/free-data-strategy.md)
- [`docs/planning/forecast-acquisition-policy.md`](docs/planning/forecast-acquisition-policy.md)
- [`docs/planning/policy-rate-model-v1.md`](docs/planning/policy-rate-model-v1.md)
- [`docs/planning/scoring-model-v1.md`](docs/planning/scoring-model-v1.md)
- [`docs/planning/trading-journal-tauri-implementation-plan.md`](docs/planning/trading-journal-tauri-implementation-plan.md)
- [`docs/planning/journal-metrics-and-heatmap-v1.md`](docs/planning/journal-metrics-and-heatmap-v1.md)
- [`docs/planning/open-questions.md`](docs/planning/open-questions.md)

## Sicherheitsstatus

Lokale Datenbanken, Brokerimporte, Anhänge, Exporte, Backups und `.env`-Dateien
sind über `.gitignore` ausgeschlossen. `.env.example` enthält ausschließlich
leere Platzhalter für optionale API-Keys und lokale Pfade.
