# Disable MT5 and Reset Journal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every live MetaTrader runtime path and provide a backup-gated transactional reset that leaves the application with no journal account while preserving all macro and market data.

**Architecture:** First remove scheduler, commands, routes, settings and connector code so no terminal process can race the reset. Then factor full backup verification into a reusable native helper and implement an explicit reset command with exact FK-safe deletes and postconditions. Expose the destructive action behind a phrase-confirmed AlertDialog, execute it once against the productive local database, and compare preserve-table fingerprints before and after.

**Tech Stack:** Rust 2024, SQLx/SQLite, Tauri 2, ZIP/SHA-256 backup infrastructure, React 19, TypeScript strict mode, Radix AlertDialog, TanStack Query, Vitest, native Tauri runtime.

## Global Constraints

- Product changes stay in `apps/desktop` and follow `docs/superpowers/specs/2026-08-14-journal-account-isolation-html-import-design.md`.
- „MT5 komplett deaktiviert“ includes journal sync, account linking, automatic detection, Live Chart and the embedded Python connector.
- Historical migration `0023_mt5_account_sync.sql` is immutable; runtime code stops using its tables.
- A journal reset never runs unless a newly created full backup passes manifest, entry SHA-256, SQLite-header and `PRAGMA quick_check` verification.
- The destructive reset is an explicit command with the exact confirmation phrase `JOURNAL ZURÜCKSETZEN`.
- Macro, EODHD, COT, rates, seasonality, market candles and Put/Call data are never deleted or altered.
- Reusable journal definitions and physical media originals remain; event/link data, accounts, reviews, goals, imports and MT5 rows are removed.
- The native and browser automatic `Hauptkonto` seeds are removed; zero accounts remain zero after restart.
- Existing uncommitted Put/Call changes belong to the user. Never stage, commit, overwrite or reformat them; record task diff/test evidence instead of blanket git staging.

---

### Task 1: Remove all MT5 and Live Chart runtime surfaces

**Files:**

- Delete: `apps/desktop/src-tauri/src/commands/mt5_sync.rs`
- Delete: `apps/desktop/src-tauri/src/commands/market.rs`
- Delete: `apps/desktop/src-tauri/connectors/blackbull_mt5_connector.py`
- Delete: `apps/desktop/src/features/market/market-page.tsx`
- Modify: `apps/desktop/src-tauri/src/commands/mod.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src-tauri/src/commands/system.rs`
- Modify: `apps/desktop/src/App.tsx`
- Modify: `apps/desktop/src/components/layout/app-shell.tsx`
- Modify: `apps/desktop/src/features/settings/settings-page.tsx`
- Modify: `apps/desktop/src/types/domain.ts`
- Modify: `apps/desktop/src/services/commands.ts`
- Modify: relevant market browser service files and imports
- Modify: `apps/desktop/package.json` / lockfile only for dependencies proven exclusive to Live Chart
- Modify: `README.md`, `apps/desktop/README.md`, `.env.example`
- Test: add/update routing, navigation and settings tests

**Interfaces:**

- Removes all `get_mt5_accounts`, `link_mt5_account`, `unlink_mt5_account`, `sync_mt5_now` and Market command contracts.
- Removes `/market` and `Live Chart` navigation.
- `Account` no longer exposes broker snapshot/login/server fields.

- [ ] **Step 1: Add failing absence/runtime tests**

Add frontend tests asserting no `Live Chart` link, no `/market` route and no `MetaTrader 5` settings tab. Add a native source/registration test or compile-time assertion that the Tauri handler contains none of the removed commands and no scheduler task invokes `scheduled_mt5_sync`.

- [ ] **Step 2: Run focused tests and capture red**

Run the new UI tests and a native `cargo check`; expect the absence assertions to fail while MT5 remains registered.

- [ ] **Step 3: Remove scheduler, command modules and connector**

