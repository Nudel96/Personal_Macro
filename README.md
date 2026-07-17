# Personal_Macro

Lokales persönliches Macro-, Seasonality-, COT-, Heatmap- und Tradingjournal-Tool.

Der Branch `research/source-system-audit` enthält das Audit des privaten
Referenzsystems und die Zielarchitektur. Produktcode entsteht getrennt in
Implementierungs-Branches.

## Erste Produktimplementierung: Leitzinsen

Der Branch `codex/phase-1-policy-rates` startet den ersten lokalen Produkt-Slice:
eine FastAPI-Rate-Engine, eine React-Ansicht sowie Tests für erwartete
Leitzinsänderungen und die relative USD-Stance. Die UI verwendet bewusst nur
synthetische Demo-Daten, bis ein manueller Forecast-Import oder ein erlaubter
Provideradapter eingerichtet ist.

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

Danach ist die Leitzinsansicht unter `http://localhost:5173` erreichbar.

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
- [`docs/planning/open-questions.md`](docs/planning/open-questions.md)

## Sicherheitsstatus

Lokale Datenbanken, Brokerimporte, Anhänge, Exporte, Backups und `.env`-Dateien sind über `.gitignore` ausgeschlossen. `.env.example` enthält ausschließlich leere Platzhalter für optionale kostenlose API-Keys.
