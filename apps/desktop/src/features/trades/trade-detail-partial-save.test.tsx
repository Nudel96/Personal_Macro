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
import { toast } from "sonner";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../../services/commands";
import {
  clearPrivateWebSession,
  configurePrivateWebSession,
} from "../../services/private-web-client";
import type { BootstrapData, TradeDetail } from "../../types/domain";
import { TradeDetailDialog } from "./trade-detail-dialog";

afterEach(() => {
  cleanup();
  clearPrivateWebSession();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it("preserves pending detail context across cache refresh and reopen, without repeating the committed update", async () => {
  vi.stubEnv("VITE_PRIVATE_WEB", "true");
  configurePrivateWebSession({
    authenticated: true,
    workspaceId: "fixture-detail",
    revision: 0,
    csrfToken: "a".repeat(32),
    capabilities: ["get_bootstrap_data"],
    writableCommands: [],
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const original = {
    id: "trade-a",
    accountId: "account-a",
    instrument: "EURUSD",
    direction: "long",
    assetClass: "forex",
    status: "open",
    displayTimezone: "Europe/Berlin",
    updatedAt: "2026-01-01T00:00:00Z",
    createdAt: "2026-01-01T00:00:00Z",
  } as TradeDetail;
  const emptyContext = {
    tags: [],
    legs: [],
    checklistItems: [],
    emotions: [],
    customValues: [],
  };
  vi.spyOn(api, "bootstrap").mockResolvedValue({
    accounts: [],
    strategies: [],
    setups: [],
    tags: [{ id: "tag-a", name: "Kontext behalten" }],
    emotions: [],
    mistakes: [],
  } as unknown as BootstrapData);
  vi.spyOn(api, "getTrade").mockResolvedValue(original);
  vi.spyOn(api, "tradeContext").mockResolvedValue(emptyContext);
  vi.spyOn(api, "tradeMistakes").mockResolvedValue([]);
  vi.spyOn(api, "customFields").mockResolvedValue([]);
  vi.spyOn(api, "media").mockResolvedValue([]);
  vi.spyOn(api, "tradeMedia").mockResolvedValue([]);
  const updated = {
    ...original,
    instrument: "GBPUSD",
    updatedAt: "2026-09-24T00:00:00Z",
  };
  const update = vi.spyOn(api, "updateTrade").mockResolvedValue(updated);
  const saveContext = vi
    .spyOn(api, "saveTradeContext")
    .mockRejectedValueOnce(new Error("Kontext abgelehnt."))
    .mockResolvedValue(emptyContext);
  vi.spyOn(toast, "error").mockImplementation(() => "error");
  vi.spyOn(toast, "success").mockImplementation(() => "success");
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const view = () => (
    <QueryClientProvider client={client}>
      <TradeDetailDialog
        accountId="account-a"
        tradeId="trade-a"
        onOpenChange={vi.fn()}
      />
    </QueryClientProvider>
  );
  const mounted = render(view());
  fireEvent.click(await screen.findByText("Kontext behalten"));
  fireEvent.change(screen.getByDisplayValue("EURUSD"), {
    target: { value: "GBPUSD" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Änderungen speichern" }));
  await waitFor(() =>
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining("Die Trade-Änderungen sind gespeichert"),
    ),
  );
  expect(client.getQueryData(["trade", "account-a", "trade-a"])).toMatchObject({
    instrument: "GBPUSD",
  });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["account-journal"] });
  expect(saveContext.mock.calls[0][1].tagIds).toEqual(["tag-a"]);

  // A background cache update must not replace the uncommitted context.
  await act(async () => {
    client.setQueryData(["trade", "account-a", "trade-a"], {
      ...original,
      updatedAt: "2026-09-24T00:01:00Z",
    });
    client.setQueryData(
      ["trade-context", "account-a", "trade-a"],
      emptyContext,
    );
  });
  mounted.unmount();
  render(view());
  fireEvent.click(
    await screen.findByRole("button", { name: "Ergänzungen erneut speichern" }),
  );
  await waitFor(() =>
    expect(toast.success).toHaveBeenCalledWith("Änderungen gespeichert."),
  );
  expect(update).toHaveBeenCalledOnce();
  expect(saveContext).toHaveBeenCalledTimes(2);
  expect(saveContext.mock.calls[1]).toEqual(saveContext.mock.calls[0]);
  cleanup();
  client.clear();
});
