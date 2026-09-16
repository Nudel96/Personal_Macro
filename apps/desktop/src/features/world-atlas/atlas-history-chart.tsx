import type { EChartsOption } from "echarts";
import {
  BaseChart,
  axisLine,
  splitLine,
  tooltip,
} from "../../charts/base-chart";
import {
  historyUnits,
  historyView,
  type AtlasHistoryResponse,
  type HistoryMode,
} from "./atlas-history";

export function AtlasHistoryChart({
  rows,
  mode,
  since,
  proportional,
  showNumbers,
}: {
  rows: AtlasHistoryResponse[];
  mode: HistoryMode;
  since: number;
  proportional: boolean;
  showNumbers: boolean;
}) {
  const view = historyView(rows, mode, since);
  if (!view)
    return (
      <div className="atlas-notice">
        Für diese Auswahl fehlen gemeinsame historische Werte im gleichen
        Zeitraum und Datenstand.
      </div>
    );
  const logarithmic = proportional && mode !== "worldGdpShare";
  const style = getComputedStyle(document.documentElement);
  const colors = ["--primary-bright", "--violet"].map((key) =>
    style.getPropertyValue(key).trim(),
  );
  const tickStep =
    view.last - view.first > 600
      ? 250
      : view.last - view.first > 300
        ? 100
        : 50;
  const compact = (value: number) =>
    new Intl.NumberFormat("de", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  const option: EChartsOption = {
    animation: false,
    color: colors,
    grid: { left: showNumbers ? 75 : 25, right: 25, top: 38, bottom: 40 },
    legend: {
      type: "scroll",
      show: rows.length > 1,
      top: 0,
      textStyle: { color: style.getPropertyValue("--text-2").trim() },
    },
    tooltip: {
      ...tooltip,
      show: showNumbers,
      trigger: "axis",
      renderMode: "richText",
      valueFormatter: (v) =>
        v == null
          ? "Nicht verfügbar"
          : new Intl.NumberFormat("de", { maximumFractionDigits: 2 }).format(
              Number(v),
            ),
    },
    xAxis: {
      type: "category",
      data: view.years.map(String),
      boundaryGap: false,
      axisLine,
      axisTick: { show: false },
      axisLabel: {
        color: "#93a5bf",
        interval: (_, year) =>
          Number(year) % tickStep === 0 ||
          Number(year) === view.first ||
          Number(year) === view.last,
        hideOverlap: true,
        showMaxLabel: true,
        showMinLabel: true,
      },
    },
    yAxis: {
      type: logarithmic ? "log" : "value",
      logBase: 10,
      min: logarithmic ? undefined : 0,
      splitNumber: 4,
      axisLine: { show: false },
      splitLine,
      axisLabel: { show: showNumbers, color: "#93a5bf", formatter: compact },
    },
    series: view.rows.map((row, index) => ({
      name: row.name,
      type: "line",
      data: row.values,
      connectNulls: false,
      smooth: false,
      showSymbol: true,
      showAllSymbol: true,
      symbol: index ? "diamond" : "circle",
      symbolSize: (_value, params) => {
        const i = params.dataIndex;
        // Keep isolated early estimates visible without inventing the intervening centuries.
        return (i === 0 || row.values[i - 1] == null) &&
          (i === row.values.length - 1 || row.values[i + 1] == null)
          ? 7
          : 0;
      },
      lineStyle: { width: 3, type: index ? "dashed" : "solid" },
      emphasis: { focus: "series" },
    })),
  };
  return (
    <>
      <div className="atlas-chart-label">
        <span>{historyUnits[mode]}</span>
        <span>
          {view.first}–{view.last}
        </span>
      </div>
      <BaseChart
        option={option}
        height={360}
        ariaLabel={`Historische Rekonstruktion: ${view.rows.map((r) => r.name).join(" und ")}, ${view.first} bis ${view.last}. ${logarithmic ? "Proportionaler Maßstab" : "Gleiche Abstände"}. Einzelpunkte und Datenlücken bleiben sichtbar.`}
      />
      <div className="atlas-chart-label">
        <span>
          {logarithmic
            ? "Gleiche Abstände = gleiche proportionale Veränderung"
            : "Gleiche Abstände = gleiche absolute Veränderung"}
        </span>
        <span>Gemeinsamer Maßstab</span>
      </div>
      {view.sparse && (
        <p className="atlas-comparison-note">
          Einzelpunkte sind historische Schätzpunkte. Zwischen fehlenden Jahren
          wird keine Kurve ergänzt. Auch durchgehende Reihen können
          Rekonstruktionen des Anbieters enthalten.
        </p>
      )}
      {view.last - view.first < 100 && (
        <p className="atlas-comparison-note">
          Der verfügbare Ausschnitt umfasst weniger als ein Jahrhundert.
        </p>
      )}
      {showNumbers && (
        <details className="atlas-details">
          <summary>Historische Werte als Tabelle</summary>
          <div className="atlas-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Jahr</th>
                  {view.rows.map((row) => (
                    <th key={row.name}>{row.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {view.years
                  .filter((_, i) =>
                    view.rows.some((row) => row.values[i] !== null),
                  )
                  .map((year) => {
                    const i = year - view.first;
                    return (
                      <tr key={year}>
                        <td>{year}</td>
                        {view.rows.map((row) => (
                          <td key={row.name}>
                            {row.values[i] === null
                              ? "Nicht verfügbar"
                              : new Intl.NumberFormat("de", {
                                  maximumFractionDigits: 2,
                                }).format(row.values[i])}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </>
  );
}
