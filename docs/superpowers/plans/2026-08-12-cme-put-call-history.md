# CME Put/Call History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing CME FX Put/Call feature with an auditable multi-file Daily Volume XLSX import, preserve PDF priority, and render raw daily PCR immediately while retaining MA5 and 252-point calibration rules.

**Architecture:** Add an additive migration that separates numeric value, unit, method, priority, and file provenance from the legacy PDF notional columns. Parse user-selected official CME XLSX files natively with Calamine, aggregate unambiguous supported USD FX option Call/Put contract volume, and upsert only when the incoming source has equal or higher priority. Return the last 90 valid raw observations with optional MA5 values so one imported day is already visible.

**Tech Stack:** Rust 2024, Tauri 2, SQLx/SQLite, Calamine, React 19, TypeScript strict mode, TanStack Query, ECharts, Vitest/Testing Library.

## Global Constraints

- Product changes stay in `apps/desktop`.
- Existing migration `0032_put_call_ratio.sql` remains unchanged; schema evolution uses `0033`.
- PDF imports remain official USD-notional observations and outrank reconstructed XLSX observations.
- XLSX contract counts are never stored or labeled as USD notional.
- Unsupported products, FX crosses, futures, zero-sided days, malformed files, and ambiguous mappings are unavailable rather than neutral or zero.
- The public archive is opened in the normal browser. No anti-bot bypass or automated scraping is implemented.
- Browser preview does not fabricate data or successful imports.
- Existing user database data is preserved; no direct database repair is performed.
- No commit or push is performed without an explicit user request.

---

### Task 1: Observation provenance schema

**Files:**

- Create: `apps/desktop/src-tauri/migrations/0033_put_call_provenance.sql`
- Test: `apps/desktop/src-tauri/src/commands/put_call.rs`

**Interfaces:**

- Existing observations backfill `call_value = call_notional_usd`, `put_value = put_notional_usd`, `value_unit = 'usd_notional'`, `calculation_method = 'official_notional_pdf'`, and `source_priority = 30`.
- New observations additionally store `source_file`, `is_preliminary`, `direct_import`, `product_codes_json`, and `parser_version`.

- [ ] **Step 1: Write a failing repository test** that migrates a temporary database and asserts legacy PDF rows expose the new default provenance.
- [ ] **Step 2: Run the focused Rust test** and verify failure because migration `0033` and columns do not exist.
- [ ] **Step 3: Add migration `0033`** with additive columns, constraints/defaults supported by SQLite, and an explicit backfill for existing rows.
- [ ] **Step 4: Run the focused Rust test** and verify the migrated legacy row is still readable as official PDF notional.

### Task 2: Daily Volume XLSX parser

**Files:**

- Modify: `apps/desktop/src-tauri/Cargo.toml`
- Modify: `apps/desktop/src-tauri/src/commands/put_call.rs`

**Interfaces:**

- Produces `parse_daily_volume_workbook(path: &Path) -> Result<ParsedDailyVolumeReport, AppError>`.
- Produces one observation per unambiguously mapped supported asset with positive Call and Put totals.
- Uses normalized header aliases for Description/Asset Class, Exchange Name, Commodity Indicator, Product Description, Future/Option Indicator, Total Volume, and optional product code.

- [ ] **Step 1: Add a failing parser test** using a minimal real XLSX fixture with reordered headers, weekly series, direct and inverse assets, and literal expected contract totals.
- [ ] **Step 2: Add failing rejection tests** for futures, FX crosses, ambiguous currency text, missing Total Volume, zero Call/Put totals, duplicate/invalid trade dates, and unsupported workbook schemas.
- [ ] **Step 3: Run focused parser tests** and verify they fail because the XLSX parser is absent.
- [ ] **Step 4: Add Calamine and minimal parser types**; detect the product sheet by normalized name or required header set rather than fixed coordinates.
- [ ] **Step 5: Implement strict row classification** for FX + Option + explicit Call/Put, map only the seven supported USD underlyings, exclude crosses, and sum positive `Total Volume` values.
- [ ] **Step 6: Derive the trade date from `daily_volume_YYYYMMDD.xlsx`** and reject names without one unambiguous valid date.
- [ ] **Step 7: Run parser tests** and verify all mappings and rejection cases pass.

### Task 3: Priority-aware batch persistence

**Files:**

- Modify: `apps/desktop/src-tauri/src/commands/put_call.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`

**Interfaces:**

- Produces `import_put_call_xlsx(state, paths) -> CommandResult<PutCallBatchImportResult>`.
- PDF source priority is `30`; weighted reconstructed PCR is `20`; contract-volume PCR is `10`.
- Batch result returns selected files, valid trading days, stored observations, skipped lower-priority observations, earliest date, and latest date.

- [ ] **Step 1: Write a failing database test** proving an XLSX observation cannot overwrite an existing PDF observation for the same asset/date.
- [ ] **Step 2: Write failing transaction tests** proving malformed input does not partially write a batch and duplicate dates are handled deterministically.
- [ ] **Step 3: Run focused persistence tests** and verify expected failures.
- [ ] **Step 4: Generalize observation storage** to bind value/unit/method/provenance and apply the source-priority predicate on conflict.
- [ ] **Step 5: Implement the native batch command and bounded run message**; register it in the Tauri handler.
- [ ] **Step 6: Run persistence tests** and verify PDF priority, transaction safety, and result counts.

