import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, isTauri } from "../../services/commands";
import { isPrivateWeb } from "../../services/runtime-mode";
import type {
  CotAssetDetail,
  CotContractView,
  CotDashboard,
  CotParticipantPoint,
} from "../../types/domain";
import { CotComparison } from "./cot-comparison";

vi.mock("../../services/commands", () => ({
  api: { cotAssetDetail: vi.fn(), syncCot: vi.fn() },
  isTauri: vi.fn(() => false),
}));
vi.mock("../../services/runtime-mode", () => ({
  isPrivateWeb: vi.fn(() => true),
}));
vi.mock("../../charts/base-chart", () => ({
  BaseChart: ({
    ariaLabel,
    option,
  }: {
    ariaLabel: string;
    option: unknown;
  }) => (
    <div
      role="img"
      aria-label={ariaLabel}
      data-option={JSON.stringify(option)}
    />
  ),
  axisLabel: {},
  axisLine: {},
  splitLine: {},
  tooltip: {},
}));

const dashboard = {
  cloudGeneration: "generation-a",
  contracts: ["EUR", "USD", "GOLD"].map(
    (symbol) => ({ symbol, displayName: symbol }) as CotContractView,
  ),
  pairs: [],
  currencies: [],
  sourceUrl: "https://www.cftc.gov",
} satisfies CotDashboard;
function detail(symbol: string): CotAssetDetail {
  const points: CotParticipantPoint[] = [];
  const thisYear = new Date().getUTCFullYear();
  for (let year = thisYear - 5; year <= thisYear; year++) {
    for (
      let time = Date.UTC(year, 0, 1);
      time < Date.UTC(year + 1, 0, 1);
      time += 7 * 86400000
    ) {
      points.push({
        reportDate: new Date(time).toISOString().slice(0, 10),
        openInterest: 10000,
        nonCommercialNet: symbol === "EUR" ? 100 : 200,
        commercialNet: -150,
        nonReportableNet: 50,
      });
    }
  }
  return {
    symbol,
    displayName: symbol,
    participantSeries: points,
    series: [],
  } as unknown as CotAssetDetail;
}
function Wrapper() {
  const [selected, setSelected] = useState<[string, string]>(["EUR", "USD"]);
  return (
    <CotComparison
      dashboard={dashboard}
      selected={selected}
      onSelect={setSelected}
    />
  );
}
function renderComparison() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <Wrapper />
    </QueryClientProvider>,
  );
}
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.mocked(isTauri).mockReturnValue(false);
  vi.mocked(isPrivateWeb).mockReturnValue(true);
});

