import { describe, expect, it } from "vitest";
import { browserAtlasSeries } from "../../services/atlas-browser";
import { atlasUnits } from "./atlas-analysis";
import { atlasCatalog } from "./atlas-catalog";
import { statisticsPicture } from "./atlas-statistics-overview-model";
import type { AtlasSeriesResponse } from "./atlas-types";

function row(code: string, values: [number, number | null][]) {
  return {
    ...browserAtlasSeries({
      seriesId: `worldbank:2:${code}`,
      geographyId: "m49:276",
    }),
    status: "available",
    points: values.map(([year, value]) => ({ year, value, sourceFlag: "" })),
  } satisfies AtlasSeriesResponse;
}

describe("Neue Energie- und Wirtschaftsperspektiven", () => {
  it("zeigt Nettoexporte unter der echten Nulllinie und trennt eine Datenlücke", () => {
    const data = row("EG.IMP.CONS.ZS", [
      [2000, -120],
      [2001, 0],
      [2002, null],
      [2003, 60],
    ]);
    expect(atlasUnits[data.series.unit]).toContain("Primärenergieverbrauch");
    const picture = statisticsPicture([data], { first: 2000, last: 2003 })!;
    expect(picture.scale).toEqual({ min: -120, max: 60 });
    expect(picture.zeroY).toBeGreaterThan(12);
    expect(picture.zeroY).toBeLessThan(108);
    expect(picture.rows[0].path).toContain("L109.333,44.000 M312.000,12.000");
    expect(picture.rows[0].isolated).toHaveLength(1);
  });

  it("erfindet zwischen historischen Logistikbefragungen keine jährliche Welle", () => {
    const data = row("LP.LPI.OVRL.XQ", [
      [2007, 4.1],
      [2010, 4.1],
      [2012, 4.03],
      [2022, 4.1],
    ]);
    expect(data.series.throughYear).toBe(2022);
    expect(data.series.unit).toBe("logistics_index_1_5");
    const picture = statisticsPicture([data], { first: 2007, last: 2025 })!;
    expect(picture.rows[0].path).not.toContain("L");
    expect(picture.rows[0].isolated).toHaveLength(4);
    expect(picture.last).toBe(2022);
  });

  it("behält Bezugsgrößen und Modellcharakter der neuen Perspektiven", () => {
    const get = (code: string) =>
      atlasCatalog.series.find((s) => s.providerCode === code)!;
    expect(get("EG.EGY.PRIM.PP.KD").providerLabel).toContain("2021 PPP");
    expect(get("IC.BUS.NDNS.ZS").unit).toBe("registrations_per_1000_15_64");
    expect(get("SL.TLF.ADVN.ZS").unit).toBe(
      "percent_advanced_education_working_age",
    );
    expect(get("TT.PRI.MRCH.XD.WD").unit).toBe("index_2015");
    expect(get("IS.SHP.GCNW.XQ").unit).toBe("shipping_index_2004_max");
    const rents = atlasCatalog.series.filter((s) =>
      /^NY\.GDP\.(PETR|NGAS|COAL|MINR|FRST|TOTL)\.RT\.ZS$/.test(s.providerCode),
    );
    expect(rents).toHaveLength(6);
    expect(
      rents.every(
        (s) =>
          s.unit === "percent_gdp" && s.observationKind === "modeled_estimate",
      ),
    ).toBe(true);
  });
});
