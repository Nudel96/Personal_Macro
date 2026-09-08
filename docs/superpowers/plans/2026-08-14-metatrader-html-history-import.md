# MetaTrader HTML History Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import closed positions from classic MetaTrader HTML history reports safely, idempotently and transactionally into the explicitly selected journal account.

**Architecture:** A native inert parser turns bounded UTF-16LE/UTF-8 HTML into typed closed-position rows without rendering or executing markup. Preview persists normalized staging rows in the existing import-run tables; commit revalidates account/source identity and writes all nonduplicate trades plus immutable source links in one SQLite transaction. The browser path reports that the Desktop app is required.

**Tech Stack:** Rust 2024, SQLx/SQLite, Tauri 2, `scraper`/html5ever, `encoding_rs`, `chrono-tz`, `rust_decimal`, SHA-256, React 19, TypeScript strict mode, TanStack Query, native Tauri dialog, Vitest.

## Global Constraints

- Product changes stay in `apps/desktop` and follow `docs/superpowers/specs/2026-08-14-journal-account-isolation-html-import-design.md`.
- Version 1 imports only closed rows from a classic MetaTrader `Positionen`/`Positions` table.
- The modern aggregate-only MT5 report is rejected with `UNSUPPORTED_AGGREGATE_REPORT`.
- HTML is never rendered, evaluated or returned raw to the UI.
- Preview and commit require the same active selected account and explicit IANA broker-server timezone.
- Imports are idempotent by platform, report account and source position ID; changed payloads are conflicts.
- Commit is all-or-nothing. Open positions, Orders, Deals and balance rows are not converted into journal trades.
- Browser preview reports `DESKTOP_REQUIRED` and never fabricates imported rows.
- The supplied personal reports are read-only validation inputs and never become repository fixtures.
- Existing uncommitted Put/Call changes belong to the user. Never stage, commit, overwrite or reformat them; record task diff/test evidence instead of blanket git staging.

---

### Task 1: Import schema, inert decoder and classic report parser

**Files:**

- Create: `apps/desktop/src-tauri/migrations/0035_metatrader_html_import.sql`
- Create: `apps/desktop/src-tauri/src/commands/metatrader_html.rs`
- Modify: `apps/desktop/src-tauri/src/commands/mod.rs`
- Modify: `apps/desktop/src-tauri/Cargo.toml`
- Modify: `apps/desktop/src-tauri/Cargo.lock` through Cargo only
- Test: colocated parser tests in `metatrader_html.rs`

**Interfaces:**

- Produces parser function:

```rust
fn parse_classic_metatrader_report(
    bytes: &[u8],
    source_timezone: Tz,
) -> Result<ParsedMetaTraderReport, AppError>;
```

- Produces typed `ParsedMetaTraderReport`, `ParsedClosedPosition`, `ParsedReportIdentity`, ignored-section counts and stable parser error codes.
- Adds `metatrader_import_sources` and `metatrader_trade_links` tables.

- [ ] **Step 1: Write synthetic failing parser tests**

Build tiny fixture strings inside tests and encode one as UTF-16LE+BOM. Include German headers:

```text
Zeit | Position | Symbol | Typ | Volumen | Preis | S / L | T / P |
Zeit | Preis | Kommission | Swap | Gewinn
```

Assert a Buy row maps to `long`, a Sell row to `short`, IDs remain strings, decimal dots parse exactly, and `gross + commission + swap` yields the expected minor-unit net. Add UTF-8 English-header coverage.

- [ ] **Step 2: Add failing security/format tests**

Cover: missing BOM with invalid UTF-16, file larger than `16 * 1024 * 1024`, missing Positions table, duplicate header, duplicate position ID, malformed numeric value, blank close time, unsupported type, script markup, external-resource markup, modern `window.__report` aggregate HTML, and excessive table/cell counts. Scripts/resources may be ignored structurally only if no content is executed; the modern report must use its dedicated error.

- [ ] **Step 3: Add failing timezone tests**

Using `Europe/Berlin`, assert a normal local time converts to the expected UTC instant. Assert an ambiguous fall-back time and nonexistent spring-forward time become invalid rows with stable reasons `AMBIGUOUS_LOCAL_TIME` and `NONEXISTENT_LOCAL_TIME`, never guessed offsets.

- [ ] **Step 4: Run focused parser tests and capture red**

Run:

```powershell
cd D:\Macrotool\apps\desktop\src-tauri
cargo test metatrader_html::tests::parser --lib -- --nocapture
```

Expected: failure because the parser module/schema do not exist.

- [ ] **Step 5: Add the non-destructive import schema**

Create:

