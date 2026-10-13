import type { EChartsOption, SeriesOption } from "echarts";
import {
  BaseChart,
  axisLabel,
  axisLine,
  splitLine,
  tooltip,
} from "../../charts/base-chart";
import type {
  MacroScoreHistoryPoint,
  ScorePriceSource,
} from "../../types/domain";
import { movingAverage, type ScoredCandle } from "./score-history-model";

const colors = { bullish: "#40d59b", bearish: "#ef7085", neutral: "#b2c1d6" };

export function ScoreHistoryChart({
  points,
  threshold,
  compact = false,
}: {
  points: MacroScoreHistoryPoint[];
  threshold: number;
  compact?: boolean;
}) {
  const extent =
    Math.max(threshold + 1, ...points.map((p) => Math.abs(p.score ?? 0))) + 1;
  const option: EChartsOption = {
    grid: { left: 38, right: 18, top: 20, bottom: compact ? 32 : 66 },
    tooltip: {
      ...tooltip,
      trigger: "axis",
      axisPointer: { type: "shadow" },
      valueFormatter: (value) =>
        value == null ? "Nicht verfügbar" : String(value),
    },
    xAxis: { type: "time", axisLine, axisLabel },
    yAxis: {
      type: "value",
      min: -extent,
      max: extent,
      splitLine,
      axisLabel,
      name: "Rohscore",
    },
    visualMap: {
      show: false,
      dimension: 1,
      pieces: [
        { gt: 0, color: colors.bullish },
        { lt: 0, color: colors.bearish },
        { value: 0, color: colors.neutral },
      ],
    },
    dataZoom: compact
      ? []
      : [{ type: "inside" }, { type: "slider", bottom: 8, height: 20 }],
    series: [
      {
        type: "bar",
        name: "Aufgezeichneter Score",
        barMaxWidth: compact ? 8 : 12,
        data: points.map((p) => [p.observedAt * 1000, p.score]),
        markLine: {
          silent: true,
          symbol: "none",
          label: { show: !compact },
          data: [
            {
              yAxis: threshold,
              name: "Bullish",
              lineStyle: { color: colors.bullish, type: "dashed" },
            },
            {
              yAxis: -threshold,
              name: "Bearish",
              lineStyle: { color: colors.bearish, type: "dashed" },
            },
          ],
        },
      },
    ],
  };
  return (
    <BaseChart
      option={option}
      height={compact ? 170 : 290}
      ariaLabel="Score-Historie: positive Scores grün, negative Scores rot, fehlende Scores ohne Balken"
    />
  );
}

export function ScoreDailyComparisonChart({
  candles,
  source,
  threshold,
  averages,
  flipLines,
}: {
  candles: ScoredCandle[];
  source: ScorePriceSource;
  threshold: number;
  averages: number[];
  flipLines: boolean;
}) {
  const dates = candles.map((c) =>
    new Date(c.time * 1000).toISOString().slice(0, 10),
  );
  const series: SeriesOption[] = [
    source.dataKind === "ohlc"
      ? {
          name: "Daily OHLC",
          type: "candlestick",
          data: candles.map((c) => [c.open, c.close, c.low, c.high]),
          itemStyle: {
            color: colors.bullish,
            color0: colors.bearish,
            borderColor: colors.bullish,
            borderColor0: colors.bearish,
          },
        }
      : {
          name: "Täglicher Einzelpreis",
          type: "line",
          data: candles.map((c) => c.close),
          showSymbol: false,
          lineStyle: { color: "#78a4fa" },
        },
  ];
  for (const [index, period] of averages.entries()) {
    series.push({
      name: `SMA ${period}`,
      type: "line",
      showSymbol: false,
      data: movingAverage(candles, period),
      lineStyle: {
        width: 1,
        color: ["#e9be67", "#b894f3", "#6ec8e9", "#c9d3e3"][index % 4],
      },
      itemStyle: {
        color: ["#e9be67", "#b894f3", "#6ec8e9", "#c9d3e3"][index % 4],
      },
    });
  }
  for (const direction of ["bullish", "bearish"] as const) {
    series.push({
      name:
        direction === "bullish"
          ? "Bullish-Phasenbeginn"
          : "Bearish-Phasenbeginn",
      type: "scatter",
      symbol: "triangle",
      symbolRotate: direction === "bullish" ? 0 : 180,
      symbolSize: 11,
      itemStyle: { color: colors[direction] },
      data: candles.flatMap((c, i) =>
        c.flip && c.bias === direction
          ? [
              [
                dates[i],
                direction === "bullish" ? c.low * 0.996 : c.high * 1.004,
              ],
            ]
          : [],
      ),
    });
  }
  series.push({
    name:
      source.provider === "eodhd"
        ? "Zum UTC-Vortag bekannter Score"
        : "Zum Daily-Open bekannter Score",
    type: "line",
    xAxisIndex: 1,
    yAxisIndex: 1,
    showSymbol: false,
    step: "end",
    connectNulls: false,
    data: candles.map((c) => c.score),
    lineStyle: { width: 2, color: "#c8d7ee" },
    itemStyle: { color: "#c8d7ee" },
    markLine: {
      silent: true,
      symbol: "none",
      data: [
        {
          yAxis: threshold,
          lineStyle: { color: colors.bullish, type: "dashed" },
        },
        {
          yAxis: -threshold,
          lineStyle: { color: colors.bearish, type: "dashed" },
        },
      ],
    },
  });
  if (flipLines) {
    series.push({
      name: "Score-Wechsel",
      type: "line",
      data: [],
      markLine: {
        symbol: "none",
        silent: true,
        label: { show: false },
        data: candles.flatMap((c, i) =>
          c.flip
            ? [
                {
                  xAxis: dates[i],
                  lineStyle: {
                    color:
                      c.bias === "bullish" ? colors.bullish : colors.bearish,
                    opacity: 0.4,
                    type: "dashed" as const,
                  },
                },
              ]
            : [],
        ),
      },
    });
  }
  const option: EChartsOption = {
    legend: {
      data: series.flatMap((value) =>
        typeof value.name === "string" && value.name !== "Score-Wechsel"
          ? [value.name]
          : [],
      ),
      top: 0,
      type: "scroll",
      textStyle: { color: "#b2c1d6", fontSize: 10 },
    },
    grid: [
      { left: 65, right: 25, top: 45, height: "56%" },
      { left: 65, right: 25, top: "71%", height: "17%" },
    ],
    tooltip: { ...tooltip, trigger: "axis", axisPointer: { type: "cross" } },
    axisPointer: { link: [{ xAxisIndex: "all" }] },
    xAxis: [
      { type: "category", data: dates, axisLabel: { show: false }, axisLine },
      { type: "category", data: dates, gridIndex: 1, axisLabel, axisLine },
    ],
    yAxis: [
      { scale: true, axisLabel, splitLine, name: source.unit },
      { gridIndex: 1, axisLabel, splitLine, name: "Rohscore" },
    ],
    dataZoom: [
      { type: "inside", xAxisIndex: [0, 1] },
      { type: "slider", xAxisIndex: [0, 1], bottom: 6, height: 20 },
    ],
    series,
  };
  return (
    <BaseChart
      option={option}
      height={570}
      ariaLabel="Daily-Kurs und vor Kerzenbeginn bekannter Fundamentals Score mit Bullish- und Bearish-Phasen"
    />
  );
}
