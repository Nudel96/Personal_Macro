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
import { MemoryRouter } from "react-router-dom";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../services/commands";
import {
  clearPrivateWebSession,
  configurePrivateWebSession,
} from "../../services/private-web-client";
import { useUiStore } from "../../stores/ui-store";
import type {
  Account,
  BootstrapData,
  TradeDetail,
  TradeSummary,
} from "../../types/domain";
import { GuidedTradeDialog } from "./guided-trade-dialog";
import { TradesPage } from "./trades-page";

const account: Account = {
  id: "account-a",
  name: "Journal",
  baseCurrency: "EUR",
  accountType: "personal",
  initialBalanceMinor: 100000,
  currentBalanceMinor: 100000,
  defaultRiskPercent: 1,
  isArchived: false,
};
vi.mock("../accounts/journal-account-context", () => ({
  useJournalAccount: () => ({
    status: "ready",
    selectedAccountId: account.id,
    selectedAccount: account,
  }),
}));
vi.mock("./trade-detail-dialog", () => ({ TradeDetailDialog: () => null }));
vi.mock("./trash-dialog", () => ({ TrashDialog: () => null }));

const context = {
  tags: [],
  legs: [],
  checklistItems: [],
  emotions: [],
  customValues: [],
};
const summary = (id: string, instrument: string): TradeSummary => ({
  id,
  instrument,
  direction: "long",
  status: "open",
  assetClass: "forex",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
});

describe("trade saves after partial success", () => {
  let client: QueryClient;
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv("VITE_PRIVATE_WEB", "true");
    clearPrivateWebSession();
    configurePrivateWebSession({
      authenticated: true,
      workspaceId: "fixture-workspace",
      revision: 0,
      csrfToken: "a".repeat(32),
      capabilities: ["get_bootstrap_data"],
      writableCommands: [],
    });
    client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.spyOn(api, "bootstrap").mockResolvedValue({
      accounts: [account],
      strategies: [],
      setups: [],
      tags: [{ id: "tag-a", name: "Setup" }],
      emotions: [],
      mistakes: [],
    } as unknown as BootstrapData);
    vi.spyOn(toast, "error").mockImplementation(() => "error");
    vi.spyOn(toast, "success").mockImplementation(() => "success");
    useUiStore.setState({ guidedTradeOpen: true });
  });
  afterEach(() => {
    cleanup();
    client.clear();
    clearPrivateWebSession();
    vi.unstubAllEnvs();
  });

  const view = (children: React.ReactNode) => (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );

  it("reopens a partially saved guided entry and retries context without creating a duplicate", async () => {
    const create = vi
      .spyOn(api, "createTrade")
      .mockImplementation(
        async (input) => ({ ...input, id: "committed-trade" }) as TradeDetail,
      );
    const saveContext = vi
      .spyOn(api, "saveTradeContext")
      .mockRejectedValueOnce(
        new Error("Ergänzungen konnten nicht bestätigt werden."),
      )
      .mockResolvedValue(context);
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const mounted = render(view(<GuidedTradeDialog />));
    await waitFor(() =>
      expect(client.getQueryData(["bootstrap"])).toBeDefined(),
    );
    fireEvent.change(screen.getByLabelText("Instrument"), {
      target: { value: "EURUSD" },
    });
    fireEvent.change(screen.getByLabelText("Tags (kommagetrennt)"), {
      target: { value: "Setup" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Als Entwurf" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining("Der Trade ist gespeichert"),
      ),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Ergänzungen erneut speichern" }),
      ).toBeEnabled(),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["trades"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["account-journal"] });
    expect(saveContext).toHaveBeenCalledWith(
      account.id,
      expect.objectContaining({
        tradeId: "committed-trade",
        tagIds: ["tag-a"],
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Dialog schließen" }));
    mounted.unmount();
    render(view(<GuidedTradeDialog />));
    await act(async () => useUiStore.setState({ guidedTradeOpen: true }));
    fireEvent.click(
      screen.getByRole("button", { name: "Ergänzungen erneut speichern" }),
    );
    await waitFor(() =>
      expect(useUiStore.getState().guidedTradeOpen).toBe(false),
    );
    expect(create).toHaveBeenCalledOnce();
    expect(saveContext).toHaveBeenCalledTimes(2);
    expect(saveContext.mock.calls[1]).toEqual(saveContext.mock.calls[0]);
    expect(toast.success).toHaveBeenCalledWith(
      "EURUSD als Datenbank-Entwurf gespeichert.",
    );
  });

  it("does not lock an entry to a nonexistent trade when creation itself fails", async () => {
    const create = vi
      .spyOn(api, "createTrade")
      .mockRejectedValueOnce(new Error("Bitte Instrument prüfen."))
      .mockImplementation(
        async (input) => ({ ...input, id: "committed-trade" }) as TradeDetail,
      );
    const saveContext = vi
      .spyOn(api, "saveTradeContext")
      .mockResolvedValue(context);
    render(view(<GuidedTradeDialog />));
    fireEvent.change(screen.getByLabelText("Instrument"), {
      target: { value: "EURUSD" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Als Entwurf" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Bitte Instrument prüfen."),
    );
    expect(
      screen.queryByRole("button", { name: "Ergänzungen erneut speichern" }),
    ).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Als Entwurf" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Als Entwurf" }));
    await waitFor(() =>
      expect(useUiStore.getState().guidedTradeOpen).toBe(false),
    );
    expect(create).toHaveBeenCalledTimes(2);
    expect(saveContext).toHaveBeenCalledOnce();
  });

  it("keeps only unfinished bulk items selected and never repeats the successful write", async () => {
    vi.spyOn(api, "savedViews").mockResolvedValue([]);
    vi.spyOn(api, "listTrades").mockResolvedValue({
      items: [summary("trade-a", "EURUSD"), summary("trade-b", "GBPUSD")],
      page: 1,
      totalPages: 1,
      pageSize: 50,
      total: 2,
    });
    vi.spyOn(api, "tradeContext").mockResolvedValue(context);
    const saveContext = vi
      .spyOn(api, "saveTradeContext")
      .mockResolvedValueOnce(context)
      .mockRejectedValueOnce(new Error("Zweiter Trade nicht gespeichert."))
      .mockResolvedValue(context);
    const invalidate = vi.spyOn(client, "invalidateQueries");
    render(view(<TradesPage />));
    fireEvent.click(
      await screen.findByRole("checkbox", { name: "EURUSD auswählen" }),
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "GBPUSD auswählen" }));
    fireEvent.change(screen.getByLabelText("Tag für Auswahl"), {
      target: { value: "tag-a" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Tag hinzufügen" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining("1 von 2 Trades gespeichert"),
      ),
    );
    expect(
      screen.getByRole("checkbox", { name: "EURUSD auswählen" }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "GBPUSD auswählen" }),
    ).toBeChecked();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["trade-context"] });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Tag hinzufügen" }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Tag hinzufügen" }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Tag zu 1 Trades hinzugefügt.",
      ),
    );
    expect(saveContext.mock.calls.map(([, input]) => input.tradeId)).toEqual([
      "trade-a",
      "trade-b",
      "trade-b",
    ]);
  });
});
