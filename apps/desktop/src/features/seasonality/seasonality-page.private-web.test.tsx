import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { api } from "../../services/commands";
import { privateWebCall } from "../../services/private-web-client";
import type {
  SeasonalityAnalysis,
  SeasonalityDashboard,
} from "../../types/domain";
import { SeasonalityPage } from "./seasonality-page";
import { localSeasonalityDate } from "./use-seasonality-date";

const opportunities = vi.hoisted(() => vi.fn(() => null));
vi.mock("./seasonality-opportunities", () => ({
  SeasonalityOpportunities: opportunities,
}));
vi.mock("../../charts/base-chart", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../charts/base-chart")>()),
  BaseChart: () => <div data-testid="seasonality-chart" />,
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../../services/private-web-client", () => ({
  privateWebCall: vi.fn(),
}));
vi.mock("../../services/commands", () => ({
  api: {
    seasonality: vi.fn(),
    analyzeSeasonality: vi.fn(),
    seasonalityAssetDetail: vi.fn(),
    seasonalityScreener: vi.fn(),
    seasonalityScreenerBatch: vi.fn(),
    refreshSeasonality: vi.fn(),
  },
}));

const generation = "9a654938-e146-49bb-9866-9ff4c54c1e50";
const importedAt = "2026-09-24T10:00:00Z";
const filter = { endingDigits: [], includeYears: [], excludeYears: [] };

function dashboard(): SeasonalityDashboard {
  return {
    cloudGeneration: generation,
    cloudImportedAt: importedAt,
    dataVersion: "synthetic-export",
    items: [],
    assets: ["EURUSD", "USDJPY"].map((symbol) => ({
      symbol,
      category: "Forex",
      completeYears: 8,
      qualityStatus: "available",
      calculatedAt: importedAt,
      dataSource: "EODHD",
      missingDays: 0,
    })),
    // These describe the desktop at export time; they must not imply a live
    // cloud collection job or mount an unsupported feature.
    collectionStatus: "running",
    collectionCompleted: 2,
    collectionTotal: 100,
    collectionError: "Synthetic desktop collection message",
  };
}

function analysis(symbol = "EURUSD"): SeasonalityAnalysis {
  return {
    symbol,
    category: "Forex",
    calculatedAt: importedAt,
    historyStart: "2017-01-01",
    historyEnd: "2025-12-31",
    selectedYears: [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024],
    qualityStatus: "available",
    qualityReason: "Synthetic complete years",
    referenceDate: "09-24",
    annualCurve: [],
    trendSegments: [],
    months: [],
    quarters: [],
    forwardReturns: [],
    selectedWindow: {
      startDate: "09-24",
      tradingDays: 20,
      samples: 8,
      years: [],
      yearReturns: [],
      qualityStatus: "available",
    },
    bullishWindows: [],
    bearishWindows: [],
    heatmap: [],
    dataSource: "EODHD",
    missingDays: 0,
  };
}

const clients: QueryClient[] = [];
function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <SeasonalityPage />
    </QueryClientProvider>,
  );
  return client;
}

beforeEach(() => {
  vi.stubEnv("VITE_PRIVATE_WEB", "true");
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  vi.mocked(api.seasonality).mockResolvedValue(dashboard());
  vi.mocked(api.analyzeSeasonality).mockImplementation(async (input) =>
    analysis(input.symbol),
  );
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
});

