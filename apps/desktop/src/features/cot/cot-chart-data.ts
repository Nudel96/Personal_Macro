import type { CotAssetDetail, CotParticipantPoint } from "../../types/domain";

export type CotGroup =
  "nonCommercialNet" | "commercialNet" | "nonReportableNet";
export type CotUnit = "contracts" | "percentOi";
export const cotGroups: { key: CotGroup; label: string; color: string }[] = [
  { key: "commercialNet", label: "Commercials", color: "#bba1ff" },
  { key: "nonCommercialNet", label: "Große Spekulanten", color: "#56cde1" },
  { key: "nonReportableNet", label: "Non-Reportables", color: "#e8b86b" },
];
export const seasonalWindows = [3, 5, 10, 15] as const;
export const dayMs = 86_400_000;

export interface SeasonalCurve {
  years: number;
  includedYears: number[];
  fromYear: number;
  toYear: number;
  values: (number | null)[];
  counts: number[];
}

export function participantHistory(
  detail?: CotAssetDetail,
): CotParticipantPoint[] {
  if (!detail) return [];
  return (
    detail.participantSeries ??
    detail.series.map((point) => ({
      reportDate: point.reportDate,
      openInterest: point.openInterest,
      nonCommercialNet: point.netPositions,
      commercialNet: null,
      nonReportableNet: null,
    }))
  );
}

export function reportTime(date: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NaN;
  const value = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(value) &&
    new Date(value).toISOString().slice(0, 10) === date
    ? value
    : NaN;
}

export function netValue(
  point: CotParticipantPoint,
  group: CotGroup,
  unit: CotUnit,
): number | null {
  const value = point[group];
  if (
    value == null ||
    !Number.isSafeInteger(value) ||
    !Number.isSafeInteger(point.openInterest) ||
    point.openInterest <= 0 ||
    Math.abs(value) > point.openInterest
  )
    return null;
  return unit === "percentOi" ? (value / point.openInterest) * 100 : value;
}

/** No interpolation or carry-forward. Duplicate report dates cannot count twice. */
function orderedHistory(points: CotParticipantPoint[]) {
  const unique = new Map<number, CotParticipantPoint | null>();
  for (const point of points) {
    const time = reportTime(point.reportDate);
    if (Number.isFinite(time))
      unique.set(time, unique.has(time) ? null : point);
  }
  return [...unique]
    .filter(
      (entry): entry is [number, CotParticipantPoint] => entry[1] !== null,
    )
    .sort((a, b) => a[0] - b[0]);
}

export function historyLines(
  points: CotParticipantPoint[],
  group: CotGroup,
  unit: CotUnit,
  from: number,
  to: number,
): [number, number | null][] {
  const output: [number, number | null][] = [];
  let previous: number | null = null;
  for (const [time, point] of orderedHistory(points)) {
    if (time < from || time > to) continue;
    if (previous != null && time - previous > 10 * dayMs)
      output.push([previous + 7 * dayMs, null]);
    output.push([time, netValue(point, group, unit)]);
    previous = time;
  }
  return output;
}

/** Calendar-year weeks, not ISO weeks: Jan 1–7 = 1; Dec 24–31 = 52.
 * Leap day joins Feb 28's calendar position so subsequent dates stay aligned.
 */
export function seasonalWeek(time: number): number {
  const date = new Date(time);
  const month = date.getUTCMonth();
  const day = month === 1 && date.getUTCDate() === 29 ? 28 : date.getUTCDate();
  const ordinal = (Date.UTC(2001, month, day) - Date.UTC(2001, 0, 1)) / dayMs;
  return Math.min(51, Math.floor(ordinal / 7));
}

function yearlyBuckets(
  points: CotParticipantPoint[],
  group: CotGroup,
  unit: CotUnit,
) {
  const years = new Map<number, { times: number[]; buckets: number[][] }>();
  for (const [time, point] of orderedHistory(points)) {
    const value = netValue(point, group, unit);
    if (value == null) continue;
    const year = new Date(time).getUTCFullYear();
    const data = years.get(year) ?? {
      times: [],
      buckets: Array.from({ length: 52 }, () => []),
    };
    data.times.push(time);
    data.buckets[seasonalWeek(time)].push(value);
    years.set(year, data);
  }
  return years;
}

