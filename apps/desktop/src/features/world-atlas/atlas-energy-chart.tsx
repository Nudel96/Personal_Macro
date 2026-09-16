import type { EChartsOption } from "echarts";
import {
  BaseChart,
  axisLine,
  splitLine,
  tooltip,
} from "../../charts/base-chart";
import {
  atlasEnergyCatalog,
  energyUnavailableReason,
  energyView,
  type AtlasEnergyResponse,
  type EnergyMeasure,
  type EnergyMode,
} from "./atlas-energy";

// Fuel colors identify categories, without using the journal's profit/loss colors.
const fuelColors = [
  "#78849a",
  "#b69b78",
  "#c2b2a2",
  "#b294ed",
  "#69aade",
  "#ceaa58",
  "#91bdd2",
  "#8a9fe8",
  "#eed188",
];
const number = (value: number) =>
  new Intl.NumberFormat("de", { maximumFractionDigits: 2 }).format(value);

export function AtlasEnergyChart({
  rows,
  mode,
  measure,
  since,
  showNumbers,
}: {
  rows: AtlasEnergyResponse[];
  mode: EnergyMode;
  measure: EnergyMeasure;
  since: number;
  showNumbers: boolean;
}) {
  const view = energyView(rows, mode, measure, since);
  if (!view)
    return (
      <p className="atlas-notice" role="status">
        {energyUnavailableReason(rows, mode, measure, since)}
      </p>
    );
  const style = getComputedStyle(document.documentElement);
  const textColor = style.getPropertyValue("--text-2").trim();
  const colors = ["--primary-bright", "--violet"].map((key) =>
    style.getPropertyValue(key).trim(),
  );
  const mix = mode.kind === "mix";
  const base: EChartsOption = {
    animation: false,
    grid: { left: showNumbers ? 70 : 25, right: 25, top: 34, bottom: 32 },
    tooltip: {
      ...tooltip,
      show: showNumbers,
      trigger: "axis",
      renderMode: "richText",
      valueFormatter: (value) =>
        value == null
          ? "Nicht verfügbar"
          : `${number(Number(value))} ${view.metric.unit}`,
    },
    xAxis: {
      type: "category",
      data: view.years.map(String),
      boundaryGap: mix,
      axisLine,
      axisTick: { show: false },
      axisLabel: {
        color: textColor,
        interval: (_, year) =>
          Number(year) % 5 === 0 ||
          Number(year) === view.first ||
          Number(year) === view.last,
        hideOverlap: true,
        showMinLabel: true,
        showMaxLabel: true,
      },
    },
    yAxis: {
      type: "value",
      min:
        mode.kind === "net_imports" ? (extent) => Math.min(0, extent.min) : 0,
      max:
        view.metric.unit === "%"
          ? 100
          : mode.kind === "net_imports"
            ? (extent) => Math.max(0, extent.max)
            : undefined,
      axisLine: { show: false },
      splitLine,
      splitNumber: 4,
      axisLabel: {
        show: showNumbers,
        color: textColor,
        formatter: (value: number) =>
          new Intl.NumberFormat("de", {
            notation: "compact",
            maximumFractionDigits: 1,
          }).format(value),
      },
    },
  };
  const charts: { id: string; label: string; option: EChartsOption }[] = mix
    ? view.rows.map((row) => ({
        id: row.id,
        label: `Strommix: ${row.name}, ${view.first} bis ${view.last}. Gleicher Maßstab für alle Gebiete. Quellenstatistik mit Schätzungen.`,
        option: {
          ...base,
          color: fuelColors,
          title: {
            text: row.name,
            left: 24,
            textStyle: { color: textColor, fontSize: 12, fontWeight: "normal" },
          },
          series: atlasEnergyCatalog.fuels.map((fuel, i) => ({
            name: fuel.label,
            type: "bar",
            stack: "mix",
            barCategoryGap: "12%",
            data: row.values.map((value) =>
              Array.isArray(value) ? value[i] : null,
            ),
            emphasis: { focus: "series" },
          })),
        },
      }))
    : [
        {
          id: "comparison",
          label: `${view.metric.label}: ${view.rows.map((row) => row.name).join(" und ")}, ${view.first} bis ${view.last}. Gemeinsame Zeitachse und Einheit ${view.metric.unit}. Quellenstatistik mit Schätzungen.`,
          option: {
            ...base,
            color: colors,
            legend: {
              show: view.rows.length > 1,
              type: "scroll",
              top: 0,
              textStyle: { color: textColor },
            },
            series: view.rows.map((row, i) => ({
              name: row.name,
              type: "line",
              data: row.values as (number | null)[],
              connectNulls: false,
              smooth: false,
              showSymbol: true,
              showAllSymbol: true,
              symbol: i ? "diamond" : "circle",
              symbolSize: (_value, params) => {
                const at = params.dataIndex;
                return (at === 0 || row.values[at - 1] == null) &&
                  (at === row.values.length - 1 || row.values[at + 1] == null)
                  ? 7
                  : 0;
              },
              lineStyle: { width: 3, type: i ? "dashed" : "solid" },
              markLine:
                mode.kind === "net_imports"
                  ? {
                      silent: true,
                      symbol: "none",
                      label: { show: false },
                      lineStyle: { color: textColor, type: "dashed" },
                      data: [{ yAxis: 0 }],
                    }
                  : undefined,
              emphasis: { focus: "series" },
            })),
          },
        },
      ];
  return (
    <>
      <div className="atlas-chart-label">
        <span>
          {view.metric.label} · {view.metric.unit}
        </span>
        <span>
          {view.first}–{view.last}
        </span>
      </div>
      {mix && (
        <ul
          className="atlas-energy-legend"
          aria-label="Erzeugungsarten im Strommix"
        >
          {atlasEnergyCatalog.fuels.map((fuel, i) => (
            <li key={fuel.id}>
              <span style={{ background: fuelColors[i] }} aria-hidden="true" />
              {fuel.label}
            </li>
          ))}
        </ul>
      )}
      {charts.map((chart) => (
        <BaseChart
          key={chart.id}
          option={chart.option}
          height={mix ? 245 : 340}
          ariaLabel={chart.label}
        />
      ))}
      <p className="atlas-comparison-note">
        {mix
          ? "Jeder Balken zeigt ein Quellenjahr; die Farben behalten in beiden Bildern dieselbe Bedeutung."
          : "Die Linien verbinden vorhandene Jahreswerte. Beide Gebiete verwenden denselben Maßstab."}
        {view.sparse
          ? " Fehlende Jahreswerte bleiben als Lücken sichtbar."
          : ""}
      </p>
      {mode.kind === "net_imports" && (
        <p className="atlas-comparison-note">
          Oberhalb der gestrichelten Nulllinie: mehr eingeführter Strom.
          Unterhalb: mehr ausgeführter Strom.
        </p>
      )}
      {showNumbers && (
        <details className="atlas-details">
          <summary>Stromdaten als Tabelle</summary>
          <div className="atlas-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Jahr</th>
                  <th>Gebiet</th>
                  {mix ? (
                    atlasEnergyCatalog.fuels.map((fuel) => (
                      <th key={fuel.id}>{fuel.label} (%)</th>
                    ))
                  ) : (
                    <th>
                      {view.metric.label} ({view.metric.unit})
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {view.years.flatMap((year, i) =>
                  view.rows.map((row) => {
                    const value = row.values[i];
                    return (
                      <tr key={`${row.id}:${year}`}>
                        <td>{year}</td>
                        <td>{row.name}</td>
                        {mix ? (
                          atlasEnergyCatalog.fuels.map((fuel, j) => (
                            <td key={fuel.id}>
                              {Array.isArray(value)
                                ? number(value[j])
                                : "Nicht verfügbar"}
                            </td>
                          ))
                        ) : (
                          <td>
                            {typeof value === "number"
                              ? number(value)
                              : "Nicht verfügbar"}
                          </td>
                        )}
                      </tr>
                    );
                  }),
                )}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </>
  );
}
