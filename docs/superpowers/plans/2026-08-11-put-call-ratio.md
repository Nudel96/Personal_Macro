# Put/Call-Ratio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine isolierte Research-Seite mit einer auswählbaren, echten CME-FX-Put/Call-Ratio, 5-Tage-Linie und zwei asset-spezifischen Sentiment-Schwellen bauen.

**Architecture:** Ein neues Rust-Modul lädt und validiert den offiziellen CME-PDF-Report, speichert provider-native Tageswerte in zwei neuen SQLite-Tabellen und berechnet MA5 sowie P20/P80 ausschließlich beim Lesen. Das React-Feature greift nur über `services/commands.ts` auf diesen Vertrag zu und rendert eine einzige bestehende Card mit einem ECharts-Line-Chart; Browser-Vorschau und Macro-Heatmap bleiben getrennt.

**Tech Stack:** React 19, TypeScript Strict Mode, TanStack Query, ECharts, Tauri 2, Rust 2024, SQLx/SQLite, Reqwest/Rustls, `pdf-extract` 0.12.0, Vitest/Testing Library, Rust Unit- und Repository-Tests.

## Global Constraints

- Produktive Änderungen erfolgen ausschließlich unter `apps/desktop` plus zugehöriger Dokumentation.
- Nutzertexte sind Deutsch; technische Identifikatoren bleiben Englisch.
- Die Route `/put-call-ratio` und der Query-Key `put-call` sind vollständig von `/macro` und `macro` getrennt.
- Fehlende oder unzureichende Werte sind `unavailable`, niemals neutral oder `0`.
- Eine MA5 benötigt fünf gültige provider-native Tagesbeobachtungen.
- P20/P80 benötigen exakt mindestens 252 gültige MA5-Beobachtungen; es gibt keine festen Ersatzschwellen.
- Die erste Ausbaustufe unterstützt ausschließlich EUR/USD, GBP/USD, AUD/USD, NZD/USD, USD/JPY, USD/CAD und USD/CHF.
- Providerwerte werden in CME-Orientierung gespeichert; inverse Paarorientierung wird nur in der Berechnung angewendet.
- Bestehende Daten bleiben bei Provider- oder Parsingfehlern unverändert.
- Der Browser-Fallback liefert keine Demo- oder Mock-Marktdaten.
- Es werden keine Put/Call-Werte in Macro-Heatmap-, Currency-Score- oder Pair-Score-Tabellen geschrieben.

---

## File Structure

- Create `apps/desktop/src-tauri/migrations/0032_put_call_ratio.sql` – additive Providerbeobachtungs- und Sync-Run-Tabellen.
- Create `apps/desktop/src-tauri/src/commands/put_call.rs` – Asset-Mapping, PDF-Textparser, Providerabruf, Berechnungen, Persistenz und Tauri-Commands.
- Modify `apps/desktop/src-tauri/src/commands/mod.rs` – neues Modul und Command-Reexports.
- Modify `apps/desktop/src-tauri/src/lib.rs` – Commands registrieren.
- Modify `apps/desktop/src-tauri/Cargo.toml` und `Cargo.lock` – `pdf-extract = "0.12.0"`.
- Modify `apps/desktop/src/types/domain.ts` – serialisierte Put/Call-Verträge.
- Create `apps/desktop/src/services/put-call-browser.ts` – expliziter native-only Browservertrag ohne Daten.
- Modify `apps/desktop/src/services/commands.ts` – einzige öffentliche Put/Call-Fassade.
- Create `apps/desktop/src/features/put-call-ratio/put-call-ratio-page.tsx` – Query/Mutation, Assetauswahl, Zustände und einzelne Chart-Card.
- Create `apps/desktop/src/features/put-call-ratio/put-call-ratio-page.test.tsx` – Frontend-Verhalten.
- Modify `apps/desktop/src/App.tsx` – lazy Route.
- Modify `apps/desktop/src/components/layout/app-shell.tsx` – neue Sidebargruppe `Research` mit genau einem Eintrag.
- Modify `apps/desktop/src/styles/globals.css` – nur feature-spezifische Layout-/Chart-Header-Stile auf vorhandenen Tokens.

