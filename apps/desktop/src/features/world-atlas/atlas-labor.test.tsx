import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { atlasCatalog } from "./atlas-catalog";
import {
  atlasLaborCatalog as cfg,
  laborValue,
  laborView,
  laborSegments,
  laborSelection,
  type AtlasLaborResponse,
} from "./atlas-labor";
import { AtlasLaborPanel } from "./atlas-labor-panel";
import {
  coverageOptions,
  coverageFamilyTarget,
  coverageFamilies,
} from "./atlas-coverage";
import { browserAtlasLabor } from "../../services/atlas-browser";
const metric = cfg.metrics.find((m) => m.id === "P")!;
function response(id = "m49:276"): AtlasLaborResponse {
  const a = cfg.areas.find((a) => a.geographyId === id)!;
  return {
    geography: atlasCatalog.geographies.find((g) => g.id === id)!,
    status: "available",
    profile: {
      geographyId: id,
      providerCode: a.code,
      providerLabel: a.label,
      points: [
        {
          year: 2000,
          values: { [metric.field]: 100, [cfg.totalField]: 1000 },
          flags: { [metric.field]: "A" },
        },
        {
          year: 2001,
          values: { [metric.field]: 0, [cfg.totalField]: 1000 },
          flags: { [metric.field]: "" },
        },
        {
          year: 2002,
          values: { [metric.field]: null, [cfg.totalField]: 1000 },
          flags: {},
        },
        {
          year: 2003,
          values: { [metric.field]: 150, [cfg.totalField]: 1000 },
          flags: { [metric.field]: "" },
        },
      ],
    },
    provenance: {
      retrievedAt: "2026-09-09T12:00:00Z",
      url: cfg.sourceUrl,
      sha256: cfg.sha256,
      release: cfg.release,
      sourceRelease: cfg.sourceRelease,
      recipe: cfg.recipe,
      sourceRowCount: cfg.expectedRows,
      sourceNumericCellCount: cfg.expectedNumericCells,
      numericCellCount: cfg.expectedCurrentNumericCells,
      areaCount: cfg.areas.length,
    },
  };
}
describe("ILO employment pictures", () => {
  it("uses the same-year total, preserves true zero and does not invent missing denominators", () => {
    const p = response().profile!.points;
    expect(laborValue(p[0], metric)).toBe(10);
    expect(laborValue(p[1], metric)).toBe(0);
    expect(laborValue(p[2], metric)).toBeNull();
    for (const total of [0, null, NaN, 1.5, 50])
      expect(
        laborValue(
          { ...p[0], values: { ...p[0].values, [cfg.totalField]: total } },
          metric,
        ),
      ).toBeNull();
  });
  it("shares calendar and scale without connecting gaps or mixing releases", () => {
    const de = response(),
      us = response("m49:840");
    us.profile!.points[0].values[metric.field] = 200;
    const view = laborView([de, us], metric, 1991, 2024)!;
    expect(view.max).toBe(20);
    expect(view.lastCommonYear).toBe(2003);
    expect(laborSegments(view.series[0].points)).toHaveLength(1);
    expect(view.series[0].points[0].adjusted).toBe(true);
    us.provenance!.sha256 = "changed";
    expect(laborView([de, us], metric, 1991, 2024)).toBeNull();
  });
  it("has explicit country and ILO region mappings and a desktop-only fallback", () => {
    expect(cfg.areas).toHaveLength(190);
    expect(cfg.metrics).toHaveLength(14);
    expect(cfg.areas.find((a) => a.code === "X06")?.geographyId).toBe(
      "ilo:africa",
    );
    expect(cfg.areas.some((a) => a.code === "CHA")).toBe(false);
    expect(browserAtlasLabor("m49:276")).toMatchObject({
      status: "desktop_required",
      profile: null,
    });
    expect(coverageFamilies.some((f) => f.id === "labor")).toBe(true);
    expect(coverageFamilyTarget("labor", "m49:276")).toMatchObject({
      topic: "labor:sector_structure",
      perspective: "labor",
      laborSince: "1991",
    });
  });
  it("opens the exact field from coverage and validates persisted selections", () => {
    const choice = coverageOptions("m49:276", {
      labor: { data: response() },
      series: {},
      markets: {},
      demography: {},
      history: {},
      energy: {},
    }).find((o) => o.id === "labor:P")!;
    expect(choice.years).toEqual([2000, 2001, 2003]);
    expect(choice.target).toMatchObject({
      laborGroup: "society",
      laborMetric: "P",
      perspective: "labor",
    });
    expect(
      laborSelection(
        new URLSearchParams("laborGroup=society&laborMetric=P&laborSince=2010"),
        "labor:sector_structure",
      ),
    ).toMatchObject({
      group: "society",
      metric: "P",
      since: 2010,
      through: 2024,
    });
    expect(
      laborSelection(
        new URLSearchParams("laborGroup=society&laborMetric=C&laborSince=2025"),
        "labor:sector_structure",
      ),
    ).toMatchObject({ metric: "", since: 1991 });
  });
  it("keeps country data visible when the comparison is unavailable and exposes grouped detail", async () => {
    const de = response();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    client.setQueryData(["atlas", "labor", de.geography.id], de);
    client.setQueryData(["atlas", "labor", "m49:832"], {
      ...browserAtlasLabor("m49:832"),
      status: "unsupported_area",
    });
    render(
      <QueryClientProvider client={client}>
        <AtlasLaborPanel
          geography={de.geography}
          compareId="m49:832"
          showNumbers={false}
          job={null}
          topicId="labor:sector_structure"
        />
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByLabelText("Beschäftigungsbilder ordnen"), {
      target: { value: "society" },
    });
    const card = screen.getByRole("button", { name: /^Bildung.*Anteil/ });
    fireEvent.click(card);
    expect(
      await screen.findByRole("heading", { name: "Bildung" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("img", {
        name: /Bildung.*Deutschland.*ILO-Modellschätzungen/,
      }),
    ).toBeTruthy();
    expect(
      screen.getByText(/Das Vergleichsgebiet besitzt kein eigenes ILO-Profil/),
    ).toBeTruthy();
    expect(screen.queryByText(/Gemeinsames Jahr/)).not.toBeTruthy();
    client.clear();
  });
});