describe("private SeasonalityPage", () => {
  it("uses only exported markets and binds interactive analyses to the dashboard generation", async () => {
    const user = userEvent.setup();
    const client = renderPage();
    await screen.findByText("Belastbare Kohorte");
    expect(api.analyzeSeasonality).toHaveBeenLastCalledWith(
      expect.objectContaining({ symbol: "EURUSD" }),
      generation,
    );
    expect(
      screen.getByText(/Privater Datenstand · 2 übernommene Profile/),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /Übernommen am .*Keine automatische Cloud-Aktualisierung/,
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /aktualisieren/i })).toBeNull();
    expect(screen.getByText("Chancen im Markt")).toBeTruthy();
    expect(
      screen.queryByLabelText("EODHD-Synchronisationsfortschritt"),
    ).toBeNull();
    expect(
      screen.queryByText("Synthetic desktop collection message"),
    ).toBeNull();
    expect(opportunities).toHaveBeenCalled();
    expect(api.seasonalityScreenerBatch).not.toHaveBeenCalled();
    expect(api.seasonalityScreener).not.toHaveBeenCalled();
    expect(api.refreshSeasonality).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /USDJPY/ }));
    await waitFor(() =>
      expect(api.analyzeSeasonality).toHaveBeenLastCalledWith(
        expect.objectContaining({ symbol: "USDJPY" }),
        generation,
      ),
    );
    await screen.findByText("Belastbare Kohorte");
    await user.click(screen.getByText("Kohorte und Analysefenster anpassen"));
    await user.clear(screen.getByLabelText("Fensterlänge in Handelstagen"));
    await user.type(
      screen.getByLabelText("Fensterlänge in Handelstagen"),
      "30",
    );
    await user.click(
      screen.getByRole("button", { name: "Änderungen übernehmen" }),
    );
    await waitFor(() =>
      expect(api.analyzeSeasonality).toHaveBeenLastCalledWith(
        expect.objectContaining({ symbol: "USDJPY", windowTradingDays: 30 }),
        generation,
      ),
    );

    const nextGeneration = "19aa2e1e-aa46-41e7-8c09-a31a8e0e5748";
    await act(async () => {
      client.setQueryData(["seasonality"], {
        ...dashboard(),
        cloudGeneration: nextGeneration,
      });
    });
    await waitFor(() =>
      expect(api.analyzeSeasonality).toHaveBeenLastCalledWith(
        expect.objectContaining({ symbol: "USDJPY", windowTradingDays: 30 }),
        nextGeneration,
      ),
    );
    expect(api.analyzeSeasonality).toHaveBeenCalledTimes(4);
  });

  it("does not analyze a private dashboard whose generation is missing", async () => {
    vi.mocked(api.seasonality).mockResolvedValue({
      ...dashboard(),
      cloudGeneration: undefined,
    });
    renderPage();
    expect(
      await screen.findByText(
        /Die Versionskennung des übernommenen Datenstands fehlt/,
      ),
    ).toBeTruthy();
    expect(api.analyzeSeasonality).not.toHaveBeenCalled();
    expect(api.seasonalityScreener).not.toHaveBeenCalled();
    expect(opportunities).toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Screener berechnen" }),
    ).toHaveProperty("disabled", true);
  });

  it("does not poll the private snapshot or analysis", async () => {
    vi.useFakeTimers();
    renderPage();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(screen.getByText("Belastbare Kohorte")).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_001);
    });
    expect(api.seasonality).toHaveBeenCalledTimes(1);
    expect(api.analyzeSeasonality).toHaveBeenCalledTimes(1);
    expect(api.seasonalityScreener).not.toHaveBeenCalled();
    expect(api.refreshSeasonality).not.toHaveBeenCalled();
    expect(opportunities).toHaveBeenCalled();
    expect(api.seasonalityScreenerBatch).not.toHaveBeenCalled();
  });

  it("starts the cloud screener only explicitly and pins its generation", async () => {
    vi.mocked(api.seasonalityScreenerBatch).mockResolvedValue({
      generation,
      rows: [],
      nextCursor: null,
      total: 2,
      completed: 2,
    });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Belastbare Kohorte");
    expect(api.seasonalityScreenerBatch).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: "Screener berechnen" }),
    );
    await screen.findByText("Keine passenden Fenster in den nächsten 90 Tagen");
    expect(api.seasonalityScreenerBatch).toHaveBeenCalledExactlyOnceWith({
      generation,
      cursor: 0,
      limit: 5,
      screenerInput: { asOf: localSeasonalityDate() },
    });
    expect(api.seasonalityScreener).not.toHaveBeenCalled();
  });

  it("preserves desktop analysis, opportunities, screener and refresh controls", async () => {
    vi.stubEnv("VITE_PRIVATE_WEB", "false");
    vi.mocked(api.seasonalityScreener).mockResolvedValue([]);
    renderPage();
    await screen.findByText("Belastbare Kohorte");
    expect(api.analyzeSeasonality).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: "EURUSD" }),
    );
    expect(api.seasonalityScreener).toHaveBeenCalledTimes(1);
    expect(opportunities).toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Jetzt aktualisieren" }),
    ).toBeTruthy();
    expect(
      screen.getByLabelText("EODHD-Synchronisationsfortschritt"),
    ).toBeTruthy();
  });
});

describe("seasonality command generation contract", () => {
  it("sends the generation for private detail and analysis, while preserving native payloads", async () => {
    const { api: actualApi } = await vi.importActual<
      typeof import("../../services/commands")
    >("../../services/commands");
    vi.mocked(privateWebCall).mockResolvedValue({});
    vi.mocked(invoke).mockResolvedValue({});
    const input = { symbol: "EURUSD", yearFilter: filter };
    await actualApi.seasonalityAssetDetail("EURUSD", generation);
    await actualApi.analyzeSeasonality(input, generation);
    expect(privateWebCall).toHaveBeenNthCalledWith(
      1,
      "get_seasonality_asset_detail",
      { symbol: "EURUSD", generation },
    );
    expect(privateWebCall).toHaveBeenNthCalledWith(2, "analyze_seasonality", {
      input,
      generation,
    });

    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    await actualApi.seasonalityAssetDetail("EURUSD", generation);
    await actualApi.analyzeSeasonality(input, generation);
    expect(invoke).toHaveBeenNthCalledWith(1, "get_seasonality_asset_detail", {
      symbol: "EURUSD",
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "analyze_seasonality", { input });
  });
});
