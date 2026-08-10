# Economic Heatmap and Institutional Activity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two independently auditable COT indicators to the Macro heatmap and make positive, negative, neutral, and unavailable evidence visually immediate without changing the existing EODHD fundamentals score.

**Architecture:** Keep EODHD and CFTC as independent native queries and compose them in the Macro feature by currency code. Rust owns the fresh weekly `long_change - short_change` signal; a focused TypeScript view-model module owns currency aggregation and Base-minus-Quote comparison; React only renders those view models.

**Tech Stack:** Rust 2024, Tauri 2, SQLx/SQLite, React 19, TypeScript strict mode, TanStack Query, Vitest, Testing Library, CSS design tokens.

## Global Constraints

- Implement only in `apps/desktop`; do not modify `apps/api` or `apps/web`.
- Keep `assessment.bias_signal` and every existing COT-v3 percentile, history, gap, freshness, and quality rule unchanged.
- Compute Latest Buys/Sells as `sign(long_change - short_change)` and return unavailable for reports beyond the existing ten-day COT freshness limit.
- Do not treat missing Base or Quote signals as neutral or zero.
- Keep `fundamentalScore` EODHD-only; expose a separate Institutional Score.
- Preserve CNY as unavailable because no CFTC currency contract currently exists.
- Use German user-facing copy and semantic green/positive, red/negative, slate/neutral, and visibly unavailable styling.
- Add no SQLite migration and no new external dependency.
- Do not expose `.env.local`, SQLite content, backups, exports, imports, or personal media.

---

## File Map

- Modify `apps/desktop/src-tauri/src/commands/cot.rs`: calculate and serialize the fresh weekly Latest Buys/Sells signal while preserving COT-v3.
- Modify `apps/desktop/src/types/domain.ts`: add the camelCase TypeScript contract for the new optional signal.
- Create `apps/desktop/src/features/macro/institutional-activity.ts`: pure currency and pair composition with coverage and bias labels.
- Create `apps/desktop/src/features/macro/institutional-activity.test.ts`: deterministic currency, missing-data, pair, and antisymmetry tests.
- Modify `apps/desktop/src/features/macro/macro-page.tsx`: load COT independently, render Institutional Activity in the pair heatmap and currency detail, and provide isolated refresh/error states.
- Modify `apps/desktop/src/features/macro/macro-page.test.tsx`: render real response-shaped COT fixtures and verify semantics rather than mocks.
- Modify `apps/desktop/src/styles/globals.css`: add feature-scoped semantic intensity styles after the current EOF override layer.

---

### Task 1: Add the authoritative weekly COT change signal

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/cot.rs`
- Modify: `apps/desktop/src/types/domain.ts`

**Interfaces:**
- Consumes: `ObservationRow.long_change`, `ObservationRow.short_change`, `ObservationRow.report_date`, and the existing `REPORT_STALE_AFTER_DAYS` rule.
- Produces: Rust `CotContractView.latest_change_signal: Option<i8>` serialized as `latestChangeSignal`, and TypeScript `CotContractView.latestChangeSignal?: -1 | 0 | 1 | null`.

- [ ] **Step 1: Write failing Rust tests for the desired signal**

Add focused tests inside `commands::cot::tests`. The production mutation each test catches is using the wrong field, reversing the subtraction, collapsing zero into bullish/bearish, or scoring a stale report.

```rust
#[test]
fn latest_change_signal_uses_long_change_minus_short_change() {
    let today = NaiveDate::from_ymd_opt(2026, 8, 10).unwrap();
    let mut row = observations(1, 0.0).remove(0);
    row.report_date = "2026-08-04".into();

    row.long_change = 30;
    row.short_change = 10;
    assert_eq!(latest_change_signal(Some(&row), today), Some(1));

    row.long_change = 10;
    row.short_change = 30;
    assert_eq!(latest_change_signal(Some(&row), today), Some(-1));

    row.long_change = 25;
    row.short_change = 25;
    assert_eq!(latest_change_signal(Some(&row), today), Some(0));
}

