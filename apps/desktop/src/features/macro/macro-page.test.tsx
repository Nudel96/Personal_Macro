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
  PairTechnicalDashboard,
  TechnicalSignalStatus,
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
    pairTechnicalSignals: vi.fn(),
    refreshPairTechnicalSignals: vi.fn(),
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
  ["industrial_production", "Industrial Production", "growth"],
  ["trade_balance", "Trade Balance", "growth"],
  ["cpi_yoy", "CPI YoY", "inflation"],
  ["ppi_yoy", "PPI YoY", "inflation"],
  ["pce_yoy", "PCE YoY", "inflation"],
  ["interest_rates", "Interest Rates", "rates"],
  ["nfp", "NFP", "labor"],
  ["unemployment_rate", "Unemployment Rate", "labor"],
  ["unemployment_claims", "Unemployment Claims", "labor"],
  ["adp", "ADP", "labor"],
  ["jolts", "Labor Demand", "labor"],
  ["wage_growth", "Wage Growth", "labor"],
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
    sourceLabel:
      currency === "CAD" && key === "gdp"
        ? "Real GDP m/m"
        : currency === "USD" && key === "unemployment_claims"
          ? "Initial Jobless Claims"
          : label,
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
    reportFamily: "legacy",
    traderGroup: "Non-Commercial",
    currency,
    reportDate: "2026-08-04",
    longPositions: 600,
    shortPositions: 400,
    longChange,
    shortChange,
    openInterest: 1_000,
    openInterestChange: -50,
    netPositions: 200,
    netChange: longChange - shortChange,
    netPositionPctOi: 0.2,
    netChangePctOi: (longChange - shortChange) / 1_000,
    longShare: 0.6,
    shortShare: 0.4,
    weeklyLongShareChange:
      latestChangeSignal === 1 ? 0.1564 : latestChangeSignal === -1 ? -0.02 : 0,
    positionPercentile: 0.8,
    changePercentile: 0.75,
    positionSignal: 1,
    changeSignal: 1,
    persistenceSignal: 1,
    latestChangeSignal,
    assessment: {
      scoringVersion: "cot-v4-legacy-noncommercial",
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

function technicalDashboard(): PairTechnicalDashboard {
  const status = (signal: -1 | 0 | 1): TechnicalSignalStatus =>
    signal === 1 ? "bullish" : signal === -1 ? "bearish" : "neutral";
  return {
    asOf: "2026-08-26T12:00:00Z",
    methodVersion: "ohlc4-ema-dmi-v1",
    pairs: currencies.flatMap((base, baseIndex) =>
      currencies.slice(baseIndex + 1).map((quote) => {
        const chartSignal = base === "USD" && quote === "CAD" ? 1 : 0;
        const seasonalitySignal = base === "USD" && quote === "CAD" ? -1 : 0;
        const frame = (signal: -1 | 0 | 1) => ({
          signal,
          status: status(signal),
          reasonCodes:
            signal === 0 ? ["mixed_or_weak_trend"] : ["trend_confirmed"],
          bars: 120,
          latestCandleAt: "2026-08-26T08:00:00Z",
          ohlc4: 1.2345,
          ema20: 1.23,
          ema50: 1.22,
          normalizedSlope: signal * 0.2,
          adx14: 28,
          plusDi14: signal >= 0 ? 30 : 14,
          minusDi14: signal < 0 ? 30 : 14,
        });
        return {
          base,
          quote,
          sourceSymbol: `${base}${quote}`,
          inverted: false,
          chartTrend: {
            signal: chartSignal,
            status: status(chartSignal),
            reasonCodes: ["timeframes_confirmed"],
            fourHour: frame(chartSignal),
            daily: frame(chartSignal),
          },
          seasonalityTrend: {
            signal: seasonalitySignal,
            status: status(seasonalitySignal),
            reasonCodes: ["seasonality_20d_confirmed"],
            tradingDays: 20,
            averageReturn: -0.012,
            medianReturn: -0.009,
            positiveRatio: 0.3,
            samples: 12,
            completeYears: 12,
            calculatedAt: "2026-08-26T10:00:00Z",
          },
        };
      }),
    ),
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
  vi.mocked(api.pairTechnicalSignals).mockResolvedValue(technicalDashboard());
  vi.mocked(api.refreshPairTechnicalSignals).mockResolvedValue(
    technicalDashboard(),
  );
});

describe("MacroPage", () => {
  it("surfaces snapshot health, feed state and a readable signal legend", async () => {
    vi.mocked(api.macroFundamentalsDashboard).mockResolvedValue(dashboard());

    renderPage();

    const snapshot = await screen.findByLabelText("Snapshot-Übersicht");
    expect(within(snapshot).getByText("Datenabdeckung")).toBeTruthy();
    expect(within(snapshot).getByText("Währungsuniversum")).toBeTruthy();
    expect(within(snapshot).getByText("Paarmatrix")).toBeTruthy();
    expect(within(snapshot).getByText("Snapshot-Zeitpunkt")).toBeTruthy();

    const feed = screen.getByLabelText("Economic Feed Status");
    expect(within(feed).getByText("Mapping vollständig")).toBeTruthy();

    const legend = screen.getByLabelText("Signallegende");
    for (const label of [
      "Bullish",
      "Bearish",
      "Neutral",
      "Nicht verfügbar",
      "Teilweise abgeleitet",
    ]) {
      expect(within(legend).getByText(label)).toBeTruthy();
    }
  });

  it("shows the global surprise regime with transparent dimensions", async () => {
    vi.mocked(api.macroFundamentalsDashboard).mockResolvedValue(dashboard());

    renderPage();

    const regime = await screen.findByLabelText("Globales Überraschungsregime");
    expect(within(regime).getByText("Gemischtes Regime")).toBeTruthy();
    expect(within(regime).getByText("Aktivitätsimpuls")).toBeTruthy();
    expect(within(regime).getByText("Inflationsimpuls")).toBeTruthy();
    expect(within(regime).getByText("Zinsüberraschung")).toBeTruthy();
    expect(
      within(regime).getByText(/weder ein Risk-on\/Risk-off-/),
    ).toBeTruthy();
  });

  it("shows the currency score on a fixed diverging gauge with coverage", async () => {
    const data = dashboard();
    const usd = data.currencies.find((currency) => currency.currency === "USD");
    if (!usd) throw new Error("USD fixture missing");
    usd.economicGrowthScore = -5;
    usd.inflationScore = -1;
    usd.ratesScore = 0;
    usd.jobsMarketScore = -4;
    usd.fundamentalsScore = -10;
    usd.economicGrowthBias = "Bearish";
    usd.inflationBias = "Bearish";
    usd.jobsMarketBias = "Bearish";
    usd.fundamentalsBias = "Bearish";
    usd.indicators[0] = {
      ...usd.indicators[0],
      score: 0,
      status: "missingForecast",
      forecastText: null,
      reasonCodes: ["no_same_release_forecast"],
    };
    const cad = data.currencies.find((currency) => currency.currency === "CAD");
    if (!cad) throw new Error("CAD fixture missing");
    cad.indicators = cad.indicators.map((indicator) => ({
      ...indicator,
      score: 0,
      status: "missingForecast",
      forecastText: null,
      reasonCodes: ["no_same_release_forecast"],
    }));
    vi.mocked(api.macroFundamentalsDashboard).mockResolvedValue(data);

    renderPage();

    const gauge = await screen.findByRole("meter", {
      name: "Fundamentals Score USD",
    });
    expect(gauge.getAttribute("aria-valuemin")).toBe("-17");
    expect(gauge.getAttribute("aria-valuemax")).toBe("17");
    expect(gauge.getAttribute("aria-valuenow")).toBe("-10");
    expect(gauge.getAttribute("aria-valuetext")).toContain(
      "16 von 17 Indikatoren bewertet",
    );
    expect(
      screen
        .getByRole("meter", { name: "Wachstum Score" })
        .getAttribute("aria-valuetext"),
    ).toContain("6 Signale bewertet");
    expect(screen.getByText("Separater COT-Faktor · 2/2")).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "CAD, Fundamentals nicht verfügbar",
      }),
    ).toBeTruthy();
  });

  it("renders fundamentals, institutional activity and separate technical confirmations", async () => {
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
      "Technicals",
      "4H / Daily Chart Trend",
      "Seasonality Trend",
    ]) {
      expect(screen.getByRole("columnheader", { name: header })).toBeTruthy();
    }
    expect(
      screen.getByRole("columnheader", { name: "Technicals" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("columnheader", { name: "Sentiment" }),
    ).toBeNull();
    expect(screen.getAllByTestId("forex-pair-row")).toHaveLength(36);
    expect(
      screen
        .getAllByTestId("forex-pair-row")
        .every(
          (row) =>
            within(row).getAllByRole("cell").length === fields.length + 7,
        ),
    ).toBe(true);
    expect(
      within(screen.getAllByTestId("forex-pair-row")[0]).getByRole("rowheader")
        .textContent,
    ).toBe("USDCAD");
    const usdInstitutional = screen.getByLabelText(
      "USD Institutional Activity",
    );
    expect(
      within(usdInstitutional).getByText(
        "Legacy Futures Only · Non-Commercial",
      ),
    ).toBeTruthy();
    expect(
      within(usdInstitutional).getByText("Long-Anteil Δ +15,64 PP"),
    ).toBeTruthy();
    expect(
      within(usdInstitutional).getByText("cot-v4-legacy-noncommercial"),
    ).toBeTruthy();
    expect(screen.getAllByText("Unemployment Claims").length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByText("Initial Jobless Claims")).toBeNull();
  }, 15_000);

  it("shows aligned 4H/Daily and raw 20-day seasonality without changing fundamentals", async () => {
    vi.mocked(api.macroFundamentalsDashboard).mockResolvedValue(dashboard());

    renderPage();
    const rows = await screen.findAllByTestId("forex-pair-row");
    const usdCad = rows.find((row) =>
      within(row).queryByRole("rowheader", { name: "USDCAD" }),
    );
    expect(usdCad).toBeTruthy();
    expect(within(usdCad!).getByTitle(/4H \/ Daily: Bullish/).textContent).toBe(
      "Bullish",
    );
    expect(within(usdCad!).getByTitle(/Seasonality: Bearish/).textContent).toBe(
      "Bearish",
    );
    expect(within(usdCad!).getByTitle("Fundamentals +2").textContent).toBe(
      "+2",
    );
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
    expect(
      within(institutional).getByText("Long-Anteil Δ -2,00 PP"),
    ).toBeTruthy();
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
