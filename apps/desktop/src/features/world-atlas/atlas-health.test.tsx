import { useState } from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import {
  fireEvent,
  render,
  screen,
  cleanup,
  waitFor,
} from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  QueryObserver,
} from "@tanstack/react-query";
import { atlasCatalog } from "./atlas-catalog";
import {
  atlasHealthCatalog as cfg,
  healthView,
  healthSelection,
  type AtlasHealthResponse,
} from "./atlas-health";
import { HealthChart, AtlasHealthPanel } from "./atlas-health-panel";
import { AtlasDisplayContext } from "./atlas-display-state";
import { api } from "../../services/commands";
import {
  atlasNotebookSources,
  atlasSavedContext,
} from "./atlas-notebook-model";
import {
  coverageOptions,
  coverageMapped,
  coverageFamilyTarget,
} from "./atlas-coverage";

const metric = cfg.metrics[0];
function response(
  code = "DEU",
  points = [
    { year: 2020, values: { che_gdp: 8 } },
    { year: 2023, values: { che_gdp: 12 } },
  ],
): AtlasHealthResponse {
  const area = cfg.areas.find((a) => a.code === code)!;
  return {
    geography: atlasCatalog.geographies.find((g) => g.id === area.geographyId)!,
    status: "available",
    profile: {
      geographyId: area.geographyId,
      providerCode: code,
      providerLabel: area.label,
      points,
      metadata: [],
      notes: { footnote: null, releaseNote: null, reportingCurrency: null },
    },
    provenance: {
      retrievedAt: "2026-09-09T12:00:00Z",
      url: cfg.sourceUrl,
      sha256: cfg.files[0].sha256,
      notesSha256: cfg.files[1].sha256,
      release: cfg.release,
      recipe: cfg.recipe,
      sourceRowCount: 4612,
      numericCellCount: 81762,
      metadataRowCount: 32667,
      areaCount: 195,
    },
  };
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("WHO health pictures", () => {
  it("maps 195 distinct actual countries and keeps groups small and units explicit", () => {
    expect(new Set(cfg.areas.map((a) => a.geographyId)).size).toBe(195);
    expect(cfg.metrics).toHaveLength(38);
    for (const g of cfg.groups)
      expect(
        cfg.metrics.filter((m) => m.group === g.id).length,
      ).toBeLessThanOrEqual(6);
    for (const a of cfg.areas)
      expect(
        atlasCatalog.geographies.find((g) => g.id === a.geographyId)?.iso3,
      ).toBe(a.code);
    expect(coverageMapped("health", "world")).toBe(false);
    expect(cfg.metrics.find((m) => m.id === "hk_usd_pc")?.unit).toBe(
      "current_usd_per_capita",
    );
  });
  it("preserves actual zero, gaps and published shares above 100 without smoothing", () => {
    const r = response();
    r.profile!.points = [
      { year: 2000, values: { che_gdp: 0 } },
      { year: 2001, values: { che_gdp: null } },
      { year: 2003, values: { che_gdp: 100.26454926 } },
    ];
    const view = healthView([r], metric, 2000)!;
    expect(view.series[0].points.map((p) => p.value)).toEqual([
      0, 100.26454926,
    ]);
    expect(view.max).toBe(100.26454926);
    const { container } = render(<HealthChart view={view} metric={metric} />);
    expect(container.querySelectorAll("circle")).toHaveLength(2);
    expect(container.querySelectorAll("path, polyline")).toHaveLength(0);
    expect(container.querySelectorAll("circle title")).toHaveLength(0);
  });
  it("uses common real years, shared scale and identical source snapshots", () => {
    const a = response(),
      b = response("USA", [
        { year: 2020, values: { che_gdp: 19 } },
        { year: 2022, values: { che_gdp: 17 } },
      ]);
    const view = healthView([a, b], metric, 2000)!;
    expect([view.first, view.last, view.lastCommonYear, view.max]).toEqual([
      2020, 2022, 2020, 19,
    ]);
    b.provenance!.retrievedAt = "2026-09-08T12:00:00Z";
    expect(healthView([a, b], metric, 2000)).toBeNull();
  });
  it("rejects foreign identity, stale recipe, missing notes file and nonoverlapping years", () => {
    for (const mutate of [
      (r: AtlasHealthResponse) => {
        r.profile!.providerCode = "USA";
      },
      (r: AtlasHealthResponse) => {
        r.provenance!.recipe = "old";
      },
      (r: AtlasHealthResponse) => {
        r.provenance!.notesSha256 = "0".repeat(64);
      },
    ]) {
      const r = response();
      mutate(r);
      expect(healthView([r], metric, 2000)).toBeNull();
    }
    expect(
      healthView(
        [
          response(),
          response("USA", [{ year: 2021, values: { che_gdp: 19 } }]),
        ],
        metric,
        2000,
      ),
    ).toBeNull();
  });
  it("shows preliminary 2024 as a hollow marker with optional numerical tooltip", () => {
    const r = response("DEU", [{ year: 2024, values: { che_gdp: 11 } }]);
    const view = healthView([r], metric, 2000)!;
    expect(view.series[0].points[0].preliminary).toBe(true);
    const { container } = render(
      <HealthChart view={view} metric={metric} numbers />,
    );
    expect(container.querySelector("circle")?.getAttribute("fill")).toBe(
      "var(--surface)",
    );
    expect(container.querySelector("circle title")?.textContent).toContain(
      "vorläufig",
    );
  });
  it("normalizes the actual topic entry and can reopen the overview of a narrow topic", () => {
    expect(
      healthSelection(new URLSearchParams(), "health:medical_equipment"),
    ).toEqual({ group: "investment", metric: "hk112_usd_pc", since: 2000 });
    expect(
      healthSelection(
        new URLSearchParams(
          "healthGroup=primary&healthMetric=hk112_usd_pc&healthSince=1990",
        ),
        "health:hospitals",
      ),
    ).toEqual({ group: "primary", metric: "", since: 2000 });
    expect(
      healthSelection(
        new URLSearchParams("healthGroup=care&healthMetric=overview"),
        "health:hospitals",
      ).metric,
    ).toBe("");
  });
  it("retains both workbook hashes and explicit selections in notebook metadata", () => {
    const r = response(),
      client = new QueryClient();
    const observer = new QueryObserver(client, {
      queryKey: ["atlas", "health", r.geography.id],
      initialData: r,
      staleTime: Infinity,
    });
    const unsubscribe = observer.subscribe(() => {});
    const context = atlasSavedContext(
      new URLSearchParams({
        topic: "health:healthcare_spending",
        healthGroup: "funding",
        healthMetric: "oops_che",
        healthSince: "2010",
        perspective: "health",
      }),
    );
    expect(context.params.healthMetric).toBe("oops_che");
    expect(atlasNotebookSources(client, context)[0]).toMatchObject({
      family: "who",
      hashes: cfg.files.map((f) => f.sha256),
    });
    unsubscribe();
    client.clear();
  });
  it("coverage opens the exact WHO measure and does not pretend to have empty subgroup data", () => {
    const r = response();
    const rows = coverageOptions(r.geography.id, {
      health: { data: r },
      series: {},
      demography: {},
      history: {},
      energy: {},
      markets: {},
    });
    expect(rows.find((row) => row.id === "health:che_gdp")).toMatchObject({
      status: "available",
      target: {
        healthMetric: "che_gdp",
        healthGroup: "volume",
        perspective: "health",
      },
    });
    expect(rows.find((row) => row.id === "health:hk_usd_pc")?.status).toBe(
      "empty",
    );
    expect(coverageFamilyTarget("health", r.geography.id)).toMatchObject({
      healthMetric: "overview",
      perspective: "health",
    });
  });
  it("preserves the main country's chart when a requested comparison has no common values", async () => {
    const a = response(),
      b = response("USA", [{ year: 2001, values: { che_gdp: 14 } }]);
    vi.spyOn(api, "atlasHealth").mockImplementation(async (id) =>
      id === a.geography.id ? a : b,
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    function Harness() {
      const [params, setParams] = useState(new URLSearchParams());
      return (
        <QueryClientProvider client={client}>
          <AtlasDisplayContext.Provider
            value={{
              params,
              navigate: (v) =>
                setParams((p) => {
                  const n = new URLSearchParams(p);
                  Object.entries(v).forEach(([k, value]) => n.set(k, value));
                  return n;
                }),
            }}
          >
            <AtlasHealthPanel
              geography={a.geography}
              compareId={b.geography.id}
              showNumbers={false}
              job={null}
              topicId="health:healthcare_spending"
            />
          </AtlasDisplayContext.Provider>
        </QueryClientProvider>
      );
    }
    render(<Harness />);
    await waitFor(() =>
      expect(
        screen.getByRole("img", {
          name: /Gesundheitsausgaben zur Wirtschaftsleistung/,
        }),
      ).toBeTruthy(),
    );
    expect(
      screen.getAllByText(/Das Hauptland bleibt sichtbar/).length,
    ).toBeGreaterThan(0);
    fireEvent.change(
      screen.getByRole("combobox", { name: "Gesundheitsbilder ordnen" }),
      { target: { value: "investment" } },
    );
    expect(
      screen.getByRole("button", {
        name: /Infrastrukturinvestitionen je Einwohner/,
      }),
    ).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    client.clear();
  });
});
