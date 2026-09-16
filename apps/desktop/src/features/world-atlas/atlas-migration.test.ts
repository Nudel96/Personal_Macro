import { describe, expect, it } from "vitest";
import { browserAtlasSeries } from "../../services/atlas-browser";
import { atlasUnits } from "./atlas-analysis";
import { statisticsPicture } from "./atlas-statistics-overview-model";
import type { AtlasSeriesResponse } from "./atlas-types";

function migration(code: string, values: [number, number | null][]) {
  return {
    ...browserAtlasSeries({
      seriesId: `worldbank:2:${code}`,
      geographyId: "m49:156",
    }),
    status: "available",
    points: values.map(([year, value]) => ({ year, value, sourceFlag: "" })),
  } satisfies AtlasSeriesResponse;
}

describe("Migration als getrennte demografische Bilder", () => {
  it("erhält negative Salden, echte Null und Datenlücken auf derselben Achse", () => {
    const data = migration("SM.POP.NETM", [
      [2000, -200],
      [2001, 0],
      [2002, null],
      [2003, 100],
    ]);
    const picture = statisticsPicture([data], { first: 2000, last: 2003 })!;
    expect(data.series.throughYear).toBe(2023);
    expect(data.series.observationKind).toBe("modeled_estimate");
    expect(atlasUnits[data.series.unit]).toContain("Personen pro Jahr");
    expect(picture.scale).toEqual({ min: -200, max: 100 });
    expect(picture.zeroY).toBe(44);
    expect(picture.rows[0].path.split("M")).toHaveLength(3);
    expect(picture.rows[0].isolated).toHaveLength(1);
  });

  it("zeichnet acht Bestandsjahre als einzelne Punkte statt einer jährlichen Welle", () => {
    const years = [1990, 1995, 2000, 2005, 2010, 2015, 2020, 2024];
    const data = migration(
      "SM.POP.TOTL",
      years.map((year, i) => [year, 500_000 + i * 100_000]),
    );
    const picture = statisticsPicture([data], { first: 1960, last: 2025 })!;
    expect(data.series.throughYear).toBe(2024);
    expect(atlasUnits[data.series.unit]).toContain("Migranten");
    expect(picture.rows[0].isolated).toHaveLength(8);
    expect(picture.rows[0].path).not.toContain("L");
    expect(picture.first).toBe(1990);
    expect(picture.last).toBe(2024);
  });

  it("bewahrt einen veröffentlichten gerundeten Nullanteil trotz positivem Bestand", () => {
    // WDI China 1990: the published UN-denominator share is rounded to zero.
    const count = migration("SM.POP.TOTL", [[1990, 518_395]]);
    const share = migration("SM.POP.TOTL.ZS", [[1990, 0]]);
    expect(count.series.unit).not.toBe(share.series.unit);
    expect(share.series.unit).toBe("percent_population");
    const picture = statisticsPicture([share], { first: 1990, last: 2024 })!;
    expect(picture.rows[0].latest).toEqual({ year: 1990, value: 0 });
    expect(picture.rows[0].isolated).toHaveLength(1);
    expect(picture.quality?.extent).toEqual({ first: 1990, last: 1990 });
    expect(
      statisticsPicture([count, share], { first: 1990, last: 2024 }),
    ).toBeNull();
  });
});
