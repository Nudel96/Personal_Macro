import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../services/commands";
import {
  browserGovernmentBondDetail,
  browserGovernmentBonds,
} from "../../services/government-bonds-browser";
import { GovernmentBondsPage } from "./government-bonds-page";
import {
  bpsLabel,
  buildBondCurveOption,
  buildBondHistoryOption,
  historyPoints,
  yieldLabel,
} from "./government-bonds-charts";
import type {
  BondDetailInput,
  BondSyncJob,
  GovernmentBondDetail,
  GovernmentBondsDashboard,
} from "./government-bonds-types";

vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
vi.mock("../../services/commands", () => ({
  api: {
    governmentBonds: vi.fn(),
    governmentBondDetail: vi.fn(),
    governmentBondSync: vi.fn(),
    syncGovernmentBonds: vi.fn(),
    cancelGovernmentBondSync: vi.fn(),
  },
  isTauri: () => true,
}));
vi.mock("../../charts/base-chart", () => ({
  BaseChart: ({ ariaLabel }: { ariaLabel: string }) => (
    <div role="img" aria-label={ariaLabel} />
  ),
  axisLabel: {},
  axisLine: {},
  splitLine: {},
  tooltip: {},
}));

let dashboard: GovernmentBondsDashboard;
const points = [
  { date: "2026-09-08", yieldPct: "-0.5123" },
  { date: "2026-09-09", yieldPct: "0" },
];
async function fixture(input: BondDetailInput): Promise<GovernmentBondDetail> {
  const detail = await browserGovernmentBondDetail(input);
  if (detail.primary.instrument) {
    detail.primary.history = points;
    detail.primary.curve = detail.primary.curve.map((p) => ({
      ...p,
      yieldPct: p.maturityMonths === 120 ? "0" : null,
    }));
    detail.curveDate = "2026-09-09";
  }
  return detail;
}
function mount(route = "/government-bonds") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <GovernmentBondsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}
beforeEach(async () => {
  dashboard = await browserGovernmentBonds();
  dashboard.desktop = true;
  dashboard.configured = true;
  dashboard.asOf = "2026-09-10T12:00:00Z";
  for (const i of dashboard.instruments) {
    if (i.symbol === "DE10Y.GBOND" || i.symbol === "US10Y.GBOND") {
      i.date = "2026-09-09";
      i.yieldPct = i.countryId === "DEU" ? "-0.5123" : "0";
      i.changeBps = "0";
      i.previousDate = "2026-09-08";
      i.fetchedAt = "2026-09-10T10:00:00Z";
    }
  }
  vi.mocked(api.governmentBonds).mockResolvedValue(dashboard);
  vi.mocked(api.governmentBondDetail).mockImplementation(fixture);
  vi.mocked(api.governmentBondSync).mockResolvedValue(null);
  const runningJob: BondSyncJob = {
    id: "sync-1",
    status: "running",
    countryId: null,
    startedAt: dashboard.asOf,
    finishedAt: null,
    total: 266,
    completed: 0,
    skipped: 0,
    failed: 0,
    currentSymbol: null,
    message: "Katalogprüfung",
  };
  vi.mocked(api.syncGovernmentBonds).mockImplementation(async (countryId) => {
    const result = { ...runningJob, countryId: countryId ?? null };
    vi.mocked(api.governmentBondSync).mockResolvedValue(result);
    return result;
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Staatsanleihen", () => {
  it("keeps every country available and distinguishes no source from no loaded data", async () => {
    mount();
    await screen.findByRole("heading", { name: "Staatsanleihen & Yields" });
    expect(screen.getByText("250")).toBeInTheDocument();
    await userEvent.type(
      screen.getByRole("textbox", { name: "Land oder Währung suchen" }),
      "Afghanistan",
    );
    const table = screen.getByRole("region", {
      name: "Staatsanleihe-Renditen nach Land und Laufzeit",
    });
    expect(within(table).getByText("Keine Quellenreihe")).toBeInTheDocument();
    await userEvent.click(
      within(table).getByRole("button", { name: /Afghanistan/ }),
    );
    await waitFor(() =>
      expect(api.governmentBondDetail).toHaveBeenLastCalledWith({
        countryId: "AFG",
        comparisonId: null,
        maturityMonths: 120,
      }),
    );
    expect(
      screen.getByRole("button", { name: "Land aktualisieren" }),
    ).toBeDisabled();
    expect(
      await screen.findByText(/Für Afghanistan ist derzeit keine geprüfte/),
    ).toBeInTheDocument();
  });

  it("shows negative yields, true zero, dates and cached values after a provider failure", async () => {
    dashboard.instruments.find((i) => i.symbol === "US10Y.GBOND")!.lastError =
      "EODHD ist momentan nicht erreichbar.";
    mount();
    expect((await screen.findAllByText("0,00 %")).length).toBeGreaterThan(0);
    expect(screen.getByText("-0,5123 %")).toBeInTheDocument();
    expect(
      await screen.findByText("EODHD ist momentan nicht erreichbar."),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("img", { name: /Renditehistorie 10 J/ }),
    ).toBeInTheDocument();
  });

  it("loads all countries through the real mutation scope", async () => {
    // Keep the interaction fixture small; the separate directory test covers all 250 entries.
    dashboard.countries = dashboard.countries.filter((c) =>
      ["USA", "DEU"].includes(c.id),
    );
    mount();
    await userEvent.click(
      await screen.findByRole("button", { name: "Alle Länder aktualisieren" }),
    );
    expect(api.syncGovernmentBonds).toHaveBeenCalledWith(
      null,
      expect.anything(),
    );
    expect(
      await screen.findByRole("progressbar", {
        name: "Fortschritt der Renditeaktualisierung",
      }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Stoppen" }));
    expect(api.cancelGovernmentBondSync).toHaveBeenCalledWith(
      "sync-1",
      expect.anything(),
    );
  });

  it("preserves country and comparison context when selecting another tenor", async () => {
    mount("/government-bonds?country=DEU&compare=USA&tenor=120");
    const select = await screen.findByLabelText("Historische Laufzeit");
    await userEvent.selectOptions(select, "60");
    await waitFor(() =>
      expect(api.governmentBondDetail).toHaveBeenLastCalledWith({
        countryId: "DEU",
        comparisonId: "USA",
        maturityMonths: 60,
      }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Land aktualisieren" }),
    );
    expect(api.syncGovernmentBonds).toHaveBeenCalledWith(
      "DEU",
      expect.anything(),
    );
  });

  it("does not offer a simulated network sync in the browser", async () => {
    dashboard.desktop = false;
    dashboard.configured = false;
    mount();
    expect(
      await screen.findByText(/Browser-Vorschau: Das weltweite Verzeichnis/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Alle Länder aktualisieren" }),
    ).toBeDisabled();
  });
});

describe("Renditesemantik und Charts", () => {
  it("never manufactures browser yields or interprets the Chile prefix as Switzerland", async () => {
    const result = await browserGovernmentBonds();
    expect(result.countries).toHaveLength(250);
    expect(result.instruments).toHaveLength(266);
    expect(
      result.instruments.every((q) => q.yieldPct === null && q.date === null),
    ).toBe(true);
    expect(
      result.instruments.find((q) => q.symbol === "CH10Y.GBOND")?.countryId,
    ).toBe("CHL");
    expect(
      result.instruments.find((q) => q.symbol === "SW10Y.GBOND")?.countryId,
    ).toBe("CHE");
    expect(
      result.instruments.find((q) => q.symbol === "CN30Y.GBOND")?.currency,
    ).toBeNull();
    expect(result.instruments.some((q) => q.symbol === "USDSB3L1Y.GBOND")).toBe(
      false,
    );
  });
  it("keeps zero and negative values distinct from missing observations and long gaps", () => {
    expect(yieldLabel("0")).toBe("0,00 %");
    expect(yieldLabel(null)).toBe("—");
    expect(bpsLabel("-25")).toBe("-25,0 bp");
    const result = historyPoints(
      [
        { date: "2020-01-01", yieldPct: "-0.5" },
        { date: "2020-01-02", yieldPct: null },
        { date: "2020-02-03", yieldPct: "0" },
      ],
      0,
    );
    expect(result.map((p) => p[1])).toEqual([-0.5, null, null, 0]);
  });
  it("uses numerical maturity distances and does not join absent curve points", async () => {
    const detail = await fixture({
      countryId: "USA",
      comparisonId: null,
      maturityMonths: 120,
    });
    const curve = buildBondCurveOption(detail, ["USA", ""]);
    expect(curve.xAxis).toMatchObject({ type: "value" });
    expect(curve.series).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          connectNulls: false,
          smooth: false,
          data: expect.arrayContaining([
            [120, 0],
            [24, null],
          ]),
        }),
      ]),
    );
    const history = buildBondHistoryOption(detail, ["USA", ""], 0);
    expect(history.yAxis).toMatchObject({ name: "Rendite · % p. a." });
    expect(history.series).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ connectNulls: false, smooth: false }),
      ]),
    );
  });
});
import "@testing-library/jest-dom/vitest";