```sql
CREATE TABLE metatrader_import_sources (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK(platform IN ('mt4','mt5')),
  report_account_sha256 TEXT NOT NULL,
  report_account_masked TEXT NOT NULL,
  base_currency TEXT NOT NULL,
  source_timezone TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(account_id, platform),
  UNIQUE(platform, report_account_sha256)
);

CREATE TABLE metatrader_trade_links (
  source_id TEXT NOT NULL REFERENCES metatrader_import_sources(id) ON DELETE CASCADE,
  source_position_id TEXT NOT NULL,
  trade_id TEXT NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  payload_sha256 TEXT NOT NULL,
  import_run_id TEXT REFERENCES import_runs(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(source_id, source_position_id),
  UNIQUE(trade_id)
);
```

Add `target_account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL` and `source_timezone TEXT` to `import_runs` using additive columns. Add indexes for account/run lookups. Do not mutate existing runs.

- [ ] **Step 6: Implement bounded decoding and inert DOM parsing**

Accept UTF-16LE BOM and UTF-8/UTF-8 BOM. Decode before parsing, cap file bytes, table count, row count, cells per row and total text. Use `scraper::Html::parse_document`; never evaluate JavaScript or fetch resources. Detect the modern aggregate form before normal table parsing.

- [ ] **Step 7: Implement normalized header/row mapping**

Normalize whitespace, NBSP, case and German/English aliases. Require the complete closed-position header contract and two timestamps. Parse monetary fields with `Decimal`; convert to minor units using the repository's existing exact rounding convention. Store UTC RFC3339 timestamps and preserve chosen `display_timezone`.

- [ ] **Step 8: Run parser tests to green and record evidence**

Run the command from Step 4 plus `cargo fmt --all -- --check`. Record exact results and dependency changes without staging unrelated Cargo/Put-Call hunks.

### Task 2: Native preview staging, source binding and transactional commit

**Files:**

- Modify: `apps/desktop/src-tauri/src/commands/metatrader_html.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Test: colocated temporary-database import tests

**Interfaces:**

- Produces Tauri commands:

```rust
pub async fn preview_metatrader_html(
    state: State<'_, AppState>,
    input: MetaTraderHtmlPreviewInput,
) -> CommandResult<MetaTraderHtmlPreview>;

