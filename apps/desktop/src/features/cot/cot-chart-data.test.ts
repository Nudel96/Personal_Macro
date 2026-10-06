import { describe, expect, it } from "vitest";
import type { CotParticipantPoint } from "../../types/domain";
import {
  buildSeasonality,
  annualHistory,
  currentSeason,
  dayMs,
  historyExtent,
  historyLines,
  fittedExtent,
  netValue,
  reportTime,
  seasonalWeek,
  sharedExtent,
} from "./cot-chart-data";

function yearPoints(
  year: number,
  value: number,
  interest = 1000,
): CotParticipantPoint[] {
  const points: CotParticipantPoint[] = [];
  for (
    let time = Date.UTC(year, 0, 1);
    time < Date.UTC(year + 1, 0, 1);
    time += 7 * dayMs
  ) {
    points.push({
      reportDate: new Date(time).toISOString().slice(0, 10),
      openInterest: interest,
      nonCommercialNet: value,
      commercialNet: -value,
      nonReportableNet: 0,
    });
  }
  return points;
}

describe("COT chart data integrity", () => {
  it("averages signed stocks with equal weight per year and excludes the current year", () => {
    const points = [
      ...yearPoints(2022, -100),
      ...yearPoints(2023, 0),
      ...yearPoints(2024, 400),
      ...yearPoints(2025, 900),
    ];
    const curve = buildSeasonality(
      points,
      "nonCommercialNet",
      "contracts",
      5,
      2025,
    );
    expect(curve.includedYears).toEqual([2022, 2023, 2024]);
    expect(curve.values).toEqual(Array(52).fill(100));
    expect(curve.counts).toEqual(Array(52).fill(3));
    expect(
      currentSeason(points, "nonCommercialNet", "contracts", 2025),
    ).toEqual(Array(52).fill(900));
  });

  it("averages each report's OI percentage before the equally weighted annual mean", () => {
    const points = [
      ...yearPoints(2022, 100, 1000),
      ...yearPoints(2023, 100, 2000),
      ...yearPoints(2024, -100, 1000),
    ];
    const curve = buildSeasonality(
      points,
      "nonCommercialNet",
      "percentOi",
      5,
      2025,
    );
    expect(curve.values[0]).toBeCloseTo(5 / 3);
    expect(curve.values[51]).toBeCloseTo(5 / 3);
  });

  it("does not turn absent participants, bad denominators or short samples into zero", () => {
    const points = yearPoints(2024, 10);
    expect(
      buildSeasonality(
        points,
        "nonCommercialNet",
        "contracts",
        5,
        2025,
      ).values.every((v) => v === null),
    ).toBe(true);
    expect(
      netValue(
        { ...points[0], commercialNet: null },
        "commercialNet",
        "contracts",
      ),
    ).toBeNull();
    expect(
      netValue(
        { ...points[0], openInterest: 0 },
        "nonCommercialNet",
        "percentOi",
      ),
    ).toBeNull();
    expect(
      netValue(
        { ...points[0], openInterest: 5 },
        "nonCommercialNet",
        "contracts",
      ),
    ).toBeNull();
    expect(netValue(points[0], "nonReportableNet", "percentOi")).toBe(0);
  });

  it("excludes partial years, missing reports and incomplete participant histories", () => {
    const points = [
      ...yearPoints(2020, 100).slice(2),
      ...yearPoints(2021, 100).slice(0, -2),
      ...yearPoints(2022, 100).filter((_, index) => index !== 25),
      ...yearPoints(2023, 100),
      ...yearPoints(2024, 100),
    ];
    points.find((point) => point.reportDate === "2023-07-02")!.commercialNet =
      null;
    expect(
      buildSeasonality(points, "nonCommercialNet", "contracts", 5, 2025)
        .includedYears,
    ).toEqual([2023, 2024]);
    expect(
      buildSeasonality(points, "commercialNet", "contracts", 5, 2025)
        .includedYears,
    ).toEqual([2024]);
  });

  it("keeps calendar years and leap days aligned without ISO-year leakage", () => {
    expect(seasonalWeek(Date.UTC(2024, 1, 29))).toBe(
      seasonalWeek(Date.UTC(2023, 1, 28)),
    );
    expect(seasonalWeek(Date.UTC(2024, 2, 1))).toBe(
      seasonalWeek(Date.UTC(2023, 2, 1)),
    );
    expect(seasonalWeek(Date.UTC(2021, 0, 1))).toBe(0);
    expect(seasonalWeek(Date.UTC(2020, 11, 31))).toBe(51);
    const points = [
      ...yearPoints(2018, 500),
      ...yearPoints(2022, 100),
      ...yearPoints(2023, 100),
      ...yearPoints(2024, 100),
    ];
    expect(
      buildSeasonality(points, "nonCommercialNet", "contracts", 5, 2025)
        .includedYears,
    ).toEqual([2022, 2023, 2024]);
    expect(reportTime("2023-02-29")).toBeNaN();
  });

  it("gives a year with two last-week reports the same weight as other years", () => {
    const a = yearPoints(2022, 0);
    a[a.length - 1].nonCommercialNet = 200;
    const curve = buildSeasonality(
      [...a, ...yearPoints(2023, 100), ...yearPoints(2024, 100)],
      "nonCommercialNet",
      "contracts",
      5,
      2025,
    );
    expect(curve.values[51]).toBe(100);
    expect(curve.values[0]).toBeCloseTo(200 / 3);
  });

  it("renders gaps as gaps and refuses to double-count duplicate report dates", () => {
    const points = yearPoints(2024, 10).slice(0, 4);
    const withGap = [points[0], points[3]];
    const lines = historyLines(
      withGap,
      "nonCommercialNet",
      "contracts",
      0,
      Infinity,
    );
    expect(lines.map(([, value]) => value)).toEqual([10, null, 10]);
    expect(
      historyLines(
        [...points, points[1]],
        "nonCommercialNet",
        "contracts",
        0,
        Infinity,
      ).filter(([, value]) => value != null),
    ).toHaveLength(3);
  });

  it("shares symmetric scales and uses calendar years instead of a row count", () => {
    expect(sharedExtent([null, -100, 300, 0])).toEqual([-400, 400]);
    const ranges = historyExtent(
      [yearPoints(2024, 10), yearPoints(2025, 20)],
      1,
    );
    expect(new Date(ranges[0]).getUTCFullYear()).toBe(2024);
    expect(new Date(ranges[1]).getUTCFullYear()).toBe(2025);
  });

  it("fits positive, negative and tiny percentage ranges without forcing zero", () => {
    const positive = fittedExtent([100, 105, 110, null]);
    expect(positive[0]).toBeGreaterThan(0);
    expect(positive[0]).toBeLessThan(100);
    expect(positive[1]).toBeGreaterThan(110);
    expect(fittedExtent([-110, -100])[1]).toBeLessThan(0);
    expect(fittedExtent([0, 0])).toEqual([-1, 1]);
    expect(fittedExtent([])).toEqual([-1, 1]);
    expect(fittedExtent([0.00001, 0.00002])[1]).toBeLessThan(0.00003);
  });

  it("preserves every original report in a single year, including two last-week values and gaps", () => {
    const points = yearPoints(2024, 10);
    points[points.length - 1].commercialNet = -900;
    points.splice(20, 1);
    const curve = annualHistory(points, "commercialNet", "contracts", 2024);
    expect(curve.filter((report) => report.value[1] != null)).toHaveLength(
      points.length,
    );
    expect(curve.some((report) => report.value[1] == null)).toBe(true);
    expect(curve[curve.length - 1].value[1]).toBe(-900);
    expect(curve[curve.length - 2].value[1]).toBe(-10);
    expect(curve.every((report) => report.date.startsWith("2024-"))).toBe(true);
    expect(annualHistory(points, "commercialNet", "contracts", 2023)).toEqual(
      [],
    );
  });
});
