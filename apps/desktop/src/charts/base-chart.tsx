import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";

export function BaseChart({
  option,
  height = 290,
  onEvents,
  ariaLabel,
}: {
  option: EChartsOption;
  height?: number;
  onEvents?: Record<string, (params: unknown) => void>;
  ariaLabel?: string;
}) {
  return (
    <div role={ariaLabel ? "img" : undefined} aria-label={ariaLabel}>
      <ReactECharts
        option={{
          animationDuration: 350,
          animation: !window.matchMedia?.("(prefers-reduced-motion: reduce)")
            .matches,
          textStyle: {
            fontFamily: "Inter, ui-sans-serif, system-ui",
            color: "#b2c1d6",
            fontSize: 11,
          },
          ...option,
        }}
        style={{ height, width: "100%" }}
        opts={{ renderer: "canvas" }}
        onEvents={onEvents}
        notMerge
        lazyUpdate
      />
    </div>
  );
}

export const chartGrid = { left: 48, right: 18, top: 22, bottom: 35 };
export const axisLine = { lineStyle: { color: "rgba(132,160,200,.12)" } };
export const splitLine = { lineStyle: { color: "rgba(132,160,200,.09)" } };
export const axisLabel = { color: "#93a5bf", fontSize: 10 };
export const tooltip = {
  backgroundColor: "rgba(12,23,40,.98)",
  borderColor: "rgba(133,171,231,.3)",
  padding: [10, 13],
  textStyle: { color: "#edf3fc", fontSize: 12 },
};
