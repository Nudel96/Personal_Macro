import { describe, expect, it } from "vitest";
import {
  atlasValuationCatalog,
  valuationDataset,
  valuationMetrics,
  valuationSegments,
} from "./atlas-valuation";
import type { AtlasValuationResponse } from "./atlas-valuation-types";
import {
  valuationComparisonRegion,
  valuationRegionalComparison,
  valuationYearRanges,
} from "./atlas-valuation-regions";

const education = atlasValuationCatalog.industries.find(
  (i) => i.providerLabel === "Education",
)!;
const pbv = valuationMetrics.find((m) => m.id === "industry_pbv")!;
const pe = valuationMetrics.find((m) => m.id === "industry_pe_trailing")!;
function packet(
  scope: string,
  years: number[],
  metric = pbv,
): AtlasValuationResponse {
  const dataset = valuationDataset(
    "industries",
    metric === pe ? "pe" : "pbv",
    scope,
  );
  const files = dataset.files.filter((f) => years.includes(f.publicationYear));
  return {
    datasetId: dataset.id,
    status: "available",
    data: {
      datasetId: dataset.id,
      subjects: [
        {
          ...education,
          geographyId: null,
          series: [
            {
              metricId: metric.id,
              points: files.map((f) => ({
                year: f.publicationYear,
                value: 2,
                status: "available",
                firmCount: 50,
                sourceFile: f.fileName,
                methodEpoch:
                  f.publicationYear < 2014
                    ? "classification_before_2014"
                    : "classification_from_2014",
              })),
              historicalPosition: {
                status: "insufficient_history",
                percentile: null,
                previousMedian: null,
                referenceFirstYear: null,
                referenceLastYear: null,
                referenceCount: 0,
                compositionChanged: false,
              },
            },
          ],
        },
      ],
      provenance: {
        catalogVersion: atlasValuationCatalog.version,
        retrievedAt: "2026-09-09T00:00:00Z",
        excludedSubjects: [],
        files: files.map((f) => ({
          ...f,
          sha256: f.reviewedSha256 ?? "a".repeat(64),
          rowCount: f.expectedSubjects,
        })),
      },
    },
  };
}
function compare(
  base: AtlasValuationResponse,
  other: AtlasValuationResponse,
  metric = pbv,
) {
  return valuationRegionalComparison(
    base,
    other,
    atlasValuationCatalog.datasets.find((d) => d.id === base.datasetId)!,
    atlasValuationCatalog.datasets.find((d) => d.id === other.datasetId)!,
    education.id,
    metric,
  );
}
describe("same-industry regional comparison", () => {
  it("preserves separate histories and holes on a common publication axis", () => {
    const india = packet("india", [2026]);
    const us = packet("us", [1999, 2012, 2013, 2014, 2024, 2026]);
    const result = compare(india, us);
    expect(result.status).toBe("available");
    expect(result.commonYears).toEqual([2026]);
    if (result.status !== "available") throw Error("expected comparison");
    expect(result.series).toBe(us.data!.subjects[0].series[0]);
    expect(
      valuationSegments(result.series.points, pbv).map((s) =>
        s.map((p) => p.year),
      ),
    ).toEqual([[1999], [2012, 2013], [2014], [2024], [2026]]);
    expect(india.data!.subjects[0].series[0].points).toHaveLength(1);
    expect(compare(us, india).commonYears).toEqual([2026]);
  });
  it("does not shift India's 2026 earnings snapshot onto China's 2025 publication", () => {
    expect(
      compare(packet("india", [2026], pe), packet("china", [2025], pe), pe)
        .status,
    ).toBe("no_common_years");
  });
  it.each([
    "no_firms",
    "not_meaningful",
    "source_missing",
    "source_error",
  ] as const)("excludes a shared year with status %s", (status) => {
    const china = packet("china", [2026]);
    china.data!.subjects[0].series[0].points[0].status = status;
    expect(compare(packet("india", [2026]), china).status).toBe(
      "no_common_years",
    );
  });
  it("requires positive finite values and the same method epoch", () => {
    for (const value of [0, -1, NaN, Infinity, null]) {
      const other = packet("china", [2026]);
      other.data!.subjects[0].series[0].points[0].value = value;
      expect(compare(packet("india", [2026]), other).status).toBe(
        "no_common_years",
      );
    }
    const other = packet("china", [2026]);
    other.data!.subjects[0].series[0].points[0].methodEpoch =
      "different_definition";
    expect(compare(packet("india", [2026]), other).status).toBe(
      "no_common_years",
    );
  });
  it("requires the exact industry and metric without substitution", () => {
    const other = packet("china", [2026]);
    other.data!.subjects[0].providerLabel = "Healthcare Products";
    expect(compare(packet("india", [2026]), other).status).toBe(
      "missing_industry",
    );
    other.data!.subjects[0].providerLabel = education.providerLabel;
    other.data!.subjects[0].series[0].metricId = "industry_pe_trailing";
    expect(compare(packet("india", [2026]), other).status).toBe(
      "missing_definition",
    );
  });
  it("rejects stale catalogs, mismatched responses, and untraceable source points on either side", () => {
    const mutations: Array<(p: AtlasValuationResponse) => void> = [
      (p) => {
        p.status = "previous_catalog";
      },
      (p) => {
        p.data!.datasetId = "pbv-global";
      },
      (p) => {
        p.data!.provenance.catalogVersion = "old";
      },
      (p) => {
        p.data!.provenance.files = [];
      },
      (p) => {
        p.data!.provenance.files[0].url = "https://example.com/wrong.xls";
      },
      (p) => {
        p.data!.provenance.files[0].workbookDate = "2025-01-01";
      },
      (p) => {
        p.data!.provenance.files[0].sha256 = "missing";
      },
      (p) => {
        p.data!.subjects[0].series[0].points[0].sourceFile = "wrong.xls";
      },
      (p) => {
        p.data!.subjects[0].series[0].points.push({
          ...p.data!.subjects[0].series[0].points[0],
        });
      },
    ];
    for (const mutate of mutations)
      for (const side of [0, 1]) {
        const packets = [packet("india", [2026]), packet("us", [2026])];
        mutate(packets[side]);
        expect(compare(packets[0], packets[1]).status).toBe(
          "incompatible_source",
        );
      }
    const us = packet("us", [2025, 2026]);
    us.data!.provenance.files[0].sha256 = "b".repeat(64);
    expect(compare(packet("india", [2026]), us).status).toBe(
      "incompatible_source",
    );
  });
  it("offers only a real second region of the same basis", () => {
    const us = valuationDataset("industries", "pe", "us");
    expect(valuationComparisonRegion(us, "india")?.id).toBe("pe-india");
    for (const scope of ["us", "rest", "Africa", "m49:276", "", null])
      expect(valuationComparisonRegion(us, scope)).toBeNull();
    expect(
      valuationComparisonRegion(
        valuationDataset("countries", null, null),
        "india",
      ),
    ).toBeNull();
    expect(
      valuationComparisonRegion(
        valuationDataset("industries", "pbv", "us"),
        "rest",
      )?.id,
    ).toBe("pbv-rest");
  });
  it("compresses only consecutive publication years", () => {
    expect(valuationYearRanges([2026, 2021, 2020, 2024, 2025, 2020])).toBe(
      "2020–2021, 2024–2026",
    );
    expect(valuationYearRanges([2026])).toBe("2026");
  });
});
