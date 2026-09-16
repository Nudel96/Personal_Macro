import {
  QueryClient,
  QueryClientProvider,
  QueryObserver,
} from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { browserAtlasMacrohistory } from "../../services/atlas-browser";
import { api } from "../../services/commands";
import { AtlasDisplayContext } from "./atlas-display-state";
import {
  coverageFamilyTarget,
  coverageMapped,
  coverageOptions,
} from "./atlas-coverage";
import {
  atlasMacrohistoryCatalog as cfg,
  atlasMacrohistoryTopic,
  macrohistoryPaths,
  macrohistoryView,
  type AtlasMacrohistoryResponse,
} from "./atlas-macrohistory";
import { AtlasMacrohistoryPanel } from "./atlas-macrohistory-panel";
import {
  atlasNotebookSources,
  atlasSavedContext,
} from "./atlas-notebook-model";

vi.mock("../../services/commands", () => ({
  isTauri: () => false,
  api: { atlasMacrohistory: vi.fn(), syncAtlasMacrohistory: vi.fn() },
}));
vi.mock("../../charts/base-chart", () => ({
  BaseChart: ({ option }: { option: unknown }) => (
    <output data-testid="jst-options">{JSON.stringify(option)}</output>
  ),
  axisLine: {},
  splitLine: {},
  tooltip: {},
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const metric = (id: string) => cfg.metrics.find((m) => m.id === id)!;
function row(id = "m49:276"): AtlasMacrohistoryResponse {
  const area = cfg.areas.find((a) => a.geographyId === id)!;
  return {
    ...browserAtlasMacrohistory(id),
    status: "available",
    profile: {
      geographyId: id,
      providerCode: area.code,
      providerLabel: area.providerLabel,
      points: [0, null, 20, 30, -10, 40].map((n, i) => ({
        year: 1999 + i,
        raw: { crisisJST: i === 4 ? 1 : null },
        values: Object.fromEntries(
          cfg.metrics.map((m) => [
            m.id,
            {
              value: n,
              nominal: n === null ? null : n * 2,
              interpolated: i === 3,
            },
          ]),
        ),
      })),
    },
    provenance: {
      retrievedAt: "2026-09-09T08:00:00Z",
      fileModifiedAt: null,
      url: cfg.url,
      resolvedUrl: cfg.resolvedUrl,
      sha256: cfg.sha256,
      release: cfg.release,
      recipe: cfg.recipe,
      sourceRowCount: 2718,
      numericCellCount: 111546,
      areaCount: 18,
    },
  };
}
it("erhält Jahreslücken, echte Null, negative Werte und Interpolationsmarker", () => {
  const view = macrohistoryView([row()], metric("equityReturn"), 1870, true)!;
  expect(view.years).toEqual([1999, 2000, 2001, 2002, 2003, 2004]);
  expect(view.lines[0].values).toEqual([0, null, 20, 30, -10, 40]);
  expect(view.lines[0].crises).toEqual([2003]);
  expect(view.min).toBe(-40);
  expect(view.max).toBe(40);
  const shape = macrohistoryPaths(view, view.lines[0]);
  expect(shape.path.match(/M/g)).toHaveLength(3);
  expect(shape.path.match(/L/g)).toHaveLength(1);
  expect(shape.points.filter((p) => p.interpolated)).toHaveLength(1);
  expect(shape.points[0].interpolated).toBe(false);
  expect(macrohistoryView([row()], metric("output"), 2020, true)).toBeNull();
});
it("erfindet bei fehlender Realrendite keinen Wert aus der vorhandenen Nominalrendite", () => {
  const r = row();
  r.profile!.points[0].values.equityReturn = {
    value: null,
    nominal: 0,
    interpolated: false,
  };
  expect(macrohistoryView([r], metric("equityReturn"), 1870, true)!.first).toBe(
    2001,
  );
  const nominal = macrohistoryView([r], metric("equityReturn"), 1870, false)!;
  expect(nominal.first).toBe(1999);
  expect(nominal.lines[0].values).toEqual([0, null, 40, 60, -20, 80]);
});
it("teilt Maßstab und echte gemeinsame Jahre und lehnt fremde Gebiete oder Quellenstände ab", () => {
  const second = row("m49:840");
  second.profile!.points[5].values.publicDebt.value = null;
  second.profile!.points[4].values.publicDebt.value = -90;
  const view = macrohistoryView(
    [row(), second],
    metric("publicDebt"),
    1870,
    true,
  )!;
  expect(view.last).toBe(2003);
  expect(view.years[view.lastCommonIndex]).toBe(2003);
  expect(view.min).toBe(-90);
  second.provenance!.retrievedAt = "2026-09-08T08:00:00Z";
  expect(
    macrohistoryView([row(), second], metric("publicDebt"), 1870, true),
  ).toBeNull();
  const wrong = row();
  wrong.profile!.geographyId = "world";
  expect(
    macrohistoryView([wrong], metric("publicDebt"), 1870, true),
  ).toBeNull();
  const noCommon = row("m49:840");
  noCommon.profile!.points.forEach(
    (p, i) => (p.values.publicDebt.value = i === 1 ? 50 : null),
  );
  expect(
    macrohistoryView([row(), noCommon], metric("publicDebt"), 1870, true),
  ).toBeNull();
});
it("ordnet 20 Perspektiven zu, ohne Indien, China oder Welt als JST-Länder auszugeben", () => {
  expect(coverageMapped("macrohistory", "m49:276")).toBe(true);
  for (const id of ["m49:356", "m49:156", "world"])
    expect(coverageMapped("macrohistory", id)).toBe(false);
  const r = row();
  r.profile!.points.forEach((p) => (p.values.output.value = null));
  const options = coverageOptions("m49:276", {
    macrohistory: { data: r },
    series: {},
    energy: {},
    history: {},
    demography: {},
    markets: {},
  }).filter((o) => o.family === "macrohistory");
  expect(options).toHaveLength(20);
  expect(options.find((o) => o.id === "macrohistory:output")?.status).toBe(
    "empty",
  );
  expect(options.find((o) => o.id === "macrohistory:publicDebt")?.status).toBe(
    "available",
  );
  expect(coverageFamilyTarget("macrohistory", "m49:276")).toMatchObject({
    topic: atlasMacrohistoryTopic,
    jstGroup: "credit",
    jstReal: "1",
  });
  expect(browserAtlasMacrohistory("m49:276")).toMatchObject({
    status: "desktop_required",
    profile: null,
    provenance: null,
  });
  expect(() => browserAtlasMacrohistory("../private")).toThrow();
});
it("erhält fünf Bildentscheidungen und JST-Herkunft im Merkkontext", () => {
  const client = new QueryClient();
  client.setQueryData(["atlas", "macrohistory", "m49:276"], row());
  const observer = new QueryObserver(client, {
    queryKey: ["atlas", "macrohistory", "m49:276"],
    queryFn: async () => row(),
    staleTime: Infinity,
  });
  const stop = observer.subscribe(() => {});
  const context = atlasSavedContext(
    new URLSearchParams(
      `area=m49:276&topic=${atlasMacrohistoryTopic}&jstGroup=returns&jstMetric=equityReturn&jstSince=1900&jstReal=0&jstCrises=1`,
    ),
  );
  expect(context.params).toMatchObject({
    jstGroup: "returns",
    jstMetric: "equityReturn",
    jstSince: "1900",
    jstReal: "0",
    jstCrises: "1",
  });
  expect(atlasNotebookSources(client, context)[0]).toMatchObject({
    family: "jst",
    hashes: [cfg.sha256],
    release: cfg.release,
  });
  stop();
});
function show(compareId?: string, restored?: string, numbers = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const panel = (
    <AtlasMacrohistoryPanel
      geography={row().geography}
      compareId={compareId}
      showNumbers={numbers}
      job={null}
    />
  );
  const navigate = vi.fn();
  render(
    <QueryClientProvider client={client}>
      {restored ? (
        <AtlasDisplayContext.Provider
          value={{ params: new URLSearchParams(restored), navigate }}
        >
          {panel}
        </AtlasDisplayContext.Provider>
      ) : (
        panel
      )}
    </QueryClientProvider>,
  );
  return navigate;
}
it("wechselt zwischen ruhiger Übersicht und großem Bild; Zahlen und Krisen bleiben optional", async () => {
  vi.mocked(api.atlasMacrohistory).mockImplementation(async (id) => row(id));
  show();
  const card = await screen.findByRole("button", {
    name: "Staatsschulden · großes Bild öffnen",
  });
  expect(screen.queryByRole("table")).toBeNull();
  fireEvent.click(card);
  const chart = await screen.findByTestId("jst-options");
  let option = JSON.parse(chart.textContent!);
  expect(option.tooltip.show).toBe(false);
  expect(option.yAxis.axisLabel.show).toBe(false);
  expect(option.animation).toBe(false);
  expect(option.series[0].connectNulls).toBe(false);
  expect(option.series[0].smooth).toBe(false);
  expect(option.series[0].markLine).toBeUndefined();
  expect(option.series[0].data[3]).toBeNull();
  expect(option.series[1].data[3]).toBe(30);
  fireEvent.click(screen.getByLabelText("Krisenanfänge laut JST"));
  option = JSON.parse(chart.textContent!);
  expect(option.series[0].markLine.data).toEqual([{ xAxis: "2003" }]);
  fireEvent.click(screen.getByRole("button", { name: "Zur Themenübersicht" }));
  fireEvent.change(screen.getByLabelText("Geschichte ordnen"), {
    target: { value: "returns" },
  });
  fireEvent.click(
    screen.getByRole("button", {
      name: "Aktien · Jahresrendite · großes Bild öffnen",
    }),
  );
  fireEvent.click(screen.getByLabelText("Renditen inflationsbereinigt"));
  expect(
    JSON.parse(screen.getByTestId("jst-options").textContent!).series[0]
      .data[2],
  ).toBe(40);
});
it("öffnet einen gespeicherten nominalen Renditevergleich und erhält den Rückweg", async () => {
  vi.mocked(api.atlasMacrohistory).mockImplementation(async (id) => row(id));
  const navigate = show(
    "m49:840",
    "jstGroup=returns&jstMetric=equityReturn&jstSince=1980&jstReal=0&jstCrises=1",
    true,
  );
  const option = JSON.parse(
    (await screen.findByTestId("jst-options")).textContent!,
  );
  expect(option.series).toHaveLength(4);
  expect(option.series[2].lineStyle.type).toBe("dashed");
  expect(option.tooltip.show).toBe(true);
  expect(screen.getByRole("table")).toBeTruthy();
  expect(
    (screen.getByLabelText("Renditen inflationsbereinigt") as HTMLInputElement)
      .checked,
  ).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Zur Themenübersicht" }));
  expect(navigate).toHaveBeenCalledWith({ jstGroup: "returns" });
  expect(navigate).toHaveBeenCalledWith({ jstMetric: "" });
});
it("behält das Hauptland bei einem fehlenden Vergleich und nennt die Ländergrenze", async () => {
  vi.mocked(api.atlasMacrohistory).mockImplementation(async (id) =>
    id === "world"
      ? { ...browserAtlasMacrohistory(id), status: "unsupported_area" }
      : row(id),
  );
  show("world");
  expect(
    await screen.findByRole("button", {
      name: "Staatsschulden · großes Bild öffnen",
    }),
  ).toBeTruthy();
  expect(
    await screen.findByText(
      /Für das Vergleichsgebiet liegt hier keine eigene JST-Reihe vor/,
    ),
  ).toBeTruthy();
});
