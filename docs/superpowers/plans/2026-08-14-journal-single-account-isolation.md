# Journal Single-Account Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one explicitly selected active journal account the mandatory scope for every journal query, mutation, metric and account-derived workspace statistic.

**Architecture:** Add a reusable native account-scope guard and require an `accountId` argument at every account-derived command boundary. Replace the persisted account-ID array with a single validated selection, expose it through a provider/selector/gate trio, and compose the selector into all journal page headers. Global definitions remain global while every statistic joins through the selected account.

**Tech Stack:** Rust 2024, SQLx/SQLite, Tauri 2, React 19, TypeScript strict mode, Zustand persist, TanStack Query, Radix Select, Vitest/Testing Library.

## Global Constraints

- Product changes stay in `apps/desktop`; `apps/api` and `apps/web` remain untouched.
- Follow `docs/superpowers/specs/2026-08-14-journal-account-isolation-html-import-design.md`.
- Exactly one active account is allowed; no empty account list may mean “all accounts”.
- Without a valid selected account, account-derived queries and mutations do not execute.
- Macro, COT, EODHD, rates, seasonality, research and reusable journal definitions remain unchanged.
- Browser and native paths must expose the same account-isolation semantics.
- German user copy, existing design tokens and accessible keyboard/focus behavior are required.
- Existing uncommitted Put/Call changes belong to the user. Never stage, commit, overwrite or reformat them. Because the user approved in-place work, record task diffs and test evidence in the SDD report instead of running blanket `git add` or `git commit` commands.

---

### Task 1: Native account guard, trade boundaries and account-scoped reviews

**Files:**

- Create: `apps/desktop/src-tauri/migrations/0034_account_scoped_reviews.sql`
- Create: `apps/desktop/src-tauri/src/commands/journal_scope.rs`
- Modify: `apps/desktop/src-tauri/src/commands/mod.rs`
- Modify: `apps/desktop/src-tauri/src/domain/models.rs`
- Modify: `apps/desktop/src-tauri/src/commands/analytics.rs`
- Modify: `apps/desktop/src-tauri/src/commands/trades.rs`
- Modify: `apps/desktop/src-tauri/src/commands/workspace.rs`
- Modify: `apps/desktop/src-tauri/src/repositories/trades.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Test: colocated Rust test modules in the changed files using temporary databases

**Interfaces:**

- Produces: `require_active_account(db: &SqlitePool, account_id: &str) -> CommandResult<()>`.
- Produces: `scope_trade_filter(account_id: &str, filter: Option<TradeFilter>) -> TradeFilter`, which always replaces client-supplied `account_ids` with exactly `vec![account_id.to_owned()]`.
- Changes: `calculate_dashboard`, `calculate_calendar`, `list_trades`, `list_deleted_trades`, `get_trade`, `trash_trade`, `restore_trade` and `duplicate_trade` receive an explicit camelCase Tauri argument `accountId`.
- Changes: `TradeInput.account_id` is required for new and updated trades.
- Changes: `ReviewRecord` and `ReviewInput` expose `accountId`; `list_reviews(accountId)` and `save_review(input.accountId)` validate the active account.

- [ ] **Step 1: Add failing two-account native tests**

Create temporary databases with active accounts `account-a` and `account-b`, one positive closed trade in A and one negative closed trade in B. Add tests equivalent to:

```rust
let response = calculate_dashboard_for_pool(&pool, "account-a", None).await?;
assert_eq!(response.metrics.total_trades, 1);
assert_eq!(response.metrics.net_pnl_minor, 12_500);

