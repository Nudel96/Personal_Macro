import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SeasonalityOpportunities,
  localSeasonalityDate,
  opportunityChartOption,
  opportunityStatus,
} from "./seasonality-opportunities";
import type {
  SeasonalOpportunity,
  SeasonalityOpportunityInput,
  SeasonalityOpportunityResponse,
} from "../../types/domain";

const mocks = vi.hoisted(() => ({ opportunities: vi.fn() }));
vi.mock("../../services/commands", () => ({
  api: { seasonalityOpportunities: mocks.opportunities },
}));
vi.mock("../../charts/base-chart", () => ({
  BaseChart: () => <div data-testid="seasonal-window-chart" />,
  axisLabel: {},
  axisLine: {},
  splitLine: {},
  tooltip: {},
}));

function row(index = 0): SeasonalOpportunity {
  return {
    id: `test-${index}`,
    symbol: `FX${index}`,
    label: "Synthetische Testreihe",
    comparisonSymbol: null,
    comparisonLabel: null,
    startDate: `2026-09-${String(index + 1).padStart(2, "0")}`,
    endDate: "2026-10-01",
    calendarDays: 30 - index,
    direction: 1,
    meanReturn: 0.02,
    medianReturn: 0.015,
    comparisonMeanReturn: null,
    comparisonMedianReturn: null,
    meanDifference: null,
    medianDifference: null,
    hitRate: 0.8,
    wilsonLowerBound: 0.49,
    volatility: 0.01,
    samples: 10,
    years: [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024],
    observations: [
      {
        year: 2024,
        entryDate: "2024-09-02",
        exitDate: "2024-10-01",
        returnValue: 0.02,
        comparisonReturn: null,
      },
    ],
    curve: [
      { day: 0, mean: 0, samples: 10 },
      { day: 30, mean: 0.02, samples: 10 },
    ],
    source: "EODHD · Forex-Spot",
    sourceSymbol: "EURUSD.FOREX",
    comparisonSourceSymbol: null,
    inverted: false,
    comparisonInverted: false,
  };
}

