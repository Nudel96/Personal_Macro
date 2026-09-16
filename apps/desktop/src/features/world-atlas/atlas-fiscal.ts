import config from "./data/fiscal-catalog.json";
import type { AtlasGeography } from "./atlas-types";

export const atlasFiscalCatalog = config;
export const atlasFiscalDataset = config.datasetId;
export const atlasFiscalTopic = "institutions:public_finances";
export type FiscalMetric = (typeof config.metrics)[number];
export interface FiscalPoint {
  year: number;
  budgetScope: 0 | 1;
  debtScope: 0 | 1;
  values: Record<string, number | null>;
}
export interface AtlasFiscalResponse {
  geography: AtlasGeography;
  status:
    "available" | "not_downloaded" | "unsupported_area" | "desktop_required";
  profile: {
    geographyId: string;
    providerCode: string;
    providerLabels: string[];
    points: FiscalPoint[];
  } | null;
  provenance: {
    retrievedAt: string;
    fileModifiedAt: string | null;
    url: string;
    originalUrl: string;
    sha256: string;
    release: string;
    recipe: string;
    sourceRowCount: number;
    numericCellCount: number;
    areaCount: number;
  } | null;
}
export function fiscalScope(point: FiscalPoint, metric: FiscalMetric) {
  return metric.scopeField === "GG_budg"
    ? point.budgetScope
    : metric.scopeField === "GG_debt"
      ? point.debtScope
      : null;
}
export const fiscalScopeLabel = (scope: number | null) =>
  scope === 0
    ? "Zentralregierung"
    : scope === 1
      ? "Gesamtstaat"
      : "Wirtschaftlicher Kontext";
export function fiscalView(
  rows: AtlasFiscalResponse[],
  metric: FiscalMetric,
  since: number,
) {
  if (
    !rows.length ||
    rows.some(
      (r) =>
        !r.profile ||
        r.status !== "available" ||
        r.profile.geographyId !== r.geography.id ||
        !config.areas.some(
          (a) =>
            a.geographyId === r.geography.id &&
            a.code === r.profile?.providerCode,
        ) ||
        r.provenance?.sha256 !== config.sha256 ||
        r.provenance.recipe !== config.recipe ||
        r.provenance.retrievedAt !== rows[0].provenance?.retrievedAt,
    )
  )
    return null;
  const value = (p: FiscalPoint) => {
    const n = p.values[metric.field];
    return typeof n === "number" && Number.isFinite(n) ? n : null;
  };
  const available = rows.map((r) =>
    r.profile!.points.filter((p) => p.year >= since && value(p) !== null),
  );
  if (available.some((p) => !p.length)) return null;
  const first = Math.max(...available.map((p) => p[0].year));
  const last = Math.min(...available.map((p) => p[p.length - 1].year));
  if (last < first) return null;
  const years = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const lines = rows.map((r) => {
    const points = new Map(r.profile!.points.map((p) => [p.year, p]));
    return {
      name: r.geography.label,
      id: r.geography.id,
      code: r.profile!.providerCode,
      values: years.map((y) => (points.has(y) ? value(points.get(y)!) : null)),
      scopes: years.map((y) =>
        points.has(y) ? fiscalScope(points.get(y)!, metric) : null,
      ),
      breaks: years.map((y) =>
        config.breaks.some(
          (b) =>
            b.code === r.profile!.providerCode &&
            b.year === y &&
            b.fields.includes(metric.field),
        ),
      ),
    };
  });
  let excludedScopeYears = 0;
  if (metric.scopeField && lines.length > 1)
    years.forEach((_, i) => {
      if (
        lines.every((l) => l.values[i] !== null) &&
        lines.some((l) => l.scopes[i] !== lines[0].scopes[i])
      ) {
        lines.forEach((l) => {
          l.values[i] = null;
        });
        excludedScopeYears++;
      }
    });
  const common = years
    .map((_, i) => i)
    .filter((i) => lines.every((l) => l.values[i] !== null));
  if (!common.length) return null;
  const numbers = lines.flatMap((l) =>
    l.values.filter((v): v is number => v !== null),
  );
  const signed =
    metric.field === "pb" || metric.field === "rltir" || metric.field === "rgc";
  const extent = Math.max(...numbers.map(Math.abs), 1e-9);
  return {
    first,
    last,
    years,
    lines,
    excludedScopeYears,
    lastCommonIndex: common[common.length - 1],
    min: signed ? -extent : 0,
    max: extent,
  };
}
export type FiscalView = NonNullable<ReturnType<typeof fiscalView>>;
/** Retain every endpoint while separating missing years, coverage changes and known definition breaks. */
export function fiscalSegments(
  view: FiscalView,
  line: FiscalView["lines"][number],
) {
  const segments: {
    index: number;
    year: number;
    value: number;
    scope: number | null;
  }[][] = [];
  let segment: (typeof segments)[number] = [];
  line.values.forEach((v, i) => {
    const cut =
      v === null ||
      line.breaks[i] ||
      (i > 0 && line.scopes[i] !== line.scopes[i - 1]);
    if (cut && segment.length) {
      segments.push(segment);
      segment = [];
    }
    if (v !== null)
      segment.push({
        index: i,
        year: view.years[i],
        value: v,
        scope: line.scopes[i],
      });
  });
  if (segment.length) segments.push(segment);
  return segments;
}
