import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../services/commands";
import { useUiStore } from "../../stores/ui-store";
import type { Account, AccountJournal } from "../../types/domain";
import { AccountSettings } from "./account-settings";

const account: Account = {
  id: "a",
  name: "Journal",
  accountType: "personal",
  baseCurrency: "EUR",
  initialBalanceMinor: 100000,
  currentBalanceMinor: 107534,
  defaultRiskPercent: 1,
  isArchived: false,
};
describe("account settings", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    useUiStore.setState({ selectedJournalAccountId: "a" });
    vi.spyOn(api, "accountCashflows").mockResolvedValue([]);
    vi.spyOn(api, "accountJournal").mockResolvedValue({
      accountId: "a",
      currency: "EUR",
      initialBalanceMinor: 100000,
      netPnlMinor: 7534,
      journalBalanceMinor: 107534,
      cashflowMinor: 0,
      capitalCurve: [],
      closedTrades: 2,
      openTrades: 0,
      missingPnlTrades: 0,
      brokerBalanceMinor: null,
    } satisfies AccountJournal);
  });
  afterEach(cleanup);
  const mount = (accounts: Account[]) => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    render(
      <QueryClientProvider client={client}>
        <AccountSettings accounts={accounts} />
      </QueryClientProvider>,
    );
    return client;
  };
  it("requires explicit initial capital and preserves an intentional zero", async () => {
    const save = vi
      .spyOn(api, "saveAccount")
      .mockResolvedValue({ ...account, initialBalanceMinor: 0 });
    mount([]);
    fireEvent.change(screen.getByLabelText("Kontoname"), {
      target: { value: "Neues Konto" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Konto anlegen" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "ausdrücklich 0",
    );
    expect(save).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Startkapital (EUR)"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Konto anlegen" }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
          initialBalanceMinor: 0,
          name: "Neues Konto",
        }),
      ),
    );
  });
  it("books a positive withdrawal entry as negative cashflow without changing P&L", async () => {
    const funding = vi.spyOn(api, "addAccountCashflow").mockResolvedValue({
      id: "flow",
      accountId: "a",
      occurredAt: "2026-09-10T10:00:00Z",
      createdAt: "2026-09-10T10:00:00Z",
      kind: "withdrawal",
      amountMinor: -25000,
    });
    const client = mount([account]);
    const invalidation = vi.spyOn(client, "invalidateQueries");
    fireEvent.click(screen.getByRole("button", { name: "Auszahlen" }));
    fireEvent.change(screen.getByLabelText("Betrag (EUR)"), {
      target: { value: "250,00" },
    });
    expect(await screen.findByText(/Konto-P&L bleibt/)).toHaveTextContent(
      "75,34",
    );
    fireEvent.click(screen.getByRole("button", { name: "Auszahlung buchen" }));
    await waitFor(() =>
      expect(funding).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: "a",
          kind: "withdrawal",
          amountMinor: -25000,
        }),
      ),
    );
    await waitFor(() =>
      expect(invalidation).toHaveBeenCalledWith({ queryKey: ["bootstrap"] }),
    );
  });
});