---

### Task 1: Fachliche Berechnungsengine

**Files:**
- Create: `apps/desktop/src-tauri/src/commands/put_call.rs`
- Modify: `apps/desktop/src-tauri/src/commands/mod.rs`
- Test: `apps/desktop/src-tauri/src/commands/put_call.rs`

**Interfaces:**
- Consumes: provider-native `RawObservation { trade_date, call_notional_usd, put_notional_usd }` und `SourceOrientation::{Direct, Inverse}`.
- Produces: `compute_points(&[RawObservation], SourceOrientation) -> Vec<ComputedPoint>`, `compute_thresholds(&[ComputedPoint]) -> Option<Thresholds>` und `classify(Option<f64>, Option<&Thresholds>) -> Sentiment`.

- [ ] **Step 1: Write failing unit tests for direct and inverse ratios**

```rust
#[test]
fn direct_ratio_divides_put_by_call() {
    assert_eq!(daily_ratio(100, 250, SourceOrientation::Direct), Some(2.5));
}

#[test]
fn inverse_ratio_swaps_provider_put_and_call() {
    assert_eq!(daily_ratio(100, 250, SourceOrientation::Inverse), Some(0.4));
}

#[test]
fn zero_notional_is_unavailable() {
    assert_eq!(daily_ratio(0, 250, SourceOrientation::Direct), None);
    assert_eq!(daily_ratio(100, 0, SourceOrientation::Direct), None);
}
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `cargo test put_call::tests::direct_ratio_divides_put_by_call --lib`

Expected: compilation fails because `daily_ratio` and the Put/Call types are not implemented.

- [ ] **Step 3: Implement minimal orientation and ratio types**

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SourceOrientation { Direct, Inverse }

fn daily_ratio(call: i64, put: i64, orientation: SourceOrientation) -> Option<f64> {
    if call <= 0 || put <= 0 { return None; }
    let (effective_call, effective_put) = match orientation {
        SourceOrientation::Direct => (call, put),
        SourceOrientation::Inverse => (put, call),
    };
    Some(effective_put as f64 / effective_call as f64)
}
```

- [ ] **Step 4: Run the ratio tests and verify GREEN**

Run: `cargo test put_call::tests --lib`

Expected: the three ratio tests pass.

- [ ] **Step 5: Write failing MA5, threshold and classification tests**

Use hand-derived fixtures asserting:

```rust
assert_eq!(ma5(&[1.0, 2.0, 3.0, 4.0]), Vec::<f64>::new());
assert_eq!(ma5(&[1.0, 2.0, 3.0, 4.0, 5.0]), vec![3.0]);
assert!(thresholds(&vec![1.0; 251]).is_none());
assert_eq!(thresholds(&(1..=252).map(f64::from).collect::<Vec<_>>()), Some((51.2, 201.8)));
assert_eq!(classify(Some(201.8), Some((51.2, 201.8))), Sentiment::Bearish);
assert_eq!(classify(Some(51.2), Some((51.2, 201.8))), Sentiment::Bullish);
assert_eq!(classify(Some(100.0), Some((51.2, 201.8))), Sentiment::Neutral);
assert_eq!(classify(Some(100.0), None), Sentiment::Unavailable);
```

- [ ] **Step 6: Run the calculation tests and verify RED**

Run: `cargo test put_call::tests --lib`

Expected: failures name missing MA5, percentile and classification behavior.

- [ ] **Step 7: Implement minimal MA5 and linear percentile calculation**

Implement `ma5`, `linear_percentile`, `thresholds` and `classify`. Slice the percentile input to its latest 252 values before sorting, and use `rank = percentile * (n - 1)` with linear interpolation.

- [ ] **Step 8: Run calculation tests and commit**

Run: `cargo test put_call::tests --lib`

Expected: all Put/Call calculation tests pass.

