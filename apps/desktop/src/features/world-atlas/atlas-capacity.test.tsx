import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../../services/commands";
import { browserAtlasCapacity } from "../../services/atlas-browser";
import { capacityView, type AtlasCapacityResponse } from "./atlas-capacity";
import { AtlasCapacityPanel } from "./atlas-capacity-panel";
import {
  coverageFamilyTarget,
  coverageMapped,
  coverageOptions,
} from "./atlas-coverage";
import { AtlasDisplayContext } from "./atlas-display-state";
import { atlasSavedContext } from "./atlas-notebook-model";

vi.mock("../../services/commands", () => ({
  isTauri: () => false,
  api: { atlasCapacity: vi.fn(), syncAtlasCapacity: vi.fn() },
}));
vi.mock("../../charts/base-chart", () => ({
  BaseChart: ({ option }: { option: unknown }) => (
    <output data-testid="capacity-options">{JSON.stringify(option)}</output>
  ),
  axisLine: {},
  splitLine: {},
  tooltip: {},
}));
afterEach(cleanup);
function row(id = "m49:276"): AtlasCapacityResponse {
  return {
    ...browserAtlasCapacity(id),
    status: "available",
    profile: {
      geographyId: id,
      providerLabel: id,
      aggregate: false,
      years: [
        { year: 2020, values: { "solar.ongrid": 0, "solar.offgrid": 4 } },
        { year: 2021, values: { "solar.ongrid": null, "solar.offgrid": 6 } },
        { year: 2022, values: { "solar.ongrid": 100, "solar.offgrid": 8 } },
      ],
    },
    provenance: {
      retrievedAt: "2026-09-09T10:00:00Z",
      sourceUpdatedAt: "20260416 08:00",
      sourceLabel: "IRENA",
      files: [
        {
          url: "https://pxweb.irena.org/",
          sha256: "a".repeat(64),
          table: "Country",
          areaCodes: ["DEU"],
        },
      ],
      sourceCellCount: 6,
      numericCellCount: 5,
      areaCount: 1,
      omittedCountryCodes: [],
    },
  };
}
it("erhält echte null, Quellenstriche, Kalenderlücken und getrennte Netzarten", () => {
  expect(
    capacityView([row()], "solar", "ongrid", 2000)?.rows[0].values,
  ).toEqual([0, null, 100]);
  expect(
    capacityView([row()], "solar", "offgrid", 2000)?.rows[0].values,
  ).toEqual([4, 6, 8]);
  expect(capacityView([row()], "solar_pv", "ongrid", 2000)).toBeNull();
  expect(capacityView([row()], "solar", "ongrid", 2023)).toBeNull();
});
it("vergleicht nur denselben lokalen Stand und keine abweichenden Gebietsidentitäten", () => {
  const second = row("m49:356");
  expect(
    capacityView([row(), second], "solar", "ongrid", 2000)?.rows,
  ).toHaveLength(2);
  second.provenance = { ...second.provenance!, files: [] };
  expect(capacityView([row(), second], "solar", "ongrid", 2000)).toBeNull();
  const mismatch = row();
  mismatch.profile!.geographyId = "world";
  expect(capacityView([mismatch], "solar", "ongrid", 2000)).toBeNull();
});
it("verwechselt Quellenregionen nicht mit UN-Regionen und verbucht eine fehlende PV-Reihe nicht als Solarwert", () => {
  expect(coverageMapped("capacity", "irena:africa")).toBe(true);
  expect(coverageMapped("capacity", "un-wpp:903")).toBe(false);
  expect(coverageFamilyTarget("capacity", "irena:africa")).toMatchObject({
    area: "irena:africa",
    perspective: "capacity",
    capacityTech: "solar",
  });
  const options = coverageOptions("m49:276", {
    capacity: { data: row() },
    energy: {},
    history: {},
    demography: {},
    markets: {},
    series: {},
  });
  expect(options.find((o) => o.id === "capacity:solar.ongrid")?.status).toBe(
    "available",
  );
  expect(options.find((o) => o.id === "capacity:solar_pv.ongrid")?.status).toBe(
    "empty",
  );
});
it("öffnet echte Browsergrenzen ohne erfundene Anlagenbilder", () => {
  expect(browserAtlasCapacity("m49:276").status).toBe("desktop_required");
  expect(() => browserAtlasCapacity("../../private")).toThrow();
});
it("zeigt zuerst ein ruhiges Bild, schaltet die Netzart explizit um und bewahrt sie im Merkkontext", async () => {
  vi.mocked(api.atlasCapacity).mockImplementation(async (id) => row(id));
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <AtlasCapacityPanel
        geography={row().geography}
        topicId="electricity:solar"
        showNumbers={false}
        job={null}
        onAreaChange={vi.fn()}
      />
    </QueryClientProvider>,
  );
  const chart = await screen.findByTestId("capacity-options");
  let option = JSON.parse(chart.textContent!);
  expect(option.tooltip.show).toBe(false);
  expect(option.series[0].data).toEqual([0, null, 100]);
  expect(option.series[0].connectNulls).toBe(false);
  expect(option.animation).toBe(false);
  expect(screen.queryByRole("table")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Ohne Netzanschluss" }));
  option = JSON.parse(chart.textContent!);
  expect(option.series[0].data).toEqual([4, 6, 8]);
  fireEvent.change(
    screen.getByRole("combobox", { name: "Anlagentechnologie" }),
    { target: { value: "solar_pv" } },
  );
  expect(screen.queryByTestId("capacity-options")).toBeNull();
  expect(
    screen.getByText(/ein Solar-Gesamtwert ersetzt keine Photovoltaikreihe/),
  ).toBeTruthy();
  expect(
    atlasSavedContext(
      new URLSearchParams(
        "capacityGrid=offgrid&capacityTech=solar_pv&capacitySince=2010",
      ),
    ).params,
  ).toEqual({
    capacityGrid: "offgrid",
    capacityTech: "solar_pv",
    capacitySince: "2010",
  });
  client.clear();
});
it("liest gespeicherte Anzeigeparameter und zeigt Zahlen nur auf ausdrücklichen Wunsch", async () => {
  vi.mocked(api.atlasCapacity).mockImplementation(async (id) => row(id));
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <AtlasDisplayContext.Provider
        value={{
          params: new URLSearchParams(
            "capacityGrid=offgrid&capacitySince=2010",
          ),
          navigate: vi.fn(),
        }}
      >
        <AtlasCapacityPanel
          geography={row().geography}
          topicId="electricity:solar"
          showNumbers
          job={null}
          onAreaChange={vi.fn()}
        />
      </AtlasDisplayContext.Provider>
    </QueryClientProvider>,
  );
  const chart = await screen.findByTestId("capacity-options");
  expect(JSON.parse(chart.textContent!).series[0].data).toEqual([4, 6, 8]);
  expect(
    screen
      .getByRole("button", { name: "Ohne Netzanschluss" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  expect(screen.getByText("Jahreswerte ansehen")).toBeTruthy();
  client.clear();
});