### Task 4: Raw history and optional MA5 contract

**Files:**

- Modify: `apps/desktop/src-tauri/src/commands/put_call.rs`
- Modify: `apps/desktop/src/types/domain.ts`
- Modify: `apps/desktop/src/services/put-call-browser.ts`

**Interfaces:**

- `PutCallPoint.ma5` becomes nullable.
- Each point includes `valueUnit`, `calculationMethod`, `methodLabel`, `sourceFile`, and `isPreliminary`.
- `PutCallDashboard.latestRawRatio` is present from the first valid observation; `latestValue` remains the latest MA5 or null.

- [ ] **Step 1: Write a failing Rust dashboard test** asserting one valid day returns one point with raw PCR and null MA5.
- [ ] **Step 2: Write a failing five-day test** asserting the fifth point contains the literal MA5 and earlier points remain raw-only.
- [ ] **Step 3: Run focused dashboard tests** and verify failure because points currently start only after five days.
- [ ] **Step 4: Build raw points first**, align optional rolling averages to dates, retain up to 350 rows for calibration, and return only the last 90 valid trading days.
- [ ] **Step 5: Update TypeScript and browser-unavailable contracts** without mock observations.
- [ ] **Step 6: Run Rust and TypeScript checks** for the updated serialized contract.

### Task 5: Native archive and multi-file import UI

**Files:**

- Modify: `apps/desktop/src/services/commands.ts`
- Modify: `apps/desktop/src/features/put-call-ratio/put-call-ratio-page.tsx`
- Modify: `apps/desktop/src/features/put-call-ratio/put-call-ratio-page.test.tsx`

**Interfaces:**

- Produces `api.importPutCallXlsx(paths: string[]): Promise<PutCallBatchImportResult>`.
- Adds `CME-Archiv öffnen` for `https://www.cmegroup.com/ftp/daily_volume/` and `XLSX-Dateien importieren` with a multi-select native dialog.

- [ ] **Step 1: Add failing UI tests** for opening the official archive, selecting multiple XLSX files, cancel behavior, success summary, and keeping existing chart data visible on failure.
- [ ] **Step 2: Run the focused Vitest file** and verify failure because actions and command facade are absent.
- [ ] **Step 3: Add TypeScript result types and command-facade method** with an explicit native-only browser rejection.
- [ ] **Step 4: Add archive and batch-import actions** and invalidate only the `put-call` query family after success.
- [ ] **Step 5: Run focused Vitest tests** and verify all interaction cases pass.

### Task 6: Chart and method disclosure

**Files:**

- Modify: `apps/desktop/src/features/put-call-ratio/put-call-ratio-page.tsx`
- Modify: `apps/desktop/src/features/put-call-ratio/put-call-ratio-page.test.tsx`

**Interfaces:**

- Daily PCR is always charted for available observations.
- MA5 is overlaid only from the fifth valid day.
- Thresholds and sentiment remain unavailable below 252 valid MA5 observations.

- [ ] **Step 1: Add failing chart tests** asserting one raw point renders a chart, raw and MA5 series use date-aligned values, and method/provisional status appears in the UI.
- [ ] **Step 2: Run focused tests** and verify failure because the empty-state branch hides raw-only data.
- [ ] **Step 3: Update ECharts options and summary copy** to distinguish daily PCR from MA5 and disclose `CME Contract-Volume PCR` versus official PDF notional.
- [ ] **Step 4: Keep thresholds on the MA5 series only** and preserve inverse-pair tooltip semantics.
- [ ] **Step 5: Run focused tests** and verify raw-only, mixed-source, calibrated, and error states.

### Task 7: Historical data acquisition and verification

**Files:**

- No repository fixture may contain user or downloaded market data.
- User database changes require the normal application import path.

**Interfaces:**

- Consumes locally available official `daily_volume_YYYYMMDD.xlsx` files.
- Produces at least 90 distinct valid trading days when 90 valid source files are available.

- [ ] **Step 1: Re-scan local download locations** for official CME files after the importer exists.
- [ ] **Step 2: If files are available, import through the native command/UI** and verify per-asset day counts, first/last date, positive Call/Put values, and method labels.
- [ ] **Step 3: Compare any shared PDF/XLSX dates** by Call, Put, and ratio; retain the contract-volume label unless sufficient equality is demonstrated.
- [ ] **Step 4: If CME still blocks automated acquisition and no local files exist**, report the exact external blocker without bypassing it; do not claim 90 days were imported.

### Task 8: Full verification

**Files:**

- Review all modified files and repository diff.

**Interfaces:**

- Consumes Tasks 1–7.
- Produces a verified native and frontend feature without unrelated changes.

- [ ] **Step 1: Run `pnpm typecheck`, focused Vitest, full Vitest, lint, format check, and build.**
- [ ] **Step 2: Run `cargo fmt --all -- --check`, focused Put/Call tests, full `cargo test`, and `cargo clippy --all-targets -- -D warnings`.**
- [ ] **Step 3: Start the real Tauri app** and confirm migration plus initialization produce no new warning.
- [ ] **Step 4: Inspect the active SQLite database read-only** for observation counts and provenance after any import.
- [ ] **Step 5: Inspect `git diff` and `git status`** for secrets, downloaded CME files, generated artifacts, and unrelated changes.
