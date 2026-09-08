import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppErrorBoundary } from "../../components/ui/app-error-boundary";
import { api } from "../../services/commands";
import { migrateUiState, useUiStore } from "../../stores/ui-store";
import type { Account, BootstrapData } from "../../types/domain";
import {
  JournalAccountProvider,
  useJournalAccount,
} from "./journal-account-context";
import { JournalAccountGate } from "./journal-account-gate";
import { JournalAccountSelector } from "./journal-account-selector";

vi.mock("../../services/commands", () => ({
  api: { bootstrap: vi.fn() },
}));

const account = (id: string, name: string, isArchived = false): Account => ({
  id,
  name,
  accountType: "Live",
  baseCurrency: "EUR",
  initialBalanceMinor: 0,
  currentBalanceMinor: 0,
  defaultRiskPercent: 1,
  isArchived,
});

const bootstrap = (accounts: Account[]): BootstrapData => ({
  accounts,
  strategies: [],
  setups: [],
  tags: [],
  emotions: [],
  mistakes: [],
  databasePath: "",
  appDataPath: "",
  calculationVersion: "test",
});

function AccountStatus() {
  const { status, selectedAccountId } = useJournalAccount();
  return <div>{`${status}:${selectedAccountId ?? "none"}`}</div>;
}

function LocationStatus() {
  const location = useLocation();
  return <div>{`${location.pathname}${location.search}`}</div>;
}

function renderAccountContext({ withErrorBoundary = false } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const content = (
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <JournalAccountProvider>
          <JournalAccountSelector />
          <AccountStatus />
          <LocationStatus />
          <JournalAccountGate>
            <div>Journalinhalt</div>
          </JournalAccountGate>
        </JournalAccountProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
  return render(
    withErrorBoundary ? (
      <AppErrorBoundary>{content}</AppErrorBoundary>
    ) : (
      content
    ),
  );
}

describe("migrateUiState", () => {
  it("migrates one legacy account ID into the selected journal account", () => {
    const migrated = migrateUiState({ globalAccountIds: ["a"] }, 0);

    expect(migrated.selectedJournalAccountId).toBe("a");
    expect(migrated).not.toHaveProperty("globalAccountIds");
  });

  it("clears zero or multiple legacy account IDs during migration", () => {
    expect(
      migrateUiState({ globalAccountIds: [] }, 0).selectedJournalAccountId,
    ).toBeNull();
    expect(
      migrateUiState({ globalAccountIds: ["a", "b"] }, 0)
        .selectedJournalAccountId,
    ).toBeNull();
  });
});

describe("JournalAccountProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
      configurable: true,
      value: () => false,
    });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: () => undefined,
    });
    useUiStore.setState({ selectedJournalAccountId: null });
    vi.mocked(api.bootstrap).mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows a disabled Tradingkonto selector and creation gate without accounts", async () => {
    vi.mocked(api.bootstrap).mockResolvedValue(bootstrap([]));

    renderAccountContext();

    await screen.findByText("Noch kein Tradingkonto");
    const selector = await screen.findByRole("combobox", {
      name: "Tradingkonto",
    });
    expect((selector as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Kein Tradingkonto")).toBeTruthy();
    expect(screen.getByText("Noch kein Tradingkonto")).toBeTruthy();
    const createAccountLink = screen.getByRole("link", {
      name: "Tradingkonto anlegen",
    });
    expect(createAccountLink.getAttribute("href")).toBe(
      "/settings?section=accounts",
    );
    expect(within(createAccountLink).queryByRole("button")).toBeNull();
  });

  it("requires an explicit choice even for one active account", async () => {
    vi.mocked(api.bootstrap).mockResolvedValue(
      bootstrap([account("primary", "Hauptkonto")]),
    );

    renderAccountContext();

    expect(await screen.findByText("selectionRequired:none")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Tradingkonto auswählen" }),
    ).toBeTruthy();
    expect(
      document.querySelector('a[href="/settings?section=accounts"]'),
    ).toBeTruthy();
  });

  it("exposes ready only for an explicitly selected active account", async () => {
    useUiStore.setState({ selectedJournalAccountId: "primary" });
    vi.mocked(api.bootstrap).mockResolvedValue(
      bootstrap([account("primary", "Hauptkonto")]),
    );

    renderAccountContext();

    expect(await screen.findByText("ready:primary")).toBeTruthy();
  });

  it("clears an invalid persisted account ID before becoming ready", async () => {
    useUiStore.setState({ selectedJournalAccountId: "missing" });
    vi.mocked(api.bootstrap).mockResolvedValue(
      bootstrap([account("primary", "Hauptkonto")]),
    );

    renderAccountContext();

    await waitFor(() => {
      expect(useUiStore.getState().selectedJournalAccountId).toBeNull();
    });
    expect(screen.getByText("selectionRequired:none")).toBeTruthy();
  });

  it("clears an archived persisted account ID before becoming ready", async () => {
    useUiStore.setState({ selectedJournalAccountId: "archived" });
    vi.mocked(api.bootstrap).mockResolvedValue(
      bootstrap([
        account("primary", "Hauptkonto"),
        account("archived", "Altes Konto", true),
      ]),
    );

    renderAccountContext();

    await waitFor(() => {
      expect(useUiStore.getState().selectedJournalAccountId).toBeNull();
    });
    expect(screen.getByText("selectionRequired:none")).toBeTruthy();
  });

  it("routes a bootstrap failure to the app error boundary instead of no-account state", async () => {
    vi.mocked(api.bootstrap).mockRejectedValue(
      new Error("Bootstrap fehlgeschlagen"),
    );

    renderAccountContext({ withErrorBoundary: true });

    expect(
      await screen.findByRole("heading", {
        name: "Personal Macro konnte nicht geladen werden.",
      }),
    ).toBeTruthy();
    expect(screen.queryByText("Noch kein Tradingkonto")).toBeNull();
  });

  it("selects an active account with the keyboard", async () => {
    const user = userEvent.setup();
    vi.mocked(api.bootstrap).mockResolvedValue(
      bootstrap([
        account("primary", "Hauptkonto"),
        account("secondary", "Zweitkonto"),
        account("archived", "Altes Konto", true),
      ]),
    );

    renderAccountContext();

    const selector = await screen.findByRole("combobox", {
      name: "Tradingkonto",
    });
    await user.click(selector);
    const options = await screen.findByRole("listbox");
    expect(within(options).getByText("Hauptkonto")).toBeTruthy();
    expect(within(options).queryByText("Altes Konto")).toBeNull();
    await user.keyboard("{ArrowDown}{Enter}");

    expect(await screen.findByText("ready:secondary")).toBeTruthy();
    expect(useUiStore.getState().selectedJournalAccountId).toBe("secondary");
  });

  it("navigates to account management with Arrow and Enter without changing the selected account", async () => {
    const user = userEvent.setup();
    useUiStore.setState({ selectedJournalAccountId: "primary" });
    vi.mocked(api.bootstrap).mockResolvedValue(
      bootstrap([
        account("primary", "Hauptkonto"),
        account("secondary", "Zweitkonto"),
      ]),
    );

    renderAccountContext();

    expect(await screen.findByText("ready:primary")).toBeTruthy();
    const selector = screen.getByRole("combobox", { name: "Tradingkonto" });
    await user.click(selector);
    const options = await screen.findByRole("listbox");
    expect(
      within(options).getByRole("option", { name: "Konten verwalten" }),
    ).toBeTruthy();

    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");

    expect(await screen.findByText("/settings?section=accounts")).toBeTruthy();
    expect(useUiStore.getState().selectedJournalAccountId).toBe("primary");
  });
});
