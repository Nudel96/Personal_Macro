import { describe, expect, it } from "vitest";
import { browserAtlasValuation } from "../../services/atlas-browser";
import { atlasCatalog } from "./atlas-catalog";
import {
  atlasValuationCatalog,
  atlasValuationTopicLinks,
  valuationDataset,
  valuationFrame,
  valuationGroupIndustries,
  valuationGroups,
  valuationMetrics,
  valuationSegments,
  valuationTopicTarget,
} from "./atlas-valuation";
import type { ValuationPoint, ValuationSeries } from "./atlas-valuation-types";

const metric = valuationMetrics.find((m) => m.id === "industry_pbv")!;
const point = (
  year: number,
  value: number | null,
  epoch = "classification_from_2014",
): ValuationPoint => ({
  year,
  value,
  status: value === null ? "source_missing" : "available",
  firmCount: 100,
  methodEpoch: epoch,
  sourceFile: "test",
});
const series = (points: ValuationPoint[]): ValuationSeries => ({
  metricId: metric.id,
  points,
  historicalPosition: {
    status: "insufficient_history",
    percentile: null,
    previousMedian: null,
    referenceFirstYear: null,
    referenceLastYear: null,
    referenceCount: 0,
    compositionChanged: false,
  },
});

describe("published valuation pictures", () => {
  it("binds topics only to explicit current source industries and preserves their regional limits", () => {
    const bindings = atlasValuationTopicLinks.bindings;
    expect(new Set(bindings.map((link) => link.topicId)).size).toBe(
      bindings.length,
    );
    for (const link of bindings) {
      expect(
        atlasCatalog.topics.find((topic) => topic.id === link.topicId)?.label,
      ).toBe(link.topicLabel);
      expect(new Set(link.providerLabels).size).toBe(
        link.providerLabels.length,
      );
      expect(
        valuationGroupIndustries("all", "", link.topicId)
          .map((industry) => industry.providerLabel)
          .sort(),
      ).toEqual([...link.providerLabels].sort());
      expect(
        link.providerLabels.some((label) =>
          /Total Market|Grand Total/.test(label),
        ),
      ).toBe(false);
    }
    const selection = valuationGroupIndustries(
      "finance",
      "",
      "industry:chemicals",
    );
    expect(selection.map((industry) => industry.providerLabel).sort()).toEqual([
      "Chemical (Basic)",
      "Chemical (Diversified)",
      "Chemical (Specialty)",
    ]);
    expect(
      valuationGroupIndustries("finance", "Bank", "industry:chemicals"),
    ).toEqual([]);
    expect(valuationTopicTarget("industry:chemicals", "m49:276")).toMatchObject(
      {
        valTopic: "industry:chemicals",
        valScope: "global",
        valSubject: "",
        valPage: "",
        valSearch: "",
      },
    );
    expect(valuationTopicTarget("industry:machinery", "m49:356")).toMatchObject(
      {
        valTopic: "industry:machinery",
        valScope: "india",
        valSubject: expect.any(String),
      },
    );
    for (const id of [
      "fuels:hydrogen",
      "electricity:nuclear",
      "electricity:solar",
      "digital:cybersecurity",
    ])
      expect(valuationTopicTarget(id, "world")).toBeNull();
  });
  it("maps every current source industry once into editorial navigation groups", () => {
    const names = valuationGroups.flatMap((g) => g.names);
    const current = atlasValuationCatalog.industries
      .filter((i) => i.active)
      .map((i) => i.providerLabel);
    expect(new Set(names).size).toBe(names.length);
    expect([...names].sort()).toEqual(current.sort());
    expect(
      valuationGroupIndustries("health", "Bildung").map((i) => i.providerLabel),
    ).toEqual(["Education"]);
  });
  it("keeps country means, medians, forecasts, classification periods and real gaps separate", () => {
    const dataset = valuationDataset("countries", null, null);
    expect(
      dataset.files
        .filter((f) => f.publicationYear <= 2020)
        .every((f) =>
          f.fields.every((m) => m.metricId.startsWith("country_mean_")),
        ),
    ).toBe(true);
    expect(
      dataset.files
        .filter((f) => f.publicationYear >= 2021)
        .every((f) =>
          f.fields.every((m) => m.metricId.startsWith("country_median_")),
        ),
    ).toBe(true);
    expect(
      valuationMetrics
        .filter((m) => m.id.includes("forward"))
        .every((m) => m.kind === "forecast_valuation"),
    ).toBe(true);
    const segments = valuationSegments(
      [
        point(2012, 1, "old"),
        point(2013, 2, "old"),
        point(2014, 2),
        point(2015, 3),
        point(2016, null),
        point(2017, 4),
        point(2019, 5),
        { ...point(2020, -2), status: "not_meaningful" },
        point(2021, 2),
      ],
      metric,
    );
    expect(segments.map((s) => s.map((p) => p.year))).toEqual([
      [2012, 2013],
      [2014, 2015],
      [2017],
      [2019],
      [2021],
    ]);
  });
  it("uses a common calendar and scale and preserves a genuine single snapshot", () => {
    const frame = valuationFrame(
      [series([point(2021, 3)]), series([point(2024, 12)])],
      metric,
      [2013, 2026],
    );
    expect(frame).toMatchObject({ firstYear: 2013, lastYear: 2026, min: 0 });
    expect(frame!.max).toBeGreaterThan(12);
    expect(
      valuationFrame([series([point(2026, null)])], metric, [2026]),
    ).toBeNull();
    expect(valuationDataset("industries", "pbv", "india").files).toHaveLength(
      1,
    );
    expect(
      valuationDataset("industries", "pe", "china").files[0].publicationYear,
    ).toBe(2025);
    expect(valuationDataset("industries", "pbv", "global").files).toHaveLength(
      15,
    );
  });
  it("records the conflicting Zimbabwe release and provides no browser success mock", () => {
    expect(
      atlasValuationCatalog.datasets
        .flatMap((d) => d.files)
        .filter((f) => f.ambiguousSubjects.length)
        .map((f) => [f.publicationYear, f.ambiguousSubjects]),
    ).toEqual([[2023, ["Zimbabwe"]]]);
    expect(browserAtlasValuation("countries")).toEqual({
      datasetId: "countries",
      status: "desktop_required",
      data: null,
    });
    expect(() => browserAtlasValuation("untrusted")).toThrow();
  });
  it("keeps audited earnings histories, missing source years and older definitions explicit", () => {
    const us = valuationDataset("industries", "pe", "us");
    expect(us.files.map((f) => f.publicationYear)).toEqual(
      Array.from({ length: 28 }, (_, i) => 1999 + i),
    );
    const japan = valuationDataset("industries", "pe", "japan");
    expect(japan.files.find((f) => f.publicationYear === 2025)).toMatchObject({
      fileName: "peJapan24.xls",
      regionCell: "Japan",
      workbookDate: "2025-01-05",
      reviewedSha256:
        "fffc02a2575cb8962a85b01d945cc8b1151f286dc0898bcf597191c40db20df5",
    });
    expect(japan.files.some((f) => f.fileName.includes("Europe"))).toBe(false);
    expect(japan.files[japan.files.length - 1]?.publicationYear).toBe(2026);
    for (const region of ["europe", "emerging", "global"]) {
      expect(valuationDataset("industries", "pe", region).files).toHaveLength(
        15,
      );
    }
    expect(
      us.files.find((f) => f.publicationYear === 2014)?.fields,
    ).toContainEqual({
      metricId: "industry_pe_aggregate_legacy",
      header: "Aggregate Mkt Cap/ Net Income",
    });
    expect(
      us.files.find((f) => f.publicationYear === 2018)?.fields,
    ).toContainEqual({
      metricId: "industry_pe_all",
      header: "Aggregate Mkt Cap/ Net Income (all firms)",
    });
    expect(
      us.files
        .find((f) => f.publicationYear === 2022)
        ?.fields.some((f) => f.metricId === "industry_loss_share"),
    ).toBe(false);
    expect(
      us.files
        .find((f) => f.publicationYear === 2023)
        ?.fields.some((f) => f.metricId === "industry_loss_share"),
    ).toBe(true);
    for (const file of atlasValuationCatalog.datasets.flatMap((d) => d.files)) {
      if (file.url.includes("/archives/"))
        expect(file.reviewedSha256).toMatch(/^[a-f0-9]{64}$/);
    }
  });
});
