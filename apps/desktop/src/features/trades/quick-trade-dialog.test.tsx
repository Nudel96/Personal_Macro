import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../services/commands";
import { useUiStore } from "../../stores/ui-store";
import type { Account, BootstrapData, TradeDetail } from "../../types/domain";
import { QuickTradeDialog } from "./quick-trade-dialog";
const account: Account = {
  id: "a",
  name: "Journal",
  baseCurrency: "EUR",
  accountType: "personal",
  initialBalanceMinor: 100000,
  currentBalanceMinor: 100000,
  defaultRiskPercent: 1,
  isArchived: false,
};
vi.mock("../accounts/journal-account-context", () => ({
  useJournalAccount: () => ({ status: "ready", selectedAccount: account }),
}));
describe("simple trade entry", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    useUiStore.setState({ quickTradeOpen: true });
    vi.spyOn(api, "bootstrap").mockResolvedValue({
      accounts: [account],
      setups: [],
    } as unknown as BootstrapData);
  });
  afterEach(cleanup);
  const mount = () =>
    render(
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: {
              queries: { retry: false },
              mutations: { retry: false },
            },
          })
        }
      >
        <QuickTradeDialog />
      </QueryClientProvider>,
    );
  it("saves immediately with only instrument and result; optional risk stays unknown", async () => {
    const create = vi
      .spyOn(api, "createTrade")
      .mockImplementation(
        async (input) => ({ ...input, id: "t" }) as TradeDetail,
      );
    mount();
    expect(screen.queryByText(/Psychologie|MAE|MFE|Stress/)).toBeNull();
    expect(
      screen.queryByRole("textbox", { name: "Positionsgröße" }),
    ).toBeNull();
    fireEvent.change(screen.getByLabelText("Instrument"), {
      target: { value: "EURUSD" },
    });
    fireEvent.change(screen.getByLabelText("Gewinn / Verlust (EUR)"), {
      target: { value: "34,59" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Trade speichern" }));
    await waitFor(() => expect(create).toHaveBeenCalledOnce());
    expect(create.mock.calls[0][0]).toMatchObject({
      accountId: "a",
      status: "closed",
      netPnlMinor: 3459,
      instrument: "EURUSD",
      closedAt: expect.any(String),
    });
    expect(create.mock.calls[0][0].plannedRiskMinor).toBeUndefined();
  });
  it("restores the last keystroke after closing and reopening", async () => {
    mount();
    fireEvent.change(screen.getByLabelText("Instrument"), {
      target: { value: "XAUUSD" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));
    await act(async () => useUiStore.setState({ quickTradeOpen: true }));
    expect(screen.getByLabelText("Instrument")).toHaveValue("XAUUSD");
  });
});
