import config from "./data/agriculture-catalog.json";
import type { AtlasGeography } from "./atlas-types";

export const atlasAgricultureCatalog = config;
export const atlasAgricultureDataset = config.datasetId;
export type AgricultureMode = "total" | "perCapita";
export interface AgriculturePoint {
  year: number;
  total: number | null;
  perCapita: number | null;
}
export interface AtlasAgricultureResponse {
  geography: AtlasGeography;
  status:
    | "available"
    | "not_downloaded"
    | "unsupported_area"
    | "empty"
    | "desktop_required";
  profile: null | {
    geographyId: string;
    providerCode: string;
    providerLabel: string;
    series: Record<string, AgriculturePoint[]>;
  };
  provenance: null | {
    retrievedAt: string;
    fileModifiedAt: string | null;
    url: string;
    sha256: string;
    release: string;
    sourceRowCount: number;
    numericCellCount: number;
    areaCount: number;
    recipe: string;
  };
}
export const agricultureTopic = (topic: string) =>
  config.topicIds.includes(topic);
export function agricultureView(
  rows: AtlasAgricultureResponse[],
  item: string,
  mode: AgricultureMode,
  since: number,
) {
  const first = rows[0]?.provenance;
  if (
    !first ||
    rows.some(
      (row) =>
        !row.profile ||
        row.status !== "available" ||
        row.profile.geographyId !== row.geography.id ||
        row.provenance?.sha256 !== first.sha256 ||
        row.provenance?.retrievedAt !== first.retrievedAt ||
        row.provenance?.recipe !== first.recipe ||
        row.provenance?.release !== first.release,
    )
  )
    return null;
  const points = rows.map((row) =>
    (row.profile!.series[item] ?? []).filter(
      (p) => Number.isInteger(p.year) && p.year >= since,
    ),
  );
  const valid = points.map((set) =>
    set.filter((p) => p[mode] != null && Number.isFinite(p[mode])),
  );
  if (valid.some((set) => !set.length)) return null;
  // Same calendar and scale; a country does not borrow another country's years.
  const start = Math.max(
    ...valid.map((set) => Math.min(...set.map((p) => p.year))),
  );
  const end = Math.min(
    ...valid.map((set) => Math.max(...set.map((p) => p.year))),
  );
  if (end < start) return null;
  const years = Array.from({ length: end - start + 1 }, (_, i) => start + i);
  const series = rows.map((row, i) => {
    const lookup = new Map(points[i].map((p) => [p.year, p[mode]]));
    return {
      name: row.geography.label,
      values: years.map((y) => {
        const v = lookup.get(y);
        return v != null && Number.isFinite(v) ? v : null;
      }),
    };
  });
  if (!years.some((_, i) => series.every((s) => s.values[i] != null)))
    return null;
  const max =
    Math.max(
      110,
      ...series.flatMap((s) => s.values.filter((v): v is number => v != null)),
    ) * 1.08;
  return { years, series, max };
}
export function agricultureSegments(values: (number | null)[]) {
  const segments: { index: number; value: number }[][] = [];
  let active: { index: number; value: number }[] = [];
  values.forEach((value, index) => {
    if (value == null) {
      if (active.length) segments.push(active);
      active = [];
    } else active.push({ index, value });
  });
  if (active.length) segments.push(active);
  return segments;
}
