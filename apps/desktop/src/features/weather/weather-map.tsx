import { useEffect, useRef, useState } from "react";
import { Focus, Globe2, Minus, Plus } from "lucide-react";
import geometry from "../world-atlas/data/map-geometry.json";
import {
  assessRegion,
  effectLabels,
  pointDay,
  weatherValue,
} from "./weather-model";
import { assetRegions, phaseFor } from "./weather-catalog";
import { weatherCondition } from "./weather-conditions";
import { WeatherGlyph } from "./weather-glyph";
import type {
  WeatherAsset,
  WeatherEffect,
  WeatherPhase,
  WeatherSnapshot,
} from "./weather-types";

export type WeatherLayer =
  "picture" | "rain" | "temperature" | "balance" | "impact";
export const layerLabels: Record<WeatherLayer, string> = {
  picture: "Wetterbild",
  rain: "Niederschlag",
  temperature: "Tagesmaximum",
  balance: "P−ET₀",
  impact: "Grobe Wirkung",
};

export const effectColors: Record<WeatherEffect, string> = {
  supportive: "#3fcf98",
  mixed: "#d2b375",
  stress: "#fa7784",
  watch: "#edb75c",
  context: "#91a4bf",
  unknown: "#53657c",
};

// Same Equal Earth projection and viewport as the audited offline atlas geometry.
function equalEarth(longitude: number, latitude: number) {
  const t = Math.asin(
    (Math.sqrt(3) / 2) * Math.sin((latitude * Math.PI) / 180),
  );
  const derivative =
    1.340264 -
    3 * 0.081106 * t ** 2 +
    7 * 0.000893 * t ** 6 +
    9 * 0.003796 * t ** 8;
  return [
    (((longitude * Math.PI) / 180) * Math.cos(t)) /
      ((Math.sqrt(3) / 2) * derivative),
    t * (1.340264 - 0.081106 * t ** 2 + 0.000893 * t ** 6 + 0.003796 * t ** 8),
  ];
}
export function projectWeatherPoint(longitude: number, latitude: number) {
  const scale = 940 / (2 * equalEarth(180, 0)[0]);
  const [x, y] = equalEarth(longitude, latitude);
  return [480 + x * scale, 10 + (equalEarth(0, 90)[1] - y) * scale];
}

export function weatherColor(
  layer: WeatherLayer,
  value: number | null,
  effect: WeatherEffect,
): string {
  if (layer === "impact") return effectColors[effect];
  if (value === null) return "#53657c";
  if (layer === "rain")
    return value < 1
      ? "#9aabc0"
      : value < 10
        ? "#8dccf5"
        : value < 25
          ? "#42a4ef"
          : value < 50
            ? "#456ce7"
            : "#b59afa";
  if (layer === "temperature" || layer === "picture")
    return value < 0
      ? "#90c7f5"
      : value < 15
        ? "#58a9d7"
        : value < 25
          ? "#d6c896"
          : value < 35
            ? "#efa653"
            : "#ed7f66";
  return value < -5
    ? "#efa653"
    : value < 0
      ? "#d7be8e"
      : value < 5
        ? "#8dccf5"
        : "#456ce7";
}

