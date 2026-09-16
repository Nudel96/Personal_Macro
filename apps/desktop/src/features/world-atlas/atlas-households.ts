import config from "./data/households-catalog.json";
import type { AtlasGeography } from "./atlas-types";

export const atlasHouseholdsCatalog = config;
export const atlasHouseholdsDataset = config.datasetId;
export type HouseholdMetric = (typeof config.metrics)[number];
export interface HouseholdObservation {
  recordId: string;
  sourceRow: number;
  year: number;
  sourceCategory: string;
  sourceCatalogId: string;
  sourceName: string;
  unweighted: boolean;
  values: Record<string, number | null>;
}
export interface AtlasHouseholdsResponse {
  geography: AtlasGeography;
  status:
    "available" | "not_downloaded" | "unsupported_area" | "desktop_required";
  profile: {
    geographyId: string;
    providerCode: string;
    providerLabels: string[];
    observations: HouseholdObservation[];
  } | null;
  provenance: {
    retrievedAt: string;
    fileModifiedAt: string | null;
    url: string;
    sha256: string;
    release: string;
    recipe: string;
    sourceRowCount: number;
    numericCellCount: number;
    areaCount: number;
  } | null;
}
export function householdValue(
  p: HouseholdObservation,
  metric: HouseholdMetric,
) {
  const v = p.values[metric.id];
  return typeof v === "number" &&
    Number.isFinite(v) &&
    v >= 0 &&
    v <= (metric.unit === "percent" ? 100 : 30)
    ? v
    : null;
}
export const householdUnit = (metric: HouseholdMetric) =>
  metric.unit === "percent" ? "% der Haushalte" : "Menschen je Haushalt";
export const householdSourceLabel = (p: HouseholdObservation) =>
  `${p.year} · ${p.sourceCategory.length > 20 ? "Weitere UN-Quelle" : p.sourceCategory} · ${p.sourceCatalogId}${p.unweighted ? " · ungewichtet" : ""}`;
export function validHouseholdResponse(
  row: AtlasHouseholdsResponse | null | undefined,
): row is AtlasHouseholdsResponse & {
  profile: NonNullable<AtlasHouseholdsResponse["profile"]>;
} {
  return Boolean(
    row?.status === "available" &&
    row.profile &&
    row.profile.geographyId === row.geography.id &&
    config.areas.some(
      (a) =>
        a.geographyId === row.geography.id &&
        a.code === row.profile?.providerCode,
    ) &&
    row.provenance?.sha256 === config.sha256 &&
    row.provenance.recipe === config.recipe,
  );
}
/** No country-year map, averaging, interpolated years or substitution between columns. */
export function householdSelection(
  row: AtlasHouseholdsResponse | undefined,
  metric: HouseholdMetric,
  requested: string,
) {
  if (!validHouseholdResponse(row)) return null;
  const points = row.profile.observations;
  const selected = points.find((p) => p.recordId === requested);
  if (selected) return selected;
  return (
    points
      .filter((p) => householdValue(p, metric) !== null)
      .slice()
      .sort((a, b) => b.year - a.year || a.sourceRow - b.sourceRow)[0] ?? null
  );
}
export function householdView(
  rows: AtlasHouseholdsResponse[],
  metric: HouseholdMetric,
  since: number,
) {
  if (
    !rows.length ||
    rows.some(
      (r) =>
        !validHouseholdResponse(r) ||
        r.provenance?.retrievedAt !== rows[0].provenance?.retrievedAt,
    )
  )
    return null;
  const sets = rows.map((r, i) => ({
    id: r.geography.id,
    name: r.geography.label,
    index: i,
    points: r
      .profile!.observations.filter(
        (p) => p.year >= since && householdValue(p, metric) !== null,
      )
      .slice()
      .sort((a, b) => a.year - b.year || a.sourceRow - b.sourceRow),
  }));
  const points = sets.flatMap((s) => s.points);
  if (!points.length) return null;
  const first = Math.min(...points.map((p) => p.year));
  const last = Math.max(...points.map((p) => p.year));
  return {
    sets,
    first,
    last,
    min: 0,
    max:
      metric.unit === "percent"
        ? 100
        : Math.max(
            1,
            Math.ceil(
              Math.max(...points.map((p) => householdValue(p, metric)!)),
            ),
          ),
  };
}
export type HouseholdView = NonNullable<ReturnType<typeof householdView>>;