pub async fn commit_metatrader_html(
    state: State<'_, AppState>,
    input: MetaTraderHtmlCommitInput,
) -> CommandResult<MetaTraderHtmlCommitResult>;
```

- `MetaTraderHtmlPreviewInput` has `path`, `account_id`, `source_timezone`.
- `MetaTraderHtmlCommitInput` has `run_id`, `account_id`.
- Preview exposes run ID, masked source account, currency, timezone, `valid`, `invalid`, `ignored`, `duplicate`, `conflict`, `openPositions`, `orders`, `deals`, `canCommit` and at most 25 typed row previews.

- [ ] **Step 1: Add failing preview persistence tests**

Use a temporary file and DB. Assert preview validates an active account, stages only normalized JSON/text (never raw HTML), records source SHA-256, masks the report account and counts ignored Orders/Deals/open positions. Assert blank, archived or currency-mismatched targets fail without an import run.

- [ ] **Step 2: Add failing idempotency/conflict tests**

Preview and commit a synthetic position once. Re-preview identical content and assert `duplicate = 1`, `conflict = 0`, zero new trade writes. Change the profit for the same source position and assert `conflict = 1`, `canCommit = false`, with no existing trade mutation.

- [ ] **Step 3: Add failing atomicity/account-switch tests**

Stage two valid rows, make the second violate a DB constraint during commit and assert neither trade/link is inserted. Preview for A then commit with B and expect `IMPORT_ACCOUNT_MISMATCH`. Archive A between preview and commit and expect `ACCOUNT_NOT_FOUND`.

- [ ] **Step 4: Run focused import tests and capture red**

Run:

```powershell
cd D:\Macrotool\apps\desktop\src-tauri
cargo test metatrader_html::tests::import --lib -- --nocapture
```

Expected: failure because preview/commit do not exist.

- [ ] **Step 5: Implement preview staging**

Canonicalize the selected path, require `.html`/`.htm`, verify it is a regular file and read at most 16 MiB. Call the active-account guard and parser. Hash the normalized source account rather than logging/storing its raw number. Compare existing source binding and link hashes. Insert one `import_runs` row with status `preview` plus `import_rows` normalized payloads in a transaction.

- [ ] **Step 6: Implement immutable source binding rules**

One journal account can bind to one MetaTrader report account per platform, and one report account cannot bind to two journal accounts. Currency must equal the selected journal account's base currency. Reusing the source with a different timezone is a conflict until the preview explicitly uses the stored timezone.

- [ ] **Step 7: Implement all-or-nothing commit**

Load the staged run and rows inside `BEGIN IMMEDIATE`, validate `status = 'preview'`, matching account, active account, zero invalid/conflict rows and unchanged source mapping. Insert only valid nonduplicate trades with `source = 'metatrader_html'`, exact money fields and JSON source metadata; then insert source links and mark the run committed. Any error rolls back the entire batch.

- [ ] **Step 8: Register commands and run tests to green**

Register both commands in `lib.rs` without disturbing the uncommitted Put/Call registrations. Run the Step 4 command and `cargo test metatrader_html --lib -- --nocapture`; record evidence.

### Task 3: Typed frontend workflow and native-only browser behavior

**Files:**

- Modify: `apps/desktop/src/types/domain.ts`
- Modify: `apps/desktop/src/services/commands.ts`
- Modify: `apps/desktop/src/features/import-export/import-export-page.tsx`
- Create: `apps/desktop/src/features/import-export/metatrader-html-import.tsx`
- Create: `apps/desktop/src/features/import-export/metatrader-html-import.test.tsx`
- Modify/create browser-native error helper tests

**Interfaces:**

- Produces TypeScript types matching native preview/commit contracts.
- Produces:

```ts
api.previewMetaTraderHtml(input: MetaTraderHtmlPreviewInput): Promise<MetaTraderHtmlPreview>;
api.commitMetaTraderHtml(input: MetaTraderHtmlCommitInput): Promise<MetaTraderHtmlCommitResult>;
```

- Consumes `useJournalAccount()` and native dialog `open({ multiple: false, filters: [...] })`.

- [ ] **Step 1: Add failing UI tests**

Test no-account disabled state, dialog cancellation, path/account/timezone arguments, loading/error state, preview counts, `canCommit = false` on conflicts, commit success invalidation and preview discard when the globally selected account changes.

- [ ] **Step 2: Add failing browser-contract test**

Force non-Tauri mode and assert both facade methods reject with code `DESKTOP_REQUIRED`; neither may return a fake preview or commit result.

- [ ] **Step 3: Run focused Vitest and capture red**

Run:

```powershell
cd D:\Macrotool\apps\desktop
pnpm test -- metatrader-html-import.test.tsx
```

Expected: failure because component/types/facade methods do not exist.

- [ ] **Step 4: Add domain/facade contracts**

Mirror camelCase native fields exactly. In browser mode return a rejected normalized `CommandError` with German message `Der MetaTrader-HTML-Import benötigt die Desktop-App.` and code `DESKTOP_REQUIRED`.

- [ ] **Step 5: Build the importer card/dialog**

Use existing Card, Button, field/select, notice and table styles. Required controls: visible selected target account, native file button, IANA timezone select/input, `Vorschau prüfen`, summary badges and `Trades übernehmen`. Render only typed fields; never inject returned markup. Show why ignored/open rows are not imported.

- [ ] **Step 6: Enforce preview ownership and cache invalidation**

Store the account ID used by the preview. If global selection changes, clear the preview. Commit sends both run and current account. On success invalidate `trades`, `dashboard`, `calendar`, `reviews`, `playbook`, `mistakes` and `bootstrap` for that account, then show a German success toast with inserted/duplicate counts.

- [ ] **Step 7: Run focused tests to green**

Run the Step 3 command plus `pnpm typecheck`. Record results without staging unrelated changes.

### Task 4: Parser regression against supplied reports and full import verification

**Files:**

- No personal report is added or modified.
- Review all files changed by Tasks 1–3.

**Interfaces:**

- Consumes the two user-supplied local reports read-only.
- Produces sanitized structural verification only; no account number, symbol, timestamp, price or P&L values in logs/reports.

- [ ] **Step 1: Add an ignored read-only structural test for supplied reports**

Add `#[ignore] fn validates_supplied_reports_without_persisting_personal_data()`.
It reads paths only from `METATRADER_CLASSIC_REPORT_PATH` and
`METATRADER_MODERN_REPORT_PATH`, calls the pure byte parser without an
`AppState`/database, and logs only sanitized counts/error codes. No source row,
account identity, symbol, time or money value is printed.

- [ ] **Step 2: Run read-only parsing against the classic report**

Set `METATRADER_CLASSIC_REPORT_PATH` to the supplied `ReportHistory` path only
for the ignored test process. Assert structural totals: 207 valid closed
positions, five open positions ignored, no duplicate source position IDs and
no persistence code invoked.

- [ ] **Step 3: Verify modern aggregate rejection**

Set `METATRADER_MODERN_REPORT_PATH` to the supplied modern `Trade report` path
and assert `UNSUPPORTED_AGGREGATE_REPORT`. The pure test has no database and
therefore cannot stage a trade.

- [ ] **Step 4: Run native and frontend import suites**

Run:

```powershell
cd D:\Macrotool\apps\desktop\src-tauri
cargo test metatrader_html --lib -- --nocapture
cargo fmt --all -- --check
cd D:\Macrotool\apps\desktop
pnpm test -- metatrader-html-import.test.tsx
pnpm typecheck
```

Expected: all commands exit zero.

- [ ] **Step 5: Inspect security and privacy invariants**

Search changed code for `innerHTML`, `eval`, raw HTML serialization, report-value logging and network fetches in the importer. Verify import staging contains normalized JSON only and `git status` contains no personal HTML file.

- [ ] **Step 6: Record the complete evidence package**

Include command outputs, sanitized counts, diff paths and any known format limitations in the task report. Do not claim MT4 support unless a synthetic MT4 fixture and parser test were added.
