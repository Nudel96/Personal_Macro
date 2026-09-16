import config from "./data/public-series-catalog.json";
import type { AtlasGeography } from "./atlas-types";

export interface PublicSource {
  id: string;
  label: string;
  adapter: string;
  url: string;
  documentationUrl: string;
  licenseUrl: string;
  publishedAt: string;
  reviewedAt: string;
  recipe: string;
  observationKind: string;
  expectedSha256: string;
  expectedRows: number;
  expectedNumeric: number;
  firstPeriod: string;
  lastPeriod: string;
  areas: {
    code: string;
    label: string;
    geographyId: string;
    seriesTitles: Record<string, string | undefined>;
  }[];
}
export interface PublicMetric {
  id: string;
  sourceId: string;
  topicId: string;
  providerCode: string;
  label: string;
  unit: string;
  frequency: string;
  kind: string;
  comparison: string;
  connectAdjacent: boolean;
  explanation: string;
  scopeNote: string;
}
export interface PublicPoint {
  period: string;
  value: string | null;
  status: string;
  breakBefore: boolean;
  notes: string[];
  lowerBound: string | null;
  upperBound: string | null;
}
export interface PublicProfile {
  metricId: string;
  geographyId: string;
  providerArea: string;
  providerLabel: string;
  providerTitle: string;
  unit: string;
  points: PublicPoint[];
}
export interface AtlasPublicResponse {
  source: PublicSource;
  geography: AtlasGeography;
  metrics: PublicMetric[];
  profiles: PublicProfile[];
  status:
    | "available"
    | "empty"
    | "not_downloaded"
    | "unsupported_area"
    | "desktop_required";
  provenance: {
    sourceId: string;
    retrievedAt: string;
    publishedAt: string;
    url: string;
    documentationUrl: string;
    sha256: string;
    recipe: string;
    sourceRows: number;
    numericValues: number;
    areaCount: number;
  } | null;
}
export const atlasPublicCatalog: {
  version: string;
  sources: PublicSource[];
  metrics: PublicMetric[];
} = config;
export const publicMetrics = (topicId: string) =>
  atlasPublicCatalog.metrics.filter((m) => m.topicId === topicId);
export const publicHorizons = [0, 1980, 1990, 2000, 2010, 2020];
export function publicSelection(
  params: URLSearchParams,
  topicId: string,
  geographyId?: string,
) {
  const all = publicMetrics(topicId);
  const chosen = all.find((m) => m.id === params.get("publicMetric"));
  const source =
    atlasPublicCatalog.sources.find(
      (s) =>
        s.id === (chosen?.sourceId ?? params.get("publicSource")) &&
        all.some((m) => m.sourceId === s.id),
    ) ??
    (!params.has("publicSource") && !params.has("publicMetric") && geographyId
      ? atlasPublicCatalog.sources.find(
          (s) =>
            all.some((m) => m.sourceId === s.id) &&
            s.areas.some(
              (a) =>
                a.geographyId === geographyId &&
                all.some(
                  (m) => m.sourceId === s.id && a.seriesTitles[m.providerCode],
                ),
            ),
        )
      : undefined) ??
    atlasPublicCatalog.sources.find((s) => s.id === all[0]?.sourceId);
  let metrics = all.filter((m) => m.sourceId === source?.id);
  let metric = chosen ?? metrics[0];
  if (
    (source?.adapter === "epo_embedded" ||
      source?.adapter === "aci_trilemma" ||
      source?.adapter === "sasol_synfuels") &&
    geographyId &&
    !chosen
  ) {
    const area = source.areas.find((a) => a.geographyId === geographyId);
    metric = metrics.find((m) => area?.seriesTitles[m.providerCode]) ?? metric;
  }
  if (source?.id === "bis-commercial-property" && geographyId) {
    const area = source.areas.find((a) => a.geographyId === geographyId);
    const local = metrics.filter((m) => area?.seriesTitles[m.providerCode]);
    if (chosen) {
      metric =
        local.find((m) => m.id === chosen.id) ??
        local.find(
          (m) =>
            m.providerCode.split(".")[3] === chosen.providerCode.split(".")[3],
        ) ??
        chosen;
    } else metric = local[0] ?? metric;
    // An unavailable requested building type stays empty; other local types
    // are choices, never a silent substitute for the missing perspective.
    metrics = local.some((m) => m.id === metric.id)
      ? local
      : [metric, ...local];
  }
  const since =
    publicHorizons.find((y) => String(y) === params.get("publicSince")) ?? 0;
  return { source, metrics, metric, since };
}

