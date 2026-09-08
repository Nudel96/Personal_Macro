import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../../services/commands";
import type { AudChinaCpiRegimeResponse } from "../../types/domain";
import {
  buildAudChinaCpiChartOption,
  RegimeInsightsPage,
} from "./regime-insights-page";

vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));

vi.mock("../../services/commands", () => ({
  api: {
    audChinaCpiRegime: vi.fn(),
    refreshAudChinaCpiRegime: vi.fn(),
  },
  isTauri: () => true,
}));

vi.mock("../../charts/base-chart", () => ({
  BaseChart: () => <div data-testid="regime-chart" />,
  axisLabel: {},
  axisLine: {},
  splitLine: {},
  tooltip: {},
}));

const day = 86_400_000;
const start = Date.UTC(2024, 0, 1);

function response(timeframe: "D1" | "W1" = "W1"): AudChinaCpiRegimeResponse {
  return {
    asOf: "2026-08-20T10:00:00Z",
    modelVersion: "aud-china-cpi-v1",
    timeframe,
    targetCurrency: "AUD",
    marketSymbol: "AUD/USD",
    marketProxyLabel: "AUDUSD Spot-Proxy (kein kontinuierlicher 6A-Future)",
    marketSourceName: "EODHD Historical Market Data",
    marketSourceUrl: "https://eodhd.com/market",
    macroSourceName: "EODHD Economic Events",
    macroSourceUrl: "https://eodhd.com/macro",
    pointInTimeVintages: false,
    methodology: {
      regimeBasis: "Drei-Monats-Momentum und Sechs-Monats-Steigung.",
      effectiveTiming: "Erst ab dem nächsten Handelstag.",
      validationBasis: "Ein unabhängiger Regimebeginn je Stichprobe.",
      momentumThresholdPp: 0.1,
      slopeThresholdPp: 0.02,
      minimumDirectionalSamples: 5,
    },
    current: {
      state: "falling",
      label: "Fallende Inflation",
      description: "Momentum und Steigung zeigen gemeinsam nach unten.",
      lastReleaseAt: "2024-01-01T02:30:00Z",
      effectiveAt: start + day,
      actual: 1.2,
      change1m: -0.2,
      momentum3m: -0.6,
      slope6m: -0.18,
      durationReleases: 4,
      audBias: "bearish",
      confidence: "medium",
      referenceHorizonWeeks: 12,
      historicalSamples: 8,
      medianForwardReturnPct: -1.8,
      positiveRatio: 0.375,
      averageMfePct: 1.1,
      averageMaePct: -3.2,
    },
    quality: {
      status: "exploratory",
      reason: "Die gemeinsame Historie bleibt begrenzt.",
      cpiObservations: 80,
      priceCandles: 2,
      directionalEpisodes: 8,
      historyStart: "2018-01-01T00:00:00Z",
      historyEnd: "2024-01-01T00:00:00Z",
      overlapStart: "2018-01-02",
      overlapEnd: "2024-01-03",
      latestCpiReleaseAt: "2024-01-01T02:30:00Z",
      latestPriceAt: "2024-01-03",
      revisedReleases: 2,
      warnings: ["Keine vollständigen historischen Daten-Vintages."],
    },
    candles: [
      {
        time: start + day,
        open: 0.66,
        high: 0.68,
        low: 0.65,
        close: 0.67,
        volume: 10,
      },
      {
        time: start + day * 2,
        open: 0.67,
        high: 0.69,
        low: 0.64,
        close: 0.65,
        volume: 12,
      },
    ],
    macroPoints: [
      {
        id: "cpi-1",
        providerType: "Inflation Rate",
        period: "December",
        releasedAt: "2024-01-01T02:30:00Z",
        effectiveAt: start + day,
        actual: 1.2,
        forecast: 1.3,
        previous: 1.4,
        forecastSurprise: -0.1,
        change1m: -0.2,
        momentum3m: -0.6,
        slope6m: -0.18,
        acceleration: -0.1,
        state: "falling",
        revisionCount: 1,
      },
    ],
    intervals: [
      {
        state: "falling",
        startAt: start + day,
        endAt: start + day * 2,
        startReleaseAt: "2024-01-01T02:30:00Z",
        latestReleaseAt: "2024-01-01T02:30:00Z",
        startCpi: 1.2,
        latestCpi: 1.2,
        observations: 1,
        completed: false,
      },
    ],
    episodes: [
      {
        state: "falling",
        startReleaseAt: "2024-01-01T02:30:00Z",
        effectiveStartAt: start + day,
        effectiveEndAt: start + day * 2,
        completed: false,
        observations: 1,
        startCpi: 1.2,
        endCpi: 1.2,
        cpiChangePp: 0,
        startPrice: 0.66,
        endPrice: 0.65,
        returnPct: -1.52,
        maxFavorableExcursionPct: 4.55,
        maxAdverseExcursionPct: -3.03,
      },
    ],
    stateStatistics: [
      {
        state: "falling",
        label: "Fallende Inflation",
        episodes: 8,
        audBias: "bearish",
        confidence: "medium",
        horizons: [
          {
            horizonWeeks: 12,
            tradingDays: 60,
            samples: 8,
            averageReturnPct: -1.5,
            medianReturnPct: -1.8,
            positiveRatio: 0.375,
            p25ReturnPct: -3.1,
            p75ReturnPct: 0.2,
            averageMfePct: 1.1,
            averageMaePct: -3.2,
          },
        ],
      },
      {
        state: "rising",
        label: "Steigende Inflation",
        episodes: 6,
        audBias: "bullish",
        confidence: "low",
        horizons: [
          {
            horizonWeeks: 12,
            tradingDays: 60,
            samples: 6,
            averageReturnPct: 1.2,
            medianReturnPct: 1,
            positiveRatio: 0.67,
            p25ReturnPct: -0.2,
            p75ReturnPct: 2.4,
            averageMfePct: 2.8,
            averageMaePct: -1.2,
          },
        ],
      },
      {
        state: "transition",
        label: "Übergang / uneinheitlich",
        episodes: 2,
        audBias: "unavailable",
        confidence: "unavailable",
        horizons: [],
      },
    ],
  };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <RegimeInsightsPage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("buildAudChinaCpiChartOption", () => {
  it("preserves OHLC order and carries CPI forward only from its effective bar", () => {
    const option = buildAudChinaCpiChartOption(response("D1")) as {
      series: Array<{ name: string; data: unknown[] }>;
    };

    expect(option.series[0]?.data[0]).toEqual([0.66, 0.67, 0.65, 0.68]);
    expect(option.series[1]?.data).toEqual([1.2, 1.2]);
    expect(option.series[2]?.data[0]).toMatchObject({ value: 1.2 });
  });
});

describe("RegimeInsightsPage", () => {
  it("shows the macro state separately from the empirically measured AUD bias", async () => {
    vi.mocked(api.audChinaCpiRegime).mockResolvedValue(response());
    renderPage();

    expect(await screen.findByText("Aktuelles China-CPI-Regime")).toBeTruthy();
    expect(screen.getAllByText("Fallende Inflation").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Historisch bearish").length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        /fallender China CPI ist daher nicht automatisch bearish/,
      ),
    ).toBeTruthy();
    expect(screen.getByTestId("regime-chart")).toBeTruthy();
  });

  it("reloads the native analysis when the user changes from W1 to D1", async () => {
    vi.mocked(api.audChinaCpiRegime).mockImplementation(async ({ timeframe }) =>
      response(timeframe),
    );
    const user = userEvent.setup();
    renderPage();

    await screen.findByTestId("regime-chart");
    await user.click(screen.getByRole("button", { name: "D1" }));

    await waitFor(() =>
      expect(api.audChinaCpiRegime).toHaveBeenCalledWith({ timeframe: "D1" }),
    );
  });
});