```powershell
git add apps/desktop/src-tauri/src/commands/put_call.rs apps/desktop/src-tauri/src/commands/mod.rs
git commit -m "feat: add put call ratio calculations"
```

---

### Task 2: SQLite-Persistenz und Dashboard-Query

**Files:**
- Create: `apps/desktop/src-tauri/migrations/0032_put_call_ratio.sql`
- Modify: `apps/desktop/src-tauri/src/commands/put_call.rs`
- Test: `apps/desktop/src-tauri/src/commands/put_call.rs`

**Interfaces:**
- Consumes: `AppState.db`, canonical asset symbols and parsed provider observations.
- Produces: `store_observations(&SqlitePool, trade_date, &[ProviderObservation])`, `load_dashboard(&SqlitePool, asset_symbol) -> PutCallDashboard`.

- [ ] **Step 1: Add a failing repository test using `initialize_headless()`**

The test inserts five direct EURUSD observations with literal notionals, loads the dashboard and asserts one MA5 point with a hand-derived value. A second test inserts an existing row, attempts a failed transaction and verifies the original row remains.

- [ ] **Step 2: Run the repository test and verify RED**

Run: `cargo test put_call::tests::dashboard_reads_persisted_ma5 --lib`

Expected: migration/table or repository function is missing.

- [ ] **Step 3: Add migration `0032_put_call_ratio.sql`**

```sql
CREATE TABLE put_call_observations (
  asset_symbol TEXT NOT NULL,
  source_symbol TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  call_notional_usd INTEGER NOT NULL CHECK (call_notional_usd >= 0),
  put_notional_usd INTEGER NOT NULL CHECK (put_notional_usd >= 0),
  source_orientation TEXT NOT NULL CHECK (source_orientation IN ('direct', 'inverse')),
  source_url TEXT NOT NULL,
  collected_at TEXT NOT NULL,
  PRIMARY KEY (asset_symbol, trade_date)
);

CREATE INDEX idx_put_call_observations_asset_date
  ON put_call_observations(asset_symbol, trade_date DESC);

CREATE TABLE put_call_sync_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  fetched_assets INTEGER NOT NULL DEFAULT 0,
  stored_assets INTEGER NOT NULL DEFAULT 0,
  message TEXT
);

CREATE INDEX idx_put_call_sync_runs_started_at
  ON put_call_sync_runs(started_at DESC);
```

- [ ] **Step 4: Implement serde response types and transactional storage**

Use camelCase serialization. Query at least the newest 350 observations so 252 MA5 values plus the visible 90 points are available. Return static supported assets in deterministic order.

- [ ] **Step 5: Run repository tests and verify GREEN**

Run: `cargo test put_call::tests --lib`

Expected: calculation and repository tests pass on the temporary database.

- [ ] **Step 6: Commit persistence**

```powershell
git add apps/desktop/src-tauri/migrations/0032_put_call_ratio.sql apps/desktop/src-tauri/src/commands/put_call.rs
git commit -m "feat: persist put call observations"
```

---

### Task 3: CME-Parser, Providerabruf und Commands

**Files:**
- Modify: `apps/desktop/src-tauri/Cargo.toml`
- Modify: `apps/desktop/src-tauri/Cargo.lock`
- Modify: `apps/desktop/src-tauri/src/commands/put_call.rs`
- Modify: `apps/desktop/src-tauri/src/commands/mod.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Test: `apps/desktop/src-tauri/src/commands/put_call.rs`

**Interfaces:**
- Consumes: official CME PDF bytes from `https://www.cmegroup.com/reports/fx-put-call.pdf`.
- Produces: Tauri commands `get_put_call_dashboard(state, asset_symbol)` and `sync_put_call_data(state)`.

- [ ] **Step 1: Write failing parser tests with a complete seven-asset text fixture**

The fixture begins with `Daily FX Options Update: 08/10/2026 All Currencies`, includes the `Call Option Put Option TOTAL` header and literal rows for Euro FX, Japanese Yen, Canadian Dollar, British Pound, Australian Dollar, Swiss Franc and New Zealand Dollar. Assert the ISO date and all seven call/put totals.