describe("COT side-by-side comparison", () => {
  it("renders all four charts, compares independent markets, and swaps both rows together", async () => {
    vi.mocked(api.cotAssetDetail).mockImplementation(async (input) =>
      detail(input.symbol),
    );
    renderComparison();
    expect(
      await screen.findByRole("img", {
        name: "EUR saisonale COT-Netto-Positionen",
      }),
    ).toBeTruthy();
    expect(screen.getAllByRole("img")).toHaveLength(4);
    expect(api.cotAssetDetail).toHaveBeenCalledWith(
      { symbol: "EUR", lookbackWeeks: 0 },
      "generation-a",
    );
    const charts = screen.getAllByRole("img");
    const left = JSON.parse(charts[0].getAttribute("data-option")!);
    const right = JSON.parse(charts[1].getAttribute("data-option")!);
    expect(left.series).toHaveLength(3);
    expect(left.yAxis).toEqual(right.yAxis);
    expect(left.xAxis.min).toBe(right.xAxis.min);
    const user = userEvent.setup();
    await user.selectOptions(
      screen.getByLabelText("Rechter COT-Markt"),
      "GOLD",
    );
    await screen.findByRole("img", {
      name: "GOLD saisonale COT-Netto-Positionen",
    });
    expect(
      screen.getByRole("img", { name: "EUR saisonale COT-Netto-Positionen" }),
    ).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "COT-Märkte tauschen" }),
    );
    expect(
      (screen.getByLabelText("Linker COT-Markt") as HTMLSelectElement).value,
    ).toBe("GOLD");
    expect(
      (screen.getByLabelText("Rechter COT-Markt") as HTMLSelectElement).value,
    ).toBe("EUR");
    expect(screen.getAllByRole("img")[0].getAttribute("aria-label")).toBe(
      "GOLD COT-Netto-Positionen der drei Teilnehmergruppen",
    );
  });

  it("applies participants, units and lookbacks to both markets without reloading history", async () => {
    vi.mocked(api.cotAssetDetail).mockImplementation(async (input) =>
      detail(input.symbol),
    );
    renderComparison();
    await screen.findByRole("img", {
      name: "EUR saisonale COT-Netto-Positionen",
    });
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("COT-Einheit"), "percentOi");
    await user.selectOptions(
      screen.getByLabelText("Saisonale COT-Teilnehmergruppe"),
      "commercialNet",
    );
    await user.selectOptions(screen.getByLabelText("COT-Zeitraum"), "1");
    await user.click(screen.getByLabelText("10 Jahre"));
    const seasonal = screen
      .getAllByRole("img")
      .slice(2)
      .map((el) => JSON.parse(el.getAttribute("data-option")!));
    expect(seasonal[0].series).toHaveLength(3);
    expect(seasonal[0].series[0].data[0]).toBe(-1.5);
    expect(seasonal[1].series[0].data[0]).toBe(-1.5);
    expect(api.cotAssetDetail).toHaveBeenCalledTimes(2);
    expect(
      screen.queryByRole("button", { name: "Historien laden" }),
    ).toBeNull();
  });

  it("keeps a failed side separate and retries it without replacing the working market", async () => {
    vi.mocked(api.cotAssetDetail).mockImplementation(async (input) => {
      if (input.symbol === "USD") throw new Error("offline");
      return detail(input.symbol);
    });
    renderComparison();
    await screen.findByRole("img", {
      name: "EUR saisonale COT-Netto-Positionen",
    });
    expect(await screen.findAllByRole("alert")).toHaveLength(2);
    vi.mocked(api.cotAssetDetail).mockImplementation(async (input) =>
      detail(input.symbol),
    );
    await userEvent.click(
      within(screen.getAllByRole("alert")[0]).getByRole("button", {
        name: "Erneut versuchen",
      }),
    );
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(4));
  });

  it("does not fabricate participants from a legacy cloud response", async () => {
    vi.mocked(api.cotAssetDetail).mockImplementation(
      async (input) =>
        ({
          ...detail(input.symbol),
          participantSeries: undefined,
          series: [
            { reportDate: "2025-12-30", netPositions: 10, openInterest: 100 },
          ],
        }) as CotAssetDetail,
    );
    renderComparison();
    await screen.findByRole("img", {
      name: "EUR COT-Netto-Positionen der drei Teilnehmergruppen",
    });
    expect(
      screen.getAllByText(
        /Noch nicht im Datenstand: Commercials, Non-Reportables/,
      ),
    ).toHaveLength(2);
    const option = JSON.parse(
      screen.getAllByRole("img")[0].getAttribute("data-option")!,
    );
    expect(option.series[0].data[0][1]).toBeNull();
    expect(option.series[1].data[0][1]).toBe(10);
    expect(
      screen.getAllByText(/Noch keine ausreichende Historie/),
    ).toHaveLength(2);
  });

  it("distinguishes an outdated native backend from insufficient seasonal history", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(isPrivateWeb).mockReturnValue(false);
    vi.mocked(api.cotAssetDetail).mockImplementation(
      async (input) =>
        ({
          ...detail(input.symbol),
          participantSeries: undefined,
          series: [
            { reportDate: "2025-12-30", netPositions: 10, openInterest: 100 },
          ],
        }) as CotAssetDetail,
    );
    renderComparison();
    await screen.findByText(/Die laufende Desktop-Version liefert noch keine/);
    expect(
      (
        screen.getByRole("button", {
          name: "Historien laden",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await userEvent.selectOptions(
      screen.getByLabelText("Saisonale COT-Teilnehmergruppe"),
      "commercialNet",
    );
    expect(
      screen.getAllByText(
        /Für Commercials sind in diesem Datenstand noch keine Teilnehmerdaten geladen/,
      ),
    ).toHaveLength(2);
    expect(screen.queryByText(/Noch keine ausreichende Historie/)).toBeNull();
  });

  it("shows original annual reports and fitted independent axes without reloading", async () => {
    vi.mocked(api.cotAssetDetail).mockImplementation(async (input) =>
      detail(input.symbol),
    );
    renderComparison();
    await screen.findByRole("img", {
      name: "EUR saisonale COT-Netto-Positionen",
    });
    const user = userEvent.setup();
    await user.selectOptions(
      screen.getByLabelText("Saisonale COT-Ansicht"),
      "year",
    );
    await user.selectOptions(
      screen.getByLabelText("Werteskala COT-Saisonalität"),
      "individual",
    );
    const options = screen
      .getAllByRole("img")
      .slice(2)
      .map((el) => JSON.parse(el.getAttribute("data-option")!));
    expect(options[0].series).toHaveLength(1);
    expect(options[0].series[0].data.length).toBeGreaterThan(52);
    expect(options[0].series[0].smooth).toBe(false);
    expect(options[0].yAxis.min).toBeGreaterThan(0);
    expect(options[0].yAxis.min).not.toBe(options[1].yAxis.min);
    expect(api.cotAssetDetail).toHaveBeenCalledTimes(2);
  });

  it("zooms and validates manual bounds per chart, resets on unit changes and preserves data", async () => {
    vi.mocked(api.cotAssetDetail).mockImplementation(async (input) =>
      detail(input.symbol),
    );
    renderComparison();
    await screen.findByRole("img", {
      name: "EUR saisonale COT-Netto-Positionen",
    });
    const chartOption = () =>
      JSON.parse(screen.getAllByRole("img")[0].getAttribute("data-option")!);
    const original = chartOption();
    const user = userEvent.setup();
    await user.click(screen.getAllByText("Werteskala · automatisch")[0]);
    await user.click(
      screen.getByRole("button", {
        name: "Links COT-Verlauf vertikal hineinzoomen",
      }),
    );
    expect(chartOption().yAxis.max - chartOption().yAxis.min).toBeLessThan(
      original.yAxis.max - original.yAxis.min,
    );
    const min = screen.getByLabelText("Links COT-Verlauf Achsenminimum");
    const max = screen.getByLabelText("Links COT-Verlauf Achsenmaximum");
    await user.clear(min);
    await user.type(min, "-50,5");
    await user.clear(max);
    await user.type(max, "50");
    await user.click(
      screen.getByRole("button", {
        name: "Links COT-Verlauf Achsengrenzen übernehmen",
      }),
    );
    expect(chartOption().yAxis.min).toBe(-50.5);
    expect(chartOption().yAxis.max).toBe(50);
    expect(chartOption().series).toEqual(original.series);
    expect(
      JSON.parse(screen.getAllByRole("img")[1].getAttribute("data-option")!)
        .yAxis,
    ).toEqual(original.yAxis);
    await user.clear(screen.getByLabelText("Links COT-Verlauf Achsenmaximum"));
    await user.type(
      screen.getByLabelText("Links COT-Verlauf Achsenmaximum"),
      "-100",
    );
    await user.click(
      screen.getByRole("button", {
        name: "Links COT-Verlauf Achsengrenzen übernehmen",
      }),
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "Minimum muss kleiner",
    );
    expect(chartOption().yAxis.max).toBe(50);
    await user.click(
      screen.getByRole("button", {
        name: "Links COT-Verlauf Werteskala zurücksetzen",
      }),
    );
    expect(chartOption().yAxis).toEqual(original.yAxis);
    await user.click(
      screen.getByRole("button", {
        name: "Links COT-Verlauf vertikal hineinzoomen",
      }),
    );
    await user.selectOptions(screen.getByLabelText("COT-Einheit"), "percentOi");
    expect(
      screen.queryByText("Werteskala · manuell für diesen Chart"),
    ).toBeNull();
    expect(chartOption().yAxis.max).toBeLessThan(3);
  });
});
