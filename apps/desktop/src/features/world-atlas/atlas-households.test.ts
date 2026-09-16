import { describe, expect, it } from "vitest";
import { browserAtlasHouseholds } from "../../services/atlas-browser";
import { atlasCatalog } from "./atlas-catalog";
import { atlasSavedContext, atlasContextParams } from "./atlas-notebook-model";
import {
  coverageMapped,
  coverageOptions,
  coverageFamilyTarget,
} from "./atlas-coverage";
import {
  atlasHouseholdsCatalog as cfg,
  householdSelection,
  householdValue,
  householdView,
  validHouseholdResponse,
  type AtlasHouseholdsResponse,
  type HouseholdObservation,
} from "./atlas-households";

const metric = (id: string) => cfg.metrics.find((m) => m.id === id)!;
function point(
  sourceRow: number,
  year: number,
  values: Record<string, number | null>,
): HouseholdObservation {
  return {
    recordId: `unhh2026:${sourceRow}`,
    sourceRow,
    year,
    sourceCategory: "MICS",
    sourceCatalogId: String(sourceRow),
    sourceName: "Synthetische Testerhebung",
    unweighted: sourceRow === 6,
    values,
  };
}
function response(
  observations: HouseholdObservation[],
  id = "m49:276",
): AtlasHouseholdsResponse {
  return {
    ...browserAtlasHouseholds(id),
    status: "available",
    profile: {
      geographyId: id,
      providerCode: atlasCatalog.geographies.find((a) => a.id === id)!.iso3,
      providerLabels: ["Test"],
      observations,
    },
    provenance: {
      retrievedAt: "2026-09-09T12:00:00Z",
      fileModifiedAt: null,
      url: cfg.url,
      sha256: cfg.sha256,
      release: cfg.release,
      recipe: cfg.recipe,
      sourceRowCount: 1129,
      numericCellCount: 36142,
      areaCount: 200,
    },
  };
}
describe("UN-Haushaltsbilder", () => {
  it("erhält alternative Quellen, echte Nullwerte und Lücken ohne Mittelung oder Jahresergänzung", () => {
    const r = response([
      point(6, 1999, { size1: 0 }),
      point(7, 2005, { size1: 20 }),
      point(8, 2005, { size1: 40 }),
      point(9, 2010, { size1: null }),
    ]);
    const v = householdView([r], metric("size1"), 1959)!;
    expect(v.sets[0].points.map((p) => [p.year, p.values.size1])).toEqual([
      [1999, 0],
      [2005, 20],
      [2005, 40],
    ]);
    expect(v.sets[0].points[0].unweighted).toBe(true);
    expect([v.first, v.last, v.min, v.max]).toEqual([1999, 2005, 0, 100]);
    expect(r.profile!.observations).toHaveLength(4);
  });
  it("wählt die jüngste nutzbare Originalzeile und erhält bewusste Auswahl auch bei fehlendem Wert", () => {
    const r = response([
      point(8, 2011, { averageSize: 2 }),
      point(7, 2011, { averageSize: 3 }),
      point(9, 2022, { averageSize: null }),
    ]);
    expect(householdSelection(r, metric("averageSize"), "")?.recordId).toBe(
      "unhh2026:7",
    );
    expect(
      householdSelection(r, metric("averageSize"), "unhh2026:8")?.values
        .averageSize,
    ).toBe(2);
    expect(
      householdSelection(r, metric("averageSize"), "unhh2026:9")?.values
        .averageSize,
    ).toBeNull();
    expect(
      householdSelection(r, metric("averageSize"), "unhh2026:999")?.recordId,
    ).toBe("unhh2026:7");
  });
  it("trennt Originalspalten, Teilgruppen und verschiedene Nenner", () => {
    const p = point(6, 2000, {
      size1: 10,
      onePerson: null,
      meanUnder15All: 1,
      meanUnder15Present: 3,
      singleParent: 15,
      singleMother: 12,
      nuclear: 80,
      multiGeneration: 60,
    });
    expect(householdValue(p, metric("onePerson"))).toBeNull();
    expect(householdValue(p, metric("meanUnder15Present"))).toBe(3);
    expect(householdValue(p, metric("meanUnder15All"))).toBe(1);
    expect(householdValue(p, metric("singleParent"))).toBe(15);
    expect(householdValue(p, metric("nuclear"))).toBe(80);
    expect(
      householdValue(point(7, 2000, { size1: 101 }), metric("size1")),
    ).toBeNull();
  });
  it("teilt Skalen über tatsächliche Erhebungsjahre und lehnt gemischte Quellenstände ab", () => {
    const a = response([point(6, 2000, { averageSize: 2 })]);
    const b = response([point(7, 2020, { averageSize: 6 })], "m49:356");
    const v = householdView([a, b], metric("averageSize"), 1959)!;
    expect([v.first, v.last, v.max]).toEqual([2000, 2020, 6]);
    expect(v.sets.map((s) => s.points.length)).toEqual([1, 1]);
    b.provenance!.retrievedAt = "2026-09-08T12:00:00Z";
    expect(householdView([a, b], metric("averageSize"), 1959)).toBeNull();
    a.profile!.geographyId = "m49:356";
    expect(validHouseholdResponse(a)).toBe(false);
  });
  it("ordnet 39 Perspektiven und 200 Gebiete zu und erfindet kein Weltaggregat", () => {
    expect(cfg.metrics).toHaveLength(39);
    expect(cfg.groups).toHaveLength(7);
    expect(cfg.areas).toHaveLength(200);
    expect(cfg.metrics.map((m) => m.column)).toEqual(
      Array.from({ length: 39 }, (_, i) => i + 11),
    );
    expect(coverageMapped("households", "provider:XKX")).toBe(true);
    expect(coverageMapped("households", "world")).toBe(false);
    expect(coverageMapped("households", "un-wpp:903")).toBe(false);
    const r = response([
      point(6, 2000, { size1: 0 }),
      point(7, 2000, { size1: 10 }),
    ]);
    const options = coverageOptions("m49:276", {
      series: {},
      demography: {},
      history: {},
      energy: {},
      markets: {},
      households: { data: r },
    }).filter((o) => o.family === "households");
    expect(options).toHaveLength(39);
    expect(options.find((o) => o.id === "households:size1")).toMatchObject({
      status: "available",
      years: [2000],
      target: { hhGroup: "size", hhMetric: "size1", hhRecord: "" },
    });
    expect(options.find((o) => o.id === "households:onePerson")?.status).toBe(
      "empty",
    );
    expect(coverageFamilyTarget("households", "m49:276")).toMatchObject({
      topic: cfg.topicId,
      hhMetric: "averageSize",
      hhRecord: "",
    });
  });
  it("bewahrt konkrete Erhebungen und Anzeigeentscheidungen beim Wiederöffnen", () => {
    const p = new URLSearchParams({
      topic: cfg.topicId,
      area: "m49:276",
      compare: "m49:356",
      hhGroup: "types",
      hhMetric: "singleParent",
      hhSince: "1980",
      hhRecord: "unhh2026:20",
      hhCompareRecord: "unhh2026:44",
    });
    const context = atlasSavedContext(p);
    expect(atlasContextParams(context)?.toString()).toBe(
      new URLSearchParams(Object.entries(context.params)).toString(),
    );
    expect(context.params.hhRecord).toBe("unhh2026:20");
    expect(context.params.hhCompareRecord).toBe("unhh2026:44");
  });
});
