import type { EChartsOption, LineSeriesOption } from "echarts";
import {
  axisLabel,
  axisLine,
  splitLine,
  tooltip,
} from "../../charts/base-chart";
import type { CotParticipantPoint } from "../../types/domain";
import {
  cotGroups,
  annualHistory,
  historyLines,
  type CotGroup,
  type CotUnit,
  type SeasonalCurve,
} from "./cot-chart-data";

const monthLabels = [
  "Jan",
  "Feb",
  "Mär",
  "Apr",
  "Mai",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Dez",
];
const monthWeeks = new Map([
  [0, "Jan"],
  [4, "Feb"],
  [8, "Mär"],
  [13, "Apr"],
  [17, "Mai"],
  [21, "Jun"],
  [26, "Jul"],
  [30, "Aug"],
  [34, "Sep"],
  [39, "Okt"],
  [43, "Nov"],
  [47, "Dez"],
]);
const windowColors: Record<number, string> = {
  3: "#85a8ff",
  5: "#56cde1",
  10: "#bba1ff",
  15: "#e8b86b",
};
const zeroLine = {
  silent: true,
  symbol: "none",
  label: { show: false },
  lineStyle: { color: "#708199", type: "dashed" },
  data: [{ yAxis: 0 }],
} as const;

export const unitLabel = (unit: CotUnit) =>
  unit === "contracts" ? "Netto-Kontrakte" : "Netto · % Open Interest";
export const formatNet = (value: number | null, unit: CotUnit) =>
  value == null
    ? "Nicht verfügbar"
    : `${value.toLocaleString("de-DE", { maximumFractionDigits: unit === "contracts" ? 0 : 2 })}${unit === "percentOi" ? " %" : ""}`;

function baseOption(unit: CotUnit, extent: [number, number]): EChartsOption {
  const tickSize = (extent[1] - extent[0]) / 5;
  const precision = Math.min(
    10,
    Math.max(1, 1 - Math.floor(Math.log10(tickSize))),
  );
  return {
    animation: false,
    useUTC: true,
    grid: { left: 68, right: 20, top: 74, bottom: 36 },
    legend: {
      top: 8,
      left: "center",
      textStyle: { color: "#b2c1d6", fontSize: 10 },
      itemWidth: 17,
      itemHeight: 3,
    },
    tooltip: {
      ...tooltip,
      trigger: "axis",
      renderMode: "richText",
      confine: true,
    },
    yAxis: {
      type: "value",
      scale: true,
      min: extent[0],
      max: extent[1],
      name: unitLabel(unit),
      nameTextStyle: { color: "#93a5bf", fontSize: 10 },
      axisLine,
      splitLine,
      axisLabel: {
        ...axisLabel,
        formatter: (value: number) =>
          unit === "percentOi"
            ? `${value.toLocaleString("de-DE", { maximumFractionDigits: precision })} %`
            : new Intl.NumberFormat("de-DE", {
                notation: tickSize >= 1000 ? "compact" : "standard",
                maximumFractionDigits: precision,
              }).format(value),
      },
    },
  };
}

export function annualOption(
  points: CotParticipantPoint[],
  group: CotGroup,
  unit: CotUnit,
  year: number,
  extent: [number, number],
): EChartsOption {
  const reports = annualHistory(points, group, unit, year);
  return {
    ...baseOption(unit, extent),
    xAxis: {
      type: "time",
      min: Date.UTC(2001, 0, 1),
      max: Date.UTC(2001, 11, 31),
      axisLine,
      splitLine: { show: false },
      axisLabel: {
        ...axisLabel,
        hideOverlap: true,
        formatter: (value: number) =>
          monthLabels[new Date(value).getUTCMonth()],
      },
    },
    tooltip: {
      ...tooltip,
      trigger: "axis",
      renderMode: "richText",
      confine: true,
      formatter: (raw) => {
        const entry = Array.isArray(raw) ? raw[0] : raw;
        const report = reports[entry?.dataIndex ?? -1];
        return report
          ? `${report.date}\n${year} · Originalbericht: ${formatNet(report.value[1], unit)}`
          : "Kein Bericht";
      },
    },
    series: [
      {
        name: `${year} · Originalberichte`,
        type: "line",
        data: reports.map((report) => report.value),
        smooth: false,
        connectNulls: false,
        showSymbol: true,
        symbolSize: 4,
        lineStyle: { width: 1.7 },
        itemStyle: {
          color: cotGroups.find((item) => item.key === group)!.color,
        },
        markLine: { ...zeroLine, data: [{ yAxis: 0 }] },
      },
    ],
  };
}

