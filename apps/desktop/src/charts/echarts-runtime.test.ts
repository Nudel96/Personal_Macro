// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { EChartsOption } from "echarts";
import { SVGRenderer } from "echarts/renderers";
import { echarts } from "./echarts-runtime";

// SSR avoids mocking Canvas. SVG is a test-only renderer and is not included
// in the application's Canvas runtime.
echarts.use(SVGRenderer);

const axes = {
  xAxis: { type: "category" as const, data: ["Jan", "Feb", "Mar"] },
  yAxis: { type: "value" as const },
};

const examples: [string, EChartsOption][] = [
  ["line", { ...axes, series: [{ type: "line", data: [1, null, 3] }] }],
  ["bar", { ...axes, series: [{ type: "bar", data: [1, -2, 3] }] }],
  ["scatter", { ...axes, series: [{ type: "scatter", data: [1, 2, 3] }] }],
  [
    "candlestick",
    {
      ...axes,
      series: [
        {
          type: "candlestick",
          data: [
            [1, 2, 0, 3],
            [2, 1, 0, 3],
          ],
        },
      ],
    },
  ],
  [
    "pie",
    {
      graphic: {
        type: "text",
        left: "center",
        top: "center",
        style: { text: "Ergebnis" },
      },
      series: [{ type: "pie", data: [{ value: 2, name: "Gewinner" }] }],
    },
  ],
  [
    "heatmap",
    {
      ...axes,
      yAxis: { type: "category", data: ["10", "20"] },
      visualMap: { min: -2, max: 2, inRange: { color: ["red", "green"] } },
      series: [
        {
          type: "heatmap",
          data: [
            [0, 0, -2],
            [1, 1, 2],
          ],
        },
      ],
    },
  ],
];

function chart() {
  return echarts.init(null, undefined, {
    renderer: "svg",
    ssr: true,
    width: 640,
    height: 320,
  });
}

describe("shared chart runtime", () => {
  it.each(examples)(
    "renders the existing %s chart without missing modules",
    (_, option) => {
      const errors = vi.spyOn(console, "error");
      const instance = chart();
      try {
        instance.setOption({ animation: false, ...option });
        expect(instance.renderToSVGString()).toContain("<path");
        expect(errors).not.toHaveBeenCalled();
      } finally {
        instance.dispose();
        errors.mockRestore();
      }
    },
  );

  it("preserves zoom, legend toggles and the seasonal/regime markers", () => {
    const errors = vi.spyOn(console, "error");
    const instance = chart();
    try {
      instance.setOption({
        animation: false,
        ...axes,
        legend: { data: ["Verlauf"] },
        tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
        dataZoom: [{ type: "inside" }, { type: "slider" }],
        series: [
          {
            type: "line",
            name: "Verlauf",
            data: [1, -2, 3],
            markLine: { data: [{ yAxis: 0 }] },
            markPoint: { data: [{ type: "max" }] },
            markArea: { data: [[{ xAxis: "Jan" }, { xAxis: "Feb" }]] },
          },
        ],
      });
      expect(instance.renderToSVGString()).toContain("Verlauf");
      instance.dispatchAction({ type: "dataZoom", start: 20, end: 80 });
      const zoom = instance.getOption().dataZoom as {
        start: number;
        end: number;
      }[];
      expect(zoom[0].start).toBe(20);
      expect(zoom[0].end).toBe(80);
      instance.dispatchAction({ type: "legendToggleSelect", name: "Verlauf" });
      const legend = instance.getOption().legend as {
        selected: Record<string, boolean>;
      }[];
      expect(legend[0].selected.Verlauf).toBe(false);
      expect(errors).not.toHaveBeenCalled();
    } finally {
      instance.dispose();
      errors.mockRestore();
    }
  });
});
