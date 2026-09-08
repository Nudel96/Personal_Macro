import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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

const tauriMocks = vi.hoisted(() => ({
  open: vi.fn(),
  openUrl: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: tauriMocks.open }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: tauriMocks.openUrl }));

vi.mock("../../services/commands", () => ({
  api: {
    putCallDashboard: vi.fn(),
    syncPutCall: vi.fn(),
    importPutCallPdf: vi.fn(),
    importPutCallXlsx: vi.fn(),
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
    latestRawRatio: null,
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
  callValue: 100_000_000,
  putValue: 150_000_000,
  valueUnit: "usd_notional" as const,
  calculationMethod: "official_notional_pdf" as const,
  methodLabel: "CME Official Notional PCR",
  sourceFile: "fx-put-call.pdf",
  isPreliminary: false,
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
  it("opens the official CME Daily Volume archive in the default browser", async () => {
    vi.mocked(api.putCallDashboard).mockResolvedValue(dashboard());
    tauriMocks.openUrl.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "CME-Archiv öffnen" }),
    );

    expect(tauriMocks.openUrl).toHaveBeenCalledWith(
      "https://www.cmegroup.com/ftp/daily_volume/",
    );
  });

  it("imports multiple selected CME Daily Volume workbooks", async () => {
    vi.mocked(api.putCallDashboard).mockResolvedValue(dashboard());
    vi.mocked(api.importPutCallXlsx).mockResolvedValue({
      selectedFiles: 2,
      validTradingDays: 2,
      storedObservations: 13,
      skippedLowerPriority: 1,
      earliestTradeDate: "2026-08-10",
      latestTradeDate: "2026-08-11",
      importedAt: "2026-08-12T18:00:00Z",
    });
    tauriMocks.open.mockResolvedValue([
      "C:\\Downloads\\daily_volume_20260810.xlsx",
      "C:\\Downloads\\daily_volume_20260811.xlsx",
    ]);
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "XLSX-Dateien importieren" }),
    );

    expect(tauriMocks.open).toHaveBeenCalledWith({
      multiple: true,
      filters: [{ name: "CME Daily Volume", extensions: ["xlsx"] }],
    });
    await waitFor(() =>
      expect(api.importPutCallXlsx).toHaveBeenCalledWith([
        "C:\\Downloads\\daily_volume_20260810.xlsx",
        "C:\\Downloads\\daily_volume_20260811.xlsx",
      ]),
    );
    expect(await screen.findByText(/2 Handelstage/)).toBeTruthy();
    expect(screen.getByText(/13 Beobachtungen gespeichert/)).toBeTruthy();
  });

  it("opens the official CME report in the default browser", async () => {
    vi.mocked(api.putCallDashboard).mockResolvedValue(dashboard());
    tauriMocks.openUrl.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "CME-Report öffnen" }),
    );

    expect(tauriMocks.openUrl).toHaveBeenCalledWith(
      "https://www.cmegroup.com/reports/fx-put-call.pdf",
    );
  });

  it("imports the PDF selected in the native file dialog", async () => {
    vi.mocked(api.putCallDashboard).mockResolvedValue(dashboard());
    vi.mocked(api.importPutCallPdf).mockResolvedValue({
      tradeDate: "2026-08-10",
      storedAssets: 7,
      lastSyncedAt: "2026-08-12T18:00:00Z",
    });
    tauriMocks.open.mockResolvedValue("C:\\Downloads\\fx-put-call.pdf");
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "PDF importieren" }),
    );

    expect(tauriMocks.open).toHaveBeenCalledWith({
      multiple: false,
      filters: [{ name: "CME PDF-Report", extensions: ["pdf"] }],
    });
    await waitFor(() =>
      expect(api.importPutCallPdf).toHaveBeenCalledWith(
        "C:\\Downloads\\fx-put-call.pdf",
      ),
    );
    expect(await screen.findByText(/7 Assets gespeichert/)).toBeTruthy();
  });

  it("does not import anything when PDF selection is cancelled", async () => {
    vi.mocked(api.putCallDashboard).mockResolvedValue(dashboard());
    tauriMocks.open.mockResolvedValue(null);
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "PDF importieren" }),
    );

    await waitFor(() => expect(tauriMocks.open).toHaveBeenCalledOnce());
    expect(api.importPutCallPdf).not.toHaveBeenCalled();
  });

  it("renders exactly one chart card and no unrelated indicators", async () => {
    vi.mocked(api.putCallDashboard).mockResolvedValue(
      dashboard({ points: [point], calibrationSampleSize: 1 }),
    );

    const { container } = renderPage();

    expect(
      await screen.findByText(
        "Put/Call-Ratio · Tageswert und 5-Tage-Durchschnitt",
      ),
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

  it("charts the raw daily PCR before MA5 exists and discloses its method", async () => {
    const rawPoint = {
      ...point,
      ma5: null,
      rawRatio: 2.5,
      callValue: 10,
      putValue: 25,
      valueUnit: "contracts" as const,
      calculationMethod: "contract_volume_pcr" as const,
      methodLabel: "CME Contract-Volume PCR",
      sourceFile: "daily_volume_20260810.xlsx",
      isPreliminary: true,
    };
    vi.mocked(api.putCallDashboard).mockResolvedValue(
      dashboard({
        points: [rawPoint],
        latestRawRatio: 2.5,
        calibrationSampleSize: 0,
      }),
    );

    renderPage();

    expect(await screen.findByTestId("put-call-chart")).toBeTruthy();
    expect(screen.getByText("CME Contract-Volume PCR")).toBeTruthy();
    expect(screen.getByText(/vorläufig/)).toBeTruthy();

    const option = buildPutCallChartOption(
      dashboard({ points: [rawPoint], latestRawRatio: 2.5 }),
    );
    const series = Array.isArray(option.series) ? option.series : [];
    expect(series.map((item) => ("name" in item ? item.name : null))).toEqual([
      "Tages-PCR",
      "5-Tage-PCR (MA5)",
    ]);
    expect("data" in series[0] ? series[0].data : null).toEqual([2.5]);
    expect("data" in series[1] ? series[1].data : null).toEqual([null]);
  });

  it("shows the line without thresholds while the minimum calibration is incomplete", async () => {
    vi.mocked(api.putCallDashboard).mockResolvedValue(
      dashboard({ points: [point], calibrationSampleSize: 19 }),
    );

    renderPage();

    expect(await screen.findByTestId("put-call-chart")).toBeTruthy();
    expect(screen.getByText(/19 \/ 20/)).toBeTruthy();
    expect(screen.queryByText(/High Call Volume ≤/)).toBeNull();
    expect(screen.queryByText(/High Put Volume ≥/)).toBeNull();
  });

  it("adds labeled high-call and high-put lines with shaded extreme zones", () => {
    const complete = dashboard({
      points: [point],
      thresholds: { bullish: 0.7, bearish: 1.3, sampleSize: 252 },
      latestValue: 1.4,
      sentiment: "bearish",
      calibrationSampleSize: 252,
    });

    const option = buildPutCallChartOption(complete);
    const series = Array.isArray(option.series) ? option.series[1] : undefined;
    const markLine = series && "markLine" in series ? series.markLine : null;
    const markArea = series && "markArea" in series ? series.markArea : null;
    const lines = (
      markLine && "data" in markLine ? markLine.data : []
    ) as Array<{
      name?: string;
    }>;

    expect(lines).toHaveLength(2);
    expect(lines.map((line) => line.name ?? null)).toEqual([
      "High Call Volume",
      "High Put Volume",
    ]);
    expect(markArea && "data" in markArea ? markArea.data : []).toHaveLength(2);
  });

  it("explains the daily extreme calibration below the chart", async () => {
    vi.mocked(api.putCallDashboard).mockResolvedValue(
      dashboard({
        points: [point],
        thresholds: { bullish: 0.7, bearish: 1.3, sampleSize: 61 },
        latestValue: 1.4,
        sentiment: "bearish",
        calibrationSampleSize: 61,
      }),
    );

    renderPage();

    expect(
      await screen.findByRole("heading", {
        name: "Was bedeuten die Extremzonen?",
      }),
    ).toBeTruthy();
    expect(screen.getAllByText("High Call Volume")).toHaveLength(1);
    expect(screen.getAllByText("High Put Volume")).toHaveLength(1);
    expect(screen.getByText(/mindestens 20/)).toBeTruthy();
    expect(screen.getByText(/höchstens den letzten 252/)).toBeTruthy();
  });

  it("keeps the chart visible when a PDF import fails", async () => {
    vi.mocked(api.putCallDashboard).mockResolvedValue(
      dashboard({ points: [point], calibrationSampleSize: 1 }),
    );
    tauriMocks.open.mockResolvedValue("C:\\Downloads\\invalid.pdf");
    vi.mocked(api.importPutCallPdf).mockRejectedValue({
      message: "CME-PDF ist ungültig",
    });
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("put-call-chart");

    await user.click(screen.getByRole("button", { name: "PDF importieren" }));

    expect(await screen.findByText(/CME-PDF ist ungültig/)).toBeTruthy();
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
