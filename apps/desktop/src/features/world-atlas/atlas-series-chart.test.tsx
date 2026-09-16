import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BaseChart } from "../../charts/base-chart";
import { browserAtlasSeries } from "../../services/atlas-browser";
import { AtlasSeriesChart } from "./atlas-series-chart";
import type { AtlasSeriesResponse } from "./atlas-types";

vi.mock("../../charts/base-chart", () => ({
  BaseChart: vi.fn(({ ariaLabel }: { ariaLabel: string }) => (
    <div role="img" aria-label={ariaLabel} />
  )),
  axisLine: {},
  splitLine: {},
  tooltip: {},
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Statistikbild", () => {
  it("zeigt Zahlen auch im Tooltip erst bewusst und lässt vereinzelte Erhebungen sichtbar", () => {
    const data: AtlasSeriesResponse = {
      ...browserAtlasSeries({
        seriesId: "worldbank:2:SI.POV.GINI",
        geographyId: "m49:276",
      }),
      status: "available",
      points: [
        { year: 2000, value: 30, sourceFlag: "" },
        { year: 2005, value: 31, sourceFlag: "" },
      ],
    };
    const view = render(
      <AtlasSeriesChart series={[data]} showNumbers={false} />,
    );
    let option = vi.mocked(BaseChart).mock.lastCall![0].option;
    expect(option.tooltip).toMatchObject({ show: false });
    expect(option.yAxis).toMatchObject({ min: 0, max: 31 });
    const line = (
      option.series as {
        showSymbol: boolean;
        connectNulls: boolean;
        symbolSize: (value: null, params: { dataIndex: number }) => number;
      }[]
    )[0];
    expect(line.showSymbol).toBe(true);
    expect(line.connectNulls).toBe(false);
    expect(line.symbolSize(null, { dataIndex: 0 })).toBe(7);
    expect(line.symbolSize(null, { dataIndex: 5 })).toBe(7);
    view.rerender(<AtlasSeriesChart series={[data]} showNumbers />);
    option = vi.mocked(BaseChart).mock.lastCall![0].option;
    expect(option.tooltip).toMatchObject({ show: true });
  });
});
