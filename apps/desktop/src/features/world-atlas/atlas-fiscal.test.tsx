import {
  QueryClient,
  QueryClientProvider,
  QueryObserver,
} from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { browserAtlasFiscal } from "../../services/atlas-browser";
import { api } from "../../services/commands";
import { AtlasDisplayContext } from "./atlas-display-state";
import {
  coverageMapped,
  coverageOptions,
  coverageFamilyTarget,
} from "./atlas-coverage";
import {
  atlasFiscalCatalog as cfg,
  fiscalView,
  fiscalSegments,
  type AtlasFiscalResponse,
} from "./atlas-fiscal";
import { AtlasFiscalPanel } from "./atlas-fiscal-panel";
import {
  atlasNotebookSources,
  atlasSavedContext,
} from "./atlas-notebook-model";

vi.mock("../../services/commands", () => ({
  isTauri: () => false,
  api: { atlasFiscal: vi.fn(), syncAtlasFiscal: vi.fn() },
}));
vi.mock("../../charts/base-chart", () => ({
  BaseChart: ({ option }: { option: unknown }) => (
    <output data-testid="fiscal-options">{JSON.stringify(option)}</output>
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
function row(id = "m49:276"): AtlasFiscalResponse {
  const area = cfg.areas.find((a) => a.geographyId === id)!;
  return {
    ...browserAtlasFiscal(id),
    status: "available",
    profile: {
      geographyId: id,
      providerCode: area.code,
      providerLabels: area.providerLabels,
      points: [0, null, 20, 30, -10, 595].map((n, i) => ({
        year: 1999 + i,
        budgetScope: i < 3 ? 0 : 1,
        debtScope: 1,
        values: Object.fromEntries(cfg.metrics.map((m) => [m.field, n])),
      })),
    },
    provenance: {
      retrievedAt: "2026-09-09T12:00:00Z",
      fileModifiedAt: null,
      url: cfg.url,
      originalUrl: cfg.originalUrl,
      sha256: cfg.sha256,
      release: cfg.release,
      recipe: cfg.recipe,
      sourceRowCount: 33846,
      numericCellCount: 68406,
      areaCount: 151,
    },
  };
}
it("erhält Null, negative Salden, extreme Werte, Jahreslücken und beide Endpunkte eines Abgrenzungswechsels", () => {
  const view = fiscalView([row()], metric("primaryBalance"), 1800)!;
  expect(view.lines[0].values).toEqual([0, null, 20, 30, -10, 595]);
  expect(view.min).toBe(-595);
  expect(view.max).toBe(595);
  expect(
    fiscalSegments(view, view.lines[0]).map((s) => s.map((p) => p.year)),
  ).toEqual([[1999], [2001], [2002, 2003, 2004]]);
  expect(fiscalView([row()], metric("revenue"), 2020)).toBeNull();
});
it("vergleicht nur dieselbe staatliche Abgrenzung und wählt dasselbe tatsächlich gemeinsame Jahr", () => {
  const first = row();
  const other = row("m49:356");
  other.profile!.points.forEach((p) => {
    p.budgetScope = 0;
  });
  const view = fiscalView([first, other], metric("expenditure"), 1800)!;
  expect(view.lines.map((l) => l.values)).toEqual([
    [0, null, 20, null, null, null],
    [0, null, 20, null, null, null],
  ]);
  expect(view.excludedScopeYears).toBe(3);
  expect(view.years[view.lastCommonIndex]).toBe(2001);
  // Debt has its own flag, so a different budget scope must not erase equal debt coverage.
  expect(
    fiscalView([first, other], metric("grossDebt"), 1800)!.lastCommonIndex,
  ).toBe(5);
  other.profile!.points.forEach((p) => {
    p.budgetScope = 1;
  });
  first.profile!.points.forEach((p) => {
    p.budgetScope = 0;
  });
  expect(fiscalView([first, other], metric("expenditure"), 1800)).toBeNull();
});
it("trennt den dokumentierten Frankreich-Bruch ohne einen vorhandenen Messpunkt zu verlieren", () => {
  const france = row("m49:250");
  france.profile!.points = france.profile!.points.slice(0, 3).map((p, i) => ({
    ...p,
    year: 1977 + i,
    budgetScope: 1,
    values: { exp: 10 + i, d: 20 + i },
  }));
  const v = fiscalView([france], metric("expenditure"), 1800)!;
  expect(
    fiscalSegments(v, v.lines[0]).map((s) => s.map((p) => p.year)),
  ).toEqual([[1977], [1978, 1979]]);
  const debt = fiscalView([france], metric("grossDebt"), 1800)!;
  expect(fiscalSegments(debt, debt.lines[0])).toHaveLength(1);
});
it("verweigert andere Quelle, Gebiet und Abrufstand; Kontextmaße erben keine Haushaltsabgrenzung", () => {
  const r = row();
  r.provenance!.sha256 = "other";
  expect(fiscalView([r], metric("revenue"), 1800)).toBeNull();
  const changed = row();
  changed.profile!.geographyId = "m49:356";
  expect(fiscalView([changed], metric("revenue"), 1800)).toBeNull();
  const second = row("m49:356");
  second.provenance!.retrievedAt = "2026-09-08T12:00:00Z";
  expect(fiscalView([row(), second], metric("revenue"), 1800)).toBeNull();
  const macro = fiscalView([row()], metric("realGrowth"), 1800)!;
  expect(fiscalSegments(macro, macro.lines[0]).map((s) => s.length)).toEqual([
    1, 4,
  ]);
});
it("ordnet vier Kernländer, Quellenkarte und wirklich fehlende Weltwerte korrekt zu", () => {
  for (const id of ["m49:276", "m49:840", "m49:356", "m49:156"])
    expect(coverageMapped("fiscal", id)).toBe(true);
  expect(coverageMapped("fiscal", "world")).toBe(false);
  const r = row();
  const options = coverageOptions("m49:276", {
    fiscal: { data: r },
    series: {},
    demography: {},
    history: {},
    energy: {},
    markets: {},
  }).filter((o) => o.family === "fiscal");
  expect(options).toHaveLength(8);
  expect(options.every((o) => o.status === "available")).toBe(true);
  expect(options.find((o) => o.id === "fiscal:grossDebt")?.topicId).toBe(
    "finance:public_debt",
  );
  expect(coverageFamilyTarget("fiscal", r.geography.id)).toMatchObject({
    topic: "institutions:public_finances",
  });
  expect(browserAtlasFiscal("m49:356")).toMatchObject({
    status: "desktop_required",
    profile: null,
    provenance: null,
  });
});
it("nimmt Quelle, Prüfsumme und Darstellungsparameter in die persönliche Ansicht auf", () => {
  const client = new QueryClient();
  client.setQueryData(["atlas", "fiscal", "m49:276"], row());
  const observer = new QueryObserver(client, {
    queryKey: ["atlas", "fiscal", "m49:276"],
    queryFn: async () => row(),
    staleTime: Infinity,
  });
  const unsubscribe = observer.subscribe(() => {});
  const context = atlasSavedContext(
    new URLSearchParams(
      "area=m49:276&topic=institutions:public_finances&fiscalGroup=debt&fiscalMetric=grossDebt&fiscalSince=1900",
    ),
  );
  expect(context.params).toMatchObject({
    fiscalGroup: "debt",
    fiscalMetric: "grossDebt",
    fiscalSince: "1900",
  });
  expect(atlasNotebookSources(client, context)).toContainEqual(
    expect.objectContaining({
      family: "imf",
      hashes: [cfg.sha256],
      recipe: cfg.recipe,
    }),
  );
  unsubscribe();
  client.clear();
});
function mount(params = "", numbers = false, compareId?: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const navigate = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <AtlasDisplayContext.Provider
        value={{ params: new URLSearchParams(params), navigate }}
      >
        <AtlasFiscalPanel
          geography={row().geography}
          topicId="institutions:public_finances"
          compareId={compareId}
          showNumbers={numbers}
          job={null}
        />
      </AtlasDisplayContext.Provider>
    </QueryClientProvider>,
  );
  return navigate;
}
it("zeigt eine ruhige kleine Galerie und öffnet per Tastatur-fähigem Button das Einzelbild", async () => {
  vi.mocked(api.atlasFiscal).mockImplementation(async (id) => row(id));
  const navigate = mount();
  const item = await screen.findByRole("button", {
    name: /Primärer Haushaltssaldo/,
  });
  expect(screen.getAllByRole("img")).toHaveLength(4);
  fireEvent.click(item);
  expect(navigate).toHaveBeenCalledWith({ fiscalMetric: "primaryBalance" });
  expect(screen.queryByText(/595/)).toBeNull();
});
it("schaltet Zahlen nur bewusst ein und verbindet keine Definitionswechsel im großen Diagramm", async () => {
  vi.mocked(api.atlasFiscal).mockImplementation(async (id) => row(id));
  mount("fiscalMetric=primaryBalance&fiscalSince=1900", true);
  const opts = JSON.parse(
    (await screen.findByTestId("fiscal-options")).textContent!,
  );
  expect(opts.animation).toBe(false);
  expect(opts.tooltip.show).toBe(true);
  expect(opts.series).toHaveLength(3);
  expect(
    opts.series.every(
      (s: { connectNulls: boolean; smooth: boolean }) =>
        !s.connectNulls && !s.smooth,
    ),
  ).toBe(true);
  expect(opts.series[1].data).toEqual([null, null, 20, null, null, null]);
  expect(opts.series[0].markLine).toMatchObject({
    label: { formatter: "Ausgeglichen" },
    data: [{ yAxis: 0 }],
  });
  expect(await screen.findByText(/Letztes verfügbares Jahr 2004/)).toBeTruthy();
});