#[test]
fn latest_change_signal_is_unavailable_for_missing_or_stale_reports() {
    let today = NaiveDate::from_ymd_opt(2026, 8, 10).unwrap();
    let mut row = observations(1, 0.0).remove(0);
    row.report_date = "2026-07-14".into();
    row.long_change = 30;
    row.short_change = 10;

    assert_eq!(latest_change_signal(None, today), None);
    assert_eq!(latest_change_signal(Some(&row), today), None);
}
```

- [ ] **Step 2: Run the targeted tests and verify RED**

Run:

```powershell
cd D:\Macrotool\apps\desktop\src-tauri
cargo test latest_change_signal_ -- --nocapture
```

Expected: compilation/test failure because `latest_change_signal` does not exist yet. Confirm the failure points to the missing production behavior rather than malformed fixtures.

- [ ] **Step 3: Implement the smallest fresh-report helper**

Add a helper next to the existing COT assessment helpers and reuse the exact stale-date interpretation already used by `assess_observations`:

```rust
fn report_is_stale(report_date: Option<&str>, today: NaiveDate) -> bool {
    report_date
        .and_then(|value| NaiveDate::parse_from_str(value, "%Y-%m-%d").ok())
        .map(|date| {
            (today - (date + Duration::days(3))).num_days() > REPORT_STALE_AFTER_DAYS
        })
        .unwrap_or(true)
}

fn latest_change_signal(observation: Option<&ObservationRow>, today: NaiveDate) -> Option<i8> {
    let observation = observation?;
    if report_is_stale(Some(&observation.report_date), today) {
        return None;
    }
    Some((observation.long_change - observation.short_change).signum() as i8)
}
```

Replace the duplicated stale expression in `assess_observations` with `report_is_stale(report_date.as_deref(), today)` so both signals share one freshness rule without changing its result.

- [ ] **Step 4: Expose the field through the native and TypeScript contracts**

Add to `CotContractView`:

```rust
pub latest_change_signal: Option<i8>,
```

Populate it in `cot_dashboard` before moving the observation into the view:

```rust
let latest_change_signal = latest_change_signal(latest, Utc::now().date_naive());
```

and include `latest_change_signal` in the `CotContractView` initializer. Add to `types/domain.ts` without changing existing `changeSignal`:

```typescript
latestChangeSignal?: -1 | 0 | 1 | null;
```

- [ ] **Step 5: Add and run a camelCase serialization regression test**

Construct a complete `CotContractView` test fixture with `latest_change_signal: Some(1)`, serialize it with `serde_json::to_value`, and assert:

```rust
let json = serde_json::to_value(view).unwrap();
assert_eq!(json["latestChangeSignal"], 1);
assert!(json.get("latest_change_signal").is_none());
```

Run:

```powershell
cargo test commands::cot::tests -- --nocapture
```

Expected: all COT tests pass, including existing percentile, v3 confirmation, parser, and antisymmetry tests.

- [ ] **Step 6: Commit the isolated backend contract change**

```powershell
git add -- apps/desktop/src-tauri/src/commands/cot.rs apps/desktop/src/types/domain.ts
git commit -m "feat: expose latest COT change signal"
```

---

### Task 2: Build pure Institutional Activity view models

**Files:**
- Create: `apps/desktop/src/features/macro/institutional-activity.ts`
- Create: `apps/desktop/src/features/macro/institutional-activity.test.ts`

**Interfaces:**
- Consumes: `CotDashboard`, `CotContractView.latestChangeSignal`, and `CotAssessment.biasSignal`.
- Produces: `InstitutionalCurrencyActivity`, `InstitutionalPairActivity`, `buildInstitutionalCurrencyActivity(currency, dashboard)`, and `buildInstitutionalPairActivity(base, quote, dashboard)`.

- [ ] **Step 1: Write failing currency aggregation tests**

Create response-shaped fixtures containing a real `contracts` array and assert hand-derived values:

```typescript
it.each([
  [1, 1, 2, "Sehr Bullish"],
  [1, 0, 1, "Bullish"],
  [1, -1, 0, "Neutral"],
  [-1, 0, -1, "Bearish"],
  [-1, -1, -2, "Sehr Bearish"],
] as const)(
  "aggregates latest %s and pipeline %s into %s",
  (latest, pipeline, score, biasLabel) => {
    const result = buildInstitutionalCurrencyActivity(
      "USD",
      cotDashboard({ USD: { latest, pipeline } }),
    );
    expect(result.score).toBe(score);
    expect(result.biasLabel).toBe(biasLabel);
    expect(result.coverage).toBe(2);
  },
);

