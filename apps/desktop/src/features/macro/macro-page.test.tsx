import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../services/commands";
import type {
  CotContractView,
  CotDashboard,
  FundamentalCurrencyView,
  FundamentalIndicatorView,
  FundamentalPairCellView,
  FundamentalPairView,
  MacroFundamentalsDashboard,
} from "../../types/domain";
import { MacroPage } from "./macro-page";

vi.mock("../../services/commands", () => ({
  api: {
    macroFundamentalsDashboard: vi.fn(),
    eodhdFeedStatus: vi.fn().mockResolvedValue({
      configured: false,
      running: false,
      lastRun: null,
      pendingJobs: 0,
      nextDueAt: null,
      pendingMappingReviews: 0,
      lastSuccessAt: null,
    }),
    eodhdMappingCandidates: vi.fn().mockResolvedValue([]),
    syncEodhdNow: vi.fn(),
    reviewEodhdMappingCandidate: vi.fn(),
    cotDashboard: vi.fn(),
    syncCot: vi.fn(),
  },
  isTauri: () => true,
}));

const currencies = [
  "EUR",
  "GBP",
  "AUD",
  "NZD",
  "USD",
  "CAD",
  "CHF",
  "JPY",
  "CNY",
];

const fields = [
  ["gdp", "GDP", "growth"],
  ["manufacturing_pmi", "mPMI", "growth"],
  ["services_pmi", "sPMI", "growth"],
  ["retail_sales", "Retail Sales", "growth"],
  ["consumer_confidence", "Consumer Confidence", "growth"],
  ["cpi_yoy", "CPI YoY", "inflation"],
  ["ppi_yoy", "PPI YoY", "inflation"],
  ["pce_yoy", "PCE YoY", "inflation"],
  ["interest_rates", "Interest Rates", "rates"],
  ["nfp", "NFP", "labor"],
  ["unemployment_rate", "Unemployment Rate", "labor"],
  ["unemployment_claims", "Unemployment Claims", "labor"],
  ["adp", "ADP", "labor"],
  ["jolts", "JOLTS", "labor"],
] as const;

function indicator(
  currency: string,
  [key, label, factor]: (typeof fields)[number],
): FundamentalIndicatorView {
  const score = currency === "CAD" && key === "gdp" ? 1 : 0;
  return {
    key,
    label,
    factor,
    direction:
      key === "unemployment_rate" || key === "unemployment_claims" ? -1 : 1,
    sourceIndicatorKey: key,
    sourceLabel: currency === "CAD" && key === "gdp" ? "Real GDP m/m" : label,
    actualText: currency === "CAD" && key === "gdp" ? "1.2" : "0",
    forecastText: currency === "CAD" && key === "gdp" ? "1.0" : "0",
    previousText: null,
    surpriseText: currency === "CAD" && key === "gdp" ? "0.2" : "0",
    score,
    status: score === 0 ? "neutral" : "scored",
    reasonCodes: score === 0 ? ["actual_equals_forecast"] : [],
    releasedAt: "2026-07-15",
    pendingNewerReleaseAt: null,
    unit: "%",
    frequency: "Monthly",
    sourceUrl: null,
  };
}

function currencyView(currency: string): FundamentalCurrencyView {
  const growth = currency === "CAD" ? 1 : 0;
  return {
    currency,
    economicGrowthScore: growth,
    inflationScore: 0,
    ratesScore: 0,
    jobsMarketScore: 0,
    fundamentalsScore: growth,
    economicGrowthBias: growth ? "Bullish" : "Neutral",
    inflationBias: "Neutral",
    ratesBias: "Neutral",
    jobsMarketBias: "Neutral",
    fundamentalsBias: growth ? "Bullish" : "Neutral",
    indicators: fields.map((field) => indicator(currency, field)),
  };
}

function pairCell([
  key,
  label,
  factor,
]: (typeof fields)[number]): FundamentalPairCellView {
  return {
    key,
    label,
    factor,
    baseScore: 0,
    quoteScore: 0,
    score: 0,
    available: true,
    baseAvailable: true,
    quoteAvailable: true,
    baseReleasedAt: "2026-07-15T12:00:00Z",
    quoteReleasedAt: "2026-07-01T12:00:00Z",
    baseFrequency: "Monthly",
    quoteFrequency: "Quarterly",
    reasonCodes: [],
  };
}

function pair(base: string, quote: string): FundamentalPairView {
  const fundamentalScore = base === "USD" && quote === "CAD" ? 2 : 0;
  return {
    base,
    quote,
    fundamentalScore,
    biasLabel: fundamentalScore ? "Bullish" : "Neutral",
    cells: fields.map((field) => {
      const cell = pairCell(field);
      return base === "USD" && quote === "CAD" && field[0] === "gdp"
        ? {
            ...cell,
            baseScore: 1,
            quoteScore: -1,
            score: 2,
          }
        : cell;
    }),
  };
}

