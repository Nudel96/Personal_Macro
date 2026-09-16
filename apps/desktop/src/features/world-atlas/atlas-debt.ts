import config from "./data/debt-catalog.json";
import type { AtlasGeography } from "./atlas-types";
import { creditQuarter } from "./atlas-credit";

export const atlasDebtCatalog = config;
export const atlasDebtDataset = config.datasetId;
export type DebtSector = "households" | "corporations";
export type DebtMode = "level" | "change";
export interface DebtPoint {
  period: string;
  households: number | null;
  corporations: number | null;
  householdsBreak: boolean;
  corporationsBreak: boolean;
  householdsPreBreak: string;
  corporationsPreBreak: string;
}
export interface AtlasDebtResponse {
  geography: AtlasGeography;
  status:
    "available" | "not_downloaded" | "unsupported_area" | "desktop_required";
  profile: null | {
    geographyId: string;
    providerCode: string;
    providerLabel: string;
    decimals: number;
    points: DebtPoint[];
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
export function debtTopic(topicId: string): DebtSector | undefined {
  if (topicId === "finance:household_debt") return "households";
  if (topicId === "finance:corporate_debt") return "corporations";
}
export const debtTitle = (sector: DebtSector) =>
  sector === "households"
    ? "Schulden der Haushalte"
    : "Schulden der Unternehmen";
export function validDebtResponse(
  row: AtlasDebtResponse | undefined,
): row is AtlasDebtResponse & {
  profile: NonNullable<AtlasDebtResponse["profile"]>;
  provenance: NonNullable<AtlasDebtResponse["provenance"]>;
} {
  const area = config.areas.find((a) => a.geographyId === row?.geography.id);
  return Boolean(
    row?.status === "available" &&
    area &&
    row.profile?.geographyId === area.geographyId &&
    row.profile.providerCode === area.code &&
    row.profile.providerLabel === area.label &&
    row.profile.decimals === area.decimals &&
    row.provenance?.recipe === config.recipe &&
    row.provenance.url === config.url &&
    /^[a-f0-9]{64}$/.test(row.provenance.sha256) &&
    Number.isFinite(Date.parse(row.provenance.retrievedAt)),
  );
}
export function debtPoints(
  row: AtlasDebtResponse,
  sector: DebtSector,
  mode: DebtMode,
) {
  if (!validDebtResponse(row)) return [];
  const lookup = new Map(
    row.profile.points.map((p) => [creditQuarter(p.period), p]),
  );
  return row.profile.points
    .flatMap((p) => {
      const q = creditQuarter(p.period);
      if (!Number.isFinite(q)) return [];
      const current = p[sector];
      const broken = p[`${sector}Break`];
      let value =
        current != null && Number.isFinite(current) && current >= 0
          ? current
          : null;
      if (mode === "change") {
        const earlier = lookup.get(q - 4)?.[sector];
        const continuous = Array.from({ length: 5 }, (_, i) =>
          lookup.get(q - i),
        ).every(
          (point, i) =>
            point &&
            point[sector] != null &&
            Number.isFinite(point[sector]) &&
            (point[sector] ?? -1) >= 0 &&
            (i === 4 || !point[`${sector}Break`]),
        );
        value =
          value != null && earlier != null && continuous
            ? Number((value - earlier).toFixed(row.profile.decimals))
            : null;
      }
      return [{ period: p.period, q, value, broken }];
    })
    .sort((a, b) => a.q - b.q);
}
export function debtView(
  rows: AtlasDebtResponse[],
  sector: DebtSector,
  mode: DebtMode,
  since: number,
) {
  const first = rows[0];
  if (
    !validDebtResponse(first) ||
    rows.some(
      (row) =>
        !validDebtResponse(row) ||
        row.provenance?.sha256 !== first.provenance.sha256 ||
        row.provenance?.retrievedAt !== first.provenance.retrievedAt,
    )
  )
    return null;
  const series = rows.map((row) => ({
    geography: row.geography,
    points: debtPoints(row, sector, mode).filter((p) => p.q >= since * 4),
  }));
  if (series.some((s) => !s.points.some((p) => p.value != null))) return null;
  const values = series.flatMap((s) => s.points.filter((p) => p.value != null));
  const start = Math.min(...values.map((p) => p.q));
  const end = Math.max(...values.map((p) => p.q));
  const limit = Math.max(1, ...values.map((p) => Math.abs(p.value!))) * 1.1;
  const common =
    series.length === 2
      ? series[0].points
          .filter(
            (p) =>
              p.value != null &&
              series[1].points.some((c) => c.q === p.q && c.value != null),
          )
          .map((p) => p.period)
      : [];
  return { series, start, end, limit, common };
}
export function debtSegments(points: ReturnType<typeof debtPoints>) {
  const segments: (typeof points)[] = [];
  let current: typeof points = [];
  for (const point of points) {
    if (
      point.value == null ||
      point.broken ||
      (current.length && point.q - current[current.length - 1].q !== 1)
    ) {
      if (current.length) segments.push(current);
      current = [];
    }
    if (point.value != null) current.push(point);
  }
  if (current.length) segments.push(current);
  return segments;
}
export const debtCountryNote = (code: string) =>
  (
    ({
      DE: "Die deutschen Teilreihen bis 1990 sind nachträgliche Näherungen. Ab 1991 beruhen sie auf vierteljährlichen Finanzierungsrechnungen; Wiedervereinigung und Methodenwechsel beeinflussen die Vorgeschichte.",
      IN: "Indiens frühe Teilreihen verwenden bis 2011 überwiegend Bankkredite. Ab Ende 2011 bilden jährliche Finanzierungsrechnungen die Grundlage; Quartale und noch nicht vorliegende Randwerte werden von der Quelle geschätzt.",
      US: "US-Schuldverschreibungen sind in dieser Quelle zum Nennwert erfasst. Dadurch entspricht ihre Bewertung nicht vollständig den Marktwertkonventionen anderer Länder.",
    }) as Record<string, string>
  )[code];
