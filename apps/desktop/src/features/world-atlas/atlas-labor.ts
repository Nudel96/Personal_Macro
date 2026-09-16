import config from "./data/labor-catalog.json";
import type { AtlasGeography } from "./atlas-types";

export const atlasLaborCatalog = config;
export const atlasLaborDataset = config.datasetId;
export type LaborMetric = (typeof config.metrics)[number];
export const laborTopics: Record<string, { group: string; metric: string }> = {
  "labor:employment": { group: "production", metric: "" },
  "labor:sector_structure": { group: "production", metric: "" },
};
export interface LaborPoint {
  year: number;
  values: Record<string, number | null>;
  flags: Record<string, string>;
}
export interface AtlasLaborResponse {
  geography: AtlasGeography;
  status:
    "available" | "not_downloaded" | "unsupported_area" | "desktop_required";
  profile: {
    geographyId: string;
    providerCode: string;
    providerLabel: string;
    points: LaborPoint[];
  } | null;
  provenance: {
    retrievedAt: string;
    url: string;
    sha256: string;
    release: string;
    sourceRelease: string;
    recipe: string;
    sourceRowCount: number;
    sourceNumericCellCount: number;
    numericCellCount: number;
    areaCount: number;
  } | null;
}
export function laborSelection(params: URLSearchParams, topicId: string) {
  const entry = laborTopics[topicId] ?? laborTopics["labor:employment"];
  const group =
    config.groups.find((g) => g.id === params.get("laborGroup"))?.id ??
    entry.group;
  const raw = params.get("laborMetric");
  const metric =
    raw === "overview"
      ? ""
      : (config.metrics.find((m) => m.id === raw && m.group === group)?.id ??
        (raw === null && !params.has("laborGroup") ? entry.metric : ""));
  const since =
    [1991, 2000, 2010].find((y) => String(y) === params.get("laborSince")) ??
    1991;
  const through = config.lastYear;
  return { group, metric, since, through };
}
export function validLaborResponse(r: AtlasLaborResponse) {
  return (
    r.status === "available" &&
    r.profile?.geographyId === r.geography.id &&
    config.areas.some(
      (a) =>
        a.geographyId === r.geography.id &&
        a.code === r.profile?.providerCode &&
        a.label === r.profile.providerLabel,
    ) &&
    r.provenance?.sha256 === config.sha256 &&
    r.provenance.recipe === config.recipe &&
    r.provenance.sourceRelease === config.sourceRelease &&
    r.provenance.url === config.sourceUrl
  );
}
export function laborValue(p: LaborPoint, m: LaborMetric) {
  const n = p.values[m.field],
    total = p.values[config.totalField];
  return typeof n === "number" &&
    Number.isSafeInteger(n) &&
    n >= 0 &&
    typeof total === "number" &&
    Number.isSafeInteger(total) &&
    total > 0 &&
    n <= total
    ? (100 * n) / total
    : null;
}
export function laborView(
  rows: AtlasLaborResponse[],
  metric: LaborMetric,
  since: number,
  through: number,
) {
  if (
    !rows.length ||
    rows.some(
      (r) =>
        !validLaborResponse(r) ||
        r.provenance?.retrievedAt !== rows[0].provenance?.retrievedAt,
    )
  )
    return null;
  const first = Math.max(config.firstYear, since),
    last = Math.min(config.lastYear, through);
  const series = rows.map((r) => ({
    id: r.geography.id,
    name: r.geography.label,
    points: r
      .profile!.points.filter(
        (p) =>
          p.year >= first && p.year <= last && laborValue(p, metric) !== null,
      )
      .map((p) => ({
        year: p.year,
        value: laborValue(p, metric)!,
        boundary: false,
        adjusted: p.flags[metric.field] === "A",
      })),
  }));
  if (series.some((s) => !s.points.length)) return null;
  const common = series[0].points
    .filter((p) => series.every((s) => s.points.some((q) => q.year === p.year)))
    .map((p) => p.year);
  if (!common.length) return null;
  return {
    first,
    last,
    series,
    lastCommonYear: Math.max(...common),
    min: 0,
    max: Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.value))),
  };
}
export type LaborView = NonNullable<ReturnType<typeof laborView>>;
export function laborSegments(points: LaborView["series"][number]["points"]) {
  return points.flatMap((p, i) => {
    const previous = points[i - 1];
    return previous &&
      !p.boundary &&
      !previous.boundary &&
      p.year === previous.year + 1
      ? [[previous, p]]
      : [];
  });
}