function dashboard(): MacroFundamentalsDashboard {
  return {
    asOf: "2026-07-29T10:00:00Z",
    snapshotId: "eodhd-snapshot-1",
    currencies: currencies.map(currencyView),
    pairs: currencies.flatMap((base) =>
      currencies
        .filter((quote) => quote !== base)
        .map((quote) => pair(base, quote)),
    ),
  };
}

function cotContract(currency: string): CotContractView {
  const latestChangeSignal =
    currency === "USD" ? 1 : currency === "CAD" ? -1 : 0;
  const pipelineSignal = currency === "CAD" ? 1 : 0;
  const longChange =
    latestChangeSignal === 1 ? 28 : latestChangeSignal === -1 ? 8 : 18;
  const shortChange =
    latestChangeSignal === 1 ? 8 : latestChangeSignal === -1 ? 28 : 18;
  return {
    symbol: currency,
    displayName: `${currency} COT`,
    assetClass: "Währung",
    reportFamily: "tff",
    traderGroup: "Leveraged Funds",
    currency,
    reportDate: "2026-08-04",
    longPositions: 600,
    shortPositions: 400,
    longChange,
    shortChange,
    openInterest: 1_000,
    netPositions: 200,
    netChange: longChange - shortChange,
    netPositionPctOi: 0.2,
    netChangePctOi: (longChange - shortChange) / 1_000,
    positionPercentile: 0.8,
    changePercentile: 0.75,
    positionSignal: 1,
    changeSignal: 1,
    persistenceSignal: 1,
    latestChangeSignal,
    assessment: {
      scoringVersion: "cot-v3",
      status: "available",
      quality: "high",
      biasSignal: pipelineSignal,
      biasLabel:
        pipelineSignal === 1 ? "Bestätigt Bullish" : "Gemischt / Neutral",
      crowdingStatus: "Kein Extrem",
      reportDate: "2026-08-04",
      reasonCodes: pipelineSignal === 0 ? ["mixed_components"] : [],
      why: [],
      components: [],
    },
  };
}

function cotDashboard(): CotDashboard {
  return {
    sourceUrl: "https://publicreporting.cftc.gov/stories/s/r4w3-av2u",
    lastSyncedAt: "2026-08-08T18:00:00Z",
    contracts: currencies
      .filter((currency) => currency !== "CNY")
      .map(cotContract),
    currencies: [],
    pairs: [],
  };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MacroPage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  vi.mocked(api.cotDashboard).mockResolvedValue(cotDashboard());
  vi.mocked(api.syncCot).mockResolvedValue({
    imported: 18,
    lastSyncedAt: "2026-08-08T18:00:00Z",
  });
});

