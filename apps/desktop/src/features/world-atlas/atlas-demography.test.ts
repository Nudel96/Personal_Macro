import { describe, expect, it } from "vitest";
import { browserAtlasDemography } from "../../services/atlas-browser";
import {
  demographicPyramid,
  demographicRows,
  demographicSummary,
  demographicMeasures,
} from "./atlas-demography";
import type {
  AtlasDemographyResponse,
  AtlasDemographyYear,
} from "./atlas-demography-types";

const year = (date = 2023): AtlasDemographyYear => ({
  year: date,
  kind: date <= 2023 ? "estimate" : "projection",
  ages: Array.from({ length: 21 }, (_, i) => ({
    ageStart: i * 5,
    male: 40,
    female: 60,
    total: 100,
  })),
});
const response = (geographyId = "m49:276"): AtlasDemographyResponse => ({
  ...browserAtlasDemography(geographyId),
  status: "available",
  profile: {
    geographyId,
    providerId: "test",
    providerLabel: "Test",
    notes: [],
    years: [year(1950), year(2023), year(2024), year(2100)],
  },
  provenance: {
    revision: "Test WPP 2024",
    retrievedAt: "2026-09-08T00:00:00Z",
    estimateEnd: 2023,
    projectionStart: 2024,
    areaCount: 243,
    sourceRowCount: 1,
    pages: [],
  },
});

describe("UN-Altersprofile", () => {
  it("berechnet die 65+-Perspektive aus allen Altersgruppen ab 65", () => {
    const measures = demographicMeasures("older");
    expect(measures).toHaveLength(1);
    expect(demographicSummary(year())![measures[0].key]).toBeCloseTo(
      (800 / 2100) * 100,
    );
  });
  it("verwendet die gesamte Bevölkerung als gemeinsamen Pyramiden-Nenner", () => {
    const row = year();
    const summary = demographicSummary(row)!;
    expect(summary.total).toBe(2100);
    expect(
      summary.youngShare + summary.workingShare + summary.olderShare,
    ).toBeCloseTo(100);
    expect(summary.working).toBe(1000);
    expect(summary.youthDependency).toBe(30);
    expect(summary.oldDependency).toBe(80);
    const pyramid = demographicPyramid(row)!;
    expect(
      pyramid.reduce((sum, age) => sum + Math.abs(age.male) + age.female, 0),
    ).toBeCloseTo(100);
    expect(pyramid[0].male).toBeLessThan(0);
    expect(pyramid[20].label).toBe("100+");
  });
  it("erfindet weder fehlende Altersgruppen noch Null-Nenner", () => {
    const row = year();
    row.ages[0].total = null;
    expect(demographicSummary(row)).toBeNull();
    expect(demographicPyramid(row)).toBeNull();
    const unknownSex = year();
    unknownSex.ages[0].male = null;
    expect(demographicSummary(unknownSex)).not.toBeNull();
    expect(demographicPyramid(unknownSex)).toBeNull();
    const noWorkers = year();
    noWorkers.ages.forEach((age) => {
      if (age.ageStart >= 15 && age.ageStart < 65) age.total = 0;
    });
    expect(demographicSummary(noWorkers)!.youthDependency).toBeNull();
    expect(
      demographicSummary({ ...year(), ages: year().ages.slice(1) }),
    ).toBeNull();
  });
  it("behandelt auch vergangene Projektionsjahre als Szenario und trennt Datenstände", () => {
    const first = response();
    const second = response("m49:356");
    expect(
      demographicRows([first, second], false)[0].years.map((y) => y.year),
    ).toEqual([1950, 2023]);
    expect(
      demographicRows([first, second], true)[0].years.map((y) => y.year),
    ).toEqual([1950, 2023, 2024, 2100]);
    second.provenance!.retrievedAt = "2026-09-09T00:00:00Z";
    expect(demographicRows([first, second], true)).toEqual([]);
    expect(browserAtlasDemography("world").profile).toBeNull();
    expect(() => browserAtlasDemography("../../journal.sqlite")).toThrow();
  });
});