- [ ] **Step 2: Write failing response-validation tests**

Assert that `validate_pdf_response("text/html", b"%PDF-")`, `validate_pdf_response("application/pdf", b"<html>")`, a report without a date and a report missing a supported row each return `AppError::DataTransfer`.

- [ ] **Step 3: Run parser tests and verify RED**

Run: `cargo test put_call::tests::parses_complete_cme_summary --lib`

Expected: parser and validation functions are missing.

- [ ] **Step 4: Add `pdf-extract = "0.12.0"` and implement parser**

Use `pdf_extract::extract_text_from_mem`. Parse the report date with `chrono::NaiveDate`, parse integer USD notionals after removing `$` and `,`, require all seven supported rows, and reject duplicate asset rows.

- [ ] **Step 5: Implement bounded provider client and sync-run recording**

Create a 30-second Reqwest client with a Personal Macro user agent, `Accept: application/pdf`, response size cap of 8 MiB, status/content validation and provider error messages capped at 280 characters. Record a failed run without touching observations; write successful observations and successful run metadata in one transaction.

- [ ] **Step 6: Register both commands**

Re-export in `commands/mod.rs` and add `get_put_call_dashboard` plus `sync_put_call_data` to `tauri::generate_handler!` in `lib.rs`.

- [ ] **Step 7: Run Rust checks and commit**

Run:

```powershell
cargo fmt --all -- --check
cargo test put_call::tests --lib
cargo clippy --all-targets -- -D warnings
```

Expected: formatting, focused tests and Clippy pass.

```powershell
git add apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/Cargo.lock apps/desktop/src-tauri/src/commands/put_call.rs apps/desktop/src-tauri/src/commands/mod.rs apps/desktop/src-tauri/src/lib.rs
git commit -m "feat: sync CME put call data"
```

---

### Task 4: TypeScript-Vertrag und ehrlicher Browser-Fallback

**Files:**
- Modify: `apps/desktop/src/types/domain.ts`
- Create: `apps/desktop/src/services/put-call-browser.ts`
- Modify: `apps/desktop/src/services/commands.ts`
- Test: `apps/desktop/src/features/put-call-ratio/put-call-ratio-page.test.tsx`

**Interfaces:**
- Consumes: camelCase Rust response types.
- Produces: `api.putCallDashboard(assetSymbol?: string)` und `api.syncPutCall()`.

- [ ] **Step 1: Write a failing page-contract test importing both API methods**

Assert the Browser response has seven selectable assets, `nativeOnly: true`, no points, no thresholds and `sentiment: "unavailable"`. Assert Browser sync rejects with the German native-only explanation.

- [ ] **Step 2: Run Vitest and verify RED**

Run: `pnpm test -- src/features/put-call-ratio/put-call-ratio-page.test.tsx`

Expected: module or Put/Call API methods do not exist.

- [ ] **Step 3: Add exact domain types**

```ts
export type PutCallSentiment = "bullish" | "neutral" | "bearish" | "unavailable";
export type PutCallSourceOrientation = "direct" | "inverse";

export interface PutCallAsset {
  symbol: string;
  label: string;
  sourceSymbol: string;
  sourceOrientation: PutCallSourceOrientation;
}

export interface PutCallPoint {
  tradeDate: string;
  rawRatio: number;
  ma5: number;
  callNotionalUsd: number;
  putNotionalUsd: number;
}

export interface PutCallThresholds {
  bullish: number;
  bearish: number;
  sampleSize: number;
}

export interface PutCallDashboard {
  assets: PutCallAsset[];
  selectedAsset: PutCallAsset;
  points: PutCallPoint[];
  thresholds?: PutCallThresholds | null;
  latestValue?: number | null;
  sentiment: PutCallSentiment;
  calibrationSampleSize: number;
  lastSuccessfulSyncAt?: string | null;
  lastTradeDate?: string | null;
  lastRunStatus?: "success" | "failed" | null;
  lastRunMessage?: string | null;
  nativeOnly: boolean;
}
```