describe("MacroPage", () => {
  it("renders fundamentals and separate institutional activity columns", async () => {
    vi.mocked(api.macroFundamentalsDashboard).mockResolvedValue(dashboard());

    renderPage();
    await screen.findAllByTestId("forex-pair-row");

    for (const header of [
      "Output",
      "Economic Growth & Consumer Strength",
      "Inflation",
      "Rates",
      "Jobs Market",
      "Institutional Activity",
      "Latest Buys/Sells",
      "COT Pipeline",
      "Institutional Score",
    ]) {
      expect(screen.getByRole("columnheader", { name: header })).toBeTruthy();
    }
    expect(
      screen.queryByRole("columnheader", { name: "Technical" }),
    ).toBeNull();
    expect(
      screen.queryByRole("columnheader", { name: "Sentiment" }),
    ).toBeNull();
    expect(screen.getAllByTestId("forex-pair-row")).toHaveLength(36);
    expect(
      screen
        .getAllByTestId("forex-pair-row")
        .every((row) => within(row).getAllByRole("cell").length === 19),
    ).toBe(true);
    expect(
      within(screen.getAllByTestId("forex-pair-row")[0]).getByRole("rowheader")
        .textContent,
    ).toBe("USDCAD");
  });

  it("selects a currency and shows its actual, forecast and surprise", async () => {
    vi.mocked(api.macroFundamentalsDashboard).mockResolvedValue(dashboard());
    const user = userEvent.setup();

    renderPage();
    await screen.findAllByTestId("forex-pair-row");
    const picker = screen.getByLabelText("Währung auswählen");
    const cad = within(picker).getByRole("button", { name: /CAD/ });
    await user.click(cad);

    expect(cad.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("heading", { name: "CAD", level: 3 })).toBeTruthy();
    expect(screen.getByText("Real GDP m/m")).toBeTruthy();
    expect(screen.getByText("1.2")).toBeTruthy();
    expect(screen.getByText("1.0")).toBeTruthy();
    expect(screen.getByText("0.2")).toBeTruthy();

    const institutional = screen.getByLabelText("CAD Institutional Activity");
    expect(within(institutional).getByText("Latest Buys/Sells")).toBeTruthy();
    expect(within(institutional).getByText("COT Pipeline")).toBeTruthy();
    expect(within(institutional).getByText("Long Δ +8")).toBeTruthy();
    expect(within(institutional).getByText("Short Δ +28")).toBeTruthy();
    expect(within(institutional).getByText("Netto Δ -20")).toBeTruthy();
    expect(within(institutional).getByText(/Coverage 2\/2/)).toBeTruthy();
  });

  it("uses the fundamental pair score as the output score", async () => {
    vi.mocked(api.macroFundamentalsDashboard).mockResolvedValue(dashboard());

    renderPage();
    const rows = await screen.findAllByTestId("forex-pair-row");
    const usdCad = rows.find((row) =>
      within(row).queryByRole("rowheader", { name: "USDCAD" }),
    );
    expect(usdCad).toBeTruthy();
    expect(within(usdCad!).getByTitle("Fundamentals +2").textContent).toBe(
      "+2",
    );
  });

  it("contains no Excel import action", async () => {
    vi.mocked(api.macroFundamentalsDashboard).mockResolvedValue({
      ...dashboard(),
      snapshotId: null,
    });
    renderPage();
    expect(
      await screen.findByText(
        "Noch keine EODHD-Fundamentaldaten synchronisiert",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/Excel-Arbeitsmappen/i)).toBeNull();
  });

  it("shows provider run counts and previous values", async () => {
    vi.mocked(api.macroFundamentalsDashboard).mockResolvedValue(dashboard());
    vi.mocked(api.eodhdFeedStatus).mockResolvedValue({
      configured: true,
      running: false,
      lastRun: {
        id: "run-eodhd",
        triggerKind: "scheduled",
        status: "complete",
        startedAt: "2026-08-06T10:00:00Z",
        completedAt: "2026-08-06T10:01:00Z",
        countriesRequested: 9,
        eventsSeen: 494,
        eventsUpdated: 494,
        mappingCandidates: 3,
        snapshotUpdated: true,
      },
      pendingJobs: 0,
      nextDueAt: "2026-08-07T10:01:00Z",
      pendingMappingReviews: 3,
      lastSuccessAt: "2026-08-06T10:01:00Z",
    });

    renderPage();

    expect(await screen.findByText(/494 Releases geprüft/)).toBeTruthy();
    expect(screen.getAllByText("Previous").length).toBeGreaterThan(0);
  });

  it("keeps fundamentals visible when COT loading fails", async () => {
    vi.mocked(api.macroFundamentalsDashboard).mockResolvedValue(dashboard());
    vi.mocked(api.cotDashboard).mockRejectedValueOnce(
      new Error("CFTC nicht erreichbar"),
    );

    renderPage();

    expect(await screen.findAllByTestId("forex-pair-row")).toHaveLength(36);
    expect(
      await screen.findByText("COT-Daten konnten nicht geladen werden."),
    ).toBeTruthy();
  });

  it("starts an independent COT refresh", async () => {
    vi.mocked(api.macroFundamentalsDashboard).mockResolvedValue(dashboard());
    const user = userEvent.setup();

    renderPage();
    await screen.findAllByTestId("forex-pair-row");
    await user.click(screen.getByRole("button", { name: "COT aktualisieren" }));

    expect(api.syncCot).toHaveBeenCalledTimes(1);
  });

  it("exposes semantic intensity and unavailable states for every heatmap family", async () => {
    vi.mocked(api.macroFundamentalsDashboard).mockResolvedValue(dashboard());

    renderPage();
    const rows = await screen.findAllByTestId("forex-pair-row");
    const usdCad = rows.find((row) =>
      within(row).queryByRole("rowheader", { name: "USDCAD" }),
    )!;
    const total = within(usdCad).getByTitle("Fundamentals +2");
    expect(total.className).toContain("heatmap-positive");
    expect(total.getAttribute("data-intensity")).toBe("2");

    const gdp = within(usdCad).getByTitle(/GDP: Base \+1, Quote -1/);
    expect(gdp.className).toContain("heatmap-positive");
    expect(gdp.getAttribute("data-intensity")).toBe("2");

    const latest = within(usdCad).getByTitle(
      /Latest Buys\/Sells: Base USD \+1, Quote CAD -1/,
    );
    expect(latest.className).toContain("heatmap-positive");
    expect(latest.getAttribute("data-intensity")).toBe("2");

    const pipeline = within(usdCad).getByTitle(
      /COT Pipeline: Base USD 0, Quote CAD \+1/,
    );
    expect(pipeline.className).toContain("heatmap-negative");
    expect(pipeline.getAttribute("data-intensity")).toBe("1");

    const usdCny = rows.find((row) =>
      within(row).queryByRole("rowheader", { name: "USDCNY" }),
    )!;
    const unavailable = within(usdCny).getByTitle(
      /Latest Buys\/Sells: Base USD \+1, Quote CNY —.*nicht verfügbar/,
    );
    expect(unavailable.className).toContain("heatmap-unavailable");
    expect(unavailable.textContent).toBe("—");
  });
});
