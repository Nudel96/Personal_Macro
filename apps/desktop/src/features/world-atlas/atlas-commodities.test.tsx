import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { atlasCatalog } from "./atlas-catalog";
import {
  atlasCommodityCatalog as cfg,
  commoditySeries,
  commoditySegments,
  commodityScale,
  commoditySelection,
  type AtlasCommodityResponse,
} from "./atlas-commodities";
import {
  AtlasCommoditiesPanel,
  CommodityChart,
} from "./atlas-commodities-panel";
import { browserAtlasCommodities } from "../../services/atlas-browser";
import {
  coverageOptions,
  coverageMapped,
  coverageFamilyTarget,
  type CoverageInputs,
} from "./atlas-coverage";
import {
  atlasNotebookSources,
  atlasSavedContext,
} from "./atlas-notebook-model";
const metric = cfg.metrics.find((m) => m.id === "copper")!;
afterEach(cleanup);
function response(): AtlasCommodityResponse {
  return {
    status: "available",
    points: [2008, 2009, 2010, 2011, 2012, 2014].map((year, i) => ({
      year,
      values: {
        "copper:real": [500, 0, 1000, null, 1250, 9830][i],
        "copper:nominal": 2000,
        "iron_ore:real": 1000,
        "index_oils:real": 9830,
      },
    })),
    provenance: {
      retrievedAt: "2026-09-09T17:00:00Z",
      fileModifiedAt: null,
      url: cfg.sourceUrl,
      fileUrl: cfg.url,
      sha256: cfg.sha256,
      release: cfg.release,
      sourceRelease: cfg.sourceRelease,
      numericCellCount: cfg.expectedNumericCells,
      missingCellCount: cfg.expectedMissingCells,
      metricCount: cfg.metrics.length,
      recipe: cfg.recipe,
    },
  };
}
describe("international commodity pictures", () => {
  it("preserves source values, true zero, missing years and a fixed 2010 reference", () => {
    const s = commoditySeries(response(), metric, "real", 1960)!;
    expect(s.points.map((p) => [p.year, p.value])).toEqual([
      [2008, 50],
      [2009, 0],
      [2010, 100],
      [2012, 125],
      [2014, 983],
    ]);
    expect(s.points[s.points.length - 1]?.raw).toBe(98.3);
    expect(
      commoditySegments(s.points).map(([a, b]) => [a.year, b.year]),
    ).toEqual([
      [2008, 2009],
      [2009, 2010],
    ]);
    expect(
      commoditySeries(response(), metric, "nominal", 1960)!.points.every(
        (p) => p.value === 100,
      ),
    ).toBe(true);
    expect(commodityScale([s])).toBeCloseTo(983 * 1.05);
  });
  it("does not fabricate a reference, use foreign provenance or connect a boundary", () => {
    const r = response();
    r.points = r.points.filter((p) => p.year !== 2010);
    expect(commoditySeries(r, metric, "real", 1960)).toBeNull();
    const other = response();
    other.provenance!.sha256 = "wrong";
    expect(commoditySeries(other, metric, "real", 1960)).toBeNull();
    const s = commoditySeries(
      response(),
      { ...metric, boundaryYears: [2009] },
      "real",
      1960,
    )!;
    expect(commoditySegments(s.points)).toEqual([]);
  });
  it("excludes unreconciled iron units and isolates the published oils discrepancy", () => {
    const iron = cfg.metrics.find((m) => m.id === "iron_ore")!;
    expect(
      commoditySeries(response(), iron, "real", 1960)!.points[0].year,
    ).toBe(2009);
    const oil = commoditySeries(
      response(),
      cfg.metrics.find((m) => m.id === "index_oils")!,
      "real",
      1960,
    )!;
    expect(oil.points.find((p) => p.year === 2014)?.discrepancy).toBeTruthy();
  });
  it("keeps scoped topics, clamps pagination and preserves separate ILO catalog entries", () => {
    const s = commoditySelection(new URLSearchParams(), "food_water:fisheries");
    expect(s.metrics.map((m) => m.id).sort()).toEqual(["fish_meal", "shrimp"]);
    expect(
      commoditySelection(
        new URLSearchParams("commodityPage=999"),
        "materials:commodity_prices",
      ).page,
    ).toBe(3);
    expect(
      commoditySelection(
        new URLSearchParams("commoditySince=1800&commodityBasis=bad"),
        "materials:copper",
      ).basis,
    ).toBe("real");
    expect(atlasCatalog.geographies.some((g) => g.id === "ilo:africa")).toBe(
      true,
    );
    expect(
      atlasCatalog.topics.some((t) => t.id === "labor:sector_structure"),
    ).toBe(true);
    expect(cfg.metrics).toHaveLength(85);
  });
  it("keeps international data out of country coverage and offers an explicit world target", () => {
    const input: CoverageInputs = {
      series: {},
      demography: {},
      history: {},
      energy: {},
      markets: {},
      commodities: { data: response() },
    };
    const world = coverageOptions("world", input).filter(
      (o) => o.family === "commodities",
    );
    const india = coverageOptions("m49:356", input).filter(
      (o) => o.family === "commodities",
    );
    expect(world.find((o) => o.id === "commodities:copper")?.status).toBe(
      "available",
    );
    expect(
      world.some(
        (o) => o.topicId === "materials:copper" && o.status === "available",
      ),
    ).toBe(true);
    expect(
      Object.keys(cfg.topics).every((id) =>
        atlasCatalog.topics.some((t) => t.id === id),
      ),
    ).toBe(true);
    expect(
      india.every((o) => o.status === "elsewhere" && !o.years.length),
    ).toBe(true);
    expect(coverageMapped("commodities", "m49:276")).toBe(false);
    expect(coverageFamilyTarget("commodities", "m49:276").area).toBe("world");
    expect(browserAtlasCommodities()).toEqual({
      status: "desktop_required",
      points: [],
      provenance: null,
    });
  });
  it("makes numbers optional even in point tooltips", () => {
    const series = [commoditySeries(response(), metric, "real", 1960)!];
    const { container, rerender } = render(
      <CommodityChart series={series} since={1960} max={1100} basis="real" />,
    );
    expect(container.textContent).not.toContain("98,3");
    expect(container.textContent).not.toContain("983");
    rerender(
      <CommodityChart
        series={series}
        since={1960}
        max={1100}
        basis="real"
        numbers
      />,
    );
    expect(container.textContent).toContain("98,3");
  });
  it("opens a source-backed picture, keeps its source and supports returning to the scoped gallery", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    client.setQueryData(["atlas", "commodities"], response());
    render(
      <QueryClientProvider client={client}>
        <AtlasCommoditiesPanel
          topicId="materials:copper"
          showNumbers={false}
          job={null}
        />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Kupfer öffnen" }));
    expect(
      screen.getByRole("heading", { name: "Kupfer", level: 3 }),
    ).toBeTruthy();
    const context = atlasSavedContext(
      new URLSearchParams(
        "topic=materials:copper&perspective=commodities&commodityMetric=copper&commodityCompare=gold&commodityBasis=real&commoditySince=1960",
      ),
    );
    expect(context.params.commodityCompare).toBe("gold");
    const sources = atlasNotebookSources(client, context);
    expect(sources[0].scope).toBe("Internationale Referenzpreise");
    expect(sources[0].hashes).toEqual([cfg.sha256]);
    fireEvent.click(
      screen.getByRole("button", { name: "Zur Rohstoffübersicht" }),
    );
    expect(screen.getByRole("button", { name: "Kupfer öffnen" })).toBeTruthy();
  });
});