it("keeps one available signal and reports reduced coverage", () => {
  const result = buildInstitutionalCurrencyActivity(
    "USD",
    cotDashboard({ USD: { latest: 1, pipeline: null } }),
  );
  expect(result).toMatchObject({ score: 1, coverage: 1, biasLabel: "Bullish" });
});

it("does not turn a missing CNY contract into neutral", () => {
  const result = buildInstitutionalCurrencyActivity("CNY", cotDashboard({}));
  expect(result).toMatchObject({ score: null, coverage: 0, biasLabel: "Nicht verfügbar" });
});
```

- [ ] **Step 2: Write failing pair and antisymmetry tests**

```typescript
it("computes +2 when base is bullish and quote is bearish", () => {
  const result = buildInstitutionalPairActivity("USD", "CAD", cotDashboard({
    USD: { latest: 1, pipeline: 0 },
    CAD: { latest: -1, pipeline: 0 },
  }));
  expect(result.latestChangeScore).toBe(2);
});

it("cancels equal signals and stays antisymmetric", () => {
  const source = cotDashboard({
    USD: { latest: 1, pipeline: 1 },
    EUR: { latest: 1, pipeline: -1 },
  });
  const direct = buildInstitutionalPairActivity("USD", "EUR", source);
  const reverse = buildInstitutionalPairActivity("EUR", "USD", source);
  expect(direct.latestChangeScore).toBe(0);
  expect(direct.score).toBe(-reverse.score!);
});

it("marks a component unavailable when either side is missing", () => {
  const result = buildInstitutionalPairActivity("USD", "CNY", cotDashboard({}));
  expect(result).toMatchObject({
    latestChangeScore: null,
    pipelineScore: null,
    score: null,
    coverage: 0,
  });
});
```

- [ ] **Step 3: Run the new test file and verify RED**

```powershell
cd D:\Macrotool\apps\desktop
pnpm exec vitest run src/features/macro/institutional-activity.test.ts
```

Expected: failure because the module and exported view-model functions do not exist.

- [ ] **Step 4: Implement the pure view-model module**

Use nullable signals explicitly:

```typescript
import type { CotContractView, CotDashboard } from "../../types/domain";

export type InstitutionalSignal = -1 | 0 | 1;

export interface InstitutionalCurrencyActivity {
  currency: string;
  latestChangeSignal: InstitutionalSignal | null;
  pipelineSignal: InstitutionalSignal | null;
  score: number | null;
  coverage: 0 | 1 | 2;
  biasLabel: string;
  contract: CotContractView | null;
}

export interface InstitutionalPairActivity {
  base: string;
  quote: string;
  latestChangeScore: number | null;
  pipelineScore: number | null;
  score: number | null;
  coverage: 0 | 1 | 2;
}

function sumAvailable(values: Array<number | null>) {
  const available = values.filter((value): value is number => value !== null);
  return {
    score: available.length ? available.reduce((sum, value) => sum + value, 0) : null,
    coverage: available.length as 0 | 1 | 2,
  };
}

function pairComponent(base: number | null, quote: number | null) {
  return base === null || quote === null ? null : base - quote;
}