export function publicComparisonSelection(
  params: URLSearchParams,
  primary: PublicMetric,
  geographyId: string,
) {
  const source = atlasPublicCatalog.sources.find(
    (s) => s.id === primary.sourceId,
  );
  const area = source?.areas.find((a) => a.geographyId === geographyId);
  const metrics = atlasPublicCatalog.metrics.filter(
    (m) =>
      m.sourceId === primary.sourceId && area?.seriesTitles[m.providerCode],
  );
  const selected = metrics.find(
    (m) => m.id === params.get("publicCompareMetric"),
  );
  const metric =
    primary.sourceId === "bis-commercial-property"
      ? (selected ??
        metrics.find(
          (m) =>
            m.providerCode.split(".")[3] === primary.providerCode.split(".")[3],
        ))
      : metrics.find((m) => m.id === primary.id);
  return { metric, metrics };
}

/** Calendar coordinates retain actual quarters/months; never turn them into invented annual means. */
export function publicPeriod(period: string, frequency: string): number | null {
  const year = Number(period.slice(0, 4));
  if (!/^\d{4}/.test(period) || year < 1600 || year > 2200) return null;
  if (frequency === "annual" || frequency === "fiscal_annual_june")
    return /^\d{4}$/.test(period) ? year : null;
  if (frequency === "period_total") {
    const end = Number(period.slice(5));
    return /^\d{4}\/\d{4}$/.test(period) && end >= year && end <= 2200
      ? year
      : null;
  }
  if (frequency === "half_yearly")
    return /^\d{4}-S[12]$/.test(period)
      ? year + (Number(period[6]) - 1) / 2
      : null;
  if (frequency === "quarterly")
    return /^\d{4}-Q[1-4]$/.test(period)
      ? year + (Number(period[6]) - 1) / 4
      : null;
  if (frequency === "monthly")
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(period)
      ? year + (Number(period.slice(5)) - 1) / 12
      : null;
  if (frequency !== "irregular" || !/^\d{4}-\d{2}-\d{2}$/.test(period))
    return null;
  const date = new Date(`${period}T00:00:00Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== period
  )
    return null;
  return (
    year +
    (date.getTime() - Date.UTC(year, 0)) /
      (Date.UTC(year + 1, 0) - Date.UTC(year, 0))
  );
}
export function publicValue(raw: string | null): number | null {
  if (raw === null || !/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
export function publicRegimeLabel(metric: PublicMetric, value: number) {
  if (metric.kind !== "binary_regime" || (value !== 0 && value !== 1))
    return null;
  return metric.providerCode === "peg_strict"
    ? value === 1
      ? "Strenge Bindung"
      : "Ohne strenge Bindung"
    : value === 1
      ? "Gebunden"
      : "Nicht gebunden";
}
export function validPublicResponse(row: AtlasPublicResponse) {
  const source = atlasPublicCatalog.sources.find((s) => s.id === row.source.id);
  return Boolean(
    source &&
    row.status === "available" &&
    row.provenance?.sourceId === source.id &&
    row.provenance.sha256 === source.expectedSha256 &&
    row.provenance.recipe === source.recipe &&
    row.provenance.url === source.url &&
    source.areas.some((a) => a.geographyId === row.geography.id),
  );
}
export function publicProfile(row: AtlasPublicResponse, metric: PublicMetric) {
  if (!validPublicResponse(row) || row.source.id !== metric.sourceId)
    return null;
  const area = atlasPublicCatalog.sources
    .find((s) => s.id === metric.sourceId)
    ?.areas.find((a) => a.geographyId === row.geography.id);
  return (
    row.profiles.find(
      (p) =>
        p.metricId === metric.id &&
        p.geographyId === row.geography.id &&
        p.providerArea === area?.code &&
        p.providerLabel === area.label &&
        p.providerTitle === area.seriesTitles[metric.providerCode] &&
        p.unit === metric.unit,
    ) ?? null
  );
}
export function publicPicture(
  row: AtlasPublicResponse,
  metric: PublicMetric,
  since: number,
) {
  const profile = publicProfile(row, metric);
  if (!profile) return null;
  const projection = metric.kind === "projection_snapshot";
  const periodSnapshot = metric.kind === "period_snapshot";
  if (
    periodSnapshot &&
    (profile.points.length !== 1 ||
      profile.points[0].period !==
        `${row.source.firstPeriod}/${row.source.lastPeriod}`)
  )
    return null;
  if (
    projection &&
    (profile.points.length !== 1 ||
      profile.points[0].period !== row.source.lastPeriod)
  )
    return null;
  const points = profile.points
    .map((p) => ({
      ...p,
      time: publicPeriod(p.period, metric.frequency),
      n: publicValue(p.value),
    }))
    .filter(
      (p): p is typeof p & { time: number } =>
        p.time !== null && (projection || periodSnapshot || p.time >= since),
    );
  // A corrupt or unsorted local series is never silently reordered or blended.
  if (points.some((p, i) => i > 0 && points[i - 1].time >= p.time)) return null;
  const observed = points.filter(
    (p): p is typeof p & { n: number } => p.n !== null,
  );
  if (!observed.length) return null;
  const step =
    metric.frequency === "quarterly"
      ? 0.25
      : metric.frequency === "half_yearly"
        ? 0.5
        : metric.frequency === "monthly"
          ? 1 / 12
          : metric.frequency === "annual" ||
              metric.frequency === "fiscal_annual_june"
            ? 1
            : null;
  const segments: (typeof observed)[] = [];
  for (const p of points) {
    if (p.n === null) continue;
    const segment = segments[segments.length - 1];
    const last = segment?.[segment.length - 1];
    const adjacent =
      last && step !== null && Math.abs(p.time - last.time - step) < 1e-7;
    if (metric.connectAdjacent && adjacent && !p.breakBefore)
      segments[segments.length - 1].push({ ...p, n: p.n });
    else segments.push([{ ...p, n: p.n }]);
  }
  const allValues = observed.flatMap((p) =>
    [p.n, publicValue(p.lowerBound), publicValue(p.upperBound)].filter(
      (n): n is number => n !== null,
    ),
  );
  let min = Math.min(...allValues),
    max = Math.max(...allValues);
  const padding = Math.max((max - min) * 0.08, Math.abs(max) * 0.01, 0.1);
  min -= padding;
  max += padding;
  if (metric.kind === "binary_regime") {
    if (allValues.some((n) => publicRegimeLabel(metric, n) === null))
      return null;
    min = 0;
    max = 1;
  }
  if (metric.sourceId === "eu-advanced-materials") {
    const count = metric.providerCode.endsWith("_count");
    min = 0;
    max = count ? 200000 : 100;
    if (
      allValues.some((n) => n < 0 || n > max || (count && !Number.isInteger(n)))
    )
      return null;
  }
  if (metric.sourceId === "sasol-synthetic-fuels") {
    const utilisation = metric.providerCode === "oryx_utilisation";
    if (allValues.some((n) => n < 0 || n > (utilisation ? 150 : 100)))
      return null;
    min = 0;
    if (utilisation) max = Math.max(100, max);
  }
  if (row.source.adapter === "epo_embedded") {
    if (allValues.some((n) => n < 0 || !Number.isInteger(n))) return null;
    min = 0;
    // Three count ticks stay distinct even for a single patent. An even upper
    // bound also keeps the middle tick an actual integer count.
    max = Math.max(2, Math.ceil(max / 2) * 2);
  }
  if (
    metric.sourceId === "worldbank-wgi" ||
    metric.sourceId === "worldbank-gfdd-concentration" ||
    metric.sourceId === "eurostat-district-heating" ||
    metric.sourceId.startsWith("oecd-tiva-")
  ) {
    if (Math.min(...allValues) < 0 || Math.max(...allValues) > 100) return null;
    min = 0;
    max = 100;
  }
  if (
    metric.sourceId === "wits-export-concentration" ||
    metric.sourceId === "aci-trilemma" ||
    metric.sourceId === "ndgain-climate"
  ) {
    if (Math.min(...allValues) < 0 || Math.max(...allValues) > 1) return null;
    min = 0;
    max = 1;
  }
  return {
    points: observed,
    missingPeriods: points.filter((p) => p.n === null).map((p) => p.period),
    segments,
    min,
    max,
    first: observed[0].time,
    last: observed[observed.length - 1].time,
    profile,
  };
}
export type PublicPicture = NonNullable<ReturnType<typeof publicPicture>>;

/** Partner bars use one actual source year; never rank different latest years together. */
export function publicPartnerOverview(row: AtlasPublicResponse, since: number) {
  if (row.source.id !== "oecd-tiva-partners" || !validPublicResponse(row))
    return null;
  const entries = atlasPublicCatalog.metrics
    .filter((m) => m.sourceId === row.source.id)
    .flatMap((metric) => {
      const picture = publicPicture(row, metric, since);
      return picture ? [{ metric, picture }] : [];
    });
  const years = entries.map(({ picture }) => picture.last);
  if (!years.length) return null;
  const year = Math.max(...years);
  const rows = entries
    .flatMap(({ metric, picture }) => {
      const point = picture.points.find((p) => p.time === year);
      return point ? [{ metric, value: point.n }] : [];
    })
    .sort(
      (a, b) =>
        b.value - a.value || a.metric.label.localeCompare(b.metric.label, "de"),
    );
  return {
    period: String(year),
    rows: rows.slice(0, 6),
    available: rows.length,
  };
}