const mean = (values: number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

export function buildSeasonality(
  points: CotParticipantPoint[],
  group: CotGroup,
  unit: CotUnit,
  years: number,
  referenceYear: number,
): SeasonalCurve {
  const fromYear = referenceYear - years;
  const toYear = referenceYear - 1;
  const included: [number, number[][]][] = [];
  for (const [year, data] of yearlyBuckets(points, group, unit)) {
    if (year < fromYear || year > toYear) continue;
    const complete =
      data.times.length >= 50 &&
      data.times[0] <= Date.UTC(year, 0, 7) &&
      data.times[data.times.length - 1] >= Date.UTC(year, 11, 25) &&
      data.times.every(
        (time, index) =>
          index === 0 || time - data.times[index - 1] <= 10 * dayMs,
      );
    if (complete) included.push([year, data.buckets]);
  }
  const counts: number[] = [];
  const values = Array.from({ length: 52 }, (_, week) => {
    // Each year has equal weight, even when two reports occupy the last week.
    const samples = included.flatMap(([, buckets]) =>
      buckets[week].length ? [mean(buckets[week])] : [],
    );
    counts.push(samples.length);
    return samples.length >= 3 ? mean(samples) : null;
  });
  return {
    years,
    fromYear,
    toYear,
    includedYears: included.map(([year]) => year),
    values,
    counts,
  };
}

export function currentSeason(
  points: CotParticipantPoint[],
  group: CotGroup,
  unit: CotUnit,
  year: number,
): (number | null)[] {
  const buckets = yearlyBuckets(points, group, unit).get(year)?.buckets;
  return Array.from({ length: 52 }, (_, week) =>
    buckets?.[week].length ? mean(buckets[week]) : null,
  );
}

/** Original weekly reports of one year; no binning or averaging. */
export function annualHistory(
  points: CotParticipantPoint[],
  group: CotGroup,
  unit: CotUnit,
  year: number,
): { date: string; value: [number, number | null] }[] {
  return historyLines(
    points,
    group,
    unit,
    Date.UTC(year, 0, 1),
    Date.UTC(year + 1, 0, 1) - dayMs,
  ).map(([time, value]) => {
    const date = new Date(time);
    const month = date.getUTCMonth();
    const day =
      month === 1 && date.getUTCDate() === 29 ? 28 : date.getUTCDate();
    return {
      date: date.toISOString().slice(0, 10),
      value: [Date.UTC(2001, month, day), value],
    };
  });
}

/** A fitted linear axis preserves the observed values, including signed stocks. */
export function fittedExtent(values: (number | null)[]): [number, number] {
  const available = values.filter(
    (value): value is number => value != null && Number.isFinite(value),
  );
  if (!available.length) return [-1, 1];
  const min = Math.min(...available);
  const max = Math.max(...available);
  if (min === 0 && max === 0) return [-1, 1];
  const padding = Math.max(
    (max - min) * 0.08,
    Math.max(Math.abs(min), Math.abs(max)) * 0.005,
  );
  const step = 10 ** Math.floor(Math.log10(Math.max(max - min, padding) / 5));
  return [
    Number((Math.floor((min - padding) / step) * step).toPrecision(12)),
    Number((Math.ceil((max + padding) / step) * step).toPrecision(12)),
  ];
}

export function sharedExtent(values: (number | null)[]): [number, number] {
  const available = values.filter(
    (value): value is number => value != null && Number.isFinite(value),
  );
  const padded = Math.max(1, ...available.map(Math.abs)) * 1.08;
  const step = 10 ** Math.floor(Math.log10(padded));
  const limit = Math.ceil(padded / step) * step;
  return [-limit, limit];
}

export function historyExtent(
  histories: CotParticipantPoint[][],
  years: number,
): [number, number] {
  const dates = histories
    .flat()
    .map((point) => reportTime(point.reportDate))
    .filter(Number.isFinite);
  const to = dates.length ? Math.max(...dates) : Date.now();
  const end = new Date(to);
  const month = end.getUTCMonth();
  const year = end.getUTCFullYear() - (years || 1);
  const day = Math.min(
    end.getUTCDate(),
    new Date(Date.UTC(year, month + 1, 0)).getUTCDate(),
  );
  const from = years
    ? Date.UTC(year, month, day)
    : dates.length
      ? Math.min(...dates)
      : to - 365 * dayMs;
  return [Math.min(from, to - dayMs), to];
}
