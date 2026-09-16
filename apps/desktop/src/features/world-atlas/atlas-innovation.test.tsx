import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  QueryObserver,
} from "@tanstack/react-query";
import { atlasCatalog } from "./atlas-catalog";
import {
  atlasInnovationCatalog as cfg,
  innovationTopics,
  innovationSelection,
  innovationView,
  innovationSegments,
  type AtlasInnovationResponse,
  type InnovationPoint,
} from "./atlas-innovation";
import {
  InnovationChart,
  AtlasInnovationPanel,
} from "./atlas-innovation-panel";
import {
  coverageMapped,
  coverageOptions,
  coverageFamilyTarget,
} from "./atlas-coverage";
import {
  atlasNotebookSources,
  atlasSavedContext,
} from "./atlas-notebook-model";
import { api } from "../../services/commands";
import { browserAtlasInnovation } from "../../services/atlas-browser";

const metric = cfg.metrics.find((m) => m.id === "8")!;
function response(
  code = "DE",
  points: InnovationPoint[] = [
    { year: 2022, values: { "8": 20 } },
    { year: 2023, values: { "8": 25 } },
  ],
): AtlasInnovationResponse {
  const a = cfg.areas.find((a) => a.code === code)!;
  return {
    geography: atlasCatalog.geographies.find((g) => g.id === a.geographyId)!,
    status: "available",
    profile: {
      geographyId: a.geographyId,
      providerCode: a.code,
      providerLabel: a.label,
      points,
    },
    provenance: {
      retrievedAt: "2026-09-09T12:00:00Z",
      url: cfg.sourceUrl,
      sha256: cfg.sha256,
      release: cfg.release,
      sourceRelease: cfg.sourceRelease,
      recipe: cfg.recipe,
      sourceRowCount: 5645,
      sourceNumericCellCount: 112086,
      numericCellCount: 108696,
      areaCount: 199,
    },
  };
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("WIPO technology pictures", () => {
  it("maps only 199 current origins, all 35 fields and the separate unknown field", () => {
    expect(new Set(cfg.areas.map((a) => a.geographyId)).size).toBe(199);
    expect(new Set(cfg.metrics.map((m) => m.id)).size).toBe(36);
    for (const group of cfg.groups)
      expect(
        cfg.metrics.filter((m) => m.group === group.id).length,
      ).toBeLessThanOrEqual(6);
    for (const a of cfg.areas)
      expect(
        atlasCatalog.geographies.find((g) => g.id === a.geographyId)?.iso3,
      ).toBe(a.iso3);
    for (const id of Object.keys(innovationTopics))
      expect(atlasCatalog.topics.some((t) => t.id === id)).toBe(true);
    for (const code of [
      ...cfg.excludedOrigins.map((a) => a.code),
      ...cfg.absentOrigins,
    ])
      expect(cfg.areas.some((a) => a.code === code)).toBe(false);
    expect(coverageMapped("innovation", "world")).toBe(false);
  });
  it("keeps zero, missing years and source counts distinct, with no invented connecting line", () => {
    const r = response("DE", [
      { year: 2020, values: { "8": 0 } },
      { year: 2021, values: { "8": null } },
      { year: 2022, values: { "8": 100 } },
      { year: 2023, values: { "8": 130 } },
      { year: 2024, values: { "8": 10 } },
    ]);
    const normal = innovationView([r], metric, 1980, 2023)!;
    expect(normal.series[0].points.map((p) => p.value)).toEqual([0, 100, 130]);
    expect(
      innovationSegments(normal.series[0].points).map((s) =>
        s.map((p) => p.year),
      ),
    ).toEqual([[2022, 2023]]);
    const latest = innovationView([r], metric, 1980, 2024)!;
    expect(innovationSegments(latest.series[0].points)).toHaveLength(1);
    const { container } = render(
      <InnovationChart view={latest} metric={metric} />,
    );
    expect(container.querySelectorAll("circle")).toHaveLength(4);
    expect(
      container.querySelector("circle:last-child")?.getAttribute("fill"),
    ).toBe("var(--surface)");
    expect(container.querySelector("circle title")?.textContent).not.toContain(
      ": 0",
    );
  });
  it("keeps identical calendar and shared linear scale for two countries", () => {
    const view = innovationView(
      [response(), response("US", [{ year: 2022, values: { "8": 200 } }])],
      metric,
      1980,
      2023,
    )!;
    expect([
      view.first,
      view.last,
      view.lastCommonYear,
      view.min,
      view.max,
    ]).toEqual([1980, 2023, 2022, 0, 200]);
    expect(view.series[0].points).toHaveLength(2);
  });
  it("rejects mixed source editions, wrong country identity and nonoverlapping actual years", () => {
    for (const change of [
      (r: AtlasInnovationResponse) => {
        r.provenance!.sha256 = "0".repeat(64);
      },
      (r: AtlasInnovationResponse) => {
        r.profile!.providerCode = "US";
      },
      (r: AtlasInnovationResponse) => {
        r.provenance!.sourceRelease = "old";
      },
    ]) {
      const r = response();
      change(r);
      expect(innovationView([r], metric, 1980, 2023)).toBeNull();
    }
    const b = response("US");
    b.provenance!.retrievedAt = "2025-01-01T00:00:00Z";
    expect(innovationView([response(), b], metric, 1980, 2023)).toBeNull();
    expect(
      innovationView(
        [response(), response("US", [{ year: 2000, values: { "8": 5 } }])],
        metric,
        1980,
        2023,
      ),
    ).toBeNull();
  });
  it("normalizes topic defaults, invalid selections and the optional boundary year", () => {
    expect(
      innovationSelection(new URLSearchParams(), "digital:semiconductors"),
    ).toEqual({ group: "digital", metric: "8", since: 1980, through: 2023 });
    expect(
      innovationSelection(
        new URLSearchParams(
          "innovationGroup=medicine&innovationMetric=8&innovationSince=1990&innovationThrough=2025",
        ),
        "digital:semiconductors",
      ),
    ).toEqual({ group: "medicine", metric: "", since: 1980, through: 2023 });
    expect(
      innovationSelection(
        new URLSearchParams("innovationMetric=overview&innovationThrough=2024"),
        "digital:semiconductors",
      ).metric,
    ).toBe("");
  });
  it("retains WIPO provenance and the exact saved perspective", () => {
    const client = new QueryClient(),
      r = response();
    const observer = new QueryObserver(client, {
      queryKey: ["atlas", "innovation", r.geography.id],
      initialData: r,
      staleTime: Infinity,
    });
    const unsubscribe = observer.subscribe(() => {});
    const context = atlasSavedContext(
      new URLSearchParams({
        topic: "innovation:patents",
        perspective: "innovation",
        innovationGroup: "digital",
        innovationMetric: "8",
        innovationSince: "1980",
        innovationThrough: "2023",
      }),
    );
    expect(context.params.innovationThrough).toBe("2023");
    expect(atlasNotebookSources(client, context)[0]).toMatchObject({
      family: "wipo",
      hashes: [cfg.sha256],
      recipe: cfg.recipe,
    });
    unsubscribe();
    client.clear();
  });
  it("coverage opens the exact field and does not count a boundary-only field as available by default", () => {
    const r = response("DE", [
      { year: 2023, values: { "8": 25 } },
      { year: 2024, values: { "15": 7 } },
    ]);
    const rows = coverageOptions(r.geography.id, {
      innovation: { data: r },
      series: {},
      demography: {},
      history: {},
      energy: {},
      markets: {},
    });
    expect(rows.find((r) => r.id === "innovation:8")).toMatchObject({
      status: "available",
      target: {
        topic: "digital:semiconductors",
        innovationMetric: "8",
        innovationThrough: "2023",
        perspective: "innovation",
      },
    });
    expect(rows.find((r) => r.id === "innovation:15")?.status).toBe("empty");
    expect(coverageFamilyTarget("innovation", r.geography.id)).toMatchObject({
      innovationMetric: "overview",
      perspective: "innovation",
    });
  });
  it("keeps the main country visible and allows group/detail/year changes", async () => {
    const a = response(),
      b = response("US", [{ year: 2000, values: { "8": 10 } }]);
    vi.spyOn(api, "atlasInnovation").mockImplementation(async (id) =>
      id === a.geography.id ? a : b,
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <AtlasInnovationPanel
          geography={a.geography}
          compareId={b.geography.id}
          showNumbers={false}
          job={null}
          topicId="digital:semiconductors"
        />
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(screen.getByRole("img", { name: /^Halbleiter/ })).toBeTruthy(),
    );
    expect(screen.getByText(/Das Hauptland bleibt sichtbar/)).toBeTruthy();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Randjahr 2024 ergänzen" }),
    );
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain(
      "bis 2024",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Zur Themenübersicht" }),
    );
    expect(screen.getByRole("button", { name: /^Halbleiter/ })).toBeTruthy();
    fireEvent.change(
      screen.getByRole("combobox", { name: "Technologiebilder ordnen" }),
      { target: { value: "medicine" } },
    );
    expect(screen.queryByRole("img")).toBeNull();
    expect(
      screen.getByRole("button", { name: /^Medizintechnik/ }),
    ).toBeTruthy();
    client.clear();
  });
  it("does not invent a successful browser download", () => {
    expect(browserAtlasInnovation("m49:276")).toMatchObject({
      status: "desktop_required",
      profile: null,
      provenance: null,
    });
    expect(() => browserAtlasInnovation("unknown")).toThrow();
  });
});
