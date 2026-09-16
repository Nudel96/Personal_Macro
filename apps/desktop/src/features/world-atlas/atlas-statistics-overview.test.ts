import { describe, expect, it } from "vitest";
import { browserAtlasSeries } from "../../services/atlas-browser";
import { atlasCatalog } from "./atlas-catalog";
import {
  statisticsFrame,
  statisticsGroups,
  statisticsPicture,
} from "./atlas-statistics-overview-model";
import type { AtlasSeriesResponse } from "./atlas-types";

function row(
  points: [number, number | null][],
  geographyId = "m49:276",
): AtlasSeriesResponse {
  return {
    ...browserAtlasSeries({ seriesId: "worldbank:2:SE.PRM.ENRR", geographyId }),
    status: "available",
    points: points.map(([year, value]) => ({ year, value, sourceFlag: "" })),
  };
}
describe("Statistische Übersicht", () => {
  it("verwendet dieselben Kalenderkoordinaten und innerhalb eines Vergleichs dieselbe Skala", () => {
    const frame = { first: 2000, last: 2020 };
    const picture = statisticsPicture(
      [
        row([
          [2000, 0],
          [2010, 120],
        ]),
        row(
          [
            [2000, -20],
            [2010, 20],
          ],
          "m49:356",
        ),
      ],
      frame,
    )!;
    expect(picture.scale).toEqual({ min: -20, max: 120 });
    expect(picture.rows[0].path).toBe("M8.000,94.286 M160.000,12.000");
    expect(picture.rows[1].path).toBe("M8.000,108.000 M160.000,80.571");
    expect(picture.rows[0].isolated).toHaveLength(2);
    expect(picture.rows[0].latest).toEqual({ year: 2010, value: 120 });
    expect(picture.rows[1].latest).toEqual({ year: 2010, value: 20 });
  });
  it("verbindet keine Lücken und zeigt nur gemeinsame Quellenstände, Jahre und Einheiten", () => {
    const left = row([
      [2000, 1],
      [2001, 2],
      [2002, null],
      [2003, 3],
    ]);
    const frame = { first: 2000, last: 2003 };
    const picture = statisticsPicture([left], frame)!;
    expect(picture.rows[0].path).toMatch(/^M8.000,.* L109.333,.* M312.000,/);
    expect(picture.rows[0].isolated).toHaveLength(1);
    expect(statisticsPicture([left, row([[2002, 5]])], frame)).toBeNull();
    const right = row(
      [
        [2001, 10],
        [2003, 20],
      ],
      "m49:356",
    );
    expect(statisticsPicture([left, right], frame)?.rows[0].latest).toEqual({
      year: 2003,
      value: 3,
    });
    right.series = { ...right.series, unit: "percent_gdp" };
    expect(statisticsPicture([left, right], frame)).toBeNull();
  });
  it("begrenzt die Übersicht auf den gewählten Zeitraum bis zum vorherigen Kalenderjahr", () => {
    const frame = statisticsFrame(20, new Date("2026-09-09T12:00:00Z"));
    expect(frame).toEqual({ first: 2006, last: 2025 });
    expect(
      statisticsPicture(
        [
          row([
            [2005, 100],
            [2020, 0],
            [2026, 9999],
          ]),
        ],
        frame,
      )?.scale,
    ).toEqual({ min: 0, max: 1 });
    expect(statisticsPicture([row([[2005, 100]])], frame)).toBeNull();
    expect(statisticsFrame(null, new Date("2026-09-09T12:00:00Z"))).toEqual({
      first: 1960,
      last: 2025,
    });
  });
  it("ordnet nur tatsächlich zugeordnete Statistiken in die passenden Felder ein", () => {
    expect(
      statisticsGroups(atlasCatalog, "people").map((group) => group.id),
    ).toEqual(["demography", "education", "health", "labor"]);
    expect(statisticsGroups(atlasCatalog, "history")).toEqual([]);
    expect(statisticsGroups(atlasCatalog, "all").length).toBeGreaterThan(10);
  });
});
