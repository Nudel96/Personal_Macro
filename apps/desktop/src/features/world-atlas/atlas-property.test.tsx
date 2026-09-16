import {
  QueryClient,
  QueryClientProvider,
  QueryObserver,
} from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { browserAtlasProperty } from "../../services/atlas-browser";
import { api } from "../../services/commands";
import {
  atlasPropertyCatalog,
  propertyView,
  type AtlasPropertyResponse,
} from "./atlas-property";
import { AtlasPropertyPanel } from "./atlas-property-panel";
import {
  coverageFamilyTarget,
  coverageMapped,
  coverageOptions,
} from "./atlas-coverage";
import {
  atlasSavedContext,
  atlasNotebookSources,
} from "./atlas-notebook-model";
import { atlasCatalog } from "./atlas-catalog";

vi.mock("../../services/commands", () => ({
  isTauri: () => false,
  api: { atlasProperty: vi.fn(), syncAtlasProperty: vi.fn() },
}));
vi.mock("../../charts/base-chart", () => ({
  BaseChart: ({ option }: { option: unknown }) => (
    <output data-testid="property-options">{JSON.stringify(option)}</output>
  ),
  axisLine: {},
  splitLine: {},
  tooltip: {},
}));
afterEach(cleanup);
function row(id = "m49:276"): AtlasPropertyResponse {
  return {
    ...browserAtlasProperty(id),
    status: "available",
    profile: {
      geographyId: id,
      providerCode: "DE",
      providerLabel: "Germany",
      points: [
        {
          period: "1999-Q4",
          real: null,
          nominal: 80,
          realChange: null,
          nominalChange: null,
        },
        {
          period: "2000-Q1",
          real: 100,
          nominal: 110,
          realChange: 0,
          nominalChange: 2,
        },
        {
          period: "2000-Q3",
          real: 90,
          nominal: 120,
          realChange: -20,
          nominalChange: 5,
        },
        {
          period: "2000-Q4",
          real: 130,
          nominal: 150,
          realChange: 30,
          nominalChange: 40,
        },
      ],
    },
    provenance: {
      retrievedAt: "2026-09-09T10:00:00Z",
      fileModifiedAt: null,
      url: atlasPropertyCatalog.sourceUrl,
      sha256: "a".repeat(64),
      sourceRowCount: 12,
      numericCellCount: 12,
      areaCount: 1,
      recipe: "bis-spp-published-2010-index-yoy-v1",
    },
  };
}
it("erhält nominale Vorgeschichte, reale Lücken, echte Null und den gemeinsamen Kalender", () => {
  const view = propertyView([row()], "realChange", 0)!;
  expect(view.periods).toEqual(["2000-Q1", "2000-Q2", "2000-Q3", "2000-Q4"]);
  expect(view.series[0].values).toEqual([0, null, -20, 30]);
  expect(view.limit).toBe(30);
  expect(propertyView([row()], "nominal", 0)!.periods[0]).toBe("1999-Q4");
  expect(propertyView([row()], "real", 0)!.periods[0]).toBe("2000-Q1");
  expect(propertyView([row()], "real", 2020)).toBeNull();
});
it("vergleicht nur dieselbe Quelle mit mindestens einem gemeinsamen Quartal und gleicher Skala", () => {
  const second = row("m49:356");
  second.profile!.points[3].realChange = -75;
  expect(propertyView([row(), second], "realChange", 0)!.limit).toBe(75);
  second.provenance!.recipe = "different";
  expect(propertyView([row(), second], "realChange", 0)).toBeNull();
  const distant = row("m49:356");
  distant.profile!.points.forEach(
    (p) => (p.period = p.period.replace("2000", "2020")),
  );
  expect(propertyView([row(), distant], "realChange", 0)).toBeNull();
  distant.profile!.geographyId = "world";
  expect(propertyView([distant], "nominal", 0)).toBeNull();
});
it("führt alle Quellengebiete eindeutig, nennt nationale Quellen und trennt BIS-Gruppen", () => {
  expect(atlasPropertyCatalog.areas).toHaveLength(61);
  expect(
    new Set(atlasPropertyCatalog.areas.map((a) => a.geographyId)).size,
  ).toBe(61);
  for (const area of atlasPropertyCatalog.areas) {
    expect(
      atlasCatalog.geographies.some((g) => g.id === area.geographyId),
    ).toBe(true);
    expect(area.sourceInstitutions.length).toBeGreaterThan(8);
  }
  expect(coverageMapped("property", "bis:property_world")).toBe(true);
  expect(coverageMapped("property", "world")).toBe(false);
  expect(coverageMapped("property", "un-wpp:903")).toBe(false);
  expect(coverageFamilyTarget("property", "m49:356")).toMatchObject({
    area: "m49:356",
    perspective: "property",
    propertyBasis: "real",
  });
  const missing = row();
  missing.profile!.points.forEach((p) => (p.realChange = null));
  const choices = coverageOptions("m49:276", {
    property: { data: missing },
    energy: {},
    history: {},
    demography: {},
    markets: {},
    series: {},
  });
  expect(
    choices.find((o) => o.id === "property:housing:house_prices:realChange")
      ?.status,
  ).toBe("empty");
  expect(
    choices.find((o) => o.id === "property:housing:house_prices:real")?.status,
  ).toBe("available");
});
it("merkt die vier Darstellungsentscheidungen und die BIS-Herkunft", () => {
  const client = new QueryClient();
  client.setQueryData(["atlas", "property", "m49:276"], row());
  const observer = new QueryObserver(client, {
    queryKey: ["atlas", "property", "m49:276"],
    queryFn: async () => row(),
    staleTime: Infinity,
  });
  const unsubscribe = observer.subscribe(() => {});
  const context = atlasSavedContext(
    new URLSearchParams(
      "topic=housing:house_prices&propertyMode=index&propertyBasis=nominal&propertyScale=proportional&propertySince=1970",
    ),
  );
  expect(context.params).toMatchObject({
    propertyMode: "index",
    propertyBasis: "nominal",
    propertyScale: "proportional",
    propertySince: "1970",
  });
  expect(atlasNotebookSources(client, context)[0]).toMatchObject({
    family: "bis",
    hashes: ["a".repeat(64)],
    recipe: "bis-spp-published-2010-index-yoy-v1",
  });
  unsubscribe();
});
function show(compareId?: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <AtlasPropertyPanel
        geography={row().geography}
        compareId={compareId}
        showNumbers={false}
        job={null}
        onAreaChange={vi.fn()}
      />
    </QueryClientProvider>,
  );
}
it("verbirgt Zahlen und schaltet Preisbasis, relativen Maßstab und die symmetrische Veränderung", async () => {
  vi.mocked(api.atlasProperty).mockImplementation(async (id) => row(id));
  show("m49:356");
  const chart = await screen.findByTestId("property-options");
  let option = JSON.parse(chart.textContent!);
  expect(option.tooltip.show).toBe(false);
  expect(option.yAxis.min).toBe(0);
  expect(option.animation).toBe(false);
  expect(option.series[0].connectNulls).toBe(false);
  expect(screen.queryByRole("table")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Mit Inflation" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Gleiche relative Veränderungen" }),
  );
  option = JSON.parse(chart.textContent!);
  expect(option.yAxis.type).toBe("log");
  expect(option.series[0].data[0]).toBe(80);
  fireEvent.click(screen.getByRole("button", { name: "Steigen & Fallen" }));
  option = JSON.parse(chart.textContent!);
  expect(option.yAxis.type).toBe("value");
  expect(option.yAxis.min).toBe(-option.yAxis.max);
  expect(option.series[0].data).toEqual([2, null, 5, 40]);
});
it("behält das Hauptbild bei fehlendem Vergleich und erklärt die Grenze", async () => {
  vi.mocked(api.atlasProperty).mockImplementation(async (id) =>
    id === "world"
      ? { ...browserAtlasProperty(id), status: "unsupported_area" }
      : row(id),
  );
  show("world");
  expect(await screen.findByTestId("property-options")).toBeTruthy();
  expect(
    await screen.findByText(/Welt: Kein vergleichbares Immobilienbild/),
  ).toBeTruthy();
});
it("liefert im Browser keine erfundenen Daten oder Regionen", () => {
  expect(browserAtlasProperty("m49:156")).toMatchObject({
    status: "desktop_required",
    profile: null,
    provenance: null,
  });
  expect(() => browserAtlasProperty("../private")).toThrow();
});
