import type { EChartsOption } from "echarts";
import {
  BaseChart,
  axisLine,
  splitLine,
  tooltip,
} from "../../charts/base-chart";
import {
  atlasComparison,
  atlasIsolatedPoint,
  atlasUnits,
  atlasValueDomain,
} from "./atlas-analysis";
import type { AtlasSeriesResponse } from "./atlas-types";
import { atlasSeriesConnect } from "./atlas-source-series";

export function AtlasSeriesChart({
  series,
  showNumbers,
}: {
  series: AtlasSeriesResponse[];
  showNumbers: boolean;
}) {
  const comparison = atlasComparison(series);
  if (!comparison)
    return (
      <div className="atlas-notice">
        Für diesen Vergleich fehlen gemeinsame Beobachtungen im gleichen
        Zeitraum.
      </div>
    );
  const unit = atlasUnits[series[0].series.unit] ?? series[0].series.unit;
  const connect = atlasSeriesConnect(series[0].series);
  const style = getComputedStyle(document.documentElement);
  const color = (name: string) => style.getPropertyValue(name).trim();
  const colors = [color("--primary-bright"), color("--violet")];
  const domain = atlasValueDomain(
    comparison.rows.flatMap((row) => row.values),
  )!;
  const option: EChartsOption = {
    animation: false,
    color: colors,
    grid: { left: showNumbers ? 84 : 32, right: 30, top: 35, bottom: 42 },
    legend: {
      show: series.length > 1,
      top: 0,
      textStyle: { color: "#b2c1d6" },
    },
    tooltip: {
      ...tooltip,
      show: showNumbers,
      trigger: "axis",
      renderMode: "richText",
      valueFormatter: (value) =>
        value == null
          ? "Nicht verfügbar"
          : new Intl.NumberFormat("de", { maximumFractionDigits: 2 }).format(
              Number(value),
            ),
    },
    xAxis: {
      type: "category",
      data: comparison.years.map(String),
      boundaryGap: false,
      axisLine,
      axisTick: { show: false },
      axisLabel: {
        color: "#93a5bf",
        fontSize: 12,
        interval: Math.max(0, Math.ceil(comparison.years.length / 5) - 1),
        showMaxLabel: true,
        hideOverlap: true,
      },
    },
    yAxis: {
      type: "value",
      min: domain.min,
      max: domain.max,
      splitNumber: 3,
      axisLine: { show: false },
      splitLine,
      axisLabel: {
        show: showNumbers,
        color: "#93a5bf",
        formatter: (value: number) =>
          new Intl.NumberFormat("de", {
            notation: "compact",
            maximumFractionDigits: 1,
          }).format(value),
      },
    },
    series: comparison.rows.map((row, index) => ({
      name: row.name,
      type: "line",
      data: row.values,
      connectNulls: false,
      smooth: false,
      showSymbol: true,
      symbol: index === 0 ? "circle" : "diamond",
      symbolSize: (_value, params) =>
        !connect ||
        comparison.years.length < 4 ||
        atlasIsolatedPoint(row.values, params.dataIndex)
          ? 7
          : 0,
      markLine:
        domain.min < 0 && domain.max > 0
          ? {
              silent: true,
              symbol: "none",
              label: { show: false },
              lineStyle: { color: color("--text-3"), type: "dashed" },
              data: [{ yAxis: 0 }],
            }
          : undefined,
      lineStyle: {
        width: connect ? 3 : 0,
        type: index === 0 ? "solid" : "dashed",
      },
      emphasis: { focus: "series" },
    })),
  };
  return (
    <>
      <div className="atlas-chart-label">
        <span>{unit}</span>
        <span>
          Gemeinsamer Maßstab · {comparison.first}–{comparison.last}
        </span>
      </div>
      <BaseChart
        option={option}
        height={320}
        ariaLabel={`${series[0].series.label}: Entwicklung von ${comparison.first} bis ${comparison.last}. ${comparison.rows.map((row) => row.name).join(" und ")}. Lücken bleiben offen. Einheit: ${unit}.`}
      />
      {!showNumbers && (
        <div className="atlas-chart-label">
          <span>Höher im Bild = mehr · tiefer im Bild = weniger</span>
          <span>Werte unter „Zahlen anzeigen“</span>
        </div>
      )}
      {showNumbers && (
        <details className="atlas-details">
          <summary>Werte als Tabelle</summary>
          <div className="atlas-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Jahr</th>
                  {comparison.rows.map((row) => (
                    <th key={row.name}>{row.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparison.years.map((year, index) => (
                  <tr key={year}>
                    <td>{year}</td>
                    {comparison.rows.map((row) => (
                      <td key={row.name}>
                        {row.values[index] == null
                          ? "Nicht verfügbar"
                          : new Intl.NumberFormat("de", {
                              maximumFractionDigits: 2,
                            }).format(row.values[index])}
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
