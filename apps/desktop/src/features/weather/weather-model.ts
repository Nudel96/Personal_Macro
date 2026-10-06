import { assetPoints } from "./weather-catalog";
import type {
  WeatherAsset,
  WeatherAssessment,
  WeatherDay,
  WeatherEffect,
  WeatherEnvelope,
  WeatherFinding,
  WeatherPhase,
  WeatherPointSeries,
  WeatherRegion,
  WeatherSnapshot,
} from "./weather-types";

export const effectLabels: Record<WeatherEffect, string> = {
  supportive: "Potenziell fördernd",
  mixed: "Gemischte Einflüsse",
  stress: "Mögliche Belastung",
  watch: "Beobachten",
  context: "Keine auffällige Warnschwelle",
  unknown: "Nicht ausreichend verfügbar",
};

export function utcDate(
  offset = 0,
  origin = new Date().toISOString().slice(0, 10),
): string {
  const date = new Date(`${origin}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function invalid(): never {
  throw {
    code: "WEATHER_RESPONSE_INVALID",
    message:
      "Wetterdaten passen nicht zu Orten, Zeitfenster oder Einheiten. Es wird keine Einschätzung berechnet.",
  };
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function finite(value: unknown, min: number, max: number): number | null {
  if (value === null) return null;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    invalid();
  return value;
}

// Shared by native commands and real browser weather: one interpretation path.
export function parseWeatherEnvelope(
  envelope: WeatherEnvelope,
  asset: WeatherAsset,
): WeatherSnapshot {
  const fetched = Date.parse(envelope.fetchedAt);
  const today = envelope.fetchedAt.slice(0, 10);
  const requested = assetPoints(asset);
  if (
    envelope.assetId !== asset.id ||
    !Number.isFinite(fetched) ||
    fetched > Date.now() + 300_000 ||
    !Array.isArray(envelope.pointIds) ||
    !Array.isArray(envelope.responses) ||
    envelope.pointIds.length !== requested.length ||
    envelope.responses.length !== requested.length ||
    envelope.pointIds.some((id, i) => id !== requested[i].id)
  )
    invalid();
  const points: WeatherPointSeries[] = envelope.responses.map(
    (response, index) => {
      const row = record(response);
      const latitude = finite(row.latitude, -90, 90);
      const longitude = finite(row.longitude, -180, 180);
      if (
        latitude === null ||
        longitude === null ||
        row.utc_offset_seconds !== 0 ||
        Math.abs(latitude - requested[index].latitude) > 0.5 ||
        Math.abs(longitude - requested[index].longitude) > 0.5
      )
        invalid();
      const current = record(row.current);
      const units = record(row.daily_units);
      if (
        record(row.current_units).temperature_2m !== "°C" ||
        units.time !== "iso8601"
      )
        invalid();
      const currentAt =
        typeof current.time === "string" ? `${current.time}Z` : "";
      const at = Date.parse(currentAt);
      // This is the timestamp of current model conditions, never a model issue time.
      if (!Number.isFinite(at) || Math.abs(fetched - at) > 2 * 60 * 60_000)
        invalid();
      const daily = record(row.daily);
      const dates = daily.time;
      if (
        !Array.isArray(dates) ||
        dates.length !== 21 ||
        dates.some((date, i) => date !== utcDate(i - 7, today))
      )
        invalid();
      const specs = [
        ["temperature_2m_min", "°C", -100, 65],
        ["temperature_2m_max", "°C", -100, 65],
        ["precipitation_sum", "mm", 0, 2000],
        ["et0_fao_evapotranspiration", "mm", 0, 50],
        ["wind_gusts_10m_max", "km/h", 0, 500],
        ["precipitation_hours", "h", 0, 24],
        ["precipitation_probability_max", "%", 0, 100],
      ] as const;
      const values = new Map<string, (number | null)[]>();
      for (const [key, unit, min, max] of specs) {
        const series = daily[key];
        if (
          units[key] !== unit ||
          !Array.isArray(series) ||
          series.length !== dates.length
        )
          invalid();
        values.set(
          key,
          series.map((v) => finite(v, min, max)),
        );
      }
      // Older installed backends may still return the previous daily schema.
      // Missing codes keep the measurements usable without inventing a sky condition.
      let codes: (number | null)[] = Array(dates.length).fill(null);
      if (Object.prototype.hasOwnProperty.call(daily, "weather_code")) {
        if (
          units.weather_code !== "wmo code" ||
          !Array.isArray(daily.weather_code) ||
          daily.weather_code.length !== dates.length
        )
          invalid();
        codes = daily.weather_code.map((value) => {
          const code = finite(value, 0, 99);
          if (code !== null && !Number.isInteger(code)) invalid();
          return code;
        });
      }
      const days: WeatherDay[] = dates.map((date, i) => {
        const minC = values.get("temperature_2m_min")![i];
        const maxC = values.get("temperature_2m_max")![i];
        if (minC !== null && maxC !== null && minC > maxC) invalid();
        return {
          date: date as string,
          weatherCode: codes[i],
          minC,
          maxC,
          rainMm: values.get("precipitation_sum")![i],
          et0Mm: values.get("et0_fao_evapotranspiration")![i],
          gustKmh: values.get("wind_gusts_10m_max")![i],
          rainHours: values.get("precipitation_hours")![i],
          rainProbability: values.get("precipitation_probability_max")![i],
        };
      });
      return {
        pointId: requested[index].id,
        latitude,
        longitude,
        currentAt,
        currentC: finite(current.temperature_2m, -100, 65),
        days,
      };
    },
  );
  return { assetId: asset.id, fetchedAt: envelope.fetchedAt, today, points };
}

export function pointDay(
  snapshot: WeatherSnapshot | undefined,
  pointId: string,
  date: string,
): WeatherDay | undefined {
  return snapshot?.points
    .find((p) => p.pointId === pointId)
    ?.days.find((d) => d.date === date);
}

export function completeWeatherDay(
  day: WeatherDay | undefined,
): day is WeatherDay & {
  rainMm: number;
  minC: number;
  maxC: number;
  et0Mm: number;
} {
  return (
    !!day &&
    day.rainMm !== null &&
    day.minC !== null &&
    day.maxC !== null &&
    day.et0Mm !== null
  );
}

export function summarizeRegion(
  snapshot: WeatherSnapshot | undefined,
  region: WeatherRegion,
  date: string,
  days = 1,
): WeatherAssessment {
  const series = region.points.map((point) =>
    Array.from({ length: days }, (_, i) =>
      pointDay(snapshot, point.id, utcDate(i, date)),
    ),
  );
  const complete = series.filter((rows) =>
    rows.every(completeWeatherDay),
  ) as (WeatherDay & {
    rainMm: number;
    minC: number;
    maxC: number;
    et0Mm: number;
  })[][];
  const expected = region.points.length;
  if (!complete.length)
    return {
      effect: "unknown",
      findings: [],
      coverage: 0,
      expected,
      rainMm: null,
      balanceMm: null,
      minC: null,
      maxC: null,
    };
  // Display average point totals, never a production/area-weighted regional mean.
  const meanTotal = (get: (day: (typeof complete)[number][number]) => number) =>
    complete.reduce(
      (total, rows) => total + rows.reduce((sum, d) => sum + get(d), 0),
      0,
    ) / complete.length;
  return {
    effect: "context",
    findings: [],
    coverage: complete.length,
    expected,
    rainMm: meanTotal((d) => d.rainMm),
    balanceMm: meanTotal((d) => d.rainMm - d.et0Mm),
    minC: Math.min(...complete.flat().map((d) => d.minC)),
    maxC: Math.max(...complete.flat().map((d) => d.maxC)),
  };
}

export function assessRegion(
  asset: WeatherAsset,
  region: WeatherRegion,
  snapshot: WeatherSnapshot | undefined,
  date: string,
  phase: WeatherPhase,
  days = 1,
): WeatherAssessment {
  const summary = summarizeRegion(snapshot, region, date, days);
  const findings: WeatherFinding[] = [];
  // All dated records can reveal an extreme, even when another variable is missing.
  const rows = region.points.flatMap((point) =>
    Array.from({ length: days }, (_, i) =>
      pointDay(snapshot, point.id, utcDate(i, date)),
    ).filter((d): d is WeatherDay => !!d),
  );
  const thresholds = asset.thresholds;
  const active = phase !== "dormant";
  if (
    active &&
    rows.some((d) => d.minC !== null && d.minC <= thresholds.frostC)
  )
    findings.push({
      kind: "stress",
      title: "Kälte / Frosthinweis",
      explanation: `Mindestens ein Wetterpunkt erreicht ${thresholds.frostC} °C oder weniger. Empfindlichkeit hängt von Sorte, Dauer und Entwicklungsphase ab.`,
    });
  if (active && rows.some((d) => d.maxC !== null && d.maxC >= thresholds.heatC))
    findings.push({
      kind: phase === "flowering" ? "stress" : "watch",
      title: "Hitzehinweis",
      explanation: `Mindestens ein Wetterpunkt erreicht ${thresholds.heatC} °C oder mehr.${phase === "flowering" ? " Während Blüte/Füllung kann Hitze Bestäubung und Ertragsbildung belasten." : " Dauer, Nachtabkühlung und Wasserversorgung bestimmen die Wirkung."}`,
    });
  if (rows.some((d) => d.rainMm !== null && d.rainMm >= thresholds.heavyRainMm))
    findings.push({
      kind: "watch",
      title: "Starkregenhinweis",
      explanation: `Mindestens ein Punkt erreicht ${thresholds.heavyRainMm} mm am Tag. Das kann Feldzugang, Drainage oder Trocknung belasten; Überflutung ist damit nicht nachgewiesen.`,
    });
  if (
    active &&
    ["ripening", "harvest"].includes(phase) &&
    rows.some((d) => d.rainMm !== null && d.rainMm >= 10)
  )
    findings.push({
      kind: "stress",
      title: "Nässe während Reife / Ernte",
      explanation:
        "Ein Wetterpunkt erwartet mindestens 10 mm am Tag. Feuchte kann Erntezugang, Trocknung oder Qualität erschweren; die aktuelle Feldlage ist unbekannt.",
    });
  // Water deficit screening requires a complete seven-day sequence per point.
  const weeks = region.points.map((point) =>
    Array.from({ length: 7 }, (_, i) =>
      pointDay(snapshot, point.id, utcDate(i, date)),
    ),
  );
  const fullWeeks = weeks.filter((week) =>
    week.every(completeWeatherDay),
  ) as (WeatherDay & { rainMm: number; et0Mm: number })[][];
  if (
    active &&
    ["growth", "flowering", "mixed"].includes(phase) &&
    fullWeeks.some(
      (week) =>
        week.reduce((sum, d) => sum + d.rainMm - d.et0Mm, 0) <=
        thresholds.waterGapMm,
    )
  )
    findings.push({
      kind: phase === "flowering" ? "stress" : "watch",
      title: "Wasserbilanz unter Druck · folgende 7 Tage",
      explanation: `An mindestens einem Punkt liegt P−ET₀ über die folgenden sieben Tage bei ${thresholds.waterGapMm} mm oder darunter. Das ist ein atmosphärischer Defizithinweis; Bodenwasser und Bewässerung sind unbekannt.`,
    });
  if (
    active &&
    fullWeeks.some(
      (week) =>
        week.reduce((sum, d) => sum + d.rainMm, 0) >= thresholds.wetWeekMm,
    )
  )
    findings.push({
      kind: "watch",
      title: "Nasser Abschnitt · folgende 7 Tage",
      explanation: `Mindestens ein Punkt erwartet ${thresholds.wetWeekMm} mm in sieben Tagen. Prüfe Drainage, Pflanzenhygiene und Zugänglichkeit; eine Krankheit wird nicht diagnostiziert.`,
    });
  const fullCoverage = summary.coverage === summary.expected;
  const excessiveRain = findings.some(
    (f) =>
      f.title === "Starkregenhinweis" || f.title.startsWith("Nasser Abschnitt"),
  );
  const cold = findings.some((f) => f.title === "Kälte / Frosthinweis");
  if (
    active &&
    fullCoverage &&
    ["growth", "flowering", "mixed"].includes(phase) &&
    !excessiveRain &&
    !cold &&
    summary.rainMm !== null &&
    summary.rainMm >= (days === 1 ? 3 : 15)
  )
    findings.push({
      kind: "support",
      title: "Niederschlag kann Wasserversorgung unterstützen",
      explanation:
        "Die Wetterpunkte zeigen Regen ohne auffällige Kälte- oder Nassschwelle. Er kann Wasser nachliefern, auch wenn andere Belastungen bestehen. Nutzen hängt vom vorhandenen Bodenwasser ab; Niederschlag allein beweist keine günstige Feldlage.",
    });
  if (
    active &&
    fullCoverage &&
    ["ripening", "harvest"].includes(phase) &&
    !findings.length &&
    rows.every((d) => d.rainMm !== null && d.rainMm < 1)
  )
    findings.push({
      kind: "support",
      title: "Trockener Abschnitt kann Ernte unterstützen",
      explanation:
        "Alle drei Wetterpunkte bleiben unter 1 mm je Tag. Das kann Feldzugang und Trocknung unterstützen; Reife und Befahrbarkeit sind nicht gemessen.",
    });
  const stress = findings.some((f) => f.kind === "stress");
  const watch = findings.some((f) => f.kind === "watch");
  const support = findings.some((f) => f.kind === "support");
  const effect: WeatherEffect = stress
    ? support
      ? "mixed"
      : "stress"
    : watch
      ? support
        ? "mixed"
        : "watch"
      : !fullCoverage
        ? "unknown"
        : support
          ? "supportive"
          : "context";
  return { ...summary, effect, findings };
}

export function dateLabel(date: string, weekday = false): string {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    ...(weekday ? { weekday: "short" as const } : {}),
  }).format(new Date(`${date}T12:00:00Z`));
}

export function weatherValue(
  value: number | null | undefined,
  unit: string,
  decimals = 1,
): string {
  return value == null
    ? "—"
    : `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: decimals }).format(value)} ${unit}`;
}
