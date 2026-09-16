import config from "./data/credit-catalog.json";
import type { AtlasGeography } from "./atlas-types";

export const atlasCreditCatalog = config;
export const atlasCreditDataset = config.datasetId;
export type CreditMode = "gap" | "ratio";
export interface CreditPoint {
  period: string;
  ratio: number | null;
  trend: number | null;
  gap: number | null;
}
export interface AtlasCreditResponse {
  geography: AtlasGeography;
  status:
    "available" | "not_downloaded" | "unsupported_area" | "desktop_required";
  profile: null | {
    geographyId: string;
    providerCode: string;
    providerLabel: string;
    points: CreditPoint[];
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
export const creditTopic = (topicId: string) =>
  config.topicIds.includes(topicId);
export const creditQuarter = (period: string) =>
  /^\d{4}-Q[1-4]$/.test(period)
    ? Number(period.slice(0, 4)) * 4 + Number(period.slice(-1)) - 1
    : NaN;
export function creditView(
  rows: AtlasCreditResponse[],
  mode: CreditMode,
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
        Number.isFinite(creditQuarter(p.period)) &&
        creditQuarter(p.period) >= since * 4,
    ),
  );
  if (
    points.some(
      (set) => !set.some((p) => p[mode] != null && Number.isFinite(p[mode])),
    )
  )
    return null;
  const all = points.flatMap((set) =>
    set.filter((p) => p[mode] != null && Number.isFinite(p[mode])),
  );
  const start = Math.min(...all.map((p) => creditQuarter(p.period)));
  const end = Math.max(...all.map((p) => creditQuarter(p.period)));
  const quarters = Array.from({ length: end - start + 1 }, (_, i) => start + i);
  const periods = quarters.map((q) => `${Math.floor(q / 4)}-Q${(q % 4) + 1}`);
  const series = rows.flatMap((row, index) => {
    const lookup = new Map(points[index].map((p) => [p.period, p]));
    return (
      mode === "gap" ? (["gap"] as const) : (["ratio", "trend"] as const)
    ).map((key) => ({
      name: `${row.geography.label}${key === "trend" ? " · Trend" : ""}`,
      area: index,
      trend: key === "trend",
      values: periods.map((period) => {
        const value = lookup.get(period)?.[key];
        return value != null && Number.isFinite(value) ? value : null;
      }),
    }));
  });
  const limit = Math.max(
    1,
    ...series.flatMap((s) =>
      s.values.filter((v): v is number => v != null).map(Math.abs),
    ),
  );
  return { periods, series, limit };
}
