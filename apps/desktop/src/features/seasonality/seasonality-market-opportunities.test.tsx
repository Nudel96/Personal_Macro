import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../services/commands";
import {
  asOf,
  marketRow,
  marketWindow,
} from "./__fixtures__/market-window-fixtures";
import { SeasonalityMarketOpportunities } from "./seasonality-market-opportunities";

vi.mock("../../services/commands", () => ({
  api: { seasonalityScreener: vi.fn(), seasonalityScreenerBatch: vi.fn() },
}));
vi.mock("./seasonality-opportunities", () => ({
  OpportunityDetail: ({
    row,
  }: {
    row: { symbol: string; direction: number };
  }) => (
    <section aria-label="Nachweise zum ausgewählten Fenster">
      {row.symbol} · {row.direction === 1 ? "Long" : "Short"}
    </section>
  ),
}));

const generation = "11111111-1111-4111-8111-111111111111";
const clients: QueryClient[] = [];
const props = {
  dataVersion: "test",
  profileVersion: "prices",
  hasProfiles: true,
  generation,
};
function renderChances() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <SeasonalityMarketOpportunities {...props} />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.stubEnv("VITE_PRIVATE_WEB", "false");
  vi.setSystemTime(new Date("2026-10-05T10:00:00Z"));
  vi.mocked(api.seasonalityScreener).mockImplementation(async (input) => [
    marketRow([marketWindow()], "Forex", input?.asOf),
  ]);
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("Chancen im Markt", () => {
  it("starts the native 90-day scan automatically and displays concrete dates and confidence", async () => {
    renderChances();
    const window = await screen.findByRole("button", {
      name: /Rang 1: EURUSD, Long, 10.10.2026 bis 30.10.2026/,
    });
    expect(api.seasonalityScreener).toHaveBeenCalledExactlyOnceWith({ asOf });
    expect(
      screen.getByText(/Nächste 90 Tage · 05.10.2026 – 03.01.2027/),
    ).toBeTruthy();
    expect(
      within(window).getByText(/Start in 5 Tagen · 20 Kalendertage · 20 Jahre/),
    ).toBeTruthy();
    expect(within(window).getByText(/80.*Treffer/)).toBeTruthy();
    expect(within(window).getByText(/Wilson 58/)).toBeTruthy();
    expect(api.seasonalityScreenerBatch).not.toHaveBeenCalled();
  });

  it("gives a stronger Short window first and lets keyboard users select and filter evidence", async () => {
    const short = marketWindow({
      id: "short",
      symbol: "GOLD",
      direction: -1,
      medianReturn: -0.05,
      meanReturn: -0.04,
      wilsonLowerBound: 0.8,
    });
    vi.mocked(api.seasonalityScreener).mockResolvedValue([
      marketRow(),
      marketRow([short], "Metals"),
    ]);
    const user = userEvent.setup();
    renderChances();
    await screen.findByRole("button", { name: /Rang 1: GOLD, Short/ });
    const second = screen.getByRole("button", { name: /Rang 2: EURUSD, Long/ });
    second.focus();
    await user.keyboard("{Enter}");
    expect(
      within(
        screen.getByRole("region", {
          name: "Nachweise zum ausgewählten Fenster",
        }),
      ).getByText("EURUSD · Long"),
    ).toBeTruthy();
    await user.selectOptions(
      screen.getByLabelText("Richtung der Marktchancen"),
      "short",
    );
    expect(screen.queryByRole("button", { name: /EURUSD, Long/ })).toBeNull();
    await user.selectOptions(
      screen.getByLabelText("Assetklasse der Marktchancen"),
      "Forex",
    );
    expect(
      screen.getByText("Keine passenden Fenster in den nächsten 90 Tagen"),
    ).toBeTruthy();
    expect(api.seasonalityScreener).toHaveBeenCalledTimes(1);
  });

  it("refuses stale annual results and shows a retry instead", async () => {
    vi.mocked(api.seasonalityScreener).mockResolvedValue([
      { ...marketRow(), upcomingWindows: undefined },
    ]);
    renderChances();
    expect((await screen.findByRole("alert")).textContent).toMatch(
      /aktuelle.*90-Tage-Suche/,
    );
    expect(screen.queryByRole("button", { name: /Rang 1/ })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Erneut versuchen" }),
    ).toBeTruthy();
  });

  it("refreshes the local day after sleep and never reuses yesterday's cache", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-05T10:00:00Z"));
    renderChances();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(api.seasonalityScreener).toHaveBeenCalledExactlyOnceWith({ asOf });
    await act(async () => {
      vi.setSystemTime(new Date("2026-10-06T10:00:00Z"));
      window.dispatchEvent(new Event("focus"));
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(api.seasonalityScreener).toHaveBeenLastCalledWith({
      asOf: "2026-10-06",
    });
    expect(api.seasonalityScreener).toHaveBeenCalledTimes(2);
    expect(
      screen.getByText(/Nächste 90 Tage · 06.10.2026 – 04.01.2027/),
    ).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(api.seasonalityScreener).toHaveBeenCalledTimes(2);
  });

  it("starts cloud batches explicitly with a pinned generation and day", async () => {
    vi.stubEnv("VITE_PRIVATE_WEB", "true");
    vi.mocked(api.seasonalityScreenerBatch).mockResolvedValue({
      generation,
      rows: [marketRow()],
      nextCursor: null,
      completed: 1,
      total: 1,
    });
    const user = userEvent.setup();
    renderChances();
    expect(api.seasonalityScreenerBatch).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: "Screener berechnen" }),
    );
    await screen.findByRole("button", { name: /Rang 1: EURUSD, Long/ });
    expect(api.seasonalityScreenerBatch).toHaveBeenCalledExactlyOnceWith({
      generation,
      cursor: 0,
      limit: 5,
      screenerInput: { asOf },
    });
    expect(api.seasonalityScreener).not.toHaveBeenCalled();
  });

  it("invalidates completed cloud results when the day changes", async () => {
    vi.stubEnv("VITE_PRIVATE_WEB", "true");
    vi.mocked(api.seasonalityScreenerBatch).mockResolvedValue({
      generation,
      rows: [marketRow()],
      nextCursor: null,
      completed: 1,
      total: 1,
    });
    const user = userEvent.setup();
    renderChances();
    await user.click(
      screen.getByRole("button", { name: "Screener berechnen" }),
    );
    await screen.findByRole("button", { name: /Rang 1: EURUSD, Long/ });
    act(() => {
      vi.setSystemTime(new Date("2026-10-06T10:00:00Z"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Rang 1/ })).toBeNull(),
    );
    expect(api.seasonalityScreenerBatch).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText(/Starte den Screener für die nächsten 90 Tage/),
    ).toBeTruthy();
  });
});
