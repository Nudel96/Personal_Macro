# Put/Call PDF Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a free native workflow that opens the official CME report in the system browser and imports a user-selected report PDF into the existing Put/Call history.

**Architecture:** Keep the existing CME parser and SQLite upsert path as the single source of truth. Add one native import command that validates and reads a local PDF, expose it through the TypeScript command facade, and add two actions to the existing Put/Call page.

**Tech Stack:** Rust 2024, Tauri 2, SQLx/SQLite, React 19, TypeScript strict mode, TanStack Query, Vitest/Testing Library.

## Global Constraints

- Product changes stay in `apps/desktop`.
- User-facing copy is German.
- Local files are selected through the native Tauri dialog and are never copied into the repository.
- A report must be at most 8 MiB and pass PDF signature plus existing seven-row CME validation.
- Import writes all seven observations in one transaction and preserves existing data on failure.
- Browser preview must not fabricate imports or market data.

---

### Task 1: Native PDF import command

**Files:**

- Modify: `apps/desktop/src-tauri/src/commands/put_call.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`

**Interfaces:**

- Consumes: existing `parse_report_text`, `store_observations`, and `record_sync_run` functions.
- Produces: `import_put_call_pdf(state: State<'_, AppState>, path: String) -> CommandResult<PutCallSyncResult>`.

- [x] Add a failing Rust test proving that a valid local CME PDF is parsed and all seven assets are stored.
- [x] Add failing Rust tests proving that a non-PDF extension and an oversized or invalid PDF are rejected without changing observations.
- [x] Run the focused Rust tests and confirm failure because the import helper does not exist.
- [x] Implement bounded local PDF reading, shared PDF-byte validation, parsing, transactional storage, and sync-run recording.
- [x] Register `import_put_call_pdf` in the Tauri command handler.
- [x] Run the focused Rust tests and confirm they pass.

### Task 2: Frontend import workflow

**Files:**

- Modify: `apps/desktop/src/services/commands.ts`
- Modify: `apps/desktop/src/features/put-call-ratio/put-call-ratio-page.tsx`
- Modify: `apps/desktop/src/features/put-call-ratio/put-call-ratio-page.test.tsx`

**Interfaces:**

- Consumes: Tauri dialog `open`, opener `openUrl`, and the native command from Task 1.
- Produces: `api.importPutCallPdf(path: string): Promise<PutCallSyncResult>` and two page actions named `CME-Report öffnen` and `PDF importieren`.

- [x] Add failing UI tests proving the official URL is opened and the selected PDF path is passed to `api.importPutCallPdf`.
- [x] Add a failing UI test proving dialog cancellation invokes no import.
- [x] Run the focused Vitest file and confirm the new tests fail for missing actions.
- [x] Add the command-facade method and native page actions.
- [x] Invalidate only `put-call` after a successful import and show import errors without hiding existing chart data.
- [x] Run the focused Vitest file and confirm it passes.

### Task 3: Risk-proportionate verification

**Files:**

- Review all modified files and the repository diff.

**Interfaces:**

- Consumes: Tasks 1 and 2.
- Produces: verified native and frontend behavior with no unrelated changes.

- [x] Run `pnpm typecheck`.
- [x] Run `pnpm test -- --run`.
- [x] Run `pnpm build`.
- [x] Run `cargo fmt --all -- --check`.
- [x] Run focused Put/Call Rust tests, then `cargo clippy --all-targets -- -D warnings`.
- [x] Start the native application and confirm it initializes without a new Put/Call warning.
- [x] Inspect `git diff` and `git status` for secrets, generated files, and unrelated changes.
