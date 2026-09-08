import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../services/commands";
import type { BootstrapData, TradeDetail } from "../../types/domain";
import { TradeDetailDialog } from "./trade-detail-dialog";

const trade = (accountId: string, id: string, instrument: string) =>
  ({
    id,
    accountId,
    instrument,
    assetClass: "forex",
    direction: "long",
    status: "closed",
    displayTimezone: "Europe/Berlin",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }) as TradeDetail;

const bootstrap = {
  accounts: [],
  strategies: [],
  setups: [],
  tags: [],
  emotions: [],
  mistakes: [],
  databasePath: "test",
  appDataPath: "test",
  calculationVersion: "test",
} as BootstrapData;

describe("TradeDetailDialog account boundary", () => {
  let client: QueryClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    vi.spyOn(api, "bootstrap").mockResolvedValue(bootstrap);
    vi.spyOn(api, "tradeMistakes").mockResolvedValue([]);
    vi.spyOn(api, "tradeContext").mockResolvedValue({
      tags: [],
      legs: [],
      checklistItems: [],
      emotions: [],
      customValues: [],
    });
    vi.spyOn(api, "customFields").mockResolvedValue([]);
    vi.spyOn(api, "media").mockResolvedValue([
      { id: "media-1", originalFilename: "chart.png" } as never,
    ]);
    vi.spyOn(api, "tradeMedia").mockResolvedValue([]);
    vi.spyOn(api, "attachTradeMedia").mockResolvedValue(undefined);
  });

  const view = (accountId?: string, tradeId?: string) => (
    <QueryClientProvider client={client}>
      <TradeDetailDialog
        accountId={accountId}
        tradeId={tradeId}
        onOpenChange={vi.fn()}
      />
    </QueryClientProvider>
  );

  it("hydrates cached reopen, drops A synchronously on B, and invalidates scoped media", async () => {
    const tradeA = trade("account-a", "trade-a", "EURUSD");
    const tradeB = trade("account-b", "trade-b", "XAUUSD");
    client.setQueryData(["trade", "account-a", "trade-a"], tradeA);
    client.setQueryData(["trade", "account-b", "trade-b"], tradeB);
    vi.spyOn(api, "getTrade").mockImplementation(async (accountId, id) =>
      accountId === "account-a" && id === "trade-a" ? tradeA : tradeB,
    );
    const invalidate = vi.spyOn(client, "invalidateQueries");

    const rendered = render(view(undefined, undefined));
    rendered.rerender(view("account-a", "trade-a"));
    expect(await screen.findByDisplayValue("EURUSD")).toBeTruthy();

    rendered.rerender(view("account-b", "trade-b"));
    expect(screen.queryByDisplayValue("EURUSD")).toBeNull();
    expect(await screen.findByDisplayValue("XAUUSD")).toBeTruthy();

    const placeholder = screen.getByRole("option", {
      name: "Screenshot auswählen",
    });
    fireEvent.change(placeholder.parentElement!, {
      target: { value: "media-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Verknüpfen/ }));

    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ["trade-media", "account-b", "trade-b"],
      }),
    );
  });
});
