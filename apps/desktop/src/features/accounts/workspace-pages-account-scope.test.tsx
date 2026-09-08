import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ComponentType } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../services/commands";
import type { Account, PlaybookSetup } from "../../types/domain";

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
  status: "selectionRequired" as
    "loading" | "noAccounts" | "selectionRequired" | "ready",
  selectedAccountId: null as string | null,
  selectedAccount: null as Account | null,
  accounts: [] as Account[],
  selectAccount: vi.fn(),
}));

vi.mock("./journal-account-context", () => ({
  useJournalAccount: () => journal,
}));

vi.mock("../../charts/base-chart", () => ({
  BaseChart: () => <div data-testid="chart" />,
  axisLabel: {},
  axisLine: {},
  splitLine: {},
  tooltip: {},
}));

import { DashboardPage } from "../dashboard/dashboard-page";
import { MistakesPage } from "../mistakes/mistakes-page";
import { PlaybookPage } from "../playbook/playbook-page";
import { ReviewsPage } from "../reviews/reviews-page";

function select(id: string | null) {
  journal.status = id ? "ready" : "selectionRequired";
  journal.selectedAccountId = id;
  journal.selectedAccount = id ? account(id) : null;
}

function view(client: QueryClient, Page: ComponentType) {
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Page />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function client() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

describe("Reviews, Playbook and Mistakes account boundaries", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.restoreAllMocks();
    journal.accounts = [account("account-a"), account("account-b")];
    select(null);
    journal.selectAccount.mockReset();
  });

  it("gates Reviews and Mistakes before ready and keys their A/B queries", async () => {
    const reviews = vi
      .spyOn(api, "reviews")
      .mockImplementation(() => new Promise(() => undefined));
    const mistakes = vi
      .spyOn(api, "mistakeAnalytics")
      .mockImplementation(() => new Promise(() => undefined));
    const reviewsClient = client();
    const reviewsView = render(view(reviewsClient, ReviewsPage));

    expect(screen.getByRole("heading", { name: "Reviews" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Tradingkonto" })).toBeTruthy();
    await waitFor(() => expect(reviews).not.toHaveBeenCalled());

    select("account-a");
    reviewsView.rerender(view(reviewsClient, ReviewsPage));
    await waitFor(() => expect(reviews).toHaveBeenCalledWith("account-a"));
    select("account-b");
    reviewsView.rerender(view(reviewsClient, ReviewsPage));
    await waitFor(() => expect(reviews).toHaveBeenCalledWith("account-b"));
    expect(
      reviewsClient
        .getQueryCache()
        .getAll()
        .map((query) => query.queryKey),
    ).toEqual(
      expect.arrayContaining([
        ["reviews", "account-a"],
        ["reviews", "account-b"],
      ]),
    );
    reviewsView.unmount();

    select(null);
    const mistakesClient = client();
    const mistakesView = render(view(mistakesClient, MistakesPage));
    expect(screen.getByRole("heading", { name: "Fehleranalyse" })).toBeTruthy();
    await waitFor(() => expect(mistakes).not.toHaveBeenCalled());
    select("account-a");
    mistakesView.rerender(view(mistakesClient, MistakesPage));
    await waitFor(() => expect(mistakes).toHaveBeenCalledWith("account-a"));
    select("account-b");
    mistakesView.rerender(view(mistakesClient, MistakesPage));
    await waitFor(() => expect(mistakes).toHaveBeenCalledWith("account-b"));
    expect(
      mistakesClient
        .getQueryCache()
        .getAll()
        .map((query) => query.queryKey),
    ).toEqual(
      expect.arrayContaining([
        ["mistakes", "account-a"],
        ["mistakes", "account-b"],
      ]),
    );
  });

  it("keeps Playbook editable without an account and renders unavailable counts as a dash", async () => {
    const setup: PlaybookSetup = {
      id: "setup-a",
      name: "Setup A",
      color: "#3b82f6",
      tradeCount: null,
    };
    const playbook = vi.spyOn(api, "playbook").mockResolvedValue([setup]);
    const queryClient = client();
    const page = render(view(queryClient, PlaybookPage));

    await waitFor(() => expect(playbook).toHaveBeenCalledWith(undefined));
    expect(
      screen.getByRole("heading", { name: "Setup Playbook" }),
    ).toBeTruthy();
    expect(await screen.findByText("–")).toBeTruthy();
    expect(
      queryClient
        .getQueryCache()
        .getAll()
        .some(
          (query) =>
            Object.is(query.queryKey[1], null) &&
            query.queryKey[0] === "playbook",
        ),
    ).toBe(true);

    select("account-a");
    page.rerender(view(queryClient, PlaybookPage));
    await waitFor(() => expect(playbook).toHaveBeenCalledWith("account-a"));
  });

  it("snapshots the active account and exact chosen Review period and closes on switch", async () => {
    select("account-a");
    vi.spyOn(api, "reviews").mockResolvedValue([]);
    const dashboard = vi.spyOn(api, "dashboard").mockResolvedValue({
      metrics: { totalTrades: 7 },
    } as never);
    const saveReview = vi.spyOn(api, "saveReview").mockResolvedValue({
      id: "review-a",
      accountId: "account-a",
    } as never);
    const queryClient = client();
    const page = render(view(queryClient, ReviewsPage));

    fireEvent.click(
      await screen.findByRole("button", { name: /Review starten/ }),
    );
    const [from, to] =
      document.querySelectorAll<HTMLInputElement>('input[type="date"]');
    fireEvent.change(from, { target: { value: "2026-08-01" } });
    fireEvent.change(to, { target: { value: "2026-08-07" } });

    await waitFor(() =>
      expect(dashboard).toHaveBeenCalledWith("account-a", {
        dateFrom: "2026-08-01",
        dateTo: "2026-08-07",
      }),
    );
    expect(
      queryClient.getQueryCache().find({
        queryKey: [
          "dashboard",
          "review-snapshot",
          "account-a",
          "2026-08-01",
          "2026-08-07",
        ],
      }),
    ).toBeTruthy();

    const saveDraft = screen.getByRole<HTMLButtonElement>("button", {
      name: /Als Entwurf/,
    });
    await waitFor(() => expect(saveDraft.disabled).toBe(false));
    fireEvent.click(saveDraft);
    await waitFor(() =>
      expect(saveReview).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: "account-a",
          periodStart: "2026-08-01",
          periodEnd: "2026-08-07",
          metricSnapshot: { totalTrades: 7 },
        }),
      ),
    );

    fireEvent.click(
      await screen.findByRole("button", { name: /Review starten/ }),
    );
    select("account-b");
    page.rerender(view(queryClient, ReviewsPage));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("loads Dashboard onboarding Reviews through the ready account", async () => {
    select("account-a");
    vi.spyOn(api, "dashboard").mockImplementation(
      () => new Promise(() => undefined),
    );
    vi.spyOn(api, "listTrades").mockImplementation(
      () => new Promise(() => undefined),
    );
    vi.spyOn(api, "bootstrap").mockImplementation(
      () => new Promise(() => undefined),
    );
    const reviews = vi
      .spyOn(api, "reviews")
      .mockImplementation(() => new Promise(() => undefined));
    const queryClient = client();

    render(view(queryClient, DashboardPage));

    await waitFor(() => expect(reviews).toHaveBeenCalledWith("account-a"));
    expect(
      queryClient.getQueryCache().find({
        queryKey: ["reviews", "account-a"],
      }),
    ).toBeTruthy();
  });
});
