import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EconomicCalendarEvent } from "../../types/domain";
import {
  EconomicCalendarPage,
  filterAndSortEconomicCalendarEvents,
} from "./economic-calendar-page";

const { events, economicCalendarMock } = vi.hoisted(() => ({
  economicCalendarMock: vi.fn(),
  events: [
    {
      id: "usd-cpi",
      country: "US",
      currency: "USD",
      title: "Inflation Rate",
      category: "inflation",
      canonicalKey: "cpi_yoy",
      comparison: "YoY",
      period: "Aug",
      scheduledAt: "2099-08-20T12:30:00Z",
      actualText: "3.1",
      forecastText: "2.8",
      previousText: "2.9",
      frequency: "Monthly",
      affectedAssets: ["USD / FX", "Gold", "S&P 500 / Nasdaq 100"],
      mappingStatus: "automatic",
      sourceUrl: "https://eodhd.com/api/economic-events",
    },
    {
      id: "eur-pmi",
      country: "EU",
      currency: "EUR",
      title: "HCOB Manufacturing PMI",
      category: "growth",
      canonicalKey: "manufacturing_pmi",
      scheduledAt: "2099-08-19T08:00:00Z",
      forecastText: "48.5",
      previousText: "47.9",
      frequency: "Monthly",
      affectedAssets: ["EUR / FX", "Euro Stoxx / DAX"],
      mappingStatus: "automatic",
      sourceUrl: "https://eodhd.com/api/economic-events",
    },
  ] as EconomicCalendarEvent[],
}));

vi.mock("../../services/commands", () => ({
  api: {
    economicCalendar: economicCalendarMock.mockResolvedValue({
      asOf: "2099-08-16T00:00:00Z",
      from: "2099-08-16T00:00:00Z",
      to: "2099-09-15T00:00:00Z",
      sourceName: "EODHD Economic Events API",
      sourceUrl: "https://eodhd.com/api/economic-events",
      events,
    }),
    eodhdFeedStatus: vi.fn().mockResolvedValue({
      configured: true,
      running: false,
    }),
    syncEodhdNow: vi.fn(),
  },
  isTauri: () => true,
}));

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <EconomicCalendarPage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("EconomicCalendarPage", () => {
  it("filters future releases independently by country and category", async () => {
    renderPage();

    expect((await screen.findAllByText("Inflation Rate")).length).toBe(1);
    expect(screen.getAllByText("HCOB Manufacturing PMI").length).toBe(2);

    fireEvent.change(screen.getByLabelText("Land"), {
      target: { value: "EUR" },
    });
    await waitFor(() => {
      expect(screen.queryByText("Inflation Rate")).toBeNull();
    });
    expect(screen.getAllByText("HCOB Manufacturing PMI").length).toBe(2);

    fireEvent.change(screen.getByLabelText("Kategorie"), {
      target: { value: "inflation" },
    });
    expect(
      (await screen.findAllByText("Keine passenden Termine")).length,
    ).toBeGreaterThan(0);
  });

  it("exposes derived cross-asset relevance as its own filter", async () => {
    renderPage();
    await screen.findByText("Inflation Rate");

    fireEvent.change(screen.getByLabelText("Markt / Asset"), {
      target: { value: "Gold" },
    });

    expect(screen.getAllByText("Inflation Rate").length).toBe(2);
    expect(screen.queryByText("HCOB Manufacturing PMI")).toBeNull();
  });

  it("switches to a history limited to today, this week or this month", async () => {
    renderPage();
    await screen.findByText("Inflation Rate");

    fireEvent.click(screen.getByRole("button", { name: "Verlauf" }));
    await waitFor(() => {
      expect(economicCalendarMock).toHaveBeenLastCalledWith({
        range: "today",
        timezoneOffsetMinutes: expect.any(Number),
      });
    });
    expect(await screen.findByText("Vergangene Wirtschaftsdaten")).toBeTruthy();
    expect(screen.getByText("3.1")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Dieser Monat" }));
    await waitFor(() => {
      expect(economicCalendarMock).toHaveBeenLastCalledWith({
        range: "month",
        timezoneOffsetMinutes: expect.any(Number),
      });
    });
  });
});

describe("filterAndSortEconomicCalendarEvents", () => {
  it("sorts by country while keeping chronological order inside a country", () => {
    const result = filterAndSortEconomicCalendarEvents(events, {
      country: "all",
      category: "all",
      asset: "all",
      query: "",
      sort: "country",
    });

    expect(result.map((event) => event.currency)).toEqual(["EUR", "USD"]);
  });

  it("sorts the history with the most recent release first", () => {
    const result = filterAndSortEconomicCalendarEvents(events, {
      country: "all",
      category: "all",
      asset: "all",
      query: "",
      sort: "time",
      chronology: "descending",
    });

    expect(result.map((event) => event.id)).toEqual(["usd-cpi", "eur-pmi"]);
  });
});
