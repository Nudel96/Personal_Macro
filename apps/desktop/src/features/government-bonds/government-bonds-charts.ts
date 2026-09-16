import type { EChartsOption } from "echarts";
import {
  axisLabel,
  axisLine,
  splitLine,
  tooltip,
} from "../../charts/base-chart";
import type {
  BondObservation,
  GovernmentBondDetail,
} from "./government-bonds-types";

const yieldFormat = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});
const bpsFormat = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
});
const day = 86_400_000;
const dateFormat = new Intl.DateTimeFormat("de-DE", { timeZone: "UTC" });
export const bondColors = ["#80adff", "#e7b975"];
export function yieldLabel(value: string | null | undefined) {
  return value == null || !Number.isFinite(Number(value))
    ? "—"
    : `${yieldFormat.format(Number(value))} %`;
}
export function bpsLabel(value: string | null | undefined) {
  return value == null || !Number.isFinite(Number(value))
    ? "—"
    : `${bpsFormat.format(Number(value))} bp`;
}
export function maturityLabel(months: number) {
  return months % 12 === 0 ? `${months / 12} J` : `${months} M`;
}
export function dateLabel(value: string | null | undefined) {
  if (!value) return "—";
  return dateFormat.format(new Date(value));
}

export function historyPoints(
  history: BondObservation[],
  since: number,
): [number, number | null][] {
  const points: [number, number | null][] = [];
  let previous: number | undefined;
  for (const p of history) {
    const time = Date.parse(`${p.date}T00:00:00Z`);
    if (time < since) continue;
    // Preserve explicit missing values and do not draw over prolonged publication gaps.
    if (previous !== undefined && time - previous > 7 * day)
      points.push([previous + day, null]);
    points.push([time, p.yieldPct === null ? null : Number(p.yieldPct)]);
    previous = time;
  }
  return points;
}

export function buildBondHistoryOption(
  detail: GovernmentBondDetail,
  names: [string, string],
  since: number,
): EChartsOption {
  const countries = [detail.primary, detail.comparison].filter(
    (c) => c !== null,
  );
  return {
    color: bondColors,
    animation: false,
    grid: { left: 68, right: 24, top: 42, bottom: 72 },
    legend: { top: 0, textStyle: { color: "#b2c1d6" } },
    tooltip: {
      ...tooltip,
      trigger: "axis",
      renderMode: "richText",
      valueFormatter: (v) =>
        v == null ? "Nicht verfügbar" : `${yieldFormat.format(Number(v))} %`,
    },
    xAxis: { type: "time", axisLabel, axisLine, splitLine: { show: false } },
    yAxis: {
      type: "value",
      scale: true,
      name: "Rendite · % p. a.",
      axisLabel,
      axisLine,
      splitLine,
    },
    dataZoom: [
      { type: "inside" },
      {
        type: "slider",
        bottom: 7,
        height: 22,
        borderColor: "transparent",
        textStyle: { color: "#93a5bf" },
      },
    ],
    series: countries.map((country, index) => ({
      type: "line",
      name: names[index],
      data: historyPoints(country.history, since),
      showSymbol: country.history.length < 40,
      symbolSize: 5,
      connectNulls: false,
      smooth: false,
      lineStyle: { width: 2 },
      emphasis: { focus: "series" },
    })),
  };
}

export function buildBondCurveOption(
  detail: GovernmentBondDetail,
  names: [string, string],
): EChartsOption {
  const countries = [detail.primary, detail.comparison].filter(
    (c) => c !== null,
  );
  const maturities = [
    ...new Set(countries.flatMap((c) => c.curve.map((p) => p.maturityMonths))),
  ].sort((a, b) => a - b);
  const longest = Math.max(3, ...maturities);
  const interval =
    longest <= 12
      ? 3
      : longest <= 60
        ? 12
        : longest <= 120
          ? 24
          : longest <= 360
            ? 60
            : 120;
  return {
    color: bondColors,
    grid: { left: 60, right: 18, top: 42, bottom: 42 },
    legend: { top: 0, textStyle: { color: "#b2c1d6" } },
    tooltip: {
      ...tooltip,
      trigger: "item",
      renderMode: "richText",
      formatter: (params: unknown) => {
        const p = params as {
          seriesName: string;
          value: [number, number | null];
        };
        return `${p.seriesName} · ${maturityLabel(p.value[0])}\n${yieldLabel(p.value[1] === null ? null : String(p.value[1]))}\n${dateLabel(detail.curveDate)}`;
      },
    },
    xAxis: {
      type: "value",
      name: "Laufzeit",
      nameLocation: "middle",
      nameGap: 27,
      min: 0,
      max: Math.ceil(longest / interval) * interval,
      interval,
      axisLabel: { ...axisLabel, formatter: (v: number) => maturityLabel(v) },
      axisLine,
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      scale: true,
      name: "% p. a.",
      axisLabel,
      axisLine,
      splitLine,
    },
    series: countries.map((country, index) => ({
      type: "line",
      name: names[index],
      showSymbol: true,
      symbolSize: 7,
      connectNulls: false,
      smooth: false,
      lineStyle: { width: 2 },
      data: maturities.map((months) => {
        const value = country.curve.find(
          (p) => p.maturityMonths === months,
        )?.yieldPct;
        return [months, value == null ? null : Number(value)];
      }),
    })),
  };
}
