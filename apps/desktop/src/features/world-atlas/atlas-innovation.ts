import config from "./data/innovation-catalog.json";
import type { AtlasGeography } from "./atlas-types";

export const atlasInnovationCatalog = config;
export const atlasInnovationDataset = config.datasetId;
export type InnovationMetric = (typeof config.metrics)[number];
export const innovationTopics: Record<
  string,
  { group: string; metric: string }
> = {
  "innovation:patents": { group: "digital", metric: "" },
  "innovation:advanced_materials": { group: "materials", metric: "22" },
  "digital:semiconductors": { group: "digital", metric: "8" },
  "digital:telecom": { group: "digital", metric: "3" },
  "health:medical_equipment": { group: "medicine", metric: "13" },
  "health:pharmaceuticals": { group: "medicine", metric: "16" },
  "health:biotechnology": { group: "medicine", metric: "15" },
  "industry:electrical_equipment": { group: "electrical", metric: "1" },
  "industry:machinery": { group: "machines", metric: "" },
  "industry:chemicals": { group: "materials", metric: "" },
  "industry:industrial_automation": { group: "electrical", metric: "12" },
};
export interface InnovationPoint {
  year: number;
  values: Record<string, number | null>;
}
export interface AtlasInnovationResponse {
  geography: AtlasGeography;
  status:
    "available" | "not_downloaded" | "unsupported_area" | "desktop_required";
  profile: {
    geographyId: string;
    providerCode: string;
    providerLabel: string;
    points: InnovationPoint[];
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
export function innovationSelection(params: URLSearchParams, topicId: string) {
  const entry =
    innovationTopics[topicId] ?? innovationTopics["innovation:patents"];
  const group =
    config.groups.find((g) => g.id === params.get("innovationGroup"))?.id ??
    entry.group;
  const raw = params.get("innovationMetric");
  const metric =
    raw === "overview"
      ? ""
      : (config.metrics.find((m) => m.id === raw && m.group === group)?.id ??
        (raw === null && !params.has("innovationGroup") ? entry.metric : ""));
  const since =
    [1980, 2000, 2010].find(
      (y) => String(y) === params.get("innovationSince"),
    ) ?? 1980;
  const through =
    params.get("innovationThrough") === "2024" ? 2024 : config.defaultThrough;
  return { group, metric, since, through };
}
export function validInnovationResponse(r: AtlasInnovationResponse) {
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
export function innovationValue(p: InnovationPoint, m: InnovationMetric) {
  const n = p.values[m.field];
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? n : null;
}
export function innovationView(
  rows: AtlasInnovationResponse[],
  metric: InnovationMetric,
  since: number,
  through: number,
) {
  if (
    !rows.length ||
    rows.some(
      (r) =>
        !validInnovationResponse(r) ||
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
          p.year >= first &&
          p.year <= last &&
          innovationValue(p, metric) !== null,
      )
      .map((p) => ({
        year: p.year,
        value: innovationValue(p, metric)!,
        boundary: p.year > config.defaultThrough,
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
export type InnovationView = NonNullable<ReturnType<typeof innovationView>>;
export function innovationSegments(
  points: InnovationView["series"][number]["points"],
) {
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
