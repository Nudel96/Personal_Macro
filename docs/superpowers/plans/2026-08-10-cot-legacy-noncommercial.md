# COT Legacy Non-Commercial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the active COT cohort and scoring basis with CFTC Legacy Futures Only Non-Commercial long-share data while preserving prior provider caches and keeping pair scoring auditable.

**Architecture:** Add an isolated, provenance-rich Legacy observation store beside the existing TFF/Disaggregated cache. The Rust COT command becomes the only active reader/writer for the Legacy series, derives weekly and long-horizon signals from `long / (long + short)`, and exposes explicit fields to the existing TypeScript facade. React renders the new source, group, unit, and ranking without introducing browser mocks.

**Tech Stack:** Rust 2024, Tauri 2, SQLx/SQLite migrations, Reqwest/Socrata CFTC API, React 19, TypeScript strict mode, TanStack Query, Vitest/Testing Library.

## Global Constraints

- Product code changes belong in `apps/desktop`; do not modify `apps/api` or `apps/web`.
- Active source is CFTC dataset `6dca-aqww`, report `Legacy Futures Only`, participant group `Non-Commercial`.
- Weekly change is `long_share[t] - long_share[t - 1]`, where `long_share = long / (long + short)`.
- Active scoring version is exactly `cot-v4-legacy-noncommercial`.
- TFF and Disaggregated data may remain stored for provenance but must never be an active fallback.
- Existing ten-day COT freshness, history, gap, confirmation, quality, and pair antisymmetry rules remain in force.
- Missing prior week, incomplete rows, stale reports, and `long + short <= 0` are unavailable, never neutral.
- DOW uses CFTC contract code `124603`; no new market such as Platinum is added.
- Browser preview must not simulate successful CFTC data.
- Do not alter personal journal, trade, account, media, backup, or restore data.
- Preserve all pre-existing dirty-worktree changes. Files that were already untracked at task start must not be staged unless they are newly created by this plan.

---

## File Structure

- Create `apps/desktop/src-tauri/migrations/0031_cot_legacy_noncommercial.sql`: additive Legacy source/observation schema and per-contract Legacy code.
- Modify `apps/desktop/src-tauri/src/commands/cot.rs`: Legacy sync, parsing, v4 scoring, dashboard/detail contracts, migration/reference tests.
- Modify `apps/desktop/src/types/domain.ts`: explicit Legacy report family and long-share response fields.
- Create `apps/desktop/src/features/cot/cot-components.test.tsx`: observable ranking/source/unit tests for the COT overview.
- Modify `apps/desktop/src/features/cot/cot-components.tsx`: Legacy ranking and table fields.
- Modify `apps/desktop/src/features/cot/cot-page.tsx`: Legacy source/group copy and detail semantics.
- Modify `apps/desktop/src/features/macro/institutional-activity.test.ts`: Legacy-shaped fixtures.
- Modify `apps/desktop/src/features/macro/macro-page.test.tsx`: Legacy provenance and weekly change display assertions.
- Modify `apps/desktop/src/features/macro/macro-page.tsx`: weekly long-share change and COT-v4 provenance in Institutional Activity.

---

### Task 1: Add additive Legacy COT persistence

**Files:**
- Create: `apps/desktop/src-tauri/migrations/0031_cot_legacy_noncommercial.sql`
- Modify/Test: `apps/desktop/src-tauri/src/commands/cot.rs`

**Interfaces:**
- Consumes: existing `cot_contracts`, `cot_observations`, `cot_source_rows`, and `cot_evaluations` from migrations 0010, 0011, and 0015.
- Produces: nullable `cot_contracts.legacy_cftc_contract_market_code`, `cot_legacy_source_rows`, and `cot_legacy_observations` keyed by contract and report date.

- [ ] **Step 1: Write the failing schema test**

Add an async test in `commands::cot::tests` that calls `initialize_headless()`, inspects `PRAGMA table_info(cot_contracts)`, and asserts the Legacy code column and both Legacy tables exist:

```rust
#[tokio::test]
async fn migration_adds_isolated_legacy_cot_storage() {
    let state = crate::database::initialize_headless().await.unwrap();
    let columns: Vec<String> = sqlx::query_scalar(
        "SELECT name FROM pragma_table_info('cot_contracts') ORDER BY cid",
    )
    .fetch_all(&state.db)
    .await
    .unwrap();
    assert!(columns.iter().any(|name| name == "legacy_cftc_contract_market_code"));

    for table in ["cot_legacy_source_rows", "cot_legacy_observations"] {
        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?",
        )
        .bind(table)
        .fetch_one(&state.db)
        .await
        .unwrap();
        assert_eq!(count, 1, "missing table: {table}");
    }
}
```

