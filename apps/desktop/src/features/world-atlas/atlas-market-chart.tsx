import type { EChartsOption } from "echarts";
import {
  BaseChart,
  axisLine,
  splitLine,
  tooltip,
} from "../../charts/base-chart";
import { atlasMarketComparison } from "./atlas-markets";
import type { AtlasMarketResponse } from "./atlas-market-types";

export function AtlasMarketChart({
  rows,
  showNumbers,
  horizon,
}: {
  rows: AtlasMarketResponse[];
  showNumbers: boolean;
  horizon: number | null;
}) {
  const comparison = atlasMarketComparison(rows, horizon);
  if (!comparison)
    return (
      <div className="atlas-notice">
        Für diese Wellen fehlen gemeinsame nutzbare Monate im gleichen Maßstab.
      </div>
    );
  const style = getComputedStyle(document.documentElement);
  const color = (name: string) => style.getPropertyValue(name).trim();
  const rawExtent =
    Math.max(
      1,
      ...comparison.rows.flatMap((row) =>
        row.values.map((value) => Math.abs(value ?? 0)),
      ),
    ) * 1.15;
  const extent = Math.max(10, Math.ceil(rawExtent / 10) * 10);
  const option: EChartsOption = {
    animation: false,
    color: [color("--primary-bright"), color("--violet")],
    grid: { left: showNumbers ? 65 : 20, right: 25, top: 42, bottom: 38 },
    legend: { show: rows.length > 1, top: 0, textStyle: { color: "#b2c1d6" } },
    tooltip: {
      ...tooltip,
      trigger: "axis",
      renderMode: "richText",
      valueFormatter: (value) =>
        value == null
          ? "Nicht verfügbar"
          : showNumbers
            ? `${Number(value).toLocaleString("de", { maximumFractionDigits: 1 })} % Trendabstand`
            : Number(value) > 0
              ? "Oberhalb des eigenen Trends"
              : Number(value) < 0
                ? "Unterhalb des eigenen Trends"
                : "Am eigenen Trend",
    },
    xAxis: {
      type: "category",
      data: comparison.months,
      boundaryGap: false,
      axisLine,
      axisTick: { show: false },
      axisLabel: {
        color: "#93a5bf",
        interval: Math.max(0, Math.ceil(comparison.months.length / 5) - 1),
        formatter: (value: string) => value.slice(0, 4),
        showMaxLabel: true,
        hideOverlap: true,
      },
    },
    yAxis: {
      type: "value",
      min: -extent,
      max: extent,
      splitNumber: 4,
      interval: extent / 2,
      axisLine: { show: false },
      splitLine,
      axisLabel: {
        show: showNumbers,
        color: "#93a5bf",
        formatter: (value: number) => `${value.toFixed(0)} %`,
      },
    },
    series: comparison.rows.map((row, index) => ({
      name: row.name,
      type: "line",
      data: row.values,
      showSymbol: false,
      connectNulls: false,
      smooth: false,
      lineStyle: { width: 3, type: index === 0 ? "solid" : "dashed" },
      areaStyle: index === 0 ? { opacity: 0.12, origin: 0 } : undefined,
      markLine:
        index === 0
          ? {
              silent: true,
              symbol: "none",
              data: [{ yAxis: 0 }],
              lineStyle: { color: "#8798b4", width: 1, type: "dashed" },
              label: { show: false },
            }
          : undefined,
    })),
  };
  return (
    <>
      <div className="atlas-chart-label">
        <span>Oben: über dem eigenen Trend · unten: darunter</span>
        <span>
          {comparison.first.slice(0, 4)}–{comparison.last.slice(0, 4)}
        </span>
      </div>
      <BaseChart
        option={option}
        height={350}
        ariaLabel={`Langfristige Marktwelle: ${comparison.rows.map((row) => row.name).join(" und ")}. Die Mittellinie ist der jeweils eigene Trend. Daten von ${comparison.first} bis ${comparison.last}; Lücken bleiben offen.`}
      />
      <p className="atlas-explanation">
        Die Mitte ist ein mitwandernder historischer Trend. Die Welle beschreibt
        die geglättete Marktlage; einen fairen Wert oder eine kommende Umkehr
        bestimmt sie nicht.
      </p>
      {showNumbers && (
        <details className="atlas-details">
          <summary>Trendabstände als Tabelle</summary>
          <div className="atlas-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Monat</th>
                  {comparison.rows.map((row) => (
                    <th key={row.name}>{row.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparison.months.map((month, index) => (
                  <tr key={month}>
                    <td>{month}</td>
                    {comparison.rows.map((row) => (
                      <td key={row.name}>
                        {row.values[index] == null
                          ? "Nicht verfügbar"
                          : `${row.values[index].toLocaleString("de", { maximumFractionDigits: 2 })} %`}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </>
  );
}
