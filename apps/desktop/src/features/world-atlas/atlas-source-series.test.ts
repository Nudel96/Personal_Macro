import { describe, expect, it } from "vitest";
import { atlasCatalog } from "./atlas-catalog";
import { atlasComparison } from "./atlas-analysis";
import { browserAtlasSeries } from "../../services/atlas-browser";
import {
  atlasSeriesComparable,
  atlasSeriesConnect,
  atlasSdgCatalog,
  atlasSdgPointSource,
} from "./atlas-source-series";
import { statisticsPicture } from "./atlas-statistics-overview-model";

const response = (id: string, geographyId = "m49:276") => ({
  ...browserAtlasSeries({ seriesId: id, geographyId }),
  status: "available" as const,
  points: [2020, 2021, 2023].map((year, index) => ({
    year,
    value: index,
    sourceFlag: "",
  })),
});

describe("Geprüfte UN-SDG-Perspektiven", () => {
  it("führt eindeutige Dimensionen mit historischen Grenzen und echten Gebietscodes", () => {
    expect(atlasSdgCatalog.series).toHaveLength(38);
    expect(new Set(atlasSdgCatalog.series.map((s) => s.topicId)).size).toBe(19);
    for (const definition of atlasSdgCatalog.series) {
      expect(
        atlasCatalog.series.find((s) => s.id === definition.id),
      ).toMatchObject({ sourceId: "unsdg", throughYear: 2025 });
      expect(definition.expectedNumeric).toBeGreaterThan(0);
      expect(definition.dimensions["Reporting Type"]).toBe("G");
    }
    expect(
      atlasSdgCatalog.areas.some((a) => a.geographyId === "un-wpp:903"),
    ).toBe(false);
  });
  it("trennt Gesamtzufriedenheit, Stadtzeilen und nationale Verkehrserhebungen", () => {
    for (const suffix of ["GOV", "HLTH", "PRM", "SEC"]) {
      const survey = response(`unsdg:SP_PSR_OSATIS_${suffix}`);
      expect(atlasSeriesConnect(survey.series)).toBe(false);
      expect(
        atlasComparison([survey, response(survey.series.id, "m49:356")]),
      ).toBeNull();
      expect(
        statisticsPicture([survey], { first: 2020, last: 2024 })?.rows[0].path,
      ).not.toContain("L");
    }
    const transit = atlasSdgCatalog.series.find(
      (s) => s.providerCode === "SP_TRN_PUBL",
    )!;
    expect(transit.dimensions).toEqual({
      Age: "ALLAGE",
      Sex: "BOTHSEX",
      "Reporting Type": "G",
      "Disability status": "_T",
      Cities: "NOCITI",
    });
    expect(transit.connect).toBe(false);
    expect(transit.throughYear).toBe(2025);
  });
  it("zeichnet Erhebungsjahre einzeln und vergleicht nationale Armutsgrenzen nicht", () => {
    const survey = response("unsdg:EN_MWT_RCYR");
    expect(atlasSeriesConnect(survey.series)).toBe(false);
    const picture = statisticsPicture([survey], { first: 2020, last: 2024 })!;
    expect(picture.rows[0].path).not.toContain("L");
    expect(picture.rows[0].isolated).toHaveLength(3);
    const poverty = response("unsdg:SI_POV_NAHC");
    expect(atlasSeriesComparable(poverty.series)).toBe(false);
    expect(
      atlasComparison([poverty, response(poverty.series.id, "m49:356")]),
    ).toBeNull();
    expect(atlasComparison([poverty])).not.toBeNull();
    expect(atlasSeriesConnect(response("unsdg:ER_RSK_LST").series)).toBe(true);
  });
  it("behält Originalkennzeichen und Unsicherheitsgrenzen statt Ersatzwerte", () => {
    const source = {
      provider: "unsdg",
      value: "..",
      attributes: { Nature: "M" },
      upperBound: "1.1",
      footnotes: ["Quellenhinweis"],
    };
    expect(atlasSdgPointSource(JSON.stringify(source))).toEqual(source);
    expect(atlasSdgPointSource("missing")).toBeNull();
    expect(atlasSdgPointSource("{broken")).toBeNull();
  });
});