Delete both native modules and connector, remove `mod`/`pub use` and handler registrations, and remove the 10-second Tokio loop from `lib.rs`. Preserve unrelated EODHD schedulers and uncommitted Put/Call handler entries.

- [ ] **Step 4: Remove MT5 account projections**

Simplify bootstrap/account SELECTs in `system.rs` to local account fields only. Remove `brokerBalanceMinor`, `brokerEquityMinor`, `brokerSyncedAt`, `brokerLogin` and `brokerServer` from Rust/TypeScript models and all UI references. `currentBalanceMinor` remains local initial balance + cashflows + closed journal P&L.

- [ ] **Step 5: Remove Live Chart/settings/frontend services**

Remove route, navigation, lazy import, settings section, Market/MT5 facade methods/types and native-only fallback modules. Remove `lightweight-charts` only after `rg` proves no remaining consumer. Do not remove market/seasonality SQLite tables.

- [ ] **Step 6: Update docs and empty environment examples**

Delete the BlackBull MT5 Live Chart setup section and `BLACKBULL_MT5_*` variables. Document the manual HTML report workflow only after Task 3 of the HTML-import plan provides it.

- [ ] **Step 7: Run focused checks to green**

Run UI absence tests, `pnpm typecheck`, `cargo check`, and `rg -n "scheduled_mt5_sync|sync_mt5_now|link_mt5_account|/market|Live Chart|BLACKBULL_MT5"` over product source/docs. Remaining matches are allowed only in immutable migration/history/specification text, not runtime code.

- [ ] **Step 8: Record evidence without staging unrelated work**

Document deleted/modified paths and outputs. Confirm no Macro/EODHD/COT/Seasonality/Put-Call module or registration was removed.

### Task 2: Remove automatic account seeds

**Files:**

- Modify: `apps/desktop/src-tauri/src/database/mod.rs`
- Modify: `apps/desktop/src/services/browser-adapter.ts`
- Modify: `apps/desktop/src/services/browser-adapter.test.ts`
- Add native database initialization tests if absent

**Interfaces:**

- `seed_defaults` still seeds setup/emotion/mistake definitions but never inserts an account.
- Browser bootstrap starts with `accounts: []` unless a test/user explicitly creates one.

- [ ] **Step 1: Add failing empty-restart tests**

Initialize a fresh temporary database twice and assert `SELECT COUNT(*) FROM accounts` is zero after both starts while default setups/emotions/mistakes exist. Clear browser storage, initialize twice and assert `browserBootstrap.accounts` stays empty.

- [ ] **Step 2: Run tests and capture red**

Run the new native seed test and `pnpm test -- browser-adapter.test.ts`; expect `Hauptkonto` to make them fail.

- [ ] **Step 3: Remove only account seeds**

Delete the native `account_count`/`INSERT INTO accounts` block and the browser default account object. Preserve all taxonomy seeds and account creation commands.

- [ ] **Step 4: Run tests to green and record evidence**

Repeat Step 2 and prove fresh/restarted databases remain accountless.

### Task 3: Verified backup helper and transactional reset command

**Files:**

- Modify: `apps/desktop/src-tauri/src/commands/data_transfer.rs`
- Create: `apps/desktop/src-tauri/src/commands/journal_reset.rs`
- Modify: `apps/desktop/src-tauri/src/commands/mod.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Test: colocated temporary-directory/database tests

**Interfaces:**

- Produces:

```rust
pub(crate) fn verify_backup_archive(path: &Path) -> Result<VerifiedBackup, AppError>;