export function WeatherMap({
  asset,
  snapshot,
  date,
  layer,
  selectedRegionId,
  selectedPointId,
  override,
  onRegion,
}: {
  asset: WeatherAsset;
  snapshot?: WeatherSnapshot;
  date: string;
  layer: WeatherLayer;
  selectedRegionId: string;
  selectedPointId: string;
  override: WeatherPhase | "auto";
  onRegion: (id: string, pointId?: string) => void;
}) {
  const regions = assetRegions(asset);
  const region = regions.find((r) => r.id === selectedRegionId) ?? regions[0];
  const [focus, setFocus] = useState<"world" | "region">("world");
  const [zoom, setZoom] = useState(1);
  const map = useRef<SVGSVGElement>(null);
  const [viewport, setViewport] = useState({ width: 960, height: 478 });
  useEffect(() => {
    const element = map.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const bounds = element.getBoundingClientRect();
      if (bounds.width > 0 && bounds.height > 0)
        setViewport({ width: bounds.width, height: bounds.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const points = region.points.map((point) =>
    projectWeatherPoint(point.longitude, point.latitude),
  );
  const cx = points.reduce((sum, p) => sum + p[0], 0) / points.length;
  const cy = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  const spanX =
    Math.max(...points.map((p) => p[0])) - Math.min(...points.map((p) => p[0]));
  const spanY =
    Math.max(...points.map((p) => p[1])) - Math.min(...points.map((p) => p[1]));
  const width =
    focus === "world"
      ? geometry.width / zoom
      : Math.max(150, spanX + 100, (spanY + 80) * 1.9) / zoom;
  const height = (width * geometry.height) / geometry.width;
  const x = focus === "world" ? (geometry.width - width) / 2 : cx - width / 2;
  const y =
    focus === "world" ? (geometry.height - height) / 2 : cy - height / 2;
  const unit = Math.max(width / viewport.width, height / viewport.height);
  const radius = 5 * unit;
  const badgeWidth = 52 * unit;
  const badgeHeight = 46 * unit;
  const labels: { x: number; y: number; shifted: boolean }[] = [];
  for (const area of regions) {
    const [px, py] = projectWeatherPoint(
      area.points[0].longitude,
      area.points[0].latitude,
    );
    const label = { x: px + radius * 2.5, y: py - radius * 2, shifted: false };
    // Nearby production belts need distinct labels at the current zoom.
    while (
      labels.some(
        (prior) =>
          Math.abs(prior.x - label.x) < radius * 3 &&
          Math.abs(prior.y - label.y) < radius * 2.8,
      )
    ) {
      label.y += radius * 3;
      label.shifted = true;
    }
    labels.push(label);
  }
  const badges: { x: number; y: number; visible: boolean }[] = [];
  for (const area of regions) {
    const anchor =
      area.id === selectedRegionId
        ? (area.points.find((p) => p.id === selectedPointId) ?? area.points[0])
        : area.points[0];
    const [px, py] = projectWeatherPoint(anchor.longitude, anchor.latitude);
    const visible = px >= x && px <= x + width && py >= y && py <= y + height;
    // Search bounded positions around the real anchor. Every candidate stays
    // inside the viewport, including narrow screens with clustered crop belts.
    const candidates = [];
    for (let dx = -4; dx <= 4; dx++) {
      for (let dy = -4; dy <= 4; dy++) {
        const bx = Math.min(
          x + width - badgeWidth - 8 * unit,
          Math.max(x + 8 * unit, px + 12 * unit + dx * (badgeWidth + 6 * unit)),
        );
        const by = Math.min(
          y + height - badgeHeight - 8 * unit,
          Math.max(
            y + 8 * unit,
            py - badgeHeight / 2 + dy * (badgeHeight + 6 * unit),
          ),
        );
        const collisions = badges.filter(
          (prior) =>
            prior.visible &&
            Math.abs(prior.x - bx) < badgeWidth + 5 * unit &&
            Math.abs(prior.y - by) < badgeHeight + 5 * unit,
        ).length;
        const distance =
          ((bx - px - 12 * unit) / unit) ** 2 +
          ((by - py + badgeHeight / 2) / unit) ** 2;
        candidates.push({
          x: bx,
          y: by,
          visible,
          score: collisions * 1_000_000 + distance,
        });
      }
    }
    candidates.sort((a, b) => a.score - b.score);
    badges.push(candidates[0]);
  }
  return (
    <div className="weather-map">
      <div
        className="weather-map-controls"
        role="group"
        aria-label="Kartenausschnitt"
      >
        <button
          type="button"
          aria-pressed={focus === "world"}
          onClick={() => {
            setFocus("world");
            setZoom(1);
          }}
        >
          <Globe2 size={14} /> Welt
        </button>
        <button
          type="button"
          aria-pressed={focus === "region"}
          onClick={() => {
            setFocus("region");
            setZoom(1);
          }}
        >
          <Focus size={14} /> Region
        </button>
        <button
          type="button"
          aria-label="Karte vergrößern"
          disabled={zoom >= 4}
          onClick={() => setZoom((v) => Math.min(4, v * 1.5))}
        >
          <Plus size={15} />
        </button>
        <button
          type="button"
          aria-label="Karte verkleinern"
          disabled={zoom <= 1}
          onClick={() => setZoom((v) => Math.max(1, v / 1.5))}
        >
          <Minus size={15} />
        </button>
      </div>
      <svg
        ref={map}
        viewBox={`${x} ${y} ${width} ${height}`}
        role="group"
        aria-label={`Wetterkarte · ${asset.label} · ${layerLabels[layer]} · ${date} UTC`}
      >
        <defs>
          <radialGradient id="weather-ocean">
            <stop offset="0" stopColor="#12273f" />
            <stop offset="1" stopColor="#0b192b" />
          </radialGradient>
        </defs>
        <path d={geometry.outline} fill="url(#weather-ocean)" />
        <path
          d={geometry.graticule}
          fill="none"
          stroke="#2a405b"
          strokeWidth="0.4"
        />
        {[...geometry.areas, ...geometry.unbound].map((area) => (
          <path
            key={area.id}
            d={area.path}
            fillRule="evenodd"
            fill="#21334a"
            stroke="#3c526c"
            strokeWidth="0.4"
          />
        ))}
        {regions.map((area, regionIndex) => {
          const phase =
            override !== "auto" && area.id === selectedRegionId
              ? override
              : phaseFor(asset, area.id, date);
          return area.points.map((point, i) => {
            const [px, py] = projectWeatherPoint(
              point.longitude,
              point.latitude,
            );
            const day = pointDay(snapshot, point.id, date);
            const assessment = assessRegion(
              asset,
              { ...area, points: [point] },
              snapshot,
              date,
              phase,
            );
            const value =
              layer === "rain"
                ? (day?.rainMm ?? null)
                : layer === "temperature" || layer === "picture"
                  ? (day?.maxC ?? null)
                  : layer === "balance"
                    ? day?.rainMm != null && day.et0Mm !== null
                      ? day.rainMm - day.et0Mm
                      : null
                    : null;
            const missing =
              layer === "impact"
                ? assessment.effect === "unknown"
                : layer === "picture"
                  ? weatherCondition(day?.weatherCode).kind === "unknown"
                  : value === null;
            const selected = area.id === selectedRegionId;
            const anchor = selected ? selectedPointId : area.points[0].id;
            const title = `${area.country} · ${area.label}\n${point.name} · Punkt ${i + 1}\n${date} UTC · ${layer === "impact" ? effectLabels[assessment.effect] : layer === "picture" ? `${weatherCondition(day?.weatherCode).label} · Tagesmaximum ${weatherValue(value, "°C")}` : weatherValue(value, layer === "temperature" ? "°C" : "mm")}`;
            return (
              <g
                key={point.id}
                role="button"
                tabIndex={0}
                aria-label={title.split("\n").join(" · ")}
                aria-pressed={selected && point.id === selectedPointId}
                className="weather-map-point"
                onClick={() => onRegion(area.id, point.id)}
                onKeyDown={(event) => {
                  if (["Enter", " "].includes(event.key)) {
                    event.preventDefault();
                    onRegion(area.id, point.id);
                  }
                  if (
                    [
                      "ArrowLeft",
                      "ArrowUp",
                      "ArrowRight",
                      "ArrowDown",
                    ].includes(event.key)
                  ) {
                    event.preventDefault();
                    const all = regions.flatMap((r) => r.points);
                    const index = all.findIndex((p) => p.id === point.id);
                    const direction = ["ArrowRight", "ArrowDown"].includes(
                      event.key,
                    )
                      ? 1
                      : -1;
                    map.current
                      ?.querySelector<SVGGElement>(
                        `[data-point="${all[(index + direction + all.length) % all.length].id}"]`,
                      )
                      ?.focus();
                  }
                }}
                data-point={point.id}
              >
                <title>{title}</title>
                {selected && (
                  <circle
                    cx={px}
                    cy={py}
                    r={radius * 1.9}
                    fill="none"
                    stroke="#c3d6ff"
                    strokeWidth={radius * 0.2}
                    opacity="0.8"
                  />
                )}
                <circle
                  cx={px}
                  cy={py}
                  r={radius}
                  fill={
                    missing
                      ? "#1a2c40"
                      : weatherColor(layer, value, assessment.effect)
                  }
                  stroke={missing ? "#91a4bf" : "#0d192b"}
                  strokeWidth={radius * 0.3}
                  strokeDasharray={
                    missing ? `${radius / 2} ${radius / 2}` : undefined
                  }
                />
                {layer === "picture" &&
                  point.id === anchor &&
                  badges[regionIndex].visible && (
                    <g className="weather-map-badge">
                      <line
                        x1={px}
                        y1={py}
                        x2={badges[regionIndex].x + badgeWidth / 2}
                        y2={badges[regionIndex].y + badgeHeight / 2}
                        stroke={selected ? "#8dccf5" : "#758eac"}
                        strokeWidth={unit}
                      />
                      <rect
                        x={badges[regionIndex].x}
                        y={badges[regionIndex].y}
                        width={badgeWidth}
                        height={badgeHeight}
                        rx={7 * unit}
                        fill={selected ? "#1b3352" : "#102238"}
                        stroke={selected ? "#8dccf5" : "#405777"}
                        strokeWidth={unit}
                      />
                      <text
                        x={badges[regionIndex].x + 5 * unit}
                        y={badges[regionIndex].y + 11 * unit}
                        fill="#91a4bf"
                        fontSize={9 * unit}
                      >
                        {regionIndex + 1}
                      </text>
                      <WeatherGlyph
                        code={day?.weatherCode}
                        x={badges[regionIndex].x + 13 * unit}
                        y={badges[regionIndex].y + unit}
                        size={28 * unit}
                      />
                      <text
                        x={badges[regionIndex].x + badgeWidth / 2}
                        y={badges[regionIndex].y + badgeHeight - 6 * unit}
                        textAnchor="middle"
                        fill={weatherColor(
                          "temperature",
                          day?.maxC ?? null,
                          "context",
                        )}
                        fontSize={11 * unit}
                      >
                        {weatherValue(day?.maxC ?? null, "°C")}
                      </text>
                    </g>
                  )}
                {i === 0 && layer !== "picture" && (
                  <>
                    {labels[regionIndex].shifted && (
                      <line
                        x1={px}
                        y1={py}
                        x2={labels[regionIndex].x - radius * 0.6}
                        y2={labels[regionIndex].y - radius}
                        stroke="#91a4bf"
                        strokeWidth={radius * 0.13}
                      />
                    )}
                    <text
                      x={labels[regionIndex].x}
                      y={labels[regionIndex].y}
                      fill="#e1eafa"
                      fontSize={radius * 2.3}
                      paintOrder="stroke"
                      stroke="#0c1828"
                      strokeWidth={radius * 0.65}
                    >
                      {regionIndex + 1}
                    </text>
                  </>
                )}
              </g>
            );
          });
        })}
      </svg>
      <div className="weather-map-legend">
        {layer === "picture"
          ? [0, 2, 3, 63, 73, 45, 95, null].map((code) => (
              <span key={code ?? "missing"}>
                <WeatherGlyph code={code} size={22} />
                {weatherCondition(code).label}
              </span>
            ))
          : layer === "impact"
            ? (
                ["supportive", "stress", "watch", "context", "unknown"] as const
              ).map((effect) => (
                <span key={effect}>
                  <i style={{ background: effectColors[effect] }} />
                  {effectLabels[effect]}
                </span>
              ))
            : (layer === "rain"
                ? [
                    [0, "< 1"],
                    [5, "1–10"],
                    [15, "10–25"],
                    [35, "25–50"],
                    [65, "≥ 50 mm/Tag"],
                  ]
                : layer === "temperature"
                  ? [
                      [-5, "< 0"],
                      [10, "0–15"],
                      [20, "15–25"],
                      [30, "25–35"],
                      [40, "≥ 35 °C"],
                    ]
                  : [
                      [-10, "< −5"],
                      [-3, "−5–0"],
                      [3, "0–5"],
                      [10, "≥ 5 mm/Tag"],
                    ]
              ).map(([value, label]) => (
                <span key={label}>
                  <i
                    style={{
                      background: weatherColor(layer, Number(value), "context"),
                    }}
                  />
                  {label}
                </span>
              ))}
        {layer !== "impact" && layer !== "picture" && (
          <span>
            <i className="weather-missing-dot" /> Fehlend
          </span>
        )}
      </div>
      <p className="weather-map-note">
        {layer === "picture"
          ? "Symbole und Tagesmaximum: ein benannter Wetterpunkt je Region; in der gewählten Region der ausgewählte Ort. "
          : "Drei Wetterpunkte je Schwerpunkt · "}
        Nummern entsprechen der Regionsliste. Punkte sind Modellorte, keine
        flächendeckenden Anbau- oder Radarflächen. Tab/Pfeiltasten und Enter
        wählen einen Ort.
      </p>
    </div>
  );
}
