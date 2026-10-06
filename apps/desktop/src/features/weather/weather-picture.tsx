import { useId, useState, type CSSProperties } from "react";
import { Droplets, Thermometer, Wind } from "lucide-react";
import { weatherCondition } from "./weather-conditions";
import { WeatherGlyph } from "./weather-glyph";
import { weatherColor } from "./weather-map";
import { dateLabel, pointDay, utcDate, weatherValue } from "./weather-model";
import type {
  WeatherPoint,
  WeatherRegion,
  WeatherSnapshot,
} from "./weather-types";
import "./weather-picture.css";

export function WeatherPicture({
  region,
  point,
  snapshot,
  date,
  origin,
  onPoint,
  onDay,
}: {
  region: WeatherRegion;
  point: WeatherPoint;
  snapshot?: WeatherSnapshot;
  date: string;
  origin: string;
  onPoint: (id: string) => void;
  onDay: (offset: number) => void;
}) {
  const gradientId = useId().replace(/:/g, "");
  const [motion, setMotion] = useState(true);
  const day = pointDay(snapshot, point.id, date);
  const condition = weatherCondition(day?.weatherCode);
  const { kind } = condition;
  const frozen = kind === "snow" || kind === "freezing";
  const falling =
    ["rain", "drizzle", "snow", "freezing"].includes(kind) ||
    (kind === "storm" && day?.rainMm != null && day.rainMm > 0);
  const dayType =
    date < utcDate()
      ? "Archivierter Modelltag"
      : date === utcDate()
        ? "Heutiger Modelltag"
        : "Vorhersage";
  return (
    <section
      className="weather-card weather-picture"
      aria-label="Visuelles Wetter am ausgewählten Ort"
    >
      <div className="weather-card-header">
        <div>
          <span className="weather-eyebrow">WETTER SICHTBAR MACHEN</span>
          <h2>Wetterbild · {region.label}</h2>
          <p>
            {region.country} · {point.name} · {dateLabel(date, true)} UTC
          </p>
        </div>
        <label className="weather-motion-toggle">
          <input
            type="checkbox"
            checked={motion}
            onChange={(event) => setMotion(event.target.checked)}
          />
          Bewegung
        </label>
      </div>
      <div
        className="weather-picture-points"
        role="group"
        aria-label="Ort für das Wetterbild"
      >
        {region.points.map((place, i) => (
          <button
            type="button"
            key={place.id}
            aria-pressed={place.id === point.id}
            onClick={() => onPoint(place.id)}
          >
            <span>{i + 1}</span>
            {place.name}
          </button>
        ))}
      </div>
      <div
        className={`weather-picture-body weather-picture-${kind}`}
        data-motion={motion ? "on" : "off"}
      >
        <div className="weather-scene">
          <div className="weather-scene-caption">
            <span>{dayType}</span>
            <strong>{condition.label}</strong>
          </div>
          <svg
            viewBox="0 0 640 270"
            role="img"
            aria-label={`Schematisches Wetterbild · ${point.name} · ${date} UTC · ${condition.label}`}
          >
            <defs>
              <linearGradient id={`${gradientId}-sky`} x2="0" y2="1">
                <stop
                  stopColor={
                    kind === "clear"
                      ? "#183953"
                      : kind === "storm"
                        ? "#19233e"
                        : "#152d47"
                  }
                />
                <stop offset="1" stopColor="#0e1e32" />
              </linearGradient>
              <radialGradient id={`${gradientId}-glow`}>
                <stop
                  stopColor={weatherColor(
                    "temperature",
                    day?.maxC ?? null,
                    "context",
                  )}
                  stopOpacity="0.13"
                />
                <stop offset="1" stopColor="#13243a" stopOpacity="0" />
              </radialGradient>
            </defs>
            <rect width="640" height="270" fill={`url(#${gradientId}-sky)`} />
            <ellipse
              cx="390"
              cy="130"
              rx="245"
              ry="145"
              fill={`url(#${gradientId}-glow)`}
            />
            {kind !== "unknown" && kind !== "clear" && (
              <g className="weather-scene-clouds" fill="#99b6d3" opacity="0.09">
                <path d="M100 123a21 21 0 0 1-1-42 28 28 0 0 1 52-10 24 24 0 0 1 43 16 18 18 0 0 1-3 36Z" />
                <path d="M426 89a22 22 0 0 1-1-44 30 30 0 0 1 54-9 27 27 0 0 1 42 14 19 19 0 0 1-1 39Z" />
              </g>
            )}
            <WeatherGlyph code={day?.weatherCode} x={252} y={24} size={192} />
            {falling && (
              <g
                className={`weather-scene-precipitation ${frozen ? "weather-scene-snow" : "weather-scene-rain"}`}
                fill="none"
                stroke={frozen ? "#c8e7fa" : "#7abcef"}
                strokeLinecap="round"
              >
                {Array.from({ length: 18 }, (_, i) => {
                  const px = 231 + ((i * 47) % 251);
                  const py = 126 + ((i * 31) % 75);
                  return (
                    <path
                      key={i}
                      className="weather-scene-particle"
                      d={
                        frozen
                          ? `M${px - 3} ${py}h6m-3-3v6m-2-5 4 4m-4 0 4-4`
                          : `M${px} ${py}l-3 ${kind === "drizzle" ? 3 : 10}`
                      }
                      strokeWidth={frozen ? 1.2 : 1.5}
                      opacity="0.65"
                      style={{ animationDelay: `${-i * 0.29}s` }}
                    />
                  );
                })}
              </g>
            )}
            {kind === "fog" && (
              <g
                className="weather-scene-fog"
                stroke="#b6c7da"
                strokeWidth="7"
                strokeLinecap="round"
                opacity="0.12"
              >
                <path d="M80 160h330M200 182h360M30 202h380" />
              </g>
            )}
            {(day?.weatherCode === 96 || day?.weatherCode === 99) && (
              <g fill="#c8e7fa" opacity="0.7">
                {[269, 321, 380, 425].map((px, i) => (
                  <circle
                    key={px}
                    className="weather-scene-particle"
                    cx={px}
                    cy={172 + i * 8}
                    r="2.5"
                    style={{ animationDelay: `${-i * 0.37}s` }}
                  />
                ))}
              </g>
            )}
            <path
              d="M0 231Q95 185 203 214T410 211T640 220V270H0Z"
              fill="#193442"
            />
            <path d="M0 250Q159 197 341 232T640 239V270H0Z" fill="#142b39" />
            <g fill="none" stroke="#294752" strokeWidth="1" opacity="0.65">
              <path d="M80 270q139-49 263-37M175 270q109-32 195-33M304 270q66-18 105-27M420 270l31-21M0 255q200-32 388-12" />
            </g>
          </svg>
          <span className="weather-scene-label">
            Schematische Tagesdarstellung
          </span>
        </div>
        <div
          className="weather-picture-readings"
          style={
            {
              "--weather-thermal": weatherColor(
                "temperature",
                day?.maxC ?? null,
                "context",
              ),
            } as CSSProperties
          }
        >
          <div className="weather-picture-temperature">
            <Thermometer size={19} aria-hidden />
            <div>
              <span>Tagesmaximum</span>
              <strong>{weatherValue(day?.maxC ?? null, "°C")}</strong>
            </div>
          </div>
          <dl>
            <div>
              <dt>Minimum</dt>
              <dd>{weatherValue(day?.minC ?? null, "°C")}</dd>
            </div>
            <div>
              <dt>
                <Droplets size={13} aria-hidden />
                Niederschlag
              </dt>
              <dd>{weatherValue(day?.rainMm ?? null, "mm")}</dd>
            </div>
            <div>
              <dt>Niederschlagschance¹</dt>
              <dd>{weatherValue(day?.rainProbability ?? null, "%")}</dd>
            </div>
            <div>
              <dt>
                <Wind size={13} aria-hidden />
                Max. Böe
              </dt>
              <dd>{weatherValue(day?.gustKmh ?? null, "km/h")}</dd>
            </div>
          </dl>
          <p>Ein Wetterpunkt · Tageswerte in UTC</p>
        </div>
      </div>
      <div className="weather-picture-outlook-heading">
        <strong>Wetterverlauf am selben Ort</strong>
        <span>Tag wählen · heute bis +13</span>
      </div>
      <div
        className="weather-picture-outlook"
        role="group"
        aria-label="Visuelle Wettervorhersage"
      >
        {Array.from({ length: 14 }, (_, offset) => {
          const nextDate = utcDate(offset, origin);
          const nextDay = pointDay(snapshot, point.id, nextDate);
          const nextCondition = weatherCondition(nextDay?.weatherCode);
          return (
            <button
              type="button"
              key={nextDate}
              aria-pressed={date === nextDate}
              className={offset >= 7 ? "weather-outlook-distant" : ""}
              onClick={() => onDay(offset)}
              aria-label={`${dateLabel(nextDate, true)} UTC · ${nextCondition.label} · Maximum ${weatherValue(nextDay?.maxC ?? null, "°C")} · Niederschlag ${weatherValue(nextDay?.rainMm ?? null, "mm")}${offset >= 7 ? " · Unsicherer Ausblick" : ""}`}
            >
              <span>
                {offset === 0
                  ? origin === utcDate()
                    ? "Heute"
                    : "Start"
                  : dateLabel(nextDate)}
              </span>
              <WeatherGlyph code={nextDay?.weatherCode} size={36} />
              <strong>{weatherValue(nextDay?.maxC ?? null, "°C")}</strong>
              <small>{weatherValue(nextDay?.rainMm ?? null, "mm")}</small>
            </button>
          );
        })}
      </div>
      <p className="weather-picture-note">
        Symbol und Himmel zeigen die schwerwiegendste modellierte Wetterart des
        Tages (WMO-Code), keinen stündlichen Ablauf. Bewegung und Landschaft
        sind schematisch. Niederschlag umfasst Regen und Schnee als
        Wasseräquivalent. ¹ Höchste stündliche Wahrscheinlichkeit am Tag. Ab +7
        Tagen ist der Ausblick deutlich unsicherer.
      </p>
    </section>
  );
}