function institutionalBias(score: number | null) {
  if (score === null) return "Nicht verfügbar";
  if (score >= 2) return "Sehr Bullish";
  if (score === 1) return "Bullish";
  if (score <= -2) return "Sehr Bearish";
  if (score === -1) return "Bearish";
  return "Neutral";
}
```

`buildInstitutionalCurrencyActivity` finds the contract by exact currency code, reads `latestChangeSignal` and `assessment.biasSignal`, and returns the raw contract for provenance display. `buildInstitutionalPairActivity` builds both currency views, applies `pairComponent`, and sums only available pair components.

- [ ] **Step 5: Run the focused tests and verify GREEN**

```powershell
pnpm exec vitest run src/features/macro/institutional-activity.test.ts
```

Expected: all currency, reduced-coverage, missing-CNY, `+2`, cancellation, and antisymmetry cases pass.

- [ ] **Step 6: Commit the pure composition layer**

```powershell
git add -- apps/desktop/src/features/macro/institutional-activity.ts apps/desktop/src/features/macro/institutional-activity.test.ts
git commit -m "feat: compose institutional activity signals"
```

---

### Task 3: Integrate COT into the Macro page without coupling failures

**Files:**
- Modify: `apps/desktop/src/features/macro/macro-page.tsx`
- Modify: `apps/desktop/src/features/macro/macro-page.test.tsx`

**Interfaces:**
- Consumes: `api.cotDashboard`, `api.syncCot`, `buildInstitutionalCurrencyActivity`, and `buildInstitutionalPairActivity`.
- Produces: two Institutional Activity pair columns, a separate Institutional Score, and a currency detail panel with raw COT provenance.

- [ ] **Step 1: Extend the page fixture and write failing structural tests**

Extend the service mock with `cotDashboard` and `syncCot`. Add complete `CotContractView` fixtures for USD and CAD, including all documented fields and an assessment object. Verify the new table contract:

```typescript
expect(
  screen.getByRole("columnheader", { name: "Institutional Activity" }),
).toBeTruthy();
expect(
  screen.getByRole("columnheader", { name: "Latest Buys/Sells" }),
).toBeTruthy();
expect(screen.getByRole("columnheader", { name: "COT Pipeline" })).toBeTruthy();
expect(
  screen.getByRole("columnheader", { name: "Institutional Score" }),
).toBeTruthy();
```

Update the existing row-cell assertion from 16 to 19 data cells: Fundamentals Bias, Fundamentals Score, Institutional Score, two Institutional components, and fourteen EODHD cells.

- [ ] **Step 2: Write failing detail, error isolation, and refresh tests**

After selecting CAD, assert that the detail panel exposes the real raw values and labels:

```typescript
expect(screen.getByRole("heading", { name: "Institutional Activity" })).toBeTruthy();
expect(screen.getByText("Latest Buys/Sells")).toBeTruthy();
expect(screen.getByText("COT Pipeline")).toBeTruthy();
expect(screen.getByText(/Long Δ/)).toBeTruthy();
expect(screen.getByText(/Short Δ/)).toBeTruthy();
expect(screen.getByText(/Coverage 2\/2/)).toBeTruthy();
```

In a separate test reject only `api.cotDashboard`, keep the EODHD fixture resolved, and assert both the 36 fundamental rows and a local “COT-Daten konnten nicht geladen werden” message remain visible. In another test click “COT aktualisieren” and assert `api.syncCot` is invoked once.

- [ ] **Step 3: Run the Macro page tests and verify RED**

```powershell
pnpm exec vitest run src/features/macro/macro-page.test.tsx
```

Expected: failure because the page does not query or render COT data yet.

- [ ] **Step 4: Add the independent query and mutation**

Inside `MacroPage`, add:

```typescript
const cot = useQuery({
  queryKey: ["macro", "cot"],
  queryFn: api.cotDashboard,
  retry: false,
});

const syncCot = useMutation({
  mutationFn: api.syncCot,
  onSuccess: (result) => {
    void queryClient.invalidateQueries({ queryKey: ["macro", "cot"] });
    void queryClient.invalidateQueries({ queryKey: ["cot"] });
    toast.success(`${result.imported} COT-Beobachtungen aktualisiert.`);
  },
  onError: (error: { message?: string }) =>
    toast.error(error.message ?? "COT-Daten konnten nicht aktualisiert werden."),
});
```

Do not include `cot.isError` in the page-level EODHD error guard.

- [ ] **Step 5: Render Institutional columns in the pair heatmap**

Pass `cot.data` into `FundamentalHeatmap`. Change the first header group to four output columns, insert a two-column Institutional group before the EODHD groups, and render:

```tsx
const institutional = buildInstitutionalPairActivity(pair.base, pair.quote, cot);

<InstitutionalScoreCell activity={institutional} />
<InstitutionalPairCell
  label="Latest Buys/Sells"
  score={institutional.latestChangeScore}
  base={pair.base}
  quote={pair.quote}
