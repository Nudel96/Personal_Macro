import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { browserAtlasDebt } from "../../services/atlas-browser";
import {
  atlasDebtCatalog as cfg,
  debtPoints,
  debtSegments,
  debtTopic,
  debtView,
  validDebtResponse,
  type AtlasDebtResponse,
  type DebtPoint,
} from "./atlas-debt";
import {
  coverageFamilyTarget,
  coverageMapped,
  coverageOptions,
} from "./atlas-coverage";
import {
  atlasContextParams,
  atlasNotebookSources,
  atlasSavedContext,
} from "./atlas-notebook-model";

const point = (
  period: string,
  households: number | null,
  corporations: number | null = households,
): DebtPoint => ({
  period,
  households,
  corporations,
  householdsBreak: false,
  corporationsBreak: false,
  householdsPreBreak: "",
  corporationsPreBreak: "",
});
function response(points: DebtPoint[], id = "m49:276"): AtlasDebtResponse {
  const a = cfg.areas.find((a) => a.geographyId === id)!;
  return {
    ...browserAtlasDebt(id),
    status: "available",
    profile: {
      geographyId: id,
      providerCode: a.code,
      providerLabel: a.label,
      decimals: a.decimals,
      points,
    },
    provenance: {
      recipe: cfg.recipe,
      url: cfg.url,
      sha256: "a".repeat(64),
      retrievedAt: "2026-09-09T12:00:00Z",
      fileModifiedAt: null,
      sourceRowCount: 187215,
      numericCellCount: 14118,
      areaCount: 48,
    },
  };
}
const quarters = () => [
  point("2000-Q1", 10),
  point("2000-Q2", 11),
  point("2000-Q3", 12),
  point("2000-Q4", 13),
  point("2001-Q1", 14),
  point("2001-Q2", 15),
];
describe("BIS-Schuldenbilder", () => {
  it("trennt Haushalte, Unternehmen und fehlende Werte von echten Nullen", () => {
    const r = response([
      point("2000-Q1", 0, 25),
      point("2000-Q2", null, 24),
      point("2000-Q3", 8, null),
    ]);
    expect(debtTopic("finance:household_debt")).toBe("households");
    expect(debtTopic("finance:corporate_debt")).toBe("corporations");
    expect(debtTopic("finance:private_credit")).toBeUndefined();
    expect(debtPoints(r, "households", "level").map((p) => p.value)).toEqual([
      0,
      null,
      8,
    ]);
    expect(debtPoints(r, "corporations", "level").map((p) => p.value)).toEqual([
      25,
      24,
      null,
    ]);
    expect(
      debtSegments(debtPoints(r, "households", "level")).map((s) => s.length),
    ).toEqual([1, 1]);
  });
  it("berechnet die Veränderung nur über vier vollständig beobachtete Quartalsabstände", () => {
    const r = response(quarters());
    expect(debtPoints(r, "households", "change").map((p) => p.value)).toEqual([
      null,
      null,
      null,
      null,
      4,
      4,
    ]);
    r.profile!.points[1].households = null;
    expect(
      debtPoints(r, "households", "change").every((p) => p.value === null),
    ).toBe(true);
    r.profile!.points = quarters().filter((p) => p.period !== "2000-Q3");
    expect(
      debtPoints(r, "households", "change").every((p) => p.value === null),
    ).toBe(true);
  });
  it("unterbricht Linien und Vorjahresvergleiche an Quellenbrüchen", () => {
    const r = response(quarters());
    r.profile!.points[1].householdsBreak = true;
    expect(debtPoints(r, "households", "change").map((p) => p.value)).toEqual([
      null,
      null,
      null,
      null,
      null,
      4,
    ]);
    expect(
      debtSegments(debtPoints(r, "households", "level")).map((s) => s.length),
    ).toEqual([1, 5]);
    expect(debtPoints(r, "corporations", "change")[4]?.value).toBe(4);
  });
  it("bewahrt die drei publizierten Nachkommastellen Kolumbiens", () => {
    const r = response(quarters(), "m49:170");
    r.profile!.points[0].households = 12.345;
    r.profile!.points[4].households = 12.348;
    expect(debtPoints(r, "households", "level")[0].value).toBe(12.345);
    expect(debtPoints(r, "households", "change")[4].value).toBe(0.003);
  });
  it("zeigt eigene Vorgeschichten auf gemeinsamer Skala und prüft Identitäten sowie Quellenstand", () => {
    const a = response([point("1970-Q4", 40), point("2006-Q1", 50)]);
    const b = response(
      [point("2006-Q1", 100), point("2006-Q2", 120)],
      "m49:156",
    );
    expect(debtView([a, b], "households", "level", 0)).toMatchObject({
      start: 1970 * 4 + 3,
      end: 2006 * 4 + 1,
      limit: 132,
      common: ["2006-Q1"],
    });
    expect(debtSegments(debtPoints(a, "households", "level"))).toHaveLength(2);
    expect(debtView([a, b], "households", "level", 2020)).toBeNull();
    b.provenance!.sha256 = "b".repeat(64);
    expect(debtView([a, b], "households", "level", 0)).toBeNull();
    a.profile!.geographyId = "m49:156";
    expect(validDebtResponse(a)).toBe(false);
  });
  it("katalogisiert 48 echte Profile und öffnet jede verfügbare Perspektive gezielt", () => {
    expect(cfg.areas).toHaveLength(48);
    expect(cfg.regions).toHaveLength(4);
    for (const a of cfg.areas)
      expect(coverageMapped("debt", a.geographyId)).toBe(true);
    for (const id of ["world", "un-wpp:903", "bis:reporting"])
      expect(coverageMapped("debt", id)).toBe(false);
    const options = coverageOptions("m49:276", {
      series: {},
      demography: {},
      history: {},
      energy: {},
      markets: {},
      debt: { data: response(quarters()) },
    }).filter((o) => o.family === "debt");
    expect(options).toHaveLength(4);
    expect(
      options.find((o) => o.id === "debt:corporations:change"),
    ).toMatchObject({
      status: "available",
      years: [2001],
      target: {
        topic: "finance:corporate_debt",
        debtMode: "change",
        debtSince: "0",
      },
    });
    expect(coverageFamilyTarget("debt", "bis:debt_reporting")).toMatchObject({
      area: "bis:debt_reporting",
      topic: "finance:household_debt",
      debtMode: "level",
    });
  });
  it("bewahrt Bildwahl und BIS-Herkunft in der gespeicherten Ansicht", () => {
    const context = atlasSavedContext(
      new URLSearchParams({
        topic: "finance:corporate_debt",
        area: "m49:276",
        compare: "m49:156",
        debtMode: "change",
        debtSince: "1980",
      }),
    );
    expect(atlasContextParams(context)?.get("debtMode")).toBe("change");
    expect(context.params.debtSince).toBe("1980");
    const client = new QueryClient();
    client.setQueryData(["atlas", "debt", "m49:276"], response(quarters()));
    const unsubscribe = new QueryObserver(client, {
      queryKey: ["atlas", "debt", "m49:276"],
      staleTime: Infinity,
    }).subscribe(() => {});
    expect(atlasNotebookSources(client, context)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ family: "bis", hashes: ["a".repeat(64)] }),
      ]),
    );
    unsubscribe();
    client.clear();
  });
});
