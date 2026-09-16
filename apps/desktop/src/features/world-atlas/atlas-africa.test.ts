import { describe, expect, it } from "vitest";
import { browserAtlasSeries } from "../../services/atlas-browser";
import africa from "./data/africa-development-catalog.json";
import { atlasCatalog } from "./atlas-catalog";
import { atlasUnits } from "./atlas-analysis";
import { coverageMapped, coverageOptions } from "./atlas-coverage";
import { atlasSeriesConnect } from "./atlas-source-series";
import { statisticsPicture } from "./atlas-statistics-overview-model";

const row = (code: string) => ({
  ...browserAtlasSeries({
    seriesId: `worldbank:2:${code}`,
    geographyId: "m49:566",
  }),
  status: "available" as const,
  points: [2021, 2022, 2024].map((year, index) => ({
    year,
    value: index,
    sourceFlag: "",
  })),
});

describe("Afrika · zusätzliche Entwicklungsdaten", () => {
  it("erhält Bezugsgrößen, Quellenidentität und historische Modellgrenzen", () => {
    for (const series of africa.series) {
      const definition = atlasCatalog.series.find((s) => s.id === series.id)!;
      expect(definition.providerLabel).toBe(series.providerLabel);
      expect(definition.throughYear).toBe(2024);
      expect(atlasUnits[definition.unit]).toBeTruthy();
      expect(definition.scopeNote).toBeTruthy();
    }
    expect(row("DT.DOD.DECT.GN.ZS").series).toMatchObject({
      topicId: "finance:external_debt",
      unit: "percent_gni",
    });
    expect(row("DT.TDS.DECT.EX.ZS").series.unit).toBe(
      "percent_exports_primary_income",
    );
    expect(row("EG.ELC.ACCS.RU.ZS").series.unit).not.toBe(
      row("EG.ELC.ACCS.UR.ZS").series.unit,
    );
    expect(row("SI.POV.LMIC").series.providerLabel).toContain(
      "$4.20 a day (2021 PPP)",
    );
    expect(row("SN.ITK.DEFC.ZS").series.scopeNote).toContain("weniger als 2,5");
    expect(row("SH.MLR.INCD.P3").series.unit).toBe(
      "malaria_cases_per_1000_at_risk",
    );
  });
  it("verbindet auch benachbarte Erhebungen und Mehrjahresfenster nicht zu Jahreslinien", () => {
    for (const code of [
      "SI.POV.LMIC",
      "SI.DST.FRST.20",
      "SN.ITK.MSFI.ZS",
      "SH.STA.STNT.ZS",
      "SL.UEM.NEET.ZS",
      "EN.POP.SLUM.UR.ZS",
    ]) {
      const response = row(code);
      expect(atlasSeriesConnect(response.series)).toBe(false);
      const picture = statisticsPicture([response], {
        first: 2021,
        last: 2024,
      })!;
      expect(picture.rows[0].path).not.toContain("L");
      expect(picture.rows[0].isolated).toHaveLength(3);
    }
  });
  it("behält negative Nettohilfe, echte Null und Datenlücken", () => {
    const response = {
      ...row("DT.ODA.ODAT.GN.ZS"),
      points: [-3, 0, null, 120].map((value, index) => ({
        year: 2020 + index,
        value,
        sourceFlag: "",
      })),
    };
    const picture = statisticsPicture([response], { first: 2020, last: 2023 })!;
    expect(picture.scale).toEqual({ min: -3, max: 120 });
    expect(picture.rows[0].path.match(/M/g)).toHaveLength(2);
  });
  it("ordnet veröffentlichte WDI-Regionen ausschließlich ihrer Quellenfamilie zu", () => {
    for (const region of africa.regions) {
      expect(
        atlasCatalog.geographies.find((g) => g.id === region.geographyId),
      ).toMatchObject({ iso3: "", kind: "aggregate", regionId: "Africa" });
      expect(coverageMapped("statistics", region.geographyId)).toBe(true);
      expect(coverageMapped("demography", region.geographyId)).toBe(false);
      expect(
        browserAtlasSeries({
          seriesId: africa.series[0].id,
          geographyId: region.geographyId,
        }),
      ).toMatchObject({ status: "desktop_required", points: [] });
    }
    expect(coverageMapped("statistics", "un-wpp:903")).toBe(false);
    expect(coverageMapped("statistics", "m49:832")).toBe(false);
  });
  it("öffnet den konkreten Statistiktreffer ohne eine fehlende Perspektive zu verdecken", () => {
    const options = coverageOptions("m49:566", {
      series: {},
      demography: {},
      history: {},
      energy: {},
      markets: {},
    });
    const hit = options.find(
      (o) => o.target.series === "worldbank:2:EN.POP.SLUM.UR.ZS",
    )!;
    expect(hit.target).toMatchObject({
      topic: "housing:housing_supply",
      perspective: "worldbank",
    });
    expect(hit.status).not.toBe("available");
    expect(
      atlasCatalog.geographies.some((g) => g.id === "eu:am_priority"),
    ).toBe(true);
  });
});