/>
<InstitutionalPairCell
  label="COT Pipeline"
  score={institutional.pipelineScore}
  base={pair.base}
  quote={pair.quote}
/>
```

Unavailable cells render `—`, never `0`. Add `data-intensity="1"` for absolute score 1 and `data-intensity="2"` for absolute score 2 or greater. Keep explicit signed text for available values.

- [ ] **Step 6: Render the currency Institutional Activity panel**

Pass COT data, query error, mutation state, and refresh callback into `CurrencyOverview`. Build the selected activity once and place a dedicated panel before the EODHD factor loop. The panel must display:

```text
Institutional Activity | <biasLabel> | <signed score or —> | Coverage n/2
Latest Buys/Sells      | Long Δ <value> | Short Δ <value> | Netto Δ <value> | <report date>
COT Pipeline           | <assessment.biasLabel> | <assessment.quality> | <crowdingStatus> | <report date>
```

Use `Intl.NumberFormat("de-DE")` for position changes. For a missing contract or COT query error, render a local unavailable/error row while leaving the Economic panels intact.

- [ ] **Step 7: Strengthen the existing Economic status markup**

Give each factor panel header a `data-tone` based on its score. Replace the bare numeric status span in `IndicatorRow` with a semantic signal chip that contains `Bullish`, `Bearish`, `Neutral`, or `Nicht bewertbar` plus the signed score when available. Retain Actual, Forecast, Previous, Surprise, release timestamp, and reason columns unchanged.

- [ ] **Step 8: Run focused React and view-model tests and verify GREEN**

```powershell
pnpm exec vitest run src/features/macro/institutional-activity.test.ts src/features/macro/macro-page.test.tsx
```

Expected: both test files pass with no unhandled query or mutation warnings.

- [ ] **Step 9: Commit the UI integration**

```powershell
git add -- apps/desktop/src/features/macro/macro-page.tsx apps/desktop/src/features/macro/macro-page.test.tsx
git commit -m "feat: show COT activity in macro heatmap"
```

---

### Task 4: Apply strong semantic visual styling

**Files:**
- Modify: `apps/desktop/src/styles/globals.css`
- Modify: `apps/desktop/src/features/macro/macro-page.test.tsx`

**Interfaces:**
- Consumes: `heatmap-positive`, `heatmap-negative`, `heatmap-neutral`, `heatmap-unavailable`, `data-intensity`, and `data-tone` emitted by Task 3.
- Produces: feature-scoped, accessible visual hierarchy that survives the current EOF `!important` override layer.

- [ ] **Step 1: Write a failing semantic-markup regression test**

Use a USD/CAD fixture whose Latest Buys/Sells pair score is `+2`, whose COT Pipeline pair score is `-1`, and whose missing USD/CNY pair component is unavailable. Assert observable markup rather than CSS source text:

```typescript
const latest = screen.getByTitle(/Latest Buys\/Sells.*Base USD.*Quote CAD/);
expect(latest.className).toContain("heatmap-positive");
expect(latest.getAttribute("data-intensity")).toBe("2");

const pipeline = screen.getByTitle(/COT Pipeline.*Base USD.*Quote CAD/);
expect(pipeline.className).toContain("heatmap-negative");

