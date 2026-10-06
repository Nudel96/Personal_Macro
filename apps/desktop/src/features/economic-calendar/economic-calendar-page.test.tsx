import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EconomicCalendarEvent } from "../../types/domain";
import { isPrivateWeb } from "../../services/runtime-mode";
vi.mock("../../services/runtime-mode", () => ({
  isPrivateWeb: vi.fn(() => false),
}));
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
  vi.mocked(isPrivateWeb).mockReturnValue(false);
  vi.clearAllMocks();
});

describe("EconomicCalendarPage", () => {
  it("keeps cloud calendar selection active without offering provider writes", async () => {
    vi.mocked(isPrivateWeb).mockReturnValue(true);
    renderPage();
    await waitFor(() => expect(economicCalendarMock).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole("button", { name: "Kommend" }));
    await waitFor(() =>
      expect(economicCalendarMock).toHaveBeenCalledWith(
        expect.objectContaining({ range: "future30" }),
      ),
    );
    expect(await screen.findByText(/Privater Cloud-Datenstand/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Aktualisieren" })).toBeNull();
  });
  it("opens the full active week with past values and the next upcoming event", async () => {
    economicCalendarMock.mockResolvedValueOnce({
      asOf: "2026-09-10T10:00:00Z",
      from: "2026-09-06T22:00:00Z",
      to: "2026-09-13T22:00:00Z",
      sourceName: "EODHD Economic Events API",
      sourceUrl: "https://eodhd.com/api/economic-events",
      events: [
        { ...events[1], scheduledAt: "2026-09-11T08:00:00Z" },
        { ...events[0], scheduledAt: "2026-09-07T12:30:00Z" },
        {
          ...events[0],
          id: "missing-actual",
          title: "Release ohne Actual",
          scheduledAt: "2026-09-09T12:30:00Z",
          actualText: null,
        },
      ],
    });
    renderPage();

    await screen.findByText("Wirtschaftsdaten dieser Woche");
    expect(economicCalendarMock).toHaveBeenLastCalledWith({
      range: "currentWeek",
      timezoneOffsetMinutes: expect.any(Number),
      timezone: expect.any(String),
    });
    expect(
      screen
        .getByRole("button", { name: "Diese Woche" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(within(rows[1]).getByText("Inflation Rate")).toBeTruthy();
    expect(within(rows[1]).getByText("3.1")).toBeTruthy();
    expect(within(rows[1]).getByText("2.8")).toBeTruthy();
    expect(within(rows[1]).getByText("2.9")).toBeTruthy();
    expect(within(rows[1]).getByText("Vergangen")).toBeTruthy();
    expect(within(rows[2]).getByText("Release ohne Actual")).toBeTruthy();
    expect(within(rows[2]).getByText("—")).toBeTruthy();
    expect(within(rows[3]).getByText("HCOB Manufacturing PMI")).toBeTruthy();
    expect(within(rows[3]).getByText("Kommend")).toBeTruthy();
    expect(screen.getAllByText("HCOB Manufacturing PMI")).toHaveLength(2);
    expect(screen.getAllByText("Inflation Rate")).toHaveLength(1);
  });

  it("keeps past weekly releases visible when no upcoming events remain", async () => {
    economicCalendarMock.mockResolvedValueOnce({
      asOf: "2026-09-13T18:00:00Z",
      from: "2026-09-06T22:00:00Z",
      to: "2026-09-13T22:00:00Z",
      sourceName: "EODHD Economic Events API",
      sourceUrl: "https://eodhd.com/api/economic-events",
      events: [{ ...events[0], scheduledAt: "2026-09-07T12:30:00Z" }],
    });
    renderPage();

    expect(await screen.findByText("Inflation Rate")).toBeTruthy();
    expect(
      screen.getByText("Keine weiteren passenden Termine diese Woche"),
    ).toBeTruthy();
    expect(screen.getByText("3.1")).toBeTruthy();
  });

  it("filters future releases independently by country and category", async () => {
    renderPage();
    await screen.findByText("Wirtschaftsdaten dieser Woche");
    fireEvent.click(screen.getByRole("button", { name: "Kommend" }));
    await screen.findByText("Kommende Macro-Termine");

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
        timezone: expect.any(String),
      });
    });
    expect(await screen.findByText("Vergangene Wirtschaftsdaten")).toBeTruthy();
    expect(screen.getByText("3.1")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Seit Wochenbeginn" }));
    await waitFor(() => {
      expect(economicCalendarMock).toHaveBeenLastCalledWith({
        range: "week",
        timezoneOffsetMinutes: expect.any(Number),
        timezone: expect.any(String),
      });
    });
    await screen.findByText("Vergangene Wirtschaftsdaten");

    fireEvent.click(screen.getByRole("button", { name: "Dieser Monat" }));
    await waitFor(() => {
      expect(economicCalendarMock).toHaveBeenLastCalledWith({
        range: "month",
        timezoneOffsetMinutes: expect.any(Number),
        timezone: expect.any(String),
      });
    });
  });

  it("returns to the full week from upcoming ranges while preserving filters", async () => {
    renderPage();
    await screen.findByText("Wirtschaftsdaten dieser Woche");
    fireEvent.change(screen.getByLabelText("Land"), {
      target: { value: "EUR" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Kommend" }));
    await screen.findByText("Kommende Macro-Termine");

    for (const days of [7, 90]) {
      fireEvent.click(screen.getByRole("button", { name: `${days} Tage` }));
      await waitFor(() => {
        expect(economicCalendarMock).toHaveBeenLastCalledWith({
          range: `future${days}`,
          timezoneOffsetMinutes: expect.any(Number),
          timezone: expect.any(String),
        });
      });
      await screen.findByText("Kommende Macro-Termine");
    }

    fireEvent.click(screen.getByRole("button", { name: "Diese Woche" }));
    await screen.findByText("Wirtschaftsdaten dieser Woche");
    expect((screen.getByLabelText("Land") as HTMLSelectElement).value).toBe(
      "EUR",
    );
    expect(screen.queryByText("Inflation Rate")).toBeNull();
    expect(screen.getAllByText("HCOB Manufacturing PMI")).toHaveLength(2);
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
