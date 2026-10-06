import type { LineSeriesOption } from "echarts";
import { describe, expect, it } from "vitest";
import {
  annualOption,
  defaultChartSettings,
  formatSeasonalValue,
  seasonalDay,
  seasonalDayLabel,
  smoothAnnualCurve,
  windowContextZoom,
} from "./seasonality-annual-chart";
import { annualAnalysisFixture } from "./__fixtures__/annual-analysis";

describe("seasonal display smoothing", () => {
  it("defaults to the unsmoothed cohort and ignores the backend display smoother", () => {
    const analysis = annualAnalysisFixture();
    const option = annualOption(analysis);
    const series = option.series as LineSeriesOption[];
    expect(series).toHaveLength(1);
    expect(series[0]).toMatchObject({
      data: [100, 102, 99, 104, 103],
      smooth: false,
      connectNulls: false,
    });
    expect(series[0].markArea?.data).toEqual([]);
  });

  it("uses a centered arithmetic average with shorter edges and no year wrapping", () => {
    const points = annualAnalysisFixture().annualCurve.slice(0, 3);
    expect(smoothAnnualCurve(points, 3)).toEqual([101, 301 / 3, 100.5]);
    expect(smoothAnnualCurve(points, 1)).toEqual([100, 102, 99]);
  });

  it("preserves missing observations and never smooths across gaps", () => {
    const points = annualAnalysisFixture().annualCurve;
    points[2].mean = null;
    expect(smoothAnnualCurve(points, 31)).toEqual([
      101,
      101,
      null,
      103.5,
      103.5,
    ]);
    points[2].mean = 999;
    points[2].samples = 0;
    expect(smoothAnnualCurve(points, 31)).toEqual([
      101,
      101,
      null,
      103.5,
      103.5,
    ]);
    expect(smoothAnnualCurve([points[0], points[1], points[4]], 31)).toEqual([
      101, 101, 103,
    ]);
  });

  it("keeps a genuine zero and rejects non-finite values", () => {
    const points = annualAnalysisFixture().annualCurve;
    points[0].mean = 0;
    points[1].mean = NaN;
    points[2].mean = Infinity;
    expect(smoothAnnualCurve(points, 3).slice(0, 3)).toEqual([0, null, null]);
  });

  it("keeps raw metrics, filters, samples and phases unchanged for every setting", () => {
    const analysis = annualAnalysisFixture();
    const original = structuredClone(analysis);
    for (const smoothingDays of [1, 3, 5, 15, 31]) {
      for (const scale of ["index", "percent"] as const) {
        const series = annualOption(analysis, {
          ...defaultChartSettings,
          smoothingDays,
          scale,
          showPhases: true,
        }).series as LineSeriesOption[];
        expect(series).toHaveLength(1);
        expect(series[0].markArea?.data).toHaveLength(1);
      }
    }
    expect(analysis).toEqual(original);
  });

  it("scales the index to percentage change without compounding it", () => {
    const series = annualOption(annualAnalysisFixture(), {
      ...defaultChartSettings,
      scale: "percent",
    }).series as LineSeriesOption[];
    expect(series[0].data).toEqual([0, 2, -1, 4, 3]);
    expect(formatSeasonalValue(102, "percent")).toBe("+2 %");
    expect(formatSeasonalValue(null, "percent")).toBe("—");
    expect(formatSeasonalValue(100, "index")).toBe("100");
  });

  it("discloses raw and display values, dispersion and small samples in the tooltip", () => {
    const analysis = annualAnalysisFixture();
    analysis.annualCurve[1].samples = 3;
    const option = annualOption(analysis, {
      ...defaultChartSettings,
      smoothingDays: 3,
    });
    const formatter = (
      option.tooltip as { formatter: (params: unknown) => string }
    ).formatter;
    expect(formatter([{ dataIndex: 1 }])).toContain(
      "Ungeglätteter Durchschnitt: 102",
    );
    expect(formatter([{ dataIndex: 1 }])).toContain(
      "Anzeige · 3 Tage geglättet: 100,33",
    );
    expect(formatter([{ dataIndex: 1 }])).toContain(
      "Mittlere 50 % der Jahre: 101 bis 103",
    );
    expect(formatter([{ dataIndex: 1 }])).toContain("3 Jahre · explorativ");
    analysis.annualCurve[1].mean = null;
    expect(formatter([{ dataIndex: 1 }])).toContain(
      "Keine Tageswerte verfügbar",
    );
  });

  it("uses the non-leap calendar and keeps window context inside one year", () => {
    expect(seasonalDay("03-01")).toBe(60);
    expect(seasonalDayLabel(60)).toBe("1. März");
    expect(seasonalDay("02-29")).toBeUndefined();
    expect(seasonalDay("13-01")).toBeUndefined();
    expect(windowContextZoom("01-01")[0]).toBe(0);
    expect(windowContextZoom("12-31")[1]).toBe(100);
    expect(windowContextZoom("07-01")[0]).toBeGreaterThan(0);
  });

  it("labels the actual months after zoom instead of reusing viewport-local indices", () => {
    const analysis = annualAnalysisFixture();
    analysis.annualCurve = Array.from({ length: 365 }, (_, index) => ({
      day: index + 1,
      mean: 100,
      samples: 5,
    }));
    const option = annualOption(analysis, {
      ...defaultChartSettings,
      zoom: windowContextZoom("09-26"),
    });
    const axis = option.xAxis as {
      axisLabel: { formatter: (label: string, index: number) => string };
    };
    expect(axis.axisLabel.formatter(seasonalDayLabel(244), 0)).toBe("Sep");
    expect(axis.axisLabel.formatter(seasonalDayLabel(258), 14)).toBe(
      "15. Sept.",
    );
    expect(axis.axisLabel.formatter(seasonalDayLabel(274), 30)).toBe("Okt");
  });
});
