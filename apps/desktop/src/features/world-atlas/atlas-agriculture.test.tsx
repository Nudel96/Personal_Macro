import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../../services/commands";
import { browserAtlasAgriculture } from "../../services/atlas-browser";
import { atlasCatalog } from "./atlas-catalog";
import {
  agricultureSegments,
  agricultureView,
  atlasAgricultureCatalog as config,
  type AtlasAgricultureResponse,
  type AgriculturePoint,
} from "./atlas-agriculture";
import {
  AgricultureChart,
  AtlasAgriculturePanel,
} from "./atlas-agriculture-panel";
import {
  coverageMapped,
  coverageOptions,
  coverageFamilyTarget,
} from "./atlas-coverage";
import { atlasSavedContext } from "./atlas-notebook-model";

vi.mock("../../services/commands", () => ({
  api: { atlasAgriculture: vi.fn(), syncAtlasAgriculture: vi.fn() },
  isTauri: () => true,
}));
const point = (
  year: number,
  total: number | null,
  perCapita: number | null = total,
): AgriculturePoint => ({ year, total, perCapita });
function response(
  id = "m49:356",
  points = [point(2000, 50), point(2001, 60), point(2003, 80)],
): AtlasAgricultureResponse {
  return {
    geography: atlasCatalog.geographies.find((g) => g.id === id)!,
    status: "available",
    profile: {
      geographyId: id,
      providerCode: "100",
      providerLabel: "India",
      series: Object.fromEntries(config.items.map((i) => [i.code, points])),
    },
    provenance: {
      retrievedAt: "2026-09-09T00:00:00Z",
      fileModifiedAt: null,
      url: config.url,
      sha256: "a".repeat(64),
      release: config.release,
      sourceRowCount: 3,
      numericCellCount: 3,
      areaCount: 1,
      recipe: config.recipe,
    },
  };
}
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
describe("FAO agricultural pictures", () => {
  it("keeps real zero, source gaps, per-person values and matching years on one scale", () => {
    const a = response("m49:356", [
      point(2000, 0, 5),
      point(2001, 80, 60),
      point(2003, 120, 99),
    ]);
    const b = response("m49:156", [
      point(2001, 150, 90),
      point(2002, null),
      point(2003, 170, 105),
      point(2004, 180),
    ]);
    const view = agricultureView([a, b], "15", "total", 1961)!;
    expect(view.years).toEqual([2001, 2002, 2003]);
    expect(view.series[0].values).toEqual([80, null, 120]);
    expect(view.series[1].values).toEqual([150, null, 170]);
    expect(view.max).toBeGreaterThan(170);
    expect(agricultureView([a], "15", "total", 1961)!.series[0].values[0]).toBe(
      0,
    );
    expect(
      agricultureView([a, b], "15", "perCapita", 1961)!.series[0].values,
    ).toEqual([60, null, 99]);
    expect(
      agricultureSegments(view.series[0].values).map((s) => s.length),
    ).toEqual([1, 1]);
  });
  it("rejects mixed sources, nonoverlapping observations and absent market values", () => {
    const a = response(),
      b = response("m49:156", [point(1900, 70)]);
    expect(agricultureView([a, b], "15", "total", 1961)).toBeNull();
    b.profile!.series["15"] = [point(2001, 95)];
    b.provenance!.sha256 = "b".repeat(64);
    expect(agricultureView([a, b], "15", "total", 1961)).toBeNull();
    expect(agricultureView([a], "unknown", "total", 1961)).toBeNull();
    expect(
      agricultureView(
        [response("m49:356", [point(2000, null)])],
        "15",
        "total",
        1961,
      ),
    ).toBeNull();
  });
  it("keeps source regions and mainland China explicit across navigation and coverage", () => {
    expect(config.items).toHaveLength(196);
    expect(config.groups).toHaveLength(12);
    expect(config.areas).toHaveLength(234);
    expect(config.areas.find((a) => a.code === "41")?.geographyId).toBe(
      "m49:156",
    );
    expect(config.areas.find((a) => a.code === "351")?.geographyId).toBe(
      "fao:351",
    );
    expect(coverageMapped("agriculture", "world")).toBe(false);
    expect(coverageMapped("agriculture", "fao:5000")).toBe(true);
    expect(coverageMapped("agriculture", "m49:254")).toBe(false);
    expect(coverageFamilyTarget("agriculture", "fao:5100").agriGroup).toBe(
      "overview",
    );
    expect(new Set(config.items.map((i) => i.code)).size).toBe(196);
    expect(
      config.areas.every((a) =>
        atlasCatalog.geographies.some((g) => g.id === a.geographyId),
      ),
    ).toBe(true);
  });
  it("reports missing individual markets instead of using other available agricultural data", () => {
    const row = response();
    delete row.profile!.series["661"];
    const options = coverageOptions(row.geography.id, {
      agriculture: { data: row },
      series: {},
      demography: {},
      history: {},
      energy: {},
      markets: {},
    });
    expect(options.find((o) => o.id === "agriculture:661:total")?.status).toBe(
      "empty",
    );
    expect(options.find((o) => o.id === "agriculture:15:total")?.status).toBe(
      "available",
    );
    expect(
      options.find((o) => o.id === "agriculture:15:perCapita")?.target.agriMode,
    ).toBe("perCapita");
  });
  it("draws isolated points without bridging gaps and reveals numeric tooltips only on request", () => {
    const view = agricultureView([response()], "15", "total", 1961)!;
    const { container, rerender } = render(
      <AgricultureChart view={view} title="Weizen" showNumbers={false} />,
    );
    expect(container.querySelectorAll("polyline")).toHaveLength(1);
    expect(container.querySelectorAll("circle")).toHaveLength(3);
    expect(container.querySelectorAll("circle title")).toHaveLength(0);
    rerender(<AgricultureChart view={view} title="Weizen" showNumbers />);
    expect(container.querySelectorAll("circle title")).toHaveLength(3);
  });
  it("shows grouped pictures, searches across groups, opens a large picture and switches the per-person basis", async () => {
    vi.mocked(api.atlasAgriculture).mockResolvedValue(response());
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <AtlasAgriculturePanel
          geography={response().geography}
          showNumbers={false}
          job={null}
          onAreaChange={() => {}}
        />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(6));
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "Kaffee" },
    });
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(1));
    fireEvent.click(
      screen.getByRole("button", { name: "Bild öffnen: Rohkaffee" }),
    );
    expect(
      screen.getByRole("button", { name: "Zur Bildübersicht" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Je Einwohner" }));
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain(
      "Je Einwohner",
    );
    expect(screen.queryByRole("table")).toBeNull();
    client.clear();
  });
  it("retains picture parameters and uses an honest desktop-required browser response", () => {
    const params = new URLSearchParams({
      perspective: "agriculture",
      agriMode: "perCapita",
      agriSince: "1980",
      agriGroup: "016",
      agriItem: "661",
      agriSearch: "Kakao",
      agriPage: "0",
    });
    expect(atlasSavedContext(params).params).toEqual(
      Object.fromEntries(params),
    );
    expect(browserAtlasAgriculture("m49:356").status).toBe("desktop_required");
    expect(browserAtlasAgriculture("m49:356").profile).toBeNull();
  });
});
