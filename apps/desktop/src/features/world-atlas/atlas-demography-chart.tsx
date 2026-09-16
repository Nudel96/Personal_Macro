import type { EChartsOption } from "echarts";
import {
  BaseChart,
  axisLine,
  splitLine,
  tooltip,
} from "../../charts/base-chart";
import type { AtlasDemographyResponse } from "./atlas-demography-types";
import {
  ageLabel,
  demographicMeasures,
  demographicPyramid,
  demographicRows,
  demographicSummary,
  type DemographyMode,
} from "./atlas-demography";

const number = (value: number) =>
  new Intl.NumberFormat("de", { maximumFractionDigits: 1 }).format(value);
const compact = (value: number) =>
  new Intl.NumberFormat("de", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);

export function AtlasDemographyChart({
  rows,
  mode,
  year,
  includeProjections,
  showNumbers,
}: {
  rows: AtlasDemographyResponse[];
  mode: DemographyMode;
  year: number;
  includeProjections: boolean;
  showNumbers: boolean;
}) {
  const comparable = demographicRows(rows, includeProjections);
  if (!comparable.length || !comparable[0].years.length)
    return (
      <p className="atlas-notice">
        Für das Bild fehlen gemeinsame Jahre aus demselben UN-Datenstand.
      </p>
    );
  const style = getComputedStyle(document.documentElement);
  const colors = ["--primary-bright", "--violet", "--text-2"].map((name) =>
    style.getPropertyValue(name).trim(),
  );
  const selected = comparable.map((row) =>
    row.years.find((point) => point.year === year),
  );
  const pyramids = selected.map(demographicPyramid);
  const pyramidMax = Math.max(
    1,
    Math.ceil(
      Math.max(
        ...pyramids.flatMap(
          (p) => p?.flatMap((v) => [Math.abs(v.male), v.female]) ?? [0],
        ),
      ),
    ),
  );
  const measures = mode === "pyramid" ? [] : demographicMeasures(mode);
  const values = comparable.flatMap((row) =>
    row.years.flatMap((point) => {
      const summary = demographicSummary(point);
      return measures.flatMap((measure) => summary?.[measure.key] ?? []);
    }),
  );
  const unit =
    mode === "population"
      ? "Menschen"
      : mode === "dependency"
        ? "Je 100 Menschen im Alter 15–64"
        : "Anteil an der Bevölkerung";
  const max =
    mode === "age_shares" || mode === "working"
      ? 100
      : Math.max(1, ...values) * 1.08;

  return (
    <>
      <div className="atlas-chart-label">
        <span>
          {mode === "pyramid"
            ? "Anteil an der gesamten Bevölkerung · gleiche Skala"
            : `${unit} · gleiche Skala`}
        </span>
        <span>
          {mode === "pyramid"
            ? `Jahresmitte ${year}`
            : `${comparable[0].years[0].year}–${comparable[0].years.slice(-1)[0].year}`}
        </span>
      </div>
      <div className="atlas-demography-charts">
        {comparable.map((row, index) => {
          const pyramid = pyramids[index];
          if (
            mode !== "pyramid" &&
            row.years.every((point) =>
              measures.every(
                (measure) => demographicSummary(point)?.[measure.key] == null,
              ),
            )
          ) {
            return (
              <div className="atlas-notice" key={row.geography.id}>
                {row.geography.label}: Für diesen Verlauf fehlen berechenbare
                Alterswerte.
              </div>
            );
          }
          if (mode === "pyramid" && !pyramid)
            return (
              <div className="atlas-notice" key={row.geography.id}>
                {row.geography.label}: Für diese Altersgrafik fehlen
                vollständige Werte im gewählten Jahr.
              </div>
            );
          let option: EChartsOption;
          if (mode === "pyramid") {
            option = {
              animation: false,
              color: colors,
              grid: { left: 54, right: 24, top: 38, bottom: 32 },
              legend: {
                top: 0,
                data: ["männlich", "weiblich"],
                textStyle: { color: colors[2], fontSize: 11 },
              },
              tooltip: {
                ...tooltip,
                show: showNumbers,
                renderMode: "richText",
                trigger: "axis",
                axisPointer: { type: "shadow" },
                valueFormatter: (value) =>
                  showNumbers
                    ? `${number(Math.abs(Number(value)))} %`
                    : "Anteil als Balken dargestellt",
              },
              xAxis: {
                type: "value",
                min: -pyramidMax,
                max: pyramidMax,
                splitNumber: 4,
                axisLine,
                splitLine,
                axisLabel: {
                  show: showNumbers,
                  color: colors[2],
                  formatter: (v: number) => `${Math.abs(v)} %`,
                },
              },
              yAxis: {
                type: "category",
                data: pyramid!.map((age) => age.label),
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: { color: colors[2], fontSize: 11 },
              },
              series: [
                {
                  name: "männlich",
                  type: "bar",
                  stack: "population",
                  data: pyramid!.map((a) => a.male),
                  barMaxWidth: 13,
                },
                {
                  name: "weiblich",
                  type: "bar",
                  stack: "population",
                  data: pyramid!.map((a) => a.female),
                  barMaxWidth: 13,
                },
              ],
            };
          } else {
            const years = row.years.map((y) => String(y.year));
            const chartSeries = measures.flatMap((measure, measureIndex) =>
              ["estimate", ...(includeProjections ? ["projection"] : [])].map(
                (kind) => ({
                  name: measure.label,
                  type: "line" as const,
                  data: row.years.map((point) => {
                    const bridge =
                      kind === "projection" &&
                      point.year === row.provenance!.estimateEnd;
                    return point.kind === kind || bridge
                      ? (demographicSummary(point)?.[measure.key] ?? null)
                      : null;
                  }),
                  showSymbol: row.years.length < 4,
                  connectNulls: false,
                  smooth: false,
                  itemStyle: { color: colors[measureIndex] },
                  lineStyle: {
                    width: 2.5,
                    type:
                      kind === "projection"
                        ? ("dashed" as const)
                        : ("solid" as const),
                    color: colors[measureIndex],
                  },
                  ...(measureIndex === 0 && kind === "estimate"
                    ? {
                        markLine: {
                          silent: true,
                          symbol: "none",
                          animation: false,
                          lineStyle: {
                            color: colors[2],
                            type: "dotted" as const,
                            opacity: 0.65,
                          },
                          data: [
                            {
                              xAxis: String(year),
                              label: {
                                formatter: String(year),
                                position: "insideEndTop" as const,
                                color: colors[2],
                              },
                            },
                          ],
                        },
                      }
                    : {}),
                }),
              ),
            );
            option = {
              animation: false,
              color: colors,
              grid: {
                left: showNumbers ? 62 : 22,
                right: 20,
                top: measures.length > 1 ? 48 : 28,
                bottom: 40,
              },
              legend: {
                show: measures.length > 1,
                top: 0,
                data: measures.map((m) => m.label),
                textStyle: { color: colors[2], fontSize: 10 },
              },
              tooltip: {
                ...tooltip,
                show: showNumbers,
                renderMode: "richText",
                trigger: "axis",
                valueFormatter: (value) =>
                  value == null
                    ? "Nicht verfügbar"
                    : showNumbers
                      ? number(Number(value))
                      : "Verlauf im Bild",
              },
              xAxis: {
                type: "category",
                data: years,
                boundaryGap: false,
                axisLine,
                axisTick: { show: false },
                axisLabel: {
                  color: colors[2],
                  fontSize: 11,
                  interval: (_index, value) =>
                    Number(value) % (includeProjections ? 50 : 25) === 0,
                  showMinLabel: true,
                  showMaxLabel: true,
                  hideOverlap: true,
                },
              },
              yAxis: {
                type: "value",
                min: 0,
                max,
                splitNumber: 3,
                splitLine,
                axisLabel: {
                  show: showNumbers,
                  color: colors[2],
                  formatter: compact,
                },
              },
              series: chartSeries,
            };
          }
          return (
            <section
              className="atlas-demography-country"
              key={row.geography.id}
              aria-label={row.geography.label}
            >
              <h3>{row.geography.label}</h3>
              <BaseChart
                option={option}
                height={mode === "pyramid" ? 420 : 285}
                ariaLabel={`${row.geography.label}: ${mode === "pyramid" ? `Altersstruktur ${year}, jüngere Gruppen unten und ältere oben, männlich links und weiblich rechts. Breite bedeutet Bevölkerungsanteil.` : `${measures.map((m) => m.label).join(" und ")}, ${unit}. Durchgezogen: UN-Schätzung bis ${row.provenance!.estimateEnd}.${includeProjections ? ` Gestrichelt: mittleres UN-Szenario ab ${row.provenance!.projectionStart}.` : ""}`}`}
              />
            </section>
          );
        })}
      </div>
      {mode === "pyramid" ? (
        <p className="atlas-explanation">
          Breite Altersgruppen prägen die Form. Links und rechts teilen dieselbe
          Bevölkerungsbasis; ein breiter Balken bedeutet einen größeren Anteil,
          keine Bewertung.
        </p>
      ) : (
        <p className="atlas-explanation">
          Durchgezogen: UN-Schätzung bis {comparable[0].provenance!.estimateEnd}
          .
          {includeProjections
            ? ` Gestrichelt: mittleres UN-Szenario ab ${comparable[0].provenance!.projectionStart}. Das Szenario ist von Annahmen zu Geburten, Sterblichkeit und Migration abhängig.`
            : ""}
        </p>
      )}
      {showNumbers && (
        <details className="atlas-details">
          <summary>Demografiewerte als Tabelle</summary>
          <div className="atlas-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{mode === "pyramid" ? "Altersgruppe" : "Jahr"}</th>
                  {comparable.flatMap((row) =>
                    mode === "pyramid"
                      ? ["männlich", "weiblich", "gesamt"].map((sex) => (
                          <th key={`${row.geography.id}:${sex}`}>
                            {row.geography.label} · {sex}
                          </th>
                        ))
                      : measures.map((m) => (
                          <th key={`${row.geography.id}:${m.key}`}>
                            {row.geography.label} · {m.label}
                          </th>
                        )),
                  )}
                </tr>
              </thead>
              <tbody>
                {(mode === "pyramid"
                  ? Array.from({ length: 21 }, (_, i) => i * 5)
                  : comparable[0].years.map((y) => y.year)
                ).map((key, position) => (
                  <tr key={key}>
                    <td>
                      {mode === "pyramid"
                        ? ageLabel(key)
                        : `${key}${comparable[0].years[position].kind === "projection" ? " · Szenario" : " · Schätzung"}`}
                    </td>
                    {comparable.flatMap((row, index) =>
                      mode === "pyramid"
                        ? (["male", "female", "total"] as const).map((sex) => (
                            <td key={`${row.geography.id}:${sex}`}>
                              {selected[index]?.ages[position]?.[sex] == null
                                ? "Nicht verfügbar"
                                : number(selected[index]!.ages[position][sex]!)}
                            </td>
                          ))
                        : measures.map((m) => (
                            <td key={`${row.geography.id}:${m.key}`}>
                              {demographicSummary(row.years[position])?.[
                                m.key
                              ] == null
                                ? "Nicht verfügbar"
                                : number(
                                    demographicSummary(row.years[position])![
                                      m.key
                                    ]!,
                                  )}
                            </td>
                          )),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            {mode === "pyramid"
              ? "Originalwerte in Menschen; die Pyramiden zeigen daraus berechnete Anteile an der Gesamtbevölkerung."
              : unit}
          </p>
        </details>
      )}
    </>
  );
}