const unavailable = screen.getByTitle(/Latest Buys\/Sells.*USD.*CNY/);
expect(unavailable.textContent).toBe("—");
```

- [ ] **Step 2: Run the page test and verify RED**

```powershell
pnpm exec vitest run src/features/macro/macro-page.test.tsx
```

Expected: failure on missing semantic classes/intensity attributes, not on the data fixtures.

- [ ] **Step 3: Add feature-scoped styles after the existing EOF override layer**

Append rules scoped under `.macro-scaffold-page` so they do not recolor journal, calendar, rates, COT, or seasonality tables. Use existing design tokens where they remain semantically correct and explicit accessible foreground/background pairs where the EOF monochrome layer requires stronger specificity.

Required selectors:

```css
.macro-scaffold-page .macro-scaffold-heatmap td.heatmap-positive[data-intensity="1"]
.macro-scaffold-page .macro-scaffold-heatmap td.heatmap-positive[data-intensity="2"]
.macro-scaffold-page .macro-scaffold-heatmap td.heatmap-negative[data-intensity="1"]
.macro-scaffold-page .macro-scaffold-heatmap td.heatmap-negative[data-intensity="2"]
.macro-scaffold-page .macro-scaffold-heatmap td.heatmap-neutral
.macro-scaffold-page .macro-scaffold-heatmap td.heatmap-unavailable
.macro-scaffold-page .macro-pipeline-panel > header[data-tone="positive"]
.macro-scaffold-page .macro-pipeline-panel > header[data-tone="negative"]
.macro-scaffold-page .macro-signal-chip[data-tone="positive"]
.macro-scaffold-page .macro-signal-chip[data-tone="negative"]
.macro-scaffold-page .macro-signal-chip[data-tone="neutral"]
.macro-scaffold-page .macro-signal-chip[data-tone="unavailable"]
.macro-scaffold-page .institutional-activity-panel
.macro-scaffold-page .institutional-activity-row
```

Use brighter saturation for intensity 2 than intensity 1, preserve legible focus/hover states, and avoid red/green decoration on unavailable values.

- [ ] **Step 4: Run the focused tests and formatting check**

```powershell
pnpm exec vitest run src/features/macro/institutional-activity.test.ts src/features/macro/macro-page.test.tsx
pnpm format:check
```

Expected: all focused tests pass and formatting reports no changed-file violations. If the repository formatter reports unrelated pre-existing files, run Prettier only on the four changed TypeScript/TSX/CSS files and repeat the check.

- [ ] **Step 5: Commit the semantic styling**

```powershell
git add -- apps/desktop/src/styles/globals.css apps/desktop/src/features/macro/macro-page.test.tsx
git commit -m "style: strengthen macro signal colors"
```

---

### Task 5: Verify native data flow and the complete desktop build

**Files:**
- Inspect: all files listed in the File Map
- Modify only if a verification failure identifies a regression caused by this feature.

**Interfaces:**
- Consumes: the complete feature implementation.
- Produces: fresh test/build/runtime evidence and a clean scoped diff.

- [ ] **Step 1: Run the complete frontend gate**

```powershell
cd D:\Macrotool\apps\desktop
pnpm typecheck
pnpm test
pnpm lint
pnpm format:check
pnpm build
```

Expected: every command exits 0. Record exact failing files if a repository-wide pre-existing failure remains; do not claim the gate passed in that case.

- [ ] **Step 2: Run the complete Rust gate**

```powershell
cd D:\Macrotool\apps\desktop\src-tauri
cargo fmt --all -- --check
cargo test
cargo clippy --all-targets -- -D warnings
```

Expected: every command exits 0 with all existing COT, EODHD, scoring, migration, repository, and property tests passing.

- [ ] **Step 3: Start the real Tauri application**

```powershell
cd D:\Macrotool\apps\desktop
pnpm tauri dev
```

Wait for the Vite and Tauri initialization messages, confirm the application reaches its normal running state without a new database, command-registration, Serde, COT, or WebView warning, then terminate only the process started for this check.

- [ ] **Step 4: Inspect the final diff and status**

```powershell
cd D:\Macrotool
git diff --check
git status --short
git diff -- apps/desktop/src-tauri/src/commands/cot.rs apps/desktop/src/types/domain.ts apps/desktop/src/features/macro/institutional-activity.ts apps/desktop/src/features/macro/institutional-activity.test.ts apps/desktop/src/features/macro/macro-page.tsx apps/desktop/src/features/macro/macro-page.test.tsx apps/desktop/src/styles/globals.css
```

Confirm the diff contains no secret, database path/content, personal data, generated artifact, unrelated refactor, modified migration, or change to the existing COT-v3 semantics.

- [ ] **Step 5: Report verified behavior and any remaining limitation**

The handoff must state:

- the two exact Institutional Activity formulas;
- that Fundamentals and Institutional scores remain separate;
- which frontend, Rust, build, lint, format, and Tauri runtime checks passed;
- that CNY remains unavailable until a real CFTC contract mapping exists;
- any pre-existing repository-wide failure with its exact command and output summary.
