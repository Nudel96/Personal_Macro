# COT Commodity Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the 14 approved commodity futures to the productive desktop COT workflow without changing COT-v4 scoring or currency-pair behavior.

**Architecture:** Extend the existing Rust `CONTRACTS` registry, which is already the single input to contract seeding, CFTC history retrieval, dashboard contracts, dynamic asset-class filters, and asset details. Protect the expansion with deterministic registry tests and currency-isolation tests; no frontend or SQLite schema change is required.

**Tech Stack:** Rust 2024, Tauri 2, SQLx/SQLite, Tokio, React 19, TypeScript, Vitest, pnpm, Cargo

## Global Constraints

- Work only in `D:\Macrotool\apps\desktop`; do not modify `apps/api` or `apps/web`.
- Keep source `Legacy Futures Only` dataset `6dca-aqww`, participant group `Non-Commercial`, report scope `Futures Only`, freshness threshold 10 days, and scoring version `cot-v4-legacy-noncommercial` unchanged.
- Add exactly the 14 approved symbols and CFTC codes from the design specification.
- Every new commodity must use `currency: None`; currency signals and the Base-minus-Quote matrix must remain unchanged and antisymmetric.
- Do not add a SQLite migration, dependency, report-family fallback, simulated browser data, or personal database fixture.
- Keep the estimated 15-year CFTC response below the existing 50,000-row request limit.
- Use the existing dynamic UI filters; do not create a parallel commodity page or unrelated UI refactor.
- User-facing labels remain German where the existing UI uses German; technical identifiers remain English.

---

## File Map

- Modify and test: `apps/desktop/src-tauri/src/commands/cot.rs`
  - `CONTRACTS` remains the canonical registry.
  - The existing `#[cfg(test)] mod tests` receives registry, capacity, and currency-isolation tests.
- No frontend file changes: `cot-page.tsx` derives filter values from `dashboard.contracts[*].assetClass` and the symbol selector from the same response.
- No migration: `seed_contracts` already upserts new `cot_contracts` records by symbol.

---

### Task 1: Lock the approved commodity registry with failing tests

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/cot.rs:1530-1880`
- Test: `apps/desktop/src-tauri/src/commands/cot.rs` (`#[cfg(test)] mod tests`)

**Interfaces:**
- Consumes: `static CONTRACTS: &[ContractSeed]`, `ContractSeed { symbol, display_name, asset_class, report_family, trader_group, cftc_code, legacy_cftc_code, currency, order }`
- Produces: deterministic tests defining the exact 14-symbol registry contract and ensuring all new assets are excluded from currency-pair generation.

- [ ] **Step 1: Add the failing registry test**

Add this test after `dow_uses_the_reference_djia_x5_contract`:

```rust
#[test]
fn approved_commodity_expansion_uses_exact_legacy_contracts() {
    let expected = [
        ("NATGAS", "Natural Gas", "Energie", "023651"),
        ("RBOB", "RBOB Gasoline", "Energie", "111659"),
        ("PLATINUM", "Platin", "Metalle", "076651"),
        ("PALLADIUM", "Palladium", "Metalle", "075651"),
        ("CORN", "Mais", "Getreide", "002602"),
        ("WHEAT", "Weizen (SRW)", "Getreide", "001602"),
        ("SOYBEANS", "Sojabohnen", "Getreide", "005602"),
        ("COFFEE", "Kaffee", "Soft Commodities", "083731"),
        ("COCOA", "Kakao", "Soft Commodities", "073732"),
        ("SUGAR", "Zucker No. 11", "Soft Commodities", "080732"),
        ("COTTON", "Baumwolle No. 2", "Soft Commodities", "033661"),
        ("LIVE_CATTLE", "Live Cattle", "Vieh", "057642"),
        ("LEAN_HOGS", "Lean Hogs", "Vieh", "054642"),
        ("FEEDER_CATTLE", "Feeder Cattle", "Vieh", "061641"),
    ];

    for (symbol, display_name, asset_class, code) in expected {
        let seed = CONTRACTS
            .iter()
            .find(|seed| seed.symbol == symbol)
            .unwrap_or_else(|| panic!("missing approved COT contract: {symbol}"));
        assert_eq!(seed.display_name, display_name);
        assert_eq!(seed.asset_class, asset_class);
        assert_eq!(seed.cftc_code, code);
        assert_eq!(seed.legacy_cftc_code, code);
        assert_eq!(seed.currency, None);
    }
}
```

- [ ] **Step 2: Add uniqueness, capacity, and currency-isolation tests**

Add:

