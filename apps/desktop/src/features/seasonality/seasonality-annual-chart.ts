import type { EChartsOption, LineSeriesOption } from "echarts";
import {
  axisLabel,
  axisLine,
  splitLine,
  tooltip,
} from "../../charts/base-chart";
import type {
  SeasonalityAnalysis,
  SeasonalityDailyCurvePoint,
} from "../../types/domain";

export interface SeasonalityChartSettings {
  smoothingDays: number;
  scale: "index" | "percent";
  showPhases: boolean;
  zoom: [number, number];
}

export const defaultChartSettings: SeasonalityChartSettings = {
  smoothingDays: 1,
  scale: "index",
  showPhases: false,
  zoom: [0, 100],
};

const number = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });
const dateFormat = new Intl.DateTimeFormat("de-DE", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const monthFormat = new Intl.DateTimeFormat("de-DE", {
  month: "short",
  timeZone: "UTC",
});
const seasonalDate = (day: number) => new Date(Date.UTC(2025, 0, day));
export const seasonalDayLabel = (day: number) =>
  dateFormat.format(seasonalDate(day));

export function seasonalDay(value?: string): number | undefined {
  if (!value || !/^\d{2}-\d{2}$/.test(value)) return;
  const [month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(2025, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return;
  return Math.round((date.getTime() - Date.UTC(2025, 0, 1)) / 86_400_000) + 1;
}

export function smoothingWindow(days: number) {
  if (!Number.isFinite(days)) return 1;
  return Math.min(31, Math.max(1, 2 * Math.round((days - 1) / 2) + 1));
}

export function rawSeasonalValue(point?: SeasonalityDailyCurvePoint) {
  return point &&
    point.samples > 0 &&
    point.mean != null &&
    Number.isFinite(point.mean)
    ? point.mean
    : null;
}

/** Presentation only. Never use this series for returns, phase detection or rankings. */
export function smoothAnnualCurve(
  points: SeasonalityDailyCurvePoint[],
  days: number,
) {
  const raw = points.map(rawSeasonalValue);
  const radius = (smoothingWindow(days) - 1) / 2;
  return raw.map((value, index) => {
    if (value == null || radius === 0) return value;
    let total = value;
    let count = 1;
    // Shorten at year/segment boundaries; never bridge a missing calendar day.
    for (const direction of [-1, 1]) {
      for (let distance = 1; distance <= radius; distance++) {
        const other = index + direction * distance;
        if (
          raw[other] == null ||
          points[other].day !== points[index].day + direction * distance
        )
          break;
        total += raw[other]!;
        count++;
      }
    }
    return total / count;
  });
}

export function formatSeasonalValue(
  value: number | null | undefined,
  scale: SeasonalityChartSettings["scale"],
) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (scale === "index") return number.format(value);
  const change = value - 100;
  return `${change > 0 ? "+" : ""}${number.format(change)} %`;
}

/** A calendar context around the start, deliberately not an invented trading-day exit. */
export function windowContextZoom(startDate: string): [number, number] {
  const start = seasonalDay(startDate) ?? 1;
  const from = Math.max(1, Math.min(276, start - 30));
  return [((from - 1) / 364) * 100, ((from + 89 - 1) / 364) * 100];
}

export function fullscreenChartHeight(viewportHeight: number) {
  return Math.max(280, viewportHeight - 440);
}

export function annualOption(
  analysis: SeasonalityAnalysis,
  settings: SeasonalityChartSettings = defaultChartSettings,
  inspectedDay?: number,
): EChartsOption {
  const points = analysis.annualCurve;
  const datesByLabel = new Map(
    points.map((point) => [
      seasonalDayLabel(point.day),
      seasonalDate(point.day),
    ]),
  );
  const days = smoothingWindow(settings.smoothingDays);
  const display = smoothAnnualCurve(points, days);
  const scaled = (value: number | null) =>
    value == null ? null : value - (settings.scale === "percent" ? 100 : 0);
  const windowStart = seasonalDay(analysis.selectedWindow.startDate);
  const baseline = settings.scale === "percent" ? 0 : 100;
  const marks: NonNullable<LineSeriesOption["markLine"]>["data"] = [
    {
      yAxis: baseline,
      label: { formatter: settings.scale === "percent" ? "0 %" : "Index 100" },
    },
  ];
  if (windowStart && points.some((point) => point.day === windowStart)) {
    marks.push({
      xAxis: seasonalDayLabel(windowStart),
      label: {
        formatter: "Fensterstart",
        position: "insideEndTop",
        color: "#93a5bf",
      },
      lineStyle: { color: "#7289a9", type: "dashed" },
    });
  }
  const inspectedIndex = points.findIndex(
    (point) => point.day === inspectedDay,
  );
  const inspectedValue = scaled(display[inspectedIndex] ?? null);
  return {
    animation: false,
    tooltip: {
      ...tooltip,
      trigger: "axis",
      confine: true,
      extraCssText:
        "max-width: min(340px, calc(100vw - 40px)); white-space: normal; overflow-wrap: anywhere;",
      axisPointer: {
        type: "line",
        lineStyle: { color: "#72c9ed", type: "dashed" },
      },
      formatter: (params: unknown) => {
        const item = (params as Array<{ dataIndex?: number }>)[0];
        const index = item?.dataIndex;
        const point = index == null ? undefined : points[index];
        if (!point || index == null) return "Keine Tageswerte verfügbar";
        const raw = rawSeasonalValue(point);
        if (raw == null)
          return `<strong>${seasonalDayLabel(point.day)}</strong><br/>Keine Tageswerte verfügbar`;
        const fmt = (value: number | null | undefined) =>
          formatSeasonalValue(value, settings.scale);
        return `<strong>${seasonalDayLabel(point.day)}</strong><br/>Ungeglätteter Durchschnitt: ${fmt(raw)}${days > 1 ? `<br/>Anzeige · ${days} Tage geglättet: ${fmt(display[index])}` : ""}<br/>Jahresmedian: ${fmt(point.median)}<br/>Mittlere 50 % der Jahre: ${fmt(point.p25)} bis ${fmt(point.p75)}<br/>${point.samples} Jahre${point.samples < 5 ? " · explorativ" : ""}`;
      },
    },
    grid: { left: 54, right: 18, top: 32, bottom: 72 },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: points.map((point) => seasonalDayLabel(point.day)),
      axisLabel: {
        ...axisLabel,
        interval: 0,
        hideOverlap: true,
        formatter: (value: string) => {
          // ECharts supplies a viewport-local index after zoom; the category
          // value retains the actual calendar date.
          const date = datesByLabel.get(value);
          if (!date) return "";
          const zoomed = settings.zoom[1] - settings.zoom[0] < 45;
          return date.getUTCDate() === 1
            ? monthFormat.format(date)
            : zoomed && date.getUTCDate() === 15
              ? dateFormat.format(date)
              : "";
        },
      },
      axisLine,
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      name:
        settings.scale === "percent"
          ? "Seit Jahresbeginn · %"
          : "Index · Jahresbeginn = 100",
      nameTextStyle: { ...axisLabel, align: "left" },
      scale: true,
      axisLabel: {
        ...axisLabel,
        formatter: (value: number) =>
          `${number.format(value)}${settings.scale === "percent" ? " %" : ""}`,
      },
      splitLine,
    },
    dataZoom: [
      {
        type: "slider",
        start: settings.zoom[0],
        end: settings.zoom[1],
        minValueSpan: 14,
        filterMode: "filter",
        bottom: 8,
        height: 22,
        borderColor: "rgba(132,160,200,.18)",
        fillerColor: "rgba(82,197,255,.08)",
        handleStyle: { color: "#52c5ff", borderColor: "#52c5ff" },
        dataBackground: {
          lineStyle: { color: "#7289a9" },
          areaStyle: { color: "#7289a9", opacity: 0.05 },
        },
        selectedDataBackground: {
          lineStyle: { color: "#52c5ff" },
          areaStyle: { color: "#52c5ff", opacity: 0.08 },
        },
        textStyle: { color: "#93a5bf", fontSize: 10 },
        brushSelect: false,
        realtime: false,
      },
    ],
    series: [
      {
        name: "Durchschnitt aller gewählten Jahre",
        type: "line",
        data: display.map(scaled),
        smooth: false,
        connectNulls: false,
        showSymbol: display.filter((value) => value != null).length < 3,
        symbol: "circle",
        symbolSize: 5,
        lineStyle: { color: "#52c5ff", width: 1.8 },
        itemStyle: { color: "#52c5ff" },
        areaStyle: {
          origin: "start",
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(82,197,255,.22)" },
              { offset: 1, color: "rgba(82,197,255,.015)" },
            ],
          },
        },
        markLine: {
          silent: true,
          symbol: "none",
          lineStyle: { color: "rgba(132,160,200,.3)", type: "dashed" },
          label: { color: "#93a5bf", fontSize: 9, position: "insideEndTop" },
          data: marks,
        },
        markPoint: {
          silent: true,
          symbol: "circle",
          symbolSize: 7,
          label: { show: false },
          itemStyle: {
            color: "#d3f1ff",
            borderColor: "#52c5ff",
            borderWidth: 2,
          },
          data:
            inspectedIndex >= 0 && inspectedValue != null
              ? [
                  {
                    name: "Untersuchter Tag",
                    coord: [
                      seasonalDayLabel(points[inspectedIndex].day),
                      inspectedValue,
                    ],
                  },
                ]
              : [],
        },
        markArea: {
          silent: true,
          data: settings.showPhases
            ? analysis.trendSegments
                .filter((segment) => segment.phase !== "neutral")
                .map((segment) => [
                  {
                    name: segment.phase === "rising" ? "Aufbauend" : "Abbauend",
                    xAxis: seasonalDayLabel(segment.startDay),
                    itemStyle: {
                      color:
                        segment.phase === "rising"
                          ? "rgba(55,212,129,.06)"
                          : "rgba(255,94,108,.06)",
                    },
                    label: {
                      color: segment.phase === "rising" ? "#72dba0" : "#ff9da6",
                      fontSize: 9,
                    },
                  },
                  { xAxis: seasonalDayLabel(segment.endDay) },
                ])
            : [],
        },
      },
    ],
  };
}
