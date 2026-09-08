import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { api } from "../../services/commands";
import type { Account } from "../../types/domain";

const journalAccount = vi.hoisted(() => ({
  status: "selectionRequired" as "selectionRequired" | "ready",
  selectedAccountId: null as string | null,
  selectedAccount: null as Account | null,
  accounts: [] as Account[],
  selectAccount: vi.fn(),
}));

vi.mock("../accounts/journal-account-context", () => ({
  useJournalAccount: () => journalAccount,
}));

import { AccountCapitalOverview, AnalyticsPage } from "./analytics-page";

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AnalyticsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AccountCapitalOverview", () => {
  it("shows the current balance of every account in its base currency", () => {
    const accounts: Account[] = [
      {
        id: "main",
        name: "Hauptkonto",
        accountType: "personal",
        baseCurrency: "EUR",
        initialBalanceMinor: 0,
        currentBalanceMinor: 10_000,
        defaultRiskPercent: 1,
        isArchived: false,
      },
    ];

    render(<AccountCapitalOverview accounts={accounts} />);

    expect(screen.getByText("Aktuelles Kapital · Hauptkonto")).toBeTruthy();
    expect(screen.getByText(/100,00/)).toBeTruthy();
  });
});

describe("AnalyticsPage account scope", () => {
  it("does not request account-derived analytics until a journal account is ready", async () => {
    const dashboard = vi
      .spyOn(api, "dashboard")
      .mockImplementation(() => new Promise(() => undefined));
    journalAccount.status = "selectionRequired";
    journalAccount.selectedAccountId = null;
    journalAccount.selectedAccount = null;

    renderPage();

    await waitFor(() => expect(dashboard).not.toHaveBeenCalled());
  });

  it("requests analytics with only the selected account after switching accounts", async () => {
    const dashboard = vi
      .spyOn(api, "dashboard")
      .mockImplementation(() => new Promise(() => undefined));
    journalAccount.status = "ready";
    journalAccount.selectedAccountId = "account-a";
    journalAccount.selectedAccount = {
      id: "account-a",
      name: "Konto A",
      accountType: "personal",
      baseCurrency: "EUR",
      initialBalanceMinor: 0,
      currentBalanceMinor: 0,
      defaultRiskPercent: 1,
      isArchived: false,
    };

    const view = renderPage();
    await waitFor(() =>
      expect(dashboard).toHaveBeenCalledWith("account-a", {}),
    );

    journalAccount.selectedAccountId = "account-b";
    journalAccount.selectedAccount = {
      ...journalAccount.selectedAccount,
      id: "account-b",
      name: "Konto B",
    };
    view.rerender(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter>
          <AnalyticsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(dashboard).toHaveBeenCalledWith("account-b", {}),
    );
  });
});
