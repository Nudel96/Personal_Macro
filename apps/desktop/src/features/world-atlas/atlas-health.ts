import config from "./data/health-finance-catalog.json";
import type { AtlasGeography } from "./atlas-types";

export const atlasHealthCatalog = config;
export const atlasHealthDataset = config.datasetId;
export type HealthMetric = (typeof config.metrics)[number];
export const healthTopics: Record<string, { group: string; metric: string }> = {
  "health:healthcare_spending": { group: "volume", metric: "" },
  "health:healthcare_access": { group: "primary", metric: "" },
  "health:hospitals": { group: "care", metric: "hp1_usd_pc" },
  "health:medical_equipment": { group: "investment", metric: "hk112_usd_pc" },
  "health:pharmaceuticals": { group: "care", metric: "hcri1_usd_pc" },
  "health:elderly_care": { group: "care", metric: "hc3_usd_pc" },
  "health:health_insurance": { group: "schemes", metric: "" },
  "health:prevention": { group: "primary", metric: "hc62_che" },
};
export const healthUnits: Record<string, string> = {
  percent_gdp: "% der Wirtschaftsleistung",
  percent_gge: "% aller Staatsausgaben",
  percent_che: "% der laufenden Gesundheitsausgaben",
  percent_phc: "% der Ausgaben der Grundversorgung",
  current_usd_per_capita:
    "Laufende US-Dollar je Einwohner · nicht inflationsbereinigt",
};
export interface HealthPoint {
  year: number;
  values: Record<string, number | null>;
}
export interface HealthMetadata {
  field: string;
  longCode: string;
  label: string;
  sources: string | null;
  comments: string | null;
  dataType: string | null;
  methods: string | null;
  footnote: string | null;
}
export interface AtlasHealthResponse {
  geography: AtlasGeography;
  status:
    "available" | "not_downloaded" | "unsupported_area" | "desktop_required";
  profile: {
    geographyId: string;
    providerCode: string;
    providerLabel: string;
    points: HealthPoint[];
    metadata: HealthMetadata[];
    notes: {
      footnote: string | null;
      releaseNote: string | null;
      reportingCurrency: string | null;
    };
  } | null;
  provenance: {
    retrievedAt: string;
    url: string;
    sha256: string;
    notesSha256: string;
    release: string;
    recipe: string;
    sourceRowCount: number;
    numericCellCount: number;
    metadataRowCount: number;
    areaCount: number;
  } | null;
}
export function healthSelection(params: URLSearchParams, topicId: string) {
  const entry =
    healthTopics[topicId] ?? healthTopics["health:healthcare_spending"];
  const group = config.groups.some((g) => g.id === params.get("healthGroup"))
    ? params.get("healthGroup")!
    : entry.group;
  const raw = params.get("healthMetric");
  const metric =
    raw === "overview"
      ? ""
      : (config.metrics.find((m) => m.id === raw && m.group === group)?.id ??
        (raw === null && !params.has("healthGroup") ? entry.metric : ""));
  const since =
    [2000, 2010, 2015, 2020].find(
      (y) => String(y) === params.get("healthSince"),
    ) ?? 2000;
  return { group, metric, since };
}
export function validHealthResponse(r: AtlasHealthResponse) {
  return (
    r.status === "available" &&
    r.profile?.geographyId === r.geography.id &&
    config.areas.some(
      (a) =>
        a.geographyId === r.geography.id &&
        a.code === r.profile?.providerCode &&
        a.label === r.profile.providerLabel,
    ) &&
    r.provenance?.sha256 === config.files[0].sha256 &&
    r.provenance.notesSha256 === config.files[1].sha256 &&
    r.provenance.recipe === config.recipe &&
    r.provenance.url === config.sourceUrl
  );
}
export function healthValue(p: HealthPoint, m: HealthMetric) {
  const n = p.values[m.field];
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}
export function healthView(
  rows: AtlasHealthResponse[],
  metric: HealthMetric,
  since: number,
) {
  if (
    !rows.length ||
    rows.some(
      (r) =>
        !validHealthResponse(r) ||
        r.provenance?.retrievedAt !== rows[0].provenance?.retrievedAt,
    )
  )
    return null;
  const values = rows.map((r) =>
    r.profile!.points.filter(
      (p) =>
        p.year >= since &&
        p.year <= config.lastYear &&
        healthValue(p, metric) !== null,
    ),
  );
  if (values.some((p) => !p.length)) return null;
  const first = Math.max(
    ...values.map((p) => Math.min(...p.map((v) => v.year))),
  );
  const last = Math.min(
    ...values.map((p) => Math.max(...p.map((v) => v.year))),
  );
  if (last < first) return null;
  const series = rows.map((r, i) => ({
    id: r.geography.id,
    name: r.geography.label,
    points: values[i]
      .filter((p) => p.year >= first && p.year <= last)
      .map((p) => ({
        year: p.year,
        value: healthValue(p, metric)!,
        preliminary: p.year >= config.preliminarySince,
      })),
  }));
  const common = series[0].points
    .filter((p) => series.every((s) => s.points.some((q) => q.year === p.year)))
    .map((p) => p.year);
  if (!common.length) return null;
  const numbers = series.flatMap((s) => s.points.map((p) => p.value));
  return {
    first,
    last,
    series,
    lastCommonYear: Math.max(...common),
    min: Math.min(0, ...numbers),
    max: Math.max(1e-9, ...numbers),
  };
}
export type HealthView = NonNullable<ReturnType<typeof healthView>>;
export const healthCountryNote = (code: string) =>
  ({
    USA: "USA: Die Quelle weicht teils von SHA 2011 ab. Private Versicherungen werden ab 2014 überwiegend als verpflichtend erfasst; US-Außengebiete fehlen.",
    DEU: "Deutschland: Methodenbruch bei sozialer Krankenversicherung 2010; die Zuordnung privater Versicherungsleistungen nach Versorgungszweck ändert sich um 2015.",
    IND: "Indien: Haushaltsjahr April bis März, dem früheren Kalenderjahr zugeordnet. Die jüngste Ausgabe enthält WHO-Schätzungen für die Finanzierung.",
    CHN: "China: Die WHO nennt für diese Ausgabe Schätzungen nach ausgebliebener neuer Meldung. Das ist kein Kennzeichen für jeden einzelnen Wert.",
  })[code];
