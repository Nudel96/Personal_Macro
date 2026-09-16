import config from "./data/macrohistory-catalog.json";
import type { AtlasGeography } from "./atlas-types";

export const atlasMacrohistoryCatalog = config;
export const atlasMacrohistoryDataset = config.datasetId;
export const atlasMacrohistoryTopic = "long_history:financial_history";
export type MacrohistoryMetric = (typeof config.metrics)[number];
export interface MacrohistoryPoint {
  year: number;
  raw: Record<string, number | null>;
  values: Record<
    string,
    { value: number | null; nominal: number | null; interpolated: boolean }
  >;
}
export interface AtlasMacrohistoryResponse {
  geography: AtlasGeography;
  status:
    "available" | "not_downloaded" | "unsupported_area" | "desktop_required";
  profile: {
    geographyId: string;
    providerCode: string;
    providerLabel: string;
    points: MacrohistoryPoint[];
  } | null;
  provenance: {
    retrievedAt: string;
    fileModifiedAt: string | null;
    url: string;
    resolvedUrl: string;
    sha256: string;
    release: string;
    recipe: string;
    sourceRowCount: number;
    numericCellCount: number;
    areaCount: number;
  } | null;
}
export function macrohistoryUnit(metric: MacrohistoryMetric, real: boolean) {
  return metric.method === "return"
    ? `${real ? "Inflationsbereinigte" : "Nominale"} Jahresrendite (%)`
    : metric.unit;
}
export function macrohistoryView(
  rows: AtlasMacrohistoryResponse[],
  metric: MacrohistoryMetric,
  since: number,
  real: boolean,
) {
  if (
    !rows.length ||
    rows.some(
      (r) =>
        !r.profile ||
        r.profile.geographyId !== r.geography.id ||
        !config.areas.some(
          (a) =>
            a.geographyId === r.geography.id &&
            a.code === r.profile?.providerCode,
        ) ||
        r.status !== "available" ||
        !r.provenance ||
        r.provenance.sha256 !== rows[0].provenance?.sha256 ||
        r.provenance.recipe !== config.recipe ||
        r.provenance.retrievedAt !== rows[0].provenance?.retrievedAt,
    )
  )
    return null;
  const value = (p: MacrohistoryPoint) => {
    const cell = p.values[metric.id];
    const n = metric.method === "return" && !real ? cell?.nominal : cell?.value;
    return typeof n === "number" && Number.isFinite(n) ? n : null;
  };
  const available = rows.map((r) =>
    r.profile!.points.filter((p) => p.year >= since && value(p) !== null),
  );
  if (available.some((points) => !points.length)) return null;
  const first = Math.max(...available.map((points) => points[0].year));
  const last = Math.min(
    ...available.map((points) => points[points.length - 1].year),
  );
  if (last < first) return null;
  const years = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const lines = rows.map((row) => {
    const points = new Map(row.profile!.points.map((p) => [p.year, p]));
    return {
      name: row.geography.label,
      id: row.geography.id,
      values: years.map((year) => {
        const p = points.get(year);
        return p ? value(p) : null;
      }),
      interpolated: years.map(
        (year) => points.get(year)?.values[metric.id]?.interpolated ?? false,
      ),
      crises: years.filter((year) => points.get(year)?.raw.crisisJST === 1),
    };
  });
  const commonIndices = years
    .map((_, i) => i)
    .filter((i) => lines.every((row) => row.values[i] !== null));
  if (!commonIndices.length) return null;
  const values = lines.flatMap((row) =>
    row.values.filter((n): n is number => n !== null),
  );
  const signed = metric.method === "return" || values.some((n) => n < 0);
  const extent = Math.max(...values.map(Math.abs), 1e-9);
  return {
    first,
    last,
    years,
    lines,
    lastCommonIndex: commonIndices[commonIndices.length - 1],
    min: signed ? -extent : 0,
    max: extent,
    interpolated: lines.some((row) =>
      row.interpolated.some((flag, i) => flag && row.values[i] !== null),
    ),
  };
}
export type MacrohistoryView = NonNullable<ReturnType<typeof macrohistoryView>>;

/** Each actual calendar year has one position; gaps and source interpolation stay distinct. */
export function macrohistoryPaths(
  view: MacrohistoryView,
  row: MacrohistoryView["lines"][number],
) {
  const x = (i: number) => 12 + (i / Math.max(1, view.years.length - 1)) * 316;
  const y = (v: number) => 12 + ((view.max - v) / (view.max - view.min)) * 100;
  let path = "";
  let connected = false;
  const points: { x: number; y: number; interpolated: boolean }[] = [];
  row.values.forEach((v, i) => {
    if (v === null) {
      connected = false;
      return;
    }
    const estimated = row.interpolated[i];
    if (estimated) {
      points.push({ x: x(i), y: y(v), interpolated: true });
      connected = false;
      return;
    }
    path += `${connected ? "L" : "M"}${x(i)},${y(v)} `;
    if (
      (i === 0 || row.values[i - 1] === null || row.interpolated[i - 1]) &&
      (i === row.values.length - 1 ||
        row.values[i + 1] === null ||
        row.interpolated[i + 1])
    )
      points.push({ x: x(i), y: y(v), interpolated: false });
    connected = true;
  });
  return { path, points, zero: y(0), x };
}
