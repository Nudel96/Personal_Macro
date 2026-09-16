import { describe, expect, it } from "vitest";
import {
  atlasComparison,
  atlasDisplayedQuality,
  atlasExtent,
  atlasQuality,
  atlasIsolatedPoint,
  atlasUnits,
  atlasValueDomain,
} from "./atlas-analysis";
import { atlasCatalog, atlasGeographies } from "./atlas-catalog";
import { browserAtlasSeries } from "../../services/atlas-browser";
import type { AtlasSeriesResponse } from "./atlas-types";

function series(points: [number, number | null][]): AtlasSeriesResponse {
  return {
    ...browserAtlasSeries({
      seriesId: "worldbank:2:SP.POP.TOTL",
      geographyId: "m49:276",
    }),
    status: "available",
    points: points.map(([year, value]) => ({ year, value, sourceFlag: "" })),
  };
}

describe("Atlas-Datenbedeutung", () => {
  it("vertauscht Beschäftigungs- und Industrieanteile nicht und erhält bestehende Einstiegsreihen", () => {
    const employment = atlasCatalog.series.filter(
      (s) => s.topicId === "labor:employment",
    );
    expect(employment[0].providerCode).toBe("SL.EMP.TOTL.SP.ZS");
    const sectors = employment.filter((s) =>
      /^SL\.(AGR|IND|SRV)\.EMPL\.ZS$/.test(s.providerCode),
    );
    expect(sectors).toHaveLength(3);
    expect(
      sectors.every(
        (s) =>
          s.unit === "percent_employment" &&
          s.throughYear === 2024 &&
          s.observationKind === "modeled_estimate",
      ),
    ).toBe(true);
    const chemical = atlasCatalog.series.find(
      (s) => s.providerCode === "NV.MNF.CHEM.ZS.UN",
    )!;
    expect(chemical.unit).toBe("percent_manufacturing_value_added");
    expect(chemical.scopeNote).toContain("nicht das BIP");
    const residual = atlasCatalog.series.find(
      (s) => s.providerCode === "NV.MNF.OTHR.ZS.UN",
    )!;
    expect(residual.scopeNote).toContain(
      "kein Ersatz für fehlende Einzelreihen",
    );
    expect(atlasUnits[chemical.unit]).not.toBe(atlasUnits[sectors[0].unit]);
    expect(atlasUnits[chemical.unit]).not.toBe(atlasUnits.percent_gdp);
  });
  it("erhält echte Null, negative Außenbeiträge und Bruttoquoten über hundert auf einer gemeinsamen Skala", () => {
    expect(atlasValueDomain([null, 112, 140])).toEqual({ min: 0, max: 140 });
    expect(atlasValueDomain([-20, 40, null])).toEqual({ min: -20, max: 40 });
    expect(atlasValueDomain([-40, -20])).toEqual({ min: -40, max: 0 });
    expect(atlasValueDomain([0])).toEqual({ min: 0, max: 1 });
    expect(atlasValueDomain([null])).toBeNull();
    expect(atlasIsolatedPoint([null, 30, null], 1)).toBe(true);
    expect(atlasIsolatedPoint([0, null, null], 0)).toBe(true);
    expect(atlasIsolatedPoint([null, 30, 31], 1)).toBe(false);
    expect(atlasIsolatedPoint([null, null, null], 1)).toBe(false);
  });

  it("hält jede Statistik an eine verständliche Einheit und eine passende Themenzuordnung gebunden", () => {
    for (const series of atlasCatalog.series) {
      expect(atlasUnits[series.unit], series.id).toBeTruthy();
      if (series.sourceId === "unsdg") {
        expect(series.id).toMatch(
          new RegExp(`^unsdg:${series.providerCode}(?::[A-Z]+)?$`),
        );
        expect(series.throughYear).toBe(2025);
      } else expect(series.id).toBe(`worldbank:2:${series.providerCode}`);
      if (
        series.observationKind !== "unknown" &&
        series.providerCode !== "SL.UEM.TOTL.ZS"
      ) {
        expect(series.explanation, series.id).toBeTruthy();
        expect(series.scopeNote, series.id).toBeTruthy();
      }
    }
    const graduation = atlasCatalog.series.find(
      (series) => series.providerCode === "SE.PRM.CMPT.ZS",
    )!;
    expect(graduation.unit).toBe("percent_gross_intake");
    expect(graduation.label).toContain("Zugang zur Abschlussklasse");
    expect(
      atlasCatalog.series.find(
        (series) => series.providerCode === "SL.GDP.PCAP.EM.KD",
      )?.unit,
    ).toBe("constant_2021_ppp_per_worker");
  });
  it("beschreibt die Richtung des sichtbaren Vergleichsfensters", () => {
    const left = series([
      [2000, 1],
      [2001, 10],
      [2002, 8],
      [2003, 6],
    ]);
    const right = series([
      [2001, 20],
      [2002, 22],
      [2003, 23],
    ]);
    expect(atlasQuality(left).trend).toContain("gestiegen");
    expect(atlasDisplayedQuality([left, right])?.trend).toContain("gesunken");
  });
  it("behandelt null als Lücke und null Euro beziehungsweise null Prozent als wirklichen Wert", () => {
    const data = series([
      [2000, 0],
      [2002, 2],
      [2003, null],
      [2004, 4],
    ]);
    expect(atlasExtent(data.points)).toEqual({ first: 2000, last: 2004 });
    expect(atlasQuality(data, 2026).gaps).toEqual([2001, 2003]);
    expect(atlasQuality(data, 2026).old).toBe(true);
    expect(atlasComparison([data])?.rows[0].values).toEqual([
      0,
      null,
      2,
      null,
      4,
    ]);
    expect(atlasExtent(series([[2000, null]]).points)).toBeNull();
  });

  it("vergleicht nur gemeinsame Jahre, gleiche Einheiten und passende Datenstände", () => {
    const left = series([
      [2000, 2],
      [2001, 3],
      [2002, 4],
      [2003, 5],
    ]);
    const right = series([
      [2002, 7],
      [2003, 6],
      [2004, 8],
    ]);
    expect(atlasComparison([left, right])?.years).toEqual([2002, 2003]);
    right.series = { ...right.series, unit: "percent_population" };
    expect(atlasComparison([left, right])).toBeNull();
    expect(
      atlasComparison([series([[2000, 1]]), series([[2020, 2]])]),
    ).toBeNull();
    expect(
      atlasComparison([
        series([
          [2000, 1],
          [2002, 3],
        ]),
        series([[2001, 2]]),
      ]),
    ).toBeNull();
  });

  it("ordnet alle Themen und Regionen mit gültigen Identitäten ein", () => {
    for (const key of [
      "geographies",
      "topics",
      "groups",
      "domains",
      "series",
    ] as const) {
      expect(new Set(atlasCatalog[key].map((row) => row.id)).size).toBe(
        atlasCatalog[key].length,
      );
    }
    for (const topic of atlasCatalog.topics)
      expect(
        atlasCatalog.groups.some((group) => group.id === topic.groupId),
      ).toBe(true);
    for (const group of atlasCatalog.groups)
      expect(
        atlasCatalog.domains.some((domain) => domain.id === group.domainId),
      ).toBe(true);
    for (const source of atlasCatalog.series)
      expect(
        atlasCatalog.topics.some((topic) => topic.id === source.topicId),
      ).toBe(true);
    expect(
      atlasGeographies("Africa").every((area) => area.regionId === "Africa"),
    ).toBe(true);
    expect(atlasGeographies("Americas", "USA")[0].label).toBe(
      "Vereinigte Staaten",
    );
    for (const iso of ["DEU", "USA", "IND", "CHN", "TUV", "XKX", "TWN"])
      expect(atlasCatalog.geographies.some((area) => area.iso3 === iso)).toBe(
        true,
      );
  });

  it("erfindet im Browser keine Länderzeitreihe", () => {
    expect(
      browserAtlasSeries({
        seriesId: atlasCatalog.series[0].id,
        geographyId: "m49:276",
      }),
    ).toMatchObject({
      status: "desktop_required",
      points: [],
      provenance: null,
    });
  });
});
