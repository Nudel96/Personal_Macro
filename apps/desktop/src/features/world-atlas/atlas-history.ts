import type { AtlasGeography } from "./atlas-types";

export const atlasHistoryDataset = "maddison-2023-owid";
export type HistoryMode = "gdpPerCapita" | "gdp" | "worldGdpShare";
export interface HistoryPoint {
  year: number;
  gdpPerCapita: number | null;
  gdp: number | null;
  worldGdpShare: number | null;
}
export interface AtlasHistoryResponse {
  geography: AtlasGeography;
  status:
    "available" | "not_downloaded" | "unsupported_area" | "desktop_required";
  profile: {
    geographyId: string;
    providerLabel: string;
    notes: string[];
    points: HistoryPoint[];
  } | null;
  provenance: {
    revision: string;
    retrievedAt: string;
    pages: { url: string; sha256: string }[];
    areaCount: number;
    sourceRowCount: number;
    excludedAreas: string[];
  } | null;
}
export function atlasHistoryMode(topicId: string): HistoryMode | undefined {
  return (
    {
      "long_history:long_run_prosperity": "gdpPerCapita",
      "long_history:long_run_output": "gdp",
      "structural_change:global_economic_weights": "worldGdpShare",
    } as Record<string, HistoryMode>
  )[topicId];
}
export const historyUnits: Record<HistoryMode, string> = {
  gdpPerCapita:
    "Wirtschaftsleistung je Einwohner · internationale Dollar, Preisbasis 2011",
  gdp: "Gesamte Wirtschaftsleistung · internationale Dollar, Preisbasis 2011",
  worldGdpShare: "Anteil an der veröffentlichten Weltwirtschaft (%)",
};

export function historyView(
  rows: AtlasHistoryResponse[],
  mode: HistoryMode,
  since: number,
) {
  if (
    !rows.length ||
    rows.some(
      (row) =>
        !row.profile ||
        !row.provenance ||
        row.provenance.retrievedAt !== rows[0].provenance?.retrievedAt ||
        row.provenance.revision !== rows[0].provenance?.revision,
    )
  )
    return null;
  const filtered = rows.map((row) =>
    row.profile!.points.filter(
      (p) => p.year >= since && p[mode] !== null && Number.isFinite(p[mode]),
    ),
  );
  if (filtered.some((points) => !points.length)) return null;
  const first = Math.max(
    ...filtered.map((p) => Math.min(...p.map((v) => v.year))),
  );
  const last = Math.min(
    ...filtered.map((p) => Math.max(...p.map((v) => v.year))),
  );
  if (last < first) return null;
  const years = Array.from({ length: last - first + 1 }, (_, i) => i + first);
  const values = filtered.map((points, index) => {
    const lookup = new Map(points.map((p) => [p.year, p[mode]]));
    return {
      name: rows[index].geography.label,
      values: years.map((y) => lookup.get(y) ?? null),
    };
  });
  if (!years.some((_, i) => values.every((row) => row.values[i] !== null)))
    return null;
  const sparse = values.some((row) => row.values.some((v) => v === null));
  return { first, last, years, rows: values, sparse };
}
