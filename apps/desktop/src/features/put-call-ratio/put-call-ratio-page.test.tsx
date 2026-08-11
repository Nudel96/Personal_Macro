import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResearchNavigation } from "../../components/layout/app-shell";
import { api } from "../../services/commands";
import {
  browserPutCallDashboard,
  browserSyncPutCall,
} from "../../services/put-call-browser";
import type { PutCallDashboard } from "../../types/domain";
import {
  buildPutCallChartOption,
  PutCallRatioPage,
} from "./put-call-ratio-page";

vi.mock("../../services/commands", () => ({
  api: {
    putCallDashboard: vi.fn(),
    syncPutCall: vi.fn(),
  },
  isTauri: () => true,
}));

vi.mock("../../charts/base-chart", () => ({
  BaseChart: () => <div data-testid="put-call-chart" />,
  axisLabel: {},
  axisLine: {},
  splitLine: {},
  tooltip: {},
}));

const assets: PutCallDashboard["assets"] = [
  {
    symbol: "EURUSD",
    label: "EUR/USD",
    sourceSymbol: "Euro FX",
    sourceOrientation: "direct",
  },
  {
    symbol: "GBPUSD",
    label: "GBP/USD",
    sourceSymbol: "British Pound",
    sourceOrientation: "direct",
  },
];

function dashboard(
  overrides: Partial<PutCallDashboard> = {},
): PutCallDashboard {
  return {
    assets,
    selectedAsset: assets[0],
    points: [],
    thresholds: null,
    latestValue: null,
    sentiment: "unavailable",
    calibrationSampleSize: 0,
    lastSuccessfulSyncAt: null,
    lastTradeDate: null,
    lastRunStatus: null,
    lastRunMessage: null,
    nativeOnly: false,
    ...overrides,
  };
}

const point = {
  tradeDate: "2026-08-10",
  rawRatio: 1.5,
  ma5: 1.4,
  callNotionalUsd: 100_000_000,
  putNotionalUsd: 150_000_000,
};

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <PutCallRatioPage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Put/Call Browser contract", () => {
  it("exposes supported assets without fabricating market observations", async () => {
    const dashboard = await browserPutCallDashboard("EURUSD");

    expect(dashboard.assets).toHaveLength(7);
    expect(dashboard.selectedAsset.symbol).toBe("EURUSD");
    expect(dashboard.nativeOnly).toBe(true);
    expect(dashboard.points).toEqual([]);
    expect(dashboard.thresholds).toBeNull();
    expect(dashboard.sentiment).toBe("unavailable");
  });

  it("rejects a browser sync instead of returning mock success", async () => {
    await expect(browserSyncPutCall()).rejects.toMatchObject({
      message: expect.stringContaining("Desktop-App"),
    });
  });
});

describe("PutCallRatioPage", () => {
  it("renders exactly one chart card and no unrelated indicators", async () => {
    vi.mocked(api.putCallDashboard).mockResolvedValue(
      dashboard({ points: [point], calibrationSampleSize: 1 }),
    );

    const { container } = renderPage();

    expect(
      await screen.findByText("Put/Call-Ratio · 5-Tage-Durchschnitt"),
    ).toBeTruthy();
    expect(container.querySelectorAll("section.card")).toHaveLength(1);
    expect(screen.getByRole("combobox", { name: "Asset" })).toBeTruthy();
    expect(screen.getByTestId("put-call-chart")).toBeTruthy();
    expect(screen.queryByText(/H4|D1|Open Interest/)).toBeNull();
  });

  it("shows an honest empty state before five daily observations exist", async () => {
    vi.mocked(api.putCallDashboard).mockResolvedValue(dashboard());

    renderPage();

    expect(await screen.findByText("Noch keine CME-Tageswerte")).toBeTruthy();
    expect(screen.queryByTestId("put-call-chart")).toBeNull();
  });

  it("shows the line without thresholds while calibration is incomplete", async () => {
    vi.mocked(api.putCallDashboard).mockResolvedValue(
      dashboard({ points: [point], calibrationSampleSize: 120 }),
    );

    renderPage();

    expect(await screen.findByTestId("put-call-chart")).toBeTruthy();
    expect(screen.getByText(/120 \/ 252/)).toBeTruthy();
    expect(screen.queryByText(/Bullish bis/)).toBeNull();
    expect(screen.queryByText(/Bearish ab/)).toBeNull();
  });

  it("adds exactly two threshold lines and the current sentiment", () => {
    const complete = dashboard({
      points: [point],
      thresholds: { bullish: 0.7, bearish: 1.3, sampleSize: 252 },
      latestValue: 1.4,
      sentiment: "bearish",
      calibrationSampleSize: 252,
    });

    const option = buildPutCallChartOption(complete);
    const series = Array.isArray(option.series) ? option.series[0] : undefined;
    const markLine = series && "markLine" in series ? series.markLine : null;

    expect(markLine && "data" in markLine ? markLine.data : []).toHaveLength(2);
  });

  it("keeps the chart visible when a refresh fails", async () => {
    vi.mocked(api.putCallDashboard).mockResolvedValue(
      dashboard({ points: [point], calibrationSampleSize: 1 }),
    );
    vi.mocked(api.syncPutCall).mockRejectedValue({
      message: "CME nicht erreichbar",
    });
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("put-call-chart");

    await user.click(screen.getByRole("button", { name: "CME aktualisieren" }));

    expect(await screen.findByText(/CME nicht erreichbar/)).toBeTruthy();
    expect(screen.getByTestId("put-call-chart")).toBeTruthy();
  });

  it("loads the selected asset independently", async () => {
    vi.mocked(api.putCallDashboard).mockImplementation(async (symbol) =>
      dashboard({
        selectedAsset:
          assets.find((asset) => asset.symbol === symbol) ?? assets[0],
      }),
    );
    const user = userEvent.setup();
    renderPage();
    const select = await screen.findByRole("combobox", { name: "Asset" });

    await user.selectOptions(select, "GBPUSD");

    expect(api.putCallDashboard).toHaveBeenCalledWith("GBPUSD");
  });
});

describe("Put/Call research navigation", () => {
  it("exposes the isolated Put/Call Ratio route in its own group", () => {
    render(
      <MemoryRouter>
        <ResearchNavigation />
      </MemoryRouter>,
    );

    expect(screen.getByText("Research")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Put/Call Ratio" }).getAttribute("href"),
    ).toBe("/put-call-ratio");
  });
});
