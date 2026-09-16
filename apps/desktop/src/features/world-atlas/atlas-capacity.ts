import config from "./data/capacity-catalog.json";
import type { AtlasEnergyResponse } from "./atlas-energy";
export const atlasCapacityCatalog = config;
export const atlasCapacityDataset = config.datasetId;
export interface AtlasCapacityResponse extends Omit<
  AtlasEnergyResponse,
  "provenance"
> {
  provenance: null | {
    retrievedAt: string;
    sourceUpdatedAt: string;
    sourceLabel: string;
    files: {
      url: string;
      sha256: string;
      table: string;
      areaCodes: string[];
    }[];
    sourceCellCount: number;
    numericCellCount: number;
    areaCount: number;
    omittedCountryCodes: string[];
  };
}
export function capacityTechnologies(topicId: string) {
  return config.technologies.filter((t) => t.topicId === topicId);
}
export type CapacityGrid = "ongrid" | "offgrid";
export function capacityView(
  rows: AtlasCapacityResponse[],
  technology: string,
  grid: CapacityGrid,
  since: number,
) {
  const first = rows[0]?.provenance;
  if (
    !first ||
    !rows.length ||
    rows.some(
      (row) =>
        row.status !== "available" ||
        !row.profile ||
        row.profile.geographyId !== row.geography.id ||
        row.provenance?.retrievedAt !== first.retrievedAt ||
        JSON.stringify(row.provenance?.files) !== JSON.stringify(first.files),
    )
  )
    return null;
  const key = `${technology}.${grid}`;
  const points = rows.map((row) =>
    row.profile!.years.filter(
      (p) =>
        p.year >= since &&
        p.values[key] != null &&
        Number.isFinite(p.values[key]) &&
        p.values[key]! >= 0,
    ),
  );
  if (points.some((p) => !p.length)) return null;
  const start = Math.min(...points.flatMap((p) => p.map((p) => p.year)));
  const end = Math.max(...points.flatMap((p) => p.map((p) => p.year)));
  const years = Array.from({ length: end - start + 1 }, (_, i) => i + start);
  return {
    years,
    rows: rows.map((row, i) => ({
      name: row.geography.label,
      values: years.map(
        (year) => points[i].find((p) => p.year === year)?.values[key] ?? null,
      ),
    })),
  };
}