- [ ] **Step 2: Verify the test fails for the missing migration**

Run: `cargo test commands::cot::tests::migration_adds_isolated_legacy_cot_storage -- --nocapture`

Expected: FAIL because the column and tables do not yet exist.

- [ ] **Step 3: Create migration 0031**

Use an additive migration; do not rebuild or delete existing COT tables:

```sql
ALTER TABLE cot_contracts
  ADD COLUMN legacy_cftc_contract_market_code TEXT;

CREATE UNIQUE INDEX idx_cot_contracts_legacy_code
  ON cot_contracts(legacy_cftc_contract_market_code)
  WHERE legacy_cftc_contract_market_code IS NOT NULL;

CREATE TABLE cot_legacy_source_rows (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES cot_contracts(id) ON DELETE CASCADE,
  report_date TEXT NOT NULL,
  report_family TEXT NOT NULL CHECK (report_family = 'legacy'),
  participant_group TEXT NOT NULL CHECK (participant_group = 'Non-Commercial'),
  report_scope TEXT NOT NULL CHECK (report_scope = 'futures_only'),
  source_url TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  source_fingerprint TEXT NOT NULL,
  raw_payload TEXT NOT NULL,
  UNIQUE(contract_id, report_date)
);

CREATE TABLE cot_legacy_observations (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES cot_contracts(id) ON DELETE CASCADE,
  report_date TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_fingerprint TEXT NOT NULL,
  open_interest INTEGER NOT NULL,
  open_interest_change INTEGER NOT NULL,
  long_positions INTEGER NOT NULL,
  short_positions INTEGER NOT NULL,
  long_change INTEGER NOT NULL,
  short_change INTEGER NOT NULL,
  net_positions INTEGER NOT NULL,
  net_change INTEGER NOT NULL,
  net_position_pct_oi TEXT NOT NULL,
  net_change_pct_oi TEXT NOT NULL,
  long_share TEXT NOT NULL,
  short_share TEXT NOT NULL,
  weekly_long_share_change TEXT,
  UNIQUE(contract_id, report_date)
);

CREATE INDEX idx_cot_legacy_observations_contract_date
  ON cot_legacy_observations(contract_id, report_date DESC);
```

- [ ] **Step 4: Verify the schema test passes**

Run: `cargo test commands::cot::tests::migration_adds_isolated_legacy_cot_storage -- --nocapture`

Expected: PASS with a temporary database containing both old and new COT tables.

- [ ] **Step 5: Commit only tracked/new task files**

```powershell
git add -- apps/desktop/src-tauri/migrations/0031_cot_legacy_noncommercial.sql apps/desktop/src-tauri/src/commands/cot.rs
git commit -m "feat: add legacy COT persistence"
```

---

### Task 2: Parse and synchronize official Legacy Non-Commercial rows

**Files:**
- Modify/Test: `apps/desktop/src-tauri/src/commands/cot.rs`

**Interfaces:**
- Consumes: `LEGACY_URL = "https://publicreporting.cftc.gov/resource/6dca-aqww.json"` and each contract seed's `legacy_cftc_code`.
- Produces: `ParsedLegacyObservation`, `long_share(long, short) -> Option<f64>`, and persisted `cot_legacy_observations` rows for the last 15 years.

- [ ] **Step 1: Write failing parser and reference-vector tests**

Add tests that name the production mutations they catch:

```rust
#[test]
fn legacy_parser_uses_noncommercial_fields() {
    let row = serde_json::json!({
        "report_date_as_yyyy_mm_dd": "2026-08-04T00:00:00.000",
        "open_interest_all": "419393",
        "change_in_open_interest_all": "-12973",
        "noncomm_positions_long_all": "147228",
        "noncomm_positions_short_all": "192701",
        "change_in_noncomm_long_all": "45957",
        "change_in_noncomm_short_all": "-71982"
    });
    let parsed = parse_legacy_observation(&row, "source").unwrap();
    assert_eq!(parsed.long_positions, 147_228);
    assert_eq!(parsed.short_positions, 192_701);
    assert_eq!(parsed.open_interest_change, -12_973);
}

#[test]
fn screenshot_reference_vectors_use_week_over_week_long_share_change() {
    let jpy = weekly_long_share_change(147_228, 192_701, 101_271, 264_683).unwrap();
    let usd = weekly_long_share_change(35_247, 12_748, 35_339, 18_142).unwrap();
    assert!((jpy - 0.1564).abs() < 0.00005);
    assert!((usd - 0.0736).abs() < 0.00005);
}

#[test]
fn long_share_is_unavailable_for_zero_denominator() {
    assert_eq!(long_share(0, 0), None);
}

#[test]
fn dow_uses_the_reference_djia_x5_contract() {
    let dow = CONTRACTS.iter().find(|seed| seed.symbol == "DOW").unwrap();
    assert_eq!(dow.legacy_cftc_code, "124603");
}
```

- [ ] **Step 2: Run tests and observe the expected missing-function failures**

Run: `cargo test commands::cot::tests -- --nocapture`

Expected: compilation/test failure for the absent Legacy parser, helper, and seed field.

- [ ] **Step 3: Implement Legacy field selection and pure parsing**

Add the exact select list:

```rust
const LEGACY_SELECT: &str = "cftc_contract_market_code,report_date_as_yyyy_mm_dd,\
open_interest_all,change_in_open_interest_all,noncomm_positions_long_all,\
noncomm_positions_short_all,change_in_noncomm_long_all,change_in_noncomm_short_all";
```

Implement `long_share` with checked integer addition and reject non-positive totals. Implement `weekly_long_share_change` as current share minus prior share. `parse_legacy_observation` must reject incomplete rows and compute raw net/OI context without using it as the long-share signal.

- [ ] **Step 4: Add Legacy contract mappings and single-family sync**

Extend `ContractSeed` with `legacy_cftc_code`; use the existing code for every contract except DOW, which uses `124603`. Seed the new column. Replace the active TFF/Disaggregated fetch loop with one Legacy query over all active Legacy codes, ordered by report date and code. Maintain a `HashMap<contract_id, (long, short)>` while iterating to derive the previous week's share; persist raw payloads and observations in a transaction.

The upsert must update only the Legacy tables:

```sql
ON CONFLICT(contract_id, report_date) DO UPDATE SET
  fetched_at=excluded.fetched_at,
  source_url=excluded.source_url,
  source_fingerprint=excluded.source_fingerprint,
  open_interest=excluded.open_interest,
  open_interest_change=excluded.open_interest_change,
  long_positions=excluded.long_positions,
  short_positions=excluded.short_positions,
  long_change=excluded.long_change,
  short_change=excluded.short_change,
  net_positions=excluded.net_positions,
  net_change=excluded.net_change,
  net_position_pct_oi=excluded.net_position_pct_oi,
  net_change_pct_oi=excluded.net_change_pct_oi,
  long_share=excluded.long_share,
  short_share=excluded.short_share,
  weekly_long_share_change=excluded.weekly_long_share_change
```

- [ ] **Step 5: Run focused Rust tests**

Run: `cargo test commands::cot::tests -- --nocapture`

Expected: PASS for schema, parser, JPY/USD reference values, denominator handling, and DOW mapping.

- [ ] **Step 6: Commit the tracked Rust change**

```powershell
git add -- apps/desktop/src-tauri/src/commands/cot.rs
git commit -m "feat: sync legacy non-commercial COT data"
```

---

### Task 3: Switch active scoring and dashboard to COT v4 long share

**Files:**
- Modify/Test: `apps/desktop/src-tauri/src/commands/cot.rs`
- Modify: `apps/desktop/src/types/domain.ts`

**Interfaces:**
- Produces Rust/TypeScript fields `openInterestChange`, `longShare`, `shortShare`, and `weeklyLongShareChange`.
- Produces `CotAssessment.scoringVersion = "cot-v4-legacy-noncommercial"`, `CotContractView.reportFamily = "legacy"`, and `traderGroup = "Non-Commercial"`.
- Preserves existing `netPositionPctOi` and `netChangePctOi` as non-scoring raw context.

- [ ] **Step 1: Write failing v4 scoring and serialization tests**

Update the `ObservationRow` test builder to accept `long_share` independently from `net_position_pct_oi`. Add assertions that fail if scoring still reads net/OI:

```rust
#[test]
fn v4_scores_the_long_share_series_instead_of_net_percent_open_interest() {
    let rows = observations_with_long_share(156, 0.001);
    let assessment = assess_observations(
        &rows,
        NaiveDate::parse_from_str(&rows.last().unwrap().report_date, "%Y-%m-%d").unwrap(),
    );
    assert_eq!(assessment.scoring_version, "cot-v4-legacy-noncommercial");
    assert_eq!(assessment.bias_signal, Some(1));
}

#[test]
fn latest_change_signal_uses_weekly_long_share_change() {
    let mut row = observations_with_long_share(1, 0.0).remove(0);
    row.report_date = "2026-08-04".into();
    row.weekly_long_share_change = Some("-0.01".into());
    row.long_change = 10_000;
    row.short_change = 0;
    let today = NaiveDate::from_ymd_opt(2026, 8, 10).unwrap();
    assert_eq!(latest_change_signal(Some(&row), today), Some(-1));
}
```

Extend the Serde test to assert `reportFamily`, `traderGroup`, `longShare`, `shortShare`, `weeklyLongShareChange`, `openInterestChange`, and the v4 scoring version.

- [ ] **Step 2: Run the focused tests and verify red**

Run: `cargo test commands::cot::tests -- --nocapture`

Expected: FAIL because scoring and serialization still use v3/net-change semantics.

- [ ] **Step 3: Implement v4 assessment inputs**

Set:

```rust
const SCORING_VERSION: &str = "cot-v4-legacy-noncommercial";
```

Load active observations only from `cot_legacy_observations`. Build position values from `long_share`, four-week changes from that same series, and 13-week Theil-Sen slopes from that same series. Change explanatory copy from net positioning to Non-Commercial long share. Preserve gap, stale, minimum-history, percentile threshold, confirmation, quality, and crowding behavior.

`latest_change_signal` returns the sign of `weekly_long_share_change` and returns unavailable for missing/priorless/stale observations.

- [ ] **Step 4: Extend the response contracts**

Add to `CotContractView` in Rust and TypeScript:

```typescript
reportFamily: "legacy";
openInterestChange?: number | null;
longShare?: number | null;
shortShare?: number | null;
weeklyLongShareChange?: number | null;
```

Keep the existing raw fields for compatibility. Set dashboard provenance to Legacy/Non-Commercial and filter `lastSyncedAt` to successful sync runs whose `source_url` equals the Legacy endpoint.

- [ ] **Step 5: Verify Rust and TypeScript contracts**

Run: `cargo test commands::cot::tests -- --nocapture`

Run: `pnpm typecheck`

Expected: both PASS, with TypeScript failures fixed only by updating complete COT fixtures to include/allow the new fields.

- [ ] **Step 6: Commit tracked contract/scoring files**

```powershell
git add -- apps/desktop/src-tauri/src/commands/cot.rs apps/desktop/src/types/domain.ts
git commit -m "feat: score COT v4 from non-commercial long share"
```

---

### Task 4: Move COT asset detail to the active Legacy series

**Files:**
- Modify/Test: `apps/desktop/src-tauri/src/commands/cot.rs`
- Modify: `apps/desktop/src/types/domain.ts`

**Interfaces:**
- Produces `CotSeriesPoint.longShare`, `CotSeriesPoint.weeklyLongShareChange`, `CotAssetDetail.longShare`, and `CotAssetDetail.weeklyLongShareChange`.
- Returns exactly one active group summary named `Non-Commercial`; old group caches are not an active fallback.

- [ ] **Step 1: Write a failing active-detail integration test**

Initialize a temporary database, seed contracts, insert two `cot_legacy_observations` for AUD plus an intentionally conflicting old `cot_observations` row, call an extracted `cot_asset_detail(&AppState, CotDetailInput)` helper, and assert:

```rust
assert_eq!(detail.report_family, "legacy");
assert_eq!(detail.participant_group, "Non-Commercial");
assert!((detail.long_share.unwrap() - 0.42).abs() < 1e-12);
assert_eq!(detail.groups.len(), 1);
assert_eq!(detail.groups[0].participant_group, "Non-Commercial");
assert_ne!(detail.net_positions, Some(999_999));
```

- [ ] **Step 2: Run the integration test and verify red**

Run: `cargo test commands::cot::tests::asset_detail_uses_only_active_legacy_series -- --nocapture`

Expected: FAIL because the current command reads `cot_group_observations` and `cot_observations`.

- [ ] **Step 3: Extract and implement the active detail helper**

Keep the Tauri command thin:

