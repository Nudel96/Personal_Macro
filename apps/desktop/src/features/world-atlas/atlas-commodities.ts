import config from "./data/commodity-catalog.json";

export const atlasCommodityCatalog = config;
export const atlasCommodityDataset = config.datasetId;
export type CommodityMetric = (typeof config.metrics)[number];
export type CommodityBasis = "real" | "nominal";
export const commodityTopics: Record<string, { group: string; ids: string[] }> =
  config.topics;
export interface CommodityPoint {
  year: number;
  values: Record<string, number | null>;
}
export interface AtlasCommodityResponse {
  status: "available" | "not_downloaded" | "desktop_required";
  points: CommodityPoint[];
  provenance: {
    retrievedAt: string;
    fileModifiedAt: string | null;
    url: string;
    fileUrl: string;
    sha256: string;
    release: string;
    sourceRelease: string;
    numericCellCount: number;
    missingCellCount: number;
    metricCount: number;
    recipe: string;
  } | null;
}
export function commoditySelection(params: URLSearchParams, topicId: string) {
  const entry =
    commodityTopics[topicId] ?? commodityTopics["materials:commodity_prices"];
  const explicit = config.groups.some(
    (g) => g.id === params.get("commodityGroup"),
  );
  const group = explicit ? params.get("commodityGroup")! : entry.group;
  const metrics = config.metrics.filter((m) =>
    !explicit && entry.ids.length
      ? entry.ids.includes(m.id)
      : m.group === group,
  );
  const search = (params.get("commoditySearch") ?? "").slice(0, 100);
  const filtered = metrics.filter((m) =>
    m.label.toLocaleLowerCase("de").includes(search.toLocaleLowerCase("de")),
  );
  const metric = metrics.find((m) => m.id === params.get("commodityMetric"));
  const compare = config.metrics.find(
    (m) => m.id === params.get("commodityCompare") && m.id !== metric?.id,
  );
  const since =
    [1960, 1980, 2000].find(
      (y) => String(y) === params.get("commoditySince"),
    ) ?? 1960;
  const basis: CommodityBasis =
    params.get("commodityBasis") === "nominal" ? "nominal" : "real";
  const pages = Math.max(1, Math.ceil(filtered.length / 6));
  const rawPage = Number(params.get("commodityPage"));
  const page = Number.isSafeInteger(rawPage)
    ? Math.max(1, Math.min(pages, rawPage))
    : 1;
  return {
    group,
    metric,
    compare,
    since,
    basis,
    search,
    pages,
    page,
    metrics,
    visible: filtered.slice((page - 1) * 6, page * 6),
  };
}
export function validCommodityResponse(r: AtlasCommodityResponse) {
  return (
    r.status === "available" &&
    r.provenance?.sha256 === config.sha256 &&
    r.provenance.recipe === config.recipe &&
    r.provenance.url === config.sourceUrl &&
    r.provenance.fileUrl === config.url &&
    r.provenance.sourceRelease === config.sourceRelease
  );
}
export function commodityValue(
  point: CommodityPoint,
  metric: CommodityMetric,
  basis: CommodityBasis,
) {
  const n = point.values[`${metric.id}:${basis}`];
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? n : null;
}
export function commoditySeries(
  r: AtlasCommodityResponse,
  metric: CommodityMetric,
  basis: CommodityBasis,
  since: number,
) {
  if (!validCommodityResponse(r)) return null;
  const base = r.points.find((p) => p.year === 2010);
  const reference = base ? commodityValue(base, metric, basis) : null;
  if (reference === null || reference <= 0) return null;
  const points = r.points
    .filter(
      (p) =>
        p.year >= Math.max(since, metric.firstComparableYear) &&
        p.year <= config.lastYear,
    )
    .flatMap((p) => {
      const raw = commodityValue(p, metric, basis);
      if (raw === null) return [];
      const discrepancy = config.sourceDiscrepancies.find(
        (d) => d.metric === metric.id && d.basis === basis && d.year === p.year,
      );
      return [
        {
          year: p.year,
          raw: raw / 100,
          value: (100 * raw) / reference,
          boundary: metric.boundaryYears.includes(p.year),
          discrepancy: discrepancy?.note ?? null,
        },
      ];
    })
    .sort((a, b) => a.year - b.year);
  return points.length ? { metric, points } : null;
}
export type CommoditySeries = NonNullable<ReturnType<typeof commoditySeries>>;
export function commoditySegments(points: CommoditySeries["points"]) {
  return points.flatMap((p, i) => {
    const previous = points[i - 1];
    return previous &&
      !p.boundary &&
      !previous.boundary &&
      !p.discrepancy &&
      !previous.discrepancy &&
      p.year === previous.year + 1
      ? [[previous, p]]
      : [];
  });
}
export function commodityScale(series: (CommoditySeries | null)[]) {
  return Math.max(
    110,
    ...series.flatMap((s) => s?.points.map((p) => p.value * 1.05) ?? []),
  );
}
