import config from "./data/housing-ratios-catalog.json";
import type { AtlasGeography } from "./atlas-types";
import { propertyQuarter } from "./atlas-property";

export const atlasHousingRatiosCatalog = config;
export const atlasHousingRatiosDataset = config.datasetId;
export type HousingRatioBasis = "income" | "rent";
export type HousingRatioMode = "relative" | "index";
export type HousingRatioMetric =
  HousingRatioBasis | "incomeRelative" | "rentRelative";
export interface HousingRatioPoint {
  period: string;
  income: number | null;
  rent: number | null;
  incomeRelative: number | null;
  rentRelative: number | null;
}
export interface AtlasHousingRatiosResponse {
  geography: AtlasGeography;
  status:
    "available" | "not_downloaded" | "unsupported_area" | "desktop_required";
  profile: null | {
    geographyId: string;
    providerCode: string;
    providerLabel: string;
    points: HousingRatioPoint[];
    comparabilityBreaks: { basis: HousingRatioBasis; period: string }[];
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
export const housingRatiosTopic = (id: string) => config.topicIds.includes(id);
export const housingRatioDefaultBasis = (id: string): HousingRatioBasis =>
  id === "housing:price_rent" ? "rent" : "income";
export const housingRatioMetric = (
  basis: HousingRatioBasis,
  mode: HousingRatioMode,
): HousingRatioMetric => (mode === "index" ? basis : `${basis}Relative`);

export function housingRatiosView(
  rows: AtlasHousingRatiosResponse[],
  basis: HousingRatioBasis,
  mode: HousingRatioMode,
  since: number,
) {
  const source = rows[0]?.provenance;
  if (
    !source ||
    rows.some(
      (r) =>
        r.status !== "available" ||
        !r.profile ||
        r.profile.geographyId !== r.geography.id ||
        r.provenance?.sha256 !== source.sha256 ||
        r.provenance?.recipe !== source.recipe ||
        r.provenance?.retrievedAt !== source.retrievedAt,
    )
  )
    return null;
  const metric = housingRatioMetric(basis, mode);
  const sets = rows.map((r) =>
    r
      .profile!.points.filter(
        (p) =>
          Number.isFinite(propertyQuarter(p.period)) &&
          propertyQuarter(p.period) >= since * 4,
      )
      .sort((a, b) => a.period.localeCompare(b.period)),
  );
  const numeric = sets.map((s) =>
    s.filter(
      (p) => p[metric] != null && Number.isFinite(p[metric]) && p[metric]! > 0,
    ),
  );
  if (
    numeric.some((s) => !s.length) ||
    (numeric.length > 1 &&
      !numeric[0].some((p) => numeric[1].some((q) => p.period === q.period)))
  )
    return null;
  const quarters = numeric.flatMap((s) =>
    s.map((p) => propertyQuarter(p.period)),
  );
  const start = Math.min(...quarters),
    end = Math.max(...quarters);
  const periods = Array.from(
    { length: end - start + 1 },
    (_, i) => `${Math.floor((start + i) / 4)}-Q${((start + i) % 4) + 1}`,
  );
  const series = rows.map((r, area) => {
    const lookup = new Map(sets[area].map((p) => [p.period, p[metric]]));
    const sourceValues = periods.map((p) => {
      const v = lookup.get(p);
      return v != null && Number.isFinite(v) && v > 0 ? v : null;
    });
    const values = sourceValues.map((v) =>
      v == null ? null : mode === "relative" ? v - 100 : v,
    );
    const breaks = r
      .profile!.comparabilityBreaks.filter(
        (b) =>
          b.basis === basis &&
          propertyQuarter(b.period) > start &&
          propertyQuarter(b.period) <= end,
      )
      .map((b) => b.period);
    const cuts = [
      0,
      ...breaks.map((p) => periods.indexOf(p)).filter((i) => i > 0),
      periods.length,
    ].sort((a, b) => a - b);
    const segments = cuts
      .slice(0, -1)
      .map((from, i) =>
        values.map((v, j) => (j >= from && j < cuts[i + 1] ? v : null)),
      );
    return {
      name: r.geography.label,
      area,
      first: numeric[area][0].period,
      last: numeric[area][numeric[area].length - 1].period,
      values,
      sourceValues,
      segments,
      breaks,
    };
  });
  const values = series.flatMap((s) =>
    s.values.filter((v): v is number => v != null),
  );
  return { periods, series, limit: Math.max(1, ...values.map(Math.abs)) };
}