- [ ] **Step 4: Implement browser contract and command facade**

The Browser module returns the same static supported-asset metadata as Rust but contains no observations. `commands.ts` calls native commands only in Tauri and otherwise returns/rejects via the Browser module.

- [ ] **Step 5: Run contract test and typecheck, then commit**

Run:

```powershell
pnpm test -- src/features/put-call-ratio/put-call-ratio-page.test.tsx
pnpm typecheck
```

Expected: Browser contract test and typecheck pass.

```powershell
git add apps/desktop/src/types/domain.ts apps/desktop/src/services/put-call-browser.ts apps/desktop/src/services/commands.ts apps/desktop/src/features/put-call-ratio/put-call-ratio-page.test.tsx
git commit -m "feat: expose put call frontend contract"
```

---

### Task 5: Einzelne Put/Call-Ratio-Chart-Card

**Files:**
- Create: `apps/desktop/src/features/put-call-ratio/put-call-ratio-page.tsx`
- Modify: `apps/desktop/src/features/put-call-ratio/put-call-ratio-page.test.tsx`
- Modify: `apps/desktop/src/styles/globals.css`

**Interfaces:**
- Consumes: `api.putCallDashboard`, `api.syncPutCall`, `PutCallDashboard`.
- Produces: `PutCallRatioPage` and one ECharts configuration with zero or exactly two threshold lines.

- [ ] **Step 1: Write failing UI tests for the one-card contract**

Mock only the slow native API boundary with a complete `PutCallDashboard`. Render the real page and assert one `section.card`, one asset combobox, the title `Put/Call-Ratio · 5-Tage-Durchschnitt` and no H4/D1/Open-Interest content.

- [ ] **Step 2: Write failing UI tests for availability states**

Cover:

- no points -> `Noch keine CME-Tageswerte`;
- MA5 points but `thresholds: null` -> chart present, text `120 / 252`, no bullish/bearish threshold labels;
- complete thresholds -> exactly `Bullish bis` and `Bearish ab`, correct latest badge;
- refetch error with existing query data -> chart remains and negative notice appears.

- [ ] **Step 3: Run focused UI tests and verify RED**

Run: `pnpm test -- src/features/put-call-ratio/put-call-ratio-page.test.tsx`

Expected: page component and chart behavior are missing.

- [ ] **Step 4: Implement query, mutation and single Card**

Use query key `['put-call', assetSymbol]`, invalidate only `['put-call']`, reuse `PageHeader`, `Card`, `CardHeader`, `CardContent`, `Badge`, `Button`, `EmptyState` and `BaseChart`. Disable native sync in Browser preview and keep last query data visible during mutation errors.

- [ ] **Step 5: Implement the ECharts option**

Use one `line` series for `ma5`; add two named dashed `markLine` entries and two translucent `markArea` zones only when thresholds exist. Precompute an honest y-domain from all point and threshold values with 8% padding. Tooltip shows date, MA5, daily PCR, put/call notional and source orientation.

- [ ] **Step 6: Add token-based feature styles**

Add only `.put-call-page`, `.put-call-card`, `.put-call-controls`, `.put-call-status`, `.put-call-chart-note` and responsive rules. Reuse `var(--surface)`, `var(--border)`, `var(--text-2)`, `var(--text-3)`, `var(--positive)`, `var(--negative)` and existing radii.

- [ ] **Step 7: Run UI tests, typecheck and build; commit**

Run:

```powershell
pnpm test -- src/features/put-call-ratio/put-call-ratio-page.test.tsx
pnpm typecheck
pnpm build
```

Expected: focused tests, strict TypeScript and production build pass.

```powershell
git add apps/desktop/src/features/put-call-ratio/put-call-ratio-page.tsx apps/desktop/src/features/put-call-ratio/put-call-ratio-page.test.tsx apps/desktop/src/styles/globals.css
git commit -m "feat: add put call ratio chart"
```