pub async fn reset_journal(
    state: State<'_, AppState>,
    confirmation: String,
) -> CommandResult<JournalResetResult>;
```

- `JournalResetResult` exposes `backupPath`, deleted row counts, preserved table counts and `completedAt`.

- [ ] **Step 1: Add failing backup-verification tests**

Create a real backup of a temporary app state and assert the helper reopens the ZIP, validates every manifest entry size/SHA, verifies the staged DB begins with `SQLite format 3\0`, and returns `quick_check = ok`. Corrupt one byte and assert verification fails before any reset callback can run.

- [ ] **Step 2: Add failing reset safety tests**

Populate every journal table category, all six MT5 tables, new MetaTrader import tables, media definitions, reusable taxonomies and representative Macro/COT/EODHD/Seasonality/Put-Call rows. Assert wrong confirmation and backup failure leave every count unchanged.

- [ ] **Step 3: Add failing successful-reset test**

Call the helper with `JOURNAL ZURÜCKSETZEN` and assert exact zero counts for accounts/cashflows, trades and children, MT5 tables, reviews, goals/progress, metric snapshots, import runs/rows, source bindings/links, trade custom values/tombstones and saved account filters/views. Assert reusable definitions, media/annotations, exports/backups and every Macro/market fixture row and value are byte-for-byte unchanged.

- [ ] **Step 4: Run focused native tests and capture red**

Run:

```powershell
cd D:\Macrotool\apps\desktop\src-tauri
cargo test journal_reset --lib -- --nocapture
```

Expected: failure because verification/reset helpers do not exist.

- [ ] **Step 5: Extract side-effect-free backup verification**

Reuse the existing restore manifest/hash rules without staging a pending restore. Read bounded ZIP entries, reject duplicate/unsafe paths and extra or missing files, compare sizes/SHA-256, copy only the database entry to a unique temporary directory for SQLite `quick_check`, then delete that exact temporary directory.

- [ ] **Step 6: Implement FK-safe reset in `BEGIN IMMEDIATE`**

After successful fresh backup verification and exact phrase matching, execute explicit SQL in this order:

```text
mt5_sync_runs -> mt5_accounts (cascades MT5 children)
metatrader_trade_links -> metatrader_import_sources
custom_field_values for trade/review/goal
deleted_items for trade/review/goal
trades (cascades all trade children/context/media links)
reviews -> goals (cascades progress) -> metric_snapshots
import_runs (cascades import_rows)
saved_filters -> saved_views
accounts (cascades cashflows)
```

Run `PRAGMA foreign_key_check` before commit and abort on any row. Do not delete `media_files`, `media_annotations`, `export_runs`, backup files, definitions or any Macro/market table.

- [ ] **Step 7: Verify postconditions after commit**

Run `PRAGMA quick_check`, re-read all reset-table counts and compare preserved table counts/fingerprints captured before mutation. Return the verified backup path and counts. If post-commit quick check fails, surface a critical error with the backup path; never claim success.

- [ ] **Step 8: Register command and run tests to green**

Register `reset_journal` without disturbing Put/Call commands. Run Step 4 plus `cargo fmt --all -- --check` and record evidence.

### Task 4: Phrase-confirmed reset UI and cache/store cleanup

**Files:**

- Modify: `apps/desktop/src/types/domain.ts`
- Modify: `apps/desktop/src/services/commands.ts`
- Modify: `apps/desktop/src/features/import-export/import-export-page.tsx`
- Create: `apps/desktop/src/features/import-export/journal-reset-dialog.tsx`
- Create: `apps/desktop/src/features/import-export/journal-reset-dialog.test.tsx`
- Modify: `apps/desktop/src/stores/ui-store.ts`

**Interfaces:**

- Produces `api.resetJournal(confirmation: string): Promise<JournalResetResult>`.
- Browser mode rejects with `DESKTOP_REQUIRED`.
- Success sets `selectedJournalAccountId` to null, clears account-bearing persisted/saved state and invalidates journal/bootstrap query keys only.

- [ ] **Step 1: Add failing destructive-UX tests**

Assert the command is not called when the dialog opens, confirmation text differs, dialog is cancelled or backup/error response occurs. Assert the enabled button requires exact `JOURNAL ZURÜCKSETZEN`. On success assert backup path is shown, selection clears and relevant caches invalidate.

- [ ] **Step 2: Run focused test and capture red**

Run `pnpm test -- journal-reset-dialog.test.tsx`; expect missing UI/facade failures.

- [ ] **Step 3: Implement the Danger Zone UI**

Add a clearly separated `Journal zurücksetzen` action to Import/Export or Settings data management. Use Radix AlertDialog, explain exactly what is deleted/preserved, require the exact phrase and disable close/duplicate submissions while running. Never display a success state until native verification returns.

- [ ] **Step 4: Implement facade and success cleanup**

Call Tauri only in Desktop mode. On success clear selected account, discard guided-trade/import previews, remove account-bearing browser/saved filters, invalidate `bootstrap`, `trades`, `dashboard`, `calendar`, `analytics`, `reviews`, `playbook`, `mistakes` and `goals`, and retain Macro/market caches.

- [ ] **Step 5: Run focused tests to green**

Run Step 2 plus `pnpm typecheck`; record results.

### Task 5: Full verification and productive journal reset

**Files:**

- No product source edits unless verification identifies a defect.
- Productive data target: `%APPDATA%\com.personal-macro.app\PersonalMacro`, never a repository path.

**Interfaces:**

- Consumes the verified reset command/UI.
- Produces a verified backup plus a product database with zero journal accounts/event data and unchanged preserve fingerprints.

- [ ] **Step 1: Run complete source verification before touching productive data**

Run:

```powershell
cd D:\Macrotool\apps\desktop
pnpm typecheck
pnpm test
pnpm lint
pnpm format:check
pnpm build
cd D:\Macrotool\apps\desktop\src-tauri
cargo fmt --all -- --check
cargo test
cargo clippy --all-targets -- -D warnings
```

Do not proceed to productive data unless all relevant checks exit zero or every unrelated pre-existing failure is isolated and reported.

- [ ] **Step 2: Start the real Tauri application and verify disabled MT5 runtime**

Run `pnpm tauri dev`. Confirm startup has no MT5 scheduler/connector log, Live Chart and MT5 settings are absent, Macro/Research pages still load, and the journal account selector appears with the current pre-reset accounts.

- [ ] **Step 3: Ensure exactly one application instance owns the database**

Resolve the debug executable path and confirm only the currently controlled
`D:\Macrotool\apps\desktop\src-tauri\target\debug\personal-macro-desktop.exe`
instance is running. Stop any older instance only by its verified executable
path before starting the controlled instance. Do not terminate unrelated Node,
Python, MetaTrader or desktop processes. The reset command runs inside the
controlled Tauri process and owns its SQLite transaction.

- [ ] **Step 4: Capture productive preserve fingerprints and create/verify backup**

Using the implemented native reset path, record counts and deterministic SHA-256 fingerprints for all preserved Macro/COT/EODHD/Rates/Seasonality/Market/Put-Call tables. Create a fresh backup with a unique name and verify manifest, entries and SQLite integrity. Report only backup filename/path and structural counts, never personal row values.

- [ ] **Step 5: Execute the authorized reset exactly once in the controlled app**

Use the phrase-confirmed UI/native command against the productive app state.
Do not use a broad filesystem delete or delete the AppData directory.

- [ ] **Step 6: Verify productive postconditions**

Assert all reset-table counts are zero, all preserve fingerprints exactly match Step 4, `foreign_key_check` returns no rows and `quick_check` returns `ok`. Verify the backup still exists and its SHA-256 matches the pre-reset verification.

- [ ] **Step 7: Stop the verified debug process and restart the real app**

Stop only the exact verified debug executable, start `pnpm tauri dev` again,
and confirm the Journal shows no account and no account-derived query/data,
the selector offers account creation, and Macro/COT/EODHD/Rates/Seasonality/
Put-Call data remain visible.

- [ ] **Step 8: Final privacy/diff audit**

Run `git status --short`, `git diff --check`, secret/path searches and confirm no personal HTML, SQLite database, backup, export or AppData path content was added to the repository. Separate all pre-existing Put/Call hunks from this feature's report.
