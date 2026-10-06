import { weatherCondition } from "./weather-conditions";

const cloudPath =
  "M14 43a9 9 0 0 1-1-18 13 13 0 0 1 25-4 10 10 0 0 1 9 6 8 8 0 0 1-1 16Z";

// A small vector weather vocabulary shared by the map, scene and forecast strip.
export function WeatherGlyph({
  code,
  size = 40,
  x,
  y,
}: {
  code: number | null | undefined;
  size?: number;
  x?: number;
  y?: number;
}) {
  const { kind } = weatherCondition(code);
  const sun = kind === "clear" || kind === "partly-cloudy";
  const rain = kind === "rain" || kind === "drizzle" || kind === "freezing";
  return (
    <svg
      x={x}
      y={y}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={`weather-glyph weather-glyph-${kind}`}
    >
      {sun && (
        <g className="weather-glyph-sun">
          {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
            <path
              key={angle}
              d="M32 4v5"
              transform={`rotate(${angle} 32 25)`}
              stroke="#f3cf80"
              strokeWidth="3"
              strokeLinecap="round"
            />
          ))}
          <circle cx="32" cy="25" r="11" fill="#f3cf80" />
        </g>
      )}
      {kind !== "clear" && kind !== "unknown" && (
        <path
          d={cloudPath}
          fill={kind === "storm" ? "#93a6c4" : "#d7e4f5"}
          stroke="#a6bedc"
          strokeWidth="1.4"
        />
      )}
      {rain &&
        [21, 32, 43].map((cx) =>
          kind === "drizzle" ? (
            <circle key={cx} cx={cx} cy="51" r="1.6" fill="#7abcef" />
          ) : (
            <path
              key={cx}
              d={`M${cx} 48l-3 7`}
              stroke={kind === "freezing" ? "#c8ddff" : "#7abcef"}
              strokeWidth="3"
              strokeLinecap="round"
            />
          ),
        )}
      {(kind === "snow" || kind === "freezing") &&
        [22, 42].map((cx) => (
          <path
            key={cx}
            d={`M${cx - 3} 58h6m-3-3v6m-2-5 4 4m-4 0 4-4`}
            stroke="#c8e7fa"
            strokeWidth="1.2"
          />
        ))}
      {kind === "storm" && (
        <path
          className="weather-glyph-bolt"
          d="m34 40-11 14h9l-5 10 16-16h-10l8-8Z"
          fill="#f3cf80"
        />
      )}
      {(code === 96 || code === 99) && (
        <g fill="#c8e7fa">
          <circle cx="17" cy="53" r="2" />
          <circle cx="48" cy="54" r="2" />
        </g>
      )}
      {kind === "fog" && (
        <g stroke="#a6bedc" strokeWidth="2.5" strokeLinecap="round">
          <path d="M10 49h36M18 55h36M12 61h33" />
        </g>
      )}
      {kind === "unknown" && (
        <g fill="none" stroke="#91a4bf" strokeWidth="2" strokeDasharray="3 3">
          <path d={cloudPath} />
          <circle cx="32" cy="52" r="1" />
        </g>
      )}
    </svg>
  );
}