let error = calculate_dashboard_for_pool(&pool, "", None).await.unwrap_err();
assert_eq!(error.code, "ACCOUNT_REQUIRED");
```

Also prove archived/unknown accounts fail, calendar contains only A, recent/listed/deleted trades cannot cross account boundaries, and a trade write without an account fails.

- [ ] **Step 2: Run the focused Rust tests and capture the expected red state**

Run:

```powershell
cd D:\Macrotool\apps\desktop\src-tauri
cargo test account_scope --lib -- --nocapture
```

Expected: failure because the guard and required account command signatures do not exist or because B data leaks into A.

- [ ] **Step 3: Add the upgrade-safe review migration**

Rebuild `reviews` without deleting existing rows. The replacement schema contains nullable migration-era `account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE` and:

```sql
UNIQUE(account_id, review_type, period_start, period_end)
```

Copy all old columns with `account_id = NULL`, drop the old table, rename the replacement and add `idx_reviews_account_period(account_id, period_start DESC)`. Do not put the user-authorized journal reset into this migration.

- [ ] **Step 4: Implement the shared native guard**

In `journal_scope.rs`, normalize whitespace and return stable command errors:

```rust
pub(crate) async fn require_active_account(
    db: &SqlitePool,
    account_id: &str,
) -> CommandResult<()>;

pub(crate) fn scope_trade_filter(
    account_id: &str,
    filter: Option<TradeFilter>,
) -> TradeFilter;
```

`require_active_account` returns `ACCOUNT_REQUIRED` for blank input and `ACCOUNT_NOT_FOUND` unless `accounts.id = ? AND is_archived = 0` exists. Add constructors to `CommandError` only if stable custom codes are not already supported.

- [ ] **Step 5: Enforce the account at analytics and trade command boundaries**

Validate first, call `scope_trade_filter`, then reuse the canonical repository/metrics implementation. Never accept the account list supplied inside `filter`. Add `account_id: String` to read, trash, restore and duplicate commands and include `AND account_id = ?` in their native repository paths. Make `TradeInput.account_id: String`; reject archived accounts before insert/update.

- [ ] **Step 6: Make reviews account-scoped**

Add `account_id` to Rust records/inputs and every SELECT/INSERT/UPDATE. `list_reviews` filters `WHERE account_id = ?`. Updating an existing review includes `AND account_id = ?`, so an ID from another account cannot be overwritten. Preserve migration-era null rows but never return them to a scoped list.

- [ ] **Step 7: Run the focused native tests to green**

Run:

```powershell
cd D:\Macrotool\apps\desktop\src-tauri
cargo test account_scope --lib -- --nocapture
```

Expected: all new two-account, missing-account, archived-account and review uniqueness tests pass.

- [ ] **Step 8: Record task evidence without committing unrelated work**

Write the exact changed paths, `git diff --check` output and focused test result to the task report. Do not stage the pre-existing `lib.rs`, Cargo, `commands.ts`, `domain.ts` or Put/Call hunks.

### Task 2: Single selected-account store, provider, selector and gate

**Files:**

- Create: `apps/desktop/src/features/accounts/journal-account-context.tsx`
- Create: `apps/desktop/src/features/accounts/journal-account-selector.tsx`
- Create: `apps/desktop/src/features/accounts/journal-account-gate.tsx`
- Create: `apps/desktop/src/features/accounts/journal-account-context.test.tsx`
- Create: `apps/desktop/src/components/ui/journal-page-header.tsx`
- Modify: `apps/desktop/src/stores/ui-store.ts`
- Modify: `apps/desktop/src/App.tsx`
- Modify: `apps/desktop/src/styles/globals.css`

**Interfaces:**

- Produces store fields:

```ts
selectedJournalAccountId: string | null;
setSelectedJournalAccountId: (accountId: string | null) => void;
```

- Produces `useJournalAccount()` with `{ status, accounts, selectedAccountId, selectedAccount, selectAccount }`.
- Produces `JournalAccountSelector`, `JournalAccountGate` and `JournalPageHeader`.
- Consumes only `api.bootstrap()` through query key `["bootstrap"]`.

- [ ] **Step 1: Add failing Zustand migration tests**

Test pure persisted-state migration for:

```ts
expect(migrate({ globalAccountIds: ["a"] }, 0).selectedJournalAccountId).toBe("a");
expect(migrate({ globalAccountIds: [] }, 0).selectedJournalAccountId).toBeNull();
expect(migrate({ globalAccountIds: ["a", "b"] }, 0).selectedJournalAccountId).toBeNull();
```

Also assert `globalAccountIds` is absent from the migrated state.

- [ ] **Step 2: Add failing provider/selector/gate tests**

Use a QueryClient test wrapper and assert:

```tsx
expect(screen.getByRole("combobox", { name: "Tradingkonto" })).toBeVisible();
expect(screen.getByText("Noch kein Tradingkonto")).toBeVisible();
```

Cover `noAccounts`, `selectionRequired`, `ready`, invalid persisted ID clearing, keyboard selection and the management link `/settings?section=accounts`. A single pre-existing account without a persisted choice remains `selectionRequired`; only explicit selection or successful account creation selects it.

- [ ] **Step 3: Run the focused frontend tests and capture red**

Run:

```powershell
cd D:\Macrotool\apps\desktop
pnpm test -- journal-account-context.test.tsx
```

Expected: failure because the new context/components and single-ID store do not exist.

- [ ] **Step 4: Replace the persisted multi-account store**

Bump the Zustand persist version, export a pure migration function for tests and remove `globalAccountIds`, `toggleGlobalAccount`, and any additive-selection helper. Do not infer a selection from `accounts[0]`.

- [ ] **Step 5: Implement provider validation without transient all-account requests**

The provider returns:

```ts
type JournalAccountStatus =
  | "loading"
  | "noAccounts"
  | "selectionRequired"
  | "ready";