```rust
pub async fn get_cot_asset_detail(
    state: State<'_, AppState>,
    input: CotDetailInput,
) -> CommandResult<CotAssetDetail> {
    cot_asset_detail(&state, input).await.map_err(Into::into)
}
```

Reject a supplied participant group other than `Non-Commercial`. Query only the Legacy table, calculate z-score, percentile, COT index, 4-week flow, and 13-week display change from long share, and continue to attach broker prices without changing broker-link behavior.

- [ ] **Step 4: Extend detail TypeScript types**

Add optional numeric fields:

```typescript
longShare?: number | null;
weeklyLongShareChange?: number | null;
```

to `CotSeriesPoint`, `CotGroupSummary`, and `CotAssetDetail` where applicable.

- [ ] **Step 5: Verify detail behavior**

Run: `cargo test commands::cot::tests -- --nocapture`

Run: `pnpm typecheck`

Expected: PASS with no old-cohort fallback.

- [ ] **Step 6: Commit tracked backend/type changes**

```powershell
git add -- apps/desktop/src-tauri/src/commands/cot.rs apps/desktop/src/types/domain.ts
git commit -m "feat: expose legacy COT detail series"
```

---

### Task 5: Render the screenshot-compatible COT ranking and provenance

**Files:**
- Create/Test: `apps/desktop/src/features/cot/cot-components.test.tsx`
- Modify: `apps/desktop/src/features/cot/cot-components.tsx`
- Modify: `apps/desktop/src/features/cot/cot-page.tsx`

**Interfaces:**
- Consumes: `CotContractView.weeklyLongShareChange`, `longShare`, `shortShare`, `openInterestChange`, `reportFamily`, and `traderGroup`.
- Produces: a cross-market table sorted descending by weekly long-share change and German source/formula copy.

- [ ] **Step 1: Write the failing component test**

Render `CotOverview` with JPY `0.1564`, USD `0.0736`, ETH `-0.00004`, and BTC `-0.0118`. Assert row order and visible provenance:

```tsx
expect(screen.getByText("Legacy Futures Only · Non-Commercial")).toBeTruthy();
expect(screen.getByRole("columnheader", { name: "Long-Anteil Δ zur Vorwoche" })).toBeTruthy();
expect(within(rows[1]).getByText("+15,64 PP")).toBeTruthy();
expect(within(rows[2]).getByText("+7,36 PP")).toBeTruthy();
expect(within(rows[4]).getByText("-1,18 PP")).toBeTruthy();
```

- [ ] **Step 2: Run the component test and verify red**

Run: `pnpm test -- src/features/cot/cot-components.test.tsx`

Expected: FAIL because the component sorts by `netChangePctOi` and renders old group/formula copy.

- [ ] **Step 3: Implement ranking and table semantics**

Sort `dashboard.contracts` by `weeklyLongShareChange`, placing unavailable values last. Render:

- Asset and `Legacy Futures Only`;
- group `Non-Commercial`;
- Long/Short contracts and changes;
- Long/Short shares;
- `Long-Anteil Δ zur Vorwoche` in signed percentage points;
- net position, open interest, and open-interest change as context;
- Position and 4W Flow badges from v4.

Use `Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })` and append `PP`. Never convert missing values to zero.

- [ ] **Step 4: Update page and detail copy**

Replace Leveraged Funds/Managed Money text with `Legacy Futures Only · Non-Commercial`. Change detail descriptions from net-%-OI to Long-Anteil, group comparison to the active Non-Commercial group, and COT-v4 labels. Keep Tuesday/Friday timing and no-trade-advice copy.

- [ ] **Step 5: Verify focused UI and types**

Run: `pnpm test -- src/features/cot/cot-components.test.tsx`

Run: `pnpm typecheck`

Expected: PASS. Because `cot-components.tsx` and `cot-page.tsx` were untracked before this task, do not stage them; report them explicitly in the final handoff.

---

### Task 6: Update Macro Institutional Activity to the new weekly signal

**Files:**
- Modify/Test: `apps/desktop/src/features/macro/institutional-activity.test.ts`
- Modify/Test: `apps/desktop/src/features/macro/macro-page.test.tsx`
- Modify: `apps/desktop/src/features/macro/macro-page.tsx`

**Interfaces:**
- Consumes: the same `latestChangeSignal` but now backed by `weeklyLongShareChange`, plus explicit Legacy provenance fields.
- Produces: user-visible `Long-Anteil Δ`, `Legacy Futures Only · Non-Commercial`, and `cot-v4-legacy-noncommercial` details without changing EODHD scores.