function response(
  input: SeasonalityOpportunityInput,
): SeasonalityOpportunityResponse {
  const pair: SeasonalOpportunity = {
    ...row(),
    id: "pair",
    symbol: "EUR",
    comparisonSymbol: "JPY",
    comparisonLabel: "JPY gegenüber USD · Spot",
    comparisonSourceSymbol: "USDJPY.FOREX",
    comparisonInverted: true,
    comparisonMeanReturn: -0.015,
    comparisonMedianReturn: -0.01,
    meanDifference: 0.035,
    medianDifference: 0.025,
  };
  return {
    input,
    windows: Array.from({ length: 10 }, (_, index) => row(index)),
    divergences: [pair],
    instrumentCount: 7,
    currencyCount: 7,
    evaluatedWindows: 1000,
    evaluatedDivergences: 2000,
    unavailableReason: null,
    excludedSymbols: [],
  };
}

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SeasonalityOpportunities dataVersion="test-1" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 15, 12));
  mocks.opportunities
    .mockReset()
    .mockImplementation(async (input: SeasonalityOpportunityInput) => {
      if (input.universe === "fxFutures")
        return {
          ...response(input),
          windows: [],
          divergences: [],
          instrumentCount: 0,
          currencyCount: 0,
          unavailableReason: "EODHD enthält keine passende Futures-Historie.",
        };
      return response(input);
    });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("SeasonalityOpportunities", () => {
  it("starts with exclusively FX futures and current local month without substituting spot data", async () => {
    mount();
    expect(await screen.findByText("FX-Futures-Historie fehlt")).toBeTruthy();
    expect(mocks.opportunities).toHaveBeenCalledWith(
      expect.objectContaining({
        universe: "fxFutures",
        month: 9,
        asOf: "2026-09-15",
      }),
    );
    expect(screen.queryByRole("button", { name: /^Rang / })).toBeNull();
    expect(
      screen
        .getByRole("combobox", { name: "Anzahl stärkster Fenster" })
        .querySelectorAll("option"),
    ).toHaveLength(10);
  });

  it("lets the user explicitly select spot data and show the strongest 1 to 10 without rescanning", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(
      await screen.findByRole("button", { name: "Forex-Spotdaten ansehen" }),
    );
    await screen.findByRole("button", { name: /^Rang 1:/ });
    expect(screen.getAllByRole("button", { name: /^Rang / })).toHaveLength(5);
    const calls = mocks.opportunities.mock.calls.length;
    await user.selectOptions(
      screen.getByLabelText("Anzahl stärkster Fenster"),
      "1",
    );
    expect(screen.getAllByRole("button", { name: /^Rang / })).toHaveLength(1);
    await user.selectOptions(
      screen.getByLabelText("Anzahl stärkster Fenster"),
      "10",
    );
    expect(screen.getAllByRole("button", { name: /^Rang / })).toHaveLength(10);
    expect(mocks.opportunities).toHaveBeenCalledTimes(calls);
    await user.click(screen.getByRole("button", { name: /^Rang 10:/ }));
    const detail = screen.getByRole("region", {
      name: "Nachweise zum ausgewählten Fenster",
    });
    expect(within(detail).getByRole("heading").textContent).toContain("10.09.");
    await user.click(
      within(detail).getByText("Historische Termine und Einzeljahre (10)"),
    );
    expect(within(detail).getByText("2024-09-02")).toBeTruthy();
  });

  it("shows opposite currency evidence and reports fewer available results honestly", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(
      await screen.findByRole("button", { name: "Forex-Spotdaten ansehen" }),
    );
    await screen.findByRole("button", { name: /^Rang 1:/ });
    await user.click(screen.getByRole("tab", { name: "Stärkste Divergenzen" }));
    expect(
      await screen.findByText(/nur 1 passende, unterschiedliche Treffer/),
    ).toBeTruthy();
    expect(screen.getByText("EUR ↗ / JPY ↘")).toBeTruthy();
    expect(screen.getByText("Beide Richtungen zugleich")).toBeTruthy();
    expect(screen.getByText(/Kehrwert für die USD-Notierung/)).toBeTruthy();
  });

  it("changes month and applies valid duration filters only on submit", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(
      await screen.findByRole("button", { name: "Forex-Spotdaten ansehen" }),
    );
    await screen.findByRole("button", { name: /^Rang 1:/ });
    await user.selectOptions(
      screen.getByLabelText("Startmonat der Fenster"),
      "12",
    );
    await screen.findByText(/Top 5 Fenster · Dezember 2026/);
    await user.click(screen.getByText("Fensterlänge und Untersuchungsjahre"));
    const calls = mocks.opportunities.mock.calls.length;
    await user.clear(screen.getByLabelText("Minimale Fensterlänge"));
    await user.type(screen.getByLabelText("Minimale Fensterlänge"), "20");
    expect(mocks.opportunities).toHaveBeenCalledTimes(calls);
    await user.click(screen.getByRole("button", { name: "Filter anwenden" }));
    await screen.findByRole("button", { name: /^Rang 1:/ });
    expect(mocks.opportunities).toHaveBeenLastCalledWith(
      expect.objectContaining({ minDays: 20, maxDays: 45, month: 12 }),
    );
  });

  it("surfaces command errors without inventing data", async () => {
    mocks.opportunities.mockRejectedValue({
      message: "Lokaler Datenbestand nicht erreichbar.",
    });
    mount();
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Lokaler Datenbestand nicht erreichbar.",
    );
    expect(screen.queryByRole("button", { name: /^Rang / })).toBeNull();
  });
});

describe("window dates and chart", () => {
  it("uses the local calendar and inclusive activity boundaries", () => {
    expect(localSeasonalityDate(new Date(2026, 8, 1, 0, 10))).toBe(
      "2026-09-01",
    );
    expect(opportunityStatus(row(), "2026-09-01")).toBe("Läuft");
    expect(opportunityStatus(row(), "2026-08-31")).toBe("Bevorstehend");
    expect(opportunityStatus(row(), "2026-10-02")).toBe("Vergangen");
  });
  it("renders one raw aggregate curve and preserves missing observations", () => {
    const fixture = row();
    fixture.curve.splice(1, 0, { day: 10, mean: null, samples: 0 });
    const chart = opportunityChartOption(fixture);
    expect(chart.series).toHaveLength(1);
    expect(chart.series).toEqual([
      expect.objectContaining({ data: [100, null, 102], connectNulls: false }),
    ]);
    expect(fixture.curve[1].mean).toBeNull();
  });
});