```

On bootstrap success, clear an unknown/archived selection in an effect. Do not expose `ready` until `selectedJournalAccountId` matches an active account. Wrap AppShell, command palette and global trade dialogs in the provider.

- [ ] **Step 6: Implement the uniform visual selector and gate**

Use Radix Select and existing tokens. The trigger contains an account/wallet icon, the label `Tradingkonto`, current account name and chevron. The menu contains only active accounts plus `Konten verwalten`. The gate renders existing `EmptyState` with `Tradingkonto anlegen` when status is `noAccounts`, and `Tradingkonto auswählen` when selection is required.

- [ ] **Step 7: Implement `JournalPageHeader` composition**

Keep `PageHeader` presentational. `JournalPageHeader` prepends `<JournalAccountSelector />` to passed actions so pages cannot reorder it behind local period/filter controls.

- [ ] **Step 8: Run focused tests to green and record evidence**

Run:

```powershell
cd D:\Macrotool\apps\desktop
pnpm test -- journal-account-context.test.tsx
pnpm typecheck
```

Expected: focused tests and typecheck pass. Record paths and output in the task report without staging unrelated changes.

### Task 3: Scope Dashboard, Trades, Calendar, Analytics and trade dialogs

**Files:**

- Modify: `apps/desktop/src/types/domain.ts`
- Modify: `apps/desktop/src/services/commands.ts`
- Modify: `apps/desktop/src/services/browser-adapter.ts`
- Modify: `apps/desktop/src/services/browser-adapter.test.ts`
- Modify: `apps/desktop/src/features/dashboard/dashboard-page.tsx`
- Modify: `apps/desktop/src/features/trades/trades-page.tsx`
- Modify: `apps/desktop/src/features/trades/trash-dialog.tsx`
- Modify: `apps/desktop/src/features/trades/quick-trade-dialog.tsx`
- Modify: `apps/desktop/src/features/trades/guided-trade-dialog.tsx`
- Modify: `apps/desktop/src/features/trades/trade-detail-dialog.tsx`
- Modify: `apps/desktop/src/features/calendar/calendar-page.tsx`
- Modify: `apps/desktop/src/features/analytics/analytics-page.tsx`
- Modify: `apps/desktop/src/features/analytics/analytics-page.test.tsx`
- Modify: `apps/desktop/src/features/import-export/import-export-page.tsx`
- Add focused page/component tests beside the changed features where absent

**Interfaces:**

- Consumes `useJournalAccount`, `JournalAccountGate` and `JournalPageHeader` from Task 2.
- Changes API facade signatures to place `accountId: string` first for dashboard, calendar and all trade operations.
- Changes TypeScript `TradeInput.accountId` to required.

- [ ] **Step 1: Add failing facade/browser isolation tests**

Test that `browserListTrades({ accountIds: ["a"] })`, `browserDashboard({ accountIds: ["a"] })`, deleted trades and duplicate/restore paths cannot return B. Add a no-account facade test that rejects rather than calling a browser adapter with `{}`.

- [ ] **Step 2: Add failing page-query tests**

Mock `useJournalAccount` as `selectionRequired` and assert `api.dashboard`, `api.listTrades` and `api.calendar` are not called. Then render as account A, switch to B and assert query keys and arguments contain only the respective account.

- [ ] **Step 3: Run focused frontend tests and capture red**

Run:

```powershell
cd D:\Macrotool\apps\desktop
pnpm test -- browser-adapter.test.ts analytics-page.test.tsx
```

Expected: failure from missing required account APIs or existing cross-account browser behavior.

- [ ] **Step 4: Update domain and command-facade contracts**

Use explicit signatures:

```ts
dashboard(accountId: string, filter?: Omit<TradeFilter, "accountIds">): Promise<DashboardResponse>;
calendar(accountId: string, filter?: Omit<TradeFilter, "accountIds">): Promise<CalendarDay[]>;
listTrades(accountId: string, filter?: Omit<TradeFilter, "accountIds">): Promise<PagedTrades>;
deletedTrades(accountId: string): Promise<DeletedTrade[]>;
getTrade(accountId: string, id: string): Promise<TradeDetail>;
```

Apply the same account-first form to trash, restore and duplicate. The facade builds exactly `accountIds: [accountId]` only where the browser adapter still consumes `TradeFilter`; Tauri calls pass `{ accountId, filter }`.

- [ ] **Step 5: Convert all four page families to the account gate**

Replace `PageHeader` with `JournalPageHeader`; wrap account-dependent content/actions in `JournalAccountGate`; include `accountId` in every query key and set `enabled: status === "ready"`. Dashboard Recent Trades must use the same ID as metrics. Calendar month/year queries share it. Analytics renders only the selected account's capital and removes account grouping.

- [ ] **Step 6: Make trade creation and dialogs account-fixed**

Quick/Guided forms receive the selected account and do not render `Nicht zugeordnet` or an alternative account selector. Remove all `accounts[0]` fallbacks. Reset/discard the guided draft when its stored account differs from the current selection. Position sizing takes only `selectedAccount`. Detail, trash, restore and duplicate verify the account argument.

The existing CSV/XLS/XLSX/JSON trade importer also requires and passes the
selected `accountId`; it must never call `createTrade` with
`accountId: undefined`. Its existing row-by-row behavior is not redesigned in
this plan, but it is blocked without a ready account.

- [ ] **Step 7: Make the browser adapter reject missing accounts**

Use a shared assertion that exactly one nonblank `accountIds` value exists for journal metrics and trade lists. Browser demo initialization no longer creates a default `Hauptkonto`; tests insert their own accounts explicitly.

- [ ] **Step 8: Run focused tests to green and record evidence**

Run:

```powershell
cd D:\Macrotool\apps\desktop
pnpm test -- browser-adapter.test.ts analytics-page.test.tsx
pnpm typecheck
```

Expected: page, adapter and type tests pass with no accountless call path.

### Task 4: Scope Reviews, Playbook and Mistake Analytics

**Files:**

- Modify: `apps/desktop/src/types/domain.ts`
- Modify: `apps/desktop/src/services/commands.ts`
- Modify: `apps/desktop/src/services/workspace-browser.ts`
- Modify: `apps/desktop/src/features/reviews/reviews-page.tsx`
- Modify: `apps/desktop/src/features/playbook/playbook-page.tsx`
- Modify: `apps/desktop/src/features/mistakes/mistakes-page.tsx`
- Add: focused tests beside each feature and/or `workspace-browser.test.ts`
- Modify: `apps/desktop/src-tauri/src/commands/workspace.rs` tests/queries not completed in Task 1

**Interfaces:**

- `api.reviews(accountId: string)` and `ReviewInput.accountId: string`.
- `api.playbook(accountId?: string)` returns global definitions; with an active account it adds account-specific `tradeCount`, without one `tradeCount` is `null` and no trade aggregate query runs.
- `api.mistakeAnalytics(accountId: string)` returns global definitions with account-specific occurrences/cost/severity.

- [ ] **Step 1: Add failing two-account workspace tests**

Create one setup and one mistake used by trades in A and B. Assert the definition exists in both account responses but counts/costs reflect only the requested account. Assert the no-account Playbook response contains the definition with `tradeCount = null` and performs no trade aggregate. Add browser-equivalent tests. Add review list/save tests proving the same period can exist once in A and once in B.

- [ ] **Step 2: Run focused tests and capture red**

Run:

```powershell
cd D:\Macrotool\apps\desktop\src-tauri
cargo test workspace_account_scope --lib -- --nocapture
cd D:\Macrotool\apps\desktop
pnpm test -- workspace-browser
```

Expected: global counts or missing account arguments fail the assertions.

- [ ] **Step 3: Filter native workspace aggregates**

For Playbook, accept `account_id: Option<String>`: validate it when present,
keep the setup query global, and calculate the correlated trade count only for
`t.account_id = ?`; when absent return `trade_count = NULL` without querying a
trade aggregate. Change `PlaybookSetup.trade_count` to nullable. Mistakes always
requires and validates an account, joins `trade_mistakes tm` through `trades t`
with `t.account_id = ? AND t.is_deleted = 0`, and preserves zero rows for unused
global mistake definitions.

- [ ] **Step 4: Match browser semantics**

Remove fake constant zeros. Compute counts/costs from browser trades filtered to the exact account. Reviews persist and list an `accountId`, and updates cannot move a review to another account.

- [ ] **Step 5: Convert all three pages**

Use `JournalPageHeader`. Reviews and Mistakes wrap account-derived content in
the gate. Review snapshot calls `api.dashboard(accountId, { dateFrom:
periodStart, dateTo: periodEnd })`. Query keys include account ID. Playbook
always loads global definitions via `api.playbook(selectedAccountId ??
undefined)`; definitions remain editable without an account and `tradeCount`
renders as `–`/not available rather than zero.

- [ ] **Step 6: Run native/frontend focused tests to green**

Run the commands from Step 2 plus `pnpm typecheck`. Record results without staging unrelated changes.

### Task 5: Account lifecycle, saved state and cross-page regression verification

**Files:**

- Modify: `apps/desktop/src/features/settings/settings-page.tsx`
- Modify: `apps/desktop/src/components/layout/command-palette.tsx`
- Modify: `apps/desktop/src/features/import-export/import-export-page.tsx` only for account-bound trade export wiring
- Modify/create relevant focused tests
- Review all files changed in Tasks 1–4

**Interfaces:**

- Successful `saveAccount` calls `setSelectedJournalAccountId(saved.id)`.
- Archiving the selected account clears selection after bootstrap invalidation.
- Command palette/search and trade export receive the selected account.

- [ ] **Step 1: Add failing lifecycle and peripheral tests**

Prove new-account creation selects the returned ID, archive clears it, command-palette trade results do not include another account and export receives exactly the selected account. Prove account IDs in saved dashboard filters are ignored/removed.

- [ ] **Step 2: Run the new tests and capture red**

Run the exact new test files with `pnpm test -- <files>` and save the failing output in the report.

- [ ] **Step 3: Wire lifecycle and peripheral consumers**

Set the new selection only after account mutation success. Include it in command palette/trade search and export. When applying old saved views, discard `accountIds` so they cannot override the global account.

- [ ] **Step 4: Run the complete account-isolation test set**

Run:

```powershell
cd D:\Macrotool\apps\desktop
pnpm typecheck
pnpm test
cd D:\Macrotool\apps\desktop\src-tauri
cargo test account_scope --lib -- --nocapture
cargo test workspace_account_scope --lib -- --nocapture
cargo test repositories::trades --lib -- --nocapture
```

Expected: all commands exit zero.

- [ ] **Step 5: Review the diff against the specification**

Verify all seven requested pages show the same selector; there is no `globalAccountIds`, no `accounts[0]` account fallback, no account field inside the Dashboard filter, and no `api.dashboard({})`, `api.reviews()`, `api.playbook()` or `api.mistakeAnalytics()` call. Run `git diff --check` and document any unrelated pre-existing hunks separately.

### Task 6: Protect trade-owned context, mistakes and media boundaries

**Files:**

- Modify: `apps/desktop/src-tauri/src/commands/journal.rs`
- Modify: `apps/desktop/src-tauri/src/commands/workspace.rs`
- Modify: `apps/desktop/src-tauri/src/commands/media.rs`
- Modify: `apps/desktop/src/services/commands.ts`
- Modify: `apps/desktop/src/services/workspace-browser.ts`
- Modify: `apps/desktop/src/features/trades/trade-detail-dialog.tsx`
- Add: colocated native and frontend/browser boundary tests

**Interfaces:**

- Every command that reads or mutates a trade-owned child receives
  `accountId` and verifies `trades.id = tradeId AND account_id = accountId`.
- Applies to trade context, checklist/tags/emotions/custom values, trade
  mistakes, and trade-media list/attach/detach operations.
- Global media library and annotations remain account-independent; only the
  association to a trade is scoped.

- [ ] **Step 1: Add failing cross-account child-resource tests**

Create trades A and B. With account A, assert `get_trade_context`,
`save_trade_context`, `list_trade_mistakes`, `assign_trade_mistake`,
`list_trade_media`, `attach_trade_media` and `detach_trade_media` all reject
trade B and leave its rows unchanged. Add equivalent browser tests for context
and mistake operations.

- [ ] **Step 2: Run focused tests and capture red**

Run the new native test filter `trade_child_account_scope` and matching Vitest
file; expect existing unscoped commands to permit B or lack the argument.

- [ ] **Step 3: Add one shared trade-ownership guard**

Extend `journal_scope.rs` with:

```rust
pub(crate) async fn require_trade_in_account(
    db: &SqlitePool,
    account_id: &str,
    trade_id: &str,
) -> CommandResult<()>;
```

It first validates the active account, then returns `NOT_FOUND` unless the
trade belongs to it. Do not reveal whether a foreign trade ID exists.

- [ ] **Step 4: Guard every native child-resource command**

Add camelCase `accountId` arguments or required input fields and invoke the
shared guard before reads or transactions. Include the account predicate in
the mutating SQL where practical so the guard is defense in depth rather than
the only protection.

- [ ] **Step 5: Match frontend and browser contracts**

Change facade methods to account-first signatures and pass the selected ID
from Trade Detail. Browser helpers verify the stored trade's account before
returning or mutating context/mistakes/media associations.

- [ ] **Step 6: Run focused and regression tests to green**

Run the Step 2 tests, `pnpm typecheck`, and `cargo test account_scope --lib --
--nocapture`. Record results and verify no account-independent media annotation
or library operation was unnecessarily removed.
