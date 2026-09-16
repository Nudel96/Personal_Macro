import { useId } from "react";
import {
  valuationFrame,
  valuationSegments,
  type ValuationMetric,
} from "./atlas-valuation";
import type { ValuationSeries } from "./atlas-valuation-types";

export function AtlasValuationChart({
  rows,
  metric,
  years,
  showNumbers,
  compact = false,
  frame: sharedFrame,
}: {
  rows: { label: string; series: ValuationSeries }[];
  metric: ValuationMetric;
  years: number[];
  showNumbers: boolean;
  compact?: boolean;
  frame?: ReturnType<typeof valuationFrame>;
}) {
  const id = useId();
  const frame =
    sharedFrame ??
    valuationFrame(
      rows.map((r) => r.series),
      metric,
      years,
    );
  if (
    !frame ||
    !rows.some((r) => valuationSegments(r.series.points, metric).length)
  ) {
    return (
      <div className="atlas-valuation-no-picture">
        Für diese Kennzahl fehlen sinnvoll darstellbare Werte.
      </div>
    );
  }
  const width = compact ? 400 : 840;
  const height = compact ? 180 : 340;
  const left = showNumbers ? 55 : 22;
  const right = width - 20;
  const top = 22;
  const bottom = height - 34;
  const x = (year: number) =>
    frame.lastYear === frame.firstYear
      ? (left + right) / 2
      : left +
        ((year - frame.firstYear) / (frame.lastYear - frame.firstYear)) *
          (right - left);
  const y = (value: number) =>
    bottom - ((value - frame.min) / (frame.max - frame.min)) * (bottom - top);
  const format = (value: number) =>
    metric.unit === "share"
      ? `${(value * 100).toLocaleString("de", { maximumFractionDigits: 1 })} %`
      : `${value.toLocaleString("de", { maximumFractionDigits: 2 })}×`;
  return (
    <svg
      className="atlas-valuation-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-labelledby={`${id}-title ${id}-description`}
    >
      <title id={`${id}-title`}>
        {metric.label}: {rows.map((r) => r.label).join(" und ")}
      </title>
      <desc id={`${id}-description`}>
        Veröffentlichte jährliche Unternehmenskennzahlen. Fehlende oder nicht
        sinnvolle Werte bleiben als Lücken sichtbar. Alle dargestellten Reihen
        verwenden dieselbe Skala.
      </desc>
      <line
        className="atlas-valuation-axis"
        x1={left}
        x2={right}
        y1={y(0)}
        y2={y(0)}
      />
      {showNumbers &&
        [frame.min, (frame.min + frame.max) / 2, frame.max].map((value) => (
          <text
            key={value}
            x={left - 8}
            y={y(value) + 4}
            textAnchor="end"
            className="atlas-valuation-tick"
          >
            {format(value)}
          </text>
        ))}
      {frame.firstYear < 2014 &&
        frame.lastYear >= 2014 &&
        rows.some((r) =>
          r.series.points.some(
            (p) => p.methodEpoch === "classification_before_2014",
          ),
        ) && (
          <g>
            <line
              className="atlas-valuation-boundary"
              x1={x(2013.5)}
              x2={x(2013.5)}
              y1={top}
              y2={bottom}
            />
            {!compact && (
              <text x={x(2013.5) + 6} y={top} className="atlas-valuation-tick">
                Andere Branchengliederung
              </text>
            )}
          </g>
        )}
      {rows.map((row, index) => (
        <g
          key={row.label}
          className={
            index
              ? "atlas-valuation-line is-comparison"
              : "atlas-valuation-line"
          }
        >
          {!compact &&
            rows.length === 1 &&
            row.series.historicalPosition.status === "available" &&
            row.series.historicalPosition.previousMedian !== null && (
              <line
                className="atlas-valuation-reference"
                x1={x(row.series.historicalPosition.referenceFirstYear!)}
                x2={right}
                y1={y(row.series.historicalPosition.previousMedian)}
                y2={y(row.series.historicalPosition.previousMedian)}
              />
            )}
          {valuationSegments(row.series.points, metric).map((segment, i) => (
            <g key={i}>
              {segment.length > 1 && (
                <polyline
                  points={segment
                    .map((p) => `${x(p.year)},${y(p.value!)}`)
                    .join(" ")}
                />
              )}
              {segment.map((point) => (
                <circle
                  key={point.year}
                  cx={x(point.year)}
                  cy={y(point.value!)}
                  r={compact ? 2.7 : 4}
                >
                  {showNumbers && (
                    <title>
                      {row.label} · Veröffentlichung {point.year}:{" "}
                      {format(point.value!)} ·{" "}
                      {point.firmCount.toLocaleString("de")} Firmen insgesamt in
                      der Quellenzeile
                    </title>
                  )}
                </circle>
              ))}
            </g>
          ))}
        </g>
      ))}
      <text x={left} y={height - 8} className="atlas-valuation-tick">
        {frame.firstYear}
      </text>
      {frame.lastYear !== frame.firstYear && (
        <text
          x={right}
          y={height - 8}
          textAnchor="end"
          className="atlas-valuation-tick"
        >
          {frame.lastYear}
        </text>
      )}
    </svg>
  );
}
