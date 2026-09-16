import {
  QueryClient,
  QueryClientProvider,
  QueryObserver,
} from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { browserAtlasHousingRatios } from "../../services/atlas-browser";
import { api } from "../../services/commands";
import { atlasCatalog } from "./atlas-catalog";
import {
  coverageFamilyTarget,
  coverageMapped,
  coverageOptions,
} from "./atlas-coverage";
import {
  atlasHousingRatiosCatalog,
  housingRatiosView,
  type AtlasHousingRatiosResponse,
} from "./atlas-housing-ratios";
import { AtlasHousingRatiosPanel } from "./atlas-housing-ratios-panel";
import {
  atlasNotebookSources,
  atlasSavedContext,
} from "./atlas-notebook-model";

vi.mock("../../services/commands", () => ({
  isTauri: () => false,
  api: { atlasHousingRatios: vi.fn(), syncAtlasHousingRatios: vi.fn() },
}));
vi.mock("../../charts/base-chart", () => ({
  BaseChart: ({ option }: { option: unknown }) => (
    <output data-testid="ratio-options">{JSON.stringify(option)}</output>
  ),
  axisLine: {},
  splitLine: {},
  tooltip: {},
}));
afterEach(cleanup);
function row(id = "m49:276"): AtlasHousingRatiosResponse {
  return {
    ...browserAtlasHousingRatios(id),
    status: "available",
    profile: {
      geographyId: id,
      providerCode: "DEU",
      providerLabel: "Germany",
      comparabilityBreaks: [],
      points: [
        {
          period: "1999-Q4",
          income: null,
          rent: 80,
          incomeRelative: null,
          rentRelative: 70,
        },
        {
          period: "2000-Q1",
          income: 100,
          rent: 110,
          incomeRelative: 100,
          rentRelative: 120,
        },
        {
          period: "2000-Q3",
          income: 90,
          rent: 120,
          incomeRelative: 90,
          rentRelative: 130,
        },
        {
          period: "2000-Q4",
          income: 130,
          rent: 150,
          incomeRelative: 130,
          rentRelative: 160,
        },
      ],
    },
    provenance: {
      retrievedAt: "2026-09-09T10:00:00Z",
      fileModifiedAt: null,
      url: atlasHousingRatiosCatalog.sourceUrl,
      sha256: "a".repeat(64),
      sourceRowCount: 12,
      numericCellCount: 12,
      areaCount: 1,
      recipe: "oecd-published-housing-ratios-v1",
    },
  };
}
it("erhält den veröffentlichten Durchschnitt als echte Null und füllt keine Quartale oder Referenzen", () => {
  const view = housingRatiosView([row()], "income", "relative", 0)!;
  expect(view.periods).toEqual(["2000-Q1", "2000-Q2", "2000-Q3", "2000-Q4"]);
  expect(view.series[0].values).toEqual([0, null, -10, 30]);
  expect(view.series[0].sourceValues).toEqual([100, null, 90, 130]);
  expect(
    housingRatiosView([row()], "rent", "index", 0)!.series[0].values[0],
  ).toBe(80);
  expect(housingRatiosView([row()], "income", "relative", 2020)).toBeNull();
  const missing = row();
  missing.profile!.points.forEach((p) => (p.incomeRelative = null));
  expect(housingRatiosView([missing], "income", "relative", 0)).toBeNull();
  expect(housingRatiosView([missing], "income", "index", 0)).not.toBeNull();
});
it("vergleicht nur dieselbe Quelle und gemeinsame Quartale, mit einem symmetrischen Maßstab", () => {
  const other = row("m49:840");
  other.profile!.points[3].incomeRelative = 20;
  expect(
    housingRatiosView([row(), other], "income", "relative", 0)!.limit,
  ).toBe(80);
  other.provenance!.sha256 = "b".repeat(64);
  expect(housingRatiosView([row(), other], "income", "relative", 0)).toBeNull();
  const distant = row("m49:840");
  distant.profile!.points.forEach(
    (p) => (p.period = p.period.replace("2000", "2020")),
  );
  expect(
    housingRatiosView([row(), distant], "income", "relative", 0),
  ).toBeNull();
  distant.profile!.geographyId = "world";
  expect(housingRatiosView([distant], "rent", "index", 0)).toBeNull();
});
it("trennt historische Abschnitte ohne ihre Randwerte zu löschen oder beim Zeitraumwechsel neue Brüche zu erfinden", () => {
  const source = row();
  source.profile!.comparabilityBreaks = [
    { basis: "income", period: "2000-Q3" },
  ];
  const s = housingRatiosView([source], "income", "relative", 0)!.series[0];
  expect(s.segments).toEqual([
    [0, null, null, null],
    [null, null, -10, 30],
  ]);
  expect(s.breaks).toEqual(["2000-Q3"]);
  expect(s.segments.flat().filter((v) => v != null)).toEqual([0, -10, 30]);
  expect(
    housingRatiosView([source], "income", "index", 2000)!.series[0].segments[1],
  ).toEqual([null, null, 90, 130]);
  expect(
    housingRatiosView([source], "rent", "relative", 0)!.series[0].breaks,
  ).toEqual([]);
});
it("ordnet alle OECD-Gebiete eindeutig zu und verdeckt fehlende Hoch-/Tiefbilder nicht durch Indizes", () => {
  expect(atlasHousingRatiosCatalog.areas).toHaveLength(45);
  expect(
    new Set(atlasHousingRatiosCatalog.areas.map((a) => a.geographyId)).size,
  ).toBe(45);
  for (const area of atlasHousingRatiosCatalog.areas)
    expect(
      atlasCatalog.geographies.some((g) => g.id === area.geographyId),
    ).toBe(true);
  expect(coverageMapped("housingRatios", "oecd:housing_members")).toBe(true);
  for (const id of ["world", "m49:356", "m49:156"])
    expect(coverageMapped("housingRatios", id)).toBe(false);
  expect(coverageFamilyTarget("housingRatios", "m49:710")).toMatchObject({
    area: "m49:710",
    region: "Africa",
    topic: "housing:affordability",
    ratioBasis: "income",
    ratioMode: "relative",
  });
  const missing = row();
  missing.profile!.points.forEach((p) => (p.rentRelative = null));
  const choices = coverageOptions("m49:276", {
    housingRatios: { data: missing },
    energy: {},
    history: {},
    demography: {},
    markets: {},
    series: {},
  });
  expect(
    choices.find(
      (o) => o.id === "housingRatios:housing:price_rent:rentRelative",
    )?.status,
  ).toBe("empty");
  expect(
    choices.find((o) => o.id === "housingRatios:housing:price_rent:rent")
      ?.status,
  ).toBe("available");
});
it("merkt Vergleich, Bildart, Zeitraum und OECD-Quellenstand für die gespeicherte Ansicht", () => {
  const client = new QueryClient();
  const key = ["atlas", "housingRatios", "m49:276"];
  client.setQueryData(key, row());
  const observer = new QueryObserver(client, {
    queryKey: key,
    queryFn: async () => row(),
    staleTime: Infinity,
  });
  const unsubscribe = observer.subscribe(() => {});
  const context = atlasSavedContext(
    new URLSearchParams(
      "topic=housing:price_rent&ratioBasis=rent&ratioMode=index&ratioSince=2000",
    ),
  );
  expect(context.params).toMatchObject({
    ratioBasis: "rent",
    ratioMode: "index",
    ratioSince: "2000",
  });
  expect(atlasNotebookSources(client, context)[0]).toMatchObject({
    family: "oecd",
    hashes: ["a".repeat(64)],
    recipe: "oecd-published-housing-ratios-v1",
  });
  unsubscribe();
  client.clear();
});
function show(compareId?: string, topicId = "housing:affordability") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <AtlasHousingRatiosPanel
        geography={row().geography}
        compareId={compareId}
        topicId={topicId}
        showNumbers={false}
        job={null}
        onAreaChange={vi.fn()}
      />
    </QueryClientProvider>,
  );
}
it("beginnt ohne Zahlen als symmetrisches Hoch-/Tiefbild und schaltet Einkommen und Mieten getrennt", async () => {
  vi.mocked(api.atlasHousingRatios).mockImplementation(async (id) => row(id));
  show("m49:840");
  const chart = await screen.findByTestId("ratio-options");
  let option = JSON.parse(chart.textContent!);
  expect(option.yAxis.min).toBe(-option.yAxis.max);
  expect(option.tooltip.show).toBe(false);
  expect(option.series[0].data).toEqual([0, null, -10, 30]);
  expect(option.series[0].connectNulls).toBe(false);
  expect(option.series[0].smooth).toBe(false);
  expect(screen.queryByRole("table")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Zu Mieten" }));
  expect(JSON.parse(chart.textContent!).series[0].data[0]).toBe(-30);
  fireEvent.click(
    screen.getByRole("button", { name: "Verhältnis im Verlauf" }),
  );
  option = JSON.parse(chart.textContent!);
  expect(option.yAxis.min).toBe(0);
  expect(option.series[0].data[0]).toBe(80);
});
it("öffnet ein fehlendes Referenzbild erst auf ausdrücklichen Wechsel als Index und behält das Hauptland", async () => {
  vi.mocked(api.atlasHousingRatios).mockImplementation(async (id) => {
    if (id === "m49:156")
      return { ...browserAtlasHousingRatios(id), status: "unsupported_area" };
    const source = row(id);
    source.profile!.points.forEach((p) => (p.rentRelative = null));
    return source;
  });
  show("m49:156", "housing:price_rent");
  const fallback = await screen.findByRole("button", {
    name: "Verlauf mit Bezugsjahr 2015 ansehen",
  });
  expect(screen.queryByTestId("ratio-options")).toBeNull();
  fireEvent.click(fallback);
  expect(await screen.findByTestId("ratio-options")).toBeTruthy();
  expect(
    await screen.findByText(/China: Kein passendes Vergleichsbild/),
  ).toBeTruthy();
});
it("liefert im Browser weder erfundene Referenzkurven noch erfolgreiche Downloads", () => {
  expect(browserAtlasHousingRatios("m49:276")).toMatchObject({
    status: "desktop_required",
    profile: null,
    provenance: null,
  });
  expect(() => browserAtlasHousingRatios("../private")).toThrow();
});
