import catalog from "./data/education-catalog.json";
import type { AtlasGeography } from "./atlas-types";
export const atlasEducationCatalog = catalog;
export const atlasEducationDataset = "uis-education";
export type EducationMetric = (typeof catalog.metrics)[number];
export interface EducationPoint {
  year: number;
  value: number | null;
  magnitude: string;
  qualifier: string;
  notes: { kind: string; text: string }[];
}
export interface AtlasEducationResponse {
  geography: AtlasGeography;
  status:
    | "available"
    | "empty"
    | "not_downloaded"
    | "unsupported_area"
    | "desktop_required";
  profile: {
    geographyId: string;
    providerCode: string;
    series: Record<string, EducationPoint[]>;
  } | null;
  provenance: {
    retrievedAt: string;
    fileModifiedAt: string | null;
    url: string;
    sha256: string;
    release: string;
    sourceRowCount: number;
    numericCellCount: number;
    metadataCount: number;
    areaCount: number;
    recipe: string;
  } | null;
}
export const educationMetrics = (topic: string) =>
  catalog.metrics.filter((m) => m.topicId === topic);
export const educationPoints = (
  data: AtlasEducationResponse | undefined,
  code: string,
  since = 0,
) => (data?.profile?.series[code] ?? []).filter((p) => p.year >= since);
export function educationView(
  data: AtlasEducationResponse[],
  metric: EducationMetric,
  since = 0,
) {
  if (!data.length || data.length > 2 || !data[0].provenance) return null;
  if (
    data.some(
      (d) =>
        !d.provenance ||
        d.provenance.sha256 !== data[0].provenance!.sha256 ||
        d.provenance.recipe !== data[0].provenance!.recipe,
    )
  )
    return null;
  // Different assessments are not automatically comparable; retain the selected
  // comparison in the URL, but do not draw a country overlay for these metrics.
  if (metric.kind === "assessment" && data.length > 1) return null;
  const rows = data.map((d) => ({
    name: d.geography.label,
    points: educationPoints(d, metric.code, since).filter(
      (p) => p.value !== null && Number.isFinite(p.value),
    ),
  }));
  if (rows.some((r) => !r.points.length)) return null;
  const first = Math.max(
    ...rows.map((r) => Math.min(...r.points.map((p) => p.year))),
  );
  const last = Math.min(
    ...rows.map((r) => Math.max(...r.points.map((p) => p.year))),
  );
  if (
    first > last ||
    (rows.length > 1 &&
      !rows[0].points.some((p) =>
        rows[1].points.some((q) => q.year === p.year),
      ))
  )
    return null;
  const selected = rows.map((r) => ({
    ...r,
    points: r.points.filter((p) => p.year >= first && p.year <= last),
  }));
  const max = metric.boundedPercentage
    ? 100
    : Math.max(1, ...selected.flatMap((r) => r.points.map((p) => p.value!))) *
      1.08;
  return { first, last, max, rows: selected };
}
export function educationSegments(points: EducationPoint[], kind: string) {
  if (["survey", "assessment"].includes(kind)) return [];
  const segments: EducationPoint[][] = [];
  for (const point of points) {
    const segment = segments[segments.length - 1];
    const previous = segment?.[segment.length - 1];
    if (
      !previous ||
      previous.year + 1 !== point.year ||
      previous.magnitude !== point.magnitude ||
      previous.qualifier !== point.qualifier
    )
      segments.push([]);
    segments[segments.length - 1].push(point);
  }
  return segments.filter((s) => s.length > 1);
}
export function educationPointKind(p: EducationPoint, metric: EducationMetric) {
  const parts = [];
  if (metric.kind === "modelled") parts.push("UIS-Modellwert");
  if (p.magnitude === "NA") parts.push("Nicht anwendbar");
  if (p.magnitude === "SUPP") parts.push("Von der Quelle zurückgehalten");
  if (p.magnitude === "INCLUDED") parts.push("In einem anderen Wert enthalten");
  if (p.magnitude === "INCLUDES") parts.push("Enthält weitere Angaben");
  if (p.magnitude === "LOWREL")
    parts.push("Geringe Zuverlässigkeit laut Quelle");
  if (p.qualifier === "NAT_EST") parts.push("Nationale Schätzung");
  if (p.qualifier === "UIS_EST") parts.push("UIS-Schätzung");
  if (p.magnitude === "NIL") parts.push("Veröffentlichter Nullwert");
  if (p.value === null && !parts.length)
    parts.push("Ohne veröffentlichten Wert");
  return parts.join(" · ") || "Quellenstatistik ohne zusätzliches Kennzeichen";
}
