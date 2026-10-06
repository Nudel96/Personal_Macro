import type { EChartsOption } from "echarts";
import {
  BaseChart,
  axisLabel,
  axisLine,
  splitLine,
  tooltip,
} from "../../charts/base-chart";
import { dateLabel, summarizeRegion, utcDate } from "./weather-model";
import type { WeatherRegion, WeatherSnapshot } from "./weather-types";

export function WeatherChart({
  snapshot,
  region,
  selectedDate,
}: {
  snapshot: WeatherSnapshot;
  region: WeatherRegion;
  selectedDate: string;
}) {
  const dates = Array.from({ length: 21 }, (_, i) =>
    utcDate(i - 7, snapshot.today),
  );
  const rows = dates.map((date) => summarizeRegion(snapshot, region, date));
  const option: EChartsOption = {
    tooltip: { ...tooltip, trigger: "axis" },
    legend: { top: 0, textStyle: { color: "#b2c1d6", fontSize: 11 } },
    grid: { left: 48, right: 50, top: 42, bottom: 34 },
    xAxis: {
      type: "category",
      data: dates.map((date) => dateLabel(date)),
      axisLabel,
      axisLine,
    },
    yAxis: [
      { type: "value", name: "mm / Tag", axisLabel, axisLine, splitLine },
      {
        type: "value",
        name: "°C",
        axisLabel,
        axisLine,
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: "Niederschlag",
        type: "bar",
        data: rows.map((row, i) => ({
          value: row.rainMm,
          itemStyle: {
            color: i < 7 ? "#596f89" : "#5aa8eb",
            opacity: row.coverage === row.expected ? 1 : 0.45,
            borderRadius: [3, 3, 0, 0],
          },
        })),
        markArea: {
          silent: true,
          itemStyle: { color: "rgba(95,120,151,.10)" },
          data: [
            [
              { xAxis: dateLabel(dates[0]), name: "Archivierte Modellwerte" },
              { xAxis: dateLabel(dates[6]) },
            ],
          ],
        },
        markLine: {
          silent: true,
          symbol: "none",
          label: { show: false },
          lineStyle: { color: "#b2c6f6", type: "dashed" },
          data: [{ xAxis: dateLabel(selectedDate) }],
        },
      },
      {
        name: "Tagesmaximum",
        type: "line",
        yAxisIndex: 1,
        connectNulls: false,
        data: rows.map((r) => r.maxC),
        lineStyle: { color: "#ecad61", width: 2 },
        itemStyle: { color: "#ecad61" },
        symbolSize: 4,
      },
      {
        name: "Tagesminimum",
        type: "line",
        yAxisIndex: 1,
        connectNulls: false,
        data: rows.map((r) => r.minC),
        lineStyle: { color: "#a3bef4", width: 2 },
        itemStyle: { color: "#a3bef4" },
        symbolSize: 4,
      },
    ],
  };
  return (
    <BaseChart
      option={option}
      height={270}
      ariaLabel={`Niederschlag und Temperaturverlauf für ${region.label}, sieben archivierte und 14 vorhergesagte Tage. Tageswerte stehen auch in der Tabelle.`}
    />
  );
}