```rust
#[test]
fn cot_registry_is_unique_and_stays_below_the_current_request_limit() {
    use std::collections::HashSet;

    let symbols = CONTRACTS.iter().map(|seed| seed.symbol).collect::<HashSet<_>>();
    let legacy_codes = CONTRACTS
        .iter()
        .map(|seed| seed.legacy_cftc_code)
        .collect::<HashSet<_>>();
    let estimated_reports_per_contract = HISTORY_YEARS as usize * 53;

    assert_eq!(symbols.len(), CONTRACTS.len(), "duplicate COT symbol");
    assert_eq!(legacy_codes.len(), CONTRACTS.len(), "duplicate Legacy CFTC code");
    assert!(
        CONTRACTS.len() * estimated_reports_per_contract < 50_000,
        "CFTC sync requires pagination before adding more contracts"
    );
}

#[test]
fn expanded_commodities_do_not_create_currency_pair_inputs() {
    let symbols = [
        "NATGAS",
        "RBOB",
        "PLATINUM",
        "PALLADIUM",
        "CORN",
        "WHEAT",
        "SOYBEANS",
        "COFFEE",
        "COCOA",
        "SUGAR",
        "COTTON",
        "LIVE_CATTLE",
        "LEAN_HOGS",
        "FEEDER_CATTLE",
    ];

    for symbol in symbols {
        let seed = CONTRACTS.iter().find(|seed| seed.symbol == symbol).unwrap();
        assert_eq!(seed.currency, None);
        assert!(!is_pair_currency(seed.symbol, &seed.currency));
    }
}
```

- [ ] **Step 3: Run the focused tests and verify the red state**

Run from `D:\Macrotool\apps\desktop\src-tauri`:

```powershell
cargo test approved_commodity_expansion_uses_exact_legacy_contracts
```

Expected: FAIL because `NATGAS` is missing from `CONTRACTS`.

Run:

```powershell
cargo test expanded_commodities_do_not_create_currency_pair_inputs
```

Expected: FAIL because the first approved symbol cannot be found.

---

### Task 2: Add the approved ContractSeed entries

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/cot.rs:46-280`
- Test: `apps/desktop/src-tauri/src/commands/cot.rs`

**Interfaces:**
- Consumes: the exact registry contract from Task 1.
- Produces: 14 new `ContractSeed` values consumed automatically by `seed_contracts`, `sync_cot_inner`, `cot_dashboard`, `cot_asset_detail`, and dynamic frontend filters.

- [ ] **Step 1: Add energy and precious-metal seeds after the existing `OIL` seed**

Use the existing physical-commodity compatibility metadata (`report_family: "disaggregated"`, `trader_group: "Managed Money"`) because the original `cot_contracts` schema restricts those legacy metadata columns. The active response and observation pipeline remain hard-coded to `legacy` and `Non-Commercial`.

```rust
    ContractSeed {
        symbol: "NATGAS",
        display_name: "Natural Gas",
        asset_class: "Energie",
        report_family: "disaggregated",
        trader_group: "Managed Money",
        cftc_code: "023651",
        legacy_cftc_code: "023651",
        currency: None,
        order: 240,
    },
    ContractSeed {
        symbol: "RBOB",
        display_name: "RBOB Gasoline",
        asset_class: "Energie",
        report_family: "disaggregated",
        trader_group: "Managed Money",
        cftc_code: "111659",
        legacy_cftc_code: "111659",
        currency: None,
        order: 250,
    },
    ContractSeed {
        symbol: "PLATINUM",
        display_name: "Platin",
        asset_class: "Metalle",
        report_family: "disaggregated",
        trader_group: "Managed Money",
        cftc_code: "076651",
        legacy_cftc_code: "076651",
        currency: None,
        order: 260,
    },
    ContractSeed {
        symbol: "PALLADIUM",
        display_name: "Palladium",
        asset_class: "Metalle",
        report_family: "disaggregated",
        trader_group: "Managed Money",
        cftc_code: "075651",
        legacy_cftc_code: "075651",
        currency: None,
        order: 270,
    },
```

- [ ] **Step 2: Add grain and soft-commodity seeds**

```rust
    ContractSeed {
        symbol: "CORN",
        display_name: "Mais",
        asset_class: "Getreide",
        report_family: "disaggregated",
        trader_group: "Managed Money",
        cftc_code: "002602",
        legacy_cftc_code: "002602",
        currency: None,
        order: 280,
    },
    ContractSeed {
        symbol: "WHEAT",
        display_name: "Weizen (SRW)",
        asset_class: "Getreide",
        report_family: "disaggregated",
        trader_group: "Managed Money",
        cftc_code: "001602",
        legacy_cftc_code: "001602",
        currency: None,
        order: 290,
    },
    ContractSeed {
        symbol: "SOYBEANS",
        display_name: "Sojabohnen",
        asset_class: "Getreide",
        report_family: "disaggregated",
        trader_group: "Managed Money",
        cftc_code: "005602",
        legacy_cftc_code: "005602",
        currency: None,
        order: 300,
    },
    ContractSeed {
        symbol: "COFFEE",
        display_name: "Kaffee",
        asset_class: "Soft Commodities",
        report_family: "disaggregated",
        trader_group: "Managed Money",
        cftc_code: "083731",
        legacy_cftc_code: "083731",
        currency: None,
        order: 310,
    },
    ContractSeed {
        symbol: "COCOA",
        display_name: "Kakao",
        asset_class: "Soft Commodities",
        report_family: "disaggregated",
        trader_group: "Managed Money",
        cftc_code: "073732",
        legacy_cftc_code: "073732",
        currency: None,
        order: 320,
    },
    ContractSeed {
        symbol: "SUGAR",
        display_name: "Zucker No. 11",
        asset_class: "Soft Commodities",
        report_family: "disaggregated",
        trader_group: "Managed Money",
        cftc_code: "080732",
        legacy_cftc_code: "080732",
        currency: None,
        order: 330,
    },
    ContractSeed {
        symbol: "COTTON",
        display_name: "Baumwolle No. 2",
        asset_class: "Soft Commodities",
        report_family: "disaggregated",
        trader_group: "Managed Money",
        cftc_code: "033661",
        legacy_cftc_code: "033661",
        currency: None,
        order: 340,
    },
