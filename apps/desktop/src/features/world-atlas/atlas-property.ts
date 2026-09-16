import config from "./data/property-catalog.json";
import type { AtlasGeography } from "./atlas-types";

export const atlasPropertyCatalog = config;
export const atlasPropertyDataset = config.datasetId;
export type PropertyBasis = "real" | "nominal";
export type PropertyMode = "index" | "change";
export type PropertyMetric = PropertyBasis | "realChange" | "nominalChange";
export interface PropertyPoint {
  period: string;
  real: number | null;
  nominal: number | null;
  realChange: number | null;
  nominalChange: number | null;
}
export interface AtlasPropertyResponse {
  geography: AtlasGeography;
  status:
    "available" | "not_downloaded" | "unsupported_area" | "desktop_required";
  profile: null | {
    geographyId: string;
    providerCode: string;
    providerLabel: string;
    points: PropertyPoint[];
  };
  provenance: null | {
    retrievedAt: string;
    fileModifiedAt: string | null;
    url: string;
    sha256: string;
    sourceRowCount: number;
    numericCellCount: number;
    areaCount: number;
    recipe: string;
  };
}
export const propertyTopic = (topicId: string) =>
  config.topicIds.includes(topicId);
export const propertyMetric = (
  basis: PropertyBasis,
  mode: PropertyMode,
): PropertyMetric => (mode === "index" ? basis : `${basis}Change`);
export const propertyQuarter = (period: string) =>
  /^\d{4}-Q[1-4]$/.test(period)
    ? Number(period.slice(0, 4)) * 4 + Number(period.slice(-1)) - 1
    : NaN;

export function propertyView(
  rows: AtlasPropertyResponse[],
  metric: PropertyMetric,
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
        row.provenance?.recipe !== first.recipe,
    )
  )
    return null;
  const points = rows.map((row) =>
    row.profile!.points.filter(
      (p) =>
        Number.isFinite(propertyQuarter(p.period)) &&
        propertyQuarter(p.period) >= since * 4,
    ),
  );
  const numeric = points.map((set) =>
    set.filter((p) => p[metric] != null && Number.isFinite(p[metric])),
  );
  if (numeric.some((set) => !set.length)) return null;
  if (
    numeric.length > 1 &&
    !numeric[0].some((p) => numeric[1].some((q) => q.period === p.period))
  )
    return null;
  const quarters = numeric.flatMap((set) =>
    set.map((p) => propertyQuarter(p.period)),
  );
  const start = Math.min(...quarters),
    end = Math.max(...quarters);
  const periods = Array.from({ length: end - start + 1 }, (_, i) => {
    const q = start + i;
    return `${Math.floor(q / 4)}-Q${(q % 4) + 1}`;
  });
  const series = rows.map((row, index) => {
    const lookup = new Map(points[index].map((p) => [p.period, p]));
    return {
      name: row.geography.label,
      area: index,
      first: numeric[index][0].period,
      last: numeric[index][numeric[index].length - 1].period,
      values: periods.map((period) => {
        const v = lookup.get(period)?.[metric];
        return v != null && Number.isFinite(v) ? v : null;
      }),
    };
  });
  const values = series.flatMap((s) =>
    s.values.filter((v): v is number => v != null),
  );
  return {
    periods,
    series,
    limit: Math.max(1, ...values.map(Math.abs)),
    minimum: Math.min(...values),
  };
}
