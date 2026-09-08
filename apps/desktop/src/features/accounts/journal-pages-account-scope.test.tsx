import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor, type RenderResult } from "@testing-library/react";
import type { ComponentType } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../services/commands";
import type { Account } from "../../types/domain";

const account = (id: string): Account => ({
  id,
  name: id,
  accountType: "personal",
  baseCurrency: "EUR",
  initialBalanceMinor: 0,
  currentBalanceMinor: 0,
  defaultRiskPercent: 1,
  isArchived: false,
});

const journal = vi.hoisted(() => ({
  status: "selectionRequired" as "selectionRequired" | "ready",
  selectedAccountId: null as string | null,
  selectedAccount: null as Account | null,
  accounts: [] as Account[],
  selectAccount: vi.fn(),
}));

vi.mock("./journal-account-context", () => ({
  useJournalAccount: () => journal,
}));

import { AnalyticsPage } from "../analytics/analytics-page";
import { CalendarPage } from "../calendar/calendar-page";
import { DashboardPage } from "../dashboard/dashboard-page";
import { TradesPage } from "../trades/trades-page";

function wrapper(client: QueryClient, Page: ComponentType) {
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Page />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function select(id: string | null) {
  journal.status = id ? "ready" : "selectionRequired";
  journal.selectedAccountId = id;
  journal.selectedAccount = id ? account(id) : null;
  journal.accounts = id ? [account("account-a"), account("account-b")] : [];
}

describe("journal pages account query boundaries", () => {
  let client: QueryClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    select(null);
    client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.spyOn(api, "bootstrap").mockImplementation(
      () => new Promise(() => undefined),
    );
    vi.spyOn(api, "reviews").mockImplementation(
      () => new Promise(() => undefined),
    );
  });

  async function verifySwitch(
    Page: ComponentType,
    call: ReturnType<typeof vi.spyOn>,
    expectedA: unknown[],
    expectedB: unknown[],
    keyPrefix: string,
  ) {
    select(null);
    call.mockClear();
    const view: RenderResult = render(wrapper(client, Page));
    await waitFor(() => expect(call).not.toHaveBeenCalled());

    select("account-a");
    view.rerender(wrapper(client, Page));
    await waitFor(() => expect(call).toHaveBeenCalledWith(...expectedA));

    select("account-b");
    view.rerender(wrapper(client, Page));
    await waitFor(() => expect(call).toHaveBeenCalledWith(...expectedB));

    const keys = client
      .getQueryCache()
      .getAll()
      .map((query) => query.queryKey);
    expect(
      keys.some((key) => key[0] === keyPrefix && key.includes("account-a")),
    ).toBe(true);
    expect(
      keys.some((key) => key[0] === keyPrefix && key.includes("account-b")),
    ).toBe(true);
    view.unmount();
  }

  it("keeps Dashboard, Trades, Calendar and Analytics on the ready account", async () => {
    const dashboard = vi
      .spyOn(api, "dashboard")
      .mockImplementation(() => new Promise(() => undefined));
    const listTrades = vi
      .spyOn(api, "listTrades")
      .mockImplementation(() => new Promise(() => undefined));
    const calendar = vi
      .spyOn(api, "calendar")
      .mockImplementation(() => new Promise(() => undefined));

    await verifySwitch(
      DashboardPage,
      dashboard,
      ["account-a", expect.any(Object)],
      ["account-b", expect.any(Object)],
      "dashboard",
    );
    dashboard.mockClear();
    await verifySwitch(
      TradesPage,
      listTrades,
      ["account-a", expect.any(Object)],
      ["account-b", expect.any(Object)],
      "trades",
    );
    await verifySwitch(
      CalendarPage,
      calendar,
      ["account-a", expect.any(Object)],
      ["account-b", expect.any(Object)],
      "calendar",
    );
    dashboard.mockClear();
    await verifySwitch(
      AnalyticsPage,
      dashboard,
      ["account-a", {}],
      ["account-b", {}],
      "dashboard",
    );
  });
});
