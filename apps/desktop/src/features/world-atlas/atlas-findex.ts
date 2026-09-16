import config from "./data/findex-catalog.json";
import type { AtlasGeography } from "./atlas-types";

export const atlasFindexCatalog = config;
export const atlasFindexDataset = config.datasetId;
export type FindexMetric = (typeof config.metrics)[number];
export const findexTopics: Record<string, { group: string; metric: string }> = {
  "finance:financial_access": { group: "accounts", metric: "" },
  "finance:payments": { group: "transfers", metric: "" },
  "digital:digital_payments": { group: "payments", metric: "" },
};
export interface FindexPoint {
  year: number;
  population: string;
  values: Record<string, string | null>;
}
export interface AtlasFindexResponse {
  geography: AtlasGeography;
  status:
    "available" | "not_downloaded" | "unsupported_area" | "desktop_required";
  profile: {
    geographyId: string;
    providerCode: string;
    providerLabel: string;
    points: FindexPoint[];
  } | null;
  provenance: {
    retrievedAt: string;
    url: string;
    sha256: string;
    glossarySha256: string;
    release: string;
    recipe: string;
    sourceRowCount: number;
    selectedRowCount: number;
    numericCellCount: number;
    areaCount: number;
  } | null;
}
export function findexSelection(params: URLSearchParams, topicId: string) {
  const entry =
    findexTopics[topicId] ?? findexTopics["finance:financial_access"];
  const group =
    config.groups.find((g) => g.id === params.get("findexGroup"))?.id ??
    entry.group;
  const raw = params.get("findexMetric");
  const metric =
    raw === "overview"
      ? ""
      : (config.metrics.find((m) => m.id === raw && m.group === group)?.id ??
        "");
  const population =
    config.populations.find((p) => p.id === params.get("findexPopulation"))
      ?.id ?? "all";
  const since =
    [2011, 2017, 2021].find((y) => String(y) === params.get("findexSince")) ??
    2011;
  return { group, metric, population, since, through: 2024 };
}
export function validFindexResponse(r: AtlasFindexResponse) {
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
    r.provenance.glossarySha256 === config.glossarySha256 &&
    r.provenance.recipe === config.recipe &&
    r.provenance.url === config.sourceUrl
  );
}
export function findexValue(p: FindexPoint, m: FindexMetric) {
  const raw = p.values[m.field];
  if (typeof raw !== "string" || !/^\d+(\.\d+)?(e-?\d+)?$/.test(raw))
    return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n * 100 : null;
}
export function findexView(
  rows: AtlasFindexResponse[],
  metric: FindexMetric,
  since: number,
  population: string,
) {
  if (
    !rows.length ||
    rows.some(
      (r) =>
        !validFindexResponse(r) ||
        r.provenance?.retrievedAt !== rows[0].provenance?.retrievedAt,
    )
  )
    return null;
  const series = rows.map((r) => ({
    id: r.geography.id,
    name: r.geography.label,
    points: r
      .profile!.points.filter(
        (p) =>
          p.population === population &&
          config.years.includes(p.year) &&
          p.year >= since &&
          findexValue(p, metric) !== null,
      )
      .map((p) => ({ year: p.year, value: findexValue(p, metric)! })),
  }));
  if (series.some((s) => !s.points.length)) return null;
  const common = series[0].points
    .filter((p) => series.every((s) => s.points.some((q) => q.year === p.year)))
    .map((p) => p.year);
  if (!common.length) return null;
  return {
    populationLabel: config.populations.find((p) => p.id === population)!.label,
    first: since,
    last: 2024,
    series,
    lastCommonYear: Math.max(...common),
    min: 0,
    max: 100,
  };
}
export type FindexView = NonNullable<ReturnType<typeof findexView>>;