---

### Task 6: Route und isolierte Sidebargruppe

**Files:**
- Modify: `apps/desktop/src/App.tsx`
- Modify: `apps/desktop/src/components/layout/app-shell.tsx`
- Modify: `apps/desktop/src/features/put-call-ratio/put-call-ratio-page.test.tsx`

**Interfaces:**
- Consumes: exported `PutCallRatioPage`.
- Produces: lazy route `/put-call-ratio`, Breadcrumb-Titel und Sidebargruppe `Research` mit genau einem Element.

- [ ] **Step 1: Write failing navigation behavior test**

Render the real shell/router test harness and assert the `Research` group has exactly one link named `Put/Call Ratio` whose `href` is `/put-call-ratio`.

- [ ] **Step 2: Run navigation test and verify RED**

Run: `pnpm test -- src/features/put-call-ratio/put-call-ratio-page.test.tsx`

Expected: Research group/link is absent.

- [ ] **Step 3: Add lazy route, title and nav group**

Use a Lucide ratio/line-chart icon already in the installed dependency. Do not add the page to `macroNav`; create a separate one-item `researchNav` and render it between `Marktkontext` and `Daten & System`.

- [ ] **Step 4: Run tests and commit**

Run:

```powershell
pnpm test -- src/features/put-call-ratio/put-call-ratio-page.test.tsx
pnpm typecheck
```

Expected: navigation and page tests pass.

```powershell
git add apps/desktop/src/App.tsx apps/desktop/src/components/layout/app-shell.tsx apps/desktop/src/features/put-call-ratio/put-call-ratio-page.test.tsx
git commit -m "feat: add isolated research navigation"
```

---

### Task 7: Vollständige Verifikation und reale Desktop-Initialisierung

**Files:**
- Modify only files required by failures found in this task.

**Interfaces:**
- Consumes: complete feature.
- Produces: verified frontend build, Rust backend, migration and desktop startup without new warnings.

- [ ] **Step 1: Run all frontend gates**

```powershell
pnpm typecheck
pnpm test
pnpm lint
pnpm format:check
pnpm build
```

- [ ] **Step 2: Run all Rust gates**

```powershell
cargo fmt --all -- --check
cargo test
cargo clippy --all-targets -- -D warnings
```

- [ ] **Step 3: Start the real Tauri app**

Run from `apps/desktop`: `pnpm tauri dev`.

Verify the migration applies, `/put-call-ratio` opens, the browser-only message is absent in Tauri, provider errors preserve existing local data, and startup logs contain no new initialization warning. Stop only the process started for this verification.

- [ ] **Step 4: Inspect final UI at desktop width**

Verify one chart card, readable labels, no clipping, one asset selector, one data line and at most two threshold lines. Verify the Macro Heatmap route and query behavior are unchanged.

- [ ] **Step 5: Inspect diff and repository hygiene**

Run:

```powershell
git status --short
git diff --check
git diff --stat
```

Confirm `.env.local`, SQLite files, PDFs, backups, generated build output and `.superpowers/` are not staged.

- [ ] **Step 6: Commit only verification fixes if necessary**

```powershell
git add -- apps/desktop/src/features/put-call-ratio/put-call-ratio-page.tsx apps/desktop/src/features/put-call-ratio/put-call-ratio-page.test.tsx apps/desktop/src/styles/globals.css apps/desktop/src/App.tsx apps/desktop/src/components/layout/app-shell.tsx apps/desktop/src/services/commands.ts apps/desktop/src/services/put-call-browser.ts apps/desktop/src/types/domain.ts apps/desktop/src-tauri/src/commands/put_call.rs apps/desktop/src-tauri/src/commands/mod.rs apps/desktop/src-tauri/src/lib.rs apps/desktop/src-tauri/migrations/0032_put_call_ratio.sql apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/Cargo.lock
git commit -m "fix: complete put call ratio verification"
```

If no source change was required, do not create an empty commit.