```

- [ ] **Step 3: Add livestock seeds**

Add:

```rust
    ContractSeed {
        symbol: "LIVE_CATTLE",
        display_name: "Live Cattle",
        asset_class: "Vieh",
        report_family: "disaggregated",
        trader_group: "Managed Money",
        cftc_code: "057642",
        legacy_cftc_code: "057642",
        currency: None,
        order: 350,
    },
    ContractSeed {
        symbol: "LEAN_HOGS",
        display_name: "Lean Hogs",
        asset_class: "Vieh",
        report_family: "disaggregated",
        trader_group: "Managed Money",
        cftc_code: "054642",
        legacy_cftc_code: "054642",
        currency: None,
        order: 360,
    },
    ContractSeed {
        symbol: "FEEDER_CATTLE",
        display_name: "Feeder Cattle",
        asset_class: "Vieh",
        report_family: "disaggregated",
        trader_group: "Managed Money",
        cftc_code: "061641",
        legacy_cftc_code: "061641",
        currency: None,
        order: 370,
    },
```

- [ ] **Step 4: Run focused tests and verify green**

Run:

```powershell
cargo test approved_commodity_expansion_uses_exact_legacy_contracts
cargo test cot_registry_is_unique_and_stays_below_the_current_request_limit
cargo test expanded_commodities_do_not_create_currency_pair_inputs
```

Expected: all focused tests PASS. The registry contains 37 unique symbols and
37 unique Legacy CFTC codes; the estimated 15-year response stays below 50,000
rows.

- [ ] **Step 5: Run the complete COT Rust test module**

Run:

```powershell
cargo test commands::cot::tests
```

Expected: all COT tests PASS, including Legacy parser, COT-v4, stale-data,
currency-pair, and antisymmetry coverage.

- [ ] **Step 6: Commit the implementation**

```powershell
git -C D:\Macrotool add -- apps/desktop/src-tauri/src/commands/cot.rs
git -C D:\Macrotool commit -m "feat: expand COT commodity coverage"
```

---

### Task 3: Run repository quality gates and native smoke verification

**Files:**
- Verify only: `apps/desktop`
- Review: repository diff and runtime logs

**Interfaces:**
- Consumes: the 37-contract registry from Task 2.
- Produces: verified main-branch implementation with no unrelated file changes.

- [ ] **Step 1: Format and run Rust quality gates**

Run from `D:\Macrotool\apps\desktop\src-tauri`:

```powershell
cargo fmt --all -- --check
cargo test commands::cot::tests
cargo clippy --all-targets -- -D warnings
```

Expected: all commands exit 0 with no failed tests or Clippy warnings.

- [ ] **Step 2: Run frontend compatibility gates**

Run from `D:\Macrotool\apps\desktop`:

```powershell
pnpm typecheck
pnpm test -- --run
pnpm build
```

Expected: TypeScript check, Vitest suite, and production build exit 0. Existing
bundle-size notices are allowed; new errors are not.

- [ ] **Step 3: Start the real Tauri application**

Run from `D:\Macrotool\apps\desktop`:

```powershell
pnpm tauri dev
```

Expected after startup:

- SQLite initializes without a new migration error.
- The COT page lists the new dynamic classes and all 14 new symbols.
- A CFTC sync can populate Natural Gas from Legacy code `023651`.
- The currency matrix still contains only currency inputs.
- Logs contain no new COT initialization warning.

Stop only the Tauri/Vite processes started by this verification.

- [ ] **Step 4: Review final Git evidence**

Run:

```powershell
git -C D:\Macrotool status --short
git -C D:\Macrotool diff HEAD~1 -- apps/desktop/src-tauri/src/commands/cot.rs
git -C D:\Macrotool log -3 --oneline --decorate
```

Expected: working tree clean; the implementation commit changes only
`cot.rs`; `main` contains the design, plan, and implementation commits.
