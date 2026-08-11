import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";

export function BaseChart({
  option,
  height = 290,
  onEvents,
}: {
  option: EChartsOption;
  height?: number;
  onEvents?: Record<string, (params: unknown) => void>;
}) {
  return (
    <ReactECharts
      option={{
        animationDuration: 450,
        textStyle: {
          fontFamily: "Inter, ui-sans-serif, system-ui",
          color: "#9aacc3",
        },
        ...option,
      }}
      style={{ height, width: "100%" }}
      opts={{ renderer: "canvas" }}
      onEvents={onEvents}
      notMerge
      lazyUpdate
    />
  );
}

export const chartGrid = { left: 48, right: 18, top: 22, bottom: 35 };
export const axisLine = { lineStyle: { color: "rgba(132,160,200,.12)" } };
export const splitLine = { lineStyle: { color: "rgba(132,160,200,.09)" } };
export const axisLabel = { color: "#71829a", fontSize: 9 };
export const tooltip = {
  backgroundColor: "rgba(9,18,33,.96)",
  borderColor: "rgba(118,154,210,.25)",
  textStyle: { color: "#e8edf7", fontSize: 11 },
};