export function historyOption(
  points: CotParticipantPoint[],
  unit: CotUnit,
  dates: [number, number],
  extent: [number, number],
): EChartsOption {
  return {
    ...baseOption(unit, extent),
    tooltip: {
      ...tooltip,
      trigger: "axis",
      renderMode: "richText",
      confine: true,
      valueFormatter: (value) =>
        typeof value === "number" ? formatNet(value, unit) : "Nicht verfügbar",
    },
    xAxis: {
      type: "time",
      min: dates[0],
      max: dates[1],
      axisLine,
      axisLabel: {
        ...axisLabel,
        hideOverlap: true,
        formatter: (value: number) => {
          const d = new Date(value);
          return `${monthLabels[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(-2)}`;
        },
      },
      splitLine: { show: false },
    },
    series: cotGroups.map((group, index): LineSeriesOption => ({
      name: group.label,
      type: "line",
      data: historyLines(points, group.key, unit, ...dates),
      showSymbol: false,
      connectNulls: false,
      smooth: false,
      lineStyle: { width: 1.8, color: group.color },
      itemStyle: { color: group.color },
      ...(index === 0
        ? { markLine: { ...zeroLine, data: [{ yAxis: 0 }] } }
        : {}),
    })),
  };
}

export function seasonalOption(
  curves: SeasonalCurve[],
  current: (number | null)[] | null,
  year: number,
  unit: CotUnit,
  extent: [number, number],
): EChartsOption {
  const series: LineSeriesOption[] = curves.map((curve, index) => ({
    name: `${curve.years} Jahre · n=${curve.includedYears.length}`,
    type: "line",
    data: curve.values,
    showSymbol: false,
    connectNulls: false,
    smooth: false,
    itemStyle: { color: windowColors[curve.years] },
    lineStyle: { width: 2 },
    ...(index === 0 ? { markLine: { ...zeroLine, data: [{ yAxis: 0 }] } } : {}),
  }));
  if (current)
    series.push({
      name: `${year} · bisher`,
      type: "line",
      data: current,
      connectNulls: false,
      smooth: false,
      showSymbol: false,
      itemStyle: { color: "#eaf0fa" },
      lineStyle: { type: "dashed", width: 1.5 },
    });
  return {
    ...baseOption(unit, extent),
    xAxis: {
      type: "category",
      data: Array.from({ length: 52 }, (_, i) => i),
      boundaryGap: false,
      axisLine,
      axisTick: { show: false },
      axisLabel: {
        ...axisLabel,
        interval: 0,
        hideOverlap: true,
        formatter: (value: string) => monthWeeks.get(Number(value)) ?? "",
      },
    },
    tooltip: {
      ...tooltip,
      trigger: "axis",
      renderMode: "richText",
      confine: true,
      formatter: (raw) => {
        const entries = Array.isArray(raw) ? raw : [raw];
        const week = entries[0]?.dataIndex ?? 0;
        return [
          `Jahreswoche ${week + 1}`,
          ...entries.map((entry) => {
            const curve = curves[entry.seriesIndex ?? -1];
            return `${entry.seriesName}: ${formatNet(typeof entry.value === "number" ? entry.value : null, unit)}${curve ? ` · n=${curve.counts[week]} Jahre` : ""}`;
          }),
        ].join("\n");
      },
    },
    series,
  };
}