- [ ] **Step 1: Update fixtures and write failing provenance assertions**

Change COT fixtures to `reportFamily: "legacy"`, `traderGroup: "Non-Commercial"`, and add long-share fields. Add assertions:

```tsx
expect(within(institutional).getByText("Legacy Futures Only · Non-Commercial")).toBeTruthy();
expect(within(institutional).getByText(/Long-Anteil Δ \+15,64 PP/)).toBeTruthy();
expect(within(institutional).getByText(/cot-v4-legacy-noncommercial/)).toBeTruthy();
```

Keep existing tests for independent COT errors, refresh mutation, unavailable CNY, base-minus-quote values, and EODHD isolation.

- [ ] **Step 2: Run focused Macro tests and verify red**

Run: `pnpm test -- src/features/macro/institutional-activity.test.ts src/features/macro/macro-page.test.tsx`

Expected: FAIL because the panel still labels raw net change and omits source/version provenance.

- [ ] **Step 3: Implement the panel copy and values**

In `InstitutionalActivityPanel`, replace the `Netto Δ` display in the weekly row with signed percentage-point formatting of `weeklyLongShareChange`. Add a visible source/group item and show `assessment.scoringVersion` in the pipeline row. Preserve current loading, error, unavailable, refresh, and coverage behavior.

- [ ] **Step 4: Verify focused Macro tests**

Run: `pnpm test -- src/features/macro/institutional-activity.test.ts src/features/macro/macro-page.test.tsx`

Expected: PASS with the fundamental heatmap behavior unchanged.

- [ ] **Step 5: Commit tracked Macro files**

```powershell
git add -- apps/desktop/src/features/macro/institutional-activity.test.ts apps/desktop/src/features/macro/macro-page.test.tsx apps/desktop/src/features/macro/macro-page.tsx
git commit -m "feat: show legacy COT methodology in macro activity"
```

---

### Task 7: Full verification and native acceptance

**Files:**
- Verify all files from Tasks 1–6.

**Interfaces:**
- Produces fresh evidence that migration, Rust semantics, frontend contracts, UI, build, and native startup satisfy the approved design.

- [ ] **Step 1: Format only changed source files**

Run: `cargo fmt --all`

Run: `pnpm exec prettier --write src/types/domain.ts src/features/cot/cot-components.tsx src/features/cot/cot-components.test.tsx src/features/cot/cot-page.tsx src/features/macro/institutional-activity.test.ts src/features/macro/macro-page.test.tsx src/features/macro/macro-page.tsx`

- [ ] **Step 2: Run complete frontend gates**

Run from `apps/desktop`:

```powershell
pnpm typecheck
pnpm test
pnpm lint
pnpm format:check
pnpm build
```

Expected: every command exits 0; existing large-chunk build warnings are allowed, new errors or warnings are not.

- [ ] **Step 3: Run complete Rust gates**

Run from `apps/desktop/src-tauri`:

```powershell
cargo fmt --all -- --check
cargo test
cargo clippy --all-targets -- -D warnings
```

Expected: every command exits 0, including migration, exact 2026-08-04 reference, long-share scoring, detail isolation, and antisymmetry tests.

- [ ] **Step 4: Start the real Tauri app**

Run from `apps/desktop`: `pnpm tauri dev`

Wait for Vite and Tauri initialization, confirm migration 0031 applies and no new SQLite, Serde, command-registration, COT, or WebView warning appears, then terminate only the process started for this check.

- [ ] **Step 5: Audit the final diff and worktree**

Run:

```powershell
git diff --check
git status --short
git diff -- apps/desktop/src-tauri/src/commands/cot.rs apps/desktop/src/types/domain.ts apps/desktop/src/features/macro/institutional-activity.test.ts apps/desktop/src/features/macro/macro-page.test.tsx apps/desktop/src/features/macro/macro-page.tsx
```

Inspect the new migration and untracked COT UI files separately. Confirm there are no secrets, personal database paths/content, personal media, generated artifacts, modified historical migrations, unrelated refactors, or accidental staging of pre-existing untracked files.

- [ ] **Step 6: Report exact verification evidence**

Report the CFTC group/formula change, migration safety, DOW mapping, UI fields, exact reference vectors, every executed gate with exit status, native-start result, and any pre-existing untracked files deliberately left unstaged.
